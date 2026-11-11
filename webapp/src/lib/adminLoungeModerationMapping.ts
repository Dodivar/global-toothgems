/**
 * Back-office reading of the Members' Lounge moderation (`/admin/salons`,
 * decision 132): the reported messages grouped by message, their context, the
 * decisions, the complaints and the counters, from the `lounge_moderation_*`
 * functions (`moderate_community`). Pure: tested without Supabase.
 */
import {
  ILLEGAL_CATEGORIES,
  REPORT_REASONS,
  groundFor,
  isTextValid,
  mapMemberLabel,
  type AppealStatus,
  type DecisionAction,
  type DecisionGround,
  type IllegalCategory,
  type MemberLabel,
  type ReportReason,
  type ReportStatus,
} from "./communityChat/moderation";

export interface StaffLabel extends MemberLabel {
  isStaff: boolean;
}

export interface QueueReport {
  id: string;
  reason: ReportReason;
  category: IllegalCategory | null;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  attachmentId: string | null;
  reporter: StaffLabel | null;
}

export interface QueueAttachment {
  id: string;
  path: string;
  alt: string;
}

export interface QueueEntry {
  messageId: string;
  channelId: string | null;
  conversationId: string | null;
  author: StaffLabel | null;
  text: string;
  createdAt: string;
  hidden: boolean;
  attachments: QueueAttachment[];
  authorMutedUntil: string | null;
  authorBannedAt: string | null;
  authorDecisions: number;
  openReports: number;
  firstReportedAt: string;
  reports: QueueReport[];
}

export interface ContextMessage {
  id: string;
  author: StaffLabel | null;
  text: string;
  createdAt: string;
  hidden: boolean;
  attachmentCount: number;
  isTarget: boolean;
}

export interface HistoryEntry {
  id: string;
  action: DecisionAction;
  reason: ReportReason | null;
  category: IllegalCategory | null;
  ground: DecisionGround | null;
  statement: string;
  endsAt: string | null;
  reportCount: number;
  createdAt: string;
  messageId: string | null;
  target: StaffLabel | null;
  decidedBy: string | null;
  excerpt: string | null;
  appealId: string | null;
  appeals: number;
  notified: boolean;
}

export interface AppealEntry {
  id: string;
  status: AppealStatus;
  body: string | null;
  response: string | null;
  createdAt: string;
  answeredAt: string | null;
  appellantRole: "target" | "reporter";
  appellant: StaffLabel | null;
  answeredBy: string | null;
  decision: {
    id: string;
    action: DecisionAction;
    reason: ReportReason | null;
    category: IllegalCategory | null;
    ground: DecisionGround | null;
    statement: string;
    endsAt: string | null;
    createdAt: string;
    messageId: string | null;
    excerpt: string | null;
    target: StaffLabel | null;
    decidedBy: string | null;
    messageStatus: "visible" | "hidden" | null;
  };
}

export interface ModerationStats {
  reports: number;
  reportsByReason: Partial<Record<ReportReason, number>>;
  reportsByCategory: Partial<Record<IllegalCategory, number>>;
  nonMemberNotices: number;
  decisionsByAction: Partial<Record<DecisionAction, number>>;
  decisionsByGround: Partial<Record<DecisionGround, number>>;
  automatedDecisions: number;
  medianHoursToDecision: number | null;
  appeals: number;
  appealsByOutcome: Partial<Record<AppealStatus, number>>;
  medianHoursToAnswer: number | null;
  openReports: number;
  openAppeals: number;
  mutedNow: number;
  excludedNow: number;
}

const ACTIONS: readonly DecisionAction[] = ["dismiss", "hide", "restore", "delete", "mute", "ban", "lift"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
function counts<T extends string>(value: unknown, keys: readonly T[]): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  if (!isRecord(value)) return out;
  for (const key of keys) if (count(value[key]) > 0) out[key] = count(value[key]);
  return out;
}

export function mapStaffLabel(value: unknown): StaffLabel | null {
  const label = mapMemberLabel(value);
  return label ? { ...label, isStaff: isRecord(value) && value.is_staff === true } : null;
}

