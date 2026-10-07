import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  actions,
  type Block,
  courseCard,
  details,
  divider,
  heading,
  image,
  notice,
  orderSummary,
  paragraph,
  productCard,
  promo,
  textLink,
  title,
} from "./components.ts";
import { EmailRenderError } from "./html.ts";
import { emailDocument } from "./layout.ts";

const EVIL = '<script>alert("x")</script>';
const URL_OK = "https://globaltoothgems.com/fr/boutique";
const IMG = "https://cdn.example/gem.jpg";

/** Every component, fed the same hostile string in every text field. */
function everyComponent(text: string): Block[] {
  return [
    title(text),
    heading(text),
    paragraph(text),
    textLink({ label: text, url: URL_OK }),
    actions({ label: text, url: URL_OK }, { label: text, url: URL_OK }),
    notice({ tone: "warning", title: text, body: text, link: { label: text, url: URL_OK } }),
    details({ title: text, rows: [{ label: text, value: text }] }),
    orderSummary({
      title: text,
      reference: text,
      status: { label: text, tone: "success" },
      lines: [{ name: text, detail: text, quantity: 2, amount: text, imageUrl: IMG, imageAlt: text }],
      totals: [{ label: text, amount: text, strong: true }],
    }),
    productCard({ imageUrl: IMG, imageAlt: text, name: text, description: text, price: text, badge: { label: text, tone: "info" } }),
    courseCard({ imageUrl: IMG, imageAlt: text, title: text, facts: [text], description: text, link: { label: text, url: URL_OK } }),
    promo({ eyebrow: text, title: text, body: text, code: { label: text, value: text }, link: { label: text, url: URL_OK } }),
    image({ src: IMG, alt: text, width: 520, height: 260, caption: text, href: URL_OK }),
  ];
}

Deno.test("every component escapes every string it is given", () => {
  for (const block of everyComponent(EVIL)) {
    assert(!block.html.includes("<script"), block.html.slice(0, 120));
    assertStringIncludes(block.html, "&lt;script&gt;");
  }
});

Deno.test("links, buttons and images refuse anything but https", () => {
  for (const url of ["javascript:alert(1)", "http://globaltoothgems.com", "data:text/html,x", " "]) {
    assertThrows(() => actions({ label: "Go", url }), EmailRenderError);
    assertThrows(() => textLink({ label: "Go", url }), EmailRenderError);
    assertThrows(() => image({ src: url, alt: "", width: 10, height: 10 }), EmailRenderError);
    assertThrows(
      () => productCard({ imageUrl: url, imageAlt: "", name: "Gem" }),
      EmailRenderError,
    );
  }
  assertStringIncludes(textLink({ label: "Écrire", url: "mailto:hello@globaltoothgems.com" }).html, "mailto:");
});

Deno.test("an ampersand in a link is escaped once", () => {
  assertStringIncludes(actions({ label: "Go", url: "https://x.example/?a=1&b=2" }).html, 'href="https://x.example/?a=1&amp;b=2"');
});

Deno.test("a notice names its state in words, not only in colour", () => {
  const block = notice({ tone: "success", title: "Paiement confirmé", body: "Merci." });
  assertStringIncludes(block.html, "Paiement confirmé");
  assertStringIncludes(block.html, "✓");
  assertEquals(block.text, "[Paiement confirmé]\nMerci.");
});

Deno.test("the primary action is the emerald button with dark text; the secondary one is outlined", () => {
  const html = actions({ label: "Payer", url: URL_OK }, { label: "Plus tard", url: URL_OK }).html;
  assertStringIncludes(html, 'bgcolor="#3edba0"');
  assertStringIncludes(html, 'bgcolor="#ffffff"');
  assert(!/color:#ffffff;text-decoration:none/.test(html), "button text must stay ink, never white on emerald");
});

Deno.test("the order summary keeps the given amounts and writes a readable text twin", () => {
  const block = orderSummary({
    title: "Votre commande",
    reference: "GT-1042",
    lines: [{ name: "Heart gem", detail: "Cristal", quantity: 2, amount: "49,80 €" }],
    totals: [{ label: "Livraison", amount: "4,90 €" }, { label: "Total TTC", amount: "54,70 €", strong: true }],
    quantityLabel: (n) => `Qté ${n}`,
  });
  assertStringIncludes(block.html, "49,80 €");
  assertStringIncludes(block.html, "Cristal · Qté 2");
  assertEquals(
    block.text,
    "VOTRE COMMANDE\nGT-1042\n- Heart gem (Cristal) Qté 2: 49,80 €\nLivraison: 4,90 €\nTotal TTC: 54,70 €",
  );
});

Deno.test("the text twin of a whole document lists the blocks, then support and sign-off", () => {
  const doc = emailDocument(
    {
      locale: "en",
      subject: "Hello",
      preheader: "",
      blocks: [title("Hello"), paragraph("Body"), divider(), actions({ label: "Open", url: URL_OK })],
    },
    { brandName: "Global Toothgems", siteUrl: "https://globaltoothgems.com", now: new Date("2026-10-07") },
  );
  assertEquals(
    doc.text,
    `Hello\n\nBody\n\nOpen: ${URL_OK}\n\nContact customer care: https://globaltoothgems.com/en/contact\n\n— Global Toothgems\nhttps://globaltoothgems.com\n`,
  );
  assertStringIncludes(doc.html, "&copy; 2026 Global Toothgems");
});

Deno.test("social links and a postal address appear only when configured; German falls back to English chrome", () => {
  const base = { brandName: "Global Toothgems", siteUrl: "https://globaltoothgems.com" };
  const doc = { locale: "de", subject: "Hallo", preheader: "", blocks: [paragraph("x")] };
  const plain = emailDocument(doc, base).html;
  assert(!plain.includes("instagram"));
  assertStringIncludes(plain, "/en/legal-notice");
  const social = emailDocument(doc, {
    ...base,
    socialLinks: [{ label: "Instagram", url: "https://instagram.com/globaltoothgems" }],
    postalAddress: "1 rue Exemple, 69000 Lyon",
  }).html;
  assertStringIncludes(social, 'href="https://instagram.com/globaltoothgems"');
  assertStringIncludes(social, "1 rue Exemple, 69000 Lyon");
});
