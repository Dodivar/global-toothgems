import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DISCUSSIONS,
  MEMBERS,
  getMember,
  type BadgeId,
  type Discussion,
  type Member,
  type ReactionId,
  type Reply,
} from "../data/community";
import { useAuth } from "./auth";
import { useProgress } from "./progress";

/**
 * Community state for the signed-in visitor.
 *
 * Mockup state, exactly like `cart.tsx`, `auth.tsx` and `progress.tsx`: it lives
 * in memory, nothing is verified, and everything resets on reload. It exists so
 * the forum can be used rather than only looked at — reacting, saving, replying
 * and posting all move the same numbers the rest of the screens read.
 *
 * Access is derived, not stored: the community is what a training purchase
 * unlocks, so "has a course on the account" is the rule, and `lib/progress.tsx`
 * already owns that fact. The demo override exists for the same reason the
 * loyalty card has one — the seeded account owns two courses, so the locked
 * experience would otherwise be unreachable in a review.
 *
 * None of this is access control. Real authorization belongs to the server, on
 * a verified payment event, exactly as for course content.
 */

/** Identifier of the signed-in visitor inside the community fixtures. */
export const VIEWER_ID = "you";

/** How forum access is decided. `auto` reads the account; the others force it. */
export type AccessMode = "auto" | "member" | "locked";

export const ACCESS_MODES: AccessMode[] = ["auto", "member", "locked"];

/** A reaction target: a discussion or a reply, both keyed by their own id. */
type TargetId = string;

interface CommunityContextValue {
  /** Whether the visitor can enter the community. */
  hasAccess: boolean;
  /** True when access comes from the account rather than from the demo switch. */
  accessMode: AccessMode;
  setAccessMode: (mode: AccessMode) => void;
  /** Courses on the account — what the locked card offers to change. */
  ownedCourses: number;

  /** The visitor, shaped like any other member so one component renders both. */
  viewer: Member;
  /** Any member by id, including the visitor. */
  memberOf: (id: string) => Member;

  /** Every discussion, newest first, including the ones written in session. */
  discussions: Discussion[];
  discussionsIn: (channelId: string) => Discussion[];
  getDiscussion: (id: string) => Discussion | undefined;
  /** Replies of a discussion, in the order they were written. */
  repliesOf: (discussion: Discussion) => Reply[];
  replyCountOf: (discussion: Discussion) => number;

  hasReacted: (target: TargetId, reaction: ReactionId) => boolean;
  toggleReaction: (target: TargetId, reaction: ReactionId) => void;

  isSaved: (discussionId: string) => boolean;
  toggleSaved: (discussionId: string) => boolean;
  savedDiscussions: () => Discussion[];

  /** Discussions and replies written by the visitor, newest first. */
  myDiscussions: () => Discussion[];
  myReplies: () => Array<{ reply: Reply; discussion: Discussion }>;

