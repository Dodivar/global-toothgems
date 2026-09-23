import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PROMO_NOW,
  SEED_CAMPAIGNS,
  SEED_GIFT_CARDS,
  SEED_GIFT_CARD_CONFIG,
  SEED_PROMOTIONS,
  newPromotionId,
  randomCode,
  type Campaign,
  type CampaignActivity,
  type CampaignLifecycle,
  type GiftCard,
  type GiftCardProductConfig,
  type GiftCardTransaction,
  type Promotion,
  type PromotionLifecycle,
} from "../data/adminPromotions";
import type { Localized } from "../data/types";
import { useAdminAuth } from "./adminAuth";

/**
 * Frontend store for promotions, campaigns and gift cards.
 *
 * Shaped like `lib/adminCatalog.tsx`: every mutation is async and takes a
 * simulated round trip, so every button above it already has a real busy state,
 * and replacing these bodies with server calls is the whole migration.
 *
 * It sits in `App.tsx` rather than in the admin layout for one reason: the
 * storefront gift card page reads the same product configuration. Editing the
 * preset amounts in the back office and opening `/carte-cadeau` shows the edit,
 * which is the relationship the prototype exists to demonstrate. Nothing
 * persists; a reload restores the seed.
 *
 * Authorisation, code uniqueness, balance arithmetic and the audit trail are
 * all things the real server owns. The ledger entries written here show the
 * shape of that trail, not a substitute for it.
 */

export const PROMO_SAVE_DELAY_MS = 650;
const LOAD_DELAY_MS = 520;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prototype switch: show the workspace as a brand-new shop would see it. */
export type PromoDemoMode = "live" | "empty" | "error";

interface PromotionsValue {
  promotions: Promotion[];
  campaigns: Campaign[];
  giftCards: GiftCard[];
  config: GiftCardProductConfig;
  loading: boolean;
  demoMode: PromoDemoMode;
  setDemoMode: (mode: PromoDemoMode) => void;

  getPromotion: (id: string) => Promotion | undefined;
  getCampaign: (id: string) => Campaign | undefined;
  getGiftCard: (code: string) => GiftCard | undefined;
  campaignName: (id: string | null) => string;

  savePromotion: (promotion: Promotion) => Promise<Promotion>;
  setPromotionLifecycle: (ids: string[], lifecycle: PromotionLifecycle) => Promise<void>;
  duplicatePromotions: (ids: string[]) => Promise<Promotion[]>;
  assignCampaign: (ids: string[], campaignId: string | null) => Promise<void>;

  saveCampaign: (campaign: Campaign) => Promise<Campaign>;
  setCampaignLifecycle: (id: string, lifecycle: CampaignLifecycle) => Promise<void>;
  duplicateCampaign: (id: string) => Promise<Campaign | undefined>;
  addCampaignProducts: (id: string, productIds: string[]) => Promise<void>;

  resendGiftCard: (code: string, email?: string) => Promise<void>;
  adjustGiftCard: (code: string, deltaCents: number, note: string) => Promise<void>;
  cancelGiftCard: (code: string, note: string) => Promise<void>;
  extendGiftCard: (code: string, expiresAt: string) => Promise<void>;

  saveConfig: (config: GiftCardProductConfig) => Promise<void>;
}

const PromotionsContext = createContext<PromotionsValue | null>(null);

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

