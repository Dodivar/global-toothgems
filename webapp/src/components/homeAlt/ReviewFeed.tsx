import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowUpRight, GraduationCap, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Stars } from "../reviews/Stars";
import type { CustomerReview } from "../../data/reviewSystem";
import { getCourse } from "../../data/courses";
import { getProduct } from "../../data/products";
import { pick } from "../../data/types";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { courseHref } from "../../lib/academyUrl";
import { useFormat } from "../../lib/format";
import { publicDate } from "../../lib/reviewRules";
import { useReviewAuthor, useReviews } from "../../lib/reviews";
import { useReveal } from "../../lib/useReveal";

type Filter = "all" | "academy" | "product";
const FILTERS: Filter[] = ["all", "academy", "product"];

/** Newest published reviews shown on the home page. */
const FEED_LIMIT = 12;

/** Pins shown on a phone before "Show more": two columns, three rows. */
const PHONE_LIMIT = 6;

/** Placeholder heights while the reviews load: enough to hint at a mosaic. */
const SKELETON_HEIGHTS = [260, 180, 220, 300];

function kindOf(review: CustomerReview): Exclude<Filter, "all"> {
  return review.subject.kind === "course" ? "academy" : "product";
}

/**
 * Social proof as a Pinterest-style feed: the newest published reviews, in
 * masonry columns of varied heights — photo pins and quote-only pins on a
 * green tint. Read from the review store, so with Supabase configured these
 * are the reviews in the database that moderation has published, nothing
 * else. Academy and shop reviews share the feed; each pin says which it is
 * with a tag, and the chips above filter by source when both are present.
 *
 * The section stays out of the page when there is no published review to
 * show (none yet, or the store could not be read).
 *
 * Emerald carries the energy here — the stars, the tags, the quote pins —
 * which is a deliberate exception to "emerald is for calls to action" on
 * this one section.
 */
export function ReviewFeed() {
  const { reviews, loading } = useReviews();
  const published = useMemo(
    () =>
      reviews
        .filter((r) => r.status === "published")
        .sort((a, b) => publicDate(b).localeCompare(publicDate(a)))
        .slice(0, FEED_LIMIT),
    [reviews],
  );

  // A separate component, so its reveal is set up when the section actually mounts.
  if (!loading && published.length === 0) return null;
  return <FeedSection published={published} loading={loading} />;
}

