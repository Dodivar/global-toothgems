import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import monogram from "../../assets/monogram-blue.png";

/**
 * The prototype's stand-in for a real email: a clearly labelled mock inbox
 * holding the latest message, whose button is the link the email would carry.
 * Same presentation as the registration journey's inbox, so a reviewer
 * recognises it as scaffolding rather than as part of the product.
 */
export function MockInbox({
  to,
  subject,
  children,
  ctaLabel,
  href,
  onOpen,
  hint,
  id = "gt-mock-inbox",
}: {
  to: string;
  subject: string;
  children: ReactNode;
  ctaLabel: string;
  /** In-app path the email's button opens. */
  href?: string;
  onOpen?: () => void;
  hint?: string;
  id?: string;
}) {
  const { t } = useTranslation();
  const titleId = `${id}-title`;
  const ctaClass =
    "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-transparent bg-[var(--accent-cta)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]";

  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] p-3.5 text-left sm:p-4"
    >
      <h2 id={titleId} className="gt-eyebrow flex items-center gap-2 text-[var(--text-muted)]">
        <FlaskConical size={13} aria-hidden="true" />
        {t("security.mockInbox")}
      </h2>
      <article className="grid gap-3 rounded-[var(--radius-md)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <header className="flex items-center gap-3">
          <img src={monogram} alt="" className="h-9 w-9 rounded-full bg-[var(--gt-ink-900)] object-contain p-1.5" />
          <div className="grid min-w-0 flex-1">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">Global Toothgems</strong>
            <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.mailTo", { email: to })}</span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">{t("security.mailNow")}</span>
        </header>
        <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{subject}</p>
        <div className="text-[length:var(--text-body-sm)] text-[var(--text-body)] [&_p]:m-0">{children}</div>
        <div>
          {href ? (
            <Link to={href} onClick={onOpen} className={ctaClass}>
              {ctaLabel}
            </Link>
          ) : (
            <button type="button" onClick={onOpen} className={ctaClass}>
              {ctaLabel}
            </button>
          )}
        </div>
        {hint && <p className="m-0 text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </article>
    </section>
  );
}
