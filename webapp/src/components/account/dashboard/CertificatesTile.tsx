import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Award } from "lucide-react";
import { DashboardTile } from "./DashboardTile";
import { pick, type Localized } from "../../../data/types";
import { useFormat } from "../../../lib/format";
import type { EarnedCertificate } from "../../../lib/memberDashboard";

/**
 * The certificates earned, by name: the latest one and its date, the count
 * of the others. Shown only once there is at least one — an empty collection
 * is the certificates page's to explain, not the dashboard's.
 */
export function CertificatesTile({ earned, lang }: { earned: EarnedCertificate<{ title: Localized }>[]; lang: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const titleId = useId();
  const [latest] = earned;
  if (!latest) return null;
  const others = earned.length - 1;

  return (
    <DashboardTile icon={Award} eyebrow={t("account.navCertificates")} to="/compte/attestations" cta={t("account.dashboard.certificatesCta")} labelledBy={titleId}>
      <h3 id={titleId} className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
        {pick(latest.course.title, lang)}
      </h3>
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {latest.completedOn ? t("account.certificateAwardedOn", { date: formatDate(latest.completedOn) }) : t("account.certificateDocSeal")}
        {others > 0 && ` · ${t("account.dashboard.certificatesOthers", { count: others })}`}
      </p>
    </DashboardTile>
  );
}
