import axios from "axios";
import { runtime } from "../type/runtime-api";
import client, {
  buildCacheKey,
  readCache,
  setUnauthorizedSchemeProvider,
} from "./client";
import {
  BIKA_PLUGIN_ID,
  buildCloudFavoriteScene,
  buildManifestInfo,
  buildRankingScene,
} from "./info";

export { BIKA_PLUGIN_ID } from "./info";

type BikaRequestPayload = {
  url: string;
  method?: string;
  body?: unknown;
  cache?: boolean;
  imageQuality?: string;
};

type ComicDetailPayload = {
  comicId?: string;
  extern?: Record<string, unknown>;
};

type BikaSearchPayload = {
  keyword?: string;
  page?: number;
  extern?: Record<string, unknown>;
};

type BikaChapterPayload = {
  comicId?: string;
  chapterId?: number | string;
  extern?: Record<string, unknown>;
};

type BikaReadSnapshotPayload = {
  comicId?: string;
  chapterId?: number | string;
  extern?: Record<string, unknown>;
};

type BikaHomePayload = {
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

type BikaRankingPayload = {
  days?: string;
  type?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

type RankingFilterOption = {
  label: string;
  value: string;
  result: Record<string, unknown>;
};

type BikaLoginPayload = {
  account?: string;
  password?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

type BikaFavoritePayload = {
  page?: number;
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

type BikaLikePayload = {
  comicId?: string;
  currentLiked?: boolean;
  extern?: Record<string, unknown>;
};

type BikaToggleFavoritePayload = {
  comicId?: string;
  currentFavorite?: boolean;
  extern?: Record<string, unknown>;
};

type BikaFavoriteFolderPayload = {
  comicId?: string;
  folderId?: string;
  folderName?: string;
  extern?: Record<string, unknown>;
};

type BikaCommentFeedPayload = {
  comicId?: string;
  page?: number;
  commentId?: string;
  content?: string;
  extern?: Record<string, unknown>;
};

let runtimeSelectedCategories: string[] = [];

const BIKA_SEARCH_CATEGORY_OPTIONS = [
  "嗶咔漢化",
  "全彩",
  "長篇",
  "同人",
  "短篇",
  "圓神領域",
  "碧藍幻想",
  "CG雜圖",
  "英語 ENG",
  "生肉",
  "純愛",
  "百合花園",
  "後宮閃光",
  "扶他樂園",
  "耽美花園",
  "偽娘哲學",
  "單行本",
  "姐姐系",
  "妹妹系",
  "性轉換",
  "SM",
  "足の恋",
  "人妻",
  "NTR",
  "強暴",
  "非人類",
  "艦隊收藏",
  "Love Live",
  "SAO 刀劍神域",
  "Fate",
  "東方",
  "WEBTOON",
  "禁書目錄",
  "歐美",
  "Cosplay",
  "重口地帶",
];

const BIKA_HOME_CATEGORY_OPTIONS = [
  "最近更新",
  "随机本子",
  "援助嗶咔",
  "嗶咔小禮物",
  "小電影",
  "小里番",
  "嗶咔畫廊",
  "嗶咔商店",
  "大家都在看",
  "大濕推薦",
  "那年今天",
  "官方都在看",
  "嗶咔運動",
  ...BIKA_SEARCH_CATEGORY_OPTIONS,
];

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

function stripHtmlTags(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDisplayTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function sanitizePath(path: string): string {
  return path.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

async function buildBikaImageUrl(
  fileServer: unknown,
  pathValue: unknown,
  pictureType: "cover" | "creator" | "favourite" | "comic" | "else" = "cover",
) {
  const imageQuality = await loadPluginSetting("image.quality", "original");
  const proxy = toNum(await loadPluginSetting("network.proxy", "3"));
  let url = String(fileServer).trim();
  let path = String(pathValue).trim();

  if (url == "https://storage1.picacomic.com") {
    if (pictureType == "cover") {
      url = "https://img.picacomic.com";
    } else if (pictureType == "creator" || pictureType == "favourite") {
      url =
        proxy == 1
          ? "https://storage.diwodiwo.xyz"
          : "https://s3.picacomic.com";
    } else {
      if (imageQuality != "original") {
        url = "https://img.picacomic.com";
      } else {
        url =
          proxy == 1
            ? "https://storage.diwodiwo.xyz"
            : "https://s3.picacomic.com";
      }
    }
  } else if (url == "https://storage-b.picacomic.com") {
    if (pictureType == "creator") {
      url = "https://storage-b.picacomic.com";
    } else if (pictureType == "cover") {
      url = "https://img.picacomic.com";
    } else if (imageQuality == "original") {
      url = "https://storage-b.diwodiwo.xyz";
    } else if (imageQuality != "original") {
      url = "https://img.picacomic.com";
    }
  }

  if (
    path.includes("picacomic-paint.jpg") ||
    path.includes("picacomic-gift.jpg")
  ) {
    url =
      proxy == 1
        ? "https://storage.diwodiwo.xyz/static"
        : "https://s3.picacomic.com/static";
  }

  if (path.includes("tobeimg/")) {
    path = path.replace("tobeimg/", "");
  } else if (path.includes("tobs/")) {
    path = "static/" + path.replace("tobs/", "");
  } else if (!path.includes("/") && !url.includes("static")) {
    path = "static/" + path;
  }

  // console.debug(url + "/" + path);

  return url + "/" + path;
}

function buildMetadata(type: string, name: string, value: unknown) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized = list
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);

  if (!normalized.length) {
    return null;
  }

  return {
    type,
    name,
    value: normalized,
  };
}

function createActionItem(
  name: unknown,
  onTap: Record<string, unknown> = {},
  extension: Record<string, unknown> = {},
) {
  return {
    name: String(name ?? ""),
    onTap,
    extension,
  };
}

function createMetadataActionList(
  type: string,
  name: string,
  values: unknown,
  mapItem?: (value: string) => ReturnType<typeof createActionItem>,
) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  const normalized = list
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .map((item) => (mapItem ? mapItem(item) : createActionItem(item)));

  if (!normalized.length) {
    return null;
  }

  return {
    type,
    name,
    value: normalized,
  };
}

function createImage(input: {
  id: unknown;
  url: unknown;
  name?: unknown;
  path?: unknown;
  extension?: Record<string, unknown>;
}) {
  return {
    id: String(input.id ?? ""),
    url: String(input.url ?? ""),
    name: String(input.name ?? ""),
    path: String(input.path ?? ""),
    extension: input.extension ?? {},
  };
}

function openSearchAction(payload: Record<string, unknown>) {
  const source = String(payload.source ?? "").trim();
  const keyword = String(payload.keyword ?? "").trim();
  const inheritedExtern =
    payload.extern &&
    typeof payload.extern === "object" &&
    !Array.isArray(payload.extern)
      ? (payload.extern as Record<string, unknown>)
      : {};
  const extern = {
    ...inheritedExtern,
    ...(typeof payload.url === "string" && payload.url.trim().length
      ? { url: payload.url.trim() }
      : {}),
    ...(Array.isArray(payload.categories)
      ? { categories: payload.categories }
      : {}),
    ...(typeof payload.mode === "string" && payload.mode.trim().length
      ? { mode: payload.mode.trim() }
      : {}),
    ...(typeof payload.creatorId === "string" && payload.creatorId.trim().length
      ? { creatorId: payload.creatorId.trim() }
      : {}),
  };
  return {
    type: "openSearch",
    payload: {
      ...(source ? { source } : {}),
      ...(keyword ? { keyword } : {}),
      extern,
    },
  };
}

async function toComicListItem(
  comic: any,
  options: {
    pictureType?: "cover" | "creator" | "favourite" | "comic";
  } = {},
) {
  const id = String(comic?._id ?? comic?.id ?? "");
  const title = String(comic?.title ?? "");
  const thumb = comic?.thumb ?? {};
  const fileServer = String(thumb?.fileServer ?? "");
  const path = String(thumb?.path ?? "");

  return {
    source: BIKA_PLUGIN_ID,
    id,
    title,
    subtitle: "",
    finished: toBool(comic?.finished),
    likesCount: toNum(comic?.likesCount),
    viewsCount: toNum(comic?.totalViews ?? comic?.viewsCount),
    updatedAt: String(comic?.updated_at ?? ""),
    cover: {
      id,
      url: await buildBikaImageUrl(
        fileServer,
        path,
        options.pictureType ?? "cover",
      ),
      path: sanitizePath(path),
      name: String(thumb?.originalName ?? ""),
    },
    metadata: [
      buildMetadata("author", "作者", comic?.author),
      buildMetadata("team", "汉化组", comic?.chineseTeam),
      buildMetadata("categories", "分类", comic?.categories),
      buildMetadata("tags", "标签", comic?.tags),
    ].filter(Boolean),
    raw: comic,
    extern: {},
  };
}

async function toCreatorListItem(user: any) {
  const id = String(user?._id ?? user?.id ?? "");
  const avatar = user?.avatar ?? {};

  const data = {
    source: BIKA_PLUGIN_ID,
    id,
    name: String(user?.name ?? ""),
    subtitle: String(user?.title ?? ""),
    cover: {
      url: await buildBikaImageUrl(
        user?.avatar?.fileServer,
        user?.avatar?.path,
        "creator",
      ),
      path: sanitizePath(user?.avatar?.path ?? ""),
    },
    metadata: [],
    stats: [
      `等级：${toNum(user?.level)}`,
      `总上传数：${toNum(user?.comicsUploaded)}`,
    ],
    onTap: openSearchAction({
      source: BIKA_PLUGIN_ID,
      keyword: String(user?.name ?? ""),
      extern: {
        url: `https://picaapi.picacomic.com/comics?ca=${id}&s=ld&page=1`,
      },
    }),
    raw: user,
    extern: {},
  };

  return data;
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

  const infoResponse = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comics/${comicId}`,
    method: "GET",
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

  const recommendItems = await Promise.all(
    recommend.map(async (item: any) => {
      const unifiedItem = await toComicListItem(item, {
        pictureType: "cover",
      });
      return {
        source: BIKA_PLUGIN_ID,
        id: String(item?._id ?? item?.id ?? ""),
        title: String(item?.title ?? ""),
        cover: createImage({
          id: String(item?._id ?? item?.id ?? ""),
          url: await buildBikaImageUrl(
            item?.thumb?.fileServer,
            item?.thumb?.path,
            "cover",
          ),
          path: sanitizePath(item?.thumb?.path ?? ""),
          name: String(item?.thumb?.originalName ?? ""),
        }),
        extension: {
          unifiedItem,
        },
      };
    }),
  );

  const normal = {
    comicInfo: {
      id: String(comic._id ?? comicId),
      title: String(comic.title ?? ""),
      titleMeta: [
        createActionItem(`浏览：${toNum(comic.totalViews)}`),
        createActionItem(
          `更新时间：${String(comic.updated_at ?? new Date().toISOString())}`,
        ),
        ...(toNum(comic.pagesCount) > 0
          ? [createActionItem(`页数：${toNum(comic.pagesCount)}`)]
          : []),
        createActionItem(`章节数：${toNum(comic.epsCount)}`),
      ],
      creator: {
        id: String(comic._creator?._id ?? ""),
        name: String(comic._creator?.name ?? ""),
        avatar: createImage({
          id: String(comic._creator?._id ?? ""),
          url: await buildBikaImageUrl(
            comic._creator?.avatar?.fileServer,
            comic._creator?.avatar?.path,
            "creator",
          ),
          path: sanitizePath(comic._creator?.avatar?.path ?? ""),
          name: String(comic._creator?.avatar?.originalName ?? ""),
        }),
        onTap: openSearchAction({
          source: BIKA_PLUGIN_ID,
          keyword: String(comic._creator?.name ?? ""),
          url: `https://picaapi.picacomic.com/comics?ca=${String(comic._creator?._id ?? "")}&s=ld&page=1`,
        }),
        extension: {},
      },
      description: String(comic.description ?? ""),
      cover: createImage({
        id: String(comic._id ?? comicId),
        url: await buildBikaImageUrl(
          comic.thumb?.fileServer,
          comic.thumb?.path,
          "cover",
        ),
        path: sanitizePath(comic.thumb?.path ?? ""),
        name: String(comic.thumb?.originalName ?? ""),
      }),
      metadata: [
        createMetadataActionList("author", "作者", comic.author, (item) =>
          createActionItem(
            item,
            openSearchAction({ source: BIKA_PLUGIN_ID, keyword: item }),
          ),
        ),
        createMetadataActionList(
          "chineseTeam",
          "汉化组",
          comic.chineseTeam,
          (item) =>
            createActionItem(
              item,
              openSearchAction({ source: BIKA_PLUGIN_ID, keyword: item }),
            ),
        ),
        createMetadataActionList(
          "categories",
          "分类",
          comic.categories,
          (item) =>
            createActionItem(
              item,
              openSearchAction({ source: BIKA_PLUGIN_ID, categories: [item] }),
            ),
        ),
        createMetadataActionList("tags", "标签", comic.tags, (item) =>
          createActionItem(
            item,
            openSearchAction({ source: BIKA_PLUGIN_ID, keyword: item }),
          ),
        ),
      ].filter(Boolean),
      extension: {},
    },
    eps: epsDocs.map((item: any) => ({
      id: String(item?._id ?? ""),
      name: String(item?.title ?? ""),
      order: toNum(item?.order),
      extension: {},
    })),
    recommend: recommendItems,
    totalViews: toNum(comic.totalViews),
    totalLikes: toNum(comic.totalLikes),
    totalComments: toNum(comic.totalComments),
    isFavourite: toBool(comic.isFavourite),
    isLiked: toBool(comic.isLiked),
    allowComments: toBool(comic.allowComment, false),
    allowLike: true,
    allowCollected: true,
    allowDownload: true,
    extension: {},
  };

  const scheme = {
    version: "1.0.0",
    type: "comicDetail",
    source: BIKA_PLUGIN_ID,
  };

  const data = {
    normal,
    raw: {
      comicInfo: comic,
      eps: epsDocs,
      recommend,
    },
  };

  return {
    source: BIKA_PLUGIN_ID,
    comicId,
    extern: payload.extern ?? null,
    scheme,
    data,
  };
}

