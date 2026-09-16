import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

interface SelectorPageProps {
  eyebrow: string;
  title: string;
  body: string;
  /** One card per family; each one links into the filtered collection. */
  children: ReactNode;
}

/**
 * Page chrome shared by /formes and /couleurs.
 *
 * The two pages differ only in what a tile draws, so the heading, the way back
 * to the collection and the card grid live here rather than twice.
 */
export function SelectorPage({ eyebrow, title, body, children }: SelectorPageProps) {
  const { t } = useTranslation();

  return (
    <section className="px-[clamp(14px,4vw,48px)] pb-[var(--section-y)] pt-[clamp(28px,4vw,48px)]">
      <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
        <div className="grid gap-4">
          <Link
            to="/boutique"
            className="inline-flex items-center gap-2 justify-self-start text-xs font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {t("selector.back")}
          </Link>
          <div className="grid max-w-[720px] gap-3">
            <span className="gt-eyebrow">{eyebrow}</span>
            <h1 className="text-[length:var(--text-h1)] tracking-[var(--tracking-display)]">{title}</h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{body}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">{children}</div>
      </div>
    </section>
  );
}

interface SelectorTileProps {
  to: string;
  ariaLabel: string;
  media: ReactNode;
  label: string;
  count: string;
}

/** One family card: the silhouette or swatch, its name, and how many gems. */
export function SelectorTile({ to, ariaLabel, media, label, count }: SelectorTileProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="group grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-center shadow-[var(--shadow-xs)] transition-[transform,border-color,box-shadow] duration-[var(--duration-normal)] hover:-translate-y-[3px] hover:border-[var(--border-brand)] hover:shadow-[var(--shadow-md)]"
    >
      <span className="flex h-[104px] w-[104px] items-center justify-center rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] text-[var(--gt-blue-700)]">
        {media}
      </span>
      <span className="grid gap-1">
        <span className="text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{count}</span>
      </span>
    </Link>
  );
}
