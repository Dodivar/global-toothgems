"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCommunity } from "../../lib/community";
import { useChat } from "../../lib/communityChat/chatStore";
import { DEFAULT_LOUNGE_PATH, parseLoungePath, type LoungeRoute } from "../../lib/communityChat/loungeRoutes";
import { useLocation, useNavigate } from "../../lib/navigation";
import { NotFound } from "../NotFound";
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
 * The Members' Lounge (`/compte/salons/…`): the community's private chat,
 * beside — not instead of — the Artist Community's feed of posts.
 *
 * Rendered by the section's layout, so it stays on screen while the address
 * moves from room to room; `children` is the page, which only checks the
 * session. The door is an account with a training on it (or a team member),
 * decided by the database (`lounge_access()`); below that, the locked screen,
 * never an error. Messages, members and counts come from `useChat()`
 * (Supabase, or the fixtures in mock mode).
 */
export function MembersLounge({ children }: { children?: ReactNode }) {
  const { hasAccess, accessKnown } = useCommunity();
  const { pathname } = useLocation();
  const route = parseLoungePath(pathname);

  if (route.kind === "notFound") return <NotFound />;
  return (
    <>
      {!accessKnown ? <LoungeWaiting /> : hasAccess ? <LoungeRoom route={route} /> : <LockedLounge />}
      {children}
    </>
  );
}

/** The lounge while it is being read: the page's frame, nothing to act on yet. */
function LoungeWaiting() {
  const { t } = useTranslation();
  return (
    <div className="grid h-[100dvh] place-items-center bg-[var(--surface-card)]" role="status" aria-busy="true">
      <h1 className="sr-only">{t("lounge.title")}</h1>
      <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("lounge.loading")}</span>
    </div>
  );
}

/** The lounge could not be read: say so, and offer to try again. */
function LoungeFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid h-[100dvh] place-items-center bg-[var(--surface-card)] px-6">
      <h1 className="sr-only">{t("lounge.title")}</h1>
      <div role="alert" className="grid max-w-[420px] justify-items-center gap-3 text-center">
        <p className="m-0 text-[length:var(--text-body)] text-[var(--text-body)]">{t("lounge.loadFailed")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-white px-5 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {t("lounge.retry")}
        </button>
      </div>
    </div>
  );
}

const LAST_ROOM_KEY = "gt-lounge-last";

/**
 * Keeps the lounge on the room of its address: opens it (which marks it
 * read), remembers it on this device, and sends the bare `/compte/salons`
 * to the room visited last.
 */
function LoungeRoom({ route }: { route: Exclude<LoungeRoute, { kind: "notFound" }> }) {
  const { syncRoute, leave, status, retry, currentConversation } = useChat();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routeKey = route.kind === "room" ? pathname : "index";
  /* The values of the render that changed the address, read by the effect below. */
  const latest = useRef({ route, pathname, navigate, syncRoute });
  useLayoutEffect(() => {
    latest.current = { route, pathname, navigate, syncRoute };
  });

  /* Runs when the address changes, and only then. */
  useLayoutEffect(() => {
    const { route, pathname, navigate, syncRoute } = latest.current;
    if (route.kind === "index") {
      let last: string | null = null;
      try {
        last = window.localStorage.getItem(LAST_ROOM_KEY);
      } catch {
        /* Storage unavailable: the default room. */
      }
      const target = last && parseLoungePath(last).kind === "room" ? last : DEFAULT_LOUNGE_PATH;
      navigate(target, { replace: true });
      return;
    }
    syncRoute(route.room, route.serverId);
    try {
      window.localStorage.setItem(LAST_ROOM_KEY, pathname);
    } catch {
      /* Not remembered: the default room next time. */
    }
  }, [routeKey]);

  useEffect(() => leave, [leave]);

  /* The bare address shows nothing while it forwards to a room. */
  if (route.kind === "index") return <div className="h-[100dvh]" aria-busy="true" />;
  if (status === "error") return <LoungeFailed onRetry={retry} />;
  if (status === "loading") return <LoungeWaiting />;
  /* A private conversation with someone who is not (or no longer) a member. */
  if (route.room.kind === "dm" && !currentConversation) return <NotFound />;
  return <LoungeLayout />;
}

/** Width from which the members column sits beside the conversation. */
const WIDE = "(min-width: 1280px)";

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
      <div className="flex h-[100dvh] min-w-0 overflow-hidden bg-[var(--surface-card)]">
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
