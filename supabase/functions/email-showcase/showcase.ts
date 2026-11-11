/**
 * One sample of every e-mail the site sends, for the owner to see them all at
 * once (owner's request, 2026-11-01). Each sample goes through the real
 * pipeline — the database template, the shared layout, the same content
 * builders and, for the documents, a real PDF drawn with the store's current
 * seller identity, and the terms of sale every contract confirmation carries
 * (decision 130) — but with example data: no order, card, subscription or
 * ticket is created or read, and the documents carry "EXEMPLE" numbers.
 *
 * The two Supabase Auth e-mails (sign-up confirmation, staff invitation) are
 * sent by Supabase itself from the committed templates; here they are drawn
 * with the same generator and their Go placeholders filled with a sample link.
 *
 * Pure: builds the list; `index.ts` sends it.
 */
import { AUTH_TEMPLATES, renderAuthTemplate } from "../_shared/email/authTemplates.ts";
import { giftCardVisual } from "../_shared/email/components.ts";
import { formatAmount } from "../_shared/email/format.ts";
import { attachDocument } from "../_shared/email/invoicePdf.ts";
import { orderConfirmationContent, refundContent, shippingContent, type OrderSnapshot } from "../_shared/email/orderContent.ts";
import type { SendRequest } from "../_shared/email/send.ts";
import { backInStockContent, stockDigestContent, type StockDigestItem } from "../_shared/email/stockContent.ts";
import {
  studioDocumentContent,
  studioPlanName,
  studioSubscriptionContent,
  studioWithdrawalContent,
} from "../_shared/email/studioContent.ts";
import { type InvoiceRow, type Json, mapInvoice } from "../_shared/documents/invoiceModel.ts";
import type { LegalStoreDetails } from "../_shared/legal/storeFill.ts";
import { orderReference, studioReference, studioTermsForEmail, termsOfSaleForEmail, type TermsForEmail, withTerms } from "../_shared/email/termsPdf.ts";
import type { EmailContent } from "../_shared/email/render.ts";

export interface ShowcaseContext {
  to: string;
  /** Unique per run: the event keys of the samples (email_log) never collide with a real event. */
  runId: string;
  siteUrl: string;
  mediaBaseUrl: string;
  /** The seller as `private.invoice_seller()` freezes it (store_settings row). */
  seller: Record<string, unknown>;
  /** Settings › Store, as the terms of sale quote it (null: the "to supply" markers stay). */
  legalStore: LegalStoreDetails | null;
  /** A real product, so the back-in-stock card shows its picture and links to its page. */
  product: { name: string; slug: string; imagePath: string | null };
}

/** A sample sent through `sendTemplatedEmail` (database template). */
export interface TemplatedSample {
  kind: "template";
  label: string;
  request: SendRequest;
}

/** A Supabase Auth e-mail, already rendered. */
export interface RenderedSample {
  kind: "rendered";
  label: string;
  subject: string;
  html: string;
  text: string;
}

export type Sample = TemplatedSample | RenderedSample;

const LOCALE = "fr";
const NOW = "2026-11-01T10:00:00+00:00";

function buyer(email: string) {
  return {
    email,
    order_number: "GT-EXEMPLE",
    address: { first_name: "Camille", last_name: "Martin", address_line1: "12 rue de l’Exemple", postal_code: "67000", city: "Strasbourg", country_code: "FR" },
  };
}

