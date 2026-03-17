import axios from "axios";
import { runtime } from "../type/runtime-api";
import client, { buildCacheKey, readCache } from "./client";

type BikaRequestPayload = {
  url: string;
  method?: string;
  body?: unknown;
  cache?: boolean;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type ComicDetailPayload = {
  comicId?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type BikaSearchPayload = {
  keyword?: string;
  page?: number;
  extern?: Record<string, unknown>;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type BikaChapterPayload = {
  comicId?: string;
  chapterId?: number | string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type BikaHomePayload = {
  extern?: Record<string, unknown>;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type BikaRankingPayload = {
  days?: string;
  type?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type BikaLoginPayload = {
  account?: string;
  password?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

function toStrList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? ""))
    .filter((item) => item.trim().length > 0);
}

function toNum(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}

function ensureBikaComicShape(comic: Record<string, any>) {
  const creator = (comic._creator ??= {});
  creator.slogan ??= "";
  creator.title ??= "";
  creator.verified ??= false;
  creator.avatar ??= {};
  creator.avatar.fileServer ??= "";
  creator.avatar.path ??= "";
  creator.avatar.originalName ??= "";

  comic.chineseTeam ??= "";
  comic.description ??= "";
  comic.totalComments ??= comic.commentsCount ?? 0;
  comic.author ??= "";
  comic.thumb ??= {};
  comic.thumb.fileServer ??= "";
  comic.thumb.path ??= "";
  comic.thumb.originalName ??= "";
}

async function getComicDetail(payload: ComicDetailPayload = {}) {
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  const requestBase = {
    imageQuality: payload.imageQuality,
    authorization: payload.authorization,
    settings: payload.settings,
  };

  const infoResponse = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comics/${comicId}`,
    method: "GET",
    ...requestBase,
  })) as Record<string, any>;

  const comic = (infoResponse?.data?.comic ?? {}) as Record<string, any>;
  ensureBikaComicShape(comic);

  const epsCount = toNum(comic.epsCount, 0);
  const totalPages = Math.max(1, Math.ceil(epsCount / 40 + 1));
  const epsResponses = await Promise.all(
    Array.from({ length: totalPages }, (_, index) =>
      bikaRequest({
        url: `https://picaapi.picacomic.com/comics/${comicId}/eps?page=${index + 1}`,
        method: "GET",
        cache: true,
        ...requestBase,
      }),
    ),
  );

  const epsDocs = epsResponses
    .flatMap((item: any) => item?.data?.eps?.docs ?? [])
    .sort((a: any, b: any) => toNum(a?.order) - toNum(b?.order));

  const recommendResponse = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comics/${comicId}/recommendation`,
    method: "GET",
    cache: true,
    ...requestBase,
  })) as Record<string, any>;

  const recommend = (recommendResponse?.data?.comics ?? []).map((item: any) => {
    const next = { ...item };
    next.author ??= "";
    next.likesCount = toNum(next.likesCount, 0);
    next.thumb ??= {};
    next.thumb.fileServer ??= "";
    next.thumb.path ??= "";
    next.thumb.originalName ??= "";
    return next;
  });

  const normal = {
    comicInfo: {
      id: String(comic._id ?? comicId),
      creator: {
        id: String(comic._creator?._id ?? ""),
        name: String(comic._creator?.name ?? ""),
        avatar: {
          url: String(comic._creator?.avatar?.fileServer ?? ""),
          path: String(comic._creator?.avatar?.path ?? ""),
          name: String(comic._creator?.avatar?.originalName ?? ""),
        },
      },
      title: String(comic.title ?? ""),
      description: String(comic.description ?? ""),
      cover: {
        url: String(comic.thumb?.fileServer ?? ""),
        path: String(comic.thumb?.path ?? ""),
        name: String(comic.thumb?.originalName ?? ""),
      },
      categories: toStrList(comic.categories),
      tags: toStrList(comic.tags),
      author: comic.author ? [String(comic.author)] : [],
      works: [],
      actors: [],
      chineseTeam: comic.chineseTeam ? [String(comic.chineseTeam)] : [],
      pagesCount: toNum(comic.pagesCount),
      epsCount: toNum(comic.epsCount),
      updated_at: String(comic.updated_at ?? new Date().toISOString()),
      allowComment: toBool(comic.allowComment, true),
      totalViews: toNum(comic.totalViews),
      totalLikes: toNum(comic.totalLikes),
      totalComments: toNum(comic.totalComments),
      isFavourite: toBool(comic.isFavourite),
      isLiked: toBool(comic.isLiked),
    },
    eps: epsDocs.map((item: any) => ({
      id: String(item?._id ?? ""),
      name: String(item?.title ?? ""),
      order: toNum(item?.order),
    })),
    recommend: recommend.map((item: any) => ({
      id: String(item?._id ?? ""),
      title: String(item?.title ?? ""),
      cover: {
        url: String(item?.thumb?.fileServer ?? ""),
        path: String(item?.thumb?.path ?? ""),
        name: String(item?.thumb?.originalName ?? ""),
      },
    })),
  };

  return {
    source: "bika",
    comicId,
    extern: payload.extern ?? null,
    normal,
    raw: {
      comicInfo: comic,
      eps: epsDocs,
      recommend,
    },
  };
}

function toSortKeyword(sortBy: unknown): string {
  const value = Number(sortBy);
  if (value === 2) return "da";
  if (value === 3) return "ld";
  if (value === 4) return "vd";
  return "dd";
}

function toStringMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

async function loadPluginSetting(key: string, fallback: unknown) {
  const raw = await runtime.pluginConfig.loadPluginConfig(
    key,
    JSON.stringify(fallback),
  );
  try {
    const decoded = JSON.parse(String(raw));
    if (decoded?.ok === true) {
      return decoded.value;
    }
  } catch (_) {
    // noop
  }
  return fallback;
}

async function getSettingsBundle() {
  const [proxy, imageQuality, authorization] = await Promise.all([
    loadPluginSetting("network.proxy", ""),
    loadPluginSetting("image.quality", ""),
    loadPluginSetting("auth.authorization", ""),
  ]);

  return {
    source: "bika",
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        {
          id: "network",
          title: "网络",
          fields: [
            { key: "network.proxy", kind: "text", label: "代理" },
            {
              key: "image.quality",
              kind: "select",
              label: "图片质量",
              options: ["low", "medium", "high", "original"],
            },
          ],
        },
      ],
    },
    data: {
      values: {
        "network.proxy": String(proxy ?? ""),
        "image.quality": String(imageQuality ?? ""),
        "auth.authorization": String(authorization ?? ""),
      },
    },
  };
}

function buildHomeAction(category: any) {
  const title = String(category?.title ?? "");
  if (title === "最近更新") {
    return {
      type: "openSearch",
      payload: {
        mode: "latest",
      },
    };
  }

  if (title === "随机本子") {
    return {
      type: "openSearch",
      payload: {
        mode: "random",
        url: "https://picaapi.picacomic.com/comics/random",
      },
    };
  }

  if (title === "大家都在看") {
    return {
      type: "openSearch",
      payload: {
        mode: "fixed",
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E5%A4%A7%E5%AE%B6%E9%83%BD%E5%9C%A8%E7%9C%8B&s=dd",
      },
    };
  }

  if (title === "大濕推薦") {
    return {
      type: "openSearch",
      payload: {
        mode: "fixed",
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E5%A4%A7%E6%BF%95%E6%8E%A8%E8%96%A6&s=dd",
      },
    };
  }

  if (title === "那年今天") {
    return {
      type: "openSearch",
      payload: {
        mode: "fixed",
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=dd",
      },
    };
  }

  if (title === "官方都在看") {
    return {
      type: "openSearch",
      payload: {
        mode: "fixed",
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=dd",
      },
    };
  }

  if (category?.isWeb) {
    return {
      type: "openWeb",
      payload: {
        title,
        url: String(category?.link ?? ""),
        appendAuthorizationQuery: title === "嗶咔畫廊",
      },
    };
  }

  return {
    type: "openSearch",
    payload: {
      mode: "category",
      categoryTitle: title,
    },
  };
}

function boolKeyList(value: unknown): string[] {
  const map = toStringMap(value);
  return Object.entries(map)
    .filter(([, checked]) => Boolean(checked))
    .map(([key]) => key);
}

async function searchComic(payload: BikaSearchPayload = {}) {
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, toNum(payload.page, 1));
  const sort = String(extern.sort ?? toSortKeyword(extern.sortBy)).trim() || "dd";
  const keyword = String(payload.keyword ?? extern.keyword ?? "").trim();
  const categories = boolKeyList(extern.categories);
  const overrideUrl = String(extern.url ?? "").trim();

  const requestBase = {
    imageQuality: payload.imageQuality,
    authorization: payload.authorization,
    settings: payload.settings,
  };

  let response: Record<string, any>;
  if (overrideUrl) {
    if (overrideUrl.includes("comics?ca=")) {
      const prefix = overrideUrl.split("&s")[0];
      response = await bikaRequest({
        url: `${prefix}&s=${sort}&page=${page}`,
        method: "GET",
        ...requestBase,
      });
    } else if (overrideUrl.includes("%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9")) {
      response = await bikaRequest({
        url: `https://picaapi.picacomic.com/comics?page=${page}&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=${sort}`,
        method: "GET",
        ...requestBase,
      });
    } else if (overrideUrl.includes("%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B")) {
      response = await bikaRequest({
        url: `https://picaapi.picacomic.com/comics?page=${page}&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=${sort}`,
        method: "GET",
        ...requestBase,
      });
    } else {
      response = await bikaRequest({
        url: overrideUrl,
        method: "GET",
        ...requestBase,
      });
    }
  } else {
    response = await bikaRequest({
      url: `https://picaapi.picacomic.com/comics/advanced-search?page=${page}`,
      method: "POST",
      body: {
        sort,
        keyword,
        categories,
      },
      ...requestBase,
    });
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

  const scheme = {
    version: "1.0.0",
    type: "searchResult",
    source: "bika",
    list: "comicGrid",
  };

  const data = {
    paging: {
      page: toNum(comics.page, page),
      pages: toNum(comics.pages, page),
      total: toNum(comics.total, normalizedDocs.length),
      hasReachedMax: toNum(comics.page, page) >= toNum(comics.pages, page),
    },
    items: normalizedDocs.map((doc: any) => ({
      id: String(doc._id ?? doc.id ?? ""),
      title: String(doc.title ?? ""),
      raw: doc,
    })),
  };

  return {
    source: "bika",
    extern: payload.extern ?? null,
    scheme,
    data,
    paging: data.paging,
    items: data.items,
  };
}

