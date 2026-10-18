import { useEffect, useRef, useState } from "react";
import { CircleAlert, ImageUp, LoaderCircle, ScanFace } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { ProgressBar } from "../../ui/ProgressBar";
import {
  TRY_ON_ERROR_MESSAGES,
  errorSuggestsNewPhoto,
  tryOnInputFromCreation,
  unavailableTryOnService,
  type SmileTryOnService,
  type TryOnErrorCode,
} from "../../../lib/studio3d/tryOn";
import { DEFAULT_TRANSFORM, overlayFromResult, type BoxPlacement, type OverlayTransform } from "../../../lib/studio3d/tryOnTransform";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { AdjustStep, type AdjustOrigin } from "./AdjustStep";
import type { TryOnGemRenderer } from "./gemOverlay";
import { frontViewGemRenderer } from "./frontViewGemRenderer";
import { PhotoStep } from "./PhotoStep";
import type { PreparedPhoto } from "./preparePhoto";

type Step =
  | { kind: "photo" }
  | { kind: "processing" }
  | { kind: "error"; code: Exclude<TryOnErrorCode, "not_available"> }
  | { kind: "adjust"; initial: OverlayTransform; placements: BoxPlacement[] | null; origin: AdjustOrigin };

const STEP_INDEX: Record<Step["kind"], number> = { photo: 0, processing: 1, error: 1, adjust: 2 };

/**
 * "Try on a photo": a saved creation on a photo of the client's smile.
 * Photo → automatic placement (not connected yet: `unavailableTryOnService`
 * says so and the artist places by hand) → adjust and export. The photo stays
 * in this tab; closing the dialog forgets it.
 *
 * `service` and `renderer` are the two plug points: the AI placement (behind
 * an Edge Function) and the gems' drawing (the Studio's front view).
 */
export function TryOnDialog({
  creation,
  onClose,
  service = unavailableTryOnService,
  renderer = frontViewGemRenderer,
}: {
  creation: Creation;
  onClose: () => void;
  service?: SmileTryOnService;
  renderer?: TryOnGemRenderer;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: "photo" });
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [consent, setConsent] = useState(false);
  const request = useRef<AbortController | null>(null);
  const photoUrl = useRef<string | null>(null);

  // Forget the photo when the dialog closes, and stop a placement still running.
  useEffect(
    () => () => {
      request.current?.abort();
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    },
    [],
  );

  const takePhoto = (next: PreparedPhoto) => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = next.url;
    setPhoto(next);
  };

  const placeByHand = (reason: "not_available" | "chosen") =>
    setStep({ kind: "adjust", initial: DEFAULT_TRANSFORM, placements: null, origin: { kind: "manual", reason } });

  const analyse = async () => {
    if (!photo) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStep({ kind: "processing" });
    const outcome = await service.placeCreation(
      { photo: photo.blob, photoWidth: photo.width, photoHeight: photo.height, creation: tryOnInputFromCreation(creation) },
      { signal: controller.signal },
    );
    if (controller.signal.aborted) return; // cancelled or closed: nothing to show
    request.current = null;
    if (!outcome.ok) {
      if (outcome.code === "not_available") placeByHand("not_available");
      else setStep({ kind: "error", code: outcome.code });
      return;
    }
    const mapped = overlayFromResult(outcome.result, photo.height / photo.width);
    if (!mapped) return setStep({ kind: "error", code: "failed" });
    setStep({
      kind: "adjust",
      initial: mapped.transform,
      placements: mapped.placements,
      origin: { kind: "automatic", confidence: outcome.result.confidence },
    });
  };

  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setStep({ kind: "photo" });
  };

  const empty = creation.scene.pieces.length === 0;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t("studio.tryOn.title")}
      description={t("studio.tryOn.subtitle", { name: creation.name })}
      icon={<ScanFace size={17} />}
      closeLabel={t("studio.workspace.close")}
    >
      {empty ? (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studio.tryOn.empty")}</p>
      ) : (
        <>
          <ProgressBar
            variant="steps"
            tone="ink"
            steps={[t("studio.tryOn.steps.photo"), t("studio.tryOn.steps.analysis"), t("studio.tryOn.steps.adjust")]}
            current={STEP_INDEX[step.kind]}
          />

          {step.kind === "photo" && (
            <PhotoStep photo={photo} onPhoto={takePhoto} consent={consent} onConsent={setConsent} onContinue={() => void analyse()} />
          )}

          {step.kind === "processing" && (
            <div className="grid justify-items-center gap-3 py-8 text-center">
              <LoaderCircle size={28} aria-hidden="true" className="text-[var(--gt-blue-700)] motion-safe:animate-spin" />
              <p role="status" className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t("studio.tryOn.processing.title")}
              </p>
              <p className="m-0 max-w-sm text-[12.5px] text-[var(--text-muted)]">{t("studio.tryOn.processing.body")}</p>
              <Button variant="outline" size="sm" onClick={cancel}>
                {t("studio.tryOn.processing.cancel")}
              </Button>
            </div>
          )}

          {step.kind === "error" && (
            <div role="alert" className="grid gap-3">
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-body-sm)]">
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />
                <span className="grid gap-0.5">
                  <strong className="font-semibold text-[var(--status-error-fg)]">{t(TRY_ON_ERROR_MESSAGES[step.code].title)}</strong>
                  <span className="text-[var(--text-primary)]">{t(TRY_ON_ERROR_MESSAGES[step.code].body)}</span>
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {errorSuggestsNewPhoto(step.code) ? (
                  <Button variant="dark" size="sm" iconLeft={ImageUp} onClick={() => setStep({ kind: "photo" })}>
                    {t("studio.tryOn.errorActions.newPhoto")}
                  </Button>
                ) : (
                  <Button variant="dark" size="sm" onClick={() => void analyse()}>
                    {t("studio.tryOn.errorActions.retry")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => placeByHand("chosen")}>
                  {t("studio.tryOn.errorActions.manual")}
                </Button>
              </div>
            </div>
          )}

          {step.kind === "adjust" && photo && (
            <AdjustStep
              photo={photo}
              creation={creation}
              renderer={renderer}
              initial={step.initial}
              placements={step.placements}
              origin={step.origin}
              onNewPhoto={() => setStep({ kind: "photo" })}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
