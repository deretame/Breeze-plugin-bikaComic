import { BIKA_PLUGIN_ID } from "./info";
import type {
  BikaChapterPayload,
  BikaReadSnapshotPayload,
  ComicDetailPayload,
} from "./bika-types";
import type { ComicHandlerDeps, ComicHelpers } from "./bika-comic-shared";
import { toBool, toNum, toStringMap } from "./bika-utils";

type ComicDetailHandlersDeps = {
  deps: ComicHandlerDeps;
  helpers: ComicHelpers;
};

export function createComicDetailHandlers({
  deps,
  helpers,
}: ComicDetailHandlersDeps) {
  const { bikaRequest, buildBikaImageUrl, loadPluginSetting } = deps;
  const {
    createActionItem,
    createMetadataActionList,
    createImage,
    openSearchAction,
    toComicListItem,
    ensureBikaComicShape,
  } = helpers;

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
            path: String(item?.thumb?.path ?? "").replace(/[^a-zA-Z0-9_\-.]/g, "_"),
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
            path: String(comic._creator?.avatar?.path ?? "").replace(
              /[^a-zA-Z0-9_\-.]/g,
              "_",
            ),
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
          path: String(comic.thumb?.path ?? "").replace(/[^a-zA-Z0-9_\-.]/g, "_"),
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

  async function getChapter(payload: BikaChapterPayload = {}) {
    const proxy = await loadPluginSetting("network.proxy", "3");
    void proxy;
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
    void readSettings;

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

  return {
    getComicDetail,
    getChapter,
    getReadSnapshot,
  };
}
