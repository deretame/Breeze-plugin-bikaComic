import { buildBikaImageUrl } from "./bika-image";
import { bikaRequest } from "./bika-request";
import type { BikaCommentFeedPayload } from "./bika-types";
import {
  formatDisplayTime,
  sanitizePath,
  stripHtmlTags,
  toNum,
} from "./bika-utils";
import { getApiBase } from "./client";
import { BIKA_PLUGIN_ID } from "./info";

export async function mapBikaCommentItem(item: any) {
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

export async function getCommentFeed(payload: BikaCommentFeedPayload = {}) {
  const apiBase = await getApiBase();
  const comicId = String(payload.comicId ?? "").trim();
  const page = Math.max(1, toNum(payload.page, 1));
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  const raw = (await bikaRequest({
    url: `${apiBase}comics/${comicId}/comments?page=${page}`,
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

export async function loadCommentReplies(payload: BikaCommentFeedPayload = {}) {
  const apiBase = await getApiBase();
  const commentId = String(
    payload.commentId ?? payload.extern?.commentId ?? "",
  ).trim();
  const page = Math.max(1, toNum(payload.page, 1));
  if (!commentId) {
    throw new Error("commentId 不能为空");
  }

  const raw = (await bikaRequest({
    url: `${apiBase}comments/${commentId}/childrens?page=${page}`,
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

export async function postComment(payload: BikaCommentFeedPayload = {}) {
  const apiBase = await getApiBase();
  const comicId = String(payload.comicId ?? "").trim();
  const content = String(payload.content ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  if (!content) {
    throw new Error("content 不能为空");
  }

  const raw = (await bikaRequest({
    url: `${apiBase}comics/${comicId}/comments`,
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

export async function postCommentReply(payload: BikaCommentFeedPayload = {}) {
  const apiBase = await getApiBase();
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
    url: `${apiBase}comments/${commentId}`,
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
