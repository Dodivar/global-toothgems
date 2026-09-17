import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink, Menu } from "lucide-react";
import clsx from "clsx";

export interface Crumb {
  label: string;
  /** Omitted on the current page, which is not a link. */
  to?: string;
}

/**
 * Top bar of the workspace: where you are, what the page is, what you can do
 * here.
 *
 * The title lives in the header rather than in each page body so every screen
 * starts at the same vertical position — the thing that makes navigating
 * between sections feel instant rather than jumpy.
 */
export function AdminHeader({
  title,
  crumbs,
  description,
  actions,
  onOpenNav,
}: {
  title: string;
  crumbs?: Crumb[];
  description?: string;
  actions?: ReactNode;
  onOpenNav: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "fr";

  return (
    <header className="sticky top-0 z-[60] border-b border-[var(--border-subtle)] bg-[var(--admin-page)]/92 backdrop-blur-[10px]">
      <div className="flex min-h-[var(--admin-header-h)] flex-wrap items-center gap-x-4 gap-y-2 px-[var(--admin-gutter)] py-3">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label={t("admin.shell.openNav")}
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] lg:hidden"
        >
          <Menu size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          {/* The breadcrumb is dropped below `sm`: beside the burger and the
              title it costs two lines and adds nothing a phone needs. */}
          {crumbs && crumbs.length > 0 && (
            <nav aria-label={t("admin.shell.breadcrumb")} className="mb-0.5 hidden sm:block">
              <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight size={12} aria-hidden="true" className="text-[var(--text-subtle)]" />}
                      {crumb.to && !last ? (
                        <Link
                          to={crumb.to}
                          className="rounded-[2px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span aria-current={last ? "page" : undefined} className={clsx(last && "text-[var(--text-body)]")}>
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <h1 className="truncate text-[length:var(--text-h3)] leading-[var(--leading-snug)]">{title}</h1>
          {description && (
            <p className="m-0 mt-0.5 truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>
          )}
        </div>

        <div className="flex flex-none items-center gap-2">
          {actions}

          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[var(--border-subtle)] md:block" />

          <button
            type="button"
            onClick={() => i18n.changeLanguage(lang.startsWith("en") ? "fr" : "en")}
            aria-label={t("common.langSwitchAria")}
            className="hidden h-9 items-center rounded-[var(--admin-radius-sm)] px-2.5 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] md:inline-flex"
          >
            {t("common.langSwitchCode")}
          </button>

          {/* The storefront is the other half of the job; the admin should never
              be a dead end away from it. */}
          <Link
            to="/"
            className="hidden h-9 items-center gap-1.5 rounded-[var(--admin-radius-sm)] px-2.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] md:inline-flex"
          >
            {t("admin.shell.viewStore")}
            <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