function toSortKeyword(sortBy: unknown): string {
  const value = Number(sortBy);
  if (value === 2) return "da";
  if (value === 3) return "ld";
  if (value === 4) return "vd";
  return "dd";
}

function createChoiceOption(
  label: string,
  value: string,
  result: Record<string, unknown>,
): RankingFilterOption {
  return { label, value, result };
}

function getBikaRankingOptions(): RankingFilterOption[] {
  return [
    createChoiceOption("日榜", "day", {
      core: {
        days: "H24",
        type: "comic",
      },
      params: {
        bodyType: "pluginPagedComicList",
      },
    }),
    createChoiceOption("周榜", "week", {
      core: {
        days: "D7",
        type: "comic",
      },
      params: {
        bodyType: "pluginPagedComicList",
      },
    }),
    createChoiceOption("月榜", "month", {
      core: {
        days: "D30",
        type: "comic",
      },
      params: {
        bodyType: "pluginPagedComicList",
      },
    }),
    // createChoiceOption("骑士榜", "creator", {
    //   core: {
    //     days: "",
    //     type: "creator",
    //   },
    //   params: {
    //     bodyType: "pluginPagedCreatorList",
    //   },
    // }),
  ];
}

function toStringMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function resolveSceneFnPath(sceneLike: unknown): string {
  const scene = toStringMap(sceneLike);
  const body = toStringMap(scene.body);
  const request = toStringMap(body.request);
  const list = toStringMap(scene.list);
  const candidates = [
    list.fnPath,
    list.fn_path,
    request.fnPath,
    request.fn_path,
    scene.fnPath,
    scene.fn_path,
  ];
  for (const item of candidates) {
    const value = String(item ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
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
  const [
    account,
    password,
    proxy,
    imageQuality,
    slowDownload,
    blockedCategories,
    blockedHomeCategories,
  ] = await Promise.all([
    loadPluginSetting("auth.account", ""),
    loadPluginSetting("auth.password", ""),
    loadPluginSetting("network.proxy", "3"),
    loadPluginSetting("image.quality", "original"),
    loadPluginSetting("download.slow", false),
    loadPluginSetting("search.blockedCategories", []),
    loadPluginSetting("home.blockedCategories", []),
  ]);

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        {
          id: "account",
          title: "账号",
          fields: [
            {
              key: "auth.account",
              kind: "text",
              label: "账号",
            },
            {
              key: "auth.password",
              kind: "password",
              label: "密码",
            },
            {
              key: "account.slogan",
              kind: "text",
              label: "更新简介",
              fnPath: "updateProfile",
              persist: false,
            },
            {
              key: "account.password",
              kind: "password",
              label: "更新密码",
              fnPath: "updatePassword",
              persist: false,
            },
          ],
        },
        // {
        //   id: "browse",
        //   title: "浏览与下载",
        //   fields: [
        //     {
        //       key: "network.proxy",
        //       kind: "choice",
        //       label: "分流设置",
        //       options: [
        //         { label: "1", value: "1" },
        //         { label: "2", value: "2" },
        //         { label: "3", value: "3" },
        //       ],
        //     },
        //     {
        //       key: "image.quality",
        //       kind: "choice",
        //       label: "图片质量",
        //       options: [
        //         { label: "低画质", value: "low" },
        //         { label: "中画质", value: "medium" },
        //         { label: "高画质", value: "high" },
        //         { label: "原图", value: "original" },
        //       ],
        //     },
        //     {
        //       key: "download.slow",
        //       kind: "switch",
        //       label: "慢速下载",
        //     },
        //   ],
        // },
        {
          id: "shield",
          title: "屏蔽设置",
          fields: [
            {
              key: "home.blockedCategories",
              kind: "multiChoice",
              label: "首页屏蔽",
              options: BIKA_HOME_CATEGORY_OPTIONS.map((item) => ({
                label: item,
                value: item,
              })),
            },
            {
              key: "search.blockedCategories",
              kind: "multiChoice",
              label: "分类屏蔽",
              options: BIKA_SEARCH_CATEGORY_OPTIONS.map((item) => ({
                label: item,
                value: item,
              })),
            },
          ],
        },
      ],
    },
    data: {
      canShowUserInfo: false,
      values: {
        "auth.account": String(account ?? ""),
        "auth.password": String(password ?? ""),
        "account.slogan": "",
        "account.password": "",
        "network.proxy": String(proxy ?? "3"),
        "image.quality": String(imageQuality ?? "original"),
        "download.slow": toBool(slowDownload, false),
        "search.blockedCategories": toStrList(blockedCategories),
        "home.blockedCategories": toStrList(blockedHomeCategories),
      },
    },
  };
}

