"use client";

import { useCallback, useEffect, useState } from "react";
import { readErrorOf } from "./adminBackInStockMapping";
import {
  decisionGrounds,
  mapAppeals,
  mapContext,
  mapHistory,
  mapQueue,
  mapStats,
  periodBounds,
  type ActionDraft,
  type AppealEntry,
  type ContextMessage,
  type HistoryEntry,
  type ModerationStats,
  type QueueEntry,
  type StatsPeriod,
} from "./adminLoungeModerationMapping";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "./supabase/storage";

/**
 * The single persistence boundary of `/admin/salons` (decision 132): the
 * reported messages, the complaints, the decisions and the counters, and
 * every decision taken from there — all `lounge_moderation_*` functions,
 * which refuse (42501) without `moderate_community`. Without Supabase the
 * page says the feature is unavailable: no invented entries.
 */

export type LoungeModerationLoad = "unavailable" | "loading" | "ready" | "forbidden" | "error";
export type QueueFilter = "open" | "all";

export interface LoungeModerationData {
  queue: QueueEntry[];
  appeals: AppealEntry[];
  history: HistoryEntry[];
  images: Map<string, string>;
}

const EMPTY: LoungeModerationData = { queue: [], appeals: [], history: [], images: new Map() };

/** What a refused decision means for the moderator. */
export type DecisionFailure = "forbidden" | "invalid" | "failed";

function failureOf(error: { code?: string } | null): DecisionFailure {
  if (error?.code === "42501") return "forbidden";
  if (error?.code === "22023") return "invalid";
  return "failed";
}

export function useAdminLoungeModeration(queueFilter: QueueFilter, appealFilter: QueueFilter) {
  const [data, setData] = useState<LoungeModerationData>(EMPTY);
  const [answered, setAnswered] = useState<{ key: string; state: LoungeModerationLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${queueFilter}:${appealFilter}:${attempt}`;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const client = requireSupabase();
    void (async () => {
      const [queue, appeals, history] = await Promise.all([
        client.rpc("lounge_moderation_queue", { p_status: queueFilter }),
        client.rpc("lounge_appeals_queue", { p_status: appealFilter }),
        client.rpc("lounge_moderation_history", { p_limit: 200 }),
      ]);
      if (cancelled) return;
      const error = queue.error ?? appeals.error ?? history.error;
      if (error) {
        console.error("[admin lounge] read failed", error.code);
        setAnswered({ key, state: readErrorOf(error) });
        return;
      }
      const entries = mapQueue(queue.data);
      const paths = entries.flatMap((e) => e.attachments.map((a) => a.path));
      const images = new Map<string, string>();
      if (paths.length) {
        // Images help to decide; a failure shows a placeholder, never blocks the queue.
        const { data: signed } = await client.storage.from(BUCKETS.loungeMedia).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        for (const s of signed ?? []) if (s.path && s.signedUrl && !s.error) images.set(s.path, s.signedUrl);
      }
      if (cancelled) return;
      setData({ queue: entries, appeals: mapAppeals(appeals.data), history: mapHistory(history.data), images });
      setAnswered({ key, state: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, queueFilter, appealFilter]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const loadContext = useCallback(async (messageId: string): Promise<ContextMessage[] | null> => {
    const { data: rows, error } = await requireSupabase().rpc("lounge_moderation_context", { p_message_id: messageId, p_radius: 5 });
    if (error) {
      console.error("[admin lounge] context failed", error.code);
      return null;
    }
    return mapContext(rows);
  }, []);

  /** Decides on a reported message or its author; resolves to null when the database took it. */
  const decide = useCallback(
    async (entry: QueueEntry, draft: ActionDraft): Promise<DecisionFailure | null> => {
      const client = requireSupabase();
      const grounds = decisionGrounds(draft);
      const statement = draft.statement.trim();
      const nullable = <T,>(value: T | null) => value as T;
      let error: { code?: string } | null;
      if (draft.action === "dismiss" || draft.action === "hide" || draft.action === "restore" || draft.action === "delete") {
        ({ error } = await client.rpc("lounge_moderate_message", {
          p_message_id: entry.messageId,
          p_action: draft.action,
          p_reason: nullable(grounds.reason),
          p_illegal_category: nullable(grounds.category),
          p_ground: nullable(grounds.ground),
          p_statement: statement,
        }));
      } else {
        if (!entry.author) return "invalid";
        ({ error } = await client.rpc("lounge_moderate_member", {
          p_user_id: entry.author.id,
          p_action: draft.action,
          p_reason: nullable(grounds.reason),
          p_illegal_category: nullable(grounds.category),
          p_ground: nullable(grounds.ground),
          p_statement: statement,
          ...(draft.action === "mute" ? { p_until: new Date(Date.now() + draft.muteHours * 3_600_000).toISOString() } : {}),
          ...(draft.action === "lift" ? {} : { p_message_id: entry.messageId }),
        }));
      }
      if (error) {
        console.error("[admin lounge] decision failed", error.code);
        return failureOf(error);
      }
      reload();
      return null;
    },
    [reload],
  );

  const answerAppeal = useCallback(
    async (appeal: AppealEntry, outcome: "upheld" | "reversed", response: string): Promise<DecisionFailure | null> => {
      const { error } = await requireSupabase().rpc("lounge_answer_appeal", { p_appeal_id: appeal.id, p_outcome: outcome, p_response: response.trim() });
      if (error) {
        console.error("[admin lounge] complaint answer failed", error.code);
        return failureOf(error);
      }
      reload();
      return null;
    },
    [reload],
  );

  const state: LoungeModerationLoad = !isSupabaseConfigured ? "unavailable" : answered?.key !== key ? "loading" : answered.state;
  return { data, state, reload, loadContext, decide, answerAppeal };
}

/** The counters of a period, for the transparency report. */
export function useLoungeModerationStats(period: StatsPeriod, enabled: boolean) {
  const [answered, setAnswered] = useState<{ period: StatsPeriod; stats: ModerationStats | null } | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;
    let cancelled = false;
    const { from, to } = periodBounds(period, new Date());
    void requireSupabase()
      .rpc("lounge_moderation_stats", { p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("[admin lounge] stats failed", error.code);
        setAnswered({ period, stats: error ? null : mapStats(data) });
      });
    return () => {
      cancelled = true;
    };
  }, [period, enabled]);
  return answered?.period === period ? { loading: false, stats: answered.stats } : { loading: true, stats: null };
}
