import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  randomCode,
  type Campaign,
  type CampaignLifecycle,
  type Collection,
  type Promotion,
  type PromotionLifecycle,
  type Segment,
} from "../data/adminPromotions";
import { isSupabaseConfigured } from "./supabase/client";
import {
  addCampaignProductRows,
  fetchPromotionsWorkspace,
  saveCampaignRow,
  savePromotionRow,
  setCampaignLifecycleRow,
  setPromotionsCampaign,
  setPromotionsLifecycle,
  type PromotionsSnapshot,
  type WriteResult,
} from "./promotionsApi";
import { useToast } from "./toast";

/**
 * Promotions and campaigns in the back office, on Supabase.
 *
 * Loaded the first time a promotions screen asks for it (`usePromotions`), then
 * kept while staff move between screens; every write re-reads everything, so
 * statuses, figures and codes are always the database's. A write that the
 * database refuses is reported here by a toast and answered with `null` /
 * `false`: the screen keeps its form as it is and does not navigate.
 *
 * Without Supabase (local mock mode) there is nothing: this is a live domain
 * and never shows invented promotions. Gift cards are their own store
 * (`lib/giftCards/`).
 */

interface PromotionsValue {
  /** False in local mock mode. */
  available: boolean;
  promotions: Promotion[];
  campaigns: Campaign[];
  collections: Collection[];
  segments: Segment[];
  /** True until the first read has answered. */
  loading: boolean;
  /** The last read failed: an empty list is not "no promotions". */
  failed: boolean;
  /** Whether the signed-in member holds `manage_promotions` (the database decides; this only hides buttons). */
  canManage: boolean;
  reload: () => Promise<PromotionsSnapshot | null>;

  getPromotion: (id: string) => Promotion | undefined;
  getCampaign: (id: string) => Campaign | undefined;
  campaignName: (id: string | null) => string;

  /** Null when refused (already reported). */
  savePromotion: (promotion: Promotion) => Promise<Promotion | null>;
  setPromotionLifecycle: (ids: string[], lifecycle: PromotionLifecycle) => Promise<boolean>;
  /** Copies start as drafts, without any code of their own to share; empty when refused. */
  duplicatePromotions: (ids: string[]) => Promise<Promotion[]>;
  assignCampaign: (ids: string[], campaignId: string | null) => Promise<boolean>;

  saveCampaign: (campaign: Campaign) => Promise<Campaign | null>;
  setCampaignLifecycle: (id: string, lifecycle: CampaignLifecycle) => Promise<boolean>;
  duplicateCampaign: (id: string) => Promise<Campaign | null>;
  addCampaignProducts: (id: string, productIds: string[]) => Promise<boolean>;
}

const PromotionsContext = createContext<PromotionsValue | null>(null);

const EMPTY: PromotionsSnapshot = { promotions: [], campaigns: [], collections: [], segments: [], canManage: false };

/** A fresh code for a copy: the original's start, a new tail (the database still checks it is free). */
const copyCode = (code: string) => `${code.slice(0, 19)}-${randomCode().slice(0, 3)}`;

