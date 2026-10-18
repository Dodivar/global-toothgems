import { useId, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import { Camera, CircleAlert, ImageUp, LoaderCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { PHOTO_MAX_BYTES, PHOTO_MIN_LONG_EDGE, PHOTO_MIN_SHORT_EDGE, type PhotoError } from "../../../lib/studio3d/tryOnPhoto";
import { preparePhoto, type PreparedPhoto } from "./preparePhoto";

const TIPS = ["front", "lips", "light", "filter"] as const;

/**
 * Step 1: the client's smile photo. Taken with the camera (phones) or chosen
 * from the device, or dropped (desktop); checked, turned upright and
 * downscaled in the browser. The artist confirms the client's consent before
 * going on. The photo never leaves this tab.
 */
export function PhotoStep({
  photo,
  onPhoto,
  consent,
  onConsent,
  onContinue,
}: {
  photo: PreparedPhoto | null;
  onPhoto: (photo: PreparedPhoto) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
  onContinue: () => void;
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

  const proceed = () => {
    if (!consent) {
      setConsentMissing(true);
      consentRef.current?.focus();
      return;
    }
    onContinue();
  };

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
        {t("studio.tryOn.photo.privacy")}
      </p>

      <div className="grid gap-1">
        <Checkbox
          inputRef={consentRef}
          label={t("studio.tryOn.photo.consent")}
          description={t("studio.tryOn.photo.consentHint")}
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
            {t("studio.tryOn.photo.consentRequired")}
          </p>
        )}
      </div>

      <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
        <Button variant="primary" size="sm" onClick={proceed} disabled={!photo || busy}>
          {t("studio.tryOn.photo.continue")}
        </Button>
      </div>
    </div>
  );
}
