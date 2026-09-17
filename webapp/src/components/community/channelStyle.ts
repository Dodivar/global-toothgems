import {
  Gem,
  GraduationCap,
  HeartHandshake,
  Images,
  Lightbulb,
  MessagesSquare,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AvatarTone } from "../../data/community";

/**
 * Presentation of a channel: its icon and its tint.
 *
 * Icons rather than the emoji a chat app would use — the member area already
 * navigates with Lucide icons, and the community has to read as the same
 * product. The warmth comes from the content, not from the navigation.
 *
 * Indexed directly rather than through a helper: a function that returns a
 * component is read as a component factory, and every channel in `CHANNELS` has
 * an entry here.
 *
 * The tint is carried on small surfaces only (a 32-40 px medallion, a chip).
 * Four channels share each accent on purpose: the palette rule is one clear
 * hierarchy per screen, not one colour per item.
 */
export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  general: MessagesSquare,
  showcase: Images,
  techniques: Gem,
  training: GraduationCap,
  inspiration: Lightbulb,
  materials: Wrench,
  business: TrendingUp,
  intros: HeartHandshake,
};

/** Soft background + readable foreground, for medallions and chips. */
export const TONE_SOFT: Record<AvatarTone, string> = {
  blue: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
  emerald: "bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]",
  fuchsia: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]",
  ink: "bg-[var(--gt-ink-100)] text-[var(--text-primary)]",
};

/** Filled avatar treatment. Every pairing here clears AA at avatar sizes. */
export const TONE_SOLID: Record<AvatarTone, string> = {
  blue: "bg-[var(--gt-blue-300)] text-[var(--gt-ink-900)]",
  emerald: "bg-[var(--gt-emerald-300)] text-[var(--gt-ink-900)]",
  fuchsia: "bg-[var(--gt-fuchsia-300)] text-[var(--gt-ink-900)]",
  ink: "bg-[var(--surface-inverse)] text-[var(--text-inverse)]",
};

/** Hairline used when a tinted surface needs an edge. */
export const TONE_BORDER: Record<AvatarTone, string> = {
  blue: "border-[var(--gt-blue-200)]",
  emerald: "border-[var(--gt-emerald-300)]",
  fuchsia: "border-[var(--gt-fuchsia-300)]",
  ink: "border-[var(--border-subtle)]",
};
