import { BIKA_PLUGIN_ID } from "./info";
import type { BikaRequestPayload, RankingFilterOption } from "./bika-types";
import { sanitizePath, toBool, toNum, toStrList } from "./bika-utils";
import { savePluginSetting } from "./plugin-config";

export type BikaRequestFn = (payload: BikaRequestPayload) => Promise<unknown>;
export type BuildBikaImageUrlFn = (
  fileServer: unknown,
  pathValue: unknown,
  pictureType?: "cover" | "creator" | "favourite" | "comic" | "else",
) => Promise<string>;
export type LoadPluginSettingFn = (
  key: string,
  fallback: unknown,
) => Promise<unknown>;

export type ComicHandlerDeps = {
  bikaRequest: BikaRequestFn;
  buildBikaImageUrl: BuildBikaImageUrlFn;
  loadPluginSetting: LoadPluginSettingFn;
};

export type ComicRuntimeState = {
  runtimeSelectedCategories: string[];
};

export function createComicRuntimeState(): ComicRuntimeState {
  return {
    runtimeSelectedCategories: [],
  };
}

export function createComicHelpers(
  deps: ComicHandlerDeps,
  state: ComicRuntimeState,
) {
  const { buildBikaImageUrl, loadPluginSetting } = deps;

  function setRuntimeSelectedCategories(values: string[]) {
    state.runtimeSelectedCategories = values;
  }

  function getRuntimeSelectedCategories() {
    return state.runtimeSelectedCategories;
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
    const list = Array.isArray(values)
      ? values
      : values == null
        ? []
        : [values];
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
      ...(typeof payload.creatorId === "string" &&
      payload.creatorId.trim().length
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
    return {
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
        core: { days: "H24", type: "comic" },
        params: { bodyType: "pluginPagedComicList" },
      }),
      createChoiceOption("周榜", "week", {
        core: { days: "D7", type: "comic" },
        params: { bodyType: "pluginPagedComicList" },
      }),
      createChoiceOption("月榜", "month", {
        core: { days: "D30", type: "comic" },
        params: { bodyType: "pluginPagedComicList" },
      }),
    ];
  }

  function buildHomeAction(category: any, authorization = "") {
    const title = String(category?.title ?? "");
    if (title === "最近更新") {
      return {
        type: "openSearch",
        payload: { source: BIKA_PLUGIN_ID },
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
        payload: { title, url },
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
    const map =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
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
    await savePluginSetting("search.blockedCategories", values);
  }

  return {
    setRuntimeSelectedCategories,
    getRuntimeSelectedCategories,
    createActionItem,
    createMetadataActionList,
    createImage,
    openSearchAction,
    toComicListItem,
    toCreatorListItem,
    ensureBikaComicShape,
    toSortKeyword,
    getBikaRankingOptions,
    buildHomeAction,
    toHomeChip,
    toActionItem,
    boolKeyList,
    toBoolMap,
    loadBlockedCategories,
    saveBlockedCategories,
  };
}

export type ComicHelpers = ReturnType<typeof createComicHelpers>;
