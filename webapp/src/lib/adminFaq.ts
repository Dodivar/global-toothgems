import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import {
  ADMIN_FAQ_SELECT,
  groupToPayload,
  readErrorOf,
  rowToGroup,
  sortGroups,
  type AdminFaqGroup,
  type FaqGroupRow,
} from "./adminFaqMapping";

/**
 * The single persistence boundary of `/admin/faq`: staff read every group
 * (RLS), `manage_products` saves a group with its questions and assignments in
 * one transaction (`admin_save_faq_group()`), deletes it (its questions and
 * assignments go with it) and reorders groups (`position`). Without Supabase
 * the page says the feature is unavailable rather than inventing groups.
 */

export type FaqLoad = "unavailable" | "loading" | "ready" | "forbidden" | "error";

/** A failed write, already logged; the screen shows a localized message. */
export class FaqWriteError extends Error {
  constructor(readonly kind: "forbidden" | "invalid" | "error") {
    super(kind);
  }
}

function writeError(error: { code?: string; message?: string }): FaqWriteError {
  console.error("[admin faq] write failed", error.code);
  if (readErrorOf(error) === "forbidden") return new FaqWriteError("forbidden");
  return new FaqWriteError(error.code === "22023" || error.code === "23514" ? "invalid" : "error");
}

export function useAdminFaq() {
  const [groups, setGroups] = useState<AdminFaqGroup[]>([]);
  const [answered, setAnswered] = useState<{ attempt: number; state: FaqLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    requireSupabase()
      .from("faq_groups")
      .select(ADMIN_FAQ_SELECT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[admin faq] read failed", error.code);
          setAnswered({ attempt, state: readErrorOf(error) });
          return;
        }
        setGroups(sortGroups(((data ?? []) as unknown as FaqGroupRow[]).map(rowToGroup)));
        setAnswered({ attempt, state: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const save = useCallback(
    async (group: AdminFaqGroup) => {
      const { error } = await requireSupabase().rpc("admin_save_faq_group", { p_group: groupToPayload(group) });
      if (error) throw writeError(error);
      reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await requireSupabase().from("faq_groups").delete().eq("id", id);
      if (error) throw writeError(error);
      setGroups((list) => list.filter((g) => g.id !== id));
    },
    [],
  );

  /** Moves a group one place up or down: positions are rewritten 0…n in the new order. */
  const move = useCallback(
    async (id: string, direction: -1 | 1) => {
      const order = sortGroups(groups);
      const from = order.findIndex((g) => g.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      const next = order.map((g, position) => ({ ...g, position }));
      const before = new Map(groups.map((g) => [g.id, g.position]));
      const client = requireSupabase();
      for (const group of next.filter((g) => g.position !== before.get(g.id))) {
        const { error } = await client.from("faq_groups").update({ position: group.position }).eq("id", group.id);
        if (error) {
          reload();
          throw writeError(error);
        }
      }
      setGroups(next);
    },
    [groups, reload],
  );

  const state: FaqLoad = !isSupabaseConfigured
    ? "unavailable"
    : answered?.attempt !== attempt
      ? "loading"
      : answered.state;

  return { groups, state, retry: reload, save, remove, move };
}
