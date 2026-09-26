import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Cookie, FileText, HelpCircle, Landmark, Mail, RotateCcw, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import { LegalLayout } from "../../components/legal/LegalLayout";
import { ComplianceChecklist } from "../../components/legal/ComplianceChecklist";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { useCookieConsent } from "../../lib/cookieConsent";

interface Tile {
  to: string;
  icon: LucideIcon;
  key: string;
}

const HELP: Tile[] = [
  { to: LEGAL_PATHS.faq, icon: HelpCircle, key: "faq" },
  { to: LEGAL_PATHS.shipping, icon: Truck, key: "shipping" },
  { to: LEGAL_PATHS.returns, icon: RotateCcw, key: "returns" },
  { to: LEGAL_PATHS.contact, icon: Mail, key: "contact" },
];

const LEGAL: Tile[] = [
  { to: LEGAL_PATHS.legalNotice, icon: Landmark, key: "legalNotice" },
  { to: LEGAL_PATHS.terms, icon: FileText, key: "terms" },
  { to: LEGAL_PATHS.privacy, icon: ShieldCheck, key: "privacy" },
  { to: LEGAL_PATHS.cookies, icon: Cookie, key: "cookies" },
];

/**
 * Help centre: the landing page the breadcrumbs lead back to, with every help
 * and legal page one click away, and — for reviewers only — the pre-launch
 * checklist.
 */
export function HelpCentre() {
  const { t } = useTranslation();
  const { openSettings } = useCookieConsent();

  const tiles = (items: Tile[]) => (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
      {items.map(({ to, icon: Icon, key }) => (
        <li key={key}>
          <Link
            to={to}
            className="group flex h-full items-start gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-[var(--gt-blue-300)] hover:shadow-[var(--shadow-sm)]"
          >
            <span aria-hidden="true" className="grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
              <Icon size={20} />
            </span>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex items-center justify-between gap-2 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">
                {t(`legal.pages.${key}`)}
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="flex-none text-[var(--text-muted)] transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5"
                />
              </span>
              <span className="text-[length:var(--text-body-sm)] leading-[1.55] text-[var(--text-muted)]">{t(`legal.hub.desc.${key}`)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <LegalLayout eyebrow={t("legal.hub.eyebrow")} title={t("legal.hub.title")} intro={t("legal.hub.intro")} crumbs={[]} contactCategory="other">
      <section aria-labelledby="hub-help" className="grid gap-4">
        <h2 id="hub-help" className="text-[length:var(--text-h3)]">
          {t("legal.hub.helpTitle")}
        </h2>
        {tiles(HELP)}
      </section>
      <section aria-labelledby="hub-legal" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="hub-legal" className="text-[length:var(--text-h3)]">
            {t("legal.hub.legalTitle")}
          </h2>
          <button type="button" onClick={openSettings} className="gt-legal-link inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)]">
            <Cookie size={15} aria-hidden="true" />
            {t("legal.cookies.settingsLink")}
          </button>
        </div>
        {tiles(LEGAL)}
      </section>
      <ComplianceChecklist />
    </LegalLayout>
  );
}
