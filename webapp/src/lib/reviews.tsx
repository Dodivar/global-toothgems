import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  COURSE_REVIEW_THRESHOLD,
  DEMO_CUSTOMER,
  REVIEW_NOW,
  SEED_REVIEWS,
  privacyName,
  subjectKey,
  type CustomerReview,
  type HistoryEvent,
  type ReviewCustomer,
  type ReviewSubject,
} from "../data/reviewSystem";
import { isActiveOrder } from "../data/orders";
import { getCourse } from "../data/courses";
import { pick } from "../data/types";
import { useAuth, type Profile } from "./auth";
import { useCatalog } from "./catalog/CatalogProvider";
import { useOrders } from "./orders";
import { useProgress } from "./progress";
import { isSupabaseConfigured } from "./supabase/client";
import { SupabaseReviewsProvider } from "./reviewsSupabase";
import {
  ReviewsContext,
  useLocalReviewState,
  useReviews,
  type ReviewDemoMode,
  type ReviewsContextValue,
} from "./reviewsContext";

export { useReviews, type FormTarget, type PhotoViewerTarget, type ReviewDemoMode } from "./reviewsContext";

/**
 * The review store: every review, the moderation actions on them, and the
 * three overlays any screen can open — the review form, the report dialog and
 * the photo viewer.
 *
 * Mounted once in `App.tsx`, above the storefront and the back office alike,
 * so approving a review in `/admin/avis` puts it on the product page in the
 * same session, and a report sent from a product page lands in the admin's
 * "Reported" tab.
 *
 * With Supabase configured the reviews are stored in the database
 * (`reviewsSupabase.tsx`), which enforces who may write, edit and moderate.
 * Without it the prototype's in-memory store below is used: a reload restores
 * the seed, and eligibility computed in the browser is all there is.
 */
export function ReviewsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  /** The author as the storefront names them — the signed-in name for the account's own reviews. */
  const myName = profile ? authorFromProfile(profile) : privacyName(DEMO_CUSTOMER.firstName, DEMO_CUSTOMER.lastName);
  return isSupabaseConfigured ? (
    <SupabaseReviewsProvider myName={myName}>{children}</SupabaseReviewsProvider>
  ) : (
    <MockReviewsProvider myName={myName}>{children}</MockReviewsProvider>
  );
}

/** Simulated round trip, so the loading states are real states rather than theory. */
const LATENCY = 550;

/** Simulated round trip of a submission. */
const SUBMIT_LATENCY = 750;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The prototype's clock: its fixed "today" plus the time spent in this
 * session, so a review written now sorts after the seed and "this month"
 * stays September however late the prototype is opened.
 */
