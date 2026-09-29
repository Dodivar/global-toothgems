import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, GraduationCap, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";
import { Stars } from "../reviews/Stars";
import { HOME_TESTIMONIALS, type HomeTestimonial } from "../../data/homeAltTestimonials";
import { getCourse } from "../../data/courses";
import { getProduct } from "../../data/products";
import { pick } from "../../data/types";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { courseHref } from "../../lib/academyUrl";
import { useReveal } from "../../lib/useReveal";

/**
 * Social proof from both sides of the business — Academy students and shop
 * customers — with each quote saying which one it is and what it is about.
 *
 * One quote at a time, large, on a small stack of cards; the people are
 * picked from a list beside it (a tablist, so arrow keys move through them).
 * Nothing rotates on its own: a review is read at the reader's pace.
 */
export function TestimonialShowcase() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const [index, setIndex] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const total = HOME_TESTIMONIALS.length;
  const go = (next: number) => setIndex(((next % total) + total) % total);
  const active = HOME_TESTIMONIALS[index];

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: total - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = ((moves[e.key] % total) + total) % total;
    go(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section ref={ref} aria-labelledby="gt-alt-reviews-title" className="gt-reveal gt-alt-section w-full bg-[var(--surface-brand-wash-strong)]">
      <div className="gt-alt-wide grid grid-cols-[minmax(0,1fr)] gap-10 px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-[clamp(48px,6vw,120px)]">
        <div className="grid content-start gap-8">
          <div className="grid gap-4">
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.reviews.eyebrow")}</span>
            <h2 id="gt-alt-reviews-title" className="gt-alt-h2 max-w-[16ch]">{t("homeAlt.reviews.title")}</h2>
            <p className="m-0 max-w-[42ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("homeAlt.reviews.body")}</p>
          </div>

          <div role="tablist" aria-label={t("homeAlt.reviews.pickerLabel")} className="flex gap-2 lg:grid lg:gap-1.5">
            {HOME_TESTIMONIALS.map((item, i) => {
              const selected = i === index;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  id={`gt-alt-review-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="gt-alt-review-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => go(i)}
                  onKeyDown={onTabKey}
                  className={clsx(
                    "gt-alt-review-tab flex items-center gap-3 rounded-[var(--radius-pill)] p-1 text-left transition-[background-color,box-shadow] duration-[var(--duration-fast)] lg:rounded-[var(--radius-lg)] lg:p-2.5 lg:pr-4",
                    selected ? "bg-[var(--surface-card)] shadow-[var(--shadow-card)]" : "hover:bg-white/55",
                  )}
                >
                  <Avatar name={item.author} kind={item.kind} selected={selected} />
                  <span className="sr-only grid min-w-0 gap-0.5 lg:not-sr-only">
                    <span className="truncate text-[14px] font-bold text-[var(--text-primary)]">{item.author}</span>
                    <span className="truncate text-[12px] text-[var(--text-muted)]">
                      {item.kind === "academy" ? t("homeAlt.reviews.academyBadge") : t("homeAlt.reviews.productBadge")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative min-w-0">
          {/* The cards behind: a hint that there is more to read, not content. */}
          <span aria-hidden="true" className="gt-alt-quote-ghost gt-alt-quote-ghost--1 absolute inset-0 rounded-[var(--radius-2xl)]" />
          <span aria-hidden="true" className="gt-alt-quote-ghost gt-alt-quote-ghost--2 absolute inset-0 rounded-[var(--radius-2xl)]" />
          <div
            id="gt-alt-review-panel"
            role="tabpanel"
            aria-labelledby={`gt-alt-review-tab-${active.id}`}
            className="relative rounded-[var(--radius-2xl)] bg-[var(--surface-card)] p-[clamp(24px,4vw,64px)] shadow-[var(--shadow-card-hover)]"
          >
            <TestimonialBody key={active.id} item={active} />
            <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-6">
              <span className="text-[12px] font-semibold tabular-nums tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                {t("homeAlt.reviews.counter", { index: index + 1, total })}
              </span>
              <span className="flex gap-2">
                <IconButton icon={ChevronLeft} variant="outline" size="md" label={t("homeAlt.reviews.prev")} onClick={() => go(index - 1)} />
                <IconButton icon={ChevronRight} variant="outline" size="md" label={t("homeAlt.reviews.next")} onClick={() => go(index + 1)} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialBody({ item }: { item: HomeTestimonial }) {
  const { t, i18n } = useTranslation();
  const { products } = useCatalog();
  const lang = i18n.language;
  const academy = item.kind === "academy";

  // Link the course or product only when it exists in the current catalogue.
  const refHref = academy
    ? getCourse(item.refId)
      ? courseHref(item.refId)
      : null
    : getProduct(item.refId, products)
      ? `/boutique/${item.refId}`
      : null;
  const refName = pick(item.refName, lang);

  return (
    <figure className="gt-alt-quote-in m-0 grid gap-7">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={academy ? "ink" : "brand"} icon={academy ? GraduationCap : ShoppingBag}>
          {academy ? t("homeAlt.reviews.academyBadge") : t("homeAlt.reviews.productBadge")}
        </Badge>
        <Stars rating={item.rating} size={16} />
      </div>
      <blockquote className="m-0">
        <p className="gt-alt-quote m-0 text-[clamp(22px,2.3vw,36px)] font-semibold leading-[1.3] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {pick(item.quote, lang)}
        </p>
      </blockquote>
      <figcaption className="flex flex-wrap items-end justify-between gap-4">
        <span className="flex items-center gap-3">
          <Avatar name={item.author} kind={item.kind} selected />
          <span className="grid">
            <span className="text-[15px] font-bold text-[var(--text-primary)]">{item.author}</span>
            <span className="text-[13px] text-[var(--text-muted)]">{pick(item.place, lang)}</span>
          </span>
        </span>
        <span className="text-[13px] text-[var(--text-body)]">
          <span className="font-semibold">{academy ? t("homeAlt.reviews.courseRef") : t("homeAlt.reviews.productRef")} · </span>
          {refHref ? (
            <Link to={refHref} className="gt-underline inline-flex items-center gap-1 font-semibold">
              {refName}
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          ) : (
            refName
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/** Initials on a tint: there are no portraits, and a stock face would be a fiction. */
function Avatar({ name, kind, selected }: { name: string; kind: HomeTestimonial["kind"]; selected: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "grid h-11 w-11 flex-none place-items-center rounded-full text-[15px] font-bold transition-colors duration-[var(--duration-fast)]",
        kind === "academy"
          ? selected
            ? "bg-[var(--gt-ink-900)] text-[var(--gt-blue-200)]"
            : "bg-[var(--gt-ink-700)] text-[var(--gt-blue-200)]"
          : selected
            ? "bg-[var(--gt-blue-300)] text-[var(--gt-ink-900)]"
            : "bg-[var(--gt-blue-200)] text-[var(--gt-ink-900)]",
      )}
    >
      {initial}
    </span>
  );
}
