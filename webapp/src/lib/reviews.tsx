import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  COURSE_REVIEW_THRESHOLD,
  DEMO_CUSTOMER,
  REVIEW_NOW,
  SEED_REVIEWS,
  privacyName,
  subjectKey,
  type CustomerReview,
  type HistoryEvent,
  type RejectReason,
  type ReportReason,
  type ReviewCustomer,
  type ReviewPhoto,
  type ReviewSubject,
} from "../data/reviewSystem";
import { getProduct } from "../data/products";
import { getCourse } from "../data/courses";
import { pick } from "../data/types";
import type { ReviewInput } from "./reviewRules";
import { useAuth, type Profile } from "./auth";
import { useOrders } from "./orders";
import { useProgress } from "./progress";

/**
 * The review store: every review, the moderation actions on them, and the
 * three overlays any screen can open — the review form, the report dialog and
 * the photo viewer.
 *
 * Mounted once in `App.tsx`, above the storefront and the back office alike,
 * so approving a review in `/admin/avis` puts it on the product page in the
 * same session, and a report sent from a product page lands in the admin's
 * "Reported" tab. In-memory mockup state like the cart and the order history:
 * a reload restores the seed.
 *
 * Nothing here is authorization. Eligibility is computed in the browser from
 * the demo account's orders and progress so the prototype can show the rules;
 * the real endpoint must check the order, the enrolment and the author itself.
 */

export type ReviewDemoMode = "live" | "empty" | "error";

/** What the form overlay is doing: writing a new review, or editing one. */
export interface FormTarget {
  subject: ReviewSubject;
  /** Pre-selected rating, when the form is opened from a row of stars. */
  rating?: number;
  reviewId?: string;
}

export interface PhotoViewerTarget {
  photos: ReviewPhoto[];
  index: number;
  /** "Photo shared by Sarah M." — prefixed to each photo's own description. */
  caption: string;
}

interface ReviewsContextValue {
  reviews: CustomerReview[];
  /** True during the simulated first load and after a retry. */
  loading: boolean;
  demoMode: ReviewDemoMode;
  setDemoMode: (mode: ReviewDemoMode) => void;
  retry: () => void;

  getReview: (id: string) => CustomerReview | undefined;

  /* Customer */
  submitReview: (subject: ReviewSubject, input: ReviewInput, verification: { orderRef: string | null; progressPct?: number }) => string;
  updateReview: (id: string, input: ReviewInput) => void;
  drafts: Record<string, ReviewInput>;
  saveDraft: (subject: ReviewSubject, input: ReviewInput | null) => void;
  helpfulByMe: Set<string>;
  toggleHelpful: (id: string) => void;
  reportedByMe: Set<string>;
  reportReview: (id: string, reason: ReportReason, details: string) => void;
  dismissedRequests: Set<string>;
  dismissRequest: (subject: ReviewSubject) => void;

  /* Team */
  approve: (id: string, actor: string) => void;
  reject: (id: string, actor: string, reason: RejectReason, internal: string) => void;
  requestChanges: (id: string, actor: string, message: string) => void;
  hide: (id: string, actor: string, note: string) => void;
  restore: (id: string, actor: string) => void;
  respond: (id: string, actor: string, body: string) => void;
  removeResponse: (id: string, actor: string) => void;
  flag: (id: string, actor: string, reason: ReportReason, note: string) => void;
  resolveReports: (id: string, actor: string, resolution: "kept" | "hidden" | "removed", note: string) => void;
  addNote: (id: string, actor: string, body: string) => void;

  /* Overlays */
  formTarget: FormTarget | null;
  openForm: (target: FormTarget) => void;
  closeForm: () => void;
  reportTarget: string | null;
  openReport: (id: string) => void;
  closeReport: () => void;
  photoTarget: PhotoViewerTarget | null;
  openPhotos: (target: PhotoViewerTarget) => void;
  closePhotos: () => void;
}

const ReviewsContext = createContext<ReviewsContextValue | null>(null);

/** Simulated round trip, so the loading states are real states rather than theory. */
const LATENCY = 550;

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