const SESSION_START = Date.now();
function nowIso(): string {
  const t = new Date(new Date(REVIEW_NOW).getTime() + (Date.now() - SESSION_START));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/**
 * Prototype store. Nothing here is authorization: eligibility is computed in
 * the browser from the demo account's orders and progress so the prototype
 * can show the rules.
 */
function MockReviewsProvider({ children, myName }: { children: ReactNode; myName: string }) {
  const { profile } = useAuth();
  const local = useLocalReviewState();
  const { saveDraft } = local;
  const [reviews, setReviews] = useState<CustomerReview[]>(SEED_REVIEWS);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoModeState] = useState<ReviewDemoMode>("live");
  const [helpfulByMe, setHelpful] = useState<Set<string>>(() => new Set());
  const [reportedByMe, setReported] = useState<Set<string>>(() => new Set());
  const nextId = useRef(4001);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const simulateLoad = useCallback(() => {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLoading(false), LATENCY);
  }, []);

  // First load: `loading` starts true, so the effect only has to end it.
  useEffect(() => {
    timer.current = setTimeout(() => setLoading(false), LATENCY);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const setDemoMode = useCallback(
    (mode: ReviewDemoMode) => {
      setDemoModeState(mode);
      simulateLoad();
    },
    [simulateLoad],
  );

  const retry = useCallback(() => setDemoMode("live"), [setDemoMode]);

  /** Applies `change` to one review and appends an event to its history. */
  const mutate = useCallback((id: string, change: (r: CustomerReview) => Partial<CustomerReview>, event?: Omit<HistoryEvent, "at">) => {
    setReviews((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...change(r) };
        return event ? { ...next, history: [...next.history, { ...event, at: nowIso() }] } : next;
      }),
    );
  }, []);

  const submitReview = useCallback<ReviewsContextValue["submitReview"]>(
    async (subject, input, verification) => {
      await wait(SUBMIT_LATENCY);
      const id = `RV-${nextId.current++}`;
      const at = nowIso();
      const review: CustomerReview = {
        id,
        subject,
        customer: profile ? customerFromProfile(profile) : DEMO_CUSTOMER,
        mine: true,
        orderRef: verification.orderRef,
        progressPct: verification.progressPct,
        rating: input.rating,
        title: input.title.trim(),
        body: input.body.trim(),
        lang: document.documentElement.lang.startsWith("en") ? "en" : "fr",
        tags: input.tags,
        photos: input.photos,
        status: "pending",
        submittedAt: at,
        helpful: 0,
        reports: [],
        notes: [],
        history: [{ kind: "submitted", at, by: myName }],
      };
      setReviews((prev) => [review, ...prev]);
      saveDraft(subject, null);
      return id;
    },
    [profile, myName, saveDraft],
  );

  /**
   * A customer's edit. Whatever the review's state, the new text goes back to
   * the team before anyone sees it: a published review leaves the page until
   * its new version is approved, rather than being republished unread.
   */
  const updateReview = useCallback<ReviewsContextValue["updateReview"]>(
    async (id, input) => {
      await wait(SUBMIT_LATENCY);
      mutate(
        id,
        (r) => ({
          rating: input.rating,
          title: input.title.trim(),
          body: input.body.trim(),
          tags: input.tags,
          photos: input.photos,
          status: "pending",
          editedAt: nowIso(),
          changesRequest: undefined,
          rejection: undefined,
          history: r.history,
        }),
        { kind: "edited", by: myName },
      );
    },
    [mutate, myName],
  );

  const toggleHelpful = useCallback((id: string) => {
    setHelpful((prev) => {
      const next = new Set(prev);
      const had = next.has(id);
      if (had) next.delete(id);
      else next.add(id);
      setReviews((list) => list.map((r) => (r.id === id ? { ...r, helpful: Math.max(0, r.helpful + (had ? -1 : 1)) } : r)));
      return next;
    });
  }, []);

  const reportReview = useCallback<ReviewsContextValue["reportReview"]>(
    (id, reason, details) => {
      const at = nowIso();
      mutate(
        id,
        (r) => ({
          reports: [...r.reports, { id: `RP-${nextId.current++}`, reason, details: details.trim() || undefined, at, source: "customer", resolved: false }],
        }),
        { kind: "reported", by: "customer", note: reason },
      );
      setReported((prev) => new Set(prev).add(id));
    },
    [mutate],
  );

  /* ------------------------------ Team actions ----------------------------- */

  const approve = useCallback<ReviewsContextValue["approve"]>(
    (id, actor) =>
      mutate(id, () => ({ status: "published", publishedAt: nowIso(), rejection: undefined, changesRequest: undefined }), { kind: "approved", by: actor }),
    [mutate],
  );

  const reject = useCallback<ReviewsContextValue["reject"]>(
    (id, actor, reason, internal) =>
      mutate(id, () => ({ status: "rejected", rejection: { reason, internal: internal.trim() || undefined } }), {
        kind: "rejected",
        by: actor,
        note: internal.trim() || undefined,
      }),
    [mutate],
  );

  const requestChanges = useCallback<ReviewsContextValue["requestChanges"]>(
    (id, actor, message) =>
      mutate(id, () => ({ status: "needsChanges", changesRequest: message.trim() }), { kind: "changesRequested", by: actor, note: message.trim() }),
    [mutate],
  );

  const hide = useCallback<ReviewsContextValue["hide"]>(
    (id, actor, note) => mutate(id, () => ({ status: "hidden" }), { kind: "hidden", by: actor, note: note.trim() || undefined }),
    [mutate],
  );

  const restore = useCallback<ReviewsContextValue["restore"]>(
    (id, actor) => mutate(id, () => ({ status: "published" }), { kind: "restored", by: actor }),
    [mutate],
  );

  const respond = useCallback<ReviewsContextValue["respond"]>(
    (id, actor, body) =>
      mutate(id, () => ({ response: { body: body.trim(), at: nowIso(), by: actor } }), {
        kind: reviews.find((r) => r.id === id)?.response ? "responseEdited" : "responded",
        by: actor,
      }),
    [mutate, reviews],
  );

  const removeResponse = useCallback<ReviewsContextValue["removeResponse"]>(
    (id, actor) => mutate(id, () => ({ response: undefined }), { kind: "responseRemoved", by: actor }),
    [mutate],
  );

  const flag = useCallback<ReviewsContextValue["flag"]>(
    (id, actor, reason, note) => {
      const at = nowIso();
      mutate(
        id,
        (r) => ({
          flagged: true,
          reports: [...r.reports, { id: `RP-${nextId.current++}`, reason, details: note.trim() || undefined, at, source: "team", resolved: false }],
        }),
        { kind: "flagged", by: actor, note: reason },
      );
    },
    [mutate],
  );

  /**
   * The decision on a reported review. Every open report is closed with the
   * same outcome; nothing is deleted — "removed" rejects the review, which
   * keeps it, its reports and its history for the record.
   */
  const resolveReports = useCallback<ReviewsContextValue["resolveReports"]>(
    (id, actor, resolution, note) =>
      mutate(
        id,
        (r) => ({
          flagged: false,
          reports: r.reports.map((rep) => (rep.resolved ? rep : { ...rep, resolved: true, resolution })),
          ...(resolution === "hidden" ? { status: "hidden" as const } : {}),
          ...(resolution === "removed" ? { status: "rejected" as const, rejection: { reason: "guidelines" as const, internal: note.trim() || undefined } } : {}),
        }),
        { kind: resolution === "kept" ? "kept" : resolution === "hidden" ? "hidden" : "removed", by: actor, note: note.trim() || undefined },
      ),
    [mutate],
  );

  const addNote = useCallback<ReviewsContextValue["addNote"]>(
    (id, actor, body) =>
      mutate(id, (r) => ({ notes: [...r.notes, { id: `N-${nextId.current++}`, body: body.trim(), at: nowIso(), by: actor }] })),
    [mutate],
  );

  const visible = demoMode === "empty" ? EMPTY : reviews;

  const value = useMemo<ReviewsContextValue>(
    () => ({
      ...local,
      reviews: visible,
      myName,
      loading,
      demoMode,
      setDemoMode,
      retry,
      getReview: (id) => visible.find((r) => r.id === id),
      submitReview,
      updateReview,
      helpfulByMe,
      toggleHelpful,
      reportedByMe,
      reportReview,
      approve,
      reject,
      requestChanges,
      hide,
      restore,
      respond,
      removeResponse,
      flag,
      resolveReports,
      addNote,
    }),
    [
      local, visible, myName, loading, demoMode, setDemoMode, retry, submitReview, updateReview, helpfulByMe,
      toggleHelpful, reportedByMe, reportReview, approve, reject, requestChanges,
      hide, restore, respond, removeResponse, flag, resolveReports, addNote,
    ],
  );

  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}

