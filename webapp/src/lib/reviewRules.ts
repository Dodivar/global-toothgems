import {
  BODY_MAX,
  BODY_MIN,
  REVIEW_NOW,
  TITLE_MAX,
  isVerified,
  openReports,
  subjectKey,
  type CustomerReview,
  type ReviewStatus,
  type ReviewSubject,
  type ReviewTag,
} from "../data/reviewSystem";

/**
 * Pure rules of the review system: what the storefront shows, how it is
 * summarised, filtered and sorted, and what the back office counts.
 *
 * No React and no store in here, so every rule can be read — and, when the
 * real backend lands, tested — on its own. The public rules only ever look at
 * `published` reviews: a pending, hidden or rejected review never reaches a
 * product page, whatever the filter.
 */

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

export function publishedFor(reviews: CustomerReview[], subject: ReviewSubject): CustomerReview[] {
  const key = subjectKey(subject);
  return reviews.filter((r) => r.status === "published" && subjectKey(r.subject) === key);
}

export interface RatingSummary {
  count: number;
  /** One decimal, 0 when there is nothing to average. */
  average: number;
  /** Index 0 is five stars, index 4 is one star — the order the bars are drawn in. */
  buckets: { stars: number; count: number; pct: number }[];
  verifiedPct: number;
  withPhotos: number;
  /** Share of 4- and 5-star reviews. */
  positivePct: number;
}

export function summarise(reviews: CustomerReview[]): RatingSummary {
  const count = reviews.length;
  const counts = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    counts[5 - r.rating] += 1;
    sum += r.rating;
  }
  const pct = (n: number) => (count ? Math.round((n / count) * 100) : 0);
  return {
    count,
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    buckets: counts.map((c, i) => ({ stars: 5 - i, count: c, pct: pct(c) })),
    verifiedPct: pct(reviews.filter(isVerified).length),
    withPhotos: reviews.filter((r) => r.photos.length > 0).length,
    positivePct: pct(counts[0] + counts[1]),
  };
}