async function getUserInfoBundle() {
  const profile = await bikaRequest({
    url: "https://picaapi.picacomic.com/users/profile",
    method: "GET",
    cache: false,
  });
  const user = (profile as any)?.data?.user ?? {};
  const avatar = user?.avatar ?? {};
  const avatarPath = String(avatar?.path ?? "").trim();
  const avatarFileServer = String(avatar?.fileServer ?? "").trim();
  const avatarUrl =
    avatarPath && avatarFileServer
      ? await buildBikaImageUrl(avatarFileServer, avatarPath, "creator")
      : "";

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "userInfo",
    },
    data: {
      title: "账号",
      avatar: {
        id: String(user?._id ?? user?.id ?? "me"),
        url: avatarUrl,
        name: String(avatar?.originalName ?? ""),
        path: avatarPath ? sanitizePath(avatarPath) : "",
      },
      lines: [
        `${String(user?.name ?? "")} (${String(user?.slogan ?? "")})`,
        `Lv.${toNum(user?.level, 0)} ${String(user?.title ?? "")}`,
        `经验值: ${toNum(user?.exp, 0)} (${user?.isPunched ? "已签到" : "未签到"})`,
      ],
      extern: {
        isPunched: user?.isPunched === true,
      },
    },
  };
}

async function updateProfile(payload: Record<string, unknown> = {}) {
  const value = String(payload.value ?? "").trim();
  if (!value) {
    throw new Error("简介不能为空");
  }

  const result = await bikaRequest({
    url: "https://picaapi.picacomic.com/users/profile",
    method: "PUT",
    body: JSON.stringify({ slogan: value }),
  });

  return {
    ok: true,
    message: "简介已更新",
    raw: result,
  };
}

