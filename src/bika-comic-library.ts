import type {
  FunctionPageContract,
  ListFavoriteFoldersResult,
  SearchResultContract,
  StringMap,
  ToggleFavoriteResult,
  ToggleLikeResult,
} from "breeze-plugin-kit";
import {
  boolKeyList,
  buildHomeAction,
  getRuntimeSelectedCategories,
  loadBlockedCategories,
  saveBlockedCategories,
  setRuntimeSelectedCategories,
  toActionItem,
  toBoolMap,
  toComicListItem,
  toHomeChip,
  toSortKeyword,
} from "./bika-comic-shared";
import { buildBikaImageUrl } from "./bika-image";
import { bikaRequest } from "./bika-request";
import type {
  BikaFavoriteFolderPayload,
  BikaFavoritePayload,
  BikaHomePayload,
  BikaLikePayload,
  BikaSearchPayload,
  BikaToggleFavoritePayload,
} from "./bika-types";
import { resolveSceneFnPath, toNum, toStrList, toStringMap } from "./bika-utils";
import { getApiBase } from "./client";
import { BIKA_PLUGIN_ID } from "./info";
import { loadPluginSetting } from "./plugin-config";

export async function searchComic(payload: BikaSearchPayload = {}): Promise<SearchResultContract> {
  const apiBase = await getApiBase();
  console.log(payload);
  const payloadMap = toStringMap(payload);
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, toNum(payload.page, 1));
  const sort =
    String(
      extern.sort ?? payloadMap.sort ?? toSortKeyword(extern.sortBy ?? payloadMap.sortBy),
    ).trim() || "dd";
  const keyword = String(payload.keyword ?? extern.keyword ?? "").trim();
  const mode = String(extern.mode ?? payloadMap.mode ?? "").trim();
  const creatorId = String(extern.creatorId ?? payloadMap.creatorId ?? "").trim();
  const categories = boolKeyList(extern.categories ?? payloadMap.categories);
  if (categories.length) {
    setRuntimeSelectedCategories(categories);
  }
  const blockedCategories = boolKeyList(extern.blockedCategories ?? payloadMap.blockedCategories);
  if (blockedCategories.length || extern.blockedCategories || payloadMap.blockedCategories) {
    await saveBlockedCategories(blockedCategories);
  }
  const overrideUrl = String(extern.url ?? payloadMap.url ?? "").trim();

  let response: Record<string, unknown>;
  if (mode === "creator" && creatorId) {
    response = (await bikaRequest({
      url: `${apiBase}comics?ca=${creatorId}&s=${sort}&page=${page}`,
      method: "GET",
    })) as Record<string, unknown>;
  } else if (overrideUrl) {
    if (overrideUrl.includes("comics?ca=")) {
      const prefix = overrideUrl.split("&s")[0];
      response = (await bikaRequest({
        url: `${prefix}&s=${sort}&page=${page}`,
        method: "GET",
      })) as Record<string, unknown>;
    } else if (overrideUrl.includes("%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9")) {
      response = (await bikaRequest({
        url: `${apiBase}comics?page=${page}&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=${sort}`,
        method: "GET",
      })) as Record<string, unknown>;
    } else if (overrideUrl.includes("%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B")) {
      response = (await bikaRequest({
        url: `${apiBase}comics?page=${page}&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=${sort}`,
        method: "GET",
      })) as Record<string, unknown>;
    } else {
      response = (await bikaRequest({
        url: overrideUrl,
        method: "GET",
      })) as Record<string, unknown>;
    }
  } else {
    response = (await bikaRequest({
      url: `${apiBase}comics/advanced-search?page=${page}`,
      method: "POST",
      body: {
        sort,
        keyword,
        categories,
      },
    })) as Record<string, unknown>;
  }

  const responseMap = toStringMap(response);
  const responseData = toStringMap(responseMap.data);
  const comicsPayload = responseData.comics;
  const comics: StringMap = Array.isArray(comicsPayload)
    ? {
        docs: comicsPayload,
        page,
        pages: page,
      }
    : toStringMap(comicsPayload);
  const rawDocs = Array.isArray(comics.docs) ? comics.docs : [];
  const docs: StringMap[] = rawDocs.filter(
    (item): item is StringMap => !!item && typeof item === "object" && !Array.isArray(item),
  );
  const normalizedDocs = docs.map((doc: StringMap) => {
    const next: StringMap = { ...doc };
    next.id ??= next._id;
    next.updated_at ??= "1970-01-01T00:00:00.000Z";
    next.created_at ??= "1970-01-01T00:00:00.000Z";
    next.description ??= "";
    next.chineseTeam ??= "";
    next.tags ??= [];
    next.author ??= "";
    const thumb = toStringMap(next.thumb);
    thumb.originalName ??= "";
    thumb.path ??= "";
    thumb.fileServer ??= "";
    next.thumb = thumb;
    next.likesCount = toNum(next.likesCount, 0);
    next.totalLikes = toNum(next.totalLikes, 0);
    return next;
  });

  const blockedSet = new Set(
    blockedCategories.length ? blockedCategories : await loadBlockedCategories(),
  );
  const filteredDocs = normalizedDocs.filter((doc: StringMap) => {
    const docCategories = toStrList(doc.categories);
    return !docCategories.some((item: string) => blockedSet.has(item));
  });

  const scheme = {
    version: "1.0.0" as const,
    type: "searchResult" as const,
    source: BIKA_PLUGIN_ID,
    list: "comicGrid",
  };

  const items = await Promise.all(
    filteredDocs.map(async (doc: StringMap) => await toComicListItem(doc)),
  );

  const data = {
    paging: {
      page: toNum(comics.page, page),
      pages: toNum(comics.pages, page),
      total: toNum(comics.total, filteredDocs.length),
      hasReachedMax: toNum(comics.page, page) >= toNum(comics.pages, page),
    },
    items,
  };

  return {
    source: BIKA_PLUGIN_ID,
    extern: {
      ...extern,
      ...(overrideUrl ? { url: overrideUrl } : {}),
      ...(mode ? { mode } : {}),
      ...(creatorId ? { creatorId } : {}),
      sortBy: toNum(extern.sortBy ?? payloadMap.sortBy, 1),
      categories: toBoolMap(categories.length ? categories : getRuntimeSelectedCategories()),
      blockedCategories: toBoolMap(
        blockedCategories.length ? blockedCategories : await loadBlockedCategories(),
      ),
    },
    scheme,
    data,
    paging: data.paging,
    items: data.items,
  };
}

