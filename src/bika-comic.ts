import { createComicDetailHandlers } from "./bika-comic-detail";
import { createComicLibraryHandlers } from "./bika-comic-library";
import { createComicRankingHandlers } from "./bika-comic-ranking";
import {
  createComicHelpers,
  createComicRuntimeState,
  type ComicHandlerDeps,
} from "./bika-comic-shared";
import { createComicSceneHandlers } from "./bika-comic-scenes";

export function createComicHandlers(deps: ComicHandlerDeps) {
  const state = createComicRuntimeState();
  const helpers = createComicHelpers(deps, state);

  const detailHandlers = createComicDetailHandlers({
    deps,
    helpers,
  });
  const libraryHandlers = createComicLibraryHandlers({
    deps,
    helpers,
  });
  const sceneHandlers = createComicSceneHandlers({
    helpers,
  });
  const rankingHandlers = createComicRankingHandlers({
    deps,
    helpers,
  });

  return {
    ...detailHandlers,
    ...libraryHandlers,
    ...sceneHandlers,
    ...rankingHandlers,
  };
}
