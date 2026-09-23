import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  Hourglass,
  MessageSquareText,
  PencilLine,
  ShoppingBag,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import monogram from "../../assets/monogram-blue.png";
import { Button } from "../../components/ui/Button";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { StatTile } from "../../components/account/StatTile";
import { Stars } from "../../components/reviews/Stars";
import { EditedBadge, ReviewStatusBadge, VerifiedBadge } from "../../components/reviews/ReviewBadges";
import { ReviewRequestCard } from "../../components/reviews/ReviewRequestCard";
import { type CustomerReview, type ReviewStatus } from "../../data/reviewSystem";
import { subjectImage, subjectName, subjectPath, useReviewRequests, useReviews } from "../../lib/reviews";
import { formatDate } from "../../lib/format";

type MineFilter = "all" | ReviewStatus;
const FILTERS: MineFilter[] = ["all", "published", "pending", "needsChanges", "rejected"];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * "My reviews": what the member has written, where each review stands, and
 * what they could still review.
 *
 * Every status is explained in a sentence written for the customer, never in
 * moderation jargon, and none of them reads as a sanction: "needs changes"
 * quotes the team's message and offers the edit; "couldn't be published"
 * gives the reason and the way to try again. Editing a published review
 * sends it back to the team — the page says so before and after.
 */
