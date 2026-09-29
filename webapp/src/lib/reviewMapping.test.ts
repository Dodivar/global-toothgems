import { describe, expect, it } from "vitest";
import { privacyName } from "../data/reviewSystem";
import { mapReview, rejectReasonToDb, type ReviewRow } from "./reviewMapping";

const publicRow: ReviewRow = {
  id: "r1",
  is_verified: true,
  author_name: "Sarah M.",
  rating: 5,
  title: "Superbe",
  body: "Tenue parfaite depuis trois semaines, très bonne qualité.",
  language: "fr",
  tags: ["quality"],
  status: "published",
  helpful_count: 3,
  response_body: null,
  response_at: null,
  published_at: "2026-09-20T09:00:00+00:00",
  edited_at: null,
  product: { slug: "coeur-chrome" },
  review_photos: [
    { storage_path: "u1/r1/b.jpg", alt_text: null, position: 1 },
    { storage_path: "u1/r1/a.jpg", alt_text: "Sur une incisive", position: 0 },
    { storage_path: "u1/r1/hidden.jpg", alt_text: null, position: 2 },
  ],
};

const urls: Record<string, string> = { "u1/r1/a.jpg": "https://signed/a", "u1/r1/b.jpg": "https://signed/b" };
const visitor = { userId: null, photoUrl: (p: string) => urls[p] };

describe("mapReview for a visitor", () => {
  it("reads the public columns only", () => {
    const review = mapReview(publicRow, visitor)!;
    expect(review.subject).toEqual({ kind: "product", id: "coeur-chrome" });
    expect(review.mine).toBe(false);
    expect(review.submittedAt).toBe(publicRow.published_at);
    expect(privacyName(review.customer.firstName, review.customer.lastName)).toBe("Sarah M.");
    expect(review.reports).toEqual([]);
    expect(review.notes).toEqual([]);
  });

  it("keeps a verified review verified without revealing the order", () => {
    expect(mapReview(publicRow, visitor)!.orderRef).toBe("");
    expect(mapReview({ ...publicRow, is_verified: false }, visitor)!.orderRef).toBeNull();
  });

  it("orders photos and drops the ones the reader cannot open", () => {
    expect(mapReview(publicRow, visitor)!.photos).toEqual([
      { src: "https://signed/a", alt: "Sur une incisive" },
      { src: "https://signed/b", alt: "" },
    ]);
  });

  it("skips a review whose product is not visible", () => {
    expect(mapReview({ ...publicRow, product: null }, visitor)).toBeNull();
  });
});

describe("mapReview for the team", () => {
  const teamRow: ReviewRow = {
    ...publicRow,
    user_id: "u1",
    submitted_at: "2026-09-18T08:00:00+00:00",
    status: "rejected",
    rejection_reason: "off_topic",
    changes_request: null,
    is_flagged: true,
    order: { order_number: "GT-100149" },
    author: { first_name: "Sarah", last_name: "Martin", email: "sarah@example.com", country_code: "FR" },
    response_body: "Merci !",
    response_at: "2026-09-21T10:00:00+00:00",
    responder: { first_name: "Camille", last_name: "Dubois" },
    review_reports: [
      { id: "p1", reason: "spam", details: null, source: "customer", created_at: "2026-09-22T10:00:00Z", resolved_at: null, resolution: null, reporter_id: "u2" },
    ],
    review_notes: [{ id: "n1", body: "Hors sujet", created_at: "2026-09-22T11:00:00Z", author: null }],
  };

  it("maps the account, order, moderation and enums", () => {
    const review = mapReview(teamRow, { userId: "u9", photoUrl: () => undefined })!;
    expect(review.customer).toEqual({ firstName: "Sarah", lastName: "Martin", email: "sarah@example.com", country: "fr" });
    expect(review.orderRef).toBe("GT-100149");
    expect(review.status).toBe("rejected");
    expect(review.rejection).toEqual({ reason: "offTopic" });
    expect(review.flagged).toBe(true);
    expect(review.response).toEqual({ body: "Merci !", at: teamRow.response_at, by: "Camille Dubois" });
    expect(review.reports).toEqual([
      { id: "p1", reason: "spam", details: undefined, at: "2026-09-22T10:00:00Z", source: "customer", resolved: false, resolution: undefined },
    ]);
    expect(review.notes[0]).toMatchObject({ body: "Hors sujet", by: "Global Toothgems" });
    expect(review.history.map((h) => h.kind)).toEqual(["submitted", "approved", "responded"]);
  });

  it("marks the reader's own review", () => {
    expect(mapReview(teamRow, { userId: "u1", photoUrl: () => undefined })!.mine).toBe(true);
  });

  it("maps the snake_case enums", () => {
    expect(mapReview({ ...teamRow, status: "needs_changes" }, visitor)!.status).toBe("needsChanges");
    expect(rejectReasonToDb("notAuthentic")).toBe("not_authentic");
    expect(rejectReasonToDb("offTopic")).toBe("off_topic");
    expect(rejectReasonToDb("spam")).toBe("spam");
  });
});