export function PromotionsProvider({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();
  const actor = admin?.name ?? "Camille Dubois";

  const [promotions, setPromotions] = useState<Promotion[]>(SEED_PROMOTIONS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [giftCards, setGiftCards] = useState<GiftCard[]>(SEED_GIFT_CARDS);
  const [config, setConfig] = useState<GiftCardProductConfig>(SEED_GIFT_CARD_CONFIG);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState<PromoDemoMode>("live");

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), LOAD_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  // "error" keeps the data: it only makes the overview lists fail to load.
  const empty = demoMode === "empty";
  const visiblePromotions = useMemo(() => (empty ? [] : promotions), [empty, promotions]);
  const visibleCampaigns = useMemo(() => (empty ? [] : campaigns), [empty, campaigns]);
  const visibleCards = useMemo(() => (empty ? [] : giftCards), [empty, giftCards]);

  const logCampaign = useCallback(
    (campaignId: string, kind: CampaignActivity["kind"], detail: Localized) => {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId
            ? {
                ...c,
                updatedAt: PROMO_NOW,
                activity: [...c.activity, { id: nextId("act"), at: PROMO_NOW, actor, kind, detail }],
              }
            : c,
        ),
      );
    },
    [actor],
  );

  /* Promotions ------------------------------------------------------------ */

  const savePromotion = useCallback(
    async (promotion: Promotion) => {
      await wait(PROMO_SAVE_DELAY_MS);
      const isNew = !promotion.id;
      const saved: Promotion = {
        ...promotion,
        id: promotion.id || newPromotionId(promotion.name),
        code: { ...promotion.code, code: promotion.code.code.trim() },
        createdAt: isNew ? PROMO_NOW : promotion.createdAt,
        createdBy: isNew ? actor : promotion.createdBy,
        updatedAt: PROMO_NOW,
        updatedBy: actor,
      };
      setPromotions((prev) => (isNew ? [saved, ...prev] : prev.map((p) => (p.id === saved.id ? saved : p))));
      if (isNew && saved.campaignId) {
        logCampaign(saved.campaignId, "promotionAdded", {
          fr: `« ${saved.name} » ajoutée`,
          en: `“${saved.name}” added`,
        });
      }
      return saved;
    },
    [actor, logCampaign],
  );

  const setPromotionLifecycle = useCallback(
    async (ids: string[], lifecycle: PromotionLifecycle) => {
      await wait(PROMO_SAVE_DELAY_MS);
      setPromotions((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, lifecycle, updatedAt: PROMO_NOW, updatedBy: actor } : p)),
      );
    },
    [actor],
  );

  const duplicatePromotions = useCallback(
    async (ids: string[]) => {
      await wait(PROMO_SAVE_DELAY_MS);
      // Built from the render's snapshot rather than inside the state updater:
      // React may run an updater later (and twice in StrictMode), so copies
      // collected there would not exist yet when this function returns.
      const copies: Promotion[] = promotions
        .filter((p) => ids.includes(p.id))
        .map((source) => ({
          ...structuredClone(source),
          id: newPromotionId(source.name),
          name: `${source.name} (copy)`,
          lifecycle: "draft" as const,
          code:
            source.code.mode === "code"
              ? { ...source.code, code: `${source.code.code.slice(0, 14)}-${randomCode().slice(0, 3)}` }
              : source.code,
          stats: { uses: 0, orders: 0, revenueCents: 0, discountCents: 0, conversionRate: 0, daily: source.stats.daily.map(() => 0) },
          createdAt: PROMO_NOW,
          createdBy: actor,
          updatedAt: PROMO_NOW,
          updatedBy: actor,
        }));
      setPromotions((prev) => [...copies, ...prev]);
      return copies;
    },
    [actor, promotions],
  );

  const assignCampaign = useCallback(
    async (ids: string[], campaignId: string | null) => {
      await wait(PROMO_SAVE_DELAY_MS);
      setPromotions((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, campaignId, updatedAt: PROMO_NOW, updatedBy: actor } : p)),
      );
      if (campaignId) {
        logCampaign(campaignId, "promotionAdded", {
          fr: `${ids.length} promotion${ids.length > 1 ? "s" : ""} rattachée${ids.length > 1 ? "s" : ""}`,
          en: `${ids.length} promotion${ids.length > 1 ? "s" : ""} attached`,
        });
      }
    },
    [actor, logCampaign],
  );

  /* Campaigns ------------------------------------------------------------- */

  const saveCampaign = useCallback(
    async (campaign: Campaign) => {
      await wait(PROMO_SAVE_DELAY_MS);
      const isNew = !campaign.id;
      const id = campaign.id || newPromotionId(campaign.name);
      const entry: CampaignActivity = {
        id: nextId("act"),
        at: PROMO_NOW,
        actor,
        kind: isNew ? "created" : "edited",
        detail: isNew ? { fr: "Campagne créée", en: "Campaign created" } : { fr: "Campagne modifiée", en: "Campaign edited" },
      };
      const saved: Campaign = {
        ...campaign,
        id,
        createdAt: isNew ? PROMO_NOW : campaign.createdAt,
        updatedAt: PROMO_NOW,
        activity: [...campaign.activity, entry],
      };
      setCampaigns((prev) => (isNew ? [saved, ...prev] : prev.map((c) => (c.id === id ? saved : c))));
      return saved;
    },
    [actor],
  );

  const setCampaignLifecycle = useCallback(
    async (id: string, lifecycle: CampaignLifecycle) => {
      await wait(PROMO_SAVE_DELAY_MS);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, lifecycle } : c)));
      const detail: Record<CampaignLifecycle, Localized> = {
        live: { fr: "Campagne réactivée", en: "Campaign resumed" },
        paused: { fr: "Campagne mise en pause", en: "Campaign paused" },
        archived: { fr: "Campagne archivée", en: "Campaign archived" },
        draft: { fr: "Repassée en brouillon", en: "Moved back to draft" },
      };
      logCampaign(id, lifecycle === "paused" ? "paused" : lifecycle === "archived" ? "archived" : "edited", detail[lifecycle]);
    },
    [logCampaign],
  );

  const duplicateCampaign = useCallback(
    async (id: string) => {
      await wait(PROMO_SAVE_DELAY_MS);
      const source = campaigns.find((c) => c.id === id);
      if (!source) return undefined;
      const copy: Campaign = {
        ...structuredClone(source),
        id: newPromotionId(source.name),
        name: `${source.name} (copy)`,
        lifecycle: "draft",
        createdAt: PROMO_NOW,
        updatedAt: PROMO_NOW,
        activity: [
          {
            id: nextId("act"),
            at: PROMO_NOW,
            actor,
            kind: "created",
            detail: { fr: `Dupliquée depuis « ${source.name} »`, en: `Duplicated from “${source.name}”` },
          },
        ],
      };
      setCampaigns((prev) => [copy, ...prev]);
      return copy;
    },
    [actor, campaigns],
  );

  const addCampaignProducts = useCallback(
    async (id: string, productIds: string[]) => {
      await wait(PROMO_SAVE_DELAY_MS);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, productIds: Array.from(new Set([...c.productIds, ...productIds])) } : c)),
      );
      logCampaign(id, "productsAdded", {
        fr: `${productIds.length} produit${productIds.length > 1 ? "s" : ""} ajouté${productIds.length > 1 ? "s" : ""}`,
        en: `${productIds.length} product${productIds.length > 1 ? "s" : ""} added`,
      });
    },
    [logCampaign],
  );

  /* Gift cards ------------------------------------------------------------ */

  const appendLedger = useCallback(
    (code: string, entry: Omit<GiftCardTransaction, "id" | "at" | "actor">, patch: Partial<GiftCard> = {}) => {
      setGiftCards((prev) =>
        prev.map((c) =>
          c.code === code
            ? { ...c, ...patch, ledger: [...c.ledger, { id: nextId("tx"), at: PROMO_NOW, actor, ...entry }] }
            : c,
        ),
      );
    },
    [actor],
  );

  const resendGiftCard = useCallback(
    async (code: string, email?: string) => {
      await wait(PROMO_SAVE_DELAY_MS);
      appendLedger(
        code,
        { kind: "resend", amountCents: 0, note: email ? `→ ${email}` : undefined },
        { delivery: "delivered", ...(email ? { recipientEmail: email } : {}) },
      );
    },
    [appendLedger],
  );

  const adjustGiftCard = useCallback(
    async (code: string, deltaCents: number, note: string) => {
      await wait(PROMO_SAVE_DELAY_MS);
      appendLedger(code, { kind: "adjustment", amountCents: deltaCents, note });
    },
    [appendLedger],
  );

  const cancelGiftCard = useCallback(
    async (code: string, note: string) => {
      await wait(PROMO_SAVE_DELAY_MS);
      const card = giftCards.find((c) => c.code === code);
      const balance = card ? card.ledger.reduce((s, t) => s + t.amountCents, 0) : 0;
      appendLedger(code, { kind: "cancellation", amountCents: -balance, note }, { cancelled: true });
    },
    [appendLedger, giftCards],
  );

  const extendGiftCard = useCallback(
    async (code: string, expiresAt: string) => {
      await wait(PROMO_SAVE_DELAY_MS);
      appendLedger(code, { kind: "extension", amountCents: 0, note: expiresAt }, { expiresAt });
    },
    [appendLedger],
  );

  const saveConfig = useCallback(async (next: GiftCardProductConfig) => {
    await wait(PROMO_SAVE_DELAY_MS);
    setConfig(next);
  }, []);

  /* Lookups --------------------------------------------------------------- */

  const getPromotion = useCallback((id: string) => visiblePromotions.find((p) => p.id === id), [visiblePromotions]);
  const getCampaign = useCallback((id: string) => visibleCampaigns.find((c) => c.id === id), [visibleCampaigns]);
  const getGiftCard = useCallback(
    (code: string) => visibleCards.find((c) => c.code.toLowerCase() === code.toLowerCase()),
    [visibleCards],
  );
  const campaignName = useCallback(
    (id: string | null) => (id ? (campaigns.find((c) => c.id === id)?.name ?? "") : ""),
    [campaigns],
  );

  const value = useMemo<PromotionsValue>(
    () => ({
      promotions: visiblePromotions,
      campaigns: visibleCampaigns,
      giftCards: visibleCards,
      config,
      loading,
      demoMode,
      setDemoMode,
      getPromotion,
      getCampaign,
      getGiftCard,
      campaignName,
      savePromotion,
      setPromotionLifecycle,
      duplicatePromotions,
      assignCampaign,
      saveCampaign,
      setCampaignLifecycle,
      duplicateCampaign,
      addCampaignProducts,
      resendGiftCard,
      adjustGiftCard,
      cancelGiftCard,
      extendGiftCard,
      saveConfig,
    }),
    [
      visiblePromotions,
      visibleCampaigns,
      visibleCards,
      config,
      loading,
      demoMode,
      getPromotion,
      getCampaign,
      getGiftCard,
      campaignName,
      savePromotion,
      setPromotionLifecycle,
      duplicatePromotions,
      assignCampaign,
      saveCampaign,
      setCampaignLifecycle,
      duplicateCampaign,
      addCampaignProducts,
      resendGiftCard,
      adjustGiftCard,
      cancelGiftCard,
      extendGiftCard,
      saveConfig,
    ],
  );

  return <PromotionsContext.Provider value={value}>{children}</PromotionsContext.Provider>;
}

export function usePromotions() {
  const ctx = useContext(PromotionsContext);
  if (!ctx) throw new Error("usePromotions must be used within PromotionsProvider");
  return ctx;
}
