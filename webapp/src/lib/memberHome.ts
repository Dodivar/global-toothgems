import { learnHref, lessonHref } from "./academyUrl";
import { MEMBER_SPACE_PATH, orderHref } from "./memberSpace";

/**
 * The home page's band for a signed-in member (owner, 2026-11-17): under the
 * carousel, up to three shortcuts to what is theirs right now, chosen from
 * what the site already holds for every page (orders, courses, loyalty card,
 * favourites) — never a fetch of its own.
 */
export type HomeShortcut =
  | { kind: "order"; to: string; reference: string; shipped: boolean }
  | { kind: "course"; to: string; title: string; pct: number }
  | { kind: "reward"; to: string }
  | { kind: "favorites"; to: string; count: number }
  | { kind: "space"; to: string };

export interface HomeShortcutInput {
  /** Orders being prepared or on their way, newest first (`ordersOnTheirWay`). */
  onTheirWay: { reference: string; status: string }[];
  /** The course to resume, if one is started and not finished. */
  resume: { courseId: string; title: string; pct: number; nextKey: string | null } | null;
  /** The loyalty card holds a reward to spend. */
  rewardReady: boolean;
  favorites: number;
}

const MAX_SHORTCUTS = 3;

/** Most time-bound first: a parcel, then a course under way, a reward, the favourites; the dashboard when nothing else. */
export function homeShortcuts(input: HomeShortcutInput): HomeShortcut[] {
  const list: HomeShortcut[] = [];
  const order = input.onTheirWay[0];
  if (order) list.push({ kind: "order", to: orderHref(order.reference), reference: order.reference, shipped: order.status === "shipped" });
  if (input.resume) {
    const { courseId, title, pct, nextKey } = input.resume;
    list.push({ kind: "course", to: nextKey ? lessonHref(courseId, nextKey) : learnHref(courseId), title, pct });
  }
  if (input.rewardReady) list.push({ kind: "reward", to: "/compte/fidelite" });
  if (input.favorites > 0) list.push({ kind: "favorites", to: "/boutique?favoris=1", count: input.favorites });
  if (list.length === 0) list.push({ kind: "space", to: MEMBER_SPACE_PATH });
  return list.slice(0, MAX_SHORTCUTS);
}