export function mapQueue(value: unknown): QueueEntry[] {
  return list(value).flatMap((item) => {
    if (!isRecord(item) || !text(item.message_id)) return [];
    return [{
      messageId: String(item.message_id),
      channelId: text(item.channel_id),
      conversationId: text(item.conversation_id),
      author: mapStaffLabel(item.author),
      text: String(item.body_text ?? ""),
      createdAt: String(item.created_at ?? ""),
      hidden: item.moderation_status === "hidden",
      attachments: list(item.attachments).flatMap((a) =>
        isRecord(a) && text(a.id) && text(a.path) ? [{ id: String(a.id), path: String(a.path), alt: String(a.alt ?? "") }] : [],
      ),
      authorMutedUntil: text(item.author_muted_until),
      authorBannedAt: text(item.author_banned_at),
      authorDecisions: count(item.author_decisions),
      openReports: count(item.open_reports),
      firstReportedAt: String(item.first_reported_at ?? ""),
      reports: list(item.reports).flatMap((r) => {
        if (!isRecord(r) || !text(r.id)) return [];
        const reason = oneOf(r.reason, REPORT_REASONS);
        if (!reason) return [];
        return [{
          id: String(r.id),
          reason,
          category: oneOf(r.illegal_category, ILLEGAL_CATEGORIES),
          details: text(r.details),
          status: oneOf(r.status, ["open", "actioned", "dismissed"] as const) ?? "open",
          createdAt: String(r.created_at ?? ""),
          resolvedAt: text(r.resolved_at),
          attachmentId: text(r.attachment_id),
          reporter: mapStaffLabel(r.reporter),
        }];
      }),
    }];
  });
}

export function mapContext(value: unknown): ContextMessage[] {
  return list(value).flatMap((item) =>
    isRecord(item) && text(item.id)
      ? [{
          id: String(item.id),
          author: mapStaffLabel(item.author),
          text: String(item.body_text ?? ""),
          createdAt: String(item.created_at ?? ""),
          hidden: item.moderation_status === "hidden",
          attachmentCount: count(item.attachment_count),
          isTarget: item.is_target === true,
        }]
      : [],
  );
}

export function mapHistory(value: unknown): HistoryEntry[] {
  return list(value).flatMap((item) => {
    if (!isRecord(item) || !text(item.id)) return [];
    const action = oneOf(item.action, ACTIONS);
    if (!action) return [];
    return [{
      id: String(item.id),
      action,
      reason: oneOf(item.reason, REPORT_REASONS),
      category: oneOf(item.illegal_category, ILLEGAL_CATEGORIES),
      ground: oneOf(item.ground, ["terms", "illegal"] as const),
      statement: String(item.statement ?? ""),
      endsAt: text(item.ends_at),
      reportCount: count(item.report_count),
      createdAt: String(item.created_at ?? ""),
      messageId: text(item.message_id),
      target: mapStaffLabel(item.target),
      decidedBy: text(item.decided_by),
      excerpt: text(item.excerpt),
      appealId: text(item.appeal_id),
      appeals: count(item.appeals),
      notified: item.notified === true,
    }];
  });
}

export function mapAppeals(value: unknown): AppealEntry[] {
  return list(value).flatMap((item) => {
    if (!isRecord(item) || !text(item.id) || !isRecord(item.decision)) return [];
    const d = item.decision;
    const action = oneOf(d.action, ACTIONS);
    if (!action || !text(d.id)) return [];
    return [{
      id: String(item.id),
      status: oneOf(item.status, ["open", "upheld", "reversed"] as const) ?? "open",
      body: text(item.body),
      response: text(item.response),
      createdAt: String(item.created_at ?? ""),
      answeredAt: text(item.answered_at),
      appellantRole: item.appellant_role === "reporter" ? "reporter" : "target",
      appellant: mapStaffLabel(item.appellant),
      answeredBy: text(item.answered_by),
      decision: {
        id: String(d.id),
        action,
        reason: oneOf(d.reason, REPORT_REASONS),
        category: oneOf(d.illegal_category, ILLEGAL_CATEGORIES),
        ground: oneOf(d.ground, ["terms", "illegal"] as const),
        statement: String(d.statement ?? ""),
        endsAt: text(d.ends_at),
        createdAt: String(d.created_at ?? ""),
        messageId: text(d.message_id),
        excerpt: text(d.excerpt),
        target: mapStaffLabel(d.target),
        decidedBy: text(d.decided_by),
        messageStatus: oneOf(d.message_status, ["visible", "hidden"] as const),
      },
    }];
  });
}

