import { toComicListItem, toCreatorListItem } from "./bika-comic-shared";
import { bikaRequest } from "./bika-request";
import type { BikaRankingPayload } from "./bika-types";
import { getApiBase } from "./client";
import { BIKA_PLUGIN_ID } from "./info";

export async function getRankingData(payload: BikaRankingPayload = {}) {
  const apiBase = await getApiBase();
  const days = String(payload.days ?? "H24");
  const type = String(payload.type ?? "comic");
  let url = "";

  if (type === "creator") {
    url = `${apiBase}comics/knight-leaderboard`;
  } else {
    url = `${apiBase}comics/leaderboard?tt=${days}&ct=VC`;
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
