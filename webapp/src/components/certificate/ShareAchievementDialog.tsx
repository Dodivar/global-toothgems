import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Check, Copy, Share2, Sparkles, X } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { CertificateSheet } from "../account/CertificateDocument";
import { DownloadCertificateButton } from "./DownloadCertificateButton";
import { NetworkIcon } from "./NetworkIcon";
import { useNativeDialog } from "./useNativeDialog";
import type { CertificateContent } from "../../lib/certificate/layout";
import { linkedInCertificationUrl, SHARE_NETWORKS, shareDestination, type ShareNetwork } from "../../lib/certificate/share";
import { canShareFiles, useCertificateExport } from "../../lib/certificate/useCertificateExport";
import { useHydrated } from "../../lib/useHydrated";

const NETWORK_NAMES: Record<ShareNetwork, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  email: "E-mail",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sharing an achievement: an invitation, never a step the member has to take.
 *
 * What travels is the certificate's image and a caption the member can edit —
 * there is no public certificate page (decided by the owner, 2026-10-07). On a
 * phone, "Share" hands the image to the device's share sheet (Instagram,
 * WhatsApp, Messages…). Each network button saves the image, copies the
 * caption and opens the network, so the post is one paste away; LinkedIn's
 * "add a certification" form is pre-filled.
 *
 * Mounted only while open. Native `<dialog>`: it can open above the
 * certificate viewer, itself a modal (see `useNativeDialog`).
 */
