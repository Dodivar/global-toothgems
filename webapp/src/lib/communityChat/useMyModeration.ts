"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { isSupabaseConfigured } from "../supabase/client";
import { LoungeError, fetchMyModeration, setBlocked, submitAppeal } from "./loungeApi";
import { EMPTY_MODERATION, type MyModeration } from "./moderation";

export type MyModerationState = "unavailable" | "loading" | "ready" | "error";

/**
 * The member's moderation file for `/compte/moderation` (decision 132): read
 * from `lounge_my_moderation()`, which answers any signed-in account — an
 * excluded member reads why and contests from here. Without Supabase the page
 * says the feature is unavailable: nothing is invented.
 */
export function useMyModeration() {
  const { userId } = useAuth();
  const [file, setFile] = useState<MyModeration>(EMPTY_MODERATION);
  const [answered, setAnswered] = useState<{ key: string; state: MyModerationState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${userId ?? ""}:${attempt}`;

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let cancelled = false;
    fetchMyModeration()
      .then((next) => {
        if (cancelled) return;
        setFile(next);
        setAnswered({ key, state: "ready" });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[moderation] read failed", error instanceof LoungeError ? error.reason : error);
        setAnswered({ key, state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** Contests a decision; resolves to null when sent, else the reason it was refused. */
  const appeal = useCallback(
    async (decisionId: string, body: string): Promise<null | "duplicate" | "invalid" | "failed"> => {
      try {
        await submitAppeal(decisionId, body);
      } catch (error) {
        const reason = error instanceof LoungeError ? error.reason : "failed";
        return reason === "duplicate" || reason === "invalid" ? reason : "failed";
      }
      reload();
      return null;
    },
    [reload],
  );

  const unblock = useCallback(
    async (memberId: string) => {
      try {
        await setBlocked(memberId, false);
      } catch {
        return false;
      }
      setFile((current) => ({ ...current, blocked: current.blocked.filter((m) => m.id !== memberId) }));
      return true;
    },
    [],
  );

  const state: MyModerationState = !isSupabaseConfigured ? "unavailable" : answered?.key !== key ? "loading" : answered.state;
  return { file, state, reload, appeal, unblock };
}
