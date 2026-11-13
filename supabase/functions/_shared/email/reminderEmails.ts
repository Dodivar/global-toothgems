/**
 * Automatic reminder e-mails (decision 141), swept by `send-pending-emails`:
 *
 *   abandoned_cart   abandoned_cart:<order id>   a payment abandoned 3 hours ago, only
 *                                                with marketing consent (SQL decides)
 *   review_request   review_request:<order id>   a member's order delivered 5 days ago,
 *                                                with the delivered products not reviewed yet
 *   loyalty_reward   loyalty_reward:<card id>    a full loyalty card unused for 7 days
 *
 * Who gets one, and when, is decided in SQL (`pending_*_emails()`, switches in
 * private.email_reminder_settings); sending is exactly-once through the email_log
 * claim. Every reminder carries the address's "stop these reminders" link
 * (`email_reminder_token()` → /rappels/desinscription?token=…) in the footer and in
 * a List-Unsubscribe header. No price is shown: the order's snapshot may be stale
 * (decision 129); the product pages say the current price.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type Block, paragraph, productCard, textLink } from "./components.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";
import { type EmailDeps, sendTemplatedEmail, type SendResult } from "./send.ts";
import { productImageUrl, productPageUrl } from "./stockContent.ts";

export interface ReminderItem {
  name: string;
  /** The option bought (colour, size…), when the product sells options. */
  variant?: string | null;
  /** The product's address key in the e-mail's language. */
  slug: string;
  /** Object path in the public `product-media` bucket, or null. */
  imagePath: string | null;
}

interface OrderReminder {
  orderId: string;
  orderNumber: string;
  email: string;
  locale: string;
  firstName: string;
  items: ReminderItem[];
}

export type PendingAbandonedCart = OrderReminder;
export type PendingReviewRequest = OrderReminder;

export interface PendingLoyaltyReward {
  cardId: string;
  userId: string;
  email: string;
  locale: string;
  firstName: string;
  rewardPercent: number;
}

export interface ReminderSource {
  abandonedCarts(limit: number): Promise<PendingAbandonedCart[]>;
  reviewRequests(limit: number): Promise<PendingReviewRequest[]>;
  loyaltyRewards(limit: number): Promise<PendingLoyaltyReward[]>;
  /** The address's opt-out token (created on first use). */
  unsubscribeToken(email: string): Promise<string>;
}

export interface ReminderReport {
  examined: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface ReminderSweepReport {
  abandonedCart: ReminderReport;
  reviewRequest: ReminderReport;
  loyaltyReward: ReminderReport;
}

const LABELS = {
  fr: {
    cartEyebrow: "Votre panier",
    cartAction: "Revenir à la boutique",
    viewProduct: "Voir le produit",
    cartOnce: "Ce rappel est unique : nous ne vous écrirons plus au sujet de cette commande.",
    reviewEyebrow: "Votre avis",
    reviewAction: "Donner mon avis",
    reviewProduct: "Noter ce produit",
    reviewOnce: "Nous ne vous écrirons plus au sujet de cette commande.",
    loyaltyEyebrow: "Club fidélité",
    loyaltyAction: "Utiliser ma récompense",
    loyaltyCard: "Voir ma carte de fidélité",
  },
  en: {
    cartEyebrow: "Your cart",
    cartAction: "Back to the shop",
    viewProduct: "View the product",
    cartOnce: "This is a one-off reminder: we will not write to you about this order again.",
    reviewEyebrow: "Your review",
    reviewAction: "Write my review",
    reviewProduct: "Rate this product",
    reviewOnce: "We will not write to you about this order again.",
    loyaltyEyebrow: "Loyalty Club",
    loyaltyAction: "Use my reward",
    loyaltyCard: "See my loyalty card",
  },
} as const;

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The opt-out page; the click there (not the visit) stops the reminders. */
export function reminderUnsubscribeUrl(siteUrl: string, token: string): string {
  return `${trimSlash(siteUrl)}/rappels/desinscription?token=${encodeURIComponent(token)}`;
}

/** The cart page in the e-mail's language. */
export function cartUrl(siteUrl: string, locale: string): string {
  const lang = chromeLocale(locale);
  return `${trimSlash(siteUrl)}/${lang}/${lang === "fr" ? "panier" : "cart"}`;
}

function itemBlocks(items: ReminderItem[], locale: string, siteUrl: string, mediaBaseUrl: string | undefined, linkLabel: string, anchor = ""): Block[] {
  return items.map((item) => {
    const name = item.variant ? `${item.name} — ${item.variant}` : item.name;
    const link = { label: linkLabel, url: `${productPageUrl(siteUrl, locale, item.slug)}${anchor}` };
    const imageUrl = productImageUrl(mediaBaseUrl, item.imagePath);
    return imageUrl ? productCard({ imageUrl, imageAlt: name, name, link }) : textLink({ label: `${name} — ${linkLabel}`, url: link.url });
  });
}

export function abandonedCartContent(
  cart: Pick<PendingAbandonedCart, "items">,
  locale: string,
  siteUrl: string,
  mediaBaseUrl: string | undefined,
  unsubscribeUrl: string,
): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  return {
    eyebrow: l.cartEyebrow,
    primaryAction: { label: l.cartAction, url: cartUrl(siteUrl, locale) },
    blocks: [...itemBlocks(cart.items, locale, siteUrl, mediaBaseUrl, l.viewProduct), paragraph(l.cartOnce)],
    unsubscribeUrl,
  };
}

