import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CustomerReview, RejectReason, ReportReason, ReviewSubject } from "../data/reviewSystem";
import type { ReviewInput } from "./reviewRules";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import { requireSupabase } from "./supabase/client";
import type { TablesUpdate } from "./supabase/database.types";
import { BUCKETS, signedUrls } from "./supabase/storage";
import { mapReview, rejectReasonToDb, type ReviewRow } from "./reviewMapping";
import { ReviewsContext, useLocalReviewState, type ReviewDemoMode, type ReviewsContextValue } from "./reviewsContext";

/**
 * The review store on Supabase.
 *
 * Row Level Security decides what each reader gets: visitors the published
 * reviews (public columns only), a customer also their own reviews, votes and
 * reports, the team everything. The database enforces the rules as well —
 * a review can only be written by a customer whose order containing the
 * product has shipped, a customer edit goes back to moderation, staff never
 * change the text — so this file only sends intents and re-reads the result.
 *
 * Team actions update the list at once, then write; a refused write shows a
 * toast and re-reads the database, so the screen never keeps a change the
 * database did not accept. The `actor` arguments are ignored here: the
 * database records the signed-in account itself.
 */

const PUBLIC_COLUMNS = `
  id, is_verified, author_name, rating, title, body, language, tags, status, helpful_count,
  response_body, response_at, published_at, edited_at,
  product:products ( slug ),
  review_photos ( storage_path, alt_text, position )
`;

const SIGNED_IN_COLUMNS = `${PUBLIC_COLUMNS},
  user_id, submitted_at, rejection_reason, changes_request, is_flagged,
  order:orders ( order_number ),
  author:profiles!reviews_user_id_fkey ( first_name, last_name, email, country_code ),
  responder:profiles!reviews_response_by_fkey ( first_name, last_name, display_name ),
  review_reports ( id, reason, details, source, created_at, resolved_at, resolution, reporter_id ),
  review_notes ( id, body, created_at, author:profiles ( first_name, last_name, display_name ) )
`;

interface Loaded {
  owner: string | null;
  reviews: CustomerReview[];
  helpful: Set<string>;
  reported: Set<string>;
  /** Storage path of each photo URL, so an edit can keep the photos it did not touch. */
  photoPaths: Map<string, string>;
}

async function load(userId: string | null): Promise<Loaded> {
  const db = requireSupabase();
  const reviewsQuery = userId
    ? db.from("reviews").select(SIGNED_IN_COLUMNS).order("submitted_at", { ascending: false })
    : db.from("reviews").select(PUBLIC_COLUMNS).order("published_at", { ascending: false });
  const votesQuery = userId
    ? db.from("review_helpful_votes").select("review_id").eq("user_id", userId)
    : Promise.resolve({ data: [] as { review_id: string }[], error: null });

  const [reviewsResult, votes] = await Promise.all([reviewsQuery, votesQuery]);
  if (reviewsResult.error) throw reviewsResult.error;
  if (votes.error) throw votes.error;
  const rows = reviewsResult.data as unknown as ReviewRow[];

  // One round trip for every photo; storage RLS leaves out what the reader may not see.
  const urls = await signedUrls(
    BUCKETS.reviewPhotos,
    rows.flatMap((r) => r.review_photos.map((p) => p.storage_path)),
  ).catch((error: unknown) => {
    console.warn("[reviews] photo URLs unavailable", error);
    return new Map<string, string>();
  });
  const photoPaths = new Map([...urls].map(([path, url]) => [url, path]));

  const reviews = rows.flatMap((row) => mapReview(row, { userId, photoUrl: (p) => urls.get(p) }) ?? []);
  const reported = new Set(
    rows.filter((r) => r.review_reports?.some((rep) => rep.reporter_id === userId && rep.source === "customer")).map((r) => r.id),
  );
  return { owner: userId, reviews, helpful: new Set(votes.data.map((v) => v.review_id)), reported, photoPaths };
}

