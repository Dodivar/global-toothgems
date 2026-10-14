"use client";

import { useTranslation } from "react-i18next";
import { BadgeCheck, CalendarHeart, Gem, HeartHandshake, MapPin, Sprout, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { ChatMember, ChatRole } from "../../lib/communityChat/model";
import { joinedDate, tenureOf } from "../../lib/communityChat/chatLogic";
import { ChatAvatar, useChatTime, useCountryName, useNow } from "./primitives";

/*
 * The face of a member's profile: a membership card in the tint of their role,
 * with the role written out and the day they joined the lounge. The lists and
 * messages show names only; the role lives here.
 */

interface CardTheme {
  surface: string;
  emblem: string;
  pill: string;
  icon: LucideIcon | null;
}

const THEMES: Record<ChatRole | "member", CardTheme> = {
  team: {
    surface: "bg-[linear-gradient(135deg,#ffffff_0%,var(--gt-ink-100)_48%,var(--gt-ink-300)_130%)]",
    emblem: "text-[var(--gt-ink-900)]",
    pill: "bg-[var(--surface-inverse)] text-[var(--text-inverse)]",
    icon: BadgeCheck,
  },
  mentor: {
    surface: "bg-[linear-gradient(135deg,var(--gt-emerald-50)_0%,#ffffff_50%,var(--gt-emerald-300)_140%)]",
    emblem: "text-[var(--gt-emerald-600)]",
    pill: "bg-[var(--gt-emerald-600)] text-white",
    icon: HeartHandshake,
  },
  new: {
    surface: "bg-[linear-gradient(135deg,var(--gt-blue-100)_0%,#ffffff_50%,var(--gt-blue-300)_140%)]",
    emblem: "text-[var(--gt-blue-700)]",
    pill: "bg-[var(--gt-blue-700)] text-white",
    icon: Sprout,
  },
  member: {
    surface: "bg-[linear-gradient(135deg,var(--gt-blue-200)_0%,var(--gt-blue-50)_50%,var(--gt-emerald-50)_100%)]",
    emblem: "text-[var(--gt-blue-700)]",
    pill: "",
    icon: null,
  },
};

export function MemberCard({ member, titleId, isSelf }: { member: ChatMember; titleId: string; isSelf: boolean }) {
  const { t } = useTranslation();
  const { locale } = useChatTime();
  const countryName = useCountryName();
  const now = useNow();
  const theme = THEMES[member.role ?? "member"];
  const RoleIcon = theme.icon;
  const joined = joinedDate(member.joined);
  const tenure = tenureOf(member.joined, now);

  return (
    <section
      aria-labelledby={titleId}
      className={clsx(
        "relative isolate grid min-h-max gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-white/80 p-4 shadow-[var(--shadow-md)] sm:p-5",
        theme.surface,
      )}
    >
      {/* A soft light from the top left and the brand's gem, large and faint. */}
      <span aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 -z-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.9),transparent_68%)]" />
      <Gem aria-hidden="true" strokeWidth={1.1} className={clsx("pointer-events-none absolute -bottom-7 -right-6 -z-10 h-36 w-36 rotate-[-14deg] opacity-[0.09]", theme.emblem)} />

      <p className="m-0 flex items-center gap-1.5 pr-10 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
        <Gem size={12} aria-hidden="true" className={theme.emblem} />
        {t("lounge.profile.cardEyebrow")}
      </p>

      <div className="flex items-center gap-4">
        <span className="rounded-full bg-white p-1 shadow-[var(--shadow-md)]">
          <ChatAvatar member={member} size="lg" presence />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <h2 id={titleId} className="m-0 break-words text-[20px] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">
            <span className="sr-only">{t("lounge.profile.title", { name: member.name })}: </span>
            {member.name}
          </h2>
          {!isSelf && <p className="m-0 truncate text-[12.5px] text-[var(--text-muted)]">@{member.handle}</p>}
          {member.city && (
            <p className="m-0 flex items-center gap-1.5 text-[12.5px] text-[var(--text-body)]">
              <MapPin size={12} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
              <span className="truncate">
                {member.city}
                {member.country && `, ${countryName(member.country)}`}
              </span>
            </p>
          )}
          <p className="m-0 text-[12px] font-semibold text-[var(--text-body)]">{t(`lounge.presence.${member.presence}`)}</p>
        </div>
      </div>

      {member.role && RoleIcon && (
        <p className={clsx("m-0 inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-[12.5px] font-bold", theme.pill)}>
          <RoleIcon size={14} aria-hidden="true" />
          {t(`lounge.roles.${member.role}Long`)}
        </p>
      )}

      {joined && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-white/80 bg-white/70 px-3.5 py-3 backdrop-blur-[6px]">
          <span aria-hidden="true" className={clsx("grid h-9 w-9 flex-none place-items-center rounded-full bg-white shadow-[var(--shadow-md)]", theme.emblem)}>
            <CalendarHeart size={17} />
          </span>
          <p className="m-0 grid min-w-0 flex-1 gap-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("lounge.profile.statSince")}</span>
            <time dateTime={joined.toISOString()} className="text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">
              {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(joined)}
            </time>
          </p>
          {tenure && (
            <span className="flex-none rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-body)] first-letter:uppercase">
              {new Intl.RelativeTimeFormat(locale, { numeric: tenure.count === 0 ? "auto" : "always" }).format(tenure.count === 0 ? 0 : -tenure.count, tenure.unit)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