/** Each product links to its page's reviews (#avis), where a verified buyer writes one. */
export function reviewRequestContent(
  request: Pick<PendingReviewRequest, "items">,
  locale: string,
  siteUrl: string,
  mediaBaseUrl: string | undefined,
  unsubscribeUrl: string,
): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  const first = request.items[0];
  return {
    eyebrow: l.reviewEyebrow,
    ...(first ? { primaryAction: { label: l.reviewAction, url: `${productPageUrl(siteUrl, locale, first.slug)}#avis` } } : {}),
    blocks: [...itemBlocks(request.items, locale, siteUrl, mediaBaseUrl, l.reviewProduct, "#avis"), paragraph(l.reviewOnce)],
    unsubscribeUrl,
  };
}

export function loyaltyRewardContent(locale: string, siteUrl: string, unsubscribeUrl: string): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  return {
    eyebrow: l.loyaltyEyebrow,
    primaryAction: { label: l.loyaltyAction, url: cartUrl(siteUrl, locale) },
    blocks: [textLink({ label: l.loyaltyCard, url: `${trimSlash(siteUrl)}/compte/fidelite` })],
    unsubscribeUrl,
  };
}

type Log = (message: string, detail?: unknown) => void;

const emptyReport = (): ReminderReport => ({ examined: 0, sent: 0, skipped: 0, failed: 0 });

async function sendEach<T extends { email: string }>(
  rows: T[],
  what: string,
  idOf: (row: T) => string,
  send: (row: T, unsubscribeUrl: string) => Promise<SendResult>,
  source: ReminderSource,
  siteUrl: string,
  log: Log,
): Promise<ReminderReport> {
  const report = emptyReport();
  for (const row of rows) {
    report.examined++;
    try {
      const token = await source.unsubscribeToken(row.email);
      const result = await send(row, reminderUnsubscribeUrl(siteUrl, token));
      if (result.status === "sent") report.sent++;
      else if (result.status === "failed") {
        log(`${what} e-mail failed`, { id: idOf(row), error: result.error, retryable: result.retryable });
        report.failed++;
      } else {
        if (result.status !== "duplicate") log(`${what} e-mail ${result.status}`, { id: idOf(row) });
        report.skipped++;
      }
    } catch (error) {
      log(`${what} e-mail crashed`, { id: idOf(row), error: error instanceof Error ? error.message : error });
      report.failed++;
    }
  }
  return report;
}

const unsubscribeHeaders = (url: string) => ({ "List-Unsubscribe": `<${url}>` });

export function sendAbandonedCartEmails(
  deps: EmailDeps,
  source: ReminderSource,
  options: { limit?: number; log?: Log; mediaBaseUrl?: string } = {},
): Promise<ReminderReport> {
  const log = options.log ?? (() => {});
  const site = deps.layout.siteUrl;
  return source.abandonedCarts(options.limit ?? 25).then((rows) =>
    sendEach(rows, "abandoned cart", (r) => r.orderId, (cart, unsubscribeUrl) =>
      sendTemplatedEmail(deps, {
        templateKey: "abandoned_cart",
        to: cart.email,
        locale: cart.locale,
        variables: { first_name: cart.firstName },
        eventKey: `abandoned_cart:${cart.orderId}`,
        orderId: cart.orderId,
        headers: unsubscribeHeaders(unsubscribeUrl),
        content: (locale) => abandonedCartContent(cart, locale, site, options.mediaBaseUrl, unsubscribeUrl),
      }), source, site, log)
  );
}