const EMPTY: CustomerReview[] = [];

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The profile's name as first and last. The login form may only have given an
 * email, in which case the display name derived from it is split instead.
 */
function namesOf(profile: Profile): { first: string; last: string } {
  if (profile.firstName) return { first: profile.firstName, last: profile.lastName };
  const local = profile.email.split("@")[0].split(/[._-]+/).filter(Boolean);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return { first: cap(local[0] ?? DEMO_CUSTOMER.firstName), last: local.slice(1).map(cap).join(" ") };
}

function authorFromProfile(profile: Profile): string {
  const { first, last } = namesOf(profile);
  return privacyName(first, last);
}

function customerFromProfile(profile: Profile): ReviewCustomer {
  const { first, last } = namesOf(profile);
  return { firstName: first, lastName: last, email: profile.email, country: profile.country };
}

/**
 * Who a review belongs to, as a full record for the back office. In the
 * prototype the demo account's reviews follow whoever is signed in, so the
 * moderation panel and "My reviews" never disagree about the author; stored
 * reviews carry their author already.
 */
export function useReviewCustomer() {
  const { profile } = useAuth();
  return useCallback(
    (review: CustomerReview): ReviewCustomer =>
      review.mine && profile && !isSupabaseConfigured ? customerFromProfile(profile) : review.customer,
    [profile],
  );
}

/** "Sarah M." — the storefront's privacy-friendly name for a review's author. */
export function useReviewAuthor() {
  const customerOf = useReviewCustomer();
  return useCallback(
    (review: CustomerReview) => {
      const c = customerOf(review);
      return privacyName(c.firstName, c.lastName);
    },
    [customerOf],
  );
}

/**
 * Display name and photo of a product or a course, from the catalogue the
 * shop shows (database or fixtures). A product that left the shop falls back
 * to its slug and no photo.
 */
export function useReviewSubjects() {
  const { findProduct } = useCatalog();
  const subjectName = useCallback(
    (subject: ReviewSubject, lang: string): string => {
      if (subject.kind === "product") {
        const p = findProduct(subject.id);
        return p ? pick(p.name, lang) : subject.id;
      }
      const c = getCourse(subject.id);
      return c ? pick(c.title, lang) : subject.id;
    },
    [findProduct],
  );
  const subjectImage = useCallback(
    (subject: ReviewSubject): string | undefined =>
      subject.kind === "product" ? findProduct(subject.id)?.image || undefined : getCourse(subject.id)?.image,
    [findProduct],
  );
  return { subjectName, subjectImage };
}

