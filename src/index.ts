import {
  getChapter,
  getComicDetail,
  getReadSnapshot,
} from "./bika-comic-detail";
import {
  getFavoriteData,
  getFunctionPage,
  getHomeData,
  listFavoriteFolders,
  moveFavoriteToFolder,
  searchComic,
  toggleFavorite,
  toggleLike,
} from "./bika-comic-library";
import { getRankingData } from "./bika-comic-ranking";
import {
  getAdvancedSearchScheme,
  getCloudFavoriteFilterBundle,
  getCloudFavoriteSceneBundle,
  getComicListSceneBundle,
  getRankingFilterBundle,
} from "./bika-comic-scenes";
import {
  getCommentFeed,
  loadCommentReplies,
  postComment,
  postCommentReply,
} from "./bika-comments";
import { bikaRequest, fetchImageBytes } from "./bika-request";
import {
  clearPluginSession,
  dumpRuntimeInfo,
  getCapabilitiesBundle,
  getLoginBundle,
  getSettingsBundle,
  getUserInfoBundle,
  init,
  loginWithPassword,
  saveSettings,
  updatePassword,
  updateProfile,
} from "./bika-settings";
import { setUnauthorizedSchemeProvider } from "./client";
import { buildManifestInfo } from "./info";

export { BIKA_PLUGIN_ID } from "./info";

setUnauthorizedSchemeProvider(async () => {
  const bundle = await getLoginBundle();
  return bundle as Record<string, unknown>;
});

async function getInfo() {
  return buildManifestInfo();
}

export default {
  init,
  bikaRequest,
  getComicDetail,
  getSettingsBundle,
  saveSettings,
  getUserInfoBundle,
  updateProfile,
  updatePassword,
  getLoginBundle,
  loginWithPassword,
  getCapabilitiesBundle,
  getComicListSceneBundle,
  getRankingFilterBundle,
  getAdvancedSearchScheme,
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
  getRankingData,
  searchComic,
  getChapter,
  getReadSnapshot,
  fetchImageBytes,
  getFunctionPage,
  getInfo,
};