export async function getHomeData(_payload: BikaHomePayload = {}): Promise<FunctionPageContract> {
  const apiBase = await getApiBase();
  const [categoriesResponse, keywordsResponse] = await Promise.all([
    bikaRequest({
      url: `${apiBase}categories`,
      method: "GET",
      cache: true,
    }),
    bikaRequest({
      url: `${apiBase}keywords`,
      method: "GET",
      cache: true,
    }),
  ]);

  const categoriesData = toStringMap(toStringMap(categoriesResponse).data);
  const categoriesRaw = Array.isArray(categoriesData.categories) ? categoriesData.categories : [];
  const categories: StringMap[] = categoriesRaw.filter(
    (item): item is StringMap => !!item && typeof item === "object" && !Array.isArray(item),
  );
  const authorization = String(await loadPluginSetting("auth.authorization", ""));
  const keywordsData = toStringMap(toStringMap(keywordsResponse).data);
  const keywordItems = Array.isArray(keywordsData.keywords)
    ? keywordsData.keywords.map((item: unknown) => toHomeChip(item))
    : [];

  const categoryNavItems = await Promise.all(
    categories.map(async (item: StringMap) => {
      const thumb = toStringMap(item.thumb);
      return toActionItem({
        title: String(item.title ?? ""),
        coverUrl: await buildBikaImageUrl(thumb.fileServer, thumb.path, "else"),
        coverPath: String(thumb.path ?? ""),
        action: await buildHomeAction(item, authorization),
      });
    }),
  );

  const navItems = [
    toActionItem({
      title: "最近更新",
      action: await buildHomeAction({ title: "最近更新" } as StringMap, authorization),
    }),
    toActionItem({
      title: "随机本子",
      action: await buildHomeAction({ title: "随机本子" } as StringMap, authorization),
    }),
    ...categoryNavItems,
  ];

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0" as const,
      type: "page" as const,
      title: "哔咔漫画",
      body: {
        type: "list" as const,
        children: [
          { type: "chip-list" as const, key: "keywords" },
          { type: "action-grid" as const, key: "navItems" },
        ],
      },
    },
    data: {
      keywords: keywordItems,
      navItems,
      hasReachedMax: true,
    },
  };
}

