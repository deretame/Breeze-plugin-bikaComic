export type BikaRequestPayload = {
  url: string;
  method?: string;
  body?: unknown;
  cache?: boolean;
  imageQuality?: string;
};

export type ComicDetailPayload = {
  comicId?: string;
  extern?: Record<string, unknown>;
};

export type BikaSearchPayload = {
  keyword?: string;
  page?: number;
  extern?: Record<string, unknown>;
};

export type BikaChapterPayload = {
  comicId?: string;
  chapterId?: number | string;
  extern?: Record<string, unknown>;
};

export type BikaReadSnapshotPayload = {
  comicId?: string;
  chapterId?: number | string;
  extern?: Record<string, unknown>;
};

export type BikaHomePayload = {
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

export type BikaRankingPayload = {
  days?: string;
  type?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

export type RankingFilterOption = {
  label: string;
  value: string;
  result: Record<string, unknown>;
};

export type BikaLoginPayload = {
  account?: string;
  password?: string;
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

export type BikaFavoritePayload = {
  page?: number;
  extern?: Record<string, unknown>;
  imageQuality?: string;
};

export type BikaLikePayload = {
  comicId?: string;
  currentLiked?: boolean;
  extern?: Record<string, unknown>;
};

export type BikaToggleFavoritePayload = {
  comicId?: string;
  currentFavorite?: boolean;
  extern?: Record<string, unknown>;
};

export type BikaFavoriteFolderPayload = {
  comicId?: string;
  folderId?: string;
  folderName?: string;
  extern?: Record<string, unknown>;
};

export type BikaCommentFeedPayload = {
  comicId?: string;
  page?: number;
  commentId?: string;
  content?: string;
  extern?: Record<string, unknown>;
};