export function sendReviewRequestEmails(
  deps: EmailDeps,
  source: ReminderSource,
  options: { limit?: number; log?: Log; mediaBaseUrl?: string } = {},
): Promise<ReminderReport> {
  const log = options.log ?? (() => {});
  const site = deps.layout.siteUrl;
  return source.reviewRequests(options.limit ?? 25).then((rows) =>
    sendEach(rows, "review request", (r) => r.orderId, (request, unsubscribeUrl) =>
      sendTemplatedEmail(deps, {
        templateKey: "review_request",
        to: request.email,
        locale: request.locale,
        variables: { first_name: request.firstName, order_number: request.orderNumber },
        eventKey: `review_request:${request.orderId}`,
        orderId: request.orderId,
        headers: unsubscribeHeaders(unsubscribeUrl),
        content: (locale) => reviewRequestContent(request, locale, site, options.mediaBaseUrl, unsubscribeUrl),
      }), source, site, log)
  );
}

export function sendLoyaltyRewardEmails(
  deps: EmailDeps,
  source: ReminderSource,
  options: { limit?: number; log?: Log } = {},
): Promise<ReminderReport> {
  const log = options.log ?? (() => {});
  const site = deps.layout.siteUrl;
  return source.loyaltyRewards(options.limit ?? 25).then((rows) =>
    sendEach(rows, "loyalty reward", (r) => r.cardId, (reward, unsubscribeUrl) =>
      sendTemplatedEmail(deps, {
        templateKey: "loyalty_reward",
        to: reward.email,
        locale: reward.locale,
        variables: { first_name: reward.firstName, reward_percent: String(reward.rewardPercent) },
        eventKey: `loyalty_reward:${reward.cardId}`,
        headers: unsubscribeHeaders(unsubscribeUrl),
        content: (locale) => loyaltyRewardContent(locale, site, unsubscribeUrl),
      }), source, site, log)
  );
}

/** The three sweeps; one failing (a database error, say) does not stop the others. */
export async function sendReminderEmails(
  deps: EmailDeps,
  source: ReminderSource,
  options: { limit?: number; log?: Log; mediaBaseUrl?: string } = {},
): Promise<ReminderSweepReport> {
  const log = options.log ?? (() => {});
  const guard = async (what: string, run: () => Promise<ReminderReport>): Promise<ReminderReport> => {
    try {
      return await run();
    } catch (error) {
      log(`${what} sweep failed`, error instanceof Error ? error.message : error);
      return { ...emptyReport(), failed: 1 };
    }
  };
  return {
    abandonedCart: await guard("abandoned cart", () => sendAbandonedCartEmails(deps, source, { ...options, log })),
    reviewRequest: await guard("review request", () => sendReviewRequestEmails(deps, source, { ...options, log })),
    loyaltyReward: await guard("loyalty reward", () => sendLoyaltyRewardEmails(deps, source, { ...options, log })),
  };
}

function mapItems(value: unknown): ReminderItem[] {
  if (!Array.isArray(value)) return [];
  return (value as Record<string, unknown>[])
    .filter((item) => typeof item?.slug === "string" && typeof item?.name === "string")
    .map((item) => ({
      name: String(item.name),
      variant: typeof item.variant === "string" && item.variant ? item.variant : null,
      slug: String(item.slug),
      imagePath: typeof item.image_path === "string" && item.image_path ? item.image_path : null,
    }));
}

export function supabaseReminderSource(db: SupabaseClient): ReminderSource {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(`${name} failed: ${error.message}`);
    return (data ?? []) as T[];
  }
  type OrderRow = { order_id: string; order_number: string; email: string; locale: string; first_name: string; items: unknown };
  const order = (row: OrderRow): OrderReminder => ({
    orderId: row.order_id,
    orderNumber: row.order_number,
    email: row.email,
    locale: row.locale,
    firstName: row.first_name ?? "",
    items: mapItems(row.items),
  });
  return {
    async abandonedCarts(limit) {
      return (await rpc<OrderRow>("pending_abandoned_cart_emails", { p_limit: limit })).map(order).filter((r) => r.items.length > 0);
    },
    async reviewRequests(limit) {
      return (await rpc<OrderRow>("pending_review_request_emails", { p_limit: limit })).map(order).filter((r) => r.items.length > 0);
    },
    async loyaltyRewards(limit) {
      const rows = await rpc<{ card_id: string; user_id: string; email: string; locale: string; first_name: string; reward_percent: number }>(
        "pending_loyalty_reward_emails",
        { p_limit: limit },
      );
      return rows.map((row) => ({
        cardId: row.card_id,
        userId: row.user_id,
        email: row.email,
        locale: row.locale,
        firstName: row.first_name ?? "",
        rewardPercent: Number(row.reward_percent),
      }));
    },
    async unsubscribeToken(email) {
      const { data, error } = await db.rpc("email_reminder_token", { p_email: email });
      if (error || typeof data !== "string") throw new Error(`email_reminder_token failed: ${error?.message ?? "no token"}`);
      return data;
    },
  };
}
