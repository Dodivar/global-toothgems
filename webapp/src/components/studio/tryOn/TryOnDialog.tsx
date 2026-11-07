import { useEffect, useRef, useState } from "react";
import { CircleAlert, ImageUp, LogIn, RefreshCw, RotateCcw, ScanFace } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../lib/auth";
import { useCookieConsent } from "../../../lib/cookieConsent";
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
  type TryOnSource,
  type TryOnStage,
} from "../../../lib/studio3d/tryOn";
import { sourceKey } from "../../../lib/studio3d/tryOnLocal";
import { smileTryOnService } from "../../../lib/studio3d/tryOnService";
import { setStudioAnalyticsConsent } from "../../../lib/studioAnalytics";
import { PhotoStep, type AiState } from "./PhotoStep";
import type { PreparedPhoto } from "./preparePhoto";
import { ProcessingStep } from "./ProcessingStep";
import { ResultActions, ResultStep } from "./ResultStep";
import { SavedTryOns } from "./SavedTryOns";
import { useTryOnJobs, type TryOnJobStatus } from "./TryOnJobProvider";

/** The stepper: photo, the analysis, the render, the result. An error stays on the stage it happened at. */
const STAGE_INDEX: Record<TryOnStage, number> = { checking: 1, rendering: 2 };
function stepIndex(status: TryOnJobStatus | null): number {
  if (!status) return 0;
  if (status.kind === "result") return 3;
  if (status.kind === "interrupted") return 2;
  return STAGE_INDEX[status.stage];
}

