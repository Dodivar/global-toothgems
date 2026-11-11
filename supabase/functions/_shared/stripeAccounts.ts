/**
 * Two businesses, two Stripe accounts (decision 135).
 *
 *   - `studio`: the 3D Studio subscriptions, sold and collected by the website
 *     publisher (DoDigital). Its keys are the original `STRIPE_*` secrets: the
 *     account configured since the start is DoDigital's.
 *   - `shop`: the shop, the Academy and gift cards, sold by the seller
 *     (PIMP TON SMILE), on its own account: `SHOP_STRIPE_*`.
 *
 * Until the seller's account exists the shop falls back to the Studio's keys,
 * but only while they are TEST keys: with live keys and no `SHOP_STRIPE_*`, the
 * shop is not configured (its functions answer `not_configured`), so a launch
 * can never collect the shop's money on the publisher's account by omission.
 *
 * Pure (the environment is passed in), so `deno test` covers every case.
 */

export type StripeAccount = "shop" | "studio";

export type ReadEnv = (name: string) => string | undefined;

export class StripeAccountNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeAccountNotConfigured";
  }
}

const PREFIX: Record<StripeAccount, string> = { studio: "STRIPE_", shop: "SHOP_STRIPE_" };

function read(env: ReadEnv, name: string): string {
  return env(name)?.trim() ?? "";
}

/** "test" / "live" for a Stripe key (sk_, rk_, pk_), else null. */
export function keyMode(key: string): "test" | "live" | null {
  return (/^(?:pk|sk|rk)_(test|live)_/.exec(key)?.[1] as "test" | "live" | undefined) ?? null;
}

/**
 * Whether the shop runs on the Studio's account for now: no shop secret key of
 * its own and the Studio's key is a test key. Then both businesses' events
 * reach the same webhook endpoint, signed with the same secret.
 */
export function shopSharesStudioAccount(env: ReadEnv): boolean {
  return !read(env, "SHOP_STRIPE_SECRET_KEY") && keyMode(read(env, "STRIPE_SECRET_KEY")) === "test";
}

/** The prefix of the secrets an account's functions read now (the shop may borrow the Studio's). */
function prefixFor(env: ReadEnv, account: StripeAccount): string {
  if (account === "studio") return PREFIX.studio;
  if (read(env, "SHOP_STRIPE_SECRET_KEY")) return PREFIX.shop;
  if (shopSharesStudioAccount(env)) return PREFIX.studio;
  throw new StripeAccountNotConfigured(
    "SHOP_STRIPE_SECRET_KEY is not set: the shop's Stripe account (PIMP TON SMILE) is required with live keys",
  );
}

/** The secret key of an account; throws when it is not configured. */
export function stripeSecretKey(env: ReadEnv, account: StripeAccount): string {
  const key = read(env, `${prefixFor(env, account)}SECRET_KEY`);
  if (!key) throw new StripeAccountNotConfigured(`Missing ${prefixFor(env, account)}SECRET_KEY`);
  return key;
}

/**
 * The publishable key mounting the payment form for an account, or null. It must
 * belong to the same account and mode as the secret key (test with test, live
 * with live), otherwise Stripe.js cannot open what the function created.
 */
export function stripePublishableKey(env: ReadEnv, account: StripeAccount): string | null {
  let prefix: string;
  try {
    prefix = prefixFor(env, account);
  } catch {
    return null;
  }
  const publishable = read(env, `${prefix}PUBLISHABLE_KEY`);
  const secret = read(env, `${prefix}SECRET_KEY`);
  return publishable.startsWith("pk_") && keyMode(publishable) !== null && keyMode(publishable) === keyMode(secret)
    ? publishable
    : null;
}

/** One webhook signing secret and the businesses whose events it may carry. */
export interface WebhookEndpoint {
  secret: string;
  /** The account that signs with this secret. */
  account: StripeAccount;
  /** The businesses whose events this endpoint handles. */
  handles: ReadonlySet<StripeAccount>;
}

/**
 * The signing secrets `stripe-webhook` accepts. The Studio's endpoint
 * (`STRIPE_WEBHOOK_SECRET`) also carries the shop's events while the shop
 * shares its account; the shop's own endpoint (`SHOP_STRIPE_WEBHOOK_SECRET`)
 * carries only the shop's.
 */
export function webhookEndpoints(env: ReadEnv): WebhookEndpoint[] {
  const out: WebhookEndpoint[] = [];
  const studio = read(env, "STRIPE_WEBHOOK_SECRET");
  const shop = read(env, "SHOP_STRIPE_WEBHOOK_SECRET");
  if (studio) {
    out.push({
      secret: studio,
      account: "studio",
      handles: new Set<StripeAccount>(shopSharesStudioAccount(env) ? ["studio", "shop"] : ["studio"]),
    });
  }
  if (shop && read(env, "SHOP_STRIPE_SECRET_KEY")) {
    out.push({ secret: shop, account: "shop", handles: new Set<StripeAccount>(["shop"]) });
  }
  return out;
}