export function PromotionsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [data, setData] = useState<PromotionsSnapshot>(EMPTY);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  // What the callers' ids refer to, read at call time: a write answers with the row it just stored, which the
  // re-read has put here before React has rendered it.
  const latest = useRef(data);

  const reload = useCallback(async (): Promise<PromotionsSnapshot | null> => {
    if (!isSupabaseConfigured) return null;
    try {
      const snapshot = await fetchPromotionsWorkspace();
      latest.current = snapshot;
      setData(snapshot);
      setFailed(false);
      return snapshot;
    } catch (error) {
      console.error("[promotions] read failed", error instanceof Error ? error.message : error);
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureLoaded = useCallback(() => {
    if (started.current || !isSupabaseConfigured) return;
    started.current = true;
    void reload();
  }, [reload]);

  /** Runs a write, says why in a toast when it is refused, and re-reads whatever the outcome. */
  const write = useCallback(
    async <T,>(run: () => Promise<WriteResult<T>>): Promise<WriteResult<T>> => {
      if (!isSupabaseConfigured) {
        showToast(t("promo.toast.error.unavailable"), undefined, "error");
        return { ok: false, error: "unavailable" };
      }
      const result = await run();
      if (!result.ok) showToast(t(`promo.toast.error.${result.error}`), undefined, "error");
      await reload();
      return result;
    },
    [reload, showToast, t],
  );

  const savePromotion = useCallback(
    async (promotion: Promotion) => {
      const result = await write(() => savePromotionRow(promotion));
      if (!result.ok) return null;
      return latest.current.promotions.find((p) => p.id === result.value) ?? null;
    },
    [write],
  );

  const setPromotionLifecycle = useCallback(
    async (ids: string[], lifecycle: PromotionLifecycle) => (await write(() => setPromotionsLifecycle(ids, lifecycle))).ok,
    [write],
  );

  const duplicatePromotions = useCallback(
    async (ids: string[]) => {
      const copies: Promotion[] = [];
      for (const source of latest.current.promotions.filter((p) => ids.includes(p.id))) {
        const result = await write(() =>
          savePromotionRow({
            ...structuredClone(source),
            id: "",
            name: `${source.name} (copy)`,
            lifecycle: "draft",
            // A shared code belongs to one promotion: the copy needs its own before it can run.
            code: source.code.mode === "code" && source.code.kind === "shared" ? { ...source.code, code: copyCode(source.code.code) } : source.code,
          }),
        );
        if (!result.ok) break;
        const copy = latest.current.promotions.find((p) => p.id === result.value);
        if (copy) copies.push(copy);
      }
      return copies;
    },
    [write],
  );

  const assignCampaign = useCallback(
    async (ids: string[], campaignId: string | null) => (await write(() => setPromotionsCampaign(ids, campaignId))).ok,
    [write],
  );

  const saveCampaign = useCallback(
    async (campaign: Campaign) => {
      const result = await write(() => saveCampaignRow(campaign));
      if (!result.ok) return null;
      return latest.current.campaigns.find((c) => c.id === result.value) ?? null;
    },
    [write],
  );

  const setCampaignLifecycle = useCallback(
    async (id: string, lifecycle: CampaignLifecycle) => (await write(() => setCampaignLifecycleRow(id, lifecycle))).ok,
    [write],
  );

  const duplicateCampaign = useCallback(
    async (id: string) => {
      const source = latest.current.campaigns.find((c) => c.id === id);
      if (!source) return null;
      const result = await write(() => saveCampaignRow({ ...structuredClone(source), id: "", name: `${source.name} (copy)`, lifecycle: "draft" }));
      if (!result.ok) return null;
      return latest.current.campaigns.find((c) => c.id === result.value) ?? null;
    },
    [write],
  );

  const addCampaignProducts = useCallback(
    async (id: string, productIds: string[]) => {
      const current = latest.current.campaigns.find((c) => c.id === id)?.productIds ?? [];
      return (await write(() => addCampaignProductRows(id, current, productIds))).ok;
    },
    [write],
  );

  const getPromotion = useCallback((id: string) => data.promotions.find((p) => p.id === id), [data.promotions]);
  const getCampaign = useCallback((id: string) => data.campaigns.find((c) => c.id === id), [data.campaigns]);
  const campaignName = useCallback((id: string | null) => (id ? (data.campaigns.find((c) => c.id === id)?.name ?? "") : ""), [data.campaigns]);

  const value = useMemo<PromotionsValue & { ensureLoaded: () => void }>(
    () => ({
      available: isSupabaseConfigured,
      promotions: data.promotions,
      campaigns: data.campaigns,
      collections: data.collections,
      segments: data.segments,
      loading,
      failed,
      canManage: data.canManage,
      reload,
      ensureLoaded,
      getPromotion,
      getCampaign,
      campaignName,
      savePromotion,
      setPromotionLifecycle,
      duplicatePromotions,
      assignCampaign,
      saveCampaign,
      setCampaignLifecycle,
      duplicateCampaign,
      addCampaignProducts,
    }),
    [
      data,
      loading,
      failed,
      reload,
      ensureLoaded,
      getPromotion,
      getCampaign,
      campaignName,
      savePromotion,
      setPromotionLifecycle,
      duplicatePromotions,
      assignCampaign,
      saveCampaign,
      setCampaignLifecycle,
      duplicateCampaign,
      addCampaignProducts,
    ],
  );

  return <PromotionsContext.Provider value={value}>{children}</PromotionsContext.Provider>;
}

export function usePromotions(): PromotionsValue {
  const ctx = useContext(PromotionsContext) as (PromotionsValue & { ensureLoaded: () => void }) | null;
  if (!ctx) throw new Error("usePromotions must be used within PromotionsProvider");
  const { ensureLoaded } = ctx;
  useEffect(() => ensureLoaded(), [ensureLoaded]);
  return ctx;
}