async function updatePassword(payload: Record<string, unknown> = {}) {
  const newPassword = String(payload.value ?? "");
  if (!newPassword.trim()) {
    throw new Error("密码不能为空");
  }

  const oldPassword = String(await loadPluginSetting("auth.password", ""));
  if (!oldPassword) {
    throw new Error("缺少旧密码，请重新登录后再试");
  }

  const result = await bikaRequest({
    url: "https://picaapi.picacomic.com/users/password",
    method: "PUT",
    body: JSON.stringify({
      new_password: newPassword,
      old_password: oldPassword,
    }),
  });

  await runtime.pluginConfig.savePluginConfig(
    "auth.password",
    JSON.stringify(newPassword),
  );

  return {
    ok: true,
    message: "密码已更新",
    raw: result,
  };
}

function buildHomeAction(category: any, authorization = "") {
  const title = String(category?.title ?? "");
  if (title === "最近更新") {
    return {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
      },
    };
  }

  if (title === "随机本子") {
    return {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
        url: "https://picaapi.picacomic.com/comics/random",
      },
    };
  }

  if (title === "大家都在看") {
    return {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E5%A4%A7%E5%AE%B6%E9%83%BD%E5%9C%A8%E7%9C%8B&s=dd",
      },
    };
  }

  if (title === "大濕推薦") {
    return {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E5%A4%A7%E6%BF%95%E6%8E%A8%E8%96%A6&s=dd",
      },
    };
  }

  if (title === "那年今天") {
    return {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=dd",
      },
    };
  }

  if (title === "官方都在看") {
    return {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
        url: "https://picaapi.picacomic.com/comics?page=1&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=dd",
      },
    };
  }

  if (category?.isWeb) {
    let url = String(category?.link ?? "");
    if (title === "嗶咔畫廊" && authorization.trim()) {
      url = `${url}?token=${authorization}`;
    }
    return {
      type: "openWeb",
      payload: {
        title,
        url,
      },
    };
  }

  return {
    type: "openSearch",
    payload: {
      source: BIKA_PLUGIN_ID,
      categories: [title],
    },
  };
}

function toHomeChip(label: unknown) {
  const text = String(label ?? "").trim();
  return {
    label: text,
    action: {
      type: "openSearch",
      payload: {
        source: BIKA_PLUGIN_ID,
        keyword: text,
      },
    },
  };
}

function toActionItem(input: {
  title: string;
  coverUrl?: string;
  coverPath?: string;
  action: Record<string, unknown>;
  subtitle?: string;
  badge?: string;
}) {
  return {
    title: input.title,
    subtitle: input.subtitle ?? "",
    badge: input.badge ?? "",
    cover: {
      url: String(input.coverUrl ?? ""),
      path: String(input.coverPath ?? ""),
    },
    action: input.action,
  };
}

function boolKeyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }
  const map = toStringMap(value);
  return Object.entries(map)
    .filter(([, checked]) => Boolean(checked))
    .map(([key]) => key);
}

