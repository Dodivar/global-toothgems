import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, Inbox, SlidersHorizontal, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { SearchInput } from "../../admin/SearchInput";
import { AdminSelect } from "../../admin/AdminSelect";
import { AdminButton } from "../../admin/AdminButton";
import { EmptyState } from "../../admin/EmptyState";
import { Stars } from "../Stars";
import { EditedBadge, ReportedBadge, ReviewStatusBadge } from "../ReviewBadges";
import { openReports, privacyName, type CustomerReview } from "../../../data/reviewSystem";
import { PRODUCTS } from "../../../data/products";
import { COURSES } from "../../../data/courses";
import { pick } from "../../../data/types";
import {
  DATE_RANGES,
  DEFAULT_QUEUE_FILTERS,
  QUEUE_SORTS,
  QUEUE_VIEWS,
  activityDate,
  filterQueue,
  isEditedPending,
  viewCounts,
  type QueueFilters,
  type QueueView,
} from "../../../lib/reviewRules";
import { subjectName, useReviewCustomer, useReviews } from "../../../lib/reviews";
import { formatDateShort } from "../../../lib/format";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/** Query-string keys, French like every admin route. */
const PARAM = { view: "statut", kind: "type", subject: "sujet", rating: "note", range: "periode", search: "q", sort: "tri" } as const;

function readFilters(params: URLSearchParams): QueueFilters {
  const view = params.get(PARAM.view) as QueueView | null;
  return {
    view: view && QUEUE_VIEWS.includes(view) ? view : DEFAULT_QUEUE_FILTERS.view,
    kind: (["product", "course"].includes(params.get(PARAM.kind) ?? "") ? params.get(PARAM.kind) : "all") as QueueFilters["kind"],
    subject: params.get(PARAM.subject) ?? "all",
    rating: (["1", "2", "3", "4", "5"].includes(params.get(PARAM.rating) ?? "") ? params.get(PARAM.rating) : "all") as QueueFilters["rating"],
    range: (DATE_RANGES.find((r) => r === params.get(PARAM.range)) ?? "any") as QueueFilters["range"],
    search: params.get(PARAM.search) ?? "",
    sort: (QUEUE_SORTS.find((s) => s === params.get(PARAM.sort)) ?? DEFAULT_QUEUE_FILTERS.sort) as QueueFilters["sort"],
  };
}

/**
 * The moderation queue.
 *
 * Opens on "Pending", oldest first: customers waiting longest are answered
 * first. Every filter lives in the query string, so a filtered queue is a link
 * a colleague can open, and "back" from a review returns to the same rows.
 * A table on wide screens, a list of cards below `lg` — same data, same order.
 */
