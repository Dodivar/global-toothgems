/**
 * Automatic reminder e-mails (decision 142), swept by `send-pending-emails`:
 *
 *   abandoned_cart   abandoned_cart:<order id>   a payment abandoned 3 hours ago, only
 *                                                with marketing consent (SQL decides)
 *   review_request   review_request:<order id>   a member's order delivered 5 days ago,
 *                                                with the delivered products not reviewed yet
 *   loyalty_reward   loyalty_reward:<card id>    a full loyalty card unused for 7 days
 *   course_review_request  course_review_request:<completion id>
 *                                                a course completed 3 days ago and not
 *                                                reviewed yet (decision 141 addendum)
 *   favorite_promo   favorite_promo:<user id>:<hash>
 *                                                a favourite product just put on sale, only
 *                                                with marketing consent (SQL decides and
 *                                                names the key, decision 148); shows the
 *                                                database's own price, percentage and
 *                                                reference price
 *
 * Who gets one, and when, is decided in SQL (`pending_*_emails()`, switches in
 * private.email_reminder_settings); sending is exactly-once through the email_log
 * claim. Every reminder carries the address's "stop these reminders" link
 * (`email_reminder_token()` → /rappels/desinscription?token=…) in the footer and in
 * a List-Unsubscribe header. No price is shown: the order's snapshot may be stale
 * (decision 129); the product pages say the current price. The one exception is the
 * favourite promotion alert (decision 148), which quotes the database's current price,
 * reference price and percentage as the shop window does, with the Omnibus mention.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type Block, paragraph, productCard, textLink } from "./components.ts";
import { formatAmount } from "./format.ts";
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

export interface PendingCourseReviewRequest {
  completionId: string;
  courseId: string;
  email: string;
  locale: string;
  firstName: string;
  courseTitle: string;
  /** The course's address key in the e-mail's language. */
  courseSlug: string;
  /** Site path of the cover (`/media/formations/<id>?v=…`, the public pages' route), or null. */
  coverPath: string | null;
}

export interface FavoritePromoItem extends ReminderItem {
  productId: string;
  /** ISO date the reduction series started: with the product, the key of "already announced". */
  reductionStartedAt: string;
  currency: string;
  /** The price now, the lowest price of the 30 days before the reduction, and the percentage the database computed. */
  price: number;
  referencePrice: number;
  discountPercent: number;
}

export interface PendingFavoritePromo {
  userId: string;
  email: string;
  locale: string;
  firstName: string;
  items: FavoritePromoItem[];
  /** The email_log event key the database checked is still open. */
  eventKey: string;
}

export interface ReminderSource {
  abandonedCarts(limit: number): Promise<PendingAbandonedCart[]>;
  reviewRequests(limit: number): Promise<PendingReviewRequest[]>;
  loyaltyRewards(limit: number): Promise<PendingLoyaltyReward[]>;
  courseReviewRequests(limit: number): Promise<PendingCourseReviewRequest[]>;
  favoritePromos(limit: number): Promise<PendingFavoritePromo[]>;
  /** Marks the listed series as announced to the member (never again). */
  recordFavoritePromo(userId: string, items: FavoritePromoItem[]): Promise<void>;
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
  courseReviewRequest: ReminderReport;
  favoritePromo: ReminderReport;
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
    courseReviewEyebrow: "Votre avis sur la formation",
    courseReviewAction: "Donner mon avis",
    courseReviewOnce: "Nous ne vous écrirons plus au sujet de cette formation.",
    promoEyebrow: "Vos favoris",
    promoAction: "Voir mes favoris",
    promoView: "Voir le produit",
    promoReference: "Prix de référence (le plus bas des 30 jours précédant la réduction) : {price}",
    promoOnce: "Vous recevez cet e-mail au plus une fois par semaine, et jamais deux fois pour la même promotion.",
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
    courseReviewEyebrow: "Your review of the training",
    courseReviewAction: "Write my review",
    courseReviewOnce: "We will not write to you about this training again.",
    promoEyebrow: "Your favourites",
    promoAction: "See my favourites",
    promoView: "View the product",
    promoReference: "Reference price (lowest price of the 30 days before the reduction): {price}",
    promoOnce: "You get this e-mail at most once a week, and never twice for the same promotion.",
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

/** The shop's favourites view in the e-mail's language (`/fr/boutique?favoris=1`, `/en/shop?favoris=1`). */
export function favoritesUrl(siteUrl: string, locale: string): string {
  const lang = chromeLocale(locale);
  return `${trimSlash(siteUrl)}/${lang}/${lang === "fr" ? "boutique" : "shop"}?favoris=1`;
}

/**
 * One card per product on sale: the percentage the database computed, the price
 * now and the Omnibus reference price, exactly as the shop window shows them.
 */
export function favoritePromoContent(
  promo: Pick<PendingFavoritePromo, "items">,
  locale: string,
  siteUrl: string,
  mediaBaseUrl: string | undefined,
  unsubscribeUrl: string,
): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const blocks: Block[] = promo.items.map((item) => {
    const name = item.variant ? `${item.name} — ${item.variant}` : item.name;
    const link = { label: l.promoView, url: productPageUrl(siteUrl, locale, item.slug) };
    const price = formatAmount(item.price, item.currency, lang);
    const reference = l.promoReference.replace("{price}", formatAmount(item.referencePrice, item.currency, lang));
    const imageUrl = productImageUrl(mediaBaseUrl, item.imagePath);
    return imageUrl
      ? productCard({ imageUrl, imageAlt: name, name, price, description: reference, badge: { label: `-${item.discountPercent} %`, tone: "success" }, link })
      : textLink({ label: `${name} — -${item.discountPercent} % — ${price} (${reference}) — ${l.promoView}`, url: link.url });
  });
  return {
    eyebrow: l.promoEyebrow,
    primaryAction: { label: l.promoAction, url: favoritesUrl(siteUrl, locale) },
    blocks: [...blocks, paragraph(l.promoOnce)],
    unsubscribeUrl,
  };
}

