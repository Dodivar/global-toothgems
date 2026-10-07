import { useTranslation } from "react-i18next";
import { CircleAlert, Download, ImageDown, LoaderCircle, Check, type LucideIcon, type LucideProps } from "lucide-react";
import clsx from "clsx";
import type { ButtonSize, ButtonVariant } from "../ui/Button";
import { Button } from "../ui/Button";
import type { ExportStatus } from "../../lib/certificate/useCertificateExport";

/** The loader, spinning; the check, popping in. Both stand still under reduced motion. */
const Spinner = ((props: LucideProps) => <LoaderCircle {...props} className="animate-spin motion-reduce:animate-none" />) as LucideIcon;
const Done = ((props: LucideProps) => <Check {...props} className="gt-cert-pop" />) as LucideIcon;

/**
 * The download of a certificate file, with every state on the button itself:
 * the label says what is happening ("Preparing…", "Downloaded", "Try again")
 * and an icon carries the same meaning, so neither colour nor motion is the
 * only signal. A polite live region repeats it for screen readers — a toast
 * would be hidden behind an open dialog.
 */
export function DownloadCertificateButton({
  status,
  onDownload,
  format = "pdf",
  label,
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: {
  status: ExportStatus;
  onDownload: () => void;
  format?: "pdf" | "png";
  /** Label at rest; defaults to "Download my certificate". */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const idle = label ?? (format === "pdf" ? t("certificate.download") : t("certificate.downloadImage"));
  const text = {
    idle,
    working: t("certificate.downloadWorking"),
    done: format === "pdf" ? t("certificate.downloadDone") : t("certificate.downloadImageDone"),
    error: t("certificate.downloadRetry"),
  }[status];
  const icon = { idle: format === "pdf" ? Download : ImageDown, working: Spinner, done: Done, error: CircleAlert }[status];

  return (
    <>
      <Button
        variant={status === "error" ? "dangerOutline" : variant}
        size={size}
        fullWidth={fullWidth}
        iconLeft={icon}
        aria-busy={status === "working"}
        // Not disabled while working: a disabled button drops keyboard focus.
        onClick={() => {
          if (status !== "working") onDownload();
        }}
        className={clsx("gt-cert-cta", className)}
      >
        {text}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === "done" ? t("certificate.downloadDoneLive") : status === "error" ? t("certificate.downloadError") : ""}
      </span>
    </>
  );
}
