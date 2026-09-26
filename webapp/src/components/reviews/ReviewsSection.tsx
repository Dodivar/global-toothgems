import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, CircleAlert, FlaskConical, MessageSquareText, RotateCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Stars } from "./Stars";
import { ReviewCard, ReviewCardSkeleton } from "./ReviewCard";
import { WriteReviewPanel } from "./WriteReviewPanel";
import { type CustomerReview, type ReviewSubject } from "../../data/reviewSystem";
import {
  PUBLIC_FILTERS,
  PUBLIC_SORTS,
  featuredReview,
  matchesPublicFilter,
  publishedFor,
  sortPublic,
  summarise,
  topTags,
  type PublicFilter,
  type PublicSort,
  type RatingSummary,
} from "../../lib/reviewRules";
import { subjectName, useReviewAuthor, useReviews } from "../../lib/reviews";
import { useReveal } from "../../lib/useReveal";

const PAGE = 6;
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

type Preview = "live" | "empty" | "loading" | "error";

/** Published reviews and their summary for one product or course — also what the page header's rating line reads. */
export function useSubjectReviews(subject: ReviewSubject): { reviews: CustomerReview[]; summary: RatingSummary } {
  const { reviews } = useReviews();
  return useMemo(() => {
    const list = publishedFor(reviews, subject);
    return { reviews: list, summary: summarise(list) };
  }, [reviews, subject]);
}

/**
 * The reviews block of a product or course page.
 *
 * It sits below everything that sells — gallery, price, specifications, FAQ on
 * a product; the whole programme on a course — so it supports the decision
 * without competing with it. Left: the numbers and the way to add your own.
 * Right: one review to read first, the customers' photos, then the list with
 * its filters.
 *
 * The course variant speaks to students ("Verified student", progress at the
 * time of writing) and replaces the featured review with what students
 * highlight most, because on a course the recurring themes say more than one
 * enthusiastic review.
 *
 * Only published reviews ever reach this component's list.
 */
