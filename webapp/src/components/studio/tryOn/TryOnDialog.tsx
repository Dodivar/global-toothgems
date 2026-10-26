import { useEffect, useRef, useState } from "react";
import { CircleAlert, ImageUp, LoaderCircle, LogIn, RefreshCw, ScanFace } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../lib/auth";
import { useLocation, useNavigate } from "../../../lib/navigation";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { ProgressBar } from "../../ui/ProgressBar";
import {
  TRY_ON_ERROR_MESSAGES,
  errorAllowsRetry,
  type PhotoIssue,
  type SmileTryOnService,
  type TryOnAudience,
  type TryOnCreation,
  type TryOnErrorCode,
  type TryOnSource,
  type TryOnStage,
} from "../../../lib/studio3d/tryOn";
import { smileTryOnService } from "../../../lib/studio3d/tryOnService";
import { tryOnSeats } from "../../../lib/studio3d/tryOnSeats";
import { renderDesignImage, renderDesignMap } from "./designImage";
import { pasteBack } from "./pasteBack";
import { PhotoStep, type AiState } from "./PhotoStep";
import type { PreparedPhoto } from "./preparePhoto";
import { ResultStep } from "./ResultStep";

type Step =
  | { kind: "photo" }
  | { kind: "processing"; stage: TryOnStage }
  | { kind: "error"; code: TryOnErrorCode; reasons?: PhotoIssue[]; stage: TryOnStage }
  | { kind: "result"; image: Blob; url: string };

/** The stepper: photo, the photo check, the render, the result. An error stays on the stage it happened at. */
const STAGE_INDEX: Record<TryOnStage, number> = { checking: 1, rendering: 2 };
const stepIndex = (step: Step) =>
  step.kind === "photo" ? 0 : step.kind === "result" ? 3 : STAGE_INDEX[step.stage];

/**
 * "Try it on a smile": a creation on a photo of a smile, rendered by AI
 * (decision 111). Photo + consent → the photo check (a small model, shown as
 * its own step from the function's progress events) → the render (Nano Banana behind the Edge
 * Function `studio-try-on`) → the result, downloaded or shared. The photo
 * and the image stay in this tab; closing the dialog forgets them. While the
 * AI is not connected, the dialog says so and sends nothing.
 *
 * Opened by the artist on their own creation (`audience="artist"`, a
 * client's photo) and by visitors on a Glowbook creation or a share link
 * (`audience="visitor"`, their own smile). `source` names the creation for
 * the function (the viewers only open the dialog with one). Whether the AI may be used for a creation
 * (the owner's plan) is decided by the database: the viewers only show the
 * entry point when it says so, and the function checks again.
 */