/** Tags mentioned most often, for the course page's "what students highlight". */
export function topTags(reviews: CustomerReview[], limit = 6): { tag: ReviewTag; count: number }[] {
  const counts = new Map<ReviewTag, number>();
  for (const r of reviews) for (const tag of r.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type PublicFilter = "all" | "5" | "4" | "3" | "2" | "1" | "photos" | "verified";
export const PUBLIC_FILTERS: PublicFilter[] = ["all", "5", "4", "3", "2", "1", "photos", "verified"];

export type PublicSort = "recent" | "highest" | "lowest" | "helpful";
export const PUBLIC_SORTS: PublicSort[] = ["recent", "highest", "lowest", "helpful"];

export function matchesPublicFilter(review: CustomerReview, filter: PublicFilter): boolean {
  if (filter === "all") return true;
  if (filter === "photos") return review.photos.length > 0;
  if (filter === "verified") return isVerified(review);
  return review.rating === Number(filter);
}

/** When the review was last made public: an approved edit counts as new. */
export function publicDate(review: CustomerReview): string {
  return review.publishedAt ?? review.submittedAt;
}

export function sortPublic(reviews: CustomerReview[], sort: PublicSort): CustomerReview[] {
  const byDate = (a: CustomerReview, b: CustomerReview) => publicDate(b).localeCompare(publicDate(a));
  const copy = reviews.slice();
  switch (sort) {
    case "highest":
      return copy.sort((a, b) => b.rating - a.rating || byDate(a, b));
    case "lowest":
      return copy.sort((a, b) => a.rating - b.rating || byDate(a, b));
    case "helpful":
      return copy.sort((a, b) => b.helpful - a.helpful || byDate(a, b));
    default:
      return copy.sort(byDate);
  }
}

/**
 * The review shown first, above the list. The most helpful one with written
 * substance — not simply the best rating, which is how a review block ends up
 * reading like an advert. Photos break ties because results are visual.
 */
export function featuredReview(reviews: CustomerReview[]): CustomerReview | null {
  const ranked = reviews
    .filter((r) => r.rating >= 4 && r.body.length > 120)
    .sort((a, b) => b.helpful - a.helpful || b.photos.length - a.photos.length);
  return ranked[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Form validation                                                            */
/* -------------------------------------------------------------------------- */

export interface ReviewInput {
  rating: number;
  title: string;
  body: string;
  tags: ReviewTag[];
  photos: { src: string; alt: string }[];
}

export type ReviewFieldError = "ratingRequired" | "titleRequired" | "titleTooLong" | "bodyTooShort" | "bodyTooLong";

/**
 * Presentation-side checks only. The real endpoint validates the same limits
 * server-side, and verifies the order and the photos, whatever the browser says.
 */
export function validateReview(input: ReviewInput): Partial<Record<"rating" | "title" | "body", ReviewFieldError>> {
  const errors: Partial<Record<"rating" | "title" | "body", ReviewFieldError>> = {};
  if (input.rating < 1 || input.rating > 5) errors.rating = "ratingRequired";
  const title = input.title.trim();
  if (!title) errors.title = "titleRequired";
  else if (title.length > TITLE_MAX) errors.title = "titleTooLong";
  const body = input.body.trim();
  if (body.length < BODY_MIN) errors.body = "bodyTooShort";
  else if (body.length > BODY_MAX) errors.body = "bodyTooLong";
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Back office                                                                */
/* -------------------------------------------------------------------------- */

/** A pending review the customer changed after it had been published. */
export function isEditedPending(review: CustomerReview): boolean {
  return review.status === "pending" && Boolean(review.editedAt) && Boolean(review.publishedAt);
}

export function isReported(review: CustomerReview): boolean {
  return openReports(review).length > 0;
}

export type QueueView = "all" | "pending" | "edited" | "reported" | ReviewStatus;
export const QUEUE_VIEWS: QueueView[] = ["pending", "edited", "reported", "published", "needsChanges", "rejected", "hidden", "all"];

export type DateRange = "any" | "7d" | "30d" | "month" | "90d";
export const DATE_RANGES: DateRange[] = ["any", "7d", "30d", "month", "90d"];

export type QueueSort = "newest" | "oldest" | "ratingLow" | "ratingHigh" | "reports";
export const QUEUE_SORTS: QueueSort[] = ["newest", "oldest", "ratingLow", "ratingHigh", "reports"];

export interface QueueFilters {
  view: QueueView;
  kind: "all" | "product" | "course";
  /** A `subjectKey`, or "all". */
  subject: string;
  rating: "all" | "1" | "2" | "3" | "4" | "5";
  range: DateRange;
  search: string;
  sort: QueueSort;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  view: "pending",
  kind: "all",
  subject: "all",
  rating: "all",
  range: "any",
  search: "",
  sort: "oldest",
};

/** Last thing that happened to the review from the customer's side. */
export function activityDate(review: CustomerReview): string {
  return review.editedAt ?? review.submittedAt;
}

export function matchesView(review: CustomerReview, view: QueueView): boolean {
  if (view === "all") return true;
  if (view === "edited") return isEditedPending(review);
  if (view === "reported") return isReported(review);
  return review.status === view;
}

function withinRange(iso: string, range: DateRange): boolean {
  if (range === "any") return true;
  const now = new Date(REVIEW_NOW);
  const date = new Date(iso);
  if (range === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function normalise(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The queue's filtering. `subjectName` resolves a subject to its display name
 * in the current language so a search for "aurora" or "fondation" finds it.
 */
export function filterQueue(
  reviews: CustomerReview[],
  filters: QueueFilters,
  subjectName: (subject: ReviewSubject) => string,
  customerName: (review: CustomerReview) => string,
): CustomerReview[] {
  const query = normalise(filters.search.trim());
  const rows = reviews.filter((r) => {
    if (!matchesView(r, filters.view)) return false;
    if (filters.kind !== "all" && r.subject.kind !== filters.kind) return false;
    if (filters.subject !== "all" && subjectKey(r.subject) !== filters.subject) return false;
    if (filters.rating !== "all" && r.rating !== Number(filters.rating)) return false;
    if (!withinRange(activityDate(r), filters.range)) return false;
    if (!query) return true;
    const haystack = normalise(
      [customerName(r), r.customer.email, r.title, r.body, r.orderRef ?? "", r.id, subjectName(r.subject)].join(" "),
    );
    return haystack.includes(query);
  });

  const byDate = (a: CustomerReview, b: CustomerReview) => activityDate(a).localeCompare(activityDate(b));
  switch (filters.sort) {
    case "newest":
      return rows.sort((a, b) => byDate(b, a));
    case "ratingLow":
      return rows.sort((a, b) => a.rating - b.rating || byDate(b, a));
    case "ratingHigh":
      return rows.sort((a, b) => b.rating - a.rating || byDate(b, a));
    case "reports":
      return rows.sort((a, b) => openReports(b).length - openReports(a).length || byDate(b, a));
    default:
      // Oldest first: the queue is worked in the order customers waited.
      return rows.sort(byDate);
  }
}

export function viewCounts(reviews: CustomerReview[]): Record<QueueView, number> {
  const counts = Object.fromEntries(QUEUE_VIEWS.map((v) => [v, 0])) as Record<QueueView, number>;
  for (const r of reviews) for (const v of QUEUE_VIEWS) if (matchesView(r, v)) counts[v] += 1;
  return counts;
}

export interface SubjectRating {
  subject: ReviewSubject;
  average: number;
  count: number;
}

export interface ReviewStats {
  total: number;
  pending: number;
  published: number;
  reported: number;
  averagePublished: number;
  thisMonth: number;
  /** Submissions per month, oldest first, for the last six months. */
  monthly: { month: string; count: number }[];
  byProduct: SubjectRating[];
  byCourse: SubjectRating[];
  distribution: RatingSummary;
  /** Hours between submission and first decision, over reviews decided so far. */
  medianResponseHours: number | null;
  responseRate: number;
}

/**
 * The dashboard's figures. Averages count published reviews only — a rating
 * the public cannot see is not part of the product's reputation yet.
 */
export function reviewStats(reviews: CustomerReview[]): ReviewStats {
  const published = reviews.filter((r) => r.status === "published");
  const now = new Date(REVIEW_NOW);

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month, count: reviews.filter((r) => r.submittedAt.startsWith(month)).length };
  });

  const bySubject = (kind: "product" | "course"): SubjectRating[] => {
    const groups = new Map<string, CustomerReview[]>();
    for (const r of published) {
      if (r.subject.kind !== kind) continue;
      const key = subjectKey(r.subject);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.values()]
      .map((list) => ({ subject: list[0].subject, ...pickAverage(list) }))
      .sort((a, b) => b.count - a.count || b.average - a.average);
  };

  const decided = reviews
    .map((r) => {
      const first = r.history.find((h) => h.kind === "approved" || h.kind === "rejected" || h.kind === "changesRequested");
      return first ? (new Date(first.at).getTime() - new Date(r.submittedAt).getTime()) / 3_600_000 : null;
    })
    .filter((h): h is number => h !== null && h >= 0)
    .sort((a, b) => a - b);

  return {
    total: reviews.length,
    pending: reviews.filter((r) => r.status === "pending").length,
    published: published.length,
    reported: reviews.filter(isReported).length,
    averagePublished: summarise(published).average,
    thisMonth: reviews.filter((r) => withinRange(r.submittedAt, "month")).length,
    monthly,
    byProduct: bySubject("product"),
    byCourse: bySubject("course"),
    distribution: summarise(published),
    medianResponseHours: decided.length ? Math.round(decided[Math.floor(decided.length / 2)]) : null,
    responseRate: published.length ? Math.round((published.filter((r) => r.response).length / published.length) * 100) : 0,
  };
}

function pickAverage(list: CustomerReview[]): { average: number; count: number } {
  const s = summarise(list);
  return { average: s.average, count: s.count };
}
