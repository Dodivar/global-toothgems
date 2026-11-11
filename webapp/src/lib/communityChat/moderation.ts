/**
 * Members' Lounge moderation, as the member sees it (decision 132): the
 * reasons a message can be reported for, the categories of unlawful content,
 * and the member's moderation file read from `lounge_my_moderation()`.
 * Pure: no Supabase here (the calls are in `loungeApi.ts`).
 *
 * The lists mirror `private.lounge_reason_valid()`: the database refuses
 * anything else.
 */

export const REPORT_REASONS = ["illegal", "harassment", "spam", "personal_data", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const ILLEGAL_CATEGORIES = [
  "hate_speech",
  "violence_threats",
  "terrorism",
  "child_safety",
  "scam_fraud",
  "counterfeit_ip",
  "privacy_image",
  "defamation",
  "illegal_products",
  "other_illegal",
] as const;
export type IllegalCategory = (typeof ILLEGAL_CATEGORIES)[number];

/** The explanation a report and a complaint need, in characters (trimmed). */
export const TEXT_MIN = 10;
export const TEXT_MAX = 2000;

/** Months a decision can be contested (DSA art. 20). */
export const APPEAL_MONTHS = 6;

export type DecisionAction = "dismiss" | "hide" | "restore" | "delete" | "mute" | "ban" | "lift";
export type DecisionGround = "terms" | "illegal";
export type ReportStatus = "open" | "actioned" | "dismissed";
export type AppealStatus = "open" | "upheld" | "reversed";

export interface ReportDraft {
  reason: ReportReason | "";
  category: IllegalCategory | "";
  details: string;
}

export type ReportDraftError = "reason" | "category" | "details";

/** What is missing before a report can be sent (the database checks the same). */
export function reportDraftErrors(draft: ReportDraft): ReportDraftError[] {
  const errors: ReportDraftError[] = [];
  if (!draft.reason) errors.push("reason");
  if (draft.reason === "illegal" && !draft.category) errors.push("category");
  const length = draft.details.trim().length;
  if (length < TEXT_MIN || length > TEXT_MAX) errors.push("details");
  return errors;
}

/** The arguments of `lounge_report_message()` for a valid draft. */
export function reportArguments(draft: ReportDraft): { reason: ReportReason; category: IllegalCategory | null; details: string } {
  if (!draft.reason) throw new Error("report without a reason");
  return { reason: draft.reason, category: draft.reason === "illegal" && draft.category ? draft.category : null, details: draft.details.trim() };
}

/** A decision's ground follows its reason: unlawful content is the law's, the rest the terms of use's. */
export function groundFor(reason: ReportReason): DecisionGround {
  return reason === "illegal" ? "illegal" : "terms";
}

export function isTextValid(value: string): boolean {
  const length = value.trim().length;
  return length >= TEXT_MIN && length <= TEXT_MAX;
}

export interface ModerationAppeal {
  id: string;
  status: AppealStatus;
  body: string | null;
  response: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export interface ModerationDecision {
  id: string;
  action: DecisionAction;
  reason: ReportReason | null;
  category: IllegalCategory | null;
  ground: DecisionGround | null;
  statement: string;
  endsAt: string | null;
  automated: boolean;
  createdAt: string;
  messageId: string | null;
  excerpt: string | null;
  attachmentCount: number;
  appealUntil: string;
  appeal: ModerationAppeal | null;
}

export interface MyReport {
  id: string;
  messageId: string | null;
  reason: ReportReason;
  category: IllegalCategory | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  decision: ModerationDecision | null;
}

export interface MemberLabel {
  id: string;
  name: string | null;
  handle: string | null;
}

export interface MyModeration {
  mutedUntil: string | null;
  bannedAt: string | null;
  decisions: ModerationDecision[];
  reports: MyReport[];
  blocked: MemberLabel[];
}

export const EMPTY_MODERATION: MyModeration = { mutedUntil: null, bannedAt: null, decisions: [], reports: [], blocked: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}

const ACTIONS: readonly DecisionAction[] = ["dismiss", "hide", "restore", "delete", "mute", "ban", "lift"];

export function mapAppeal(value: unknown): ModerationAppeal | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return {
    id: String(value.id),
    status: oneOf(value.status, ["open", "upheld", "reversed"] as const) ?? "open",
    body: text(value.body),
    response: text(value.response),
    createdAt: String(value.created_at ?? ""),
    answeredAt: text(value.answered_at),
  };
}

export function mapDecision(value: unknown): ModerationDecision | null {
  if (!isRecord(value) || !text(value.id)) return null;
  const action = oneOf(value.action, ACTIONS);
  if (!action) return null;
  return {
    id: String(value.id),
    action,
    reason: oneOf(value.reason, REPORT_REASONS),
    category: oneOf(value.illegal_category, ILLEGAL_CATEGORIES),
    ground: oneOf(value.ground, ["terms", "illegal"] as const),
    statement: String(value.statement ?? ""),
    endsAt: text(value.ends_at),
    automated: value.automated === true,
    createdAt: String(value.created_at ?? ""),
    messageId: text(value.message_id),
    excerpt: text(value.excerpt),
    attachmentCount: Number(value.attachment_count) || 0,
    appealUntil: String(value.appeal_until ?? ""),
    appeal: mapAppeal(value.appeal),
  };
}

export function mapMemberLabel(value: unknown): MemberLabel | null {
  if (!isRecord(value) || !text(value.id)) return null;
  return { id: String(value.id), name: text(value.name), handle: text(value.handle) };
}

/** `lounge_my_moderation()` as the screens use it; anything malformed is dropped. */
export function mapMyModeration(value: unknown): MyModeration {
  if (!isRecord(value)) return EMPTY_MODERATION;
  const list = (items: unknown) => (Array.isArray(items) ? items : []);
  return {
    mutedUntil: text(value.muted_until),
    bannedAt: text(value.banned_at),
    decisions: list(value.decisions).map(mapDecision).filter((d): d is ModerationDecision => d !== null),
    reports: list(value.reports).flatMap((item) => {
      if (!isRecord(item) || !text(item.id)) return [];
      const reason = oneOf(item.reason, REPORT_REASONS);
      if (!reason) return [];
      return [{
        id: String(item.id),
        messageId: text(item.message_id),
        reason,
        category: oneOf(item.illegal_category, ILLEGAL_CATEGORIES),
        status: oneOf(item.status, ["open", "actioned", "dismissed"] as const) ?? "open",
        createdAt: String(item.created_at ?? ""),
        resolvedAt: text(item.resolved_at),
        decision: mapDecision(item.decision),
      }];
    }),
    blocked: list(value.blocked).map(mapMemberLabel).filter((m): m is MemberLabel => m !== null),
  };
}

/** Whether a decision can still be contested by the viewer (once, within 6 months). */
export function canAppeal(decision: ModerationDecision, now: number): boolean {
  if (decision.appeal) return false;
  const until = Date.parse(decision.appealUntil);
  return Number.isFinite(until) && now <= until;
}

/** The mute in force, as epoch milliseconds, or null. */
export function activeMute(moderation: Pick<MyModeration, "mutedUntil">, now: number): number | null {
  const until = moderation.mutedUntil ? Date.parse(moderation.mutedUntil) : NaN;
  return Number.isFinite(until) && until > now ? until : null;
}
