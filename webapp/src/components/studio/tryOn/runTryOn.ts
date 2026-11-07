import {
  type PhotoIssue,
  type SmileTryOnService,
  type TryOnAnalysis,
  type TryOnAudience,
  type TryOnCreation,
  type TryOnErrorCode,
  type TryOnSource,
  type TryOnStage,
} from "../../../lib/studio3d/tryOn";
import { projectFrontView } from "../../../lib/studio3d/frontView";
import { placementProps, resultProps } from "../../../lib/studio3d/tryOnAnalytics";
import { guideMarks } from "../../../lib/studio3d/tryOnGuide";
import { registerDesign } from "../../../lib/studio3d/tryOnRegistration";
import { trackStudio } from "../../../lib/studioAnalytics";
import { renderDesignImage } from "./designImage";
import { pasteBack } from "./pasteBack";
import { renderPlacementGuide } from "./placementGuide";

export type TryOnRunOutcome =
  | { kind: "result"; image: Blob; leftOut: number }
  | { kind: "error"; code: TryOnErrorCode; reasons?: PhotoIssue[]; stage: TryOnStage }
  | { kind: "aborted" };

/**
 * One try-on run (decision 111 (k)): the analysis (the function checks the
 * photo, cuts the mouth close-up and finds each tooth — skipped when an
 * earlier run of the same photo already did it), the placement here (each gem
 * on its tooth, drawn as a mark on the close-up), the render (the marks made
 * real) and the paste back into the photo. Owned by the job store
 * (`TryOnJobProvider`), not by the dialog, so closing the dialog does not stop
 * it. An aborted run resolves with `aborted` and reports nothing.
 */
export async function runTryOn(
  {
    service,
    creation,
    source,
    audience,
    photo,
    analysis: known,
  }: {
    service: SmileTryOnService;
    creation: TryOnCreation;
    source: TryOnSource;
    audience: TryOnAudience;
    photo: Blob;
    analysis?: TryOnAnalysis;
  },
  { signal, onStage, onAnalysed }: { signal: AbortSignal; onStage: (stage: TryOnStage) => void; onAnalysed: (analysis: TryOnAnalysis) => void },
): Promise<TryOnRunOutcome> {
  const aborted = () => signal.aborted;
  const context = { audience, source: source.kind };

  // 1. The analysis: the photo check, the close-up and its teeth.
  let analysis = known;
  if (!analysis) {
    onStage("checking");
    const analysed = await service.analyse({ photo, source }, { signal });
    if (aborted()) return { kind: "aborted" };
    if (!analysed.ok) {
      if (analysed.code === "photo_unsuitable") trackStudio("studio_try_on_photo_refused", { ...context, reasons: [...(analysed.reasons ?? [])] });
      return { kind: "error", code: analysed.code, reasons: analysed.reasons, stage: "checking" };
    }
    analysis = analysed.analysis;
    onAnalysed(analysis);
  }

  // 2. The placement: each gem on its tooth, drawn as a mark on the close-up.
  const { crop, teeth, centrals } = analysis;
  const registration = registerDesign(projectFrontView(creation.scene.pieces, creation.scene.model), teeth, { centrals });
  const { marks, leftOut } = guideMarks(registration, creation.scene.pieces);
  const usable = registration.reliable && marks.length > 0;
  trackStudio("studio_try_on_placement", {
    ...context,
    ...placementProps(registration, { marks: marks.length, leftOut }, centrals !== null),
    outcome: usable ? "render" : "uncertain",
  });
  if (!usable) return { kind: "error", code: "photo_unsuitable", reasons: ["placement_uncertain"], stage: "checking" };
  onStage("rendering");
  const [design, guide] = await Promise.all([renderDesignImage(creation), renderPlacementGuide(photo, crop, marks)]);
  if (aborted()) return { kind: "aborted" };
  if (!design || !guide) return { kind: "error", code: "failed", stage: "rendering" };

  // 3. The render: the marks made real, pasted back into the photo.
  const outcome = await service.render({ photo, source, design, guide, crop, marks: marks.length }, { signal });
  if (aborted()) return { kind: "aborted" };
  if (!outcome.ok) {
    trackStudio("studio_try_on_result", { ...context, outcome: outcome.code });
    return { kind: "error", code: outcome.code, reasons: outcome.reasons, stage: "rendering" };
  }
  // Only the gems are taken from the AI's answer (`tryOnGemBlend.ts`), else the whole close-up;
  // if the browser cannot draw it back into the photo, the close-up is shown alone.
  const pasted = await pasteBack(photo, outcome.image, outcome.crop ?? crop, marks);
  if (aborted()) return { kind: "aborted" };
  trackStudio("studio_try_on_result", { ...context, outcome: pasted ? "ok" : "close_up_only", ...resultProps(pasted?.checks ?? null, pasted?.masked ?? false) });
  return { kind: "result", image: pasted?.image ?? outcome.image, leftOut };
}
