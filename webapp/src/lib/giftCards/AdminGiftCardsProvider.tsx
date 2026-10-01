import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSupabaseConfigured } from "../supabase/client";
import {
  adjustGiftCard,
  cancelGiftCard,
  extendGiftCard,
  fetchAdminGiftCards,
  issueGiftCard,
  saveGiftCardSettings,
  type IssueDraft,
  type WriteResult,
} from "./api";
import type { AdminGiftCard, GiftCardConfig } from "./giftCardMapping";

/**
 * Gift cards in the back office: the list (`gift_card_overview`), the shop's
 * settings and whether the signed-in member may change them. Loaded the first
 * time a gift card screen asks for it, then kept while staff move between
 * screens; every write re-reads, so balances and statuses are always the
 * database's. A refusal is returned for the screen to word, never turned into
 * a success.
 *
 * Without Supabase (local mock mode) there are no cards and nothing can be
 * changed: this is a live domain and never shows invented cards.
 */

interface AdminGiftCardsValue {
  /** False in local mock mode. */
  available: boolean;
  /** True until the first read has answered. */
  loading: boolean;
  /** The last read failed: an empty list is not "no cards". */
  failed: boolean;
  cards: AdminGiftCard[];
  settings: GiftCardConfig | null;
  canManage: boolean;
  /** Starts the first read (idempotent); screens call it through `useAdminGiftCards`. */
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  issue: (draft: IssueDraft) => Promise<WriteResult<string>>;
  adjust: (id: string, deltaMinor: number, note: string) => Promise<WriteResult>;
  extend: (id: string, expiresAt: string, note: string) => Promise<WriteResult>;
  cancel: (id: string, note: string) => Promise<WriteResult>;
  saveSettings: (config: GiftCardConfig) => Promise<WriteResult<GiftCardConfig>>;
}

const AdminGiftCardsContext = createContext<AdminGiftCardsValue | null>(null);

export function AdminGiftCardsProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<AdminGiftCard[]>([]);
  const [settings, setSettings] = useState<GiftCardConfig | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const snapshot = await fetchAdminGiftCards();
      setCards(snapshot.cards);
      setSettings(snapshot.settings);
      setCanManage(snapshot.canManage);
      setFailed(false);
    } catch (error) {
      console.error("[gift cards] read failed", error instanceof Error ? error.message : error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureLoaded = useCallback(() => {
    if (started.current || !isSupabaseConfigured) return;
    started.current = true;
    void reload();
  }, [reload]);

  // Every write re-reads the list, whatever its outcome (a refusal may follow a change made elsewhere).
  const write = useCallback(
    async <T,>(run: () => Promise<WriteResult<T>>): Promise<WriteResult<T>> => {
      const result = await run();
      await reload();
      return result;
    },
    [reload],
  );

  const value = useMemo<AdminGiftCardsValue>(
    () => ({
      available: isSupabaseConfigured,
      loading,
      failed,
      cards,
      settings,
      canManage,
      ensureLoaded,
      reload,
      issue: (draft) => write(() => issueGiftCard(draft)),
      adjust: (id, delta, note) => write(() => adjustGiftCard(id, delta, note)),
      extend: (id, expiresAt, note) => write(() => extendGiftCard(id, expiresAt, note)),
      cancel: (id, note) => write(() => cancelGiftCard(id, note)),
      saveSettings: (config) => write(() => saveGiftCardSettings(config)),
    }),
    [loading, failed, cards, settings, canManage, ensureLoaded, reload, write],
  );

  return <AdminGiftCardsContext.Provider value={value}>{children}</AdminGiftCardsContext.Provider>;
}

export function useAdminGiftCards() {
  const ctx = useContext(AdminGiftCardsContext);
  if (!ctx) throw new Error("useAdminGiftCards must be used within AdminGiftCardsProvider");
  const { ensureLoaded } = ctx;
  useEffect(() => ensureLoaded(), [ensureLoaded]);
  return ctx;
}