export function TryOnDialog({
  creation,
  source,
  audience = "artist",
  onClose,
  service = smileTryOnService,
}: {
  creation: TryOnCreation;
  source: TryOnSource | null;
  audience?: TryOnAudience;
  onClose: () => void;
  service?: SmileTryOnService;
}) {
  const { t } = useTranslation();
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const [step, setStep] = useState<Step>({ kind: "photo" });
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [consent, setConsent] = useState(false);
  const [ai, setAi] = useState<AiState>(source ? "checking" : "unavailable");
  const request = useRef<AbortController | null>(null);
  const photoUrl = useRef<string | null>(null);
  const resultUrl = useRef<string | null>(null);

  // Ask once whether the AI is connected: no photo leaves before the answer.
  // Keyed on whether there is a source, not on the object (callers pass it inline).
  const hasSource = source !== null;
  useEffect(() => {
    if (!hasSource) return;
    let live = true;
    service
      .status()
      .then((status) => live && setAi(status.available ? "available" : "unavailable"))
      .catch(() => live && setAi("unavailable"));
    return () => {
      live = false;
    };
  }, [service, hasSource]);

  // Forget the photo when the dialog closes, and stop a render still running.
  useEffect(
    () => () => {
      request.current?.abort();
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    },
    [],
  );

  const takePhoto = (next: PreparedPhoto) => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = next.url;
    setPhoto(next);
  };

  const signIn = () => {
    onClose();
    navigate("/connexion", { state: { from: `${pathname}${hash}` } });
  };

  const render = async () => {
    if (!photo || !source) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let stage: TryOnStage = "checking";
    setStep({ kind: "processing", stage });
    const design = await renderDesignImage(creation).catch(() => null);
    if (controller.signal.aborted) return;
    if (!design) {
      request.current = null;
      return setStep({ kind: "error", code: "failed", stage });
    }
    const seats = tryOnSeats(creation.scene.pieces, creation.scene.model);
    const map = await renderDesignMap(creation, seats);
    if (controller.signal.aborted) return;
    const onStage = (next: TryOnStage) => {
      if (controller.signal.aborted) return;
      stage = next;
      setStep({ kind: "processing", stage: next });
    };
    const outcome = await service.render({ photo: photo.blob, source, design, map, seats }, { signal: controller.signal, onStage });
    if (controller.signal.aborted) return; // cancelled or closed: nothing to show
    request.current = null;
    if (outcome.ok) {
      // A mouth close-up goes back into the photo; if the browser cannot draw it, the close-up is shown alone.
      const image = outcome.crop ? ((await pasteBack(photo.blob, outcome.image, outcome.crop)) ?? outcome.image) : outcome.image;
      if (controller.signal.aborted) return;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = URL.createObjectURL(image);
      return setStep({ kind: "result", image, url: resultUrl.current });
    }
    if (outcome.code === "not_available") {
      setAi("unavailable");
      return setStep({ kind: "photo" });
    }
    setStep({ kind: "error", code: outcome.code, reasons: outcome.reasons, stage });
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
      description={t(`studio.tryOn.subtitle.${audience}`, { name: creation.name })}
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
            doneTone="success"
            steps={[t("studio.tryOn.steps.photo"), t("studio.tryOn.steps.check"), t("studio.tryOn.steps.render"), t("studio.tryOn.steps.result")]}
            current={stepIndex(step)}
          />

          {step.kind === "photo" && (
            <PhotoStep
              photo={photo}
              onPhoto={takePhoto}
              consent={consent}
              onConsent={setConsent}
              audience={audience}
              ai={ai}
              signedIn={signedIn}
              onAi={() => void render()}
              onSignIn={signIn}
            />
          )}

          {step.kind === "processing" && (
            <div className="grid justify-items-center gap-3 py-8 text-center">
              <LoaderCircle size={28} aria-hidden="true" className="text-[var(--gt-blue-700)] motion-safe:animate-spin" />
              <p role="status" className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`studio.tryOn.processing.${step.stage}.title`)}
              </p>
              <p className="m-0 max-w-sm text-[12.5px] text-[var(--text-muted)]">{t(`studio.tryOn.processing.${step.stage}.body`)}</p>
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
                  {!!step.reasons?.length && (
                    <ul className="m-0 mt-1 grid list-disc gap-0.5 pl-5 text-[var(--text-primary)]">
                      {step.reasons.map((reason) => (
                        <li key={reason}>{t(`studio.tryOn.photoIssues.${reason}`)}</li>
                      ))}
                    </ul>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {step.code === "sign_in_required" ? (
                  <Button variant="dark" size="sm" iconLeft={LogIn} onClick={signIn}>
                    {t("studio.tryOn.errorActions.signIn")}
                  </Button>
                ) : errorAllowsRetry(step.code) ? (
                  <Button variant="dark" size="sm" iconLeft={RefreshCw} onClick={() => void render()}>
                    {t("studio.tryOn.errorActions.retry")}
                  </Button>
                ) : null}
                <Button
                  variant={step.code === "photo_unsuitable" ? "dark" : "outline"}
                  size="sm"
                  iconLeft={ImageUp}
                  onClick={() => setStep({ kind: "photo" })}
                >
                  {t("studio.tryOn.errorActions.newPhoto")}
                </Button>
              </div>
            </div>
          )}

          {step.kind === "result" && photo && (
            <ResultStep
              photo={photo}
              image={step.image}
              imageUrl={step.url}
              creation={creation}
              onRegenerate={() => void render()}
              onNewPhoto={() => setStep({ kind: "photo" })}
            />
          )}

        </>
      )}
    </Dialog>
  );
}
