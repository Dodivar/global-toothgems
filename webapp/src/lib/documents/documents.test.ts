import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import type { StoreDetails } from "../../data/adminSettings";
import type { Order } from "../../data/orders";
import { legalFooter, orderAmountRows, orderDocument, orderDocumentFileName, type DocumentFormat, type Translate } from "./orderDocument";
import { contentStream, writePdf, type PdfOp } from "./pdfWriter";
import { layoutDocument, renderDocument, type BusinessDocument } from "./template";
import { encodeWinAnsi, textWidth, wrapText } from "./text";

/** i18next's lookup and {{interpolation}}, enough for the documents' keys. */
function translator(messages: unknown): Translate {
  return (key, params = {}) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing key ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]));
  };
}

const t = translator(fr);
const fmt: DocumentFormat = {
  lang: "fr",
  money: (minor, currency) => new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(minor / 100),
  date: (iso) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso)),
  country: (code) => new Intl.DisplayNames(["fr-FR"], { type: "region" }).of(code) ?? code,
};

const store = {
  storeName: "Global Toothgems",
  legalName: "Global Toothgems SAS",
  legalForm: "SAS",
  shareCapital: "10 000 €",
  registrationNumber: "RCS Lyon 900 000 000",
  vatNumber: "FR00900000000",
  businessEmail: "contact@example.com",
  supportEmail: "",
  phone: "+33 4 00 00 00 00",
  country: "FR",
  address1: "1 rue de l’Exemple",
  address2: "",
  postalCode: "69001",
  city: "Lyon",
  region: "",
  showPhone: false,
} as StoreDetails;

const order: Order = {
  reference: "GT-100149",
  placedOn: "2026-09-29",
  status: "delivered",
  payment: "partiallyRefunded",
  fulfilment: "shipped",
  ships: true,
  currency: "EUR",
  amounts: { subtotal: 9195, discount: 920, shipping: 690, tax: 1528, taxIncluded: true, total: 8965, giftCard: 2000, charged: 6965, refunded: 995 },
  discounts: [{ label: "Bienvenue", code: "WELCOME10", goodsAmount: 920, shippingAmount: 0 }],
  lines: [
    { id: "l1", name: { fr: "Cœur chromé", en: "Chrome heart" }, variant: { fr: "Or 18 carats", en: "18k gold" }, image: "", qty: 2, unitAmount: 4100, totalAmount: 8200, discountAmount: 820 },
    { id: "l2", name: { fr: "Colle dentaire", en: "Dental glue" }, image: "", qty: 1, unitAmount: 995, totalAmount: 995, discountAmount: 100 },
  ],
  parcels: [],
  refunds: [{ amount: 995, status: "succeeded", reason: "defective", requestedOn: "2026-10-01", processedOn: "2026-10-02", items: [{ lineId: "l2", qty: 1 }] }],
  shippingAddress: { name: "Camille Roussel", lines: ["12 rue des Lilas"], postalCode: "69003", city: "Lyon", countryCode: "FR" },
  billingAddress: { name: "Camille Roussel", lines: ["12 rue des Lilas"], postalCode: "69003", city: "Lyon", countryCode: "FR" },
  shippingMethod: "Colissimo",
};

const texts = (pages: PdfOp[][]) => pages.map((ops) => ops.flatMap((op) => (op.kind === "text" ? [op.text] : [])));

describe("text in the standard fonts", () => {
  it("encodes French text in WinAnsi, with fallbacks for what it lacks", () => {
    expect(encodeWinAnsi("é€’œ…")).toEqual([0xe9, 0x80, 0x92, 0x9c, 0x85]);
    // Minus sign and the narrow no-break space Intl writes in French amounts.
    expect(encodeWinAnsi("−1 000")).toEqual([0x2d, 0x31, 0xa0, 0x30, 0x30, 0x30]);
    expect(encodeWinAnsi("✓")).toEqual([0x3f]);
  });

  it("measures with Helvetica's metrics", () => {
    expect(textWidth("AAAA", "regular", 10)).toBeCloseTo(26.68);
    expect(textWidth("A", "bold", 10)).toBeGreaterThan(textWidth("i", "bold", 10));
  });

  it("wraps at spaces and breaks a word too long for the line", () => {
    const lines = wrapText("un deux trois quatre cinq six", "regular", 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, "regular", 10)).toBeLessThanOrEqual(60);
    expect(wrapText("x".repeat(40), "regular", 10, 50).join("")).toBe("x".repeat(40));
  });
});