export async function getFavoriteData(
  payload: BikaFavoritePayload = {},
): Promise<SearchResultContract> {
  const apiBase = await getApiBase();
  const page = Math.max(1, toNum(payload.page, 1));
  const extern = toStringMap(payload.extern);
  const sort = String(extern.sort ?? extern.order ?? "dd").trim() || "dd";

  const raw = await bikaRequest({
    url: `${apiBase}users/favourite?s=${sort}&page=${page}`,
    method: "GET",
  });

  const favData = toStringMap(toStringMap(raw).data);
  const comics: StringMap = toStringMap(favData.comics);
  const favDocs: StringMap[] = (Array.isArray(comics.docs) ? comics.docs : []).filter(
    (item): item is StringMap => !!item && typeof item === "object" && !Array.isArray(item),
  );
  const currentPage = toNum(comics.page, page);
  const pages = toNum(comics.pages, currentPage);
  const items = await Promise.all(
    favDocs.map(
      async (item: StringMap) =>
        await toComicListItem(item, {
          pictureType: "favourite",
        }),
    ),
  );

  return {
    source: BIKA_PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0" as const,
      type: "searchResult" as const,
      source: BIKA_PLUGIN_ID,
      list: "comicGrid",
    },
    data: {
      paging: {
        page: currentPage,
        pages,
        total: toNum(comics.total, favDocs.length),
        hasReachedMax: currentPage >= pages,
      },
      items,
    },
    paging: {
      page: currentPage,
      pages,
      total: toNum(comics.total, favDocs.length),
      hasReachedMax: currentPage >= pages,
    },
    items,
  };
}

export async function toggleLike(payload: BikaLikePayload = {}): Promise<ToggleLikeResult> {
  const apiBase = await getApiBase();
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  await bikaRequest({
    url: `${apiBase}comics/${comicId}/like`,
    method: "POST",
  });

  const currentLiked = Boolean(payload.currentLiked);
  return {
    liked: !currentLiked,
  };
}

export async function toggleFavorite(
  payload: BikaToggleFavoritePayload = {},
): Promise<ToggleFavoriteResult> {
  const apiBase = await getApiBase();
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  await bikaRequest({
    url: `${apiBase}comics/${comicId}/favourite`,
    method: "POST",
  });

  return {
    favorited: !payload.currentFavorite,
    nextStep: "none" as const,
  };
}

export async function listFavoriteFolders(
  _payload: BikaFavoriteFolderPayload = {},
): Promise<ListFavoriteFoldersResult> {
  return {
    items: [],
  };
}

export async function moveFavoriteToFolder(_payload: BikaFavoriteFolderPayload = {}) {
  return {
    ok: true,
  };
}

export async function getFunctionPage(
  payload: Record<string, unknown> = {},
): Promise<FunctionPageContract> {
  const id = String(
    payload.id ?? toStringMap(payload.core).id ?? toStringMap(payload.extern).id,
  ).trim();

  if (id === "hotSearch") {
    const home = await getHomeData(payload as BikaHomePayload);
    const data = toStringMap(home.data);
    const items = Array.isArray(data.keywords) ? data.keywords : [];
    return {
      source: BIKA_PLUGIN_ID,
      scheme: {
        version: "1.0.0",
        type: "page",
        title: "热搜",
        body: {
          type: "list" as const,
          children: [{ type: "chip-list" as const, key: "items" }],
        },
      },
      data: {
        items,
        hasReachedMax: true,
      },
    };
  }

  if (id === "navigation") {
    const home = await getHomeData(payload as BikaHomePayload);
    const data = toStringMap(home.data);
    const blocked = new Set(toStrList(await loadPluginSetting("home.blockedCategories", [])));
    const items = (Array.isArray(data.navItems) ? data.navItems : []).filter((item: StringMap) => {
      const title = String(item?.title ?? "").trim();
      if (blocked.has(title)) {
        return false;
      }

      const action = toStringMap(item?.action);
      if (String(action.type ?? "") !== "openComicList") {
        return true;
      }

      const payload = toStringMap(action.payload);
      const fnPath = resolveSceneFnPath(payload.scene);
      return !!fnPath;
    });
    return {
      source: BIKA_PLUGIN_ID,
      scheme: {
        version: "1.0.0",
        type: "page",
        title: "导航",
        body: {
          type: "list" as const,
          children: [{ type: "action-grid" as const, key: "items" }],
        },
      },
      data: {
        items,
        hasReachedMax: true,
      },
    };
  }

  throw new Error(`未知功能: ${id}`);
}
