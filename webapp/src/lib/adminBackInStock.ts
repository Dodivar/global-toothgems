import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import { readErrorOf, rowToRequest, type AdminBackInStockRequest, type BackInStockRow } from "./adminBackInStockMapping";

/**
 * The single persistence boundary of `/admin/alertes-stock`: one read of
 * `admin_back_in_stock_requests()`, which the database refuses (42501) to anyone
 * without `manage_products`. Read-only. Without Supabase the page says the
 * feature is unavailable rather than showing invented requests.
 */

export type BackInStockLoad = "unavailable" | "loading" | "ready" | "forbidden" | "error";

export function useAdminBackInStock() {
  const [requests, setRequests] = useState<AdminBackInStockRequest[]>([]);
  const [answered, setAnswered] = useState<{ attempt: number; state: BackInStockLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    requireSupabase()
      .rpc("admin_back_in_stock_requests", { p_limit: 5000 })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[admin back in stock] read failed", error.code);
          setAnswered({ attempt, state: readErrorOf(error) });
          return;
        }
        setRequests(((data ?? []) as BackInStockRow[]).map(rowToRequest));
        setAnswered({ attempt, state: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const state: BackInStockLoad = !isSupabaseConfigured
    ? "unavailable"
    : answered?.attempt !== attempt
      ? "loading"
      : answered.state;

  return { requests, state, retry };
}
