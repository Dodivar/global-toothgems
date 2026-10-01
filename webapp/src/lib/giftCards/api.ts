import { requireSupabase } from "../supabase/client";
import {
  mapLedger,
  mapOverviewRow,
  mapSettingsRow,
  minorToDecimal,
  settingsUpdate,
  writeErrorOf,
  type AdminGiftCard,
  type GiftCardConfig,
  type GiftCardTransaction,
  type GiftCardWriteError,
} from "./giftCardMapping";

/**
 * The gift card domain's single persistence boundary (screens never call
 * Supabase). Live mode only: callers check `isSupabaseConfigured`.
 *
 * - Storefront: `gift_card_settings` (visitors read it only once published)
 *   and the gift card product's name and description.
 * - Back office, under the staff member's own JWT: `gift_card_overview`
 *   (every active staff member reads it, code_last4 only), the ledger, and the
 *   staff functions `issue_gift_card`, `adjust_gift_card`, `extend_gift_card`,
 *   `cancel_gift_card` (manage_promotions, checked in the database). Settings
 *   are written by RLS (manage_promotions). Nothing here can read a code.
 */

export interface GiftCardProductText {
  name: string;
  description: string;
}

export interface StorefrontGiftCard {
  /** Null when the shop has not published the gift card (or it cannot be sold). */
  config: GiftCardConfig | null;
  product: GiftCardProductText | null;
}

export async function fetchStorefrontGiftCard(locale: "fr" | "en"): Promise<StorefrontGiftCard> {
  const client = requireSupabase();
  const settings = await client.from("gift_card_settings").select("*").maybeSingle();
  if (settings.error) throw new Error(settings.error.message);
  if (!settings.data || !settings.data.is_published || !settings.data.product_id) return { config: null, product: null };
  const config = mapSettingsRow(settings.data);
  const productId = settings.data.product_id;
  const [product, translation] = await Promise.all([
    client.from("products").select("name, short_description, description").eq("id", productId).maybeSingle(),
    locale === "fr"
      ? Promise.resolve({ data: null, error: null })
      : client
          .from("product_translations")
          .select("name, short_description, description")
          .eq("product_id", productId)
          .eq("locale", locale)
          .eq("status", "published")
          .maybeSingle(),
  ]);
  if (product.error) throw new Error(product.error.message);
  // A product the visitor cannot read (archived) cannot be bought either.
  if (!product.data) return { config: null, product: null };
  const text = translation.data ?? product.data;
  return {
    config,
    product: { name: text.name, description: text.description || text.short_description || "" },
  };
}

/* -------------------------------------------------------------------------- */
/* Back office                                                                 */
/* -------------------------------------------------------------------------- */

async function orderNumbers(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await requireSupabase().from("orders").select("id, order_number").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map(data.map((row) => [row.id, row.order_number]));
}

export interface AdminGiftCardsSnapshot {
  cards: AdminGiftCard[];
  settings: GiftCardConfig | null;
  /** From `my_permissions()`: decides what the screens offer, not what the database allows. */
  canManage: boolean;
}

export async function fetchAdminGiftCards(): Promise<AdminGiftCardsSnapshot> {
  const client = requireSupabase();
  const [overview, settings, permissions] = await Promise.all([
    client.from("gift_card_overview").select("*").order("created_at", { ascending: false }).limit(1000),
    client.from("gift_card_settings").select("*").maybeSingle(),
    client.rpc("my_permissions"),
  ]);
  for (const result of [overview, settings, permissions]) if (result.error) throw new Error(result.error.message);
  const rows = overview.data ?? [];
  const numbers = await orderNumbers(rows.map((row) => row.order_id));
  return {
    cards: rows.map((row) => mapOverviewRow(row, numbers)).filter((card): card is AdminGiftCard => card !== null),
    settings: settings.data ? mapSettingsRow(settings.data) : null,
    canManage: (permissions.data ?? []).includes("manage_promotions"),
  };
}

export interface GiftCardDetail {
  card: AdminGiftCard;
  message: string | null;
  ledger: GiftCardTransaction[];
}

