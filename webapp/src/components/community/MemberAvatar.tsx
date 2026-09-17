import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { Member } from "../../data/community";
import { TONE_SOLID } from "./channelStyle";

/**
 * A member's avatar.
 *
 * Initials on a tinted disc rather than photographs: the people in this
 * prototype do not exist, and inventing faces for them would be the one thing
 * on these screens that is not honest about being a mockup. The tint is stable
 * per member, so a face stays recognisable from the home page to a thread.
 */

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-[length:var(--text-caption)]",
  md: "h-11 w-11 text-[length:var(--text-body-sm)]",
  lg: "h-16 w-16 text-[length:var(--text-h4)]",
};

export function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
}

export function MemberAvatar({
  member,
  size = "sm",
  presence = false,
  className,
}: {
  member: Member;
  size?: AvatarSize;
  /** Shows the "active this week" marker, with its text for screen readers. */
  presence?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const showPresence = presence && member.activeThisWeek;

  return (
    <span className={clsx("relative inline-flex flex-none", className)}>
      <span
        aria-hidden="true"
        className={clsx(
          "grid place-items-center rounded-full font-[var(--weight-black)] leading-none",
          sizes[size],
          TONE_SOLID[member.tone],
        )}
      >
        {initialsOf(member.name)}
      </span>
      {showPresence && (
        <>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface-card)] bg-[var(--accent-cta)]"
          />
          <span className="sr-only">{t("community.activeNow")}</span>
        </>
      )}
    </span>
  );
}

/**
 * Overlapping avatars, the community's social proof. Decorative on its own —
 * the count beside it carries the meaning — so the stack is hidden from
 * assistive technology and the caller labels the number.
 */
export function AvatarStack({ members, max = 5 }: { members: Member[]; max?: number }) {
  const shown = members.slice(0, max);
  return (
    <span aria-hidden="true" className="flex -space-x-2.5">
      {shown.map((member) => (
        <span
          key={member.id}
          className={clsx(
            "grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--surface-card)] text-[10px] font-[var(--weight-black)] leading-none",
            TONE_SOLID[member.tone],
          )}
        >
          {initialsOf(member.name)}
        </span>
      ))}
    </span>
  );
}
