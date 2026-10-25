import { useEffect, useRef, useState } from "react";
import { CircleAlert, Hand, ImageUp, LoaderCircle, LogIn, RefreshCw, ScanFace } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../lib/auth";
import { useLocation, useNavigate } from "../../../lib/navigation";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { ProgressBar } from "../../ui/ProgressBar";
import {
  TRY_ON_ERROR_MESSAGES,
  errorAllowsRetry,
  type SmileTryOnService,
  type TryOnAudience,
  type TryOnCreation,
  type TryOnErrorCode,
  type TryOnSource,
} from "../../../lib/studio3d/tryOn";
import { smileTryOnService } from "../../../lib/studio3d/tryOnService";
import { DEFAULT_TRANSFORM } from "../../../lib/studio3d/tryOnTransform";
import { AdjustStep, type AdjustReason } from "./AdjustStep";
import { renderDesignImage } from "./designImage";
import type { TryOnGemRenderer } from "./gemOverlay";
import { frontViewGemRenderer } from "./frontViewGemRenderer";
import { PhotoStep, type AiState } from "./PhotoStep";
import type { PreparedPhoto } from "./preparePhoto";
import { ResultStep } from "./ResultStep";

type Step =
  | { kind: "photo" }
  | { kind: "processing" }
  | { kind: "error"; code: TryOnErrorCode }
  | { kind: "result"; image: Blob; url: string }
  | { kind: "adjust"; reason: AdjustReason };

const STEP_INDEX: Record<Step["kind"], number> = { photo: 0, processing: 1, error: 1, result: 2, adjust: 2 };

/**
 * "Try it on a smile": a creation on a photo of a smile (decision 111).
 * Photo + consent → one click: the AI render (Nano Banana behind the Edge
 * Function `studio-try-on`) or placing the creation by hand → the result,
 * downloaded or shared. The photo and the image stay in this tab; closing
 * the dialog forgets them.
 *
 * Opened by the artist on their own creation (`audience="artist"`, a
 * client's photo) and by visitors on a Glowbook creation or a share link
 * (`audience="visitor"`, their own smile). `source` names the creation for
 * the function; without one (a design carried in a link's fragment) only
 * the manual try-on is offered. Whether the AI may be used for a creation
 * (the owner's plan) is decided by the database: the viewers only show the
 * entry point when it says so, and the function checks again.
 */
export function TryOnDialog({
  creation,
  source,
  audience = "artist",
  onClose,
  service = smileTryOnService,
  renderer = frontViewGemRenderer,
}: {
  creation: TryOnCreation;
  source: TryOnSource | null;
  audience?: TryOnAudience;
  onClose: () => void;
  service?: SmileTryOnService;
  renderer?: TryOnGemRenderer;
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
      .then((available) => live && setAi(available ? "available" : "unavailable"))
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

  const placeByHand = (reason: AdjustReason) => setStep({ kind: "adjust", reason });

  const signIn = () => {
    onClose();
    navigate("/connexion", { state: { from: `${pathname}${hash}` } });
  };

  const render = async () => {
    if (!photo || !source) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStep({ kind: "processing" });
    const design = await renderDesignImage(creation).catch(() => null);
    if (controller.signal.aborted) return;
    const outcome = await service.render({ photo: photo.blob, source, design }, { signal: controller.signal });
    if (controller.signal.aborted) return; // cancelled or closed: nothing to show
    request.current = null;
    if (outcome.ok) {
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = URL.createObjectURL(outcome.image);
      return setStep({ kind: "result", image: outcome.image, url: resultUrl.current });
    }
    if (outcome.code === "not_available") {
      setAi("unavailable");
      return placeByHand("not_available");
    }
    setStep({ kind: "error", code: outcome.code });
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
            steps={[t("studio.tryOn.steps.photo"), t("studio.tryOn.steps.render"), t("studio.tryOn.steps.result")]}
            current={STEP_INDEX[step.kind]}
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
              onManual={() => placeByHand("chosen")}
              onSignIn={signIn}
            />
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
                {step.code === "sign_in_required" ? (
                  <Button variant="dark" size="sm" iconLeft={LogIn} onClick={signIn}>
                    {t("studio.tryOn.errorActions.signIn")}
                  </Button>
                ) : errorAllowsRetry(step.code) ? (
                  <Button variant="dark" size="sm" iconLeft={RefreshCw} onClick={() => void render()}>
                    {t("studio.tryOn.errorActions.retry")}
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" iconLeft={ImageUp} onClick={() => setStep({ kind: "photo" })}>
                  {t("studio.tryOn.errorActions.newPhoto")}
                </Button>
                <Button variant="outline" size="sm" iconLeft={Hand} onClick={() => placeByHand("chosen")}>
                  {t("studio.tryOn.errorActions.manual")}
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
              onManual={() => placeByHand("chosen")}
              onNewPhoto={() => setStep({ kind: "photo" })}
            />
          )}

          {step.kind === "adjust" && photo && (
            <AdjustStep
              photo={photo}
              creation={creation}
              renderer={renderer}
              initial={DEFAULT_TRANSFORM}
              reason={step.reason}
              onNewPhoto={() => setStep({ kind: "photo" })}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