  addDiscussion: (input: { channelId: string; title: string; body: string; image?: string }) => Discussion;
  addReply: (discussionId: string, body: string) => void;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

/** Sorted newest first. Ages are minutes-ago, so smaller is more recent. */
function byRecency(a: { minutesAgo: number }, b: { minutesAgo: number }) {
  return a.minutesAgo - b.minutesAgo;
}

/** Stable-enough ids for content created in session. */
let nextId = 1;
function localId(prefix: string): string {
  return `${prefix}-local-${nextId++}`;
}

/**
 * The visitor as a community member.
 *
 * Built from the account rather than stored: the profile form owns the name, and
 * the badges say something true about the account — a finished course is what
 * "certified artist" means here, and an account with no contribution yet is a
 * new artist. Nothing is awarded for volume of posting.
 */
function viewerMember(
  displayName: string,
  contributions: number,
  certified: boolean,
  location: string | undefined,
  helper: boolean,
): Member {
  const badges: BadgeId[] = [];
  if (certified) badges.push("certified");
  if (helper) badges.push("helper");
  /* Only when nothing else applies: "new artist" beside "certified artist"
     would describe two different people. */
  if (badges.length === 0) badges.push("new");

  return {
    id: VIEWER_ID,
    name: displayName || "—",
    location,
    role: { fr: "Artiste tooth gem", en: "Tooth gem artist" },
    contributions,
    badges,
    joined: new Date().toISOString().slice(0, 10),
    tone: "blue",
    bio: {
      fr: "Votre profil public dans la communauté. Il reprend votre nom et vos formations.",
      en: "Your public profile in the community. It follows your name and your courses.",
    },
    activeThisWeek: true,
  };
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { displayName, profile } = useAuth();
  const { enrolledCourses, progressFor } = useProgress();

  const [accessMode, setAccessMode] = useState<AccessMode>("auto");
  /** Reactions the visitor added, per target. Never removes a seeded count. */
  const [reactions, setReactions] = useState<Record<TargetId, ReactionId[]>>({});
  const [saved, setSaved] = useState<string[]>([]);
  const [written, setWritten] = useState<Discussion[]>([]);
  const [extraReplies, setExtraReplies] = useState<Record<string, Reply[]>>({});

  const owned = enrolledCourses();
  const ownedCourses = owned.length;
  const certified = owned.some((course) => progressFor(course.id).completed);

  const hasAccess = accessMode === "auto" ? ownedCourses > 0 : accessMode === "member";

  const writtenReplyCount = useMemo(
    () => Object.values(extraReplies).reduce((sum, list) => sum + list.length, 0),
    [extraReplies],
  );

  /** The account's own city, shown the way the fixtures show a location. */
  const viewerLocation = profile?.city ? `${profile.city}, ${profile.country.toUpperCase()}` : undefined;
  const contributions = written.length + writtenReplyCount;

  const viewer = useMemo(
    () => viewerMember(displayName, contributions, certified, viewerLocation, writtenReplyCount >= 3),
    [displayName, contributions, certified, viewerLocation, writtenReplyCount],
  );

  const memberOf = useCallback((id: string) => (id === VIEWER_ID ? viewer : getMember(id) ?? viewer), [viewer]);

  const discussions = useMemo(() => [...written, ...DISCUSSIONS].sort(byRecency), [written]);

  const discussionsIn = useCallback(
    (channelId: string) => discussions.filter((d) => d.channelId === channelId),
    [discussions],
  );

  const getDiscussion = useCallback((id: string) => discussions.find((d) => d.id === id), [discussions]);

  /*
   * Chronological, oldest first — the opposite of every list in this app, and
   * deliberately so: a thread is a conversation, and an answer that arrives
   * before the question it answers is unreadable. Ages count down, so the
   * oldest reply is the one with the largest `minutesAgo`; replies written in
   * session carry 0 and land at the end, where they belong.
   */
  const repliesOf = useCallback(
    (discussion: Discussion) =>
      [...discussion.replies].sort((a, b) => b.minutesAgo - a.minutesAgo).concat(extraReplies[discussion.id] ?? []),
    [extraReplies],
  );

  const replyCountOf = useCallback(
    (discussion: Discussion) => discussion.replies.length + (extraReplies[discussion.id]?.length ?? 0),
    [extraReplies],
  );

  const hasReacted = useCallback(
    (target: TargetId, reaction: ReactionId) => (reactions[target] ?? []).includes(reaction),
    [reactions],
  );

  const toggleReaction = useCallback((target: TargetId, reaction: ReactionId) => {
    setReactions((prev) => {
      const current = prev[target] ?? [];
      const next = current.includes(reaction)
        ? current.filter((r) => r !== reaction)
        : [...current, reaction];
      return { ...prev, [target]: next };
    });
  }, []);

  const isSaved = useCallback((discussionId: string) => saved.includes(discussionId), [saved]);

  /** Returns the state it moved to, so the caller can word its confirmation. */
  const toggleSaved = useCallback((discussionId: string) => {
    let nowSaved = false;
    setSaved((prev) => {
      nowSaved = !prev.includes(discussionId);
      return nowSaved ? [discussionId, ...prev] : prev.filter((id) => id !== discussionId);
    });
    return nowSaved;
  }, []);

  const savedDiscussions = useCallback(
    () => saved.map((id) => discussions.find((d) => d.id === id)).filter((d): d is Discussion => Boolean(d)),
    [saved, discussions],
  );

  const myDiscussions = useCallback(() => [...written].sort(byRecency), [written]);

  const myReplies = useCallback(() => {
    const mine: Array<{ reply: Reply; discussion: Discussion }> = [];
    for (const [discussionId, list] of Object.entries(extraReplies)) {
      const discussion = discussions.find((d) => d.id === discussionId);
      if (!discussion) continue;
      for (const reply of list) mine.push({ reply, discussion });
    }
    return mine.sort((a, b) => a.reply.minutesAgo - b.reply.minutesAgo);
  }, [extraReplies, discussions]);

  const addDiscussion = useCallback(
    ({ channelId, title, body, image }: { channelId: string; title: string; body: string; image?: string }) => {
      /* The visitor writes in one language; the bilingual shape is what every
         reader in `data/community.ts` expects, so the same text fills both. */
      const paragraphs = body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => ({ fr: p, en: p }));

      const discussion: Discussion = {
        id: localId("d"),
        channelId,
        authorId: VIEWER_ID,
        title: { fr: title, en: title },
        body: paragraphs.length ? paragraphs : [{ fr: body, en: body }],
        minutesAgo: 0,
        image,
        reactions: {},
        replies: [],
      };
      setWritten((prev) => [discussion, ...prev]);
      return discussion;
    },
    [],
  );

  const addReply = useCallback((discussionId: string, body: string) => {
    const reply: Reply = {
      id: localId("r"),
      authorId: VIEWER_ID,
      minutesAgo: 0,
      body: { fr: body, en: body },
      reactions: {},
    };
    setExtraReplies((prev) => ({ ...prev, [discussionId]: [...(prev[discussionId] ?? []), reply] }));
  }, []);

  const value = useMemo<CommunityContextValue>(
    () => ({
      hasAccess,
      accessMode,
      setAccessMode,
      ownedCourses,
      viewer,
      memberOf,
      discussions,
      discussionsIn,
      getDiscussion,
      repliesOf,
      replyCountOf,
      hasReacted,
      toggleReaction,
      isSaved,
      toggleSaved,
      savedDiscussions,
      myDiscussions,
      myReplies,
      addDiscussion,
      addReply,
    }),
    [
      hasAccess,
      accessMode,
      ownedCourses,
      viewer,
      memberOf,
      discussions,
      discussionsIn,
      getDiscussion,
      repliesOf,
      replyCountOf,
      hasReacted,
      toggleReaction,
      isSaved,
      toggleSaved,
      savedDiscussions,
      myDiscussions,
      myReplies,
      addDiscussion,
      addReply,
    ],
  );

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error("useCommunity must be used within CommunityProvider");
  return ctx;
}

/** Members shown in the directory: the fixtures, most active first. */
export function directoryMembers(): Member[] {
  return [...MEMBERS].sort((a, b) => b.contributions - a.contributions);
}