async function getHomeData(payload: BikaHomePayload = {}) {
  const requestBase = {
    imageQuality: payload.imageQuality,
    authorization: payload.authorization,
    settings: payload.settings,
  };

  const [categoriesResponse, keywordsResponse] = await Promise.all([
    bikaRequest({
      url: "https://picaapi.picacomic.com/categories",
      method: "GET",
      cache: true,
      ...requestBase,
    }),
    bikaRequest({
      url: "https://picaapi.picacomic.com/keywords",
      method: "GET",
      cache: true,
      ...requestBase,
    }),
  ]);

  const categories = Array.isArray(categoriesResponse?.data?.categories)
    ? categoriesResponse.data.categories
    : [];
  const keywords = Array.isArray(keywordsResponse?.data?.keywords)
    ? keywordsResponse.data.keywords.map((item: unknown) => String(item ?? ""))
    : [];

  const categoryWithActions = categories.map((item: any) => {
    const next = { ...item };
    next.action = buildHomeAction(item);
    return next;
  });

  return {
    source: "bika",
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "homeFeed",
      sections: ["keywords", "categories"],
    },
    data: {
      keywords,
      categories: categoryWithActions,
    },
  };
}

async function getLoginBundle() {
  return {
    source: "bika",
    scheme: {
      version: "1.0.0",
      type: "login",
      title: "哔咔登录",
      fields: [
        { key: "account", kind: "text", label: "账号" },
        { key: "password", kind: "password", label: "密码" },
      ],
      action: {
        fnPath: "loginWithPassword",
        submitText: "登录",
      },
    },
    data: {
      account: String(await loadPluginSetting("auth.account", "")),
      password: String(await loadPluginSetting("auth.password", "")),
    },
  };
}