function toBoolMap(values: string[]): Record<string, boolean> {
  return values.reduce<Record<string, boolean>>((acc, item) => {
    if (item.trim()) {
      acc[item] = true;
    }
    return acc;
  }, {});
}

async function loadBlockedCategories(): Promise<string[]> {
  const value = await loadPluginSetting("search.blockedCategories", []);
  return toStrList(value);
}

async function saveBlockedCategories(values: string[]) {
  await runtime.pluginConfig.savePluginConfig(
    "search.blockedCategories",
    JSON.stringify(values),
  );
}

async function searchComic(payload: BikaSearchPayload = {}) {
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, toNum(payload.page, 1));
  const sort =
    String(extern.sort ?? toSortKeyword(extern.sortBy)).trim() || "dd";
  const keyword = String(payload.keyword ?? extern.keyword ?? "").trim();
  const mode = String(extern.mode ?? "").trim();
  const creatorId = String(extern.creatorId ?? "").trim();
  const categories = boolKeyList(extern.categories);
  if (categories.length) {
    runtimeSelectedCategories = categories;
  }
  const blockedCategories = boolKeyList(extern.blockedCategories);
  if (blockedCategories.length || extern.blockedCategories) {
    await saveBlockedCategories(blockedCategories);
  }
  const overrideUrl = String(extern.url ?? "").trim();

  let response: Record<string, any>;
  if (mode === "creator" && creatorId) {
    response = await bikaRequest({
      url: `https://picaapi.picacomic.com/comics?ca=${creatorId}&s=${sort}&page=${page}`,
      method: "GET",
    });
  } else if (overrideUrl) {
    if (overrideUrl.includes("comics?ca=")) {
      const prefix = overrideUrl.split("&s")[0];
      response = await bikaRequest({
        url: `${prefix}&s=${sort}&page=${page}`,
        method: "GET",
      });
    } else if (overrideUrl.includes("%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9")) {
      response = await bikaRequest({
        url: `https://picaapi.picacomic.com/comics?page=${page}&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=${sort}`,
        method: "GET",
      });
    } else if (
      overrideUrl.includes("%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B")
    ) {
      response = await bikaRequest({
        url: `https://picaapi.picacomic.com/comics?page=${page}&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=${sort}`,
        method: "GET",
      });
    } else {
      response = await bikaRequest({
        url: overrideUrl,
        method: "GET",
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
      sortBy: toNum(extern.sortBy, 1),
      categories: toBoolMap(
        categories.length ? categories : runtimeSelectedCategories,
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
      url: "https://picaapi.picacomic.com/categories",
      method: "GET",
      cache: true,
    }),
    bikaRequest({
      url: "https://picaapi.picacomic.com/keywords",
      method: "GET",
      cache: true,
    }),
  ]);

  const categories = Array.isArray(categoriesResponse?.data?.categories)
    ? categoriesResponse.data.categories
    : [];
  const authorization = String(
    await loadPluginSetting("auth.authorization", ""),
  );
  const keywordItems = Array.isArray(keywordsResponse?.data?.keywords)
    ? keywordsResponse.data.keywords.map((item: unknown) => toHomeChip(item))
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
    url: `https://picaapi.picacomic.com/users/favourite?s=${sort}&page=${page}`,
    method: "GET",
  });

  const comics = raw?.data?.comics ?? {};
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
    url: `https://picaapi.picacomic.com/comics/${comicId}/like`,
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
    url: `https://picaapi.picacomic.com/comics/${comicId}/favourite`,
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

async function mapBikaCommentItem(item: any) {
  const id = String(item?._id ?? item?.id ?? "");
  const user = item?._user ?? {};
  const avatar = user?.avatar ?? {};
  const path = String(avatar?.path ?? "");
  const fileServer = String(avatar?.fileServer ?? "").trim();
  const hasAvatar = fileServer.length > 0 && path.length > 0;
  return {
    id,
    author: {
      name: String(user?.name ?? "匿名用户"),
      avatar: {
        url: hasAvatar
          ? await buildBikaImageUrl(avatar?.fileServer, avatar?.path, "creator")
          : "",
        path: hasAvatar ? sanitizePath(path) : "",
      },
    },
    content: stripHtmlTags(item?.content),
    createdAt: formatDisplayTime(item?.created_at),
    replyCount: toNum(item?.commentsCount ?? item?.totalComments, 0),
    replies: [],
    extern: {
      commentId: id,
    },
  };
}

async function getCommentFeed(payload: BikaCommentFeedPayload = {}) {
  const comicId = String(payload.comicId ?? "").trim();
  const page = Math.max(1, toNum(payload.page, 1));
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  const raw = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comics/${comicId}/comments?page=${page}`,
    method: "GET",
  })) as Record<string, any>;

  const data = (raw?.data ?? {}) as Record<string, any>;
  const comments = (data?.comments ?? {}) as Record<string, any>;
  const topComments = Array.isArray(data?.topComments) ? data.topComments : [];
  const docs = Array.isArray(comments?.docs) ? comments.docs : [];
  const currentPage = toNum(comments?.page, page);
  const totalPages = toNum(comments?.pages, currentPage);
  const topItems = await Promise.all(
    topComments.map(async (item: any) => await mapBikaCommentItem(item)),
  );
  const items = await Promise.all(
    docs.map(async (item: any) => await mapBikaCommentItem(item)),
  );

  return {
    source: BIKA_PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "commentFeed",
    },
    data: {
      replyMode: "lazy",
      canComment: {
        comic: true,
        reply: true,
      },
      paging: {
        page: currentPage,
        hasReachedMax: currentPage >= totalPages,
      },
      topItems,
      items,
    },
  };
}

async function loadCommentReplies(payload: BikaCommentFeedPayload = {}) {
  const commentId = String(
    payload.commentId ?? payload.extern?.commentId ?? "",
  ).trim();
  const page = Math.max(1, toNum(payload.page, 1));
  if (!commentId) {
    throw new Error("commentId 不能为空");
  }

  const raw = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comments/${commentId}/childrens?page=${page}`,
    method: "GET",
  })) as Record<string, any>;

  const data = (raw?.data ?? {}) as Record<string, any>;
  const comments = (data?.comments ?? {}) as Record<string, any>;
  const docs = Array.isArray(comments?.docs) ? comments.docs : [];
  const currentPage = toNum(comments?.page, page);
  const totalPages = toNum(comments?.pages, currentPage);
  const items = await Promise.all(
    docs.map(async (item: any) => await mapBikaCommentItem(item)),
  );

  return {
    source: BIKA_PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "commentReplies",
    },
    data: {
      commentId,
      paging: {
        page: currentPage,
        hasReachedMax: currentPage >= totalPages,
      },
      items,
    },
  };
}