export function ReviewsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [reviews, setReviews] = useState<CustomerReview[]>(SEED_REVIEWS);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoModeState] = useState<ReviewDemoMode>("live");
  const [drafts, setDrafts] = useState<Record<string, ReviewInput>>({});
  const [helpfulByMe, setHelpful] = useState<Set<string>>(() => new Set());
  const [reportedByMe, setReported] = useState<Set<string>>(() => new Set());
  const [dismissedRequests, setDismissed] = useState<Set<string>>(() => new Set());
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [photoTarget, setPhotoTarget] = useState<PhotoViewerTarget | null>(null);
  const nextId = useRef(4001);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const simulateLoad = useCallback(() => {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLoading(false), LATENCY);
  }, []);

  useEffect(() => {
    simulateLoad();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [simulateLoad]);

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

  /** The author as the storefront names them — the signed-in name for the demo account's own reviews. */
  const myName = profile ? authorFromProfile(profile) : privacyName(DEMO_CUSTOMER.firstName, DEMO_CUSTOMER.lastName);

  const submitReview = useCallback<ReviewsContextValue["submitReview"]>(
    (subject, input, verification) => {
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
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[subjectKey(subject)];
        return next;
      });
      return id;
    },
    [profile, myName],
  );

  /**
   * A customer's edit. Whatever the review's state, the new text goes back to
   * the team before anyone sees it: a published review leaves the page until
   * its new version is approved, rather than being republished unread.
   */
  const updateReview = useCallback<ReviewsContextValue["updateReview"]>(
    (id, input) => {
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

  const saveDraft = useCallback((subject: ReviewSubject, input: ReviewInput | null) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (input) next[subjectKey(subject)] = input;
      else delete next[subjectKey(subject)];
      return next;
    });
  }, []);

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

  const dismissRequest = useCallback((subject: ReviewSubject) => {
    setDismissed((prev) => new Set(prev).add(subjectKey(subject)));
  }, []);

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
      reviews: visible,
      loading,
      demoMode,
      setDemoMode,
      retry,
      getReview: (id) => visible.find((r) => r.id === id),
      submitReview,
      updateReview,
      drafts,
      saveDraft,
      helpfulByMe,
      toggleHelpful,
      reportedByMe,
      reportReview,
      dismissedRequests,
      dismissRequest,
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
      formTarget,
      openForm: setFormTarget,
      closeForm: () => setFormTarget(null),
      reportTarget,
      openReport: setReportTarget,
      closeReport: () => setReportTarget(null),
      photoTarget,
      openPhotos: setPhotoTarget,
      closePhotos: () => setPhotoTarget(null),
    }),
    [
      visible, loading, demoMode, setDemoMode, retry, submitReview, updateReview, drafts, saveDraft, helpfulByMe,
      toggleHelpful, reportedByMe, reportReview, dismissedRequests, dismissRequest, approve, reject, requestChanges,
      hide, restore, respond, removeResponse, flag, resolveReports, addNote, formTarget, reportTarget, photoTarget,
    ],
  );

  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}

const EMPTY: CustomerReview[] = [];

export function useReviews() {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("useReviews must be used within ReviewsProvider");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

function authorFromProfile(profile: Profile): string {
  if (profile.firstName) return privacyName(profile.firstName, profile.lastName);
  const local = profile.email.split("@")[0].split(/[._-]+/)[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : privacyName(DEMO_CUSTOMER.firstName, DEMO_CUSTOMER.lastName);
}

function customerFromProfile(profile: Profile): ReviewCustomer {
  return {
    firstName: profile.firstName || authorFromProfile(profile),
    lastName: profile.lastName,
    email: profile.email,
    country: profile.country,
  };
}

/**
 * Who a review belongs to, as a full record for the back office. The demo
 * account's reviews follow whoever is signed in, so the moderation panel and
 * "My reviews" never disagree about the author.
 */
export function useReviewCustomer() {
  const { profile } = useAuth();
  return useCallback(
    (review: CustomerReview): ReviewCustomer => (review.mine && profile ? customerFromProfile(profile) : review.customer),
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

/** Display name of a product or a course in the current language. */
export function subjectName(subject: ReviewSubject, lang: string): string {
  if (subject.kind === "product") {
    const p = getProduct(subject.id);
    return p ? pick(p.name, lang) : subject.id;
  }
  const c = getCourse(subject.id);
  return c ? pick(c.title, lang) : subject.id;
}

export function subjectImage(subject: ReviewSubject): string | undefined {
  return subject.kind === "product" ? getProduct(subject.id)?.image : getCourse(subject.id)?.image;
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
 *
 * - Products: the product is on one of the account's orders that has left the
 *   workshop (shipped or delivered). Cancelled orders never count.
 * - Courses: the course is on the account and at least
 *   `COURSE_REVIEW_THRESHOLD` % of it has been validated, so the review speaks
 *   from real experience of the teaching.
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
        const holding = orders.filter((o) => o.status !== "cancelled" && o.lines.some((l) => l.productId === subject.id));
        const received = holding.find((o) => o.status === "delivered" || o.status === "shipped");
        if (received) {
          return {
            state: "eligible",
            orderRef: received.reference,
            context: received.status === "delivered" ? "delivered" : "shipped",
            date: received.tracking?.estimatedDelivery ?? received.placedOn,
          };
        }
        if (holding.length > 0) return { state: "awaitingShipment", orderRef: holding[0].reference };
        return { state: "notPurchased" };
      }

      const progress = progressFor(subject.id);
      if (!progress.enrolled) return { state: "notPurchased" };
      if (!progress.completed && progress.pct < COURSE_REVIEW_THRESHOLD) return { state: "needsProgress", pct: progress.pct };
      const order = orders.find((o) => o.status !== "cancelled" && o.lines.some((l) => l.courseId === subject.id));
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
