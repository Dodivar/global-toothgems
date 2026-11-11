import { describe, expect, it } from "vitest";
import {
  actionDraftErrors,
  availableActions,
  decisionGrounds,
  mapAppeals,
  mapContext,
  mapHistory,
  mapQueue,
  mapStats,
  periodBounds,
  type ActionDraft,
} from "./adminLoungeModerationMapping";

const author = { id: "u1", name: "Alice A.", handle: "alice.a", is_staff: false };

describe("the moderation queue", () => {
  it("groups reports by message and drops malformed rows", () => {
    const queue = mapQueue([
      {
        message_id: "m1",
        channel_id: "fr-general",
        author,
        body_text: "Buy here",
        created_at: "2026-11-10T10:00:00Z",
        moderation_status: "visible",
        attachments: [{ id: "a1", path: "u1/x.jpg", alt: "" }, { id: "a2" }],
        author_muted_until: null,
        author_banned_at: null,
        author_decisions: 2,
        open_reports: 2,
        first_reported_at: "2026-11-10T11:00:00Z",
        reports: [
          { id: "r1", reason: "spam", details: "Advertising", status: "open", created_at: "2026-11-10T11:00:00Z", reporter: { id: "u2", name: "Bruno R.", handle: "bruno.r" } },
          { id: "r2", reason: "illegal", illegal_category: "scam_fraud", details: null, status: "open", created_at: "2026-11-10T12:00:00Z", reporter: null },
          { id: "r3", reason: "unknown" },
        ],
      },
      { body_text: "no id" },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ messageId: "m1", hidden: false, openReports: 2, authorDecisions: 2 });
    expect(queue[0].attachments).toEqual([{ id: "a1", path: "u1/x.jpg", alt: "" }]);
    expect(queue[0].reports.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(queue[0].reports[1]).toMatchObject({ category: "scam_fraud", reporter: null, details: null });
    expect(queue[0].author?.isStaff).toBe(false);
  });

  it("reads the context, the history and the complaints", () => {
    expect(mapContext([{ id: "m0", author, body_text: "Before", moderation_status: "hidden", attachment_count: 1, is_target: false }, { id: "m1", is_target: true }])).toMatchObject([
      { id: "m0", hidden: true, attachmentCount: 1, isTarget: false },
      { id: "m1", isTarget: true, author: null },
    ]);
    expect(mapHistory([{ id: "d1", action: "hide", reason: "spam", ground: "terms", statement: "No ads", notified: true, decided_by: "Team" }, { id: "d2", action: "x" }])).toMatchObject([
      { id: "d1", action: "hide", ground: "terms", notified: true, decidedBy: "Team" },
    ]);
    const appeals = mapAppeals([
      { id: "a1", status: "open", body: "Please", appellant_role: "reporter", appellant: author, decision: { id: "d1", action: "dismiss", statement: "Fine", message_status: "visible" } },
      { id: "a2", decision: null },
    ]);
    expect(appeals).toHaveLength(1);
    expect(appeals[0]).toMatchObject({ appellantRole: "reporter", decision: { action: "dismiss", messageStatus: "visible" } });
  });

  it("reads the counters, zero when absent", () => {
    const stats = mapStats({ reports: 5, reports_by_reason: { spam: 3, illegal: 2, bogus: 4 }, automated_decisions: 0, median_hours_to_decision: 4.5, median_hours_to_answer: null });
    expect(stats.reports).toBe(5);
    expect(stats.reportsByReason).toEqual({ spam: 3, illegal: 2 });
    expect(stats.medianHoursToDecision).toBe(4.5);
    expect(stats.medianHoursToAnswer).toBeNull();
    expect(mapStats(null).openReports).toBe(0);
  });
});

describe("decisions", () => {
  const draft = (overrides: Partial<ActionDraft>): ActionDraft => ({ action: "hide", reason: "", category: "", statement: "", muteHours: 24, ...overrides });

  it("need a reason for adverse actions, a category for unlawful content, and always a statement", () => {
    expect(actionDraftErrors(draft({}))).toEqual(["reason", "statement"]);
    expect(actionDraftErrors(draft({ reason: "illegal", statement: "An explanation for the member" }))).toEqual(["category"]);
    expect(actionDraftErrors(draft({ action: "dismiss", statement: "short" }))).toEqual(["statement"]);
    expect(actionDraftErrors(draft({ action: "dismiss", statement: "Nothing contrary to the terms." }))).toEqual([]);
  });

  it("derive the ground from the reason, none for dismiss, restore and lift", () => {
    expect(decisionGrounds(draft({ reason: "illegal", category: "defamation" }))).toEqual({ reason: "illegal", category: "defamation", ground: "illegal" });
    expect(decisionGrounds(draft({ reason: "spam", category: "defamation" }))).toEqual({ reason: "spam", category: null, ground: "terms" });
    expect(decisionGrounds(draft({ action: "lift", reason: "spam" }))).toEqual({ reason: null, category: null, ground: null });
  });

  it("offer the actions the message and its author allow", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const base = { hidden: false, openReports: 1, authorMutedUntil: null, authorBannedAt: null, author: { id: "u1", name: null, handle: null, isStaff: false } };
    expect(availableActions(base, now)).toEqual(["dismiss", "hide", "delete", "mute", "ban"]);
    expect(availableActions({ ...base, hidden: true, openReports: 0 }, now)).toEqual(["restore", "delete", "mute", "ban"]);
    expect(availableActions({ ...base, authorMutedUntil: "2026-11-11T00:00:00Z" }, now)).toEqual(["dismiss", "hide", "delete", "ban", "lift"]);
    expect(availableActions({ ...base, authorBannedAt: "2026-11-01T00:00:00Z" }, now)).toEqual(["dismiss", "hide", "delete", "lift"]);
    expect(availableActions({ ...base, author: { ...base.author, isStaff: true } }, now)).toEqual(["dismiss", "hide", "delete"]);
  });

  it("bound the counters' periods", () => {
    const now = new Date(2026, 10, 10, 12);
    expect(periodBounds("year", now).from).toEqual(new Date(2026, 0, 1));
    expect(periodBounds("30d", now).from.getDate()).toBe(11);
    expect(periodBounds("12m", now).from.getFullYear()).toBe(2025);
  });
});