async function loginWithPassword(payload: BikaLoginPayload = {}) {
  const account = String(payload.account ?? "").trim();
  const password = String(payload.password ?? "");
  if (!account || !password) {
    throw new Error("账号或密码不能为空");
  }

  const requestBase = {
    imageQuality: payload.imageQuality,
    authorization: payload.authorization,
    settings: payload.settings,
  };

  const result = await bikaRequest({
    url: "https://picaapi.picacomic.com/auth/sign-in",
    method: "POST",
    body: JSON.stringify({ email: account, password }),
    ...requestBase,
  });

  const token = String((result as any)?.data?.token ?? "");

  return {
    source: "bika",
    data: {
      account,
      password,
      token,
    },
    raw: result,
  };
}

async function getCapabilitiesBundle() {
  return {
    source: "bika",
    scheme: {
      version: "1.0.0",
      type: "advancedActions",
      actions: [
        {
          key: "clear_cache",
          title: "清理插件会话",
          fnPath: "clearPluginSession",
        },
        {
          key: "dump_runtime_info",
          title: "查看运行时信息",
          fnPath: "dumpRuntimeInfo",
        },
      ],
    },
    data: {
      actions: ["clear_cache", "dump_runtime_info"],
    },
  };
}

async function clearPluginSession() {
  await Promise.all([
    runtime.pluginConfig.savePluginConfig("auth.account", JSON.stringify("")),
    runtime.pluginConfig.savePluginConfig("auth.password", JSON.stringify("")),
    runtime.pluginConfig.savePluginConfig(
      "auth.authorization",
      JSON.stringify(""),
    ),
  ]);

  return {
    ok: true,
    message: "bika 插件会话已清理",
  };
}