/** A shop invoice under the VAT franchise (decision 114): no VAT on any line. */
function orderInvoiceRow(ctx: ShowcaseContext): InvoiceRow {
  return {
    id: "showcase-invoice",
    kind: "invoice",
    invoice_number: "FA-EXEMPLE-000001",
    issued_at: NOW,
    sale_date: NOW.slice(0, 10),
    currency: "EUR",
    total_excl_tax: "54.70",
    total_tax: "0.00",
    total_incl_tax: "54.70",
    seller: { ...ctx.seller, vat_franchise: true } as Json,
    buyer: buyer(ctx.to) as Json,
    lines: [
      { kind: "product", description: "Heart Crystal", detail: "Cristal · SS6", quantity: 2, unit_price_incl: 14.9, unit_price_excl: 14.9, discount_incl: 0, vat_rate_bp: 0, total_incl: 29.8, vat_amount: 0, total_excl: 29.8 },
      { kind: "product", description: "Star Aurora", quantity: 1, unit_price_incl: 19.9, unit_price_excl: 19.9, discount_incl: 0, vat_rate_bp: 0, total_incl: 19.9, vat_amount: 0, total_excl: 19.9 },
      { kind: "shipping", description: "Colissimo suivi", quantity: 1, unit_price_incl: 5, unit_price_excl: 5, discount_incl: 0, vat_rate_bp: 0, total_incl: 5, vat_amount: 0, total_excl: 5 },
    ] as Json,
    vat_breakdown: [{ vat_rate_bp: 0, total_excl: 54.7, vat_amount: 0, total_incl: 54.7 }] as Json,
    payment: { paid_at: NOW, gift_card_amount: 0, charged_amount: 54.7 } as Json,
  };
}

function orderCreditNoteRow(ctx: ShowcaseContext): InvoiceRow {
  return {
    ...orderInvoiceRow(ctx),
    id: "showcase-credit-note",
    kind: "credit_note",
    invoice_number: "AV-EXEMPLE-000001",
    total_excl_tax: "19.90",
    total_incl_tax: "19.90",
    lines: [{ kind: "product", description: "Star Aurora", quantity: 1, unit_price_incl: 19.9, unit_price_excl: 19.9, discount_incl: 0, vat_rate_bp: 0, total_incl: 19.9, vat_amount: 0, total_excl: 19.9 }] as Json,
    vat_breakdown: [{ vat_rate_bp: 0, total_excl: 19.9, vat_amount: 0, total_incl: 19.9 }] as Json,
    payment: { refunded_at: NOW, refund_method: "card", credited_invoice_number: "FA-EXEMPLE-000001" } as Json,
  };
}

function studioInvoiceRow(ctx: ShowcaseContext, number: string): InvoiceRow {
  return {
    id: `showcase-${number}`,
    kind: "invoice",
    invoice_number: number,
    issued_at: NOW,
    sale_date: NOW.slice(0, 10),
    currency: "EUR",
    total_excl_tax: "19.00",
    total_tax: "0.00",
    total_incl_tax: "19.00",
    seller: { ...ctx.seller, vat_franchise: true } as Json,
    buyer: { email: ctx.to } as Json,
    lines: [{
      kind: "subscription", description: "Artiste", quantity: 1, unit_price_incl: 19, unit_price_excl: 19, discount_incl: 0,
      vat_rate_bp: 0, total_incl: 19, vat_amount: 0, total_excl: 19,
      plan: "artist", interval: "month", period_start: "2026-11-01", period_end: "2026-12-01",
    }] as Json,
    vat_breakdown: [{ vat_rate_bp: 0, total_excl: 19, vat_amount: 0, total_incl: 19 }] as Json,
    payment: { paid_at: NOW, gift_card_amount: 0, charged_amount: 19 } as Json,
  };
}

function studioCreditNoteRow(ctx: ShowcaseContext): InvoiceRow {
  return {
    ...studioInvoiceRow(ctx, "AV-EXEMPLE-000002"),
    kind: "credit_note",
    total_excl_tax: "15.20",
    total_incl_tax: "15.20",
    lines: [{
      kind: "subscription", description: "Artiste", quantity: 1, discount_incl: 0, vat_rate_bp: 0,
      total_incl: 15.2, vat_amount: 0, total_excl: 15.2, plan: "artist", withdrawal: true, used_days: 6, period_days: 30,
    }] as Json,
    vat_breakdown: [{ vat_rate_bp: 0, total_excl: 15.2, vat_amount: 0, total_incl: 15.2 }] as Json,
    payment: { refunded_at: NOW, refund_method: "card", credited_invoice_number: "FA-EXEMPLE-000002" } as Json,
  };
}

