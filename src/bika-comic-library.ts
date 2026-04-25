import { BIKA_PLUGIN_ID } from "./info";
import { API_BASE } from "./client";
import type {
  BikaFavoriteFolderPayload,
  BikaFavoritePayload,
  BikaHomePayload,
  BikaLikePayload,
  BikaSearchPayload,
  BikaToggleFavoritePayload,
} from "./bika-types";
import type { ComicHandlerDeps, ComicHelpers } from "./bika-comic-shared";
import {
  resolveSceneFnPath,
  toNum,
  toStrList,
  toStringMap,
} from "./bika-utils";

type ComicLibraryHandlersDeps = {
  deps: ComicHandlerDeps;
  helpers: ComicHelpers;
};

export function createComicLibraryHandlers({
  deps,
  helpers,
}: ComicLibraryHandlersDeps) {
  const { bikaRequest, buildBikaImageUrl, loadPluginSetting } = deps;
  const {
    toSortKeyword,
    boolKeyList,
    saveBlockedCategories,
    loadBlockedCategories,
    toComicListItem,
    toBoolMap,
    toHomeChip,
    toActionItem,
    buildHomeAction,
    setRuntimeSelectedCategories,
    getRuntimeSelectedCategories,
  } = helpers;
  async function searchComic(payload: BikaSearchPayload = {}) {
    console.log(payload);
    const payloadMap = toStringMap(payload);
    const extern = toStringMap(payload.extern);
    const page = Math.max(1, toNum(payload.page, 1));
    const sort =
      String(
        extern.sort ??
          payloadMap.sort ??
          toSortKeyword(extern.sortBy ?? payloadMap.sortBy),
      ).trim() || "dd";
    const keyword = String(payload.keyword ?? extern.keyword ?? "").trim();
    const mode = String(extern.mode ?? payloadMap.mode ?? "").trim();
    const creatorId = String(
      extern.creatorId ?? payloadMap.creatorId ?? "",
    ).trim();
    const categories = boolKeyList(extern.categories ?? payloadMap.categories);
    if (categories.length) {
      setRuntimeSelectedCategories(categories);
    }
    const blockedCategories = boolKeyList(
      extern.blockedCategories ?? payloadMap.blockedCategories,
    );
    if (
      blockedCategories.length ||
      extern.blockedCategories ||
      payloadMap.blockedCategories
    ) {
      await saveBlockedCategories(blockedCategories);
    }
    const overrideUrl = String(extern.url ?? payloadMap.url ?? "").trim();

    let response: Record<string, any>;
    if (mode === "creator" && creatorId) {
      response = (await bikaRequest({
        url: `${API_BASE}comics?ca=${creatorId}&s=${sort}&page=${page}`,
        method: "GET",
      })) as Record<string, any>;
    } else if (overrideUrl) {
      if (overrideUrl.includes("comics?ca=")) {
        const prefix = overrideUrl.split("&s")[0];
        response = (await bikaRequest({
          url: `${prefix}&s=${sort}&page=${page}`,
          method: "GET",
        })) as Record<string, any>;
      } else if (overrideUrl.includes("%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9")) {
        response = (await bikaRequest({
          url: `${API_BASE}comics?page=${page}&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=${sort}`,
          method: "GET",
        })) as Record<string, any>;
      } else if (
        overrideUrl.includes("%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B")
      ) {
        response = (await bikaRequest({
          url: `${API_BASE}comics?page=${page}&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=${sort}`,
          method: "GET",
        })) as Record<string, any>;
      } else {
        response = (await bikaRequest({
          url: overrideUrl,
          method: "GET",
        })) as Record<string, any>;
      }
    } else {
      response = (await bikaRequest({
        url: `${API_BASE}comics/advanced-search?page=${page}`,
        method: "POST",
        body: {
          sort,
          keyword,
          categories,
        },
      })) as Record<string, any>;
    }

    const comicsPayload = response?.data?.comics;
    const comics = Array.isArray(comicsPayload)
      ? {
          docs: comicsPayload,
          page,
          pages: page,
        }
      : (comicsPayload ?? {});
    const docs = Array.isArray(comics.docs) ? comics.docs : [];
    const normalizedDocs = docs.map((doc: any) => {
      const next = { ...doc };
      next.id ??= next._id;
      next.updated_at ??= "1970-01-01T00:00:00.000Z";
      next.created_at ??= "1970-01-01T00:00:00.000Z";
      next.description ??= "";
      next.chineseTeam ??= "";
      next.tags ??= [];
      next.author ??= "";
      next.thumb ??= {};
      next.thumb.originalName ??= "";
      next.thumb.path ??= "";
      next.thumb.fileServer ??= "";
      next.likesCount = toNum(next.likesCount, 0);
      next.totalLikes = toNum(next.totalLikes, 0);
      return next;
    });

    const blockedSet = new Set(
      blockedCategories.length
        ? blockedCategories
        : await loadBlockedCategories(),
    );
    const filteredDocs = normalizedDocs.filter((doc: any) => {
      const docCategories = toStrList(doc.categories);
      return !docCategories.some((item) => blockedSet.has(item));
    });

    const scheme = {
      version: "1.0.0",
      type: "searchResult",
      source: BIKA_PLUGIN_ID,
      list: "comicGrid",
    };

    const items = await Promise.all(
      filteredDocs.map(async (doc: any) => await toComicListItem(doc)),
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
        categories: toBoolMap(
          categories.length ? categories : getRuntimeSelectedCategories(),
        ),
        blockedCategories: toBoolMap(
          blockedCategories.length
            ? blockedCategories
            : await loadBlockedCategories(),
        ),
      },
      scheme,
      data,
      paging: data.paging,
      items: data.items,
    };
  }

  async function getHomeData(payload: BikaHomePayload = {}) {
    const [categoriesResponse, keywordsResponse] = await Promise.all([
      bikaRequest({
        url: `${API_BASE}categories`,
        method: "GET",
        cache: true,
      }),
      bikaRequest({
        url: `${API_BASE}keywords`,
        method: "GET",
        cache: true,
      }),
    ]);

    const categories = Array.isArray(
      (categoriesResponse as any)?.data?.categories,
    )
      ? (categoriesResponse as any).data.categories
      : [];
    const authorization = String(
      await loadPluginSetting("auth.authorization", ""),
    );
    const keywordItems = Array.isArray(
      (keywordsResponse as any)?.data?.keywords,
    )
      ? (keywordsResponse as any).data.keywords.map((item: unknown) =>
          toHomeChip(item),
        )
      : [];

    const categoryNavItems = await Promise.all(
      categories.map(async (item: any) =>
        toActionItem({
          title: String(item?.title ?? ""),
          coverUrl: await buildBikaImageUrl(
            item?.thumb?.fileServer,
            item?.thumb?.path,
            "else",
          ),
          coverPath: String(item?.thumb?.path ?? ""),
          action: buildHomeAction(item, authorization),
        }),
      ),
    );

    const navItems = [
      toActionItem({
        title: "最近更新",
        action: buildHomeAction({ title: "最近更新" }, authorization),
      }),
      toActionItem({
        title: "随机本子",
        action: buildHomeAction({ title: "随机本子" }, authorization),
      }),
      ...categoryNavItems,
    ];

    return {
      source: BIKA_PLUGIN_ID,
      extern: payload.extern ?? null,
      scheme: {
        version: "1.0.0",
        type: "page",
        title: "哔咔漫画",
        body: {
          type: "list",
          direction: "vertical",
          children: [
            {
              type: "chip-list",
              key: "keywords",
            },
            {
              type: "action-grid",
              key: "navItems",
            },
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

  async function getFavoriteData(payload: BikaFavoritePayload = {}) {
    const page = Math.max(1, toNum(payload.page, 1));
    const extern = toStringMap(payload.extern);
    const sort = String(extern.sort ?? extern.order ?? "dd").trim() || "dd";

    const raw = await bikaRequest({
      url: `${API_BASE}users/favourite?s=${sort}&page=${page}`,
      method: "GET",
    });

    const comics = (raw as any)?.data?.comics ?? {};
    const docs = Array.isArray(comics.docs) ? comics.docs : [];
    const currentPage = toNum(comics.page, page);
    const pages = toNum(comics.pages, currentPage);
    const items = await Promise.all(
      docs.map(
        async (item: any) =>
          await toComicListItem(item, {
            pictureType: "favourite",
          }),
      ),
    );

    return {
      source: BIKA_PLUGIN_ID,
      extern: payload.extern ?? null,
      scheme: {
        version: "1.0.0",
        type: "favoriteFeed",
        card: "comic",
      },
      data: {
        paging: {
          page: currentPage,
          pages,
          total: toNum(comics.total, docs.length),
          hasReachedMax: currentPage >= pages,
        },
        items,
        raw,
      },
    };
  }

  async function toggleLike(payload: BikaLikePayload = {}) {
    const comicId = String(payload.comicId ?? "").trim();
    if (!comicId) {
      throw new Error("comicId 不能为空");
    }

    await bikaRequest({
      url: `${API_BASE}comics/${comicId}/like`,
      method: "POST",
    });

    const currentLiked = Boolean(payload.currentLiked);
    return {
      liked: !currentLiked,
    };
  }

  async function toggleFavorite(payload: BikaToggleFavoritePayload = {}) {
    const comicId = String(payload.comicId ?? "").trim();
    if (!comicId) {
      throw new Error("comicId 不能为空");
    }

    await bikaRequest({
      url: `${API_BASE}comics/${comicId}/favourite`,
      method: "POST",
    });

    return {
      favorited: !Boolean(payload.currentFavorite),
      nextStep: "none",
    };
  }

  async function listFavoriteFolders(_: BikaFavoriteFolderPayload = {}) {
    return {
      items: [],
    };
  }

  async function moveFavoriteToFolder(_: BikaFavoriteFolderPayload = {}) {
    return {
      ok: true,
    };
  }

  async function getFunctionPage(payload: Record<string, unknown> = {}) {
    const id = String(
      payload.id ??
        toStringMap(payload.core).id ??
        toStringMap(payload.extern).id,
    ).trim();

    if (id === "hotSearch") {
      const home = await getHomeData(payload as BikaHomePayload);
      const data = toStringMap((home as any).data);
      const items = Array.isArray(data.keywords) ? data.keywords : [];
      return {
        source: BIKA_PLUGIN_ID,
        scheme: {
          version: "1.0.0",
          type: "page",
          title: "热搜",
          body: {
            type: "list",
            direction: "vertical",
            children: [{ type: "chip-list", key: "items" }],
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
      const data = toStringMap((home as any).data);
      const blocked = new Set(
        toStrList(await loadPluginSetting("home.blockedCategories", [])),
      );
      const items = (Array.isArray(data.navItems) ? data.navItems : []).filter(
        (item: any) => {
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
        },
      );
      return {
        source: BIKA_PLUGIN_ID,
        scheme: {
          version: "1.0.0",
          type: "page",
          title: "导航",
          body: {
            type: "list",
            direction: "vertical",
            children: [{ type: "action-grid", key: "items" }],
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

  return {
    searchComic,
    getHomeData,
    getFavoriteData,
    toggleLike,
    toggleFavorite,
    listFavoriteFolders,
    moveFavoriteToFolder,
    getFunctionPage,
  };
}
