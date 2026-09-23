import { useTranslation } from "react-i18next";
import { CircleCheck, CircleSlash, Clock3, Eye, PenLine, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BadgeTone } from "../ui/Badge";
import type { UserRole, UserStatus } from "../../data/adminUsers";

/**
 * The tones and icons of the Users vocabulary, and the date formatting the
 * workspace shares. Kept out of `UserBadges.tsx` so that file exports only
 * components; see that file for why each role and status looks the way it does.
 */

export const ROLE_META: Record<UserRole, { tone: BadgeTone; icon: LucideIcon }> = {
  readOnly: { tone: "neutral", icon: Eye },
  manager: { tone: "brand", icon: PenLine },
  administrator: { tone: "ink", icon: ShieldCheck },
};

export const STATUS_META: Record<UserStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  invited: { tone: "warning", icon: Clock3 },
  suspended: { tone: "error", icon: CircleSlash },
};

export function useAdminLocale(): string {
  const { i18n } = useTranslation();
  return i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 hours ago", "yesterday", "3 weeks ago" — in the interface language. */
export function formatRelative(iso: string, locale: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
