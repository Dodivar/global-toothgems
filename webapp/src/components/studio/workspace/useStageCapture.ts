import { useEffect, useState } from "react";
import { getEngine, type StudioEngine } from "../../../lib/studio3d/engine";

/**
 * The card render a save dialog shows, captured once from the stage when the
 * dialog opens, so what the member sees before saving is the image the card
 * will keep. `undefined` while it is being taken (the save then captures for
 * itself), `null` when there is no stage or the capture failed (the dialog
 * keeps the drawn preview). Pass `null` as `capture` to skip it.
 */
export function useStageCapture(capture: ((engine: StudioEngine) => Promise<string>) | null): string | null | undefined {
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const enabled = capture !== null;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const engine = getEngine();
    if (!engine) {
      setImage(null);
      return;
    }
    capture!(engine)
      .catch(() => null)
      .then((url) => {
        if (live) setImage(url);
      });
    return () => {
      live = false;
    };
    // Captured once, when the dialog opens: the stage does not change behind a modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return enabled ? image : null;
}
