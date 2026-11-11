import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  shopSharesStudioAccount,
  StripeAccountNotConfigured,
  stripePublishableKey,
  stripeSecretKey,
  webhookEndpoints,
} from "./stripeAccounts.ts";

const env = (values: Record<string, string>) => (name: string) => values[name];

const STUDIO_TEST = { STRIPE_SECRET_KEY: "sk_test_studio", STRIPE_PUBLISHABLE_KEY: "pk_test_studio", STRIPE_WEBHOOK_SECRET: "whsec_studio" };
const STUDIO_LIVE = { STRIPE_SECRET_KEY: "sk_live_studio", STRIPE_PUBLISHABLE_KEY: "pk_live_studio", STRIPE_WEBHOOK_SECRET: "whsec_studio" };
const SHOP_LIVE = { SHOP_STRIPE_SECRET_KEY: "sk_live_shop", SHOP_STRIPE_PUBLISHABLE_KEY: "pk_live_shop", SHOP_STRIPE_WEBHOOK_SECRET: "whsec_shop" };

Deno.test("the Studio always reads the original STRIPE_* secrets", () => {
  const e = env({ ...STUDIO_LIVE, ...SHOP_LIVE });
  assertEquals(stripeSecretKey(e, "studio"), "sk_live_studio");
  assertEquals(stripePublishableKey(e, "studio"), "pk_live_studio");
});

Deno.test("the shop reads its own SHOP_STRIPE_* secrets once set", () => {
  const e = env({ ...STUDIO_LIVE, ...SHOP_LIVE });
  assertEquals(stripeSecretKey(e, "shop"), "sk_live_shop");
  assertEquals(stripePublishableKey(e, "shop"), "pk_live_shop");
  assertEquals(shopSharesStudioAccount(e), false);
});

Deno.test("without its own keys the shop borrows the Studio's TEST keys", () => {
  const e = env(STUDIO_TEST);
  assertEquals(shopSharesStudioAccount(e), true);
  assertEquals(stripeSecretKey(e, "shop"), "sk_test_studio");
  assertEquals(stripePublishableKey(e, "shop"), "pk_test_studio");
});

Deno.test("never the Studio's LIVE keys: the shop is then not configured", () => {
  const e = env(STUDIO_LIVE);
  assertEquals(shopSharesStudioAccount(e), false);
  assertThrows(() => stripeSecretKey(e, "shop"), StripeAccountNotConfigured);
  assertEquals(stripePublishableKey(e, "shop"), null);
  assertEquals(stripeSecretKey(e, "studio"), "sk_live_studio");
});

Deno.test("a publishable key of another mode counts as not configured", () => {
  const e = env({ ...STUDIO_LIVE, SHOP_STRIPE_SECRET_KEY: "sk_live_shop", SHOP_STRIPE_PUBLISHABLE_KEY: "pk_test_shop" });
  assertEquals(stripePublishableKey(e, "shop"), null);
});

Deno.test("webhook endpoints: one shared endpoint while the shop borrows the Studio's account", () => {
  const endpoints = webhookEndpoints(env(STUDIO_TEST));
  assertEquals(endpoints.length, 1);
  assertEquals(endpoints[0].account, "studio");
  assertEquals([...endpoints[0].handles].sort(), ["shop", "studio"]);
});

Deno.test("webhook endpoints: one per account once the shop has its own", () => {
  const endpoints = webhookEndpoints(env({ ...STUDIO_LIVE, ...SHOP_LIVE }));
  assertEquals(endpoints.map((e) => [e.account, [...e.handles]]), [["studio", ["studio"]], ["shop", ["shop"]]]);
});

Deno.test("webhook endpoints: a shop secret without the shop's key is not trusted", () => {
  const endpoints = webhookEndpoints(env({ ...STUDIO_TEST, SHOP_STRIPE_WEBHOOK_SECRET: "whsec_shop" }));
  assertEquals(endpoints.length, 1);
  assertEquals(endpoints[0].secret, "whsec_studio");
});