async function dumpRuntimeInfo() {
  return {
    ok: true,
    data: {
      pluginName: "bikaComic",
      hasCacheApi: !!runtime.cache,
      hasPluginConfigApi: !!runtime.pluginConfig,
      now: new Date().toISOString(),
    },
  };
}

async function getRankingData(payload: BikaRankingPayload = {}) {
  const days = String(payload.days ?? "H24");
  const type = String(payload.type ?? "comic");
  let url = "";

  if (type === "creator") {
    url = "https://picaapi.picacomic.com/comics/knight-leaderboard";
  } else {
    url = `https://picaapi.picacomic.com/comics/leaderboard?tt=${days}&ct=VC`;
  }

  const requestBase = {
    imageQuality: payload.imageQuality,
    authorization: payload.authorization,
    settings: payload.settings,
  };

  const raw = await bikaRequest({
    url,
    method: "GET",
    cache: true,
    ...requestBase,
  });

  return {
    source: "bika",
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "rankingFeed",
      card: type === "creator" ? "creator" : "comic",
    },
    data: {
      days,
      rankingType: type,
      raw,
    },
  };
}

async function getChapter(payload: BikaChapterPayload = {}) {
  const comicId = String(payload.comicId ?? "").trim();
  const chapterId = toNum(payload.chapterId, 0);
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  if (!chapterId) {
    throw new Error("chapterId 不能为空");
  }

  const requestBase = {
    imageQuality: payload.imageQuality,
    authorization: payload.authorization,
    settings: payload.settings,
  };

  const docs: any[] = [];
  let page = 1;
  let totalPages = 1;
  let epId = "";
  let epName = "";

  while (page <= totalPages) {
    const result = (await bikaRequest({
      url: `https://picaapi.picacomic.com/comics/${comicId}/order/${chapterId}/pages?page=${page}`,
      method: "GET",
      cache: true,
      ...requestBase,
    })) as Record<string, any>;
    const data = result?.data ?? {};
    const pages = data?.pages ?? {};
    const ep = data?.ep ?? {};

    epId = String(ep.id ?? ep._id ?? epId);
    epName = String(ep.title ?? epName);
    totalPages = toNum(pages.pages, 1);

    const pageDocs = Array.isArray(pages.docs) ? pages.docs : [];
    for (const doc of pageDocs) {
      docs.push({
        originalName: String(doc?.media?.originalName ?? ""),
        path: String(doc?.media?.path ?? ""),
        fileServer: String(doc?.media?.fileServer ?? ""),
        id: String(doc?.id ?? ""),
      });
    }

    page += 1;
  }

  return {
    source: "bika",
    comicId,
    chapterId,
    extern: payload.extern ?? null,
    chapter: {
      epId,
      epName,
      length: docs.length,
      epPages: String(docs.length),
      docs,
    },
  };
}

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
}

async function bikaRequest(payload: BikaRequestPayload = { url: "" }) {
  const method = toUpperMethod(payload.method);
  const useCache = Boolean(payload.cache && method === "GET");
  const cacheKey = buildCacheKey(payload, method);

  if (useCache) {
    const cachedData = readCache(cacheKey);
    if (cachedData !== undefined) {
      return cachedData;
    }
  }

  const requestConfig: any = {
    url: payload.url,
    method,
    __bikaPayload: payload,
    __useCache: useCache,
    __cacheKey: cacheKey,
  };

  if (method !== "GET" && method !== "HEAD") {
    const requestBody = payload.body == null ? {} : payload.body;
    requestConfig.data = requestBody;
    requestConfig.body =
      typeof requestBody === "string"
        ? requestBody
        : JSON.stringify(requestBody);
  }

  const response = await client.request(requestConfig);
  return response.data;
}

async function fetchImageBytes({ url = "", timeoutMs = 30000 } = {}) {
  const targetUrl = url.trim();
  if (!targetUrl) throw new Error("url 不能为空");

  const { host } = new URL(targetUrl);

  const response = await axios.get(targetUrl, {
    headers: { Host: host },
    timeout: Math.max(0, timeoutMs) || 30000,
    responseType: "arraybuffer",
  });

  const nativeBufferId = await runtime.native.put(
    new Uint8Array(response.data),
  );

  return { nativeBufferId: Number(nativeBufferId) };
}

export default {
  bikaRequest,
  getComicDetail,
  getSettingsBundle,
  getLoginBundle,
  loginWithPassword,
  getCapabilitiesBundle,
  clearPluginSession,
  dumpRuntimeInfo,
  getHomeData,
  getRankingData,
  searchComic,
  getChapter,
  fetchImageBytes,
};
