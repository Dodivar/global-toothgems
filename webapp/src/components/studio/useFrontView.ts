import { useMemo } from "react";
import type { PlacedJewelry } from "../../data/studioEditor";
import { projectFrontView, type FrontViewProjection } from "../../lib/studio3d/frontView";
import type { SceneModel } from "../../lib/studioWorkspace/scene";

/** The front-view projection of `pieces` (`projectFrontView`), kept while they and the model do not change. */
export function useFrontView(pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  return useMemo(() => projectFrontView(pieces, model), [pieces, model]);
}
