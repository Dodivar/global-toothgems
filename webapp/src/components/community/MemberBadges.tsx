import { useTranslation } from "react-i18next";
import { Award, Gem, HeartHandshake, ShieldCheck, Sparkles, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import { BADGE_ORDER, type BadgeId } from "../../data/community";

/**
 * Community badges.
 *
 * Recognition, not a scoreboard. They describe what someone brings to the room
 * — a finished course, a habit of answering, a first week — and the interface
 * never ranks them against each other or shows a level, a streak or points.
 * Each one reuses the shop's `Badge`, so a community badge and an order status
 * are visibly the same object.
 */

const badgeTone: Record<BadgeId, BadgeTone> = {
  team: "ink",
  certified: "success",
  top: "highlight",
  helper: "brand",
  gemLover: "neutral",
  new: "neutral",
};

const badgeIcon: Record<BadgeId, LucideIcon> = {
  team: ShieldCheck,
  certified: Award,
  top: Star,
  helper: HeartHandshake,
  gemLover: Gem,
  new: Sparkles,
};

export function MemberBadge({ id, size = "sm" }: { id: BadgeId; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <Badge tone={badgeTone[id]} size={size} icon={badgeIcon[id]}>
      {t(`community.badge.${id}`)}
    </Badge>
  );
}

/** Every badge a member carries, in the order the data file declares. */
export function MemberBadges({
  badges,
  max,
  size = "sm",
}: {
  badges: BadgeId[];
  /** Caps the row in dense contexts; the profile dialog shows them all. */
  max?: number;
  size?: "sm" | "md";
}) {
  const ordered = BADGE_ORDER.filter((id) => badges.includes(id));
  const shown = max ? ordered.slice(0, max) : ordered;
  if (shown.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((id) => (
        <MemberBadge key={id} id={id} size={size} />
      ))}
    </span>
  );
}
