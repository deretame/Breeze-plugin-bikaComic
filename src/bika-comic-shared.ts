import { buildBikaImageUrl } from "./bika-image";
import type { RankingFilterOption } from "./bika-types";
import { sanitizePath, toBool, toNum, toStrList } from "./bika-utils";
import { getApiBase } from "./client";
import { BIKA_PLUGIN_ID } from "./info";
import { loadPluginSetting, savePluginSetting } from "./plugin-config";
import type {
  ActionItem,
  ComicListItem,
  FunctionPageActionGridItem,
  FunctionPageChipItem,
  ImageItem,
  MetadataListItem,
  StringMap,
} from "../types/type";

export const runtimeSelectedCategories: string[] = [];

export function setRuntimeSelectedCategories(values: string[]) {
  runtimeSelectedCategories.splice(
    0,
    runtimeSelectedCategories.length,
    ...values,
  );
}

export function getRuntimeSelectedCategories() {
  return runtimeSelectedCategories;
}

function buildMetadata(
  type: string,
  name: string,
  value: unknown,
): MetadataListItem | null {
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
    value: normalized.map((item) => ({ name: item, onTap: {}, extern: {} })),
  };
}

export function createActionItem(
  name: unknown,
  onTap: Record<string, unknown> = {},
  extern: Record<string, unknown> = {},
): ActionItem {
  return {
    name: String(name ?? ""),
    onTap: onTap as StringMap,
    extern: extern as StringMap,
  };
}

export function createMetadataActionList(
  type: string,
  name: string,
  values: unknown,
  mapItem?: (value: string) => ActionItem,
): MetadataListItem | null {
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

export function createImage(input: {
  id: unknown;
  url: unknown;
  name?: unknown;
  path?: unknown;
  extern?: Record<string, unknown>;
}): ImageItem {
  return {
    id: String(input.id ?? ""),
    url: String(input.url ?? ""),
    name: String(input.name ?? ""),
    path: String(input.path ?? ""),
    extern: (input.extern ?? {}) as StringMap,
  };
}

export function openSearchAction(payload: Record<string, unknown>) {
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
    ...(keyword ? { keyword } : {}),
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

export async function toComicListItem(
  comic: any,
  options: {
    pictureType?: "cover" | "creator" | "favourite" | "comic";
  } = {},
): Promise<ComicListItem> {
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
      extern: {},
    },
    metadata: [
      buildMetadata("author", "作者", comic?.author),
      buildMetadata("team", "汉化组", comic?.chineseTeam),
      buildMetadata("categories", "分类", comic?.categories),
      buildMetadata("tags", "标签", comic?.tags),
    ].filter((item): item is MetadataListItem => item != null),
    raw: comic as StringMap,
    extern: {},
  };
}

export async function toCreatorListItem(user: any) {
  const apiBase = await getApiBase();
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
      extern: {},
    },
    metadata: [] as ActionItem[],
    stats: [
      `等级：${toNum(user?.level)}`,
      `总上传数：${toNum(user?.comicsUploaded)}`,
    ],
    onTap: openSearchAction({
      source: BIKA_PLUGIN_ID,
      keyword: String(user?.name ?? ""),
      extern: {
        url: `${apiBase}comics?ca=${id}&s=ld&page=1`,
      },
    }),
    raw: user as StringMap,
    extern: {},
  };
}

export function ensureBikaComicShape(comic: Record<string, any>) {
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

export function toSortKeyword(sortBy: unknown): string {
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

export function getBikaRankingOptions(): RankingFilterOption[] {
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

export async function buildHomeAction(category: any, authorization = "") {
  const apiBase = await getApiBase();
  const title = String(category?.title ?? "");
  if (title === "最近更新") {
    return openSearchAction({
      source: BIKA_PLUGIN_ID,
    });
  }
  if (title === "随机本子") {
    return openSearchAction({
      source: BIKA_PLUGIN_ID,
      url: `${apiBase}comics/random`,
    });
  }
  if (title === "大家都在看") {
    return openSearchAction({
      source: BIKA_PLUGIN_ID,
      url: `${apiBase}comics?page=1&c=%E5%A4%A7%E5%AE%B6%E9%83%BD%E5%9C%A8%E7%9C%8B&s=dd`,
    });
  }
  if (title === "大濕推薦") {
    return openSearchAction({
      source: BIKA_PLUGIN_ID,
      url: `${apiBase}comics?page=1&c=%E5%A4%A7%E6%BF%95%E6%8E%A8%E8%96%A6&s=dd`,
    });
  }
  if (title === "那年今天") {
    return openSearchAction({
      source: BIKA_PLUGIN_ID,
      url: `${apiBase}comics?page=1&c=%E9%82%A3%E5%B9%B4%E4%BB%8A%E5%A4%A9&s=dd`,
    });
  }
  if (title === "官方都在看") {
    return openSearchAction({
      source: BIKA_PLUGIN_ID,
      url: `${apiBase}comics?page=1&c=%E5%AE%98%E6%96%B9%E9%83%BD%E5%9C%A8%E7%9C%8B&s=dd`,
    });
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
  return openSearchAction({
    source: BIKA_PLUGIN_ID,
    categories: [title],
  });
}

export function toHomeChip(label: unknown): FunctionPageChipItem {
  const text = String(label ?? "").trim();
  return {
    label: text,
    action: openSearchAction({
      source: BIKA_PLUGIN_ID,
      keyword: text,
    }),
  };
}

export function toActionItem(input: {
  title: string;
  coverUrl?: string;
  coverPath?: string;
  action: Record<string, unknown>;
}): FunctionPageActionGridItem {
  return {
    title: input.title,
    cover: {
      url: String(input.coverUrl ?? ""),
      path: String(input.coverPath ?? ""),
      extern: {},
    },
    action: input.action as StringMap,
  };
}

export function boolKeyList(value: unknown): string[] {
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

export function toBoolMap(values: string[]): Record<string, boolean> {
  return values.reduce<Record<string, boolean>>((acc, item) => {
    if (item.trim()) {
      acc[item] = true;
    }
    return acc;
  }, {});
}

export async function loadBlockedCategories(): Promise<string[]> {
  const value = await loadPluginSetting("search.blockedCategories", []);
  return toStrList(value);
}

export async function saveBlockedCategories(values: string[]) {
  await savePluginSetting("search.blockedCategories", values);
}
