import { useMemo } from "react";
import type { PlacedJewelry } from "../../data/studioEditor";
import { projectPlacementView } from "../../lib/studio3d/renderView";
import type { FrontViewProjection } from "../../lib/studio3d/frontView";
import type { SceneModel } from "../../lib/studioWorkspace/scene";

/** The front view's drawing of `pieces` (`projectPlacementView`), kept while they and the model do not change. */
export function useFrontView(pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  return useMemo(() => projectPlacementView(pieces, model), [pieces, model]);
}
