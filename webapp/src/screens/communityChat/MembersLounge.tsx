"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCommunity } from "../../lib/community";
import { ChatProvider } from "../../lib/communityChat/chatStore";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { LoungeUiContext, type LoungeUi, type NavTab } from "../../components/communityChat/loungeUi";
import { ChatSidebar } from "../../components/communityChat/Sidebar";
import { ConversationHeader } from "../../components/communityChat/ConversationHeader";
import { MessageList } from "../../components/communityChat/Messages";
import { Composer } from "../../components/communityChat/Composer";
import { MembersPanel } from "../../components/communityChat/MembersPanel";
import { InboxDialog, NewMessageDialog, ProfileDialog, SearchDialog } from "../../components/communityChat/Dialogs";
import { LockedLounge } from "../../components/communityChat/LockedLounge";

/**
 * The Members' Lounge (`/compte/salons`): the community's private chat,
 * beside — not instead of — the Artist Community's feed of posts.
 *
 * Same door as the forum: an account with a training on it. Below that,
 * the locked screen, never an error. Prototype: conversations are fixtures
 * and local state (`lib/communityChat`), nothing leaves the browser.
 */
export function MembersLounge() {
  const { hasAccess } = useCommunity();
  if (!hasAccess) return <LockedLounge />;
  return (
    <ChatProvider>
      <LoungeLayout />
    </ChatProvider>
  );
}

/** Width from which the members column sits beside the conversation. */
const WIDE = "(min-width: 1440px)";

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

type DialogState =
  | { kind: "profile"; memberId: string }
  | { kind: "search" }
  | { kind: "inbox" }
  | { kind: "newMessage" }
  | null;

/** A panel sliding in from one edge, modal while open (phones and tablets). */
function Drawer({ side, label, onClose, children }: { side: "left" | "right"; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[300]">
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-[rgba(17,17,17,.42)] motion-safe:animate-[gt-admin-fade_var(--duration-normal)_var(--ease-standard)_both]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`absolute inset-y-0 flex w-[min(320px,88vw)] flex-col bg-[var(--surface-chrome)] shadow-[var(--shadow-lg)] outline-none ${side === "left" ? "left-0" : "right-0"}`}
      >
        {children}
      </div>
    </div>
  );
}

function LoungeLayout() {
  const { t } = useTranslation();
  const wide = useMediaQuery(WIDE);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [membersPinned, setMembersPinned] = useState(true);
  const [membersDrawer, setMembersDrawer] = useState(false);
  const [nav, setNav] = useState<NavTab | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const navBody = useRef<HTMLDivElement>(null);

  /* The members panel remembers being closed, on this device only. */
  useEffect(() => {
    try {
      if (window.localStorage.getItem("gt-lounge-members") === "closed") setMembersPinned(false);
    } catch {
      /* Storage unavailable: the panel simply starts open. */
    }
  }, []);

  const toggleMembers = useCallback(() => {
    if (window.matchMedia(WIDE).matches) {
      setMembersPinned((open) => {
        try {
          window.localStorage.setItem("gt-lounge-members", open ? "closed" : "open");
        } catch {
          /* Not remembered, still toggled. */
        }
        return !open;
      });
    } else {
      setMembersDrawer((open) => !open);
    }
  }, []);

  /* Opened on "Messages": bring the private conversations into view. */
  useEffect(() => {
    if (nav !== "messages") return;
    const target = navBody.current?.querySelector<HTMLElement>(`nav[aria-label="${t("lounge.dm.heading")}"]`);
    target?.scrollIntoView({ block: "start" });
  }, [nav, t]);

  const ui = useMemo<LoungeUi>(
    () => ({
      openProfile: (memberId) => setDialog({ kind: "profile", memberId }),
      openSearch: () => setDialog({ kind: "search" }),
      openInbox: () => setDialog({ kind: "inbox" }),
      openNewMessage: () => setDialog({ kind: "newMessage" }),
      openNav: (tab = "channels") => setNav(tab),
      closeNav: () => setNav(null),
      membersOpen: wide ? membersPinned : membersDrawer,
      toggleMembers,
    }),
    [wide, membersPinned, membersDrawer, toggleMembers],
  );

  const closeDialog = () => setDialog(null);

  return (
    <LoungeUiContext.Provider value={ui}>
      <div className="flex h-[calc(100dvh-3.5rem)] min-w-0 overflow-hidden bg-[var(--surface-card)] lg:h-[100dvh]">
        <h1 className="sr-only">{t("lounge.title")}</h1>

        <aside aria-label={t("lounge.drawer.title")} className="hidden w-[264px] flex-none border-r border-[var(--border-subtle)] lg:block">
          <ChatSidebar />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <ConversationHeader />
          <MessageList />
          <Composer />
        </main>

        {wide && membersPinned && (
          <aside aria-label={t("lounge.members.heading")} className="w-[256px] flex-none border-l border-[var(--border-subtle)]">
            <MembersPanel />
          </aside>
        )}
      </div>

      {nav && !desktop && (
        <Drawer side="left" label={t("lounge.drawer.title")} onClose={() => setNav(null)}>
          <div ref={navBody} className="min-h-0 flex-1">
            <ChatSidebar />
          </div>
        </Drawer>
      )}

      {membersDrawer && !wide && (
        <Drawer side="right" label={t("lounge.members.heading")} onClose={() => setMembersDrawer(false)}>
          <MembersPanel onClose={() => setMembersDrawer(false)} />
        </Drawer>
      )}

      {dialog?.kind === "profile" && <ProfileDialog memberId={dialog.memberId} onClose={closeDialog} />}
      {dialog?.kind === "search" && <SearchDialog onClose={closeDialog} />}
      {dialog?.kind === "inbox" && <InboxDialog onClose={closeDialog} />}
      {dialog?.kind === "newMessage" && <NewMessageDialog onClose={closeDialog} />}
    </LoungeUiContext.Provider>
  );
}
