import { Gem, HeartHandshake, Lightbulb, MessagesSquare, TrendingUp, type LucideIcon } from "lucide-react";
import type { ChannelKey } from "../../lib/communityChat/model";

/**
 * One icon per channel, the same in every language lounge — a member who
 * switches from English to French finds "Techniques" under the same gem.
 * Lucide rather than emoji, like the rest of the member area.
 */
const ICONS: Record<ChannelKey, LucideIcon> = {
  introductions: HeartHandshake,
  general: MessagesSquare,
  inspiration: Lightbulb,
  techniques: Gem,
  business: TrendingUp,
};

export function ChannelIcon({ channelKey, size = 18, className }: { channelKey: ChannelKey; size?: number; className?: string }) {
  const Icon = ICONS[channelKey];
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" className={className} />;
}