/** A course's sales page in the e-mail's language (`localeRoutes.ts`: /fr/academy/formation, /en/academy/course). */
export function coursePageUrl(siteUrl: string, locale: string, slug: string): string {
  const lang = chromeLocale(locale);
  return `${trimSlash(siteUrl)}/${lang}/academy/${lang === "fr" ? "formation" : "course"}/${encodeURIComponent(slug)}`;
}

/** The course page's reviews (#avis), where a learner who finished the course writes one once signed in. */
export function courseReviewRequestContent(
  request: Pick<PendingCourseReviewRequest, "courseTitle" | "courseSlug" | "coverPath">,
  locale: string,
  siteUrl: string,
  unsubscribeUrl: string,
): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  const url = `${coursePageUrl(siteUrl, locale, request.courseSlug)}#avis`;
  const link = { label: l.courseReviewAction, url };
  const site = trimSlash(siteUrl);
  const card = site.startsWith("https://") && request.coverPath?.startsWith("/")
    ? productCard({ imageUrl: `${site}${request.coverPath}`, imageAlt: request.courseTitle, name: request.courseTitle, link })
    : textLink({ label: `${request.courseTitle} — ${l.courseReviewAction}`, url });
  return {
    eyebrow: l.courseReviewEyebrow,
    primaryAction: { label: l.courseReviewAction, url },
    blocks: [card, paragraph(l.courseReviewOnce)],
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
  /** Runs after an e-mail went out (or was already sent), never after a failure. */
  after?: (row: T) => Promise<void>,
): Promise<ReminderReport> {
  const report = emptyReport();
  for (const row of rows) {
    report.examined++;
    try {
      const token = await source.unsubscribeToken(row.email);
      const result = await send(row, reminderUnsubscribeUrl(siteUrl, token));
      if (after && (result.status === "sent" || result.status === "duplicate")) await after(row);
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

export function sendCourseReviewRequestEmails(
  deps: EmailDeps,
  source: ReminderSource,
  options: { limit?: number; log?: Log } = {},
): Promise<ReminderReport> {
  const log = options.log ?? (() => {});
  const site = deps.layout.siteUrl;
  return source.courseReviewRequests(options.limit ?? 25).then((rows) =>
    sendEach(rows, "course review request", (r) => r.completionId, (request, unsubscribeUrl) =>
      sendTemplatedEmail(deps, {
        templateKey: "course_review_request",
        to: request.email,
        locale: request.locale,
        variables: { first_name: request.firstName, course_name: request.courseTitle },
        eventKey: `course_review_request:${request.completionId}`,
        headers: unsubscribeHeaders(unsubscribeUrl),
        content: (locale) => courseReviewRequestContent(request, locale, site, unsubscribeUrl),
      }), source, site, log)
  );
}

export function sendFavoritePromoEmails(
  deps: EmailDeps,
  source: ReminderSource,
  options: { limit?: number; log?: Log; mediaBaseUrl?: string } = {},
): Promise<ReminderReport> {
  const log = options.log ?? (() => {});
  const site = deps.layout.siteUrl;
  return source.favoritePromos(options.limit ?? 25).then((rows) =>
    sendEach(rows, "favorite promo", (r) => r.userId, (promo, unsubscribeUrl) =>
      sendTemplatedEmail(deps, {
        templateKey: "favorite_promo",
        to: promo.email,
        locale: promo.locale,
        variables: { first_name: promo.firstName },
        eventKey: promo.eventKey,
        headers: unsubscribeHeaders(unsubscribeUrl),
        content: (locale) => favoritePromoContent(promo, locale, site, options.mediaBaseUrl, unsubscribeUrl),
      }), source, site, log, (promo) => source.recordFavoritePromo(promo.userId, promo.items))
  );
}

/** The five sweeps; one failing (a database error, say) does not stop the others. */
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
    courseReviewRequest: await guard("course review request", () => sendCourseReviewRequestEmails(deps, source, { ...options, log })),
    favoritePromo: await guard("favorite promo", () => sendFavoritePromoEmails(deps, source, { ...options, log })),
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

function mapPromoItems(value: unknown): FavoritePromoItem[] {
  if (!Array.isArray(value)) return [];
  const out: FavoritePromoItem[] = [];
  for (const item of value as Record<string, unknown>[]) {
    const price = Number(item?.price);
    const referencePrice = Number(item?.reference_price);
    const discountPercent = Number(item?.discount_percent);
    if (
      typeof item?.slug !== "string" || typeof item?.name !== "string" || typeof item?.product_id !== "string" ||
      typeof item?.reduction_started_at !== "string" || typeof item?.currency !== "string" ||
      !Number.isFinite(price) || !Number.isFinite(referencePrice) || !Number.isFinite(discountPercent) ||
      discountPercent < 1 || referencePrice <= price
    ) continue;
    out.push({
      productId: item.product_id,
      reductionStartedAt: item.reduction_started_at,
      currency: item.currency,
      price,
      referencePrice,
      discountPercent,
      name: item.name,
      variant: typeof item.variant === "string" && item.variant ? item.variant : null,
      slug: item.slug,
      imagePath: typeof item.image_path === "string" && item.image_path ? item.image_path : null,
    });
  }
  return out;
}

/** Same address as webapp `coverSrc()` (publicCourseMapping.ts): the route serves published covers. */
export function coverPath(mediaId: string | null, updatedAt: string | null): string | null {
  if (!mediaId) return null;
  const version = updatedAt ? Date.parse(updatedAt) : NaN;
  return `/media/formations/${encodeURIComponent(mediaId)}${Number.isFinite(version) ? `?v=${version}` : ""}`;
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
    async courseReviewRequests(limit) {
      const rows = await rpc<{
        completion_id: string;
        course_id: string;
        email: string;
        locale: string;
        first_name: string;
        course_title: string;
        course_slug: string;
        cover_media_id: string | null;
        cover_updated_at: string | null;
      }>("pending_course_review_request_emails", { p_limit: limit });
      return rows
        .filter((row) => typeof row.course_slug === "string" && row.course_slug !== "")
        .map((row) => ({
          completionId: row.completion_id,
          courseId: row.course_id,
          email: row.email,
          locale: row.locale,
          firstName: row.first_name ?? "",
          courseTitle: row.course_title,
          courseSlug: row.course_slug,
          coverPath: coverPath(row.cover_media_id, row.cover_updated_at),
        }));
    },
    async favoritePromos(limit) {
      const rows = await rpc<{ user_id: string; email: string; locale: string; first_name: string; items: unknown; event_key: string }>(
        "pending_favorite_promo_emails",
        { p_limit: limit },
      );
      return rows
        .map((row) => ({
          userId: row.user_id,
          email: row.email,
          locale: row.locale,
          firstName: row.first_name ?? "",
          eventKey: row.event_key,
          items: mapPromoItems(row.items),
        }))
        .filter((row) => row.items.length > 0);
    },
    async recordFavoritePromo(userId, items) {
      const { error } = await db.rpc("record_favorite_promo_alerts", {
        p_user_id: userId,
        p_items: items.map((i) => ({ product_id: i.productId, reduction_started_at: i.reductionStartedAt })),
      });
      if (error) throw new Error(`record_favorite_promo_alerts failed: ${error.message}`);
    },
    async unsubscribeToken(email) {
      const { data, error } = await db.rpc("email_reminder_token", { p_email: email });
      if (error || typeof data !== "string") throw new Error(`email_reminder_token failed: ${error?.message ?? "no token"}`);
      return data;
    },
  };
}