async function postComment(payload: BikaCommentFeedPayload = {}) {
  const comicId = String(payload.comicId ?? "").trim();
  const content = String(payload.content ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  if (!content) {
    throw new Error("content 不能为空");
  }

  const raw = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comics/${comicId}/comments`,
    method: "POST",
    body: { content },
  })) as Record<string, any>;

  const createdRaw =
    raw?.data?.comment ??
    raw?.data?.doc ??
    raw?.data?.item ??
    raw?.data ??
    null;
  const created = createdRaw ? await mapBikaCommentItem(createdRaw) : null;

  return {
    source: BIKA_PLUGIN_ID,
    scheme: { version: "1.0.0", type: "commentMutation" },
    data: {
      ok: true,
      mode: "postComment",
      created,
      insertHint: {
        strategy: "prependAfterTop",
        needsRefetch: created == null,
      },
    },
  };
}

async function postCommentReply(payload: BikaCommentFeedPayload = {}) {
  const commentId = String(
    payload.commentId ?? payload.extern?.commentId ?? "",
  ).trim();
  const content = String(payload.content ?? "").trim();
  if (!commentId) {
    throw new Error("commentId 不能为空");
  }
  if (!content) {
    throw new Error("content 不能为空");
  }

  const raw = (await bikaRequest({
    url: `https://picaapi.picacomic.com/comments/${commentId}`,
    method: "POST",
    body: { content },
  })) as Record<string, any>;

  const createdRaw =
    raw?.data?.comment ??
    raw?.data?.doc ??
    raw?.data?.item ??
    raw?.data ??
    null;
  const created = createdRaw ? await mapBikaCommentItem(createdRaw) : null;

  return {
    source: BIKA_PLUGIN_ID,
    scheme: { version: "1.0.0", type: "commentMutation" },
    data: {
      ok: true,
      mode: "postReply",
      parentId: commentId,
      created,
      insertHint: {
        strategy: "prepend",
        targetCommentId: commentId,
        needsRefetch: created == null,
      },
    },
  };
}

async function getCloudFavoriteFilterBundle() {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "rankingFilter",
      title: "云端收藏筛选",
      fields: [
        {
          key: "order",
          kind: "choice",
          label: "排序",
          options: [
            {
              label: "收藏时间(新→旧)",
              value: "dd",
              result: { extern: { sort: "dd" } },
            },
            {
              label: "收藏时间(旧→新)",
              value: "da",
              result: { extern: { sort: "da" } },
            },
          ],
        },
      ],
    },
    data: {
      values: {
        order: "dd",
      },
    },
  };
}

async function getCloudFavoriteSceneBundle() {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "comicListSceneBundle",
    },
    data: {
      scene: {
        title: "云端收藏",
        source: BIKA_PLUGIN_ID,
        body: {
          type: "pluginPagedComicList",
          request: {
            fnPath: "getFavoriteData",
            core: {},
            extern: {
              source: "cloudFavorite",
              sort: "dd",
            },
          },
        },
        filter: {
          fnPath: "getCloudFavoriteFilterBundle",
          extern: {
            source: "cloudFavorite",
          },
        },
      },
    },
  };
}

async function get_cloud_favorite_scene_bundle() {
  return getCloudFavoriteSceneBundle();
}

async function getLoginBundle() {
  return {
    source: BIKA_PLUGIN_ID,
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

setUnauthorizedSchemeProvider(async () => {
  const bundle = await getLoginBundle();
  return bundle as Record<string, unknown>;
});

async function loginWithPassword(payload: BikaLoginPayload = {}) {
  console.debug("loginWithPassword", payload);
  const account = String(payload.account ?? "").trim();
  const password = String(payload.password ?? "");
  if (!account || !password) {
    throw new Error("账号或密码不能为空");
  }

  const result = await bikaRequest({
    url: "https://picaapi.picacomic.com/auth/sign-in",
    method: "POST",
    body: JSON.stringify({ email: account, password }),
  });

  const token = String((result as any)?.data?.token ?? "");
  await Promise.all([
    runtime.pluginConfig.savePluginConfig(
      "auth.account",
      JSON.stringify(account),
    ),
    runtime.pluginConfig.savePluginConfig(
      "auth.password",
      JSON.stringify(password),
    ),
    runtime.pluginConfig.savePluginConfig(
      "auth.authorization",
      JSON.stringify(token),
    ),
  ]);

  return {
    source: BIKA_PLUGIN_ID,
    data: {
      account,
      password,
      token,
    },
    raw: result,
  };
}

let bikaAuthFlowStarted = false;
let bikaAuthFlowRunning = false;

function randomRetryDelayMs() {
  const min = 20_000;
  const max = 300_000;
  return Math.floor(min + Math.random() * (max - min));
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runBikaAuthAndCheckInLoop() {
  if (bikaAuthFlowRunning) {
    return;
  }
  bikaAuthFlowRunning = true;
  try {
    while (true) {
      try {
        const account = String(
          await loadPluginSetting("auth.account", ""),
        ).trim();
        const password = String(await loadPluginSetting("auth.password", ""));

        if (!account || !password) {
          console.info("[bika.init] skip auth/checkin: no credentials");
          return;
        }

        await loginWithPassword({ account, password });

        await bikaRequest({
          url: "https://picaapi.picacomic.com/users/punch-in",
          method: "POST",
          body: JSON.stringify({}),
          cache: false,
        });

        console.info("[bika.init] login + checkin ok");
        return;
      } catch (error) {
        const delay = randomRetryDelayMs();
        console.warn(
          `[bika.init] login/checkin failed, retry in ${delay}ms`,
          error,
        );
        await waitMs(delay);
      }
    }
  } finally {
    bikaAuthFlowRunning = false;
  }
}

async function init() {
  if (!bikaAuthFlowStarted) {
    bikaAuthFlowStarted = true;
    void runBikaAuthAndCheckInLoop();
  }

  return {
    source: BIKA_PLUGIN_ID,
    data: {
      ok: true,
      started: true,
    },
  };
}

async function getCapabilitiesBundle() {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "advancedActions",
      actions: [
        {
          key: "clear_cache",
          title: "清理插件会话",
          fnPath: "clearPluginSession",
        },
      ],
    },
    data: {
      actions: ["clear_cache"],
    },
  };
}

async function getComicListSceneBundle() {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "comicListSceneBundle",
    },
    data: {
      scene: {
        title: "哔咔排行榜",
        source: BIKA_PLUGIN_ID,
        body: {
          type: "pluginPagedComicList",
          request: {
            fnPath: "getRankingData",
            core: {
              days: "H24",
              type: "comic",
            },
            extern: {
              source: "ranking",
            },
          },
        },
        filter: {
          fnPath: "getRankingFilterBundle",
          extern: {
            source: "ranking",
          },
        },
      },
    },
  };
}

