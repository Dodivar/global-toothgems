import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PenLine } from "lucide-react";
import type { OrderLine } from "../../data/orders";
import { useReviewEligibility, useReviews } from "../../lib/reviews";

/**
 * The review entry point on an order line in the order history: "Write a
 * review" once the line can be reviewed, the review's state once it exists,
 * nothing otherwise — an order is not the place to explain eligibility rules.
 */
export function OrderLineReviewAction({ line }: { line: OrderLine }) {
  const { t } = useTranslation();
  const eligibility = useReviewEligibility();
  const { openForm } = useReviews();
  const subject = line.productId
    ? { kind: "product" as const, id: line.productId }
    : line.courseId
      ? { kind: "course" as const, id: line.courseId }
      : null;
  if (!subject) return null;
  const e = eligibility(subject);

  if (e.state === "eligible") {
    return (
      <button
        type="button"
        onClick={() => openForm({ subject })}
        className="inline-flex items-center gap-1 justify-self-start rounded-[2px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <PenLine size={12} aria-hidden="true" />
        {t("reviews.cta.write")}
      </button>
    );
  }
  if (e.state === "reviewed") {
    return (
      <Link
        to="/compte/avis"
        className="justify-self-start rounded-[2px] text-[length:var(--text-caption)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {t("reviews.orders.reviewed", { status: t(`reviews.status.customer.${e.review.status}`) })}
      </Link>
    );
  }
  return null;
}
