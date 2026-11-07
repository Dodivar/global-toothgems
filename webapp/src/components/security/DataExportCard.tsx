import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, Clock, Download, FileArchive, GraduationCap, IdCard, LifeBuoy, MessagesSquare, Package, Sparkles, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { SecurityCard } from "./SecurityCard";
import { Notice } from "./Notice";
import { useAuth } from "../../lib/auth";
import { useOrders } from "../../lib/orders";
import { useProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import { useFormat } from "../../lib/format";
import { FILE_LINK_DAYS, fetchPersonalData } from "../../lib/accountPrivacy";
import { archiveFileName } from "../../lib/accountPrivacyMapping";
import { useAccountSecurity } from "../../lib/securityState";

const INCLUDED: { key: string; icon: LucideIcon }[] = [
  { key: "account", icon: IdCard },
  { key: "profile", icon: UserRound },
  { key: "orders", icon: Package },
  { key: "courses", icon: GraduationCap },
  { key: "studio", icon: Sparkles },
  { key: "community", icon: MessagesSquare },
  { key: "service", icon: LifeBuoy },
];

type State = { kind: "idle" } | { kind: "preparing" } | { kind: "done" } | { kind: "tooSoon"; retryAt: string } | { kind: "failed" };

function formatTime(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function saveJson(archive: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Download your personal data" — the GDPR right of access and portability.
 *
 * One button: the database gathers everything linked to the account
 * (`my_personal_data()`), the browser adds download links to the member's own
 * files and saves one JSON file. Nothing is kept on our side, so there is no
 * "processing" or expiry to follow. At most one archive every 5 minutes.
 *
 * Without Supabase (mock mode, smoke tests) the file is built from the demo
 * session and says so.
 */
export function DataExportCard() {
  const { formatDate } = useFormat();
  const { t, i18n } = useTranslation();
  const { realAuth, profile } = useAuth();
  const { orders } = useOrders();
  const { enrollments } = useProgress();
  const { showToast } = useToast();
  const { markExported } = useAccountSecurity();
  const [state, setState] = useState<State>({ kind: "idle" });

  const download = async () => {
    setState({ kind: "preparing" });
    let archive: Record<string, unknown>;
    if (realAuth) {
      const answer = await fetchPersonalData();
      if (answer.kind === "tooSoon") return setState({ kind: "tooSoon", retryAt: answer.retryAt });
      if (answer.kind === "error") return setState({ kind: "failed" });
      archive = answer.archive;
    } else {
      archive = {
        format: "global-toothgems-personal-data/2",
        generated_at: new Date().toISOString(),
        account: { email: profile?.email },
        profile,
        shop: { orders },
        academy: { courses: enrollments },
        note: t("security.export.mockNote"),
      };
    }
    saveJson(archive, archiveFileName(String(archive.generated_at ?? new Date().toISOString())));
    markExported();
    setState({ kind: "done" });
    showToast(t("security.export.toastDownloadTitle"), t("security.export.toastDownloadBody"));
  };

  const preparing = state.kind === "preparing";

  return (
    <SecurityCard
      id="security-export"
      icon={FileArchive}
      title={t("security.export.title")}
      description={<p>{t("security.export.body")}</p>}
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
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.export.format", { days: FILE_LINK_DAYS })}</p>
      </div>

      <div role="status" aria-live="polite" className="grid gap-3">
        {state.kind === "done" && (
          <Notice tone="success" icon={CircleCheck} title={t("security.export.doneTitle")}>
            <p>{t("security.export.doneBody")}</p>
          </Notice>
        )}
        {state.kind === "tooSoon" && (
          <Notice tone="warning" icon={Clock} title={t("security.export.tooSoonTitle")}>
            <p>{t("security.export.tooSoonBody", { date: formatDate(state.retryAt), time: formatTime(state.retryAt, i18n.language) })}</p>
          </Notice>
        )}
      </div>
      {state.kind === "failed" && (
        <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
          {t("security.export.failedBody")}
        </Notice>
      )}

      <div>
        <Button variant="dark" iconLeft={Download} loading={preparing} onClick={() => void download()}>
          {preparing ? t("security.export.preparing") : t("security.export.download")}
        </Button>
      </div>
    </SecurityCard>
  );
}