function extensionOf(type: string): string {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export function SupabaseReviewsProvider({ children, myName }: { children: ReactNode; myName: string }) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { showToast } = useToast();
  const local = useLocalReviewState();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [demoMode, setDemoModeState] = useState<ReviewDemoMode>("live");
  const [attempt, setAttempt] = useState(0);
  const photoPaths = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    load(userId)
      .then((loaded) => {
        if (!active) return;
        photoPaths.current = loaded.photoPaths;
        setData(loaded);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("[reviews] load failed", error);
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  // Reviews read under another session never show under this one.
  const current = data && data.owner === userId ? data : null;
  const reviews = useMemo(() => current?.reviews ?? [], [current]);

  /** Local change first, then the write; a refused write re-reads the database. */
  const run = useCallback(
    (write: () => PromiseLike<{ error: unknown } | void>, local?: (r: CustomerReview) => Partial<CustomerReview>, id?: string) => {
      if (local && id) {
        setData((prev) =>
          prev ? { ...prev, reviews: prev.reviews.map((r) => (r.id === id ? { ...r, ...local(r) } : r)) } : prev,
        );
      }
      void Promise.resolve(write())
        .then((result) => {
          if (result && result.error) throw result.error;
        })
        .catch((error: unknown) => {
          console.error("[reviews] write refused", error);
          showToast(t("reviews.errors.saveTitle"), t("reviews.errors.saveBody"), "error");
        })
        .finally(refresh);
    },
    [refresh, showToast, t],
  );

  /* -------------------------------- Customer ------------------------------- */

  /** Uploads new photos (browser object URLs) and returns the rows to store. */
  const storePhotos = useCallback(
    async (reviewId: string, photos: ReviewInput["photos"]) => {
      const db = requireSupabase();
      const rows = [];
      for (const [position, photo] of photos.entries()) {
        let path = photoPaths.current.get(photo.src);
        if (!path) {
          const blob = await fetch(photo.src).then((r) => r.blob());
          path = `${userId}/${reviewId}/${crypto.randomUUID()}.${extensionOf(blob.type)}`;
          const { error } = await db.storage.from(BUCKETS.reviewPhotos).upload(path, blob, { contentType: blob.type });
          if (error) throw error;
        }
        rows.push({ review_id: reviewId, storage_path: path, alt_text: photo.alt.trim() || null, position });
      }
      return rows;
    },
    [userId],
  );

  const submitReview = useCallback<ReviewsContextValue["submitReview"]>(
    async (subject: ReviewSubject, input: ReviewInput) => {
      if (!userId) throw new Error("reviews: signed out");
      if (subject.kind !== "product") throw new Error("reviews: course reviews are not stored yet");
      const db = requireSupabase();
      const product = await db.from("products").select("id").eq("slug", subject.id).maybeSingle();
      if (product.error || !product.data) throw product.error ?? new Error("reviews: unknown product");

      // The database fills the order, the author's signature and the status.
      const inserted = await db
        .from("reviews")
        .insert({
          product_id: product.data.id,
          user_id: userId,
          author_name: myName,
          rating: input.rating,
          title: input.title.trim(),
          body: input.body.trim(),
          language: document.documentElement.lang.startsWith("en") ? "en" : "fr",
          tags: input.tags,
        })
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      const id = inserted.data.id;

      try {
        const photoRows = await storePhotos(id, input.photos);
        if (photoRows.length) {
          const { error } = await db.from("review_photos").insert(photoRows);
          if (error) throw error;
        }
      } catch (error) {
        // The review is stored; only its photos are missing. Say so rather than fail it.
        console.error("[reviews] photos not stored", error);
        showToast(t("reviews.errors.photosTitle"), t("reviews.errors.photosBody"), "error");
      }
      local.saveDraft(subject, null);
      refresh();
      return id;
    },
    [userId, myName, storePhotos, local, refresh, showToast, t],
  );

  const updateReview = useCallback<ReviewsContextValue["updateReview"]>(
    async (id, input) => {
      const db = requireSupabase();
      const before = reviews.find((r) => r.id === id);
      const { error } = await db
        .from("reviews")
        .update({ rating: input.rating, title: input.title.trim(), body: input.body.trim(), tags: input.tags })
        .eq("id", id);
      if (error) throw error;

      const samePhotos =
        before &&
        before.photos.length === input.photos.length &&
        before.photos.every((p, i) => p.src === input.photos[i].src && p.alt === input.photos[i].alt);
      if (!samePhotos) {
        // Rewritten as a set: positions are unique per review, so moving rows
        // one by one would collide.
        const rows = await storePhotos(id, input.photos);
        const removed = (before?.photos ?? [])
          .map((p) => photoPaths.current.get(p.src))
          .filter((path): path is string => Boolean(path) && !rows.some((r) => r.storage_path === path));
        const cleared = await db.from("review_photos").delete().eq("review_id", id);
        if (cleared.error) throw cleared.error;
        if (rows.length) {
          const added = await db.from("review_photos").insert(rows);
          if (added.error) throw added.error;
        }
        if (removed.length) await db.storage.from(BUCKETS.reviewPhotos).remove(removed);
      }
      refresh();
    },
    [reviews, storePhotos, refresh],
  );

  const toggleHelpful = useCallback(
    (id: string) => {
      if (!userId || !current) return;
      const had = current.helpful.has(id);
      const helpful = new Set(current.helpful);
      if (had) helpful.delete(id);
      else helpful.add(id);
      setData((prev) => (prev ? { ...prev, helpful } : prev));
      const db = requireSupabase();
      run(
        () =>
          had
            ? db.from("review_helpful_votes").delete().eq("review_id", id).eq("user_id", userId)
            : db.from("review_helpful_votes").insert({ review_id: id, user_id: userId }),
        (r) => ({ helpful: Math.max(0, r.helpful + (had ? -1 : 1)) }),
        id,
      );
    },
    [userId, current, run],
  );

  const reportReview = useCallback(
    (id: string, reason: ReportReason, details: string) => {
      setData((prev) => (prev ? { ...prev, reported: new Set(prev.reported).add(id) } : prev));
      run(() => requireSupabase().from("review_reports").insert({ review_id: id, reason, details: details.trim() || null }));
    },
    [run],
  );

  /* ---------------------------------- Team --------------------------------- */

  const note = useCallback((id: string, body: string) => {
    const text = body.trim();
    return text ? requireSupabase().from("review_notes").insert({ review_id: id, body: text }) : Promise.resolve({ error: null });
  }, []);

  /** A status update, plus an internal note when one was written. */
  const moderate = useCallback(
    (id: string, patch: TablesUpdate<"reviews">, local: (r: CustomerReview) => Partial<CustomerReview>, noteText = "") =>
      run(
        async () => {
          const { error } = await requireSupabase().from("reviews").update(patch).eq("id", id);
          if (error) return { error };
          return note(id, noteText);
        },
        local,
        id,
      ),
    [run, note],
  );

  const approve = useCallback((id: string) => moderate(id, { status: "published" }, () => ({ status: "published" })), [moderate]);

  const reject = useCallback(
    (id: string, _actor: string, reason: RejectReason, internal: string) =>
      moderate(
        id,
        { status: "rejected", rejection_reason: rejectReasonToDb(reason) },
        () => ({ status: "rejected", rejection: { reason, internal: internal.trim() || undefined } }),
        internal,
      ),
    [moderate],
  );

  const requestChanges = useCallback(
    (id: string, _actor: string, message: string) =>
      moderate(
        id,
        { status: "needs_changes", changes_request: message.trim() },
        () => ({ status: "needsChanges", changesRequest: message.trim() }),
      ),
    [moderate],
  );

  const hide = useCallback(
    (id: string, _actor: string, noteText: string) => moderate(id, { status: "hidden" }, () => ({ status: "hidden" }), noteText),
    [moderate],
  );

  const restore = useCallback((id: string) => moderate(id, { status: "published" }, () => ({ status: "published" })), [moderate]);

  const respond = useCallback(
    (id: string, actor: string, body: string) =>
      moderate(id, { response_body: body.trim() }, () => ({ response: { body: body.trim(), at: new Date().toISOString(), by: actor } })),
    [moderate],
  );

  const removeResponse = useCallback(
    (id: string) => moderate(id, { response_body: null }, () => ({ response: undefined })),
    [moderate],
  );

  const flag = useCallback(
    (id: string, _actor: string, reason: ReportReason, noteText: string) =>
      run(
        async () => {
          const db = requireSupabase();
          const report = await db.from("review_reports").insert({ review_id: id, reason, details: noteText.trim() || null });
          if (report.error) return report;
          return db.from("reviews").update({ is_flagged: true }).eq("id", id);
        },
        () => ({ flagged: true }),
        id,
      ),
    [run],
  );

  const resolveReports = useCallback(
    (id: string, _actor: string, resolution: "kept" | "hidden" | "removed", noteText: string) =>
      run(
        async () => {
          const db = requireSupabase();
          // The database applies the outcome to the review (hide / reject).
          const resolved = await db.from("review_reports").update({ resolution }).eq("review_id", id).is("resolved_at", null);
          if (resolved.error) return resolved;
          const unflagged = await db.from("reviews").update({ is_flagged: false }).eq("id", id);
          if (unflagged.error) return unflagged;
          return note(id, noteText);
        },
        (r) => ({
          flagged: false,
          reports: r.reports.map((rep) => (rep.resolved ? rep : { ...rep, resolved: true, resolution })),
          ...(resolution === "hidden" ? { status: "hidden" as const } : {}),
          ...(resolution === "removed" ? { status: "rejected" as const, rejection: { reason: "guidelines" as const } } : {}),
        }),
        id,
      ),
    [run, note],
  );

  const addNote = useCallback(
    (id: string, actor: string, body: string) =>
      run(
        () => note(id, body),
        (r) => ({ notes: [...r.notes, { id: `pending-${r.notes.length}`, body: body.trim(), at: new Date().toISOString(), by: actor }] }),
        id,
      ),
    [run, note],
  );

  const setDemoMode = useCallback((mode: ReviewDemoMode) => setDemoModeState(mode), []);
  const retry = useCallback(() => {
    setDemoModeState("live");
    refresh();
  }, [refresh]);

  // The admin's state preview ("empty", "error") still works over real data.
  const visible = demoMode === "empty" ? EMPTY : reviews;
  const shownMode: ReviewDemoMode = failed ? "error" : demoMode;

  const value = useMemo<ReviewsContextValue>(
    () => ({
      ...local,
      reviews: visible,
      myName,
      loading: !current && !failed,
      demoMode: shownMode,
      setDemoMode,
      retry,
      getReview: (id) => visible.find((r) => r.id === id),
      submitReview,
      updateReview,
      helpfulByMe: current?.helpful ?? EMPTY_SET,
      toggleHelpful,
      reportedByMe: current?.reported ?? EMPTY_SET,
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
      local, visible, myName, failed, current, shownMode, setDemoMode, retry, submitReview, updateReview, toggleHelpful,
      reportReview, approve, reject, requestChanges, hide, restore, respond, removeResponse, flag, resolveReports, addNote,
    ],
  );

  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}

const EMPTY: CustomerReview[] = [];
const EMPTY_SET: Set<string> = new Set();
