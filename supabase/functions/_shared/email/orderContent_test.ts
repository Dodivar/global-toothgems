import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { addressLines, type OrderSnapshot, orderConfirmationContent, refundContent, shippingContent } from "./orderContent.ts";

const SITE = "https://globaltoothgems.com";
const ORDER: OrderSnapshot = {
  orderNumber: "GT-100201",
  userId: null,
  currency: "EUR",
  paidAt: "2026-10-07T10:00:00Z",
  subtotal: 100,
  discount: 10,
  shipping: 0,
  tax: 15,
  total: 90,
  giftCard: 25,
  amountDue: 65,
  pricesIncludeTax: true,
  shippingMethodName: "Livraison offerte",
  shippingAddress: null,
  lines: [{ productName: "Kit Premium", variantName: null, quantity: 1, subtotal: 100 }],
};

const html = (content: ReturnType<typeof orderConfirmationContent>) => content.blocks!.map((b) => b.html).join("");
/** Intl writes narrow / no-break spaces in amounts; compare with plain spaces. */
const plain = (value: string) => value.replace(/[  ]/g, " ");
const text = (content: ReturnType<typeof orderConfirmationContent>) => plain(content.blocks!.map((b) => b.text).join("\n"));

Deno.test("totals show the frozen amounts: discount, free shipping, gift card and the amount paid", () => {
  const out = text(orderConfirmationContent(ORDER, "fr", SITE));
  for (const line of ["Sous-total: 100,00 €", "Remise: −10,00 €", "Livraison: Offerte", "Total TTC: 90,00 €", "Carte cadeau: −25,00 €", "Montant payé: 65,00 €", "dont TVA 15,00 €"]) {
    assertStringIncludes(out, line);
  }
  assertStringIncludes(out, "65,00 €.");
});

Deno.test("a guest gets a shop button, a member a link to the order; a course-only order has no address block", () => {
  const guest = orderConfirmationContent(ORDER, "fr", SITE);
  assertEquals(guest.primaryAction, { label: "Continuer mes achats", url: `${SITE}/fr/boutique` });
  assertEquals(guest.secondaryAction, undefined);
  assert(!html(guest).includes("Adresse"));
  const member = orderConfirmationContent({ ...ORDER, userId: "u1" }, "en", SITE);
  assertEquals(member.primaryAction?.url, `${SITE}/compte/commandes/GT-100201`);
  assertEquals(member.secondaryAction?.url, `${SITE}/en/shop`);
});

Deno.test("an order fully paid by gift card says so; prices excluding VAT list the VAT", () => {
  const free = text(orderConfirmationContent({ ...ORDER, giftCard: 90, amountDue: 0 }, "en", SITE));
  assertStringIncludes(free, "fully paid with a gift card");
  const ht = text(orderConfirmationContent({ ...ORDER, pricesIncludeTax: false, giftCard: 0 }, "fr", SITE));
  assertStringIncludes(ht, "TVA: 15,00 €");
  assertStringIncludes(ht, "Total HT: 90,00 €");
});

Deno.test("the address is written in lines with the country in the recipient's language", () => {
  assertEquals(
    addressLines({ first_name: "Camille", last_name: "Martin", address_line1: "2 rue X", postal_code: "67000", city: "Strasbourg", country_code: "DE" }, "fr"),
    "Camille Martin\n2 rue X\n67000 Strasbourg, Allemagne",
  );
  assertEquals(addressLines({ first_name: "Camille" }, "fr"), null);
});

Deno.test("shipping and refund e-mails get their eyebrow, button and notice; German falls back to English", () => {
  const ship = shippingContent({ orderNumber: "GT-1", trackingLink: "https://track.example/1" }, "de");
  assertEquals(ship.primaryAction, { label: "Track my parcel", url: "https://track.example/1" });
  assertEquals(ship.eyebrow, "Shipping · Order GT-1");
  const refund = refundContent({ orderNumber: "GT-1", amount: 12.5, currency: "EUR" }, "fr");
  assertStringIncludes(plain(refund.blocks!.map((b) => b.text).join("\n")), "[Remboursement de 12,50 € effectué]");
});
