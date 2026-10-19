import { useCallback, useEffect, useState } from "react";
import { readErrorOf } from "./adminBackInStockMapping";
import { queueMediaPaths, toQueueEntry, type QueueEntry } from "./adminGlowbookMapping";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "./supabase/storage";

/**
 * The single persistence boundary of `/admin/glowbook` (decision 99): the
 * queue (`studio_showcase_queue()`), the renders of the creations sent
 * (signed through the moderators' storage policy), and the decisions
 * (`studio_moderate_showcase()` / `studio_moderate_showcase_item()`). The
 * database refuses all of it (42501) without `moderate_reviews`. Without
 * Supabase the page says the feature is unavailable — no invented entries.
 */

export type GlowbookQueueLoad = "unavailable" | "loading" | "ready" | "forbidden" | "error";

export function useAdminGlowbook() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [answered, setAnswered] = useState<{ attempt: number; state: GlowbookQueueLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const client = requireSupabase();
    void (async () => {
      const { data, error } = await client.rpc("studio_showcase_queue");
      if (cancelled) return;
      if (error) {
        console.error("[admin glowbook] read failed", error.code);
        setAnswered({ attempt, state: readErrorOf(error) });
        return;
      }
      const list = (data ?? []).map(toQueueEntry);
      const paths = list.flatMap((e) => (e.kind === "creation" && e.thumbnailPath ? [e.thumbnailPath] : []));
      const urls = new Map<string, string>();
      if (paths.length) {
        // Renders are a help to decide, not the decision: a failure shows the placeholder.
        const { data: signed } = await client.storage.from(BUCKETS.studioThumbnails).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        for (const s of signed ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
      }
      const media = queueMediaPaths(list);
      if (media.length) {
        const { data: signed } = await client.storage.from(BUCKETS.glowbookMedia).createSignedUrls(media, SIGNED_URL_TTL_SECONDS);
        for (const s of signed ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
      }
      if (cancelled) return;
      setEntries(list);
      setImages(urls);
      setAnswered({ attempt, state: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** Approve, or reject with a note shown to the artist. Resolves to whether the database accepted it. */
  const decide = useCallback(async (entry: QueueEntry, status: "approved" | "rejected", note: string) => {
    const client = requireSupabase();
    const { error } =
      entry.kind === "page"
        ? await client.rpc("studio_moderate_showcase", { p_user_id: entry.userId, p_status: status, p_note: note })
        : entry.kind === "changes"
          ? await client.rpc("studio_moderate_showcase_changes", { p_user_id: entry.userId, p_status: status, p_note: note })
          : await client.rpc("studio_moderate_showcase_item", { p_item_id: entry.id, p_status: status, p_note: note });
    if (error) {
      console.error("[admin glowbook] decision failed", error.code);
      return false;
    }
    const at = new Date().toISOString();
    setEntries((list) =>
      list.map((e) => {
        if (e.kind === entry.kind && e.id === entry.id) return { ...e, status, reviewNote: status === "rejected" ? note.trim() || null : null, reviewedAt: at };
        // The page's status shows beside each of its creations; approving a page or its
        // changes applies what was proposed (the database did the same).
        if ((entry.kind === "page" || entry.kind === "changes") && e.userId === entry.userId && e.kind !== "creation" && status === "approved") {
          const look = { approved: { ...e.look.approved, ...e.look.pending }, pending: {} };
          if (e.kind === "changes") return { ...e, look, status: "approved" as const };
          return { ...e, look, pageStatus: entry.kind === "page" ? status : e.pageStatus };
        }
        if (entry.kind === "page" && e.userId === entry.userId) return { ...e, pageStatus: status };
        return e;
      }),
    );
    return true;
  }, []);

  const state: GlowbookQueueLoad = !isSupabaseConfigured ? "unavailable" : answered?.attempt !== attempt ? "loading" : answered.state;
  return { entries, images, state, retry, decide };
}