const ORDER: OrderSnapshot = {
  orderNumber: "GT-EXEMPLE",
  userId: "showcase-member",
  currency: "EUR",
  paidAt: NOW,
  subtotal: 49.7,
  discount: 0,
  shipping: 5,
  tax: 0,
  total: 54.7,
  giftCard: 0,
  amountDue: 54.7,
  pricesIncludeTax: true,
  shippingMethodName: "Colissimo suivi",
  shippingAddress: { first_name: "Camille", last_name: "Martin", address_line1: "12 rue de l’Exemple", postal_code: "67000", city: "Strasbourg", country_code: "FR" },
  lines: [
    { productName: "Heart Crystal", variantName: "Cristal · SS6", quantity: 2, subtotal: 29.8 },
    { productName: "Star Aurora", variantName: null, quantity: 1, subtotal: 19.9 },
  ],
};

const DIGEST: StockDigestItem[] = [
  { productName: "Heart Crystal", variantName: "Cristal · SS6", sku: "HC-SS6", status: "out_of_stock", available: 0, threshold: 5 },
  { productName: "Star Aurora", variantName: null, sku: "SA-01", status: "low_stock", available: 2, threshold: 5 },
  { productName: "Colle dentaire", variantName: null, sku: "GLUE-5ML", status: "low_stock", available: 4, threshold: 5 },
];

/** Fills the Go template actions of a Supabase Auth template with sample values. */
function fillAuthTemplate(html: string, siteUrl: string): string {
  return html
    .replace(/^<!--[\s\S]*?-->\n/, "")
    .replaceAll("{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=", `${siteUrl}/auth/confirm?next=/compte&amp;token_hash=EXEMPLE&amp;type=`)
    .replace(/\{\{ if \.Data\.first_name \}\}(, | )\{\{ \.Data\.first_name \}\}\{\{ end \}\}/g, "$1Camille")
    .replaceAll("{{ .Email }}", "camille@example.com");
}

