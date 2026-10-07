"use client";

import { useTranslation } from "react-i18next";
import { ArrowRight, MessagesSquare } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../lib/navigation";
import { useCommunity } from "../../lib/community";
import { useChat } from "../../lib/communityChat/chatStore";
import { LOUNGE_ROOT, loungePath } from "../../lib/communityChat/loungeRoutes";
import { ChatAvatar, focusRing } from "./primitives";

/**
 * The lounge, seen from the member dashboard: what is waiting there, and one
 * way in. Private messages first — they are addressed to you — then the
 * channels' news. Only for an account that can enter.
 */
export function LoungeActivityCard() {
  const { t } = useTranslation();
  const { hasAccess } = useCommunity();
  const { activity, conversations, serverMembers, viewer } = useChat();
  if (!hasAccess) return null;

  const waiting = conversations.filter((c) => c.unread > 0);
  const online = [viewer, ...serverMembers].filter((m) => m.presence !== "offline").length;
  /* A private message waiting: open it; otherwise the room visited last. */
  const target = waiting[0] ? loungePath({ kind: "dm", conversationId: waiting[0].conversation.id }) : LOUNGE_ROOT;

  const headline =
    activity.attention > 0
      ? t("lounge.nav.dashboardAttention", { count: activity.attention })
      : activity.unread > 0
        ? t("lounge.nav.dashboardUnread", { count: activity.unread })
        : t("lounge.nav.dashboardQuiet");

  return (
    <section
      aria-labelledby="gt-lounge-card"
      className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]"
    >
      <span className="relative grid h-12 w-12 flex-none place-items-center rounded-[var(--radius-md)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <MessagesSquare size={22} aria-hidden="true" />
        {activity.attention > 0 && (
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[var(--surface-card)] bg-[var(--accent-highlight-ink)] px-1 text-[10px] font-bold text-white">
            {activity.attention}
          </span>
        )}
      </span>

      <div className="grid min-w-0 flex-1 gap-1">
        <h2 id="gt-lounge-card" className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
          {t("lounge.nav.dashboardTitle")}
        </h2>
        <p className={clsx("m-0 text-[length:var(--text-body-sm)]", activity.attention > 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>
          {headline}
        </p>
        {waiting.length > 0 ? (
          <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <span aria-hidden="true" className="flex -space-x-2">
              {waiting.slice(0, 3).map((c) => (
                <span key={c.conversation.id} className="rounded-full ring-2 ring-[var(--surface-card)]">
                  <ChatAvatar member={c.member} size="xs" />
                </span>
              ))}
            </span>
            {t("lounge.nav.dashboardFrom", { names: waiting.map((c) => c.member.name).join(", ") })}
          </p>
        ) : (
          <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--gt-emerald-500)]" />
            {t("lounge.nav.dashboardOnline", { count: online })}
          </p>
        )}
      </div>

      <Link
        to={target}
        className={clsx(
          "inline-flex h-10 flex-none items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-5 text-[length:var(--text-body-sm)] font-bold text-[var(--text-inverse)] transition-colors hover:bg-[var(--gt-ink-700)]",
          focusRing,
        )}
      >
        {t("lounge.nav.dashboardCta")}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
