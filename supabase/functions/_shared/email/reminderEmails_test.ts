import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { renderEmail } from "./render.ts";
import {
  abandonedCartContent,
  cartUrl,
  loyaltyRewardContent,
  type PendingAbandonedCart,
  type PendingLoyaltyReward,
  type PendingReviewRequest,
  reminderUnsubscribeUrl,
  type ReminderSource,
  reviewRequestContent,
  sendReminderEmails,
} from "./reminderEmails.ts";
import type { EmailDeps, EmailStore } from "./send.ts";

const SITE = "https://site.example";
const MEDIA = "https://x.supabase.co/storage/v1/object/public/product-media";
const UNSUB = reminderUnsubscribeUrl(SITE, "a".repeat(48));
const LAYOUT = { brandName: "Global Toothgems", siteUrl: SITE };

const CART: PendingAbandonedCart = {
  orderId: "o-1",
  orderNumber: "GT-100001",
  email: "lea@example.com",
  locale: "fr",
  firstName: "Léa",
  items: [
    { name: "Strass Crystal", variant: "SS5", slug: "strass-crystal", imagePath: "p/1.webp" },
    { name: "Kit pro", variant: null, slug: "kit-pro", imagePath: null },
  ],
};
const REVIEW: PendingReviewRequest = { ...CART, orderId: "o-2", locale: "en", items: [{ name: "Gem", slug: "gem", imagePath: null }] };
const REWARD: PendingLoyaltyReward = { cardId: "c-1", userId: "u-1", email: "lea@example.com", locale: "fr", firstName: "Léa", rewardPercent: 10 };

const template = (key: string, variables: string[]) => ({
  key,
  locale: "fr",
  subject: "Sujet",
  preheader: "",
  body: variables.map((v) => `{{${v}}}`).join(" "),
  variables,
});

Deno.test("the opt-out and cart links", () => {
  assertEquals(UNSUB, `${SITE}/rappels/desinscription?token=${"a".repeat(48)}`);
  assertEquals(reminderUnsubscribeUrl(`${SITE}/`, "b"), `${SITE}/rappels/desinscription?token=b`);
  assertEquals(cartUrl(SITE, "fr"), `${SITE}/fr/panier`);
  assertEquals(cartUrl(SITE, "en"), `${SITE}/en/cart`);
  assertEquals(cartUrl(SITE, "de"), `${SITE}/en/cart`);
});

Deno.test("abandoned cart: product cards and links, no price, the opt-out link in the footer", () => {
  const content = abandonedCartContent(CART, "fr", SITE, MEDIA, UNSUB);
  assertEquals(content.primaryAction?.url, `${SITE}/fr/panier`);
  assertEquals(content.unsubscribeUrl, UNSUB);
  const rendered = renderEmail(template("abandoned_cart", ["first_name"]), { first_name: "Léa" }, LAYOUT, content);
  assertStringIncludes(rendered.text, "Strass Crystal — SS5");
  assertStringIncludes(rendered.text, `${SITE}/fr/boutique/strass-crystal`);
  assertStringIncludes(rendered.text, `${SITE}/fr/boutique/kit-pro`);
  assertStringIncludes(rendered.html, `${MEDIA}/p/1.webp`);
  assertStringIncludes(rendered.text, UNSUB);
  assert(!/€|EUR/.test(rendered.text), "no price in an abandoned cart reminder");
});

Deno.test("review request: each product links to its reviews, in the e-mail's language", () => {
  const content = reviewRequestContent(REVIEW, "en", SITE, MEDIA, UNSUB);
  assertEquals(content.primaryAction?.url, `${SITE}/en/shop/gem#avis`);
  const rendered = renderEmail(template("review_request", ["first_name", "order_number"]), { first_name: "Léa", order_number: "GT-1" }, LAYOUT, content);
  assertStringIncludes(rendered.text, "Rate this product");
  assertStringIncludes(rendered.text, UNSUB);
});