async function getRankingFilterBundle() {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "rankingFilter",
      title: "筛选排行榜",
      fields: [
        {
          key: "ranking",
          kind: "choice",
          label: "榜单",
          options: getBikaRankingOptions(),
        },
      ],
    },
    data: {
      values: {
        ranking: "day",
      },
    },
  };
}

async function getAdvancedSearchScheme(
  payload: { extern?: Record<string, unknown> } = {},
) {
  const extern = toStringMap(payload.extern);
  let categories = BIKA_SEARCH_CATEGORY_OPTIONS;

  const blockedCategories = await loadBlockedCategories();
  const selectedCategories = boolKeyList(extern.categories);
  const selectedBlocked = boolKeyList(extern.blockedCategories);
  const selectedSortBy = toNum(extern.sortBy, 1);

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "advancedSearch",
      fields: [
        {
          key: "sortBy",
          kind: "choice",
          label: "排序",
          options: [
            { label: "最新", value: 1 },
            { label: "最多喜欢", value: 2 },
            { label: "最多指名", value: 3 },
            { label: "最多观看", value: 4 },
          ],
        },
        {
          key: "categories",
          kind: "multiChoice",
          label: "分类选择",
          options: categories.map((item: string) => ({
            label: item,
            value: item,
          })),
        },
        {
          key: "blockedCategories",
          kind: "multiChoice",
          label: "屏蔽分类",
          options: categories.map((item: string) => ({
            label: item,
            value: item,
          })),
        },
      ],
    },
    data: {
      values: {
        sortBy: selectedSortBy,
        categories:
          selectedCategories.length > 0
            ? selectedCategories
            : runtimeSelectedCategories,
        blockedCategories:
          selectedBlocked.length > 0 ? selectedBlocked : blockedCategories,
      },
    },
  };
}

async function get_advanced_search_scheme() {
  return getAdvancedSearchScheme();
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

  const raw = await bikaRequest({
    url,
    method: "GET",
    cache: true,
  });

  const items = await Promise.all(
    type === "creator"
      ? (Array.isArray((raw as any)?.data?.users)
          ? (raw as any).data.users
          : []
        ).map(async (item: any) => await toCreatorListItem(item))
      : (Array.isArray((raw as any)?.data?.comics)
          ? (raw as any).data.comics
          : []
        ).map(async (item: any) => await toComicListItem(item)),
  );

  return {
    source: BIKA_PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "rankingFeed",
      card: type === "creator" ? "creator" : "comic",
    },
    data: {
      days,
      rankingType: type,
      hasReachedMax: true,
      items,
      raw,
    },
  };
}

async function getChapter(payload: BikaChapterPayload = {}) {
  const proxy = await loadPluginSetting("network.proxy", "3");
  const comicId = String(payload.comicId ?? "").trim();
  const chapterId = toNum(payload.chapterId, 0);
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  if (!chapterId) {
    throw new Error("chapterId 不能为空");
  }

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
        name: String(doc?.media?.originalName ?? ""),
        path: String(doc?.media?.path ?? ""),
        url: await buildBikaImageUrl(
          doc?.media?.fileServer,
          doc?.media?.path,
          "comic",
        ),
        id: String(doc?.id ?? ""),
      });
    }

    page += 1;
  }

  return {
    source: BIKA_PLUGIN_ID,
    comicId,
    chapterId,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "chapterContent",
      source: BIKA_PLUGIN_ID,
    },
    data: {
      chapter: {
        epId,
        epName,
        length: docs.length,
        epPages: String(docs.length),
        docs,
      },
    },
    chapter: {
      epId,
      epName,
      length: docs.length,
      epPages: String(docs.length),
      docs,
    },
  };
}