export function subjectPath(subject: ReviewSubject): string {
  return subject.kind === "product" ? `/boutique/${subject.id}` : `/academy/formation/${subject.id}`;
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                */
/* -------------------------------------------------------------------------- */

export type Eligibility =
  | { state: "signedOut" }
  | { state: "notPurchased" }
  | { state: "awaitingShipment"; orderRef: string }
  | { state: "needsProgress"; pct: number }
  | { state: "eligible"; orderRef: string; progressPct?: number; context: RequestContext; date?: string }
  | { state: "reviewed"; review: CustomerReview };

/** Why a review request is being shown — it decides the request's wording. */
export type RequestContext = "delivered" | "shipped" | "completed" | "progress";

/**
 * Whether the signed-in account may review `subject`, and why not otherwise.
 * With Supabase this only decides what the page offers: the database checks
 * the order again when the review is written.
 *
 * - Products: the product is on one of the account's orders that has left the
 *   workshop (shipped or delivered). Cancelled orders never count.
 * - Courses: the course is on the account and at least
 *   `COURSE_REVIEW_THRESHOLD` % of it has been validated, so the review speaks
 *   from real experience of the teaching. Course reviews are not stored in the
 *   database yet, so with Supabase they are not offered.
 * - One review per product or course: once written, the answer is "reviewed"
 *   and the way forward is editing it.
 *
 * Signed out, the seeded orders and enrolments must not count: they belong to
 * the demo account, not to whoever is looking at the page.
 */
export function useReviewEligibility() {
  const { signedIn } = useAuth();
  const { orders } = useOrders();
  const { progressFor } = useProgress();
  const { reviews } = useReviews();

  return useCallback(
    (subject: ReviewSubject): Eligibility => {
      if (!signedIn) return { state: "signedOut" };
      const mine = reviews.find((r) => r.mine && subjectKey(r.subject) === subjectKey(subject));
      if (mine) return { state: "reviewed", review: mine };

      if (subject.kind === "product") {
        const holding = orders.filter((o) => isActiveOrder(o) && o.lines.some((l) => l.productId === subject.id));
        const received = holding.find((o) => o.status === "delivered" || o.status === "shipped");
        if (received) {
          return {
            state: "eligible",
            orderRef: received.reference,
            context: received.status === "delivered" ? "delivered" : "shipped",
            date: received.tracking?.estimatedDelivery || received.placedOn,
          };
        }
        if (holding.length > 0) return { state: "awaitingShipment", orderRef: holding[0].reference };
        return { state: "notPurchased" };
      }

      if (isSupabaseConfigured) return { state: "notPurchased" };
      const progress = progressFor(subject.id);
      if (!progress.enrolled) return { state: "notPurchased" };
      if (!progress.completed && progress.pct < COURSE_REVIEW_THRESHOLD) return { state: "needsProgress", pct: progress.pct };
      const order = orders.find((o) => isActiveOrder(o) && o.lines.some((l) => l.courseId === subject.id));
      return {
        state: "eligible",
        // A course opened without an order in this prototype is still an
        // enrolment; its reference stands in for the order's.
        orderRef: order?.reference ?? `ENR-${subject.id.toUpperCase()}`,
        progressPct: progress.pct,
        context: progress.completed ? "completed" : "progress",
        date: progress.completedOn ?? undefined,
      };
    },
    [signedIn, orders, progressFor, reviews],
  );
}

export interface ReviewRequest {
  subject: ReviewSubject;
  orderRef: string;
  progressPct?: number;
  context: RequestContext;
  date?: string;
}

/**
 * Everything the account could review and has not, newest purchase first —
 * what the dashboard's and "My reviews"' requests are drawn from.
 */
export function useReviewRequests(includeDismissed = false): ReviewRequest[] {
  const eligibility = useReviewEligibility();
  const { orders } = useOrders();
  const { enrolledCourses } = useProgress();
  const { dismissedRequests } = useReviews();

  const seen = new Set<string>();
  const subjects: ReviewSubject[] = [];
  for (const course of enrolledCourses()) subjects.push({ kind: "course", id: course.id });
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.productId) subjects.push({ kind: "product", id: line.productId });
    }
  }

  const requests: ReviewRequest[] = [];
  for (const subject of subjects) {
    const key = subjectKey(subject);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!includeDismissed && dismissedRequests.has(key)) continue;
    const e = eligibility(subject);
    if (e.state === "eligible") requests.push({ subject, orderRef: e.orderRef, progressPct: e.progressPct, context: e.context, date: e.date });
  }
  return requests;
}
