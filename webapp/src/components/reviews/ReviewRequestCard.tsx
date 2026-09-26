import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Star } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { subjectImage, subjectName, useReviews, type ReviewRequest } from "../../lib/reviews";
import { subjectKey } from "../../data/reviewSystem";
import { formatDate } from "../../lib/format";

/**
 * "How was your Global Toothgems experience?"
 *
 * The review request, as one reusable component for the moments a customer
 * has something to say: a parcel delivered, a course finished, a course half
 * done. It appears on the member dashboard, on "My reviews", beside a
 * finished training's certificate and in the lesson player.
 *
 * The stars are the first step of the form, not decoration: choosing one
 * opens the review with that rating already set. "Not now" hides the request
 * for the session and never nags again from the same screen.
 *
 * `feature` is the full card (soft blue wash, a single fuchsia spark as the
 * only highlight); `compact` is the one-line version for tight columns;
 * `dark` sits on the ink bands of the certificate and course pages.
 */
export function ReviewRequestCard({
  request,
  variant = "feature",
  className,
}: {
  request: ReviewRequest;
  variant?: "feature" | "compact" | "dark";
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { openForm, dismissRequest, drafts } = useReviews();
  const [hover, setHover] = useState(0);
  const name = subjectName(request.subject, lang);
  const image = subjectImage(request.subject);
  const hasDraft = Boolean(drafts[subjectKey(request.subject)]);
  const dark = variant === "dark";

  const context =
    request.context === "delivered" && request.date
      ? t("reviews.request.contextDelivered", { date: formatDate(request.date) })
      : request.context === "shipped"
        ? t("reviews.request.contextShipped")
        : request.context === "completed"
          ? t("reviews.request.contextCompleted")
          : t("reviews.request.contextProgress", { pct: request.progressPct ?? 0 });

  const stars = (
    <div role="group" aria-label={t("reviews.request.starsLabel", { name })} className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => openForm({ subject: request.subject, rating: n })}
          aria-label={t("reviews.request.rateAs", { count: n })}
          className="grid place-items-center rounded-[var(--radius-sm)] p-1 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
        >
          <Star
            aria-hidden="true"
            size={variant === "compact" ? 20 : 26}
            strokeWidth={1.5}
            fill={n <= hover ? (dark ? "var(--gt-off-white)" : "var(--gt-ink-900)") : "transparent"}
            color={dark ? (n <= hover ? "var(--gt-off-white)" : "var(--gt-ink-400)") : n <= hover ? "var(--gt-ink-900)" : "var(--gt-ink-300)"}
            className="transition-colors duration-[var(--duration-fast)]"
          />
        </button>
      ))}
    </div>
  );

  if (variant === "compact") {
    return (
      <div className={clsx("grid gap-3 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash-strong)] p-4", className)}>
        <div className="grid gap-0.5">
          <span className="gt-eyebrow">{context}</span>
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("reviews.request.compactTitle", { name })}</strong>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {stars}
          <button
            type="button"
            onClick={() => dismissRequest(request.subject)}
            className="rounded-[2px] text-[length:var(--text-caption)] text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t("reviews.request.notNow")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={t("reviews.request.label", { name })}
      className={clsx(
        "relative grid gap-5 overflow-hidden rounded-[var(--radius-card)] p-[clamp(18px,3vw,28px)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center",
        dark
          ? "bg-[var(--surface-inverse)] text-[var(--gt-ink-300)]"
          : "border border-[var(--gt-blue-200)] bg-[linear-gradient(135deg,var(--gt-blue-50),var(--gt-white)_55%,var(--gt-fuchsia-50))] shadow-[var(--shadow-xs)]",
        className,
      )}
    >
      <span aria-hidden="true" className="gt-envelope-spark pointer-events-none absolute right-5 top-4 text-[18px] text-[var(--accent-highlight)]">
        &#10022;
      </span>
      {image && (
        <img src={image} alt="" className="h-20 w-20 flex-none rounded-[var(--radius-md)] object-cover shadow-[var(--shadow-sm)] sm:h-24 sm:w-24" />
      )}
      <div className="grid gap-3">
        <div className="grid gap-1">
          <span className={clsx("gt-eyebrow", dark && "text-[var(--gt-blue-300)]")}>{context}</span>
          <h2 className={clsx("text-[length:var(--text-h4)] leading-[var(--leading-snug)]", dark && "text-[var(--gt-off-white)]")}>
            {t("reviews.request.title")}
          </h2>
          <p className={clsx("m-0 text-[length:var(--text-body-sm)]", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]")}>
            <strong className={dark ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]"}>{name}</strong> · {t("reviews.request.body")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {stars}
          <Button
            variant={dark ? "primary" : "dark"}
            size="sm"
            iconRight={ArrowRight}
            onClick={() => openForm({ subject: request.subject })}
          >
            {hasDraft ? t("reviews.request.resume") : t("reviews.request.cta")}
          </Button>
          <button
            type="button"
            onClick={() => dismissRequest(request.subject)}
            className={clsx(
              "rounded-[2px] text-[length:var(--text-caption)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
              dark ? "text-[var(--gt-ink-300)] hover:text-[var(--gt-off-white)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {t("reviews.request.notNow")}
          </button>
        </div>
      </div>
    </section>
  );
}