/**
 * "Try it on a smile": a creation on a photo of a smile (decision 111, the
 * computed placement since 2026-11-01: decision 111 (k)). Photo + consent →
 * the analysis, the placement, the render and the paste back (`runTryOn.ts`)
 * → the result, downloaded or shared. A placement the teeth do not support
 * well enough asks for another photo rather than guessing. While the AI is
 * not connected, the dialog says so and sends nothing.
 *
 * Since 2026-11-05 the run belongs to the job store (`TryOnJobProvider`), not
 * to this dialog: closing it does not stop the render, a pill says when it is
 * ready, and the dialog opened again on the same creation shows the run where
 * it is. The photo and the result are kept on this device only, 24 h at most
 * (`tryOnLocal.ts`); this creation's earlier results are listed under the
 * photo step.
 *
 * Opened by the artist on their own creation (`audience="artist"`, a
 * client's photo) and by visitors on a Glowbook creation or a share link
 * (`audience="visitor"`, their own smile). `source` names the creation for
 * the function. Whether the AI may be used for a creation (the owner's plan)
 * is decided by the database: the viewers only show the entry point when it
 * says so, and the function checks again.
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
  const jobs = useTryOnJobs();
  const key = source ? sourceKey(source) : null;
  const job = jobs.job && jobs.job.key === key ? jobs.job : null;
  // Opened on a creation whose run exists: show the run, else the photo step.
  const [onPhoto, setOnPhoto] = useState(job === null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [consent, setConsent] = useState(false);
  const [ai, setAi] = useState<AiState>(source ? "checking" : "unavailable");
  const photoUrl = useRef<string | null>(null);
  const { record } = useCookieConsent();
  const status = !onPhoto && job ? job.status : null;
  /** Another creation's run still under way: starting this one stops it. */
  const elsewhere = jobs.job && jobs.job.key !== key && jobs.job.status.kind === "running" ? jobs.job : null;

  // While this dialog is open, the store's pill is hidden.
  const { registerDialog } = jobs;
  useEffect(() => registerDialog(), [registerDialog]);

  // The try-on's events (facts only, `tryOnAnalytics.ts`) follow the visitor's analytics choice, on Glowbook pages too.
  useEffect(() => setStudioAnalyticsConsent(record?.analytics === true), [record]);

  // Ask once whether the AI is connected: no photo leaves before the answer.
  // Keyed on whether there is a source, not on the object (callers pass it inline).
  const hasSource = source !== null;
  useEffect(() => {
    if (!hasSource) return;
    let live = true;
    service
      .status()
      .then((next) => live && setAi(next.available ? "available" : "unavailable"))
      .catch(() => live && setAi("unavailable"));
    return () => {
      live = false;
    };
  }, [service, hasSource]);

  // The function says the AI is not connected: back to the photo step, which says so.
  const notAvailable = job?.status.kind === "error" && job.status.code === "not_available";
  const { dismiss } = jobs;
  useEffect(() => {
    if (!notAvailable) return;
    setAi("unavailable");
    setOnPhoto(true);
    dismiss();
  }, [notAvailable, dismiss]);

  // Forget this dialog's own copy of the photo when it closes (the run keeps its own).
  useEffect(
    () => () => {
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    },
    [],
  );

  const takePhoto = (next: PreparedPhoto) => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = next.url;
    setPhoto(next);
  };

  /** Back to the photo step, with the run's photo when the dialog has none yet. */
  const toPhoto = () => {
    if (!photo && job) takePhoto({ ...job.photo, url: URL.createObjectURL(job.photo.blob) });
    if (job && job.status.kind !== "running" && job.status.kind !== "result") dismiss();
    setOnPhoto(true);
  };

  const signIn = () => {
    onClose();
    navigate("/connexion", { state: { from: `${pathname}${hash}` } });
  };

  const render = () => {
    if (!photo || !source) return;
    jobs.start({ creation, source, audience, photo, service });
    setOnPhoto(false);
  };

  const again = () => {
    jobs.again();
    setOnPhoto(false);
  };

  const cancel = () => {
    jobs.cancel();
    setOnPhoto(true);
  };

  const showSaved = (id: string) => {
    jobs.show(id);
    setOnPhoto(false);
  };

  const empty = creation.scene.pieces.length === 0;
  const result = status?.kind === "result" ? status : null;
  const kept = jobs.saved.filter((r) => sourceKey(r.source) === key && r.id !== job?.id);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t("studio.tryOn.title")}
      description={t(`studio.tryOn.subtitle.${audience}`, { name: creation.name })}
      icon={<ScanFace size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={!empty && result ? <ResultActions image={result.image} creation={creation} /> : undefined}
    >
      {empty ? (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studio.tryOn.empty")}</p>
      ) : (
        <>
          {/* The result is on screen: the stepper would only push download / share below the fold. */}
          {!result && (
            <ProgressBar
              variant="steps"
              tone="ink"
              doneTone="success"
              steps={[t("studio.tryOn.steps.photo"), t("studio.tryOn.steps.check"), t("studio.tryOn.steps.render"), t("studio.tryOn.steps.result")]}
              current={stepIndex(status)}
            />
          )}

          {!status && (
            <>
              {elsewhere && (
                <p role="status" className="m-0 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px] leading-snug text-[var(--text-primary)]">
                  {t("studio.tryOn.job.otherRunning", { name: elsewhere.creation.name })}
                </p>
              )}
              <PhotoStep
                photo={photo}
                onPhoto={takePhoto}
                consent={consent}
                onConsent={setConsent}
                audience={audience}
                ai={ai}
                signedIn={signedIn}
                onAi={render}
                onSignIn={signIn}
              />
              {kept.length > 0 && jobs.job?.status.kind !== "running" && <SavedTryOns runs={kept} onShow={showSaved} onRemove={jobs.remove} />}
            </>
          )}

          {status?.kind === "running" && <ProcessingStep key={status.stage} stage={status.stage} onCancel={cancel} />}

          {status?.kind === "interrupted" && (
            <div role="status" className="grid gap-3">
              <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                <RotateCcw size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
                <span className="grid gap-0.5">
                  <strong className="font-semibold">{t("studio.tryOn.job.interruptedTitle")}</strong>
                  <span className="text-[var(--text-muted)]">{t("studio.tryOn.job.interruptedBody")}</span>
                </span>
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" iconLeft={ImageUp} onClick={toPhoto}>
                  {t("studio.tryOn.errorActions.newPhoto")}
                </Button>
                <Button variant="dark" size="sm" iconLeft={RefreshCw} disabled={ai !== "available"} onClick={again}>
                  {t("studio.tryOn.job.resume")}
                </Button>
              </div>
            </div>
          )}

          {status?.kind === "error" && (
            <div role="alert" className="grid gap-3">
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-body-sm)]">
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />
                <span className="grid gap-0.5">
                  <strong className="font-semibold text-[var(--status-error-fg)]">{t(TRY_ON_ERROR_MESSAGES[status.code].title)}</strong>
                  <span className="text-[var(--text-primary)]">{t(TRY_ON_ERROR_MESSAGES[status.code].body)}</span>
                  {!!status.reasons?.length && (
                    <ul className="m-0 mt-1 grid list-disc gap-0.5 pl-5 text-[var(--text-primary)]">
                      {status.reasons.map((reason) => (
                        <li key={reason}>{t(`studio.tryOn.photoIssues.${reason}`)}</li>
                      ))}
                    </ul>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {status.code === "sign_in_required" ? (
                  <Button variant="dark" size="sm" iconLeft={LogIn} onClick={signIn}>
                    {t("studio.tryOn.errorActions.signIn")}
                  </Button>
                ) : errorAllowsRetry(status.code) ? (
                  <Button variant="dark" size="sm" iconLeft={RefreshCw} onClick={again}>
                    {t("studio.tryOn.errorActions.retry")}
                  </Button>
                ) : null}
                <Button variant={status.code === "photo_unsuitable" ? "dark" : "outline"} size="sm" iconLeft={ImageUp} onClick={toPhoto}>
                  {t("studio.tryOn.errorActions.newPhoto")}
                </Button>
              </div>
            </div>
          )}

          {result && job && (
            <ResultStep
              photo={job.photo}
              imageUrl={result.url}
              leftOut={result.leftOut}
              creation={creation}
              onRegenerate={again}
              onNewPhoto={toPhoto}
              onForget={() => {
                jobs.remove(job.id);
                setOnPhoto(true);
              }}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
