import type {
  GetPluginCloudFavoritePagesBundlePayload,
  GetPluginHomePagesBundlePayload,
  PluginCloudFavoritePagesBundleContract,
  PluginHomePagesBundleContract,
  PluginHomeTab,
} from "breeze-plugin-kit";
import { BIKA_PLUGIN_ID, buildCloudFavoriteScene, buildRankingScene } from "./info";
import { getFunctionPage } from "./bika-comic-library";

/**
 * 插件通用首页 / 云端收藏 bundle。
 * 入参空参 `core: {} + extern: {source}`；tab 内 scene/page 复用现有 builder。
 * header.actions 只引用 getInfo functions 已定义功能。
 */

function externOf(payload: GetPluginHomePagesBundlePayload = {}): Record<string, unknown> {
  return {
    ...payload.extern,
    source: BIKA_PLUGIN_ID,
  };
}

export async function getPluginHomePagesBundle(
  payload: GetPluginHomePagesBundlePayload = {},
): Promise<PluginHomePagesBundleContract> {
  const extern = externOf(payload);
  const [hotSearch, navigation] = await Promise.all([
    getFunctionPage({ core: {}, extern: { ...extern, id: "hotSearch" } }),
    getFunctionPage({ core: {}, extern: { ...extern, id: "navigation" } }),
  ]);
  const rankingScene = buildRankingScene();
  const tabs: PluginHomeTab[] = [
    { id: "hotSearch", title: "热搜", page: hotSearch },
    { id: "navigation", title: "导航", page: navigation },
    { id: "ranking", title: "排行榜", scene: rankingScene },
  ];
  return {
    source: BIKA_PLUGIN_ID,
    scheme: { version: "1.0.0", type: "homePagesBundle" },
    data: { tabs },
  };
}

export async function getPluginCloudFavoritePagesBundle(
  _payload: GetPluginCloudFavoritePagesBundlePayload = {},
): Promise<PluginCloudFavoritePagesBundleContract> {
  const cloudFavoriteScene = buildCloudFavoriteScene();
  return {
    source: BIKA_PLUGIN_ID,
    scheme: { version: "1.0.0", type: "cloudFavoritePagesBundle" },
    data: {
      tabs: [
        {
          id: "cloudFavorite",
          title: "云端收藏",
          scene: cloudFavoriteScene,
        },
      ],
    },
  };
}
