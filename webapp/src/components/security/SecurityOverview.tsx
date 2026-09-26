import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, BadgeCheck, Clock, Download, FileArchive, KeyRound, LoaderCircle, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import { useAccountSecurity } from "../../lib/securityState";
import { formatDate } from "../../lib/format";

function Tile({
  href,
  icon: Icon,
  label,
  badge,
  badgeTone,
  badgeIcon,
  detail,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge: string;
  badgeTone: BadgeTone;
  badgeIcon: LucideIcon;
  detail: ReactNode;
}) {
  const { t } = useTranslation();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.querySelector<HTMLElement>(`${href}-title`);
    if (!target) return;
    e.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(href)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };

  return (
    <li className="min-w-0">
      <a
        href={href}
        onClick={onClick}
        className="group grid h-full gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-white/80 p-4 transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-[var(--gt-blue-300)] hover:shadow-[var(--shadow-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
            <Icon size={14} aria-hidden="true" />
            {label}
          </span>
          <ArrowDown size={14} aria-hidden="true" className="text-[var(--text-subtle)] transition-transform group-hover:translate-y-0.5" />
        </span>
        <span>
          <Badge tone={badgeTone} icon={badgeIcon} size="sm">
            {badge}
          </Badge>
        </span>
        <span className="text-[length:var(--text-caption)] leading-[1.45] text-[var(--text-body)]">{detail}</span>
        <span className="sr-only">{t("security.overview.goTo")}</span>
      </a>
    </li>
  );
}

/**
 * The summary at the top of Security & privacy: where the account stands, in
 * three tiles that each jump to the section that changes them. Only states the
 * product actually has are listed — there is no two-step verification yet, so
 * there is no tile pretending otherwise.
 */
export function SecurityOverview() {
  const { t } = useTranslation();
  const { pendingEmail, passwordChangedAt, dataExport } = useAccountSecurity();
  const needsAttention = pendingEmail !== null || dataExport.status === "ready";

  const exportTile = {
    none: { badge: t("security.overview.exportNone"), tone: "neutral" as BadgeTone, icon: FileArchive, detail: t("security.overview.exportNoneDetail") },
    processing: { badge: t("security.overview.exportProcessing"), tone: "brand" as BadgeTone, icon: LoaderCircle, detail: t("security.overview.exportProcessingDetail") },
    ready: {
      badge: t("security.overview.exportReady"),
      tone: "success" as BadgeTone,
      icon: Download,
      detail: dataExport.expiresAt ? t("security.overview.exportReadyDetail", { date: formatDate(dataExport.expiresAt) }) : "",
    },
    expired: { badge: t("security.overview.exportExpired"), tone: "warning" as BadgeTone, icon: Clock, detail: t("security.overview.exportExpiredDetail") },
  }[dataExport.status];

  return (
    <section
      aria-labelledby="security-overview-title"
      className="grid gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,var(--gt-blue-50),var(--gt-white)_60%)] p-5 shadow-[var(--shadow-xs)] sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-12 w-12 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[var(--gt-ink-900)] shadow-[var(--shadow-sm)]"
        >
          <ShieldCheck size={22} strokeWidth={1.8} />
        </span>
        <div className="grid min-w-0 flex-1 basis-[220px] gap-0.5">
          <h2 id="security-overview-title" className="text-[length:var(--text-h4)]">
            {t(needsAttention ? "security.overview.attentionTitle" : "security.overview.okTitle")}
          </h2>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t(pendingEmail ? "security.overview.attentionEmail" : dataExport.status === "ready" ? "security.overview.attentionExport" : "security.overview.okBody")}
          </p>
        </div>
      </div>

      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
        <Tile
          href="#security-email"
          icon={Mail}
          label={t("security.overview.email")}
          badge={pendingEmail ? t("security.overview.emailPending") : t("security.overview.emailVerified")}
          badgeTone={pendingEmail ? "warning" : "success"}
          badgeIcon={pendingEmail ? TriangleAlert : BadgeCheck}
          detail={pendingEmail ? t("security.overview.emailPendingDetail", { email: pendingEmail }) : t("security.overview.emailVerifiedDetail")}
        />
        <Tile
          href="#security-password"
          icon={KeyRound}
          label={t("security.overview.password")}
          badge={t("security.overview.passwordSet")}
          badgeTone="success"
          badgeIcon={BadgeCheck}
          detail={
            passwordChangedAt
              ? t("security.overview.passwordChanged", { date: formatDate(passwordChangedAt) })
              : t("security.overview.passwordSinceSignUp")
          }
        />
        <Tile
          href="#security-export"
          icon={FileArchive}
          label={t("security.overview.data")}
          badge={exportTile.badge}
          badgeTone={exportTile.tone}
          badgeIcon={exportTile.icon}
          detail={exportTile.detail}
        />
      </ul>
    </section>
  );
}