Deno.test("loyalty reward: the cart where the reward is ticked, and the card", () => {
  const content = loyaltyRewardContent("fr", SITE, UNSUB);
  assertEquals(content.primaryAction?.url, `${SITE}/fr/panier`);
  assert(content.blocks?.some((b) => b.text.includes(`${SITE}/compte/fidelite`)));
});

function harness(overrides: Partial<ReminderSource> = {}) {
  const claimed: string[] = [];
  const sent: { to: string; headers: Record<string, string> }[] = [];
  const done = new Set<string>();
  const store: EmailStore = {
    loadTemplate: (key) =>
      Promise.resolve(
        key === "loyalty_reward"
          ? template(key, ["first_name", "reward_percent"])
          : key === "review_request"
          ? template(key, ["first_name", "order_number"])
          : template(key, ["first_name"]),
      ),
    claim: (entry) => {
      if (done.has(entry.eventKey)) return Promise.resolve({ claimed: false, status: "sent" });
      done.add(entry.eventKey);
      claimed.push(entry.eventKey);
      return Promise.resolve({ claimed: true, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
  const deps = {
    store,
    resend: {
      apiKey: "re_test",
      fetch: (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sent.push({ to: body.to[0] ?? body.to, headers: body.headers ?? {} });
        return Promise.resolve(new Response(JSON.stringify({ id: `msg_${sent.length}` }), { status: 200 }));
      },
    },
    from: "Global Toothgems <no-reply@example.com>",
    layout: LAYOUT,
  } as unknown as EmailDeps;
  const tokens: string[] = [];
  const source: ReminderSource = {
    abandonedCarts: () => Promise.resolve([CART]),
    reviewRequests: () => Promise.resolve([REVIEW]),
    loyaltyRewards: () => Promise.resolve([REWARD]),
    unsubscribeToken: (email) => {
      tokens.push(email);
      return Promise.resolve("c".repeat(48));
    },
    ...overrides,
  };
  return { deps, source, claimed, sent, tokens };
}

Deno.test("the sweep sends each reminder once, keyed per event, with List-Unsubscribe", async () => {
  const h = harness();
  const report = await sendReminderEmails(h.deps, h.source, { mediaBaseUrl: MEDIA });
  assertEquals(report.abandonedCart, { examined: 1, sent: 1, skipped: 0, failed: 0 });
  assertEquals(report.reviewRequest.sent, 1);
  assertEquals(report.loyaltyReward.sent, 1);
  assertEquals(h.claimed, ["abandoned_cart:o-1", "review_request:o-2", "loyalty_reward:c-1"]);
  assertEquals(h.tokens.length, 3);
  for (const mail of h.sent) {
    assertEquals(mail.headers["List-Unsubscribe"], `<${SITE}/rappels/desinscription?token=${"c".repeat(48)}>`);
  }
  // A second run finds the events already claimed: nothing more goes out.
  const again = await sendReminderEmails(h.deps, h.source, { mediaBaseUrl: MEDIA });
  assertEquals(again.abandonedCart, { examined: 1, sent: 0, skipped: 1, failed: 0 });
  assertEquals(h.sent.length, 3);
});

Deno.test("no token means no e-mail; one failing sweep does not stop the others", async () => {
  const h = harness({
    unsubscribeToken: () => Promise.reject(new Error("db down")),
    reviewRequests: () => Promise.reject(new Error("pending_review_request_emails failed")),
  });
  const logs: string[] = [];
  const report = await sendReminderEmails(h.deps, h.source, { log: (m) => logs.push(m) });
  assertEquals(report.abandonedCart, { examined: 1, sent: 0, skipped: 0, failed: 1 });
  assertEquals(report.reviewRequest, { examined: 0, sent: 0, skipped: 0, failed: 1 });
  assertEquals(report.loyaltyReward.failed, 1);
  assertEquals(h.sent.length, 0);
  assert(logs.some((m) => m.includes("review request sweep failed")));
});