export function ShareAchievementDialog({
  content,
  awardedOn,
  onClose,
}: {
  content: CertificateContent;
  /** ISO date of completion (LinkedIn wants the year and month). */
  awardedOn: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { dialogProps, close } = useNativeDialog(onClose);
  const titleId = useId();
  const captionId = useId();
  const { status, download, shareImage, prepare } = useCertificateExport(content);
  const [caption, setCaption] = useState(() => t("certificate.shareCaption", { title: content.courseTitle }));
  // Known only in the browser: whether the device has a share sheet for images.
  const nativeShare = useHydrated() && canShareFiles();
  const [feedback, setFeedback] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // The share sheet must open right after the tap: render the image now.
    prepare();
  }, [prepare]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = async () => {
    const ok = await copyText(caption);
    setCopied(ok);
    setFeedback(ok ? { tone: "done", text: t("certificate.shareCopied") } : { tone: "error", text: t("certificate.shareCopyFailed") });
  };

  const onNative = async () => {
    const result = await shareImage(caption);
    if (result === "shared") setFeedback({ tone: "done", text: t("certificate.shareSent") });
    if (result === "failed") setFeedback({ tone: "error", text: t("certificate.shareFailed") });
  };

  const onNetwork = async (network: ShareNetwork) => {
    const destination = shareDestination(network, caption, t("certificate.shareSubject", { title: content.courseTitle }));
    // Copy and open while the tap still counts: both need the user's gesture.
    const copiedNow = copyText(caption);
    if (network === "email") window.location.assign(destination);
    else window.open(destination, "_blank", "noopener,noreferrer");
    const [ok, saved] = await Promise.all([copiedNow, download("png")]);
    setFeedback(
      saved
        ? { tone: "done", text: ok ? t("certificate.shareReady", { network: NETWORK_NAMES[network] }) : t("certificate.shareReadyNoCopy", { network: NETWORK_NAMES[network] }) }
        : { tone: "error", text: t("certificate.downloadError") },
    );
  };

  return (
    <dialog
      {...dialogProps}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-24px)] w-[min(640px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border-0 bg-transparent p-0 backdrop:bg-[rgba(17,17,17,.55)] backdrop:backdrop-blur-[3px]"
    >
      <div className="gt-cert-rise grid gap-[var(--space-5)] rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[clamp(18px,3.5vw,32px)] text-[var(--text-body)] shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <span className="gt-eyebrow flex items-center gap-2 text-[var(--accent-highlight-ink)]">
              <Sparkles size={13} aria-hidden="true" />
              {t("certificate.shareEyebrow")}
            </span>
            <h2 id={titleId} className="text-[length:var(--text-h3)]">
              {t("certificate.shareTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("certificate.shareBody", { title: content.courseTitle })}</p>
          </div>
          <IconButton icon={X} label={t("common.close")} variant="outline" size="sm" onClick={close} />
        </div>

        {/* The certificate as it will be posted. */}
        <div className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,var(--gt-blue-100),var(--gt-emerald-50))] p-[clamp(10px,3vw,20px)]">
          <div className="overflow-hidden rounded-[3px] bg-[var(--gt-white)] shadow-[0_0_0_1px_var(--gt-ink-200),var(--shadow-md)]">
            <CertificateSheet content={content} />
          </div>
        </div>

        <div className="grid gap-2">
          <label htmlFor={captionId} className="gt-eyebrow">
            {t("certificate.shareCaptionLabel")}
          </label>
          <textarea
            id={captionId}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 py-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)] focus-visible:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          />
          <div>
            <Button variant="ghost" size="sm" iconLeft={copied ? Check : Copy} onClick={onCopy}>
              {copied ? t("certificate.shareCopiedShort") : t("certificate.shareCopy")}
            </Button>
          </div>
        </div>

        <div className={nativeShare ? "grid gap-3 sm:grid-cols-2" : "grid"}>
          {nativeShare && (
            <Button variant="primary" iconLeft={Share2} fullWidth onClick={onNative} loading={status.share === "working"}>
              {t("certificate.shareNative")}
            </Button>
          )}
          <DownloadCertificateButton
            format="png"
            status={status.png}
            onDownload={() =>
              void download("png").then((ok) => setFeedback(ok ? { tone: "done", text: t("certificate.downloadImageDoneLive") } : { tone: "error", text: t("certificate.downloadError") }))
            }
            variant={nativeShare ? "outline" : "primary"}
            fullWidth
          />
        </div>

        <fieldset className="m-0 grid gap-2.5 border-0 p-0">
          <legend className="gt-eyebrow mb-2.5">{t("certificate.shareOn")}</legend>
          <ul className="m-0 grid list-none grid-cols-3 gap-2 min-[420px]:grid-cols-5 p-0">
            {SHARE_NETWORKS.map((network) => (
              <li key={network}>
                <button
                  type="button"
                  onClick={() => void onNetwork(network)}
                  className="gt-cert-network group grid w-full justify-items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1 py-3 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--gt-blue-50)] transition-colors duration-[var(--duration-fast)] group-hover:bg-[var(--gt-blue-100)]">
                    <NetworkIcon network={network} />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight">{NETWORK_NAMES[network]}</span>
                  <span className="sr-only">{t("certificate.shareOnHint")}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("certificate.shareOnNote")}</p>
        </fieldset>

        <a
          href={linkedInCertificationUrl({ courseTitle: content.courseTitle, awardedOn, reference: content.reference })}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-blue-50)] p-3.5 text-[var(--text-primary)] no-underline transition-colors duration-[var(--duration-fast)] hover:border-[var(--gt-blue-300)] hover:bg-[var(--gt-blue-100)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-card)] text-[var(--gt-blue-700)]">
            <BadgeCheck size={18} aria-hidden="true" />
          </span>
          <span className="grid gap-0.5">
            <strong className="text-[length:var(--text-body-sm)]">{t("certificate.linkedinAdd")}</strong>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("certificate.linkedinAddBody")}</span>
          </span>
          <span className="sr-only">{t("certificate.newTab")}</span>
        </a>

        <p
          role="status"
          aria-live="polite"
          className={
            feedback
              ? `gt-cert-rise m-0 flex items-start gap-2 rounded-[var(--radius-md)] px-3.5 py-3 text-[length:var(--text-body-sm)] ${feedback.tone === "done" ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"}`
              : "sr-only"
          }
        >
          {feedback && (feedback.tone === "done" ? <Check size={16} aria-hidden="true" className="mt-0.5 flex-none" /> : <X size={16} aria-hidden="true" className="mt-0.5 flex-none" />)}
          {feedback?.text}
        </p>

        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">{t("certificate.sharePrivacy")}</p>
      </div>
    </dialog>
  );
}
