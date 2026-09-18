import { useTranslation } from "react-i18next";
import {
  Award,
  BadgeCheck,
  BookOpen,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  Crown,
  GraduationCap,
  Minus,
  PlayCircle,
  Repeat,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import type {
  CustomerSegment,
  CustomerStatus,
  CustomerTag,
  TrainingState,
} from "../../data/adminCustomers";

/**
 * The status vocabulary of the customer base, in one place.
 *
 * Same contract as `StatusBadges` for orders, and for the same reason: every
 * badge carries a tone *and* an icon *and* the word itself. Colour alone would
 * fail WCAG 2.2 1.4.1, and on this page the stakes are concrete — "suspended"
 * and "inactive" are a decision apart, and an operator who cannot separate the
 * amber from the red is one click from disabling the wrong account.
 *
 * Tones are spent as sparingly as the design system asks: emerald for an
 * account in good standing, ink for a dormant one, red only for a suspension.
 * Training is blue while it is in progress and emerald once it is finished,
 * which keeps green meaning "done" everywhere in the workspace.
 */

const STATUS_META: Record<CustomerStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  inactive: { tone: "neutral", icon: CircleMinus },
  suspended: { tone: "error", icon: CircleSlash },
};

const TRAINING_META: Record<TrainingState, { tone: BadgeTone; icon: LucideIcon }> = {
  none: { tone: "neutral", icon: Minus },
  enrolled: { tone: "brand", icon: BookOpen },
  inProgress: { tone: "brand", icon: PlayCircle },
  completed: { tone: "success", icon: Award },
};

const SEGMENT_META: Record<CustomerSegment, { tone: BadgeTone; icon: LucideIcon }> = {
  customer: { tone: "neutral", icon: UserRound },
  student: { tone: "brand", icon: GraduationCap },
  vip: { tone: "highlight", icon: Crown },
};

/**
 * Tag icons.
 *
 * Every tag gets one, because the tags are rendered in the same quiet neutral
 * tone — they are an administrator's shorthand, not a status, and seven
 * coloured pills beside a name would drown the name. The icon is what makes
 * them separable at a glance, and "needs follow-up" is the single exception
 * that carries a tone, because it is the one tag that asks for an action.
 */
export const TAG_ICON: Record<CustomerTag, LucideIcon> = {
  vip: Crown,
  repeat: Repeat,
  trainingStudent: GraduationCap,
  trainingCompleted: BadgeCheck,
  newCustomer: Sparkles,
  highValue: TrendingUp,
  followUp: ShieldAlert,
};

export function CustomerStatusBadge({
  status,
  size = "md",
}: {
  status: CustomerStatus;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(`admin.customers.status.${status}`)}
    </Badge>
  );
}

/**
 * Training, as one badge.
 *
 * "No access" is rendered rather than skipped: an empty cell in a training
 * column reads as missing data, and the difference between "we don't know" and
 * "they have never enrolled" is the difference between chasing a bug and
 * sending a course offer.
 */
export function TrainingBadge({
  state,
  size = "md",
}: {
  state: TrainingState;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const meta = TRAINING_META[state];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(`admin.customers.training.${state}`)}
    </Badge>
  );
}

export function SegmentBadge({ segment, size = "md" }: { segment: CustomerSegment; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const meta = SEGMENT_META[segment];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(`admin.customers.segment.${segment}`)}
    </Badge>
  );
}

/** One tag, as read-only shorthand. The editable version lives in `CustomerTags`. */
export function TagBadge({ tag, size = "sm" }: { tag: CustomerTag; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <Badge tone={tag === "followUp" ? "warning" : "neutral"} size={size} icon={TAG_ICON[tag]}>
      {t(`admin.customers.tag.${tag}`)}
    </Badge>
  );
}