describe("PDF writer", () => {
  it("writes a valid cross-reference table and one page object per page", () => {
    const page: PdfOp[] = [{ kind: "text", x: 10, y: 20, text: "Bon (été)", weight: "regular", size: 9, color: "#111111" }];
    const bytes = writePdf([page, page], { title: "Test", author: "GT", lang: "fr", createdAt: new Date("2026-10-09T08:00:00Z") });
    const body = new TextDecoder("latin1").decode(bytes);
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(body).toContain("/Count 2");
    const xrefAt = Number(/startxref\n(\d+)/.exec(body)![1]);
    expect(body.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...body.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) => expect(body.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("escapes text and flips the y axis", () => {
    const stream = contentStream([{ kind: "text", x: 10, y: 41.89, text: "a(b)é", weight: "bold", size: 9, color: "#000000" }], 841.89);
    expect(stream).toContain("/F2 9 Tf 10 800 Td (a\\(b\\)\\351) Tj");
  });
});

describe("document template", () => {
  const base: BusinessDocument = {
    lang: "fr",
    title: "Devis",
    meta: [{ label: "Référence", value: "Q-1" }],
    parties: [{ title: "Vendeur", lines: ["Global Toothgems"] }],
    blocks: [],
    footer: ["Global Toothgems SAS"],
    pageLabel: (page, count) => `Page ${page} sur ${count}`,
    info: { title: "Devis Q-1", author: "Global Toothgems" },
  };

  it("flows a long table over several pages, repeating its header and numbering the pages", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ cells: [`Article ${i + 1}`, "1", "10,00 €"] }));
    const pages = layoutDocument({
      ...base,
      blocks: [{ kind: "table", columns: [{ label: "Article", width: 3 }, { label: "Qté", width: 1, align: "end" }, { label: "Total", width: 1, align: "end" }], rows }],
    });
    expect(pages.length).toBeGreaterThan(1);
    const pageTexts = texts(pages);
    pageTexts.forEach((list, i) => {
      expect(list).toContain("ARTICLE");
      expect(list).toContain("DEVIS");
      expect(list).toContain(`Page ${i + 1} sur ${pages.length}`);
    });
    expect(pageTexts.flat().filter((s) => s.startsWith("Article ")).length).toBe(80);
    // Nothing is drawn into the footer's band.
    for (const ops of pages) for (const op of ops) if (op.kind === "text" && op.text.startsWith("Article ")) expect(op.y).toBeLessThan(780);
  });

  it("renders to a PDF", () => {
    const bytes = renderDocument({ ...base, blocks: [{ kind: "paragraph", text: "Valable 30 jours.", tone: "notice" }] }, new Date("2026-10-09T00:00:00Z"));
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 8))).toBe("%PDF-1.4");
  });
});

describe("order form", () => {
  it("lists the recorded amounts in the order they add up", () => {
    const rows = orderAmountRows(order, t, (minor) => fmt.money(minor, "EUR"));
    expect(rows.map((r) => r.key)).toEqual(["subtotal", "d0", "shipping", "total", "taxIncluded", "giftCard", "charged", "refunded"]);
    expect(rows.find((r) => r.key === "total")?.emphasis).toBe("strong");
  });

  it("says who sells, to whom, what and how much, and that it is not an invoice", () => {
    const doc = orderDocument(order, store, t, fmt, "2026-10-09");
    expect(doc.title).toBe("Bon de commande");
    expect(doc.parties.map((p) => p.title)).toEqual(["Vendeur", "Adresse de facturation", "Adresse de livraison"]);
    expect(doc.parties[0].lines).not.toContain(store.phone);
    const all = texts(layoutDocument(doc)).flat().join("\n");
    expect(all).toContain("GT-100149");
    expect(all).toContain("Cœur chromé");
    expect(all).toContain("Or 18 carats");
    expect(all).toContain("REMISE");
    expect(all).toContain("Il ne constitue pas une facture.");
    expect(all).toContain("TVA intracommunautaire FR00900000000");
  });

  it("drops the discount column when no line has one, and works without store details", () => {
    const plain = { ...order, discounts: [], lines: order.lines.map((l) => ({ ...l, discountAmount: 0 })) };
    const doc = orderDocument(plain, null, translator(en), { ...fmt, lang: "en" }, "2026-10-09");
    const table = doc.blocks.find((b) => b.kind === "table");
    expect(table?.kind === "table" && table.columns.map((c) => c.label)).toEqual(["Item", "Qty", "Unit price", "Total"]);
    expect(doc.parties[0].lines).toEqual(["Global Toothgems"]);
    expect(legalFooter(null, t)).toEqual(["Global Toothgems"]);
  });

  it("names the file after the reference", () => {
    expect(orderDocumentFileName("GT-100149", t)).toBe("bon-de-commande-GT-100149.pdf");
    expect(orderDocumentFileName("GT/../1", translator(en))).toBe("order-form-GT-1.pdf");
  });
});