export function mapStats(value: unknown): ModerationStats {
  const v = isRecord(value) ? value : {};
  const hours = (x: unknown) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(x));
  return {
    reports: count(v.reports),
    reportsByReason: counts(v.reports_by_reason, REPORT_REASONS),
    reportsByCategory: counts(v.reports_by_category, ILLEGAL_CATEGORIES),
    nonMemberNotices: count(v.non_member_notices),
    decisionsByAction: counts(v.decisions_by_action, ACTIONS),
    decisionsByGround: counts(v.decisions_by_ground, ["terms", "illegal"] as const),
    automatedDecisions: count(v.automated_decisions),
    medianHoursToDecision: hours(v.median_hours_to_decision),
    appeals: count(v.appeals),
    appealsByOutcome: counts(v.appeals_by_outcome, ["open", "upheld", "reversed"] as const),
    medianHoursToAnswer: hours(v.median_hours_to_answer),
    openReports: count(v.open_reports),
    openAppeals: count(v.open_appeals),
    mutedNow: count(v.muted_now),
    excludedNow: count(v.excluded_now),
  };
}

/* ------------------------------------------------------------------ decisions */

export type MessageAction = "dismiss" | "hide" | "restore" | "delete";
export type MemberAction = "mute" | "ban" | "lift";
export type ModerationAction = MessageAction | MemberAction;

/** Durations offered for a mute, in hours. */
export const MUTE_DURATIONS = [1, 24, 24 * 7, 24 * 30] as const;

export interface ActionDraft {
  action: ModerationAction;
  reason: ReportReason | "";
  category: IllegalCategory | "";
  statement: string;
  muteHours: (typeof MUTE_DURATIONS)[number];
}

/** Adverse actions need a reason (and its ground); every action needs a statement. */
export function needsReason(action: ModerationAction): boolean {
  return action === "hide" || action === "delete" || action === "mute" || action === "ban";
}

export type ActionDraftError = "reason" | "category" | "statement";

export function actionDraftErrors(draft: ActionDraft): ActionDraftError[] {
  const errors: ActionDraftError[] = [];
  if (needsReason(draft.action)) {
    if (!draft.reason) errors.push("reason");
    else if (draft.reason === "illegal" && !draft.category) errors.push("category");
  }
  if (!isTextValid(draft.statement)) errors.push("statement");
  return errors;
}

/** The reason, category and ground a valid draft sends (none for dismiss, restore, lift). */
export function decisionGrounds(draft: ActionDraft): { reason: ReportReason | null; category: IllegalCategory | null; ground: DecisionGround | null } {
  if (!needsReason(draft.action) || !draft.reason) return { reason: null, category: null, ground: null };
  return {
    reason: draft.reason,
    category: draft.reason === "illegal" && draft.category ? draft.category : null,
    ground: groundFor(draft.reason),
  };
}

/** The actions open on a reported message, given its state and its author's. */
export function availableActions(entry: Pick<QueueEntry, "hidden" | "openReports" | "authorMutedUntil" | "authorBannedAt" | "author">, now: number): ModerationAction[] {
  const actions: ModerationAction[] = [];
  if (entry.openReports > 0) actions.push("dismiss");
  actions.push(entry.hidden ? "restore" : "hide", "delete");
  if (entry.author && !entry.author.isStaff) {
    const muted = entry.authorMutedUntil !== null && Date.parse(entry.authorMutedUntil) > now;
    if (entry.authorBannedAt === null) {
      if (!muted) actions.push("mute");
      actions.push("ban");
    }
    if (muted || entry.authorBannedAt !== null) actions.push("lift");
  }
  return actions;
}

export type StatsPeriod = "30d" | "year" | "12m";

/** The period's bounds, `[from, to)`. */
export function periodBounds(period: StatsPeriod, now: Date): { from: Date; to: Date } {
  const to = new Date(now.getTime() + 60_000);
  if (period === "year") return { from: new Date(now.getFullYear(), 0, 1), to };
  const from = new Date(now);
  if (period === "30d") from.setDate(from.getDate() - 30);
  else from.setFullYear(from.getFullYear() - 1);
  return { from, to };
}
