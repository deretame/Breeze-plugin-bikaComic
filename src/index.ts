import { setUnauthorizedSchemeProvider } from "./client";
import { createCommentHandlers } from "./bika-comments";
import { createComicHandlers } from "./bika-comic";
import { createBikaImageUrlBuilder } from "./bika-image";
import { bikaRequest, fetchImageBytes } from "./bika-request";
import { createSettingsHandlers, loadPluginSetting } from "./bika-settings";
import { BIKA_PLUGIN_ID, buildManifestInfo } from "./info";

export { BIKA_PLUGIN_ID } from "./info";

const buildBikaImageUrl = createBikaImageUrlBuilder(loadPluginSetting);

const settingsHandlers = createSettingsHandlers({
  bikaRequest,
  buildBikaImageUrl,
  loadPluginSetting,
});

const commentHandlers = createCommentHandlers({
  bikaRequest,
  buildBikaImageUrl,
});

const comicHandlers = createComicHandlers({
  bikaRequest,
  buildBikaImageUrl,
  loadPluginSetting,
});

setUnauthorizedSchemeProvider(async () => {
  const bundle = await settingsHandlers.getLoginBundle();
  return bundle as Record<string, unknown>;
});

async function getInfo() {
  return buildManifestInfo();
}

export default {
  init: settingsHandlers.init,
  bikaRequest,
  getComicDetail: comicHandlers.getComicDetail,
  getSettingsBundle: settingsHandlers.getSettingsBundle,
  getUserInfoBundle: settingsHandlers.getUserInfoBundle,
  updateProfile: settingsHandlers.updateProfile,
  updatePassword: settingsHandlers.updatePassword,
  getLoginBundle: settingsHandlers.getLoginBundle,
  loginWithPassword: settingsHandlers.loginWithPassword,
  getCapabilitiesBundle: settingsHandlers.getCapabilitiesBundle,
  getComicListSceneBundle: comicHandlers.getComicListSceneBundle,
  getRankingFilterBundle: comicHandlers.getRankingFilterBundle,
  getAdvancedSearchScheme: comicHandlers.getAdvancedSearchScheme,
  get_advanced_search_scheme: comicHandlers.get_advanced_search_scheme,
  clearPluginSession: settingsHandlers.clearPluginSession,
  dumpRuntimeInfo: settingsHandlers.dumpRuntimeInfo,
  getHomeData: comicHandlers.getHomeData,
  getFavoriteData: comicHandlers.getFavoriteData,
  toggleLike: comicHandlers.toggleLike,
  getCommentFeed: commentHandlers.getCommentFeed,
  loadCommentReplies: commentHandlers.loadCommentReplies,
  postComment: commentHandlers.postComment,
  postCommentReply: commentHandlers.postCommentReply,
  toggleFavorite: comicHandlers.toggleFavorite,
  listFavoriteFolders: comicHandlers.listFavoriteFolders,
  moveFavoriteToFolder: comicHandlers.moveFavoriteToFolder,
  getCloudFavoriteFilterBundle: comicHandlers.getCloudFavoriteFilterBundle,
  getCloudFavoriteSceneBundle: comicHandlers.getCloudFavoriteSceneBundle,
  get_cloud_favorite_scene_bundle:
    comicHandlers.get_cloud_favorite_scene_bundle,
  getRankingData: comicHandlers.getRankingData,
  searchComic: comicHandlers.searchComic,
  getChapter: comicHandlers.getChapter,
  getReadSnapshot: comicHandlers.getReadSnapshot,
  fetchImageBytes,
  getFunctionPage: comicHandlers.getFunctionPage,
  getInfo,
};
