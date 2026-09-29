import {
  privacyName,
  type CustomerReview,
  type HistoryEvent,
  type RejectReason,
  type ReportReason,
  type ReviewCustomer,
  type ReviewPhoto,
  type ReviewReport,
  type ReviewStatus,
  type ReviewTag,
} from "../data/reviewSystem";

/**
 * `reviews` rows ↔ the review store's `CustomerReview`. Pure, so it is
 * unit-tested without a Supabase client (`reviewMapping.test.ts`).
 *
 * What a row carries depends on who reads it. Visitors get the public columns
 * only (no account, order or moderation fields); a signed-in customer also
 * gets them for their own reviews; the team gets everything. Every field
 * beyond the public ones is therefore optional here.
 */

interface PersonRow {
  first_name: string | null;
  last_name: string | null;
  display_name?: string | null;
}

export interface ReviewReportRow {
  id: string;
  reason: string;
  details: string | null;
  source: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  reporter_id: string | null;
}

export interface ReviewNoteRow {
  id: string;
  body: string;
  created_at: string;
  author: PersonRow | null;
}

export interface ReviewPhotoRow {
  storage_path: string;
  alt_text: string | null;
  position: number;
}

export interface ReviewRow {
  id: string;
  is_verified: boolean;
  author_name: string;
  rating: number;
  title: string;
  body: string;
  language: string;
  tags: string[];
  status: string;
  helpful_count: number;
  response_body: string | null;
  response_at: string | null;
  published_at: string | null;
  edited_at: string | null;
  product: { slug: string } | null;
  review_photos: ReviewPhotoRow[];
  /* Signed-in readers only. */
  user_id?: string;
  submitted_at?: string;
  rejection_reason?: string | null;
  changes_request?: string | null;
  is_flagged?: boolean;
  order?: { order_number: string } | null;
  author?: (PersonRow & { email: string | null; country_code: string | null }) | null;
  responder?: PersonRow | null;
  review_reports?: ReviewReportRow[];
  review_notes?: ReviewNoteRow[];
}

/* ------------------------------ Enumerations ------------------------------ */

const STATUS_FROM_DB: Record<string, ReviewStatus> = {
  pending: "pending",
  published: "published",
  needs_changes: "needsChanges",
  rejected: "rejected",
  hidden: "hidden",
};

const REJECT_FROM_DB: Record<string, RejectReason> = {
  guidelines: "guidelines",
  personal: "personal",
  off_topic: "offTopic",
  spam: "spam",
  offensive: "offensive",
  not_authentic: "notAuthentic",
};

export function rejectReasonToDb(reason: RejectReason): string {
  return reason === "offTopic" ? "off_topic" : reason === "notAuthentic" ? "not_authentic" : reason;
}

/* --------------------------------- Mapping -------------------------------- */

/** The team member's name, or the shop's when the reader may not see it. */
const SHOP_NAME = "Global Toothgems";

function personName(person: PersonRow | null | undefined): string | undefined {
  if (!person) return undefined;
  const full = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  return full || person.display_name?.trim() || undefined;
}

function customerOf(row: ReviewRow): ReviewCustomer {
  const a = row.author;
  if (a && (a.first_name || a.last_name)) {
    return { firstName: a.first_name ?? "", lastName: a.last_name ?? "", email: a.email ?? "", country: (a.country_code ?? "").toLowerCase() };
  }
  // Only the public signature is known: "Sarah M." passes through
  // `privacyName` unchanged when it is the first name and the last is empty.
  return { firstName: row.author_name, lastName: "", email: a?.email ?? "", country: (a?.country_code ?? "").toLowerCase() };
}

function mapReport(row: ReviewReportRow): ReviewReport {
  return {
    id: row.id,
    reason: row.reason as ReportReason,
    details: row.details ?? undefined,
    at: row.created_at,
    source: row.source === "team" ? "team" : "customer",
    resolved: row.resolved_at !== null,
    resolution: (row.resolution ?? undefined) as ReviewReport["resolution"],
  };
}

/**
 * The moderation timeline, rebuilt from the dates the row keeps. The full
 * audit trail lives in `audit_logs`; this is the summary the panel shows.
 */
function historyOf(row: ReviewRow, submittedAt: string, author: string, responder: string): HistoryEvent[] {
  const events: HistoryEvent[] = [{ kind: "submitted", at: submittedAt, by: author }];
  if (row.published_at) events.push({ kind: "approved", at: row.published_at, by: SHOP_NAME });
  if (row.edited_at) events.push({ kind: "edited", at: row.edited_at, by: author });
  if (row.response_at) events.push({ kind: "responded", at: row.response_at, by: responder });
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export interface ReviewMappingContext {
  /** Account of the open session, to mark the reader's own reviews. */
  userId: string | null;
  /** Readable URL of a stored photo, or undefined when the reader may not see it. */
  photoUrl: (storagePath: string) => string | undefined;
}

/** Null for a review whose product the reader cannot see (e.g. archived). */
export function mapReview(row: ReviewRow, ctx: ReviewMappingContext): CustomerReview | null {
  if (!row.product) return null;
  const customer = customerOf(row);
  const author = privacyName(customer.firstName, customer.lastName);
  const responder = personName(row.responder) ?? SHOP_NAME;
  // Visitors are not sent the submission date; publication is the closest.
  const submittedAt = row.submitted_at ?? row.published_at ?? row.edited_at ?? "";
  const status = STATUS_FROM_DB[row.status] ?? "pending";

  const photos: ReviewPhoto[] = [...row.review_photos]
    .sort((a, b) => a.position - b.position)
    .flatMap((p) => {
      const src = ctx.photoUrl(p.storage_path);
      return src ? [{ src, alt: p.alt_text ?? "" }] : [];
    });

  return {
    id: row.id,
    subject: { kind: "product", id: row.product.slug },
    customer,
    mine: ctx.userId !== null && row.user_id === ctx.userId,
    // The order number when the reader may see it; a verified review whose
    // order is someone else's still reads as verified.
    orderRef: row.order?.order_number ?? (row.is_verified ? "" : null),
    rating: row.rating,
    title: row.title,
    body: row.body,
    lang: row.language === "en" ? "en" : "fr",
    tags: row.tags as ReviewTag[],
    photos,
    status,
    submittedAt,
    publishedAt: row.published_at ?? undefined,
    editedAt: row.edited_at ?? undefined,
    helpful: row.helpful_count,
    reports: (row.review_reports ?? []).map(mapReport),
    response: row.response_body ? { body: row.response_body, at: row.response_at ?? "", by: responder } : undefined,
    rejection:
      status === "rejected" && row.rejection_reason
        ? { reason: REJECT_FROM_DB[row.rejection_reason] ?? "guidelines" }
        : undefined,
    changesRequest: row.changes_request ?? undefined,
    flagged: row.is_flagged ?? false,
    notes: (row.review_notes ?? [])
      .map((n) => ({ id: n.id, body: n.body, at: n.created_at, by: personName(n.author) ?? SHOP_NAME }))
      .sort((a, b) => a.at.localeCompare(b.at)),
    history: historyOf(row, submittedAt, author, responder),
  };
}
