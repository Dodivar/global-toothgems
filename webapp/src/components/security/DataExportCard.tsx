import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CircleCheck,
  Clock,
  Download,
  FileArchive,
  GraduationCap,
  LoaderCircle,
  Package,
  RotateCw,
  Send,
  UserRound,
  IdCard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { SecurityCard } from "./SecurityCard";
import { Notice } from "./Notice";
import { useAuth } from "../../lib/auth";
import { useOrders } from "../../lib/orders";
import { useProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import { formatDate } from "../../lib/format";
import { EXPORT_AVAILABLE_DAYS, submitExportRequest, type ServiceOutcome } from "../../lib/accountSecurity";
import { useAccountSecurity } from "../../lib/securityState";

const SENT_CLOSE_ID = "security-export-sent-close";

const INCLUDED: { key: string; icon: LucideIcon }[] = [
  { key: "account", icon: IdCard },
  { key: "profile", icon: UserRound },
  { key: "orders", icon: Package },
  { key: "courses", icon: GraduationCap },
  { key: "activity", icon: Activity },
];

function formatTime(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * "Download your personal data" — the GDPR right of access and portability.
 *
 * Written to be read as a service, not a legal notice: what is included, in
 * plain words; one button; a confirmation that says what happens next; then a
 * status that moves from processing to ready to (eventually) expired, with the
 * dates that matter. The request lives in `SecurityProvider`, so it keeps
 * processing while the member browses elsewhere.
 *
 * The "archive" is built in the browser from the prototype's own session
 * data, as a JSON file: enough to review the download state honestly. The real
 * export is assembled server-side and delivered through an expiring,
 * authenticated link.
 */
export function DataExportCard({ outcome }: { outcome: ServiceOutcome }) {
  const { t, i18n } = useTranslation();
  const { dataExport, startExport } = useAccountSecurity();
  const { profile } = useAuth();
  const { orders } = useOrders();
  const { enrollments } = useProgress();
  const { showToast } = useToast();

  const [dialog, setDialog] = useState<null | "confirm" | "sent">(null);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const openDialog = () => {
    setFailed(false);
    setDialog("confirm");
  };

  const submit = async () => {
    setSubmitting(true);
    setFailed(false);
    try {
      await submitExportRequest(outcome);
      startExport();
      setDialog("sent");
      // The confirm button just vanished; keep focus inside the dialog.
      requestAnimationFrame(() => document.getElementById(SENT_CLOSE_ID)?.focus());
    } catch {
      setFailed(true);
    }
    setSubmitting(false);
  };

  const download = () => {
    const archive = {
      format: "global-toothgems-personal-data/1",
      generatedAt: dataExport.readyAt,
      account: { email: profile?.email, newsletter: profile?.newsletter },
      profile,
      orders,
      courses: enrollments,
      note: t("security.export.fileNote"),
    };
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `global-toothgems-mes-donnees-${(dataExport.readyAt ?? new Date().toISOString()).slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t("security.export.toastDownloadTitle"), t("security.export.toastDownloadBody"));
  };

  const status = {
    none: null,
    processing: (
      <Badge tone="brand" icon={LoaderCircle} size="sm">
        {t("security.overview.exportProcessing")}
      </Badge>
    ),
    ready: (
      <Badge tone="success" icon={CircleCheck} size="sm">
        {t("security.overview.exportReady")}
      </Badge>
    ),
    expired: (
      <Badge tone="warning" icon={Clock} size="sm">
        {t("security.overview.exportExpired")}
      </Badge>
    ),
  }[dataExport.status];

  return (
    <SecurityCard
      id="security-export"
      icon={FileArchive}
      title={t("security.export.title")}
      description={<p>{t("security.export.body")}</p>}
      status={status ?? undefined}
    >
      <div className="grid gap-3">
        <h3 className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("security.export.includedTitle")}</h3>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {INCLUDED.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3.5 py-3">
              <Icon size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
              <span className="grid gap-0.5">
                <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t(`security.export.items.${key}.title`)}</strong>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`security.export.items.${key}.body`)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.export.format")}</p>
      </div>

      <div role="status" aria-live="polite" className="grid gap-3">
        {dataExport.status === "processing" && dataExport.requestedAt && (
          <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--status-info-bg)] p-4">
            <p className="m-0 flex items-start gap-2.5 text-[length:var(--text-body-sm)]">
              <LoaderCircle size={17} aria-hidden="true" className="mt-[1px] flex-none animate-spin text-[var(--status-info-fg)] motion-reduce:animate-none" />
              <span className="grid gap-0.5">
                <strong className="text-[var(--text-primary)]">{t("security.export.processingTitle")}</strong>
                <span className="text-[var(--text-body)]">
                  {t("security.export.processingBody", { date: formatDate(dataExport.requestedAt), time: formatTime(dataExport.requestedAt, i18n.language) })}
                </span>
              </span>
            </p>
            <span aria-hidden="true" className="gt-skeleton ml-[26px] block h-1.5 rounded-full" />
          </div>
        )}

        {dataExport.status === "ready" && dataExport.expiresAt && (
          <Notice
            tone="success"
            icon={CircleCheck}
            title={t("security.export.readyTitle")}
            actions={
              <Button variant="primary" size="sm" iconLeft={Download} onClick={download}>
                {t("security.export.download")}
              </Button>
            }
          >
            <p>{t("security.export.readyBody", { date: formatDate(dataExport.expiresAt) })}</p>
          </Notice>
        )}

        {dataExport.status === "expired" && (
          <Notice tone="warning" icon={Clock} title={t("security.export.expiredTitle")}>
            <p>{t("security.export.expiredBody", { days: EXPORT_AVAILABLE_DAYS })}</p>
          </Notice>
        )}
      </div>

      {(dataExport.status === "none" || dataExport.status === "expired") && (
        <div>
          <Button variant="dark" iconLeft={dataExport.status === "expired" ? RotateCw : Send} onClick={openDialog}>
            {t(dataExport.status === "expired" ? "security.export.requestAgain" : "security.export.request")}
          </Button>
        </div>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => {
          if (!submitting) setDialog(null);
        }}
        title={t(dialog === "sent" ? "security.export.sentTitle" : "security.export.confirmTitle")}
        description={dialog === "sent" ? undefined : t("security.export.confirmBody")}
        icon={dialog === "sent" ? <CircleCheck size={16} /> : <FileArchive size={16} />}
        closeLabel={t("common.close")}
        footer={
          dialog === "sent" ? (
            <Button id={SENT_CLOSE_ID} variant="primary" className="ml-auto" onClick={() => setDialog(null)}>
              {t("security.export.sentClose")}
            </Button>
          ) : (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setDialog(null)} disabled={submitting}>
                {t("common.cancel")}
              </Button>
              <Button variant="primary" iconLeft={Send} loading={submitting} onClick={() => void submit()}>
                {submitting ? t("security.export.submitting") : t("security.export.confirm")}
              </Button>
            </div>
          )
        }
      >
        {dialog === "sent" ? (
          <div role="status" className="grid gap-3 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <p className="m-0">{t("security.export.sentBody", { email: profile?.email })}</p>
          </div>
        ) : (
          <>
            <ol className="m-0 grid list-none gap-3 p-0">
              {(["step1", "step2", "step3"] as const).map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[length:var(--text-caption)] font-bold text-[var(--gt-blue-700)]"
                  >
                    {i + 1}
                  </span>
                  <span>{t(`security.export.${step}`, { email: profile?.email, days: EXPORT_AVAILABLE_DAYS })}</span>
                </li>
              ))}
            </ol>
            {failed && (
              <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
                {t("security.export.failedBody")}
              </Notice>
            )}
          </>
        )}
      </Dialog>
    </SecurityCard>
  );
}