export function ModerationQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();
  const { reviews, loading } = useReviews();
  const customerOf = useReviewCustomer();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = readFilters(params);

  const update = (patch: Partial<QueueFilters>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch) as [keyof QueueFilters, string][]) {
      const name = PARAM[key];
      if (value === "" || value === "all" || value === "any" || value === (DEFAULT_QUEUE_FILTERS as unknown as Record<string, string>)[key]) next.delete(name);
      else next.set(name, value);
    }
    // "all" must stay explicit for the view, since the default is "pending".
    if (patch.view === "all") next.set(PARAM.view, "all");
    if (patch.kind) next.delete(PARAM.subject);
    setParams(next, { replace: true });
  };

  const nameOf = (r: CustomerReview) => {
    const c = customerOf(r);
    return privacyName(c.firstName, c.lastName);
  };
  const rows = useMemo(
    () => filterQueue(reviews, filters, (s) => subjectName(s, lang), (r) => `${customerOf(r).firstName} ${customerOf(r).lastName}`),
    // `filters` is rebuilt from the query string on every render; its fields are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviews, lang, customerOf, params.toString()],
  );
  const counts = useMemo(() => viewCounts(reviews), [reviews]);

  const subjectOptions = [
    { value: "all", label: t("reviews.admin.queue.allSubjects") },
    ...(filters.kind !== "course" ? PRODUCTS.map((p) => ({ value: `product:${p.id}`, label: pick(p.name, lang) })) : []),
    ...(filters.kind !== "product" ? COURSES.map((c) => ({ value: `course:${c.id}`, label: `${t("reviews.kind.course")} · ${pick(c.title, lang)}` })) : []),
  ];
  const activeFilters = [filters.kind !== "all", filters.subject !== "all", filters.rating !== "all", filters.range !== "any"].filter(Boolean).length;

  const reset = () => setParams(new URLSearchParams(params.get("vue") ? { vue: params.get("vue")! } : {}), { replace: true });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Status views: the queue's primary axis, as a scrollable row. */}
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">{t("reviews.admin.queue.viewsLabel")}</legend>
        <div className="gt-scroller -mx-[var(--admin-gutter)] flex gap-1.5 overflow-x-auto px-[var(--admin-gutter)] pb-1">
          {QUEUE_VIEWS.map((v) => {
            const on = filters.view === v;
            return (
              <label
                key={v}
                className={clsx(
                  "flex flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--admin-radius-sm)] border px-3 py-2 text-[length:var(--text-caption)] font-semibold transition-colors duration-[var(--duration-fast)]",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                  on ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:border-[var(--gt-ink-400)]",
                )}
              >
                <input type="radio" name="queue-view" value={v} checked={on} onChange={() => update({ view: v })} className="sr-only" />
                {t(`reviews.admin.views.${v}`)}
                <span className={clsx("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] tabular-nums", on ? "bg-white/20" : "bg-[var(--gt-ink-100)] text-[var(--text-muted)]")}>
                  {loading ? "·" : counts[v]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="gt-admin-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] flex-1">
            <SearchInput
              id="review-search"
              value={filters.search}
              onChange={(v) => update({ search: v })}
              label={t("reviews.admin.queue.search")}
              placeholder={t("reviews.admin.queue.searchPlaceholder")}
              clearLabel={t("reviews.admin.queue.clear")}
            />
          </div>
          <AdminButton variant="outline" iconLeft={SlidersHorizontal} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="queue-filters" className="lg:hidden">
            {t("reviews.admin.queue.filters")}
            {activeFilters > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gt-ink-900)] px-1 text-[10px] text-white">{activeFilters}</span>}
          </AdminButton>
          <label className="flex items-center gap-2">
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.admin.queue.sort")}</span>
            <AdminSelect
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as QueueFilters["sort"] })}
              options={QUEUE_SORTS.map((s) => ({ value: s, label: t(`reviews.admin.sorts.${s}`) }))}
              className="w-auto min-w-[150px]"
            />
          </label>
        </div>

        {/* Secondary filters: always visible on a desktop, folded on a phone. */}
        <div id="queue-filters" className={clsx("grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4", filtersOpen ? "grid" : "hidden lg:grid")}>
          <FilterSelect label={t("reviews.admin.queue.type")} value={filters.kind} onChange={(v) => update({ kind: v as QueueFilters["kind"] })}
            options={[{ value: "all", label: t("reviews.admin.queue.allTypes") }, { value: "product", label: t("reviews.kind.products") }, { value: "course", label: t("reviews.kind.courses") }]} />
          <FilterSelect label={t("reviews.admin.queue.subject")} value={filters.subject} onChange={(v) => update({ subject: v })} options={subjectOptions} />
          <FilterSelect label={t("reviews.admin.queue.rating")} value={filters.rating} onChange={(v) => update({ rating: v as QueueFilters["rating"] })}
            options={[{ value: "all", label: t("reviews.admin.queue.allRatings") }, ...["5", "4", "3", "2", "1"].map((n) => ({ value: n, label: t("reviews.filters.stars", { count: Number(n) }) }))]} />
          <FilterSelect label={t("reviews.admin.queue.date")} value={filters.range} onChange={(v) => update({ range: v as QueueFilters["range"] })}
            options={DATE_RANGES.map((r) => ({ value: r, label: t(`reviews.admin.ranges.${r}`) }))} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <span aria-live="polite">{loading ? t("reviews.section.loading") : t("reviews.admin.queue.results", { count: rows.length })}</span>
          {(activeFilters > 0 || filters.search) && (
            <button type="button" onClick={reset} className={clsx("rounded-[2px] font-semibold text-[var(--text-primary)] underline underline-offset-2", focusRing)}>
              {t("reviews.admin.queue.reset")}
            </button>
          )}
        </div>
      </div>

      <div className="gt-admin-panel overflow-hidden">
        {loading ? (
          <div role="status" className="grid">
            <span className="sr-only">{t("reviews.section.loading")}</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_1fr] items-center gap-4 border-b border-[var(--border-subtle)] px-5 py-4 last:border-b-0">
                <div className="gt-skeleton h-3 w-2/3 rounded-full" />
                <div className="grid gap-2">
                  <div className="gt-skeleton h-3 w-1/2 rounded-full" />
                  <div className="gt-skeleton h-2.5 w-4/5 rounded-full" />
                </div>
                <div className="gt-skeleton h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          filters.view === "pending" && activeFilters === 0 && !filters.search ? (
            <EmptyState icon={CircleCheck} title={t("reviews.admin.queue.caughtUpTitle")} body={t("reviews.admin.queue.caughtUpBody")} />
          ) : (
            <EmptyState
              icon={Inbox}
              title={t("reviews.admin.queue.emptyTitle")}
              body={t("reviews.admin.queue.emptyBody")}
              action={<AdminButton variant="outline" size="sm" onClick={reset}>{t("reviews.admin.queue.reset")}</AdminButton>}
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="gt-admin-scroll hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left text-[length:var(--text-caption)]">
                <caption className="sr-only">{t("reviews.admin.queue.caption")}</caption>
                <thead className="gt-admin-thead">
                  <tr className="text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                    {["customer", "subject", "rating", "review", "verified", "date", "status", "action"].map((c) => (
                      <th key={c} scope="col" className={clsx("px-4 py-3 font-semibold", c === "action" && "text-right")}>
                        {c === "action" ? <span className="sr-only">{t("reviews.admin.cols.action")}</span> : t(`reviews.admin.cols.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const reports = openReports(r).length;
                    return (
                      <tr key={r.id} className="gt-admin-row border-b border-[var(--border-subtle)] last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--text-primary)]">{nameOf(r)}</td>
                        <td className="max-w-[180px] px-4 py-3">
                          <span className="block truncate text-[var(--text-primary)]">{subjectName(r.subject, lang)}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{t(r.subject.kind === "course" ? "reviews.kind.course" : "reviews.kind.product")}</span>
                        </td>
                        <td className="px-4 py-3"><Stars rating={r.rating} size={12} /></td>
                        <td className="max-w-[320px] px-4 py-3">
                          <button type="button" onClick={() => onOpen(r.id)} className={clsx("block w-full rounded-[2px] text-left", focusRing)}>
                            <span className="block truncate font-semibold text-[var(--text-primary)] hover:underline">“{r.title}”</span>
                            <span lang={r.lang} className="block truncate text-[var(--text-muted)]">{r.body}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {r.orderRef ? (
                            <span className="inline-flex items-center gap-1 text-[var(--status-success-fg)]"><ShieldCheck size={13} aria-hidden="true" />{t("reviews.admin.queue.verified")}</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">{t("reviews.admin.queue.unverified")}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-muted)]">
                          <time dateTime={activityDate(r)}>{formatDateShort(activityDate(r))}</time>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <ReviewStatusBadge status={r.status} />
                            {isEditedPending(r) && <EditedBadge />}
                            {reports > 0 && <ReportedBadge count={reports} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <AdminButton size="sm" variant={r.status === "pending" ? "dark" : "outline"} onClick={() => onOpen(r.id)} aria-label={t("reviews.admin.queue.reviewAria", { title: r.title })}>
                            {t("reviews.admin.queue.review")}
                          </AdminButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phone and tablet: cards */}
            <ul className="m-0 grid list-none p-0 lg:hidden">
              {rows.map((r) => {
                const reports = openReports(r).length;
                return (
                  <li key={r.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <button type="button" onClick={() => onOpen(r.id)} className={clsx("gt-admin-row grid w-full gap-2 px-4 py-3.5 text-left", focusRing)}>
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                          {nameOf(r)} <span className="font-normal text-[var(--text-muted)]">· {formatDateShort(activityDate(r))}</span>
                        </span>
                        <Stars rating={r.rating} size={12} />
                      </span>
                      <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">“{r.title}”</span>
                      <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{subjectName(r.subject, lang)}{r.orderRef ? ` · ${t("reviews.admin.queue.verified")}` : ""}</span>
                      <span className="flex flex-wrap gap-1">
                        <ReviewStatusBadge status={r.status} />
                        {isEditedPending(r) && <EditedBadge />}
                        {reports > 0 && <ReportedBadge count={reports} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</span>
      <AdminSelect value={value} onChange={(e) => onChange(e.target.value)} options={options} />
    </label>
  );
}