function FeedSection({ published, loading }: { published: CustomerReview[]; loading: boolean }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const firstMore = useRef<HTMLElement>(null);
  const focusFirstMore = useRef(false);

  // "Show more" leaves with the click: once the new pins are rendered, focus
  // the first of them so keyboard and screen-reader users land on them.
  useEffect(() => {
    if (!expanded || !focusFirstMore.current) return;
    focusFirstMore.current = false;
    firstMore.current?.focus();
  }, [expanded]);

  const count = (f: Filter) => published.filter((r) => f === "all" || kindOf(r) === f).length;
  // A chip that would filter to nothing is left out; with a single source, so is the whole group.
  const filters = FILTERS.filter((f) => f === "all" || count(f) > 0);
  const showFilters = filters.length > 2;
  const active = filters.includes(filter) ? filter : "all";
  const items = published.filter((r) => active === "all" || kindOf(r) === active);
  const hasMore = !expanded && items.length > PHONE_LIMIT;

  return (
    <section
      ref={ref}
      aria-labelledby="gt-alt-reviews-title"
      aria-busy={loading || undefined}
      className="gt-reveal gt-alt-section w-full bg-[var(--surface-brand-wash-strong)]"
    >
      <div className="gt-alt-wide px-[var(--gt-alt-gutter)]">
        <div className="mb-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:mb-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-4">
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.reviews.eyebrow")}</span>
            <h2 id="gt-alt-reviews-title" className="gt-alt-h2 max-w-[18ch]">{t("homeAlt.reviews.title")}</h2>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("homeAlt.reviews.body")}</p>
          </div>
          {showFilters && (
            <div role="group" aria-label={t("homeAlt.reviews.filterLabel")} className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active === f}
                  onClick={() => {
                    setFilter(f);
                    setExpanded(false);
                  }}
                  className={clsx(
                    "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[12px] font-semibold sm:h-10 sm:gap-2 sm:px-4 sm:text-[13px] transition-[background-color,border-color,color] duration-[var(--duration-fast)]",
                    active === f
                      ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-off-white)]"
                      : "border-[var(--gt-blue-300)] bg-white/70 text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
                  )}
                >
                  {t(`homeAlt.reviews.filter.${f}`)}
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] tabular-nums",
                      active === f ? "bg-[var(--accent-cta)] text-[var(--gt-ink-900)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-ink-700)]",
                    )}
                  >
                    {count(f)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Masonry by CSS columns: two on a phone, as the app does, four on a
            wide screen. Keyed on the filter so the pins settle in again. */}
        {loading && published.length === 0 ? (
          <ul aria-hidden="true" className="m-0 list-none columns-2 gap-3 p-0 sm:gap-4 lg:columns-3 xl:columns-4 xl:gap-5">
            {SKELETON_HEIGHTS.map((h, i) => (
              <li
                key={i}
                className="mb-3 break-inside-avoid animate-pulse rounded-[var(--radius-xl)] bg-white/60 sm:mb-4 xl:mb-5"
                style={{ height: h }}
              />
            ))}
          </ul>
        ) : (
          <ul key={active} className="m-0 list-none columns-2 gap-3 p-0 sm:gap-4 lg:columns-3 xl:columns-4 xl:gap-5">
            {items.map((review, i) => (
              <li
                key={review.id}
                className={clsx("gt-alt-pin-in mb-3 break-inside-avoid sm:mb-4 xl:mb-5", i >= PHONE_LIMIT && !expanded && "hidden sm:block")}
                style={{ "--gt-delay": `${Math.min(i, 8) * 60}ms` } as CSSProperties}
              >
                <ReviewPin review={review} pinRef={i === PHONE_LIMIT ? firstMore : undefined} />
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <div className="mt-4 flex justify-center sm:hidden">
            <Button
              variant="outline"
              onClick={() => {
                focusFirstMore.current = true;
                setExpanded(true);
              }}
            >
              {t("homeAlt.reviews.showMore", { count: items.length - PHONE_LIMIT })}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewPin({ review, pinRef }: { review: CustomerReview; pinRef?: Ref<HTMLElement> }) {
  const { formatDate } = useFormat();
  const { t, i18n } = useTranslation();
  const { products } = useCatalog();
  const authorOf = useReviewAuthor();
  const lang = i18n.language;
  const academy = review.subject.kind === "course";
  const author = authorOf(review);
  const photo = review.photos[0];

  // Name and link the course or product only when it exists in the current catalogue.
  const course = academy ? getCourse(review.subject.id) : undefined;
  const product = academy ? undefined : getProduct(review.subject.id, products);
  const refHref = course ? courseHref(course.id) : product ? `/boutique/${product.id}` : null;
  const refName = course ? pick(course.title, lang) : product ? pick(product.name, lang) : null;

  return (
    <article
      ref={pinRef}
      tabIndex={pinRef ? -1 : undefined}
      className={clsx(
        "gt-alt-pin group relative overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-card)] outline-none",
        photo ? "bg-[var(--surface-card)]" : "bg-[var(--gt-emerald-50)] ring-1 ring-[var(--gt-emerald-300)]/60",
      )}
    >
      {photo && (
        <div className="relative overflow-hidden bg-[var(--surface-sunken)]">
          {/* Customer photos come in any shape: shown at their own ratio, capped so a tall one does not take the column. */}
          <img
            src={photo.src}
            alt={photo.alt || t("reviews.photos.fallbackAlt", { name: author })}
            loading="lazy"
            decoding="async"
            className="gt-alt-tile-art block max-h-[420px] min-h-[160px] w-full object-cover"
          />
          <span className="absolute left-2.5 top-2.5 sm:left-3 sm:top-3">
            <KindTag academy={academy} />
          </span>
        </div>
      )}

      <div className={clsx("grid gap-2.5 p-3.5 sm:gap-3 sm:p-5", !photo && "pt-4 sm:pt-5")}>
        {!photo && (
          <span className="justify-self-start">
            <KindTag academy={academy} />
          </span>
        )}
        <span className="flex items-center gap-2">
          <Stars rating={review.rating} size={14} tone="accent" />
          <span aria-hidden="true" className="text-[12px] font-bold tabular-nums text-[var(--gt-emerald-600)]">
            {review.rating.toFixed(1)}
          </span>
        </span>
        {/* The customer's own words, in their own language: never translated. */}
        <blockquote lang={review.lang} className="m-0 grid gap-1.5">
          {review.title && (
            <p className="m-0 text-[14px] font-bold leading-[1.35] text-[var(--text-primary)] sm:text-[16px]">{review.title}</p>
          )}
          <p
            className={clsx(
              "gt-alt-pin-quote m-0 line-clamp-[8] whitespace-pre-line text-[var(--text-primary)]",
              photo ? "text-[13px] leading-[1.5] sm:text-[15px]" : "text-[15px] leading-[1.45] sm:text-[17px]",
            )}
          >
            {review.body}
          </p>
        </blockquote>
        <footer className="grid gap-2 border-t border-[var(--border-subtle)] pt-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={author} academy={academy} />
            <span className="grid min-w-0">
              <span className="truncate text-[13px] font-bold text-[var(--text-primary)]">{author}</span>
              <time dateTime={publicDate(review)} className="truncate text-[11.5px] text-[var(--text-muted)]">
                {formatDate(publicDate(review))}
              </time>
            </span>
          </span>
          {refName && refHref && (
            <span className="text-[12px] leading-snug text-[var(--text-body)]">
              <span className="font-semibold">{academy ? t("homeAlt.reviews.courseRef") : t("homeAlt.reviews.productRef")} · </span>
              <Link to={refHref} className="gt-underline font-semibold">
                {refName}
                <ArrowUpRight size={12} aria-hidden="true" className="ml-0.5 inline align-[-1px]" />
              </Link>
            </span>
          )}
        </footer>
      </div>
    </article>
  );
}

/** Where the review comes from: solid emerald for the Academy, outlined for the shop. */
function KindTag({ academy }: { academy: boolean }) {
  const { t } = useTranslation();
  const Icon = academy ? GraduationCap : ShoppingBag;
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded-[var(--radius-pill)] border px-2 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] shadow-[var(--shadow-xs)]",
        academy
          ? "border-transparent bg-[var(--accent-cta)] text-[var(--gt-ink-900)]"
          : "border-[var(--gt-emerald-300)] bg-white text-[var(--gt-emerald-600)]",
      )}
    >
      <Icon size={11} strokeWidth={2.2} aria-hidden="true" />
      {academy ? t("homeAlt.reviews.academyBadge") : t("homeAlt.reviews.productBadge")}
    </span>
  );
}

/** Initials on a tint: there are no portraits, and a stock face would be a fiction. */
function Avatar({ name, academy }: { name: string; academy: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-bold",
        academy ? "bg-[var(--gt-ink-900)] text-[var(--gt-emerald-300)]" : "bg-[var(--gt-blue-200)] text-[var(--gt-ink-900)]",
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
