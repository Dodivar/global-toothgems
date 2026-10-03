import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PROGRAMME, type LoyaltyProgramme, type LoyaltyState } from "../data/loyalty";
import { useAuth } from "./auth";
import {
  LOYALTY_OVERVIEW_SELECT,
  LOYALTY_SETTINGS_SELECT,
  mapOverview,
  mapProgramme,
  type LoyaltyOverviewRow,
  type LoyaltySettingsRow,
} from "./loyaltyMapping";
import { isSupabaseConfigured, supabase } from "./supabase/client";

/**
 * The Loyalty Club: the programme's rules (public) and the signed-in member's
 * card.
 *
 * Both are read from Supabase — `loyalty_settings` and `loyalty_overview`, the
 * latter limited to the member's own row by RLS. This file only reads: a stamp
 * is written by the database when Stripe confirms the payment of an order
 * (`orders_apply_loyalty`), so the browser can neither add nor remove one.
 *
 * Until the rules are read (and without Supabase, in the smoke tests' mock
 * mode) the programme is `DEFAULT_PROGRAMME`, so a server-rendered page and its
 * first browser render agree. There is no mock card: without a session or a
 * backend, `card` is null.
 */

export type LoyaltyLoadState = "idle" | "loading" | "ready" | "error";

export type LoyaltyCardState = LoyaltyState & {
  /** Stamps ever earned and still standing. */
  lifetime: number;
};

interface LoyaltyContextValue {
  programme: LoyaltyProgramme;
  /** The member's card; null when signed out or not read yet. */
  card: LoyaltyCardState | null;
  /** `idle` while signed out; `error` when the card could not be read. */
  status: LoyaltyLoadState;
  /** Reads the card again — after a payment, the stamp may land a moment later. */
  reload: () => void;
}

const LoyaltyContext = createContext<LoyaltyContextValue>({
  programme: DEFAULT_PROGRAMME,
  card: null,
  status: "idle",
  reload: () => {},
});

const EMPTY_OVERVIEW: LoyaltyOverviewRow = {
  current_stamps: 0,
  stamps_required: null,
  rewards_available: 0,
  cards_redeemed: 0,
  stamps_lifetime: 0,
};

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [programme, setProgramme] = useState<LoyaltyProgramme>(DEFAULT_PROGRAMME);
  const [member, setMember] = useState<{ owner: string; status: "ready" | "error"; row: LoyaltyOverviewRow | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const controller = new AbortController();
    supabase
      .from("loyalty_settings")
      .select(LOYALTY_SETTINGS_SELECT)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) console.error("[loyalty] settings failed", error.message);
        else if (data) setProgramme(mapProgramme(data as LoyaltySettingsRow));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    const controller = new AbortController();
    supabase
      .from("loyalty_overview")
      .select(LOYALTY_OVERVIEW_SELECT)
      .eq("user_id", userId)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) {
          console.error("[loyalty] card failed", error.message);
          setMember({ owner: userId, status: "error", row: null });
          return;
        }
        // No row means no profile yet: shown as an empty card.
        setMember({ owner: userId, status: "ready", row: (data as LoyaltyOverviewRow | null) ?? EMPTY_OVERVIEW });
      });
    return () => controller.abort();
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Rows from a previous session never show under another account.
  const current = userId && member?.owner === userId ? member : null;
  const status: LoyaltyLoadState = !isSupabaseConfigured || !userId ? "idle" : (current?.status ?? "loading");

  const card = useMemo(() => (current?.row ? mapOverview(current.row, programme) : null), [current, programme]);
  const value = useMemo<LoyaltyContextValue>(
    () => ({ programme, card, status, reload }),
    [programme, card, status, reload],
  );

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>;
}

export function useLoyalty() {
  return useContext(LoyaltyContext);
}