function textOf(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** A contract confirmation's content with the terms of sale: their blocks (none when attached) and footer line. */
function withTermsContent(content: EmailContent, terms: TermsForEmail, locale: string): EmailContent {
  const extra = withTerms(terms, locale);
  return { ...content, blocks: [...(content.blocks ?? []), ...extra.blocks], footerNote: extra.footerNote };
}

export function buildShowcase(ctx: ShowcaseContext): Sample[] {
  const key = (name: string) => `showcase:${ctx.runId}:${name}`;
  const base = { to: ctx.to, locale: LOCALE };
  const creditNote = attachDocument(mapInvoice(orderCreditNoteRow(ctx)), LOCALE, mapInvoice(orderInvoiceRow(ctx)));
  const studioFirst = attachDocument(mapInvoice(studioInvoiceRow(ctx, "FA-EXEMPLE-000002")), LOCALE);
  const studioRenewal = attachDocument(mapInvoice(studioInvoiceRow(ctx, "FA-EXEMPLE-000003")), LOCALE);
  const studioNote = attachDocument(mapInvoice(studioCreditNoteRow(ctx)), LOCALE, mapInvoice(studioInvoiceRow(ctx, "FA-EXEMPLE-000002")));
  const plan = studioPlanName("artist", LOCALE);
  const orderTerms = termsOfSaleForEmail(ctx.legalStore, LOCALE, orderReference(ORDER.orderNumber, LOCALE));
  // The Studio is sold by the publisher, under its own terms (decision 135).
  const studioTerms = studioTermsForEmail(ctx.legalStore, LOCALE, studioReference(plan, LOCALE));
  const termsFiles = (terms: TermsForEmail) => withTerms(terms, LOCALE).attachments;
  const tracking = "https://www.laposte.fr/outils/suivre-vos-envois?code=6A00000000000";

  const samples: Sample[] = [
    {
      kind: "template",
      label: "Confirmation de commande (+ CGV PDF)",
      request: {
        ...base, templateKey: "order_confirmation", eventKey: key("order_confirmation"),
        variables: { first_name: "Camille", order_number: ORDER.orderNumber },
        attachments: termsFiles(orderTerms),
        content: (locale) => withTermsContent(orderConfirmationContent(ORDER, locale, ctx.siteUrl), orderTerms, locale),
      },
    },
    {
      kind: "template",
      label: "Colis expédié",
      request: {
        ...base, templateKey: "shipping_notification", eventKey: key("shipping_notification"),
        variables: { first_name: "Camille", order_number: ORDER.orderNumber, tracking_url: tracking },
        content: (locale) => shippingContent({ orderNumber: ORDER.orderNumber, trackingLink: tracking, userId: ORDER.userId }, locale, ctx.siteUrl),
      },
    },
    {
      kind: "template",
      label: "Remboursement (+ avoir PDF)",
      request: {
        ...base, templateKey: "order_refunded", eventKey: key("order_refunded"),
        variables: { first_name: "Camille", order_number: ORDER.orderNumber, amount: formatAmount(19.9, "EUR", LOCALE) },
        attachments: [creditNote.attachment],
        content: (locale) => refundContent({ orderNumber: ORDER.orderNumber, amount: 19.9, currency: "EUR" }, locale, creditNote.number),
      },
    },
    {
      kind: "template",
      label: "Inscription à une formation",
      request: {
        ...base, templateKey: "course_enrolment", eventKey: key("course_enrolment"),
        variables: { first_name: "Camille", course_name: "Initiation Tooth Gems" },
      },
    },
    {
      kind: "template",
      label: "Carte cadeau",
      request: {
        ...base, templateKey: "gift_card_delivery", eventKey: key("gift_card_delivery"),
        variables: {
          sender_name: "Léa",
          amount: formatAmount(50, "EUR", LOCALE),
          message: "Joyeux anniversaire ! Fais-toi plaisir ✨",
          code: "GT-EXEM-PLE0-0000",
          expires_on: "1 novembre 2027",
          shop_url: `${ctx.siteUrl}/fr`,
        },
        content: (locale) => ({
          lead: [giftCardVisual({
            design: "sparkle",
            amount: formatAmount(50, "EUR", locale),
            label: "Carte cadeau",
            recipient: "Pour Camille",
            sender: "De la part de Léa",
            message: "Joyeux anniversaire ! Fais-toi plaisir ✨",
          })],
        }),
      },
    },
    {
      kind: "template",
      label: "Produit de retour en stock",
      request: {
        ...base, templateKey: "back_in_stock", eventKey: key("back_in_stock"),
        variables: { product_name: ctx.product.name },
        content: (locale) =>
          backInStockContent(
            { productName: ctx.product.name, variantName: null, productSlug: ctx.product.slug, imagePath: ctx.product.imagePath },
            locale,
            ctx.siteUrl,
            ctx.mediaBaseUrl,
          ),
      },
    },
    {
      kind: "template",
      label: "Accusé de réception du formulaire de contact (client)",
      request: {
        ...base, templateKey: "contact_acknowledgement", eventKey: key("contact_acknowledgement"),
        variables: { name: "Camille", subject: "Question sur ma commande", ticket_number: "GT-T-EXEMPLE" },
      },
    },
    {
      kind: "template",
      label: "Nouvelle demande de contact (boîte support)",
      request: {
        ...base, templateKey: "contact_request_received", eventKey: key("contact_request_received"),
        variables: {
          ticket_number: "GT-T-EXEMPLE",
          category: "Commande",
          subject: "Question sur ma commande",
          name: "Camille Martin",
          email: "camille@example.com",
          order_reference: ORDER.orderNumber,
          attachments: "—",
          message: "Bonjour, ma commande est-elle bien partie ? Merci !",
        },
      },
    },
    {
      kind: "template",
      label: "Confirmation d'inscription à la newsletter",
      request: {
        ...base, templateKey: "newsletter_confirmation", eventKey: key("newsletter_confirmation"),
        variables: { confirm_url: `${ctx.siteUrl}/newsletter/confirmer?token=EXEMPLE` },
      },
    },
    {
      kind: "template",
      label: "Studio 3D : abonnement activé (+ facture PDF + CGV PDF)",
      request: {
        ...base, templateKey: "studio_subscription_confirmation", eventKey: key("studio_subscription_confirmation"),
        variables: { plan_name: plan },
        attachments: [studioFirst.attachment, ...termsFiles(studioTerms)],
        content: (locale) =>
          withTermsContent(
            studioSubscriptionContent(
              { plan: "artist", interval: "month", amount: 19, currency: "EUR", consentVersion: "studio-immediate-access-2026-10-18", consentedAt: NOW },
              locale,
              ctx.siteUrl,
              studioFirst.number,
            ),
            studioTerms,
            locale,
          ),
      },
    },
    {
      kind: "template",
      label: "Studio 3D : facture de renouvellement (+ PDF)",
      request: {
        ...base, templateKey: "studio_invoice", eventKey: key("studio_invoice"),
        variables: { plan_name: plan, invoice_number: studioRenewal.number },
        attachments: [studioRenewal.attachment],
        content: (locale) => studioDocumentContent({ kind: "invoice", plan: "artist", number: studioRenewal.number }, locale, ctx.siteUrl),
      },
    },
    {
      kind: "template",
      label: "Studio 3D : rétractation enregistrée",
      request: {
        ...base, templateKey: "studio_withdrawal_confirmation", eventKey: key("studio_withdrawal_confirmation"),
        variables: { plan_name: plan },
        content: (locale) =>
          studioWithdrawalContent(
            { plan: "artist", requestedAt: NOW, usedDays: 6, periodDays: 30, paidAmount: 19, usedAmount: 3.8, refundAmount: 15.2, currency: "EUR" },
            locale,
            ctx.siteUrl,
          ),
      },
    },
    {
      kind: "template",
      label: "Studio 3D : remboursement effectué (+ avoir PDF)",
      request: {
        ...base, templateKey: "studio_credit_note", eventKey: key("studio_credit_note"),
        variables: { plan_name: plan, invoice_number: studioNote.number },
        attachments: [studioNote.attachment],
        content: (locale) => studioDocumentContent({ kind: "creditNote", plan: "artist", number: studioNote.number }, locale, ctx.siteUrl),
      },
    },
    {
      kind: "template",
      label: "Récapitulatif quotidien du stock (boîte support)",
      request: {
        ...base, templateKey: "stock_digest", eventKey: key("stock_digest"),
        variables: { date: "1 novembre 2026", out_count: "1", low_count: "2" },
        content: (locale) => stockDigestContent(DIGEST, locale, ctx.siteUrl),
      },
    },
    {
      kind: "template",
      label: "Compte supprimé (droit à l'effacement)",
      request: {
        ...base, templateKey: "account_deleted", eventKey: key("account_deleted"),
        variables: { date: "6 novembre 2026" },
      },
    },
  ];

  for (const template of AUTH_TEMPLATES) {
    const html = fillAuthTemplate(renderAuthTemplate(template), ctx.siteUrl);
    samples.push({
      kind: "rendered",
      label: template.file === "confirm-signup.html" ? "Confirmation d'inscription (Supabase Auth)" : "Invitation dans l'équipe (Supabase Auth)",
      subject: template.subject,
      html,
      text: textOf(html),
    });
  }
  return samples;
}

/** The samples that carry a document (invoice, credit note or terms of sale as a PDF). */
export function withDocuments(samples: Sample[]): Sample[] {
  return samples.filter((s) => s.kind === "template" && (s.request.attachments?.length ?? 0) > 0);
}
