import type { Glowbook, GlowbookItem } from "./glowbook";

/**
 * The figures and the to-do list at the top of "My Glowbook": derived only
 * from what the artist's page and creations are in the database — no visits
 * or other figures the Studio does not have.
 */

export interface GlowbookCounts {
  approved: number;
  pending: number;
  rejected: number;
  /** Creations not filed in any section, counted only once the page has sections. */
  unfiled: number;
}

export function glowbookCounts(items: readonly GlowbookItem[], sectionCount: number): GlowbookCounts {
  const counts: GlowbookCounts = { approved: 0, pending: 0, rejected: 0, unfiled: 0 };
  for (const item of items) {
    counts[item.status] += 1;
    if (sectionCount > 0 && item.sectionId === null) counts.unfiled += 1;
  }
  return counts;
}

/** Where a to-do sends the artist on the page. */
export type GlowbookPanel = "profile" | "creations" | "look";

export type GlowbookTodo =
  | { code: "pageRejected"; panel: "profile" }
  | { code: "noItems"; panel: "creations" }
  | { code: "itemsRejected"; panel: "creations"; count: number }
  | { code: "changesRejected"; panel: "look" }
  | { code: "noSpotlight"; panel: "look" }
  | { code: "unfiled"; panel: "creations"; count: number };

/** What needs the artist's attention, most blocking first. Waiting for a moderator is not a to-do: the figures show it. */
export function glowbookTodos(glowbook: Glowbook, items: readonly GlowbookItem[], sectionCount: number): GlowbookTodo[] {
  const counts = glowbookCounts(items, sectionCount);
  const todos: GlowbookTodo[] = [];
  if (glowbook.status === "rejected") todos.push({ code: "pageRejected", panel: "profile" });
  if (items.length === 0) todos.push({ code: "noItems", panel: "creations" });
  if (counts.rejected > 0) todos.push({ code: "itemsRejected", panel: "creations", count: counts.rejected });
  if (glowbook.changesReviewNote !== null && Object.keys(glowbook.pending).length === 0) {
    todos.push({ code: "changesRejected", panel: "look" });
  }
  const spotlightLive = items.some((i) => i.id === glowbook.look.featuredItemId && i.status === "approved");
  if (counts.approved > 0 && !spotlightLive) todos.push({ code: "noSpotlight", panel: "look" });
  if (counts.unfiled > 0) todos.push({ code: "unfiled", panel: "creations", count: counts.unfiled });
  return todos;
}
