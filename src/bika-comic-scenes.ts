import { BIKA_SEARCH_CATEGORY_OPTIONS } from "./bika-constants";
import { BIKA_PLUGIN_ID } from "./info";
import type { ComicHelpers } from "./bika-comic-shared";
import { toNum, toStringMap } from "./bika-utils";

type ComicSceneHandlersDeps = {
  helpers: ComicHelpers;
};

export function createComicSceneHandlers({ helpers }: ComicSceneHandlersDeps) {
  const {
    getBikaRankingOptions,
    loadBlockedCategories,
    boolKeyList,
    getRuntimeSelectedCategories,
  } = helpers;

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
    const categories = BIKA_SEARCH_CATEGORY_OPTIONS;

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
              : getRuntimeSelectedCategories(),
          blockedCategories:
            selectedBlocked.length > 0 ? selectedBlocked : blockedCategories,
        },
      },
    };
  }

  async function get_advanced_search_scheme() {
    return getAdvancedSearchScheme();
  }

  return {
    getCloudFavoriteFilterBundle,
    getCloudFavoriteSceneBundle,
    get_cloud_favorite_scene_bundle,
    getComicListSceneBundle,
    getRankingFilterBundle,
    getAdvancedSearchScheme,
    get_advanced_search_scheme,
  };
}
