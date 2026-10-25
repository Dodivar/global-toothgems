import { useId, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import { Camera, CircleAlert, Hand, ImageUp, LoaderCircle, LogIn, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import type { TryOnAudience } from "../../../lib/studio3d/tryOn";
import { PHOTO_MAX_BYTES, PHOTO_MIN_LONG_EDGE, PHOTO_MIN_SHORT_EDGE, type PhotoError } from "../../../lib/studio3d/tryOnPhoto";
import { preparePhoto, type PreparedPhoto } from "./preparePhoto";

const TIPS = ["front", "lips", "light", "filter"] as const;

/** Whether the AI render can be asked: still checking, connected, or not (yet). */
export type AiState = "checking" | "available" | "unavailable";

/**
 * Step 1: the smile photo, then how to try the creation on it. The photo is
 * taken with the camera (phones), chosen from the device or dropped
 * (desktop); checked, turned upright and downscaled in the browser. The
 * person's consent is confirmed — the artist for a client, a visitor for
 * themselves — then one click picks the try-on: the AI render (decision 111;
 * the photo is then sent, and the copy says so only when the AI is
 * connected) or placing the creation by hand (the photo stays in this tab).
 */
export function PhotoStep({
  photo,
  onPhoto,
  consent,
  onConsent,
  audience,
  ai,
  signedIn,
  onAi,
  onManual,
  onSignIn,
}: {
  photo: PreparedPhoto | null;
  onPhoto: (photo: PreparedPhoto) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
  audience: TryOnAudience;
  ai: AiState;
  signedIn: boolean;
  onAi: () => void;
  onManual: () => void;
  onSignIn: () => void;
}) {
  const { t } = useTranslation();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<PhotoError | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const errorId = useId();
  const consentId = useId();

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const out = await preparePhoto(file);
    setBusy(false);
    if (out.ok) onPhoto(out.photo);
    else setError(out.error);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files?.[0]);
  };

  const proceed = (go: () => void) => {
    if (!consent) {
      setConsentMissing(true);
      consentRef.current?.focus();
      return;
    }
    go();
  };
  const ready = !!photo && !busy;
  const aiBody =
    ai === "checking" ? "checking" : ai === "unavailable" ? "unavailable" : signedIn ? "available" : "signIn";

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="m-0 text-[13px] font-bold text-[var(--text-primary)]">{t("studio.tryOn.photo.tipsTitle")}</h3>
        <ul className="m-0 mt-2 grid list-disc gap-1 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-muted)] sm:grid-cols-2">
          {TIPS.map((tip) => (
            <li key={tip}>{t(`studio.tryOn.photo.tips.${tip}`)}</li>
          ))}
        </ul>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          "ph-no-capture grid place-items-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed p-4 text-center transition-colors",
          dragging ? "border-[var(--focus-ring)] bg-[var(--surface-brand-wash)]" : "border-[var(--border-default)] bg-[var(--surface-sunken)]",
        )}
      >
        {photo ? (
          <img src={photo.url} alt={t("studio.tryOn.photo.previewAlt")} className="max-h-56 w-auto max-w-full rounded-[var(--radius-sm)] object-contain" />
        ) : (
          <ImageUp size={28} aria-hidden="true" className="text-[var(--text-subtle)]" />
        )}
        <p className="m-0 hidden text-[length:var(--text-body-sm)] text-[var(--text-muted)] sm:block">{t("studio.tryOn.photo.drop")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="dark" size="sm" iconLeft={Camera} onClick={() => cameraRef.current?.click()} disabled={busy}>
            {t("studio.tryOn.photo.takePhoto")}
          </Button>
          <Button variant="outline" size="sm" iconLeft={ImageUp} onClick={() => fileRef.current?.click()} disabled={busy}>
            {photo ? t("studio.tryOn.photo.replace") : t("studio.tryOn.photo.choose")}
          </Button>
        </div>
        {/* Two inputs: `capture` opens the camera straight away on a phone, and would hide the gallery if it were the only one. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="m-0 text-[11.5px] text-[var(--text-subtle)]">
          {t("studio.tryOn.photo.formats", {
            maxMb: Math.round(PHOTO_MAX_BYTES / (1024 * 1024)),
            minWidth: PHOTO_MIN_LONG_EDGE,
            minHeight: PHOTO_MIN_SHORT_EDGE,
          })}
        </p>
        {busy && (
          <p role="status" className="m-0 flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" />
            {t("studio.tryOn.photo.reading")}
          </p>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {t(`studio.tryOn.photo.errors.${error}`, {
            maxMb: Math.round(PHOTO_MAX_BYTES / (1024 * 1024)),
            minWidth: PHOTO_MIN_LONG_EDGE,
            minHeight: PHOTO_MIN_SHORT_EDGE,
          })}
        </p>
      )}

      <p className="m-0 flex items-start gap-2 text-[12.5px] leading-snug text-[var(--text-muted)]">
        <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
        {t(ai === "available" ? "studio.tryOn.photo.privacyAi" : "studio.tryOn.photo.privacy")}
      </p>

      <div className="grid gap-1">
        <Checkbox
          inputRef={consentRef}
          label={t(`studio.tryOn.photo.consent.${audience}`)}
          description={t(`studio.tryOn.photo.consentHint.${audience}`)}
          checked={consent}
          invalid={consentMissing && !consent}
          describedBy={consentMissing && !consent ? consentId : undefined}
          onChange={(v) => {
            onConsent(v);
            if (v) setConsentMissing(false);
          }}
        />
        {consentMissing && !consent && (
          <p id={consentId} role="alert" className="m-0 pl-8 text-[12px] text-[var(--status-error-fg)]">
            {t(`studio.tryOn.photo.consentRequired.${audience}`)}
          </p>
        )}
      </div>

      <fieldset className="m-0 grid gap-2 border-0 border-t border-[var(--border-subtle)] p-0 pt-4">
        <legend className="mb-2 p-0 pt-4 text-[13px] font-bold text-[var(--text-primary)]">{t("studio.tryOn.choice.title")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            icon={ai === "available" && !signedIn ? LogIn : Sparkles}
            title={t("studio.tryOn.choice.ai.title")}
            body={t(`studio.tryOn.choice.ai.${aiBody}`)}
            badge={ai === "unavailable" ? t("studio.tryOn.choice.ai.soon") : null}
            busy={ai === "checking"}
            disabled={ai !== "available" || (signedIn && !ready)}
            primary
            onClick={() => (signedIn ? proceed(onAi) : onSignIn())}
          />
          <ChoiceCard
            icon={Hand}
            title={t("studio.tryOn.choice.manual.title")}
            body={t("studio.tryOn.choice.manual.body")}
            disabled={!ready}
            onClick={() => proceed(onManual)}
          />
        </div>
        {!photo && <p className="m-0 text-[12px] text-[var(--text-muted)]">{t("studio.tryOn.choice.photoFirst")}</p>}
      </fieldset>
    </div>
  );
}

/** One way to try the creation on the photo: a large button with what it does. */
function ChoiceCard({
  icon: Icon,
  title,
  body,
  badge = null,
  busy = false,
  disabled,
  primary = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  badge?: string | null;
  busy?: boolean;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={clsx(
        "grid content-start gap-1.5 rounded-[var(--radius-md)] border p-3.5 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        primary
          ? "border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] enabled:hover:border-[var(--gt-blue-600)]"
          : "border-[var(--border-default)] bg-[var(--surface-card)] enabled:hover:border-[var(--gt-ink-700)]",
      )}
    >
      <span className="flex items-center gap-2 text-[14px] font-bold text-[var(--text-primary)]">
        {busy ? (
          <LoaderCircle size={16} aria-hidden="true" className="flex-none motion-safe:animate-spin" />
        ) : (
          <Icon size={16} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
        )}
        {title}
        {badge && (
          <span className="ml-auto rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[12.5px] leading-snug text-[var(--text-muted)]">{body}</span>
    </button>
  );
}
