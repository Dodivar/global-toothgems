import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { FlaskConical } from "lucide-react";
import clsx from "clsx";
import { Badge, type BadgeTone } from "../ui/Badge";

/**
 * The shared shell of the 404, server-error and maintenance pages.
 *
 * One reading order on every screen size — status, headline, what happened,
 * what to do — with the illustration beside it on desktop and above it,
 * kept small, on a phone. The copy column comes first in the DOM, so a
 * screen reader reaches the headline and the actions before anything else;
 * the illustration is `aria-hidden` and only changes visual order.
 *
 * The status label is text plus an icon inside a `Badge`, never a colour on
 * its own, and the headline is the page's only `h1`.
 */

const SYSTEM_PREVIEW_PATHS = {
  notFound: "/page-introuvable",
  serverError: "/erreur",
  maintenance: "/maintenance",
} as const;

type SystemPageKind = keyof typeof SYSTEM_PREVIEW_PATHS;

interface SystemPageProps {
  kind: SystemPageKind;
  status: { label: string; icon: LucideIcon; tone?: BadgeTone };
  title: string;
  body: ReactNode;
  /** A short secondary line under the body: the missing address, a reassurance. */
  note?: ReactNode;
  actions: ReactNode;
  /** Anything under the actions: a live status message, a status card. */
  after?: ReactNode;
  visual: ReactNode;
}

/** Entrance stagger. Short on purpose: the actions are usable immediately. */
const delay = (ms: number) => ({ "--gt-delay": `${ms}ms` }) as CSSProperties;

export function SystemPage({ kind, status, title, body, note, actions, after, visual }: SystemPageProps) {
  const { t } = useTranslation();

  // The tab title names the situation too: it is what a visitor with twenty
  // tabs open, or a screen reader announcing the page, hears first.
  useEffect(() => {
    const previous = document.title;
    document.title = `${t(`errors.${kind}.documentTitle`)} · Global Toothgems`;
    return () => {
      document.title = previous;
    };
  }, [kind, t]);

  return (
    <section
      aria-labelledby="system-page-title"
      className="relative isolate overflow-hidden bg-[var(--surface-page)]"
    >
      {/* Page atmosphere: the registration journey's pastel wash, one step quieter. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(760px_460px_at_92%_4%,rgba(185,205,229,.42),transparent_62%),radial-gradient(620px_420px_at_-8%_96%,rgba(231,238,247,.85),transparent_60%)]"
      />

      <div className="mx-auto grid min-h-[min(760px,calc(100svh-72px))] max-w-[var(--max-width-content)] content-center items-center gap-8 px-[var(--gutter-page)] py-[clamp(32px,7vw,88px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-[var(--gutter-page-lg)]">
        {/* Centred while the illustration sits above it; left-aligned beside it. */}
        <div className="mx-auto grid w-full max-w-[600px] justify-items-center gap-5 text-center sm:gap-6 lg:mx-0 lg:justify-items-start lg:text-left">
          <div className="gt-sys-enter" style={delay(0)}>
            <Badge tone={status.tone ?? "brand"} icon={status.icon}>
              {status.label}
            </Badge>
          </div>

          <h1
            id="system-page-title"
            style={delay(60)}
            className="gt-sys-enter max-w-[16ch] text-balance text-[length:clamp(32px,4.6vw,52px)] leading-[1.08] tracking-[var(--tracking-display)] text-[var(--text-primary)]"
          >
            {title}
          </h1>

          <div style={delay(110)} className="gt-sys-enter grid gap-3">
            <p className="m-0 mx-auto max-w-[46ch] lg:mx-0 text-[length:var(--text-body-lg)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
              {body}
            </p>
            {note && (
              <p className="m-0 mx-auto max-w-[46ch] lg:mx-0 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                {note}
              </p>
            )}
          </div>

          {/* Stacked, full-width thumb targets on a phone; a row from tablet up. */}
          <div
            style={delay(160)}
            className="gt-sys-enter mt-1 grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center lg:justify-start [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto"
          >
            {actions}
          </div>

          {after && (
            <div className="gt-sys-enter w-full" style={delay(200)}>
              {after}
            </div>
          )}
        </div>

        {/* First on a phone so the page opens on the brand, but capped at 220px
            so the headline and the primary action still sit above the fold. */}
        <div style={delay(80)} className="gt-sys-enter order-first lg:order-none">
          {visual}
        </div>
      </div>

      <PreviewSwitch current={kind} />
    </section>
  );
}

/**
 * Prototype-only navigation between the three system pages, so they can be
 * reviewed side by side. Labelled as such, and set apart from the page's own
 * actions so it never competes with them.
 */
function PreviewSwitch({ current }: { current: SystemPageKind }) {
  const { t } = useTranslation();
  const kinds = Object.keys(SYSTEM_PREVIEW_PATHS) as SystemPageKind[];

  return (
    <nav
      aria-label={t("errors.preview.label")}
      className="mx-auto flex max-w-[var(--max-width-content)] flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] px-[var(--gutter-page)] py-4 text-[length:var(--text-caption)] text-[var(--text-muted)] lg:px-[var(--gutter-page-lg)]"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <FlaskConical size={13} aria-hidden="true" />
        {t("errors.preview.label")}
      </span>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {kinds.map((kind) => {
          const active = kind === current;
          return (
            <li key={kind}>
              <Link
                to={SYSTEM_PREVIEW_PATHS[kind]}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "inline-flex min-h-[32px] items-center rounded-[var(--radius-pill)] px-3 font-semibold transition-colors duration-[var(--duration-fast)]",
                  active
                    ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                    : "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                )}
              >
                {t(`errors.preview.${kind}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