export function ReviewsSection({
  subject,
  id = "avis",
  inline = false,
}: {
  subject: ReviewSubject;
  id?: string;
  /** Inside a page that already has its gutters (the product page), rather than as a full-bleed band. */
  inline?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { loading, demoMode, retry, openPhotos } = useReviews();
  const authorOf = useReviewAuthor();
  const { reviews: published, summary } = useSubjectReviews(subject);
  const ref = useReveal<HTMLDivElement>();
  const course = subject.kind === "course";

  const [filter, setFilter] = useState<PublicFilter>("all");
  const [sort, setSort] = useState<PublicSort>("recent");
  const [shown, setShown] = useState(PAGE);
  const [preview, setPreview] = useState<Preview>("live");

  const state: Preview = preview !== "live" ? preview : demoMode === "error" ? "error" : loading ? "loading" : published.length === 0 ? "empty" : "live";
  const list = state === "live" ? published : [];

  const featured = course ? null : featuredReview(list);
  // The featured review is shown once, above the list — not a second time in it,
  // unless a filter or sort is being used to look for something specific.
  const browsing = filter === "all" && sort === "recent";
  const filtered = sortPublic(
    list.filter((r) => matchesPublicFilter(r, filter) && !(browsing && featured && r.id === featured.id)),
    sort,
  );
  const highlights = course ? topTags(list) : [];
  const photos = list.flatMap((r) => r.photos.map((p, index) => ({ ...p, index, review: r })));
  const name = subjectName(subject, lang);

  const counts: Record<PublicFilter, number> = Object.fromEntries(
    PUBLIC_FILTERS.map((f) => [f, list.filter((r) => matchesPublicFilter(r, f)).length]),
  ) as Record<PublicFilter, number>;

  const choose = (f: PublicFilter) => {
    setFilter(f);
    setShown(PAGE);
  };

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={clsx(
        "scroll-mt-24",
        inline ? "mt-16" : "px-[clamp(14px,4vw,48px)] py-[clamp(56px,7vw,var(--section-y))]",
        course && !inline && "bg-[var(--surface-brand-wash)]",
      )}
    >
      <div ref={ref} className="gt-reveal mx-auto grid max-w-[var(--max-width-content)] grid-cols-[minmax(0,1fr)] gap-[clamp(24px,3.5vw,40px)]">
        <header className="grid gap-2.5">
          <span className="gt-eyebrow flex items-center gap-2">
            {course ? <Users size={13} aria-hidden="true" /> : <MessageSquareText size={13} aria-hidden="true" />}
            {t(course ? "reviews.section.eyebrowCourse" : "reviews.section.eyebrowProduct")}
          </span>
          <h2 id={`${id}-title`} className="text-[length:var(--text-h2)]">
            {t(course ? "reviews.section.titleCourse" : "reviews.section.titleProduct")}
          </h2>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-muted)]">
            {t(course ? "reviews.section.leadCourse" : "reviews.section.leadProduct")}
          </p>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[clamp(20px,3vw,40px)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          {/* ------------------------------ Aside ------------------------------ */}
          <aside className="grid gap-4 lg:sticky lg:top-[96px]" aria-label={t("reviews.section.summaryLabel")}>
            {state === "loading" ? (
              <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6" role="status">
                <span className="sr-only">{t("reviews.section.loading")}</span>
                <div className="gt-skeleton h-10 w-20 rounded-full" />
                <div className="gt-skeleton h-3 w-28 rounded-full" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="gt-skeleton h-2 w-full rounded-full" />
                ))}
              </div>
            ) : (
              <SummaryCard
                summary={state === "live" ? summary : summarise([])}
                course={course}
                active={filter}
                onPick={(stars) => choose(filter === stars ? "all" : stars)}
                disabled={state !== "live"}
              />
            )}
            <WriteReviewPanel subject={subject} />
            <p className="m-0 flex items-start gap-2 px-1 text-[11px] leading-[var(--leading-normal)] text-[var(--text-subtle)]">
              <ShieldCheck size={13} aria-hidden="true" className="mt-0.5 flex-none" />
              {t("reviews.section.howItWorks")}
            </p>
          </aside>

          {/* ------------------------------ Main ------------------------------- */}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
            {state === "error" ? (
              <div role="alert" className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-[var(--space-6)]">
                <span className="flex items-center gap-2 font-semibold text-[var(--status-error-fg)]">
                  <CircleAlert size={17} aria-hidden="true" />
                  {t("reviews.section.errorTitle")}
                </span>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("reviews.section.errorBody")}</p>
                <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={() => { setPreview("live"); retry(); }}>
                  {t("reviews.section.retry")}
                </Button>
              </div>
            ) : state === "loading" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ReviewCardSkeleton />
                <ReviewCardSkeleton />
              </div>
            ) : state === "empty" ? (
              <div className="grid justify-items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(36px,6vw,64px)] text-center">
                <span aria-hidden="true" className="relative grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                  <MessageSquareText size={22} strokeWidth={1.8} />
                  <Sparkles size={13} className="absolute -right-0.5 -top-0.5 text-[var(--accent-highlight)]" />
                </span>
                <h3 className="text-[length:var(--text-h4)]">{t("reviews.empty.firstTitle")}</h3>
                <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                  {t(course ? "reviews.empty.firstBodyCourse" : "reviews.empty.firstBody", { name })}
                </p>
              </div>
            ) : (
              <>
                {featured && browsing && (
                  <div className="grid gap-2">
                    <span className="gt-eyebrow flex items-center gap-2">
                      <Sparkles size={13} aria-hidden="true" className="text-[var(--accent-highlight)]" />
                      {t("reviews.section.featured")}
                    </span>
                    <ReviewCard review={featured} featured />
                  </div>
                )}

                {course && highlights.length > 0 && (
                  <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-card)] p-[var(--space-5)]">
                    <h3 className="text-[length:var(--text-body-md)]">{t("reviews.section.highlightsTitle")}</h3>
                    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                      {highlights.map(({ tag, count }) => (
                        <li key={tag} className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-brand-wash)] py-1.5 pl-3 pr-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)]">
                          {t(`reviews.tags.${tag}`)}
                          <span className="rounded-[var(--radius-pill)] bg-[var(--surface-card)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
                            {t("reviews.section.mentions", { count })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Customer photos: results are the most convincing review of a
                    tooth gem, so they get their own strip before the list. */}
                <div className="grid gap-3">
                  <h3 className="flex items-center gap-2 text-[length:var(--text-body-md)]">
                    <Camera size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
                    {t(course ? "reviews.section.photosCourse" : "reviews.section.photosProduct")}
                    {photos.length > 0 && <span className="text-[length:var(--text-caption)] font-normal text-[var(--text-muted)]">· {photos.length}</span>}
                  </h3>
                  {photos.length === 0 ? (
                    <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-4 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {t("reviews.empty.noPhotos")}
                    </p>
                  ) : (
                    <ul className="gt-scroller m-0 flex list-none gap-2.5 overflow-x-auto p-0 pb-1">
                      {photos.map((p, i) => (
                        <li key={p.src + i} className="flex-none">
                          <button
                            type="button"
                            onClick={() => openPhotos({ photos: p.review.photos, index: p.index, caption: t("reviews.photos.sharedBy", { name: authorOf(p.review) }) })}
                            aria-label={t("reviews.photos.openShared", { name: authorOf(p.review), alt: p.alt || "" })}
                            className={clsx("group block h-[104px] w-[104px] overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:h-[120px] sm:w-[120px]", focusRing)}
                          >
                            <img src={p.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Filters: one scrollable row of chips on a phone, the sort
                    beside it. Radio inputs, so the row is one tab stop. */}
                <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--border-subtle)] pt-5">
                  <fieldset className="m-0 min-w-0 flex-1 border-0 p-0">
                    <legend className="sr-only">{t("reviews.filters.label")}</legend>
                    <div className="gt-scroller -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {PUBLIC_FILTERS.map((f) => {
                        const on = filter === f;
                        const empty = counts[f] === 0 && f !== "all";
                        return (
                          <label
                            key={f}
                            className={clsx(
                              "relative flex flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-3.5 py-2 text-[length:var(--text-caption)] font-semibold transition-colors duration-[var(--duration-fast)]",
                              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                              on
                                ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                                : empty
                                  ? "border-[var(--border-subtle)] text-[var(--text-subtle)]"
                                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--border-default)]",
                            )}
                          >
                            <input type="radio" name={`${id}-filter`} value={f} checked={on} onChange={() => choose(f)} className="sr-only" />
                            {t(`reviews.filters.${["1", "2", "3", "4", "5"].includes(f) ? "stars" : f}`, { count: Number(f) })}
                            <span className={clsx("tabular-nums", on ? "text-[var(--gt-ink-300)]" : "text-[var(--text-subtle)]")}>{counts[f]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <div className="w-full sm:w-[200px]">
                    <Select
                      label={t("reviews.filters.sortLabel")}
                      value={sort}
                      onChange={(v) => setSort(v as PublicSort)}
                      options={PUBLIC_SORTS.map((s) => ({ value: s, label: t(`reviews.filters.sort.${s}`) }))}
                    />
                  </div>
                </div>

                <p aria-live="polite" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("reviews.filters.showing", { shown: Math.min(shown, filtered.length), total: filtered.length })}
                </p>

                {filtered.length === 0 ? (
                  <div className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)]">
                    <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("reviews.empty.noMatch")}</p>
                    <Button variant="outline" size="sm" onClick={() => choose("all")}>{t("reviews.empty.showAll")}</Button>
                  </div>
                ) : (
                  <div key={`${filter}-${sort}`} className="gt-auth-swap grid items-start gap-4 md:grid-cols-2">
                    {filtered.slice(0, shown).map((r) => (
                      <ReviewCard key={r.id} review={r} />
                    ))}
                  </div>
                )}

                {filtered.length > shown && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                      {t("reviews.filters.more", { count: Math.min(PAGE, filtered.length - shown) })}
                    </Button>
                  </div>
                )}
              </>
            )}

            <PreviewSwitch value={preview} onChange={setPreview} name={`${id}-preview`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  summary,
  course,
  active,
  onPick,
  disabled,
}: {
  summary: RatingSummary;
  course: boolean;
  active: PublicFilter;
  onPick: (stars: PublicFilter) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="gt-glass-panel gt-glass-panel-compact grid gap-4 rounded-[var(--radius-card)] p-[var(--space-6)]">
      <div className="grid gap-1">
        <span className="gt-eyebrow">{t(course ? "reviews.summary.eyebrowCourse" : "reviews.summary.eyebrowProduct")}</span>
        <div className="flex items-end gap-3">
          <strong className="text-[48px] font-[var(--weight-black)] leading-none tabular-nums text-[var(--text-primary)]">
            {summary.count ? summary.average.toFixed(1) : "–"}
          </strong>
          <div className="grid gap-1 pb-1">
            <Stars rating={summary.average} size={16} />
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t(course ? "reviews.summary.basedOnCourse" : "reviews.summary.basedOn", { count: summary.count })}
            </span>
          </div>
        </div>
      </div>

      {/* Each bar is also a filter: the fastest way to read the three 2-star
          reviews is to press "2 ★". The count is printed, the bar only supports it. */}
      <ul className="m-0 grid list-none gap-1 p-0" aria-label={t("reviews.summary.distribution")}>
        {summary.buckets.map((b) => {
          const key = String(b.stars) as PublicFilter;
          const on = active === key;
          return (
            <li key={b.stars}>
              <button
                type="button"
                disabled={disabled || b.count === 0}
                onClick={() => onPick(key)}
                aria-pressed={on}
                aria-label={t("reviews.summary.bucketAria", { stars: b.stars, count: b.count, pct: b.pct })}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-1.5 py-1 text-[length:var(--text-caption)] text-[var(--text-muted)] transition-colors disabled:cursor-default",
                  on ? "bg-[var(--gt-blue-100)] text-[var(--text-primary)]" : "enabled:hover:bg-[var(--gt-ink-100)]",
                  focusRing,
                )}
              >
                <span className="w-8 flex-none text-left tabular-nums">{b.stars} ★</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)]">
                  <span
                    className="block h-full rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]"
                    style={{ width: `${b.pct}%` }}
                  />
                </span>
                <span className="w-6 flex-none text-right tabular-nums">{b.count}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {summary.count > 0 && (
        <dl className="m-0 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="grid gap-0.5">
            <dt className="text-[11px] text-[var(--text-muted)]">{t(course ? "reviews.summary.verifiedCourse" : "reviews.summary.verified")}</dt>
            <dd className="m-0 text-[length:var(--text-body-md)] font-bold tabular-nums text-[var(--text-primary)]">{summary.verifiedPct} %</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-[11px] text-[var(--text-muted)]">{t(course ? "reviews.summary.recommend" : "reviews.summary.withPhotos")}</dt>
            <dd className="m-0 text-[length:var(--text-body-md)] font-bold tabular-nums text-[var(--text-primary)]">
              {course ? `${summary.positivePct} %` : summary.withPhotos}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/**
 * Prototype control: shows this section's loading, empty and error states on
 * demand. Labelled as a prototype tool, like the loyalty and promotions demo
 * switches, so nobody mistakes it for a feature.
 */
function PreviewSwitch({ value, onChange, name }: { value: Preview; onChange: (v: Preview) => void; name: string }) {
  const { t } = useTranslation();
  const options: Preview[] = ["live", "loading", "empty", "error"];
  return (
    <fieldset className="m-0 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-3 py-2">
      <legend className="sr-only">{t("reviews.proto.label")}</legend>
      <span aria-hidden="true" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
        <FlaskConical size={12} />
        {t("reviews.proto.label")}
      </span>
      {options.map((o) => (
        <label
          key={o}
          className={clsx(
            "relative cursor-pointer rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold transition-colors",
            "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
            value === o ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]" : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)]",
          )}
        >
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" />
          {t(`reviews.proto.${o}`)}
        </label>
      ))}
    </fieldset>
  );
}
