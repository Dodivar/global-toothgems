import { useTranslation } from "react-i18next";
import { Check, Lock, Minus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../ui/Button";
import { OPTIONAL_CATEGORIES, useCookieConsent } from "../../lib/cookieConsent";
import { ReviewNote } from "./ReviewNote";

/**
 * "Your current choices", on the cookie policy: the state of each category in
 * words and icons, when it was decided, and the button to change it — the
 * withdrawal route the policy describes, one click from where it is described.
 */
export function CookieChoicesPanel() {
  const { t, i18n } = useTranslation();
  const { record, openSettings, reset } = useCookieConsent();

  const status = (allowed: boolean | null) => {
    if (allowed === null)
      return { icon: Minus, label: t("legal.cookies.status.undecided"), cls: "bg-[var(--gt-ink-100)] text-[var(--text-body)]" };
    return allowed
      ? { icon: Check, label: t("legal.cookies.status.allowed"), cls: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" }
      : { icon: X, label: t("legal.cookies.status.refused"), cls: "bg-[var(--gt-ink-100)] text-[var(--text-body)]" };
  };

  const decided = record
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" }).format(new Date(record.decidedAt))
    : null;

  return (
    <div className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <strong className="text-[length:var(--text-body-lg)] text-[var(--text-primary)]">{t("legal.cookies.currentTitle")}</strong>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]" aria-live="polite">
            {decided ? t("legal.cookies.decidedOn", { date: decided }) : t("legal.cookies.noChoiceYet")}
          </span>
        </div>
        <Button variant="dark" size="sm" iconLeft={SlidersHorizontal} onClick={openSettings}>
          {t("legal.cookies.change")}
        </Button>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3">
          <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
            {t("legal.cookies.category.essential.title")}
          </span>
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-body)]">
            <Lock size={11} aria-hidden="true" />
            {t("legal.cookies.alwaysActive")}
          </span>
        </li>
        {OPTIONAL_CATEGORIES.map((category) => {
          const s = status(record ? record[category] : null);
          return (
            <li key={category} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`legal.cookies.category.${category}.title`)}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>
                <s.icon size={11} aria-hidden="true" />
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
      <ReviewNote>
        <span>{t("legal.cookies.demoNote")} </span>
        {record && (
          <button type="button" onClick={reset} className="gt-legal-link">
            {t("legal.cookies.demoReset")}
          </button>
        )}
      </ReviewNote>
    </div>
  );
}
