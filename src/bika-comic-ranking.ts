import type { ComicPagedListContract, StringMap } from "breeze-plugin-kit";
import { toComicListItem, toCreatorListItem } from "./bika-comic-shared";
import { bikaRequest } from "./bika-request";
import type { BikaRankingPayload } from "./bika-types";
import { toStringMap } from "./bika-utils";
import { getApiBase } from "./client";
import { BIKA_PLUGIN_ID } from "./info";

export async function getRankingData(
  payload: BikaRankingPayload = {},
): Promise<ComicPagedListContract> {
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

  const rawData = toStringMap(toStringMap(raw).data);
  const items = await Promise.all(
    type === "creator"
      ? (Array.isArray(rawData.users) ? rawData.users : [])
          .filter(
            (item): item is StringMap => !!item && typeof item === "object" && !Array.isArray(item),
          )
          .map(async (item: StringMap) => await toCreatorListItem(item))
      : (Array.isArray(rawData.comics) ? rawData.comics : [])
          .filter(
            (item): item is StringMap => !!item && typeof item === "object" && !Array.isArray(item),
          )
          .map(async (item: StringMap) => await toComicListItem(item)),
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
  } as ComicPagedListContract;
}
