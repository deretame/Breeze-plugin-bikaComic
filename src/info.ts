export const BIKA_PLUGIN_ID = "0a0e5858-a467-4702-994a-79e608a4589d";

export function buildRankingScene() {
  return {
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
  };
}

export function buildCloudFavoriteScene() {
  return {
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
  };
}

export function buildManifestInfo() {
  return {
    name: "哔咔漫画",
    uuid: BIKA_PLUGIN_ID,
    iconUrl:
      "https://raw.githubusercontent.com/deretame/Breeze-plugin-bikaComic/main/assets/logo_round.png",
    creator: {
      name: "",
      describe: "",
    },
    describe: "哔咔漫画插件",
    version: "0.0.1",
    updateUrl: "",
    home: "",
    function: [
      {
        id: "hotSearch",
        title: "热搜",
        action: {
          type: "openPluginFunction",
          payload: {
            id: "hotSearch",
            title: "热搜",
            presentation: "dialog",
          },
        },
      },
      {
        id: "navigation",
        title: "导航",
        action: {
          type: "openPluginFunction",
          payload: {
            id: "navigation",
            title: "导航",
            presentation: "page",
          },
        },
      },
      {
        id: "ranking",
        title: "排行榜",
        action: {
          type: "openComicList",
          payload: {
            scene: buildRankingScene(),
          },
        },
      },
      {
        id: "cloudFavorite",
        title: "云端收藏",
        action: {
          type: "openCloudFavorite",
          payload: {
            title: "云端收藏",
          },
        },
      },
    ],
  };
}