/** One card with its message and ledger; null when it does not exist (or is not readable). */
export async function fetchGiftCardDetail(id: string): Promise<GiftCardDetail | null> {
  const client = requireSupabase();
  const [overview, card, ledger] = await Promise.all([
    client.from("gift_card_overview").select("*").eq("id", id).maybeSingle(),
    client.from("gift_cards").select("message").eq("id", id).maybeSingle(),
    client
      .from("gift_card_transactions")
      .select("id, kind, amount, balance_after, created_at, actor_id, order_id, note")
      .eq("gift_card_id", id)
      .order("created_at")
      .order("id"),
  ]);
  for (const result of [overview, card, ledger]) if (result.error) throw new Error(result.error.message);
  if (!overview.data) return null;
  const rows = ledger.data ?? [];
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((a): a is string => Boolean(a)))];
  const [numbers, actors] = await Promise.all([
    orderNumbers([overview.data.order_id, ...rows.map((row) => row.order_id)]),
    actorIds.length
      ? client.from("profiles").select("id, first_name, last_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[], error: null }),
  ]);
  if (actors.error) throw new Error(actors.error.message);
  const names = new Map(
    (actors.data ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || ""]),
  );
  const mapped = mapOverviewRow(overview.data, numbers);
  if (!mapped) return null;
  return { card: mapped, message: card.data?.message ?? null, ledger: mapLedger(rows, names, numbers) };
}

export type WriteResult<T = void> = { ok: true; value: T } | { ok: false; error: GiftCardWriteError };

function failed(error: { code?: string; message?: string }): { ok: false; error: GiftCardWriteError } {
  console.error("[gift cards]", error.code, error.message);
  return { ok: false, error: writeErrorOf(error) };
}

// `numeric` arguments receive exact decimal strings; the generated types call them `number`.
const decimal = (minor: number) => minorToDecimal(minor) as unknown as number;

export interface IssueDraft {
  amountMinor: number;
  recipientEmail: string;
  recipientName: string;
  message: string;
  /** End of the chosen day, ISO; null = the shop's default validity. */
  expiresAt: string | null;
  note: string;
}

export async function issueGiftCard(draft: IssueDraft): Promise<WriteResult<string>> {
  const { data, error } = await requireSupabase().rpc("issue_gift_card", {
    p_amount: decimal(draft.amountMinor),
    p_recipient_email: draft.recipientEmail.trim(),
    p_recipient_name: draft.recipientName.trim() || undefined,
    p_message: draft.message.trim() || undefined,
    p_expires_at: draft.expiresAt ?? undefined,
    p_note: draft.note.trim() || undefined,
  });
  return error ? failed(error) : { ok: true, value: data };
}

export async function adjustGiftCard(id: string, deltaMinor: number, note: string): Promise<WriteResult> {
  const { error } = await requireSupabase().rpc("adjust_gift_card", {
    p_gift_card_id: id,
    p_delta: decimal(deltaMinor),
    p_note: note.trim(),
  });
  return error ? failed(error) : { ok: true, value: undefined };
}

export async function extendGiftCard(id: string, expiresAt: string, note: string): Promise<WriteResult> {
  const { error } = await requireSupabase().rpc("extend_gift_card", {
    p_gift_card_id: id,
    p_expires_at: expiresAt,
    p_note: note.trim() || undefined,
  });
  return error ? failed(error) : { ok: true, value: undefined };
}

export async function cancelGiftCard(id: string, note: string): Promise<WriteResult> {
  const { error } = await requireSupabase().rpc("cancel_gift_card", { p_gift_card_id: id, p_note: note.trim() });
  return error ? failed(error) : { ok: true, value: undefined };
}

/** RLS answers a refused update with zero rows: that is a refusal, never a success. */
export async function saveGiftCardSettings(config: GiftCardConfig): Promise<WriteResult<GiftCardConfig>> {
  const { data, error } = await requireSupabase()
    .from("gift_card_settings")
    .update(settingsUpdate(config))
    .eq("id", true)
    .select("*");
  if (error) return failed(error);
  if (!data || data.length === 0) return { ok: false, error: "forbidden" };
  return { ok: true, value: mapSettingsRow(data[0]) };
}
