import { describe, expect, it } from "vitest";
import { activeMute, canAppeal, groundFor, mapMyModeration, reportArguments, reportDraftErrors } from "./moderation";

const decision = {
  id: "d1",
  action: "hide",
  reason: "illegal",
  illegal_category: "privacy_image",
  ground: "illegal",
  statement: "A photo published without consent.",
  ends_at: null,
  automated: false,
  created_at: "2026-11-10T10:00:00Z",
  message_id: "m1",
  excerpt: "Look at this client",
  attachment_count: 1,
  appeal_until: "2027-05-10T10:00:00Z",
  appeal: null,
};

describe("report drafts", () => {
  it("need a reason, a category for unlawful content and an explanation of 10 to 2000 characters", () => {
    expect(reportDraftErrors({ reason: "", category: "", details: "" })).toEqual(["reason", "details"]);
    expect(reportDraftErrors({ reason: "illegal", category: "", details: "A long enough explanation" })).toEqual(["category"]);
    expect(reportDraftErrors({ reason: "spam", category: "", details: "  short   " })).toEqual(["details"]);
    expect(reportDraftErrors({ reason: "spam", category: "", details: "x".repeat(2001) })).toEqual(["details"]);
    expect(reportDraftErrors({ reason: "spam", category: "", details: "Advertising for a shop" })).toEqual([]);
  });

  it("send a category only with unlawful content, the explanation trimmed", () => {
    expect(reportArguments({ reason: "spam", category: "scam_fraud", details: "  Advertising here  " })).toEqual({
      reason: "spam",
      category: null,
      details: "Advertising here",
    });
    expect(reportArguments({ reason: "illegal", category: "scam_fraud", details: "A scam for sure" }).category).toBe("scam_fraud");
    expect(() => reportArguments({ reason: "", category: "", details: "" })).toThrow();
  });

  it("derive the ground from the reason", () => {
    expect(groundFor("illegal")).toBe("illegal");
    expect(groundFor("harassment")).toBe("terms");
  });
});

describe("the member's moderation file", () => {
  it("maps decisions, reports with their decision, and hidden members; drops malformed rows", () => {
    const file = mapMyModeration({
      muted_until: "2026-11-11T10:00:00Z",
      banned_at: null,
      decisions: [decision, { id: "x", action: "nope" }, null],
      reports: [
        { id: "r1", message_id: null, reason: "spam", status: "dismissed", created_at: "2026-11-09T10:00:00Z", resolved_at: "2026-11-10T10:00:00Z", decision: { ...decision, id: "d2", action: "dismiss", reason: null, ground: null } },
        { id: "r2", reason: "weird" },
      ],
      blocked: [{ id: "u2", name: "Lucas B.", handle: "lucas.b" }, { name: "no id" }],
    });
    expect(file.decisions).toHaveLength(1);
    expect(file.decisions[0]).toMatchObject({ action: "hide", category: "privacy_image", ground: "illegal", attachmentCount: 1, appeal: null });
    expect(file.reports).toHaveLength(1);
    expect(file.reports[0].decision?.action).toBe("dismiss");
    expect(file.blocked).toEqual([{ id: "u2", name: "Lucas B.", handle: "lucas.b" }]);
    expect(mapMyModeration(null)).toEqual({ mutedUntil: null, bannedAt: null, decisions: [], reports: [], blocked: [] });
  });

  it("allows one complaint within 6 months", () => {
    const [d] = mapMyModeration({ decisions: [decision] }).decisions;
    expect(canAppeal(d, Date.parse("2027-01-01T00:00:00Z"))).toBe(true);
    expect(canAppeal(d, Date.parse("2027-05-11T00:00:00Z"))).toBe(false);
    const [withAppeal] = mapMyModeration({ decisions: [{ ...decision, appeal: { id: "a1", status: "open", body: "Please review", created_at: "2026-11-10T12:00:00Z" } }] }).decisions;
    expect(withAppeal.appeal?.status).toBe("open");
    expect(canAppeal(withAppeal, Date.parse("2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("knows a mute in force", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(activeMute({ mutedUntil: "2026-11-11T10:00:00Z" }, now)).toBe(Date.parse("2026-11-11T10:00:00Z"));
    expect(activeMute({ mutedUntil: "2026-11-10T10:00:00Z" }, now)).toBeNull();
    expect(activeMute({ mutedUntil: null }, now)).toBeNull();
  });
});