async function getReadSnapshot(payload: BikaReadSnapshotPayload = {}) {
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  const externInput = toStringMap(payload.extern);
  const externSettings = toStringMap(externInput.settings);
  const readSettings = {
    proxy: String(externSettings.proxy ?? externInput.proxy ?? "").trim(),
    imageQuality: String(
      externSettings.imageQuality ?? externInput.imageQuality ?? "",
    ).trim(),
    authorization: String(
      externSettings.authorization ?? externInput.authorization ?? "",
    ).trim(),
  };
  const imageQuality =
    String(externInput.imageQuality ?? "").trim() || undefined;
  const authorization =
    String(externInput.authorization ?? "").trim() || undefined;

  const detail = await getComicDetail({
    comicId,
    extern: payload.extern,
  });
  const normal = (detail as any)?.data?.normal ?? (detail as any)?.normal ?? {};

  const chapterRefs = (Array.isArray(normal?.eps) ? normal.eps : []).map(
    (ep: any) => ({
      id: String(ep?.id ?? ""),
      name: String(ep?.name ?? ""),
      order: toNum(ep?.order, 0),
      extern: {
        ...toStringMap(ep?.extension),
      },
    }),
  );

  const chapterIdInput = String(payload.chapterId ?? "").trim();
  const order = toNum(externInput.order, 0);
  const byChapterId = chapterRefs.find(
    (item: any) => String(item.id) === chapterIdInput,
  );
  const byRouteOrder = chapterRefs.find(
    (item: any) => toNum(item.order, 0) === order,
  );
  const targetChapter =
    byChapterId ??
    byRouteOrder ??
    chapterRefs.find((item: any) => toNum(item.order, 0) > 0) ??
    chapterRefs[0];
  const chapterOrder = toNum(
    targetChapter?.order,
    toNum(chapterIdInput, order),
  );
  if (chapterOrder <= 0) {
    throw new Error("chapterId 不能为空");
  }

  const chapterBundle = await getChapter({
    comicId,
    chapterId: chapterOrder,
    extern: payload.extern,
  });
  const chapterData =
    (chapterBundle as any)?.data?.chapter ??
    (chapterBundle as any)?.chapter ??
    {};
  const pages = (Array.isArray(chapterData?.docs) ? chapterData.docs : []).map(
    (doc: any) => ({
      id: String(doc?.id ?? ""),
      name: String(doc?.name ?? doc?.originalName ?? ""),
      path: String(doc?.path ?? ""),
      url: String(doc?.url ?? doc?.fileServer ?? ""),
      extern: {},
    }),
  );

  const comicInfo = normal?.comicInfo ?? {};

  return {
    source: BIKA_PLUGIN_ID,
    extern: payload.extern ?? null,
    data: {
      comic: {
        id: String(comicInfo?.id ?? comicId),
        source: BIKA_PLUGIN_ID,
        title: String(comicInfo?.title ?? ""),
        description: String(comicInfo?.description ?? ""),
        cover: {
          ...(comicInfo?.cover ?? {}),
          extern: toStringMap(comicInfo?.cover?.extension),
        },
        creator: {
          ...(comicInfo?.creator ?? {}),
          avatar: {
            ...(comicInfo?.creator?.avatar ?? {}),
            extern: toStringMap(comicInfo?.creator?.avatar?.extension),
          },
          extern: toStringMap(comicInfo?.creator?.extension),
        },
        titleMeta: (Array.isArray(comicInfo?.titleMeta)
          ? comicInfo.titleMeta
          : []
        ).map((item: any) => ({
          name: String(item?.name ?? ""),
          onTap: toStringMap(item?.onTap),
          extern: toStringMap(item?.extension),
        })),
        metadata: (Array.isArray(comicInfo?.metadata)
          ? comicInfo.metadata
          : []
        ).map((meta: any) => ({
          type: String(meta?.type ?? ""),
          name: String(meta?.name ?? ""),
          value: (Array.isArray(meta?.value) ? meta.value : []).map(
            (item: any) => ({
              name: String(item?.name ?? ""),
              onTap: toStringMap(item?.onTap),
              extern: toStringMap(item?.extension),
            }),
          ),
        })),
        extern: toStringMap(comicInfo?.extension),
      },
      chapter: {
        id: String(chapterData?.epId ?? targetChapter?.id ?? ""),
        name: String(chapterData?.epName ?? targetChapter?.name ?? ""),
        order: toNum(targetChapter?.order, chapterOrder),
        pages,
        extern: {},
      },
      chapters: chapterRefs,
    },
  };
}

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
}

async function bikaRequest(payload: BikaRequestPayload = { url: "" }) {
  const resolvedPayload: BikaRequestPayload = {
    ...payload,
  };
  const method = toUpperMethod(resolvedPayload.method);
  const useCache = Boolean(resolvedPayload.cache && method === "GET");
  const cacheKey = buildCacheKey(resolvedPayload, method);

  if (useCache) {
    const cachedData = readCache(cacheKey);
    if (cachedData !== undefined) {
      return cachedData;
    }
  }

  const requestConfig: any = {
    url: resolvedPayload.url,
    method,
    __bikaPayload: resolvedPayload,
    __useCache: useCache,
    __cacheKey: cacheKey,
  };

  if (method !== "GET" && method !== "HEAD") {
    const requestBody =
      resolvedPayload.body == null ? {} : resolvedPayload.body;
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

async function getInfo() {
  return buildManifestInfo();
}

export default {
  init,
  bikaRequest,
  getComicDetail,
  getSettingsBundle,
  getUserInfoBundle,
  updateProfile,
  updatePassword,
  getLoginBundle,
  loginWithPassword,
  getCapabilitiesBundle,
  getComicListSceneBundle,
  getRankingFilterBundle,
  getAdvancedSearchScheme,
  get_advanced_search_scheme,
  clearPluginSession,
  dumpRuntimeInfo,
  getHomeData,
  getFavoriteData,
  toggleLike,
  getCommentFeed,
  loadCommentReplies,
  postComment,
  postCommentReply,
  toggleFavorite,
  listFavoriteFolders,
  moveFavoriteToFolder,
  getCloudFavoriteFilterBundle,
  getCloudFavoriteSceneBundle,
  get_cloud_favorite_scene_bundle,
  getRankingData,
  searchComic,
  getChapter,
  getReadSnapshot,
  fetchImageBytes,
  getFunctionPage,
  getInfo,
};