export function Reviews() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { reviews, openForm, loading } = useReviews();
  const requests = useReviewRequests();
  const [filter, setFilter] = useState<MineFilter>("all");

  const mine = reviews
    .filter((r) => r.mine)
    .sort((a, b) => (b.editedAt ?? b.submittedAt).localeCompare(a.editedAt ?? a.submittedAt));
  const shown = filter === "all" ? mine : mine.filter((r) => r.status === filter);
  const count = (s: ReviewStatus) => mine.filter((r) => r.status === s).length;
  const helpful = mine.filter((r) => r.status === "published").reduce((sum, r) => sum + r.helpful, 0);

  return (
    <>
      <section className="grid gap-5">
        <SectionHeader
          icon={MessageSquareText}
          eyebrow={t("reviews.mine.eyebrow")}
          title={t("reviews.mine.title")}
          description={t("reviews.mine.description")}
        />
        <dl aria-label={t("reviews.mine.statsLabel")} className="m-0 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile value={String(count("published"))} label={t("reviews.mine.statPublished")} icon={CircleCheck} />
          <StatTile value={String(count("pending"))} label={t("reviews.mine.statPending")} icon={Hourglass} />
          <StatTile value={String(count("needsChanges") + count("rejected"))} label={t("reviews.mine.statAttention")} icon={PencilLine} />
          <StatTile value={String(helpful)} label={t("reviews.mine.statHelpful")} icon={ThumbsUp} />
        </dl>
      </section>

      {requests.length > 0 && (
        <section className="grid gap-4" aria-labelledby="mine-requests">
          <div className="grid gap-1">
            <h2 id="mine-requests" className="text-[length:var(--text-h3)]">{t("reviews.mine.awaitingTitle")}</h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("reviews.mine.awaitingBody", { count: requests.length })}</p>
          </div>
          <ReviewRequestCard request={requests[0]} />
          {requests.length > 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {requests.slice(1).map((r) => (
                <ReviewRequestCard key={`${r.subject.kind}:${r.subject.id}`} request={r} variant="compact" />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4" aria-labelledby="mine-list">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="mine-list" className="text-[length:var(--text-h3)]">{t("reviews.mine.listTitle")}</h2>
        </div>

        {mine.length > 0 && (
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{t("reviews.filters.label")}</legend>
            <div className="gt-scroller flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((f) => {
                const on = filter === f;
                const n = f === "all" ? mine.length : count(f);
                return (
                  <label
                    key={f}
                    className={clsx(
                      "flex flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-3.5 py-2 text-[length:var(--text-caption)] font-semibold transition-colors",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                      on ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]" : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)]",
                    )}
                  >
                    <input type="radio" name="mine-filter" value={f} checked={on} onChange={() => setFilter(f)} className="sr-only" />
                    {f === "all" ? t("reviews.filters.all") : t(`reviews.status.customer.${f}`)}
                    <span className={clsx("tabular-nums", on ? "text-[var(--gt-ink-300)]" : "text-[var(--text-subtle)]")}>{n}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {loading ? (
          <div className="grid gap-3" role="status">
            <span className="sr-only">{t("reviews.section.loading")}</span>
            {[0, 1].map((i) => (
              <div key={i} className="gt-skeleton h-40 rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : mine.length === 0 ? (
          <EmptyPanel
            action={
              requests.length === 0 && (
                <Button variant="outline" size="sm" iconLeft={ShoppingBag} onClick={() => navigate("/boutique")}>
                  {t("account.ordersEmptyCta")}
                </Button>
              )
            }
          >
            {t("reviews.mine.empty")}
          </EmptyPanel>
        ) : shown.length === 0 ? (
          <EmptyPanel>{t("reviews.mine.emptyFilter")}</EmptyPanel>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {shown.map((r) => (
              <MyReviewCard key={r.id} review={r} lang={lang} onEdit={() => openForm({ subject: r.subject, reviewId: r.id })} />
            ))}
          </ul>
        )}
      </section>

      <Lifecycle />
    </>
  );
}

const TONE: Record<ReviewStatus, string> = {
  pending: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)]",
  published: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)]",
  needsChanges: "border-[var(--gt-blue-200)] bg-[var(--status-info-bg)]",
  rejected: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)]",
  hidden: "border-[var(--border-subtle)] bg-[var(--surface-sunken)]",
};

const ICON = { pending: Hourglass, published: CircleCheck, needsChanges: PencilLine, rejected: XCircle, hidden: CircleHelp };

function MyReviewCard({ review: r, lang, onEdit }: { review: CustomerReview; lang: string; onEdit: () => void }) {
  const { t } = useTranslation();
  const name = subjectName(r.subject, lang);
  const image = subjectImage(r.subject);
  const Icon = ICON[r.status];
  const editable = r.status !== "pending" && r.status !== "hidden";

  return (
    <li className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start gap-3">
        {image && <img src={image} alt="" loading="lazy" className="h-14 w-14 flex-none rounded-[var(--radius-sm)] object-cover" />}
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
            {t(r.subject.kind === "course" ? "reviews.kind.course" : "reviews.kind.product")}
          </span>
          <Link to={subjectPath(r.subject)} className={clsx("truncate rounded-[2px] text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]", focusRing)}>
            {name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge review={r} />
            {r.editedAt && r.status === "pending" && <EditedBadge />}
          </div>
        </div>
        <ReviewStatusBadge status={r.status} audience="customer" size="md" />
      </div>

      <div className="grid gap-1.5">
        <Stars rating={r.rating} size={14} />
        <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">{r.title}</strong>
        <p lang={r.lang} className="m-0 line-clamp-3 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{r.body}</p>
        {r.photos.length > 0 && (
          <div className="mt-1 flex gap-2">
            {r.photos.map((p, i) => (
              <img key={p.src + i} src={p.src} alt={p.alt} className="h-12 w-12 rounded-[var(--radius-sm)] object-cover" />
            ))}
          </div>
        )}
      </div>

      {/* The status, explained. Colour, icon and words — never colour alone. */}
      <div className={clsx("grid gap-1.5 rounded-[var(--radius-md)] border p-3.5", TONE[r.status])}>
        <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          <Icon size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {t(`reviews.mine.headline.${r.status}`)}
        </p>
        <p className="m-0 pl-6 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-body)]">
          {r.status === "published" && r.publishedAt
            ? t("reviews.mine.publishedOn", { date: formatDate(r.publishedAt), count: r.helpful })
            : r.status === "rejected" && r.rejection
              ? t(`reviews.rejectReasons.customer.${r.rejection.reason}`)
              : t(`reviews.mine.explain.${r.status}`)}
        </p>
        {r.status === "needsChanges" && r.changesRequest && (
          <blockquote lang={r.lang} className="m-0 ml-6 border-l-2 border-[var(--gt-blue-300)] pl-3 text-[length:var(--text-caption)] italic text-[var(--text-body)]">
            {r.changesRequest}
          </blockquote>
        )}
      </div>

      {r.response && (
        <div className="grid gap-1 rounded-[var(--radius-md)] border-l-2 border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] px-4 py-3">
          <span className="flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            <img src={monogram} alt="" aria-hidden="true" className="h-4 w-auto" />
            {t("reviews.response.from")}
          </span>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">{r.response.body}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {r.editedAt ? t("reviews.mine.editedOn", { date: formatDate(r.editedAt) }) : t("reviews.mine.submittedOn", { date: formatDate(r.submittedAt) })}
        </span>
        <div className="flex flex-wrap gap-2">
          {r.status === "published" && (
            <Link
              to={`${subjectPath(r.subject)}#avis`}
              className={clsx("inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)]", focusRing)}
            >
              {t("reviews.mine.viewLive")}
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          )}
          {editable && (
            <Button variant={r.status === "published" ? "outline" : "dark"} size="sm" iconLeft={PencilLine} onClick={onEdit}>
              {r.status === "rejected" ? t("reviews.mine.editResubmit") : t("reviews.mine.edit")}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * How a review gets published, drawn as the lifecycle it actually follows —
 * so "pending" reads as a normal step rather than as something going wrong.
 */
function Lifecycle() {
  const { t } = useTranslation();
  const steps = ["draft", "pending", "published"] as const;
  return (
    <section aria-labelledby="mine-lifecycle" className="grid gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash)] p-[var(--space-5)]">
      <h2 id="mine-lifecycle" className="text-[length:var(--text-h4)]">{t("reviews.lifecycle.title")}</h2>
      <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="grid gap-1 rounded-[var(--radius-md)] bg-[var(--surface-card)] p-4">
            <span className="text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
              {i + 1} · {t(`reviews.lifecycle.${s}`)}
            </span>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`reviews.lifecycle.${s}Body`)}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.lifecycle.note")}</p>
    </section>
  );
}
