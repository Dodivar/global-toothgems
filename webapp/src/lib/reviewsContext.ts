import { createContext, useCallback, useContext, useState } from "react";
import {
  subjectKey,
  type CustomerReview,
  type RejectReason,
  type ReportReason,
  type ReviewPhoto,
  type ReviewSubject,
} from "../data/reviewSystem";
import type { ReviewInput } from "./reviewRules";

/**
 * The review store's contract, shared by its two implementations: the
 * prototype's in-memory store and the Supabase one (`reviewsSupabase.tsx`).
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

export interface ReviewsContextValue {
  reviews: CustomerReview[];
  /** "Sarah M." — how the signed-in customer's reviews are signed. */
  myName: string;
  /** True during the first load and after a retry. */
  loading: boolean;
  demoMode: ReviewDemoMode;
  setDemoMode: (mode: ReviewDemoMode) => void;
  retry: () => void;

  getReview: (id: string) => CustomerReview | undefined;

  /* Customer — both settle once the review is stored, and reject when it is not. */
  submitReview: (subject: ReviewSubject, input: ReviewInput, verification: { orderRef: string | null; progressPct?: number }) => Promise<string>;
  updateReview: (id: string, input: ReviewInput) => Promise<void>;
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

export const ReviewsContext = createContext<ReviewsContextValue | null>(null);

export function useReviews() {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("useReviews must be used within ReviewsProvider");
  return ctx;
}

/**
 * State that stays in the browser whatever the store: unsent drafts, dismissed
 * review requests and the three overlays.
 */
export function useLocalReviewState() {
  const [drafts, setDrafts] = useState<Record<string, ReviewInput>>({});
  const [dismissedRequests, setDismissed] = useState<Set<string>>(() => new Set());
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [photoTarget, setPhotoTarget] = useState<PhotoViewerTarget | null>(null);

  const saveDraft = useCallback((subject: ReviewSubject, input: ReviewInput | null) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (input) next[subjectKey(subject)] = input;
      else delete next[subjectKey(subject)];
      return next;
    });
  }, []);

  const dismissRequest = useCallback((subject: ReviewSubject) => {
    setDismissed((prev) => new Set(prev).add(subjectKey(subject)));
  }, []);

  const closeForm = useCallback(() => setFormTarget(null), []);
  const closeReport = useCallback(() => setReportTarget(null), []);
  const closePhotos = useCallback(() => setPhotoTarget(null), []);

  return {
    drafts,
    saveDraft,
    dismissedRequests,
    dismissRequest,
    formTarget,
    openForm: setFormTarget,
    closeForm,
    reportTarget,
    openReport: setReportTarget,
    closeReport,
    photoTarget,
    openPhotos: setPhotoTarget,
    closePhotos,
  };
}
