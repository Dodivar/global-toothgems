import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUp, ChevronRight, MessageCircle, NotebookPen } from "lucide-react";
import clsx from "clsx";
import { useReviewMode } from "../../lib/reviewMode";
import { useCookieConsent } from "../../lib/cookieConsent";
import { contactHref, LEGAL_PATHS } from "../../data/legal/routes";
import type { CalloutTone, ContactCategory } from "../../data/legal/types";
import { ToneLabel } from "./ContentBlocks";

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("legal.breadcrumb")}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" className="text-[var(--gt-ink-400)]" />}
            {item.to ? (
              <Link to={item.to} className="rounded-sm py-1 transition-colors hover:text-[var(--text-primary)] hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="py-1 font-semibold text-[var(--text-primary)]">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The prototype's review strip. It carries the one sentence every legal page
 * must show a reviewer — business information is unverified — and the switch
 * that hides the internal notes to preview the customer-facing page.
 */
export function ReviewBar() {
  const { t } = useTranslation();
  const { showNotes, setShowNotes } = useReviewMode();
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-md)] px-4 py-2.5 text-[length:var(--text-caption)]",
        showNotes ? "gt-review-note" : "border border-dashed border-[var(--border-default)]",
      )}
    >
      <span className="inline-flex items-center gap-2 text-[var(--text-body)]">
        <NotebookPen size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
        <span>
          <strong className="font-semibold text-[var(--text-primary)]">{t("legal.review.barLabel")}</strong>{" "}
          {t("legal.review.barText")}
        </span>
      </span>
      <button
        type="button"
        aria-pressed={showNotes}
        onClick={() => setShowNotes(!showNotes)}
        className="rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-1.5 font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
      >
        {showNotes ? t("legal.review.hide") : t("legal.review.show")}
      </button>
    </div>
  );
}

const KEY_TONES: CalloutTone[] = ["legal", "policy", "instruction", "verify"];

/** Explains the four labels used through the page, once, up front. */
export function ContentKey() {
  const { t } = useTranslation();
  return (
    <details className="group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
        {t("legal.key.title")}
        <ChevronRight size={16} aria-hidden="true" className="flex-none transition-transform duration-[var(--duration-fast)] group-open:rotate-90" />
      </summary>
      <dl className="m-0 grid gap-3 border-t border-[var(--border-subtle)] px-4 py-4 sm:grid-cols-2">
        {KEY_TONES.map((tone) => (
          <div key={tone} className="grid gap-1">
            <dt>
              <ToneLabel tone={tone} />
            </dt>
            <dd className="m-0 text-[length:var(--text-caption)] leading-[1.55] text-[var(--text-muted)]">{t(`legal.key.${tone}`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export interface TocEntry {
  id: string;
  label: string;
  part?: string;
}

/** Tracks which section is being read, for the table of contents. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = ids.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      // A band just under the sticky header: the section crossing it is "current".
      { rootMargin: "-110px 0px -65% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function TocList({ entries, active, numbered, onNavigate }: { entries: TocEntry[]; active: string | null; numbered?: boolean; onNavigate?: () => void }) {
  return (
    <ol className="m-0 grid list-none gap-0.5 p-0">
      {entries.map((entry, i) => (
        <li key={entry.id}>
          {entry.part && (
            <span className="mb-1 mt-3 block px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--text-muted)] first:mt-0">
              {entry.part}
            </span>
          )}
          <a
            href={`#${entry.id}`}
            onClick={onNavigate}
            aria-current={active === entry.id ? "location" : undefined}
            className={clsx(
              "flex gap-2 rounded-[var(--radius-sm)] border-l-2 px-3 py-1.5 text-[13px] leading-[1.4] transition-colors",
              active === entry.id
                ? "border-[var(--gt-blue-600)] bg-[var(--surface-brand-wash-strong)] font-semibold text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
            )}
          >
            {numbered && <span className="w-5 flex-none tabular-nums text-[var(--text-muted)]">{i + 1}.</span>}
            <span>{entry.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Desktop: a sticky column. Called once; the mobile version lives in `MobileToc`. */
export function DesktopToc({ entries, numbered }: { entries: TocEntry[]; numbered?: boolean }) {
  const { t } = useTranslation();
  const key = entries.map((e) => e.id).join("|");
  const ids = useMemo(() => key.split("|"), [key]);
  const active = useActiveSection(ids);
  return (
    <nav aria-label={t("legal.toc.title")} className="sticky top-[100px] hidden max-h-[calc(100vh-124px)] overflow-y-auto pb-6 pr-2 lg:block">
      <span className="gt-eyebrow mb-3 block px-3">{t("legal.toc.title")}</span>
      <TocList entries={entries} active={active} numbered={numbered} />
    </nav>
  );
}

/** Phones and tablets: a disclosure at the top of the document. */
export function MobileToc({ entries, numbered }: { entries: TocEntry[]; numbered?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label={t("legal.toc.title")} className="lg:hidden">
      <details
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
        className="group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
          <span>
            {t("legal.toc.title")}{" "}
            <span className="font-normal text-[var(--text-muted)]">· {t("legal.toc.count", { count: entries.length })}</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="flex-none transition-transform duration-[var(--duration-fast)] group-open:rotate-90" />
        </summary>
        <div className="max-h-[60vh] overflow-y-auto border-t border-[var(--border-subtle)] p-2">
          <TocList entries={entries} active={null} numbered={numbered} onNavigate={() => setOpen(false)} />
        </div>
      </details>
    </nav>
  );
}

/**
 * Back to the top of the page, once the reader is well into it. Hidden while
 * the cookie banner is up so the two never overlap on a phone. Focus goes to
 * the page title, so a keyboard user lands where a sighted one does.
 */
export function BackToTop({ targetId }: { targetId: string }) {
  const { t } = useTranslation();
  const { record } = useCookieConsent();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!shown || !record) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        document.getElementById(targetId)?.focus({ preventScroll: true });
      }}
      className="gt-glass fixed bottom-5 right-5 z-[70] inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-white sm:bottom-8 sm:right-8"
    >
      <ArrowUp size={16} aria-hidden="true" />
      {t("legal.backToTop")}
    </button>
  );
}

/** Closing prompt: a question about this page goes straight to the right form category. */
export function ContactCta({ category }: { category: ContactCategory }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="legal-contact-cta"
      className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--gt-blue-200)] bg-[linear-gradient(135deg,var(--gt-blue-100),var(--gt-blue-50)_60%,var(--gt-white))] p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-8"
    >
      <div className="flex gap-4">
        <span aria-hidden="true" className="hidden h-11 w-11 flex-none place-items-center rounded-full bg-[var(--surface-card)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)] sm:grid">
          <MessageCircle size={20} />
        </span>
        <div className="grid gap-1">
          <h2 id="legal-contact-cta" className="text-[length:var(--text-h4)]">
            {t("legal.cta.title")}
          </h2>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("legal.cta.body")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={contactHref(category)}
          className="inline-flex h-[46px] items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-[22px] text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]"
        >
          {t("legal.cta.contact")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link
          to={LEGAL_PATHS.faq}
          className="inline-flex h-[46px] items-center rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-[22px] text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]"
        >
          {t("legal.cta.faq")}
        </Link>
      </div>
    </section>
  );
}
