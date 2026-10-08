import { requireSupabase } from "./supabase/client";
import type { Campaign, CampaignLifecycle, Collection, Promotion, PromotionLifecycle, Segment } from "../data/adminPromotions";
import {
  CAMPAIGN_SELECT,
  COLLECTION_SELECT,
  PROMOTION_SELECT,
  campaignPayload,
  classifyWriteError,
  dailySeries,
  mapCampaign,
  mapCollection,
  mapPromotion,
  mapSegment,
  promotionPayload,
  type CampaignRow,
  type CollectionRow,
  type PromotionRow,
  type PromotionWriteError,
} from "./promotionMapping";

/**
 * The Promotions workspace's single persistence boundary (screens never call
 * Supabase). Live mode only: callers check `isSupabaseConfigured`.
 *
 * Everything runs under the staff member's own JWT: reads by row-level
 * security (every active staff member), writes by `manage_promotions` — the
 * two `admin_save_*` functions store a promotion or a campaign with everything
 * around it in one transaction; lifecycle changes and campaign links are plain
 * updates the table policies and the `validate_promotion` trigger check. A
 * refusal is returned, never thrown, for the screen to word.
 */

export type WriteResult<T = void> = { ok: true; value: T } | { ok: false; error: PromotionWriteError };

export interface PromotionsSnapshot {
  promotions: Promotion[];
  campaigns: Campaign[];
  collections: Collection[];
  segments: Segment[];
  /** From `my_permissions()`: decides what the screens offer, not what the database allows. */
  canManage: boolean;
}

/** Today in the shop's time zone (`YYYY-MM-DD`), the last day of the daily series. */
const shopToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

export async function fetchPromotionsWorkspace(): Promise<PromotionsSnapshot> {
  const client = requireSupabase();
  const [promotions, overview, daily, campaigns, collections, segments, permissions] = await Promise.all([
    client.from("promotions").select(PROMOTION_SELECT).order("created_at", { ascending: false }).limit(1000),
    client.from("promotion_overview").select("id, orders, revenue_amount, discount_amount"),
    client.from("promotion_daily_usage").select("promotion_id, day, uses"),
    client.from("campaigns").select(CAMPAIGN_SELECT).order("starts_at", { ascending: false }).limit(500),
    client.from("collections").select(COLLECTION_SELECT).eq("is_active", true).order("position"),
    client.from("customer_segment_overview").select("id, name, size").eq("is_active", true).order("name"),
    client.rpc("my_permissions"),
  ]);
  for (const result of [promotions, overview, daily, campaigns, collections, segments, permissions]) {
    if (result.error) throw new Error(result.error.message);
  }
  const overviewById = new Map((overview.data ?? []).filter((row) => row.id).map((row) => [row.id as string, row]));
  const today = shopToday();
  const dailyById = new Map<string, { day: string | null; uses: number | null }[]>();
  for (const row of daily.data ?? []) {
    if (!row.promotion_id) continue;
    dailyById.set(row.promotion_id, [...(dailyById.get(row.promotion_id) ?? []), row]);
  }
  return {
    promotions: ((promotions.data ?? []) as unknown as PromotionRow[])
      .map((row) => mapPromotion(row, overviewById.get(row.id), dailySeries(dailyById.get(row.id) ?? [], today)))
      .filter((p): p is Promotion => p !== null),
    campaigns: ((campaigns.data ?? []) as unknown as CampaignRow[]).map(mapCampaign),
    collections: ((collections.data ?? []) as unknown as CollectionRow[]).map(mapCollection),
    segments: (segments.data ?? []).map(mapSegment).filter((s): s is Segment => s !== null),
    canManage: (permissions.data ?? []).includes("manage_promotions"),
  };
}

const refused = (error: { code?: string; message?: string; details?: string }): { ok: false; error: PromotionWriteError } => {
  console.error("[promotions] write refused", error.code, error.message);
  return { ok: false, error: classifyWriteError(error) };
};

export async function savePromotionRow(promotion: Promotion): Promise<WriteResult<string>> {
  const { data, error } = await requireSupabase().rpc("admin_save_promotion", { p: promotionPayload(promotion) });
  if (error) return refused(error);
  return { ok: true, value: data };
}

export async function saveCampaignRow(campaign: Campaign): Promise<WriteResult<string>> {
  const { data, error } = await requireSupabase().rpc("admin_save_campaign", { p: campaignPayload(campaign) });
  if (error) return refused(error);
  return { ok: true, value: data };
}

/** One statement: either every promotion changes or none does (publishing is checked per row by the database). */
export async function setPromotionsLifecycle(ids: string[], lifecycle: PromotionLifecycle): Promise<WriteResult> {
  const { error } = await requireSupabase().from("promotions").update({ lifecycle }).in("id", ids);
  return error ? refused(error) : { ok: true, value: undefined };
}

export async function setPromotionsCampaign(ids: string[], campaignId: string | null): Promise<WriteResult> {
  const { error } = await requireSupabase().from("promotions").update({ campaign_id: campaignId }).in("id", ids);
  return error ? refused(error) : { ok: true, value: undefined };
}

export async function setCampaignLifecycleRow(id: string, lifecycle: CampaignLifecycle): Promise<WriteResult> {
  const { error } = await requireSupabase().from("campaigns").update({ lifecycle }).eq("id", id);
  return error ? refused(error) : { ok: true, value: undefined };
}

/** Appends products after the campaign's current ones (already-linked products are left where they are). */
export async function addCampaignProductRows(campaignId: string, current: string[], productIds: string[]): Promise<WriteResult> {
  const fresh = productIds.filter((id) => !current.includes(id));
  if (fresh.length === 0) return { ok: true, value: undefined };
  const { error } = await requireSupabase()
    .from("campaign_products")
    .upsert(
      fresh.map((product_id, i) => ({ campaign_id: campaignId, product_id, position: current.length + i })),
      { onConflict: "campaign_id,product_id", ignoreDuplicates: true },
    );
  return error ? refused(error) : { ok: true, value: undefined };
}

/** The active options of a product (`product_variants`), for the "gift with purchase" choice. */
export async function fetchProductVariants(productId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await requireSupabase()
    .from("product_variants")
    .select("id, name, position")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({ id: v.id, name: v.name ?? "—" }));
}

/** The codes of a promotion (staff only: row-level security hides them from everyone else), for the CSV export of unique codes. */
export async function fetchPromotionCodes(promotionId: string): Promise<{ code: string; active: boolean }[]> {
  const { data, error } = await requireSupabase()
    .from("promotion_codes")
    .select("code, is_active")
    .eq("promotion_id", promotionId)
    .order("created_at")
    .limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ code: row.code, active: row.is_active }));
}
