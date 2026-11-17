import { useMemo } from "react";
import type { PlacedJewelry } from "../../data/studioEditor";
import { projectFlatView } from "../../lib/studio3d/flatView";
import type { FrontViewProjection } from "../../lib/studio3d/frontView";
import type { SceneModel } from "../../lib/studioWorkspace/scene";

/** The front view's drawing of `pieces` (`projectFlatView`), kept while they and the model do not change. */
export function useFrontView(pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  return useMemo(() => projectFlatView(pieces, model), [pieces, model]);
}
