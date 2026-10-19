import type { Database } from "./supabase/database.types";
import { lookFromColumns, pendingFromColumns, type GlowbookLook, type ModeratedKey } from "./studioWorkspace/glowbookLook";

/**
 * Back-office reading of the Glowbook moderation queue (`/admin/glowbook`,
 * decision 99): rows of `studio_showcase_queue()` → what the screen shows.
 * Pure, unit-tested.
 */

export type GlowbookQueueRow = Database["public"]["Functions"]["studio_showcase_queue"]["Returns"][number];
export type QueueStatus = "pending" | "approved" | "rejected";
export type QueueView = QueueStatus | "all";

interface QueueBase {
  /** The item id, or the artist's user id for a page. */
  id: string;
  userId: string;
  status: QueueStatus;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  handle: string;
  displayName: string;
  pageStatus: QueueStatus;
}

/** The page's approved pictures and links, and what the artist proposes instead (decision 100). */
export interface QueueLook {
  approved: GlowbookLook;
  pending: Partial<Pick<GlowbookLook, ModeratedKey>>;
}

export interface QueuePage extends QueueBase {
  kind: "page";
  bio: string;
  instagram: string | null;
  look: QueueLook;
  /** The page's section names, in order (decision 102): public with the page once it is approved. */
  sections: string[];
}

/** Pictures and links proposed for an approved page: approved, they replace the current ones. */
export interface QueueChanges extends QueueBase {
  kind: "changes";
  look: QueueLook;
}

export interface QueueCreation extends QueueBase {
  kind: "creation";
  name: string;
  description: string;
  elementCount: number;
  thumbnailPath: string | null;
  updatedAt: string | null;
}

export type QueueEntry = QueuePage | QueueChanges | QueueCreation;

const asStatus = (s: string | null | undefined): QueueStatus => (s === "approved" || s === "rejected" ? s : "pending");

function lookOf(details: unknown): QueueLook {
  const d = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  const approved = d.approved && typeof d.approved === "object" ? (d.approved as Record<string, unknown>) : null;
  return { approved: lookFromColumns(approved), pending: pendingFromColumns(d.pending) };
}

function sectionsOf(details: unknown): string[] {
  const d = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  return Array.isArray(d.sections) ? d.sections.filter((n): n is string => typeof n === "string" && n.length > 0) : [];
}

/** Every picture an entry shows (approved and proposed), to sign. */
export function queueMediaPaths(entries: QueueEntry[]): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.kind === "creation") continue;
    for (const p of [e.look.approved.avatarPath, e.look.approved.bannerPath, e.look.pending.avatarPath, e.look.pending.bannerPath]) if (p) out.add(p);
  }
  return [...out];
}

export function toQueueEntry(row: GlowbookQueueRow): QueueEntry {
  const base: QueueBase = {
    id: row.id,
    userId: row.user_id,
    status: asStatus(row.status),
    reviewNote: row.review_note ?? null,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? null,
    handle: row.handle,
    displayName: row.display_name,
    pageStatus: asStatus(row.showcase_status),
  };
  if (row.kind === "showcase") return { ...base, kind: "page", bio: row.bio ?? "", instagram: row.instagram ?? null, look: lookOf(row.details), sections: sectionsOf(row.details) };
  if (row.kind === "changes") return { ...base, kind: "changes", look: lookOf(row.details) };
  return {
    ...base,
    kind: "creation",
    name: row.creation_name ?? "",
    description: row.creation_description ?? "",
    elementCount: row.element_count ?? 0,
    thumbnailPath: row.thumbnail_path ?? null,
    updatedAt: row.creation_updated_at ?? null,
  };
}

/** Waiting entries first (oldest first: first come, first served), then the rest, latest first. */
export function sortQueue(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => {
    if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
    return a.status === "pending" ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt);
  });
}

export function filterQueue(entries: QueueEntry[], view: QueueView, query: string): QueueEntry[] {
  const q = query.trim().toLowerCase();
  return sortQueue(entries).filter((e) => {
    if (view !== "all" && e.status !== view) return false;
    if (!q) return true;
    const text = [e.handle, e.displayName, e.kind === "creation" ? e.name : e.kind === "page" ? e.bio : ""].join(" ").toLowerCase();
    return text.includes(q);
  });
}

export function queueCounts(entries: QueueEntry[]): Record<QueueStatus, number> {
  const counts: Record<QueueStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const e of entries) counts[e.status] += 1;
  return counts;
}
