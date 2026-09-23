import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CircleCheck,
  Flag,
  GraduationCap,
  Hourglass,
  MessageSquareReply,
  MessagesSquare,
  Package,
  PartyPopper,
  Star,
  Timer,
} from "lucide-react";
import clsx from "clsx";
import { PromoKpi, Panel } from "../../promotions/PromoUi";
import { Stars } from "../Stars";
import { EditedBadge, ReportedBadge } from "../ReviewBadges";
import { REVIEW_NOW, openReports, privacyName, subjectKey, type CustomerReview } from "../../../data/reviewSystem";
import { activityDate, isEditedPending, isReported, reviewStats, type SubjectRating } from "../../../lib/reviewRules";
import { subjectName, useReviewCustomer, useReviews } from "../../../lib/reviews";
import { useWhen } from "./ModerationSheet";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * The reviews overview. Reads as the questions a moderator arrives with:
 * how much is waiting (KPIs), what to do first (the attention list), and how
 * the catalogue is perceived (distribution, then ratings per product and per
 * course). Every figure that leads to work links to the filtered queue.
 */
export function ReviewDashboard({ hrefFor, onOpen }: { hrefFor: (query: Record<string, string>) => string; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { reviews, loading } = useReviews();
  const customerOf = useReviewCustomer();
  const when = useWhen();
  const stats = useMemo(() => reviewStats(reviews), [reviews]);

  const attention = reviews
    .filter((r) => r.status === "pending" || isReported(r))
    .sort((a, b) => openReports(b).length - openReports(a).length || activityDate(a).localeCompare(activityDate(b)))
    .slice(0, 6);

  const monthLabel = (m: string) => new Intl.DateTimeFormat(lang.startsWith("en") ? "en-IE" : "fr-FR", { month: "short" }).format(new Date(`${m}-01T12:00`));
  const maxMonth = Math.max(1, ...stats.monthly.map((m) => m.count));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section aria-label={t("reviews.admin.kpi.label")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <PromoKpi loading={loading} icon={MessagesSquare} tone="neutral" label={t("reviews.admin.kpi.total")} value={String(stats.total)} hint={t("reviews.admin.kpi.totalHint")} to={hrefFor({ vue: "file", statut: "all" })} />
        <PromoKpi loading={loading} icon={Hourglass} tone="warning" label={t("reviews.admin.kpi.pending")} value={String(stats.pending)} hint={t("reviews.admin.kpi.pendingHint")} to={hrefFor({ vue: "file", statut: "pending" })} />
        <PromoKpi loading={loading} icon={CircleCheck} tone="success" label={t("reviews.admin.kpi.published")} value={String(stats.published)} hint={t("reviews.admin.kpi.publishedHint", { pct: stats.responseRate })} to={hrefFor({ vue: "file", statut: "published" })} />
        <PromoKpi loading={loading} icon={Flag} tone="highlight" label={t("reviews.admin.kpi.reported")} value={String(stats.reported)} hint={t("reviews.admin.kpi.reportedHint")} to={hrefFor({ vue: "signalements" })} />
        <PromoKpi loading={loading} icon={Star} tone="brand" label={t("reviews.admin.kpi.average")} value={stats.published ? stats.averagePublished.toFixed(1) : "–"} hint={t("reviews.admin.kpi.averageHint")} />
        <PromoKpi loading={loading} icon={CalendarDays} tone="neutral" label={t("reviews.admin.kpi.month")} value={String(stats.thisMonth)} hint={t("reviews.admin.kpi.monthHint", { month: new Intl.DateTimeFormat(lang.startsWith("en") ? "en-IE" : "fr-FR", { month: "long" }).format(new Date(REVIEW_NOW)) })} trend={stats.monthly.map((m) => m.count)} to={hrefFor({ vue: "file", statut: "all", periode: "month" })} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title={t("reviews.admin.attention.title")}
          icon={Hourglass}
          action={
            <Link to={hrefFor({ vue: "file", statut: "pending" })} className={clsx("rounded-[2px] text-[length:var(--text-caption)] font-semibold underline underline-offset-2", focusRing)}>
              {t("reviews.admin.attention.all")}
            </Link>
          }
        >
          {attention.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-8 text-center">
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
                <PartyPopper size={19} />
              </span>
              <strong className="text-[length:var(--text-body-sm)]">{t("reviews.admin.attention.clearTitle")}</strong>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.admin.attention.clearBody")}</span>
            </div>
          ) : (
            <ul className="m-0 grid list-none gap-0 p-0">
              {attention.map((r) => (
                <AttentionRow key={r.id} review={r} name={privacyName(customerOf(r).firstName, customerOf(r).lastName)} subject={subjectName(r.subject, lang)} when={when(activityDate(r))} onOpen={() => onOpen(r.id)} />
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title={t("reviews.admin.distribution.title")} icon={Star}>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {stats.distribution.buckets.map((b) => (
                <li key={b.stars}>
                  <Link
                    to={hrefFor({ vue: "file", statut: "published", note: String(b.stars) })}
                    className={clsx("flex items-center gap-3 rounded-[var(--admin-radius-sm)] px-1 py-0.5 text-[length:var(--text-caption)] hover:bg-[var(--gt-ink-100)]", focusRing)}
                    aria-label={t("reviews.summary.bucketAria", { stars: b.stars, count: b.count, pct: b.pct })}
                  >
                    <span className="w-8 tabular-nums text-[var(--text-muted)]">{b.stars} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--gt-ink-100)]">
                      <span className="block h-full rounded-full bg-[var(--gt-blue-500)] transition-[width] duration-[var(--duration-slow)]" style={{ width: `${b.pct}%` }} />
                    </span>
                    <span className="w-14 text-right tabular-nums text-[var(--text-primary)]">
                      {b.count} <span className="text-[var(--text-subtle)]">· {b.pct}%</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t("reviews.admin.health.title")} icon={Timer}>
            <dl className="m-0 grid grid-cols-2 gap-3">
              <div className="grid gap-0.5 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-3">
                <dt className="text-[11px] text-[var(--text-muted)]">{t("reviews.admin.health.median")}</dt>
                <dd className="m-0 text-[length:var(--text-h4)] font-bold tabular-nums">{stats.medianResponseHours != null ? t("reviews.admin.health.hours", { count: stats.medianResponseHours }) : "–"}</dd>
              </div>
              <div className="grid gap-0.5 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-3">
                <dt className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <MessageSquareReply size={11} aria-hidden="true" />
                  {t("reviews.admin.health.responses")}
                </dt>
                <dd className="m-0 text-[length:var(--text-h4)] font-bold tabular-nums">{stats.responseRate} %</dd>
              </div>
            </dl>
            <div className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">{t("reviews.admin.health.volume")}</span>
              <ol className="m-0 flex h-24 list-none items-end gap-2 p-0" aria-label={t("reviews.admin.health.volume")}>
                {stats.monthly.map((m) => (
                  <li key={m.month} className="grid flex-1 justify-items-center gap-1">
                    <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{m.count}</span>
                    <span aria-hidden="true" className="w-full max-w-[28px] rounded-t-[4px] bg-[var(--gt-blue-300)]" style={{ height: `${Math.max(4, (m.count / maxMonth) * 56)}px` }} />
                    <span className="text-[10px] text-[var(--text-muted)]">{monthLabel(m.month)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <SubjectPanel title={t("reviews.admin.bySubject.products")} icon={Package} rows={stats.byProduct} lang={lang} hrefFor={hrefFor} />
        <SubjectPanel title={t("reviews.admin.bySubject.courses")} icon={GraduationCap} rows={stats.byCourse} lang={lang} hrefFor={hrefFor} />
      </div>
    </div>
  );
}

function AttentionRow({ review, name, subject, when, onOpen }: { review: CustomerReview; name: string; subject: string; when: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const reports = openReports(review).length;
  return (
    <li className="border-b border-[var(--border-subtle)] last:border-b-0">
      <button type="button" onClick={onOpen} className={clsx("gt-admin-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--admin-radius-sm)] px-2 py-2.5 text-left", focusRing)}>
        <span className="grid min-w-0 gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">“{review.title}”</strong>
            {reports > 0 && <ReportedBadge count={reports} />}
            {isEditedPending(review) && <EditedBadge />}
          </span>
          <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {name} · {subject} · {when}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Stars rating={review.rating} size={12} />
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline underline-offset-2">{t("reviews.admin.queue.review")}</span>
        </span>
      </button>
    </li>
  );
}

function SubjectPanel({
  title,
  icon,
  rows,
  lang,
  hrefFor,
}: {
  title: string;
  icon: typeof Package;
  rows: SubjectRating[];
  lang: string;
  hrefFor: (query: Record<string, string>) => string;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={title} icon={icon}>
      {rows.length === 0 ? (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.admin.bySubject.empty")}</p>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {rows.map((row) => (
            <li key={subjectKey(row.subject)}>
              <Link
                to={hrefFor({ vue: "file", statut: "published", sujet: subjectKey(row.subject) })}
                className={clsx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[var(--admin-radius-sm)] px-2 py-2 hover:bg-[var(--gt-ink-100)] sm:grid-cols-[minmax(0,1fr)_120px_auto]", focusRing)}
              >
                <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{subjectName(row.subject, lang)}</span>
                <span aria-hidden="true" className="order-last col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--gt-ink-100)] sm:order-none sm:col-span-1">
                  <span className="block h-full rounded-full bg-[var(--gt-ink-900)]" style={{ width: `${(row.average / 5) * 100}%` }} />
                </span>
                <span className="flex items-center gap-1.5 text-[length:var(--text-caption)] tabular-nums">
                  <strong className="text-[var(--text-primary)]">{row.average.toFixed(1)}</strong>
                  <Star size={11} fill="currentColor" aria-hidden="true" />
                  <span className="text-[var(--text-muted)]">· {t("reviews.admin.bySubject.count", { count: row.count })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
