import { BIKA_PLUGIN_ID } from "./info";
import type { BikaRankingPayload } from "./bika-types";
import type { ComicHandlerDeps, ComicHelpers } from "./bika-comic-shared";

type ComicRankingHandlersDeps = {
  deps: ComicHandlerDeps;
  helpers: ComicHelpers;
};

export function createComicRankingHandlers({
  deps,
  helpers,
}: ComicRankingHandlersDeps) {
  const { bikaRequest } = deps;
  const { toComicListItem, toCreatorListItem } = helpers;

  async function getRankingData(payload: BikaRankingPayload = {}) {
    const days = String(payload.days ?? "H24");
    const type = String(payload.type ?? "comic");
    let url = "";

    if (type === "creator") {
      url = "https://picaapi.picacomic.com/comics/knight-leaderboard";
    } else {
      url = `https://picaapi.picacomic.com/comics/leaderboard?tt=${days}&ct=VC`;
    }

    const raw = await bikaRequest({
      url,
      method: "GET",
      cache: true,
    });

    const items = await Promise.all(
      type === "creator"
        ? (Array.isArray((raw as any)?.data?.users)
            ? (raw as any).data.users
            : []
          ).map(async (item: any) => await toCreatorListItem(item))
        : (Array.isArray((raw as any)?.data?.comics)
            ? (raw as any).data.comics
            : []
          ).map(async (item: any) => await toComicListItem(item)),
    );

    return {
      source: BIKA_PLUGIN_ID,
      extern: payload.extern ?? null,
      scheme: {
        version: "1.0.0",
        type: "rankingFeed",
        card: type === "creator" ? "creator" : "comic",
      },
      data: {
        days,
        rankingType: type,
        hasReachedMax: true,
        items,
        raw,
      },
    };
  }

  return {
    getRankingData,
  };
}
