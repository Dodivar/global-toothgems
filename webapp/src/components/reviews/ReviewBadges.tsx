import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  CircleCheck,
  EyeOff,
  Flag,
  GraduationCap,
  Hourglass,
  PencilLine,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import type { CustomerReview, ReviewStatus } from "../../data/reviewSystem";

/**
 * The review system's status vocabulary.
 *
 * Like the order book's badges, each one carries a word, an icon and a tone —
 * never colour alone. Emerald is kept for "published", amber for what waits
 * on someone, red only for "rejected"; "needs changes" is blue because it is
 * an open conversation, not a failure. The customer and the team read the
 * same states, with wording chosen for each (`audience`).
 */

const STATUS_META: Record<ReviewStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  pending: { tone: "warning", icon: Hourglass },
  published: { tone: "success", icon: CircleCheck },
  needsChanges: { tone: "brand", icon: PencilLine },
  rejected: { tone: "error", icon: XCircle },
  hidden: { tone: "neutral", icon: EyeOff },
};

export function statusIcon(status: ReviewStatus): LucideIcon {
  return STATUS_META[status].icon;
}

export function ReviewStatusBadge({
  status,
  size = "sm",
  audience = "team",
}: {
  status: ReviewStatus;
  size?: "sm" | "md";
  audience?: "team" | "customer";
}) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  return (
    // Keyed on the status so a change replays the small pop, and nothing else does.
    <span key={status} className="gt-status-swap inline-flex">
      <Badge tone={meta.tone} size={size} icon={meta.icon}>
        {t(audience === "customer" ? `reviews.status.customer.${status}` : `reviews.status.${status}`)}
      </Badge>
    </span>
  );
}

/**
 * "Verified purchase" / "Verified student". Quiet on purpose: a hairline
 * pill with a check, legible at a glance without competing with the stars.
 */
export function VerifiedBadge({ review, size = "sm" }: { review: CustomerReview; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  if (!review.orderRef) return null;
  const course = review.subject.kind === "course";
  return (
    <Badge tone="success" size={size} icon={course ? GraduationCap : ShieldCheck}>
      {t(course ? "reviews.verified.student" : "reviews.verified.purchase")}
    </Badge>
  );
}

export function EditedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <Badge tone="brand" size={size} icon={PencilLine}>
      {t("reviews.badges.edited")}
    </Badge>
  );
}

export function ReportedBadge({ count, size = "sm" }: { count: number; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <Badge tone="highlight" size={size} icon={Flag}>
      {t("reviews.badges.reported", { count })}
    </Badge>
  );
}

export function UnverifiedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <Badge tone="neutral" size={size} icon={BadgeCheck}>
      {t("reviews.verified.none")}
    </Badge>
  );
}
