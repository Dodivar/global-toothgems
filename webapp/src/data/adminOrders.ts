import type { Localized } from "./types";
import { courseLine, productLine, type OrderLine } from "./orders";

/**
 * Order book of the administration area.
 *
 * Deliberately a separate model from `data/orders.ts`. That file is the
 * *member's* view of their own purchases and is written to by `lib/orders.tsx`
 * when the cart is paid; widening it with payment references, fulfilment
 * states, internal notes and customer lifetime value would push back-office
 * concerns into the storefront. `AGENTS.md` section 6 keeps administration as
 * its own domain, so the two models sit side by side and only the line-item
 * shape (`OrderLine`, `productLine`, `courseLine`) is shared — an order line is
 * the same fact seen from both sides.
 *
 * Mock data, like every other file in `data/`. Two project rules still shape it:
 *
 * - Nothing is invented. Every line refers to a real catalogue id, because
 *   `productLine()` throws on an unknown one.
 * - Amounts stay plain euros formatted by `formatPrice`, the prototype-wide
 *   deviation already documented in `data/orders.ts`. The integer-minor-units
 *   rule belongs to the real backend; introducing it here alone would leave the
 *   app with two money representations.
 *
 * Timelines, tracking numbers and payment references are *derived* from the
 * order's own state rather than typed out per order, so a status can never
 * disagree with the history shown beside it.
 */

export type AdminOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus = "paid" | "pending" | "failed" | "refunded" | "partiallyRefunded";

export type FulfillmentStatus = "unfulfilled" | "preparing" | "fulfilled" | "partiallyFulfilled";

/** Why an order was flagged for the administrator. At most one reason per order. */
export type AttentionReason =
  | "paymentFailed"
  | "addressIncomplete"
  | "delayed"
  | "lowStock"
  | "refundRequested"
  | "fulfillmentIssue";

export type ShippingMethod = "standard" | "express" | "pickup" | "digital";

export type PaymentMethod = "visa" | "mastercard" | "paypal" | "applePay" | "bankTransfer";

export const ORDER_STATUSES: AdminOrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

export const PAYMENT_STATUSES: PaymentStatus[] = ["paid", "pending", "failed", "refunded", "partiallyRefunded"];

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "unfulfilled",
  "preparing",
  "partiallyFulfilled",
  "fulfilled",
];

export const SHIPPING_METHODS: ShippingMethod[] = ["standard", "express", "pickup", "digital"];

export interface AdminCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Total orders placed by this customer, the one being viewed included. */
  orderCount: number;
  /** ISO date (YYYY-MM-DD) of the first order. */
  since: string;
  /** Everything spent to date, in the order currency. */
  lifetimeValue: number;
  addressLine: string;
  postalCode: string;
  city: string;
  /** One of `DELIVERY_COUNTRIES`. */
  country: string;
}

export interface AdminShipment {
  /** Carrier name, derived from the destination country. */
  carrier: string;
  /** Tracking number, shown as-is. */
  number: string;
  /** ISO date (YYYY-MM-DD) announced by the carrier. */
  estimatedDelivery: string;
}

export interface AdminPayment {
  method: PaymentMethod;
  /** Last four digits for card payments. Never a full number, even mocked. */
  last4?: string;
  status: PaymentStatus;
  /** Provider reference, the string support would quote back. */
  reference: string;
  /** ISO datetime the payment settled. Absent while pending and after a failure. */
  capturedAt?: string;
  /** Amount actually captured. Zero while pending or failed. */
  captured: number;
  /** Amount given back, for a full or partial refund. */
  refunded?: number;
}

export type TimelineKind =
  | "placed"
  | "paymentConfirmed"
  | "paymentFailed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refundRequested"
  | "refunded"
  | "partiallyRefunded"
  | "addressFlagged"
  | "stockFlagged"
  | "delayFlagged"
  | "fulfillmentFlagged";

export interface TimelineEvent {
  kind: TimelineKind;
  /** ISO datetime (YYYY-MM-DDTHH:mm). */
  at: string;
}

export interface AdminNote {
  id: string;
  author: string;
  /** ISO datetime (YYYY-MM-DDTHH:mm). */
  at: string;
  body: Localized;
}

export interface AdminOrder {
  /** Back-office reference, rendered with a leading `#`. */
  reference: string;
  /** ISO datetime the order was placed. */
  placedAt: string;
  status: AdminOrderStatus;
  payment: AdminPayment;
  fulfillment: FulfillmentStatus;
  /** Set only on the orders that need a human decision. */
  attention?: AttentionReason;
  customer: AdminCustomer;
  lines: OrderLine[];
  currency: string;
  shippingMethod: ShippingMethod;
  /** Delivery cost charged. Zero for digital orders and for free shipping. */
  shippingCost: number;
  /** Amount taken off by a promotion, as a positive number. */
  discount: number;
  /** Promotion code, when a discount applies. */
  discountCode?: string;
  /** Set once the parcel leaves. Digital, pickup and pending orders have none. */
  shipment?: AdminShipment;
  timeline: TimelineEvent[];
  notes: AdminNote[];
}

/** VAT already included in the displayed prices, the way an EU shop quotes them. */
export const VAT_RATE = 0.2;

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

const CUSTOMERS = {
  camille: {
    id: "camille",
    firstName: "Camille",
    lastName: "Reynaud",
    email: "camille.reynaud@studiolumi.fr",
    phone: "+33 6 12 44 08 71",
    orderCount: 11,
    since: "2024-03-14",
    lifetimeValue: 1840,
    addressLine: "18 rue des Lices",
    postalCode: "49100",
    city: "Angers",
    country: "fr",
  },
  nora: {
    id: "nora",
    firstName: "Nora",
    lastName: "Benali",
    email: "nora.benali@gmail.com",
    phone: "+33 7 61 20 93 15",
    orderCount: 5,
    since: "2025-06-02",
    lifetimeValue: 412,
    addressLine: "7 quai Saint-Antoine",
    postalCode: "69002",
    city: "Lyon",
    country: "fr",
  },
  elodie: {
    id: "elodie",
    firstName: "Élodie",
    lastName: "Marchand",
    email: "elodie@atelier-perle.fr",
    phone: "+33 6 88 51 30 42",
    orderCount: 8,
    since: "2024-11-09",
    lifetimeValue: 1120,
    addressLine: "24 rue Crébillon",
    postalCode: "44000",
    city: "Nantes",
    country: "fr",
  },
  lucas: {
    id: "lucas",
    firstName: "Lucas",
    lastName: "Fontaine",
    email: "lucas.fontaine@outlook.fr",
    phone: "+33 6 34 77 12 90",
    orderCount: 1,
    since: "2026-09-17",
    lifetimeValue: 0,
    addressLine: "9 cours Victor Hugo",
    postalCode: "33000",
    city: "Bordeaux",
    country: "fr",
  },
  sofia: {
    id: "sofia",
    firstName: "Sofia",
    lastName: "Duarte",
    email: "sofia.duarte@brightsmile.be",
    phone: "+32 470 21 88 04",
    orderCount: 4,
    since: "2025-09-21",
    lifetimeValue: 288,
    addressLine: "Rue Antoine Dansaert 112",
    postalCode: "1000",
    city: "Bruxelles",
    country: "be",
  },
  mathis: {
    id: "mathis",
    firstName: "Mathis",
    lastName: "Perrot",
    email: "mathis.perrot@proton.me",
    phone: "+33 6 07 55 41 23",
    orderCount: 2,
    since: "2026-04-18",
    lifetimeValue: 96,
    addressLine: "Résidence Les Tilleuls",
    postalCode: "59000",
    city: "Lille",
    country: "fr",
  },
  aisling: {
    id: "aisling",
    firstName: "Aisling",
    lastName: "O’Connor",
    email: "aisling.oconnor@gemstudio.ie",
    phone: "+353 85 214 7760",
    orderCount: 7,
    since: "2025-02-27",
    lifetimeValue: 940,
    addressLine: "42 Camden Street Lower",
    postalCode: "D02 XE80",
    city: "Dublin",
    country: "ie",
  },
  hannah: {
    id: "hannah",
    firstName: "Hannah",
    lastName: "Weber",
    email: "hannah.weber@zahnglanz.de",
    phone: "+49 151 2277 4108",
    orderCount: 12,
    since: "2024-08-05",
    lifetimeValue: 1655,
    addressLine: "Torstraße 96",
    postalCode: "10119",
    city: "Berlin",
    country: "de",
  },
  ines: {
    id: "ines",
    firstName: "Inès",
    lastName: "Lambert",
    email: "ines.lambert@icloud.com",
    phone: "+33 6 45 19 72 36",
    orderCount: 3,
    since: "2026-02-11",
    lifetimeValue: 118,
    addressLine: "3 place Wilson",
    postalCode: "31000",
    city: "Toulouse",
    country: "fr",
  },
  theo: {
    id: "theo",
    firstName: "Théo",
    lastName: "Marchal",
    email: "theo.marchal@gmail.com",
    phone: "+33 7 82 30 66 51",
    orderCount: 6,
    since: "2025-05-30",
    lifetimeValue: 640,
    addressLine: "11 rue Saint-Michel",
    postalCode: "35000",
    city: "Rennes",
    country: "fr",
  },
  clara: {
    id: "clara",
    firstName: "Clara",
    lastName: "Vidal",
    email: "clara.vidal@studioclara.fr",
    phone: "+33 6 71 04 28 93",
    orderCount: 15,
    since: "2023-10-07",
    lifetimeValue: 2380,
    addressLine: "5 rue de l’Aiguillerie",
    postalCode: "34000",
    city: "Montpellier",
    country: "fr",
  },
  julien: {
    id: "julien",
    firstName: "Julien",
    lastName: "Roussel",
    email: "julien.roussel@yahoo.fr",
    phone: "+33 6 90 13 47 25",
    orderCount: 2,
    since: "2026-06-24",
    lifetimeValue: 189,
    addressLine: "28 route des Romains",
    postalCode: "67000",
    city: "Strasbourg",
    country: "fr",
  },
  maelys: {
    id: "maelys",
    firstName: "Maëlys",
    lastName: "Girard",
    email: "maelys.girard@gmail.com",
    phone: "+33 6 58 92 11 64",
    orderCount: 4,
    since: "2025-12-03",
    lifetimeValue: 214,
    addressLine: "16 rue Colbert",
    postalCode: "37000",
    city: "Tours",
    country: "fr",
  },
  fatou: {
    id: "fatou",
    firstName: "Fatou",
    lastName: "Diallo",
    email: "fatou.diallo@eclatstudio.fr",
    phone: "+33 6 22 85 70 39",
    orderCount: 9,
    since: "2024-06-19",
    lifetimeValue: 1310,
    addressLine: "47 rue Paradis",
    postalCode: "13006",
    city: "Marseille",
    country: "fr",
  },
} satisfies Record<string, AdminCustomer>;

export type CustomerId = keyof typeof CUSTOMERS;

/** Every customer in the book, for the toolbar's customer filter. */
export const ADMIN_CUSTOMERS: AdminCustomer[] = Object.values(CUSTOMERS);

interface OrderSeed {
  ref: string;
  /** ISO datetime, shop wall time. */
  at: string;
  customer: CustomerId;
  status: AdminOrderStatus;
  payment: PaymentStatus;
  fulfillment: FulfillmentStatus;
  method: ShippingMethod;
  ship: number;
  /** Catalogue lines as `[productId, qty]`; `course:<id>` for an Academy seat. */
  items: [string, number][];
  pay: PaymentMethod;
  last4?: string;
  discount?: number;
  code?: string;
  attention?: AttentionReason;
}

const SEEDS: OrderSeed[] = [
  { ref: "GT-10482", at: "2026-09-17T16:04", customer: "lucas", status: "pending", payment: "pending", fulfillment: "unfulfilled", method: "standard", ship: 6.9, items: [["aurora-heart", 1], ["aftercare", 1]], pay: "paypal" },
  { ref: "GT-10481", at: "2026-09-17T15:21", customer: "clara", status: "confirmed", payment: "paid", fulfillment: "unfulfilled", method: "express", ship: 12.9, items: [["starter-kit", 1], ["gants", 2]], pay: "visa", last4: "4821", discount: 21.3, code: "STUDIO10" },
  { ref: "GT-10480", at: "2026-09-17T11:47", customer: "nora", status: "pending", payment: "failed", fulfillment: "unfulfilled", method: "standard", ship: 6.9, items: [["solitaire", 2]], pay: "mastercard", last4: "3096", attention: "paymentFailed" },
  { ref: "GT-10479", at: "2026-09-17T09:12", customer: "hannah", status: "processing", payment: "paid", fulfillment: "preparing", method: "express", ship: 12.9, items: [["opale", 3], ["etoile", 1]], pay: "visa", last4: "1174" },
  { ref: "GT-10478", at: "2026-09-16T18:55", customer: "aisling", status: "confirmed", payment: "paid", fulfillment: "unfulfilled", method: "digital", ship: 0, items: [["course:fondation", 1]], pay: "applePay" },
  { ref: "GT-10477", at: "2026-09-16T16:30", customer: "elodie", status: "processing", payment: "paid", fulfillment: "partiallyFulfilled", method: "standard", ship: 6.9, items: [["bond", 2], ["aftercare", 1], ["gants", 1]], pay: "visa", last4: "6602", attention: "lowStock" },
  { ref: "GT-10476", at: "2026-09-16T13:05", customer: "camille", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "express", ship: 12.9, items: [["aurora-heart", 4], ["capri", 2]], pay: "visa", last4: "4821" },
  { ref: "GT-10475", at: "2026-09-16T10:41", customer: "mathis", status: "pending", payment: "pending", fulfillment: "unfulfilled", method: "standard", ship: 6.9, items: [["amethyste", 1]], pay: "bankTransfer", attention: "addressIncomplete" },
  { ref: "GT-10474", at: "2026-09-15T20:14", customer: "fatou", status: "processing", payment: "paid", fulfillment: "preparing", method: "standard", ship: 0, items: [["starter-kit", 1], ["aftercare", 2]], pay: "mastercard", last4: "7745" },
  { ref: "GT-10473", at: "2026-09-15T17:02", customer: "theo", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["heliotrope", 2], ["sapphire-ab", 1]], pay: "paypal" },
  { ref: "GT-10472", at: "2026-09-15T12:38", customer: "ines", status: "confirmed", payment: "paid", fulfillment: "unfulfilled", method: "pickup", ship: 0, items: [["sun", 1], ["sunflower", 1]], pay: "applePay" },
  { ref: "GT-10471", at: "2026-09-15T09:27", customer: "sofia", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["peridot", 2], ["gants", 1]], pay: "visa", last4: "5518", attention: "delayed" },
  { ref: "GT-10470", at: "2026-09-14T19:45", customer: "clara", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "express", ship: 12.9, items: [["etoile", 2], ["opale", 1]], pay: "visa", last4: "4821" },
  { ref: "GT-10469", at: "2026-09-14T15:18", customer: "julien", status: "processing", payment: "paid", fulfillment: "preparing", method: "standard", ship: 0, items: [["starter-kit", 1]], pay: "mastercard", last4: "2380" },
  { ref: "GT-10468", at: "2026-09-14T11:02", customer: "hannah", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "express", ship: 12.9, items: [["aurora-heart", 3]], pay: "visa", last4: "1174" },
  { ref: "GT-10467", at: "2026-09-13T17:36", customer: "maelys", status: "cancelled", payment: "refunded", fulfillment: "unfulfilled", method: "standard", ship: 6.9, items: [["solitaire", 1], ["aftercare", 1]], pay: "paypal" },
  { ref: "GT-10466", at: "2026-09-13T14:20", customer: "camille", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["aftercare", 3], ["gants", 2]], pay: "visa", last4: "4821" },
  { ref: "GT-10465", at: "2026-09-13T10:55", customer: "aisling", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["opale", 2], ["aquamarine", 2]], pay: "applePay" },
  { ref: "GT-10464", at: "2026-09-12T21:07", customer: "nora", status: "processing", payment: "partiallyRefunded", fulfillment: "partiallyFulfilled", method: "express", ship: 12.9, items: [["starter-kit", 1], ["etoile", 1]], pay: "mastercard", last4: "3096", attention: "refundRequested" },
  { ref: "GT-10463", at: "2026-09-12T16:44", customer: "fatou", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["amethyste", 3], ["peridot", 1]], pay: "mastercard", last4: "7745" },
  { ref: "GT-10462", at: "2026-09-12T13:29", customer: "elodie", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["capri", 2], ["sun", 1]], pay: "visa", last4: "6602" },
  { ref: "GT-10461", at: "2026-09-12T09:50", customer: "theo", status: "confirmed", payment: "paid", fulfillment: "unfulfilled", method: "digital", ship: 0, items: [["course:avance", 1]], pay: "paypal", discount: 27.9, code: "ACADEMY10" },
  { ref: "GT-10460", at: "2026-09-11T18:22", customer: "clara", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "express", ship: 0, items: [["starter-kit", 2]], pay: "bankTransfer" },
  { ref: "GT-10459", at: "2026-09-11T15:03", customer: "ines", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["sunflower", 2]], pay: "applePay" },
  { ref: "GT-10458", at: "2026-09-11T11:41", customer: "hannah", status: "processing", payment: "paid", fulfillment: "preparing", method: "express", ship: 12.9, items: [["sapphire-ab", 4], ["gants", 1]], pay: "visa", last4: "1174", attention: "fulfillmentIssue" },
  { ref: "GT-10457", at: "2026-09-10T19:16", customer: "sofia", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["aftercare", 2]], pay: "visa", last4: "5518" },
  { ref: "GT-10456", at: "2026-09-10T16:02", customer: "maelys", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["heliotrope", 1], ["aurora-heart", 1]], pay: "paypal" },
  { ref: "GT-10455", at: "2026-09-10T12:35", customer: "camille", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "express", ship: 12.9, items: [["opale", 4]], pay: "visa", last4: "4821", discount: 21.6, code: "LOYAUTE10" },
  { ref: "GT-10454", at: "2026-09-10T09:08", customer: "julien", status: "refunded", payment: "refunded", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["etoile", 1]], pay: "mastercard", last4: "2380" },
  { ref: "GT-10453", at: "2026-09-09T20:44", customer: "fatou", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["solitaire", 3], ["aftercare", 1]], pay: "mastercard", last4: "7745" },
  { ref: "GT-10452", at: "2026-09-09T17:21", customer: "nora", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["aquamarine", 1]], pay: "paypal" },
  { ref: "GT-10451", at: "2026-09-09T13:58", customer: "aisling", status: "cancelled", payment: "refunded", fulfillment: "unfulfilled", method: "express", ship: 12.9, items: [["starter-kit", 1]], pay: "applePay" },
  { ref: "GT-10450", at: "2026-09-09T10:12", customer: "theo", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["peridot", 2], ["capri", 1]], pay: "paypal" },
  { ref: "GT-10449", at: "2026-09-08T19:33", customer: "clara", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "digital", ship: 0, items: [["course:business", 1]], pay: "visa", last4: "4821" },
  { ref: "GT-10448", at: "2026-09-08T15:47", customer: "hannah", status: "shipped", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["gants", 4], ["aftercare", 2]], pay: "visa", last4: "1174" },
  { ref: "GT-10447", at: "2026-09-08T11:19", customer: "elodie", status: "refunded", payment: "refunded", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["opale", 1], ["etoile", 1]], pay: "visa", last4: "6602" },
  { ref: "GT-10446", at: "2026-09-08T09:04", customer: "maelys", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["sun", 2]], pay: "applePay" },
  { ref: "GT-10445", at: "2026-09-07T18:50", customer: "sofia", status: "delivered", payment: "paid", fulfillment: "fulfilled", method: "standard", ship: 6.9, items: [["amethyste", 1], ["gants", 1]], pay: "visa", last4: "5518" },
];

/** Internal notes, keyed by order. Only the orders a human actually touched have any. */
const NOTES: Record<string, Omit<AdminNote, "id">[]> = {
  "GT-10480": [
    {
      author: "Léa — Support",
      at: "2026-09-17T12:10",
      body: {
        fr: "Paiement refusé par la banque (3-D Secure abandonné). Relance envoyée avec un lien de paiement valable 48 h.",
        en: "Payment declined by the bank (3-D Secure abandoned). Follow-up sent with a payment link valid for 48 h.",
      },
    },
  ],
  "GT-10477": [
    {
      author: "Marc — Logistique",
      at: "2026-09-16T17:05",
      body: {
        fr: "Lingettes Omniwipes en rupture. Expédition partielle du reste de la commande, réassort annoncé pour le 22/09.",
        en: "Omniwipes out of stock. Rest of the order shipped separately, restock announced for 22 Sep.",
      },
    },
    {
      author: "Léa — Support",
      at: "2026-09-16T17:41",
      body: {
        fr: "Cliente prévenue par e-mail : elle accepte un envoi en deux colis, sans frais supplémentaires.",
        en: "Customer informed by email: she accepts a two-parcel delivery at no extra cost.",
      },
    },
  ],
  "GT-10475": [
    {
      author: "Léa — Support",
      at: "2026-09-16T11:20",
      body: {
        fr: "Adresse sans numéro de rue ni bâtiment. Message envoyé au client, commande en attente de sa réponse.",
        en: "Address missing a street number and building. Message sent to the customer, order held pending their reply.",
      },
    },
  ],
  "GT-10476": [
    {
      author: "Camille — Atelier",
      at: "2026-09-16T14:02",
      body: {
        fr: "Commande studio récurrente : capsules regroupées dans une seule pochette stérile, à la demande de la cliente.",
        en: "Recurring studio order: capsules grouped in a single sterile pouch at the customer’s request.",
      },
    },
  ],
  "GT-10471": [
    {
      author: "Marc — Logistique",
      at: "2026-09-16T08:30",
      body: {
        fr: "Colis bloqué au centre de tri de Bruxelles depuis 48 h. Réclamation ouverte auprès de bpost.",
        en: "Parcel held at the Brussels sorting centre for 48 h. Claim opened with bpost.",
      },
    },
  ],
  "GT-10464": [
    {
      author: "Léa — Support",
      at: "2026-09-13T10:02",
      body: {
        fr: "Remboursement partiel demandé : l’Étoile Or est arrivée avec un éclat sur le sertissage. Remboursée, le kit reste acquis.",
        en: "Partial refund requested: the Gold Star arrived with a chipped setting. Refunded; the kit is kept.",
      },
    },
  ],
  "GT-10458": [
    {
      author: "Marc — Logistique",
      at: "2026-09-11T14:15",
      body: {
        fr: "Étiquette transporteur rejetée deux fois (poids déclaré incohérent). À repeser avant nouvelle édition.",
        en: "Carrier label rejected twice (declared weight inconsistent). Re-weigh before printing a new one.",
      },
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Derivation                                                                 */
/* -------------------------------------------------------------------------- */

const CARRIERS: Record<string, string> = { fr: "Colissimo", de: "DHL", be: "bpost", ie: "An Post" };

/** Minutes added to an ISO datetime, back out as the same `YYYY-MM-DDTHH:mm` shape. */
function shift(iso: string, minutes: number): string {
  const d = new Date(`${iso}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Same day as `iso`, at the given hour and minute. Keeps derived events plausible. */
function atTime(iso: string, dayOffset: number, hour: number, minute: number): string {
  const d = new Date(`${iso}:00`);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Digits of the reference, reused so a tracking number is stable per order. */
function refDigits(reference: string): string {
  return reference.replace(/\D/g, "");
}

function hasParcel(seed: OrderSeed): boolean {
  return seed.method !== "digital" && seed.method !== "pickup";
}

function buildShipment(seed: OrderSeed, country: string): AdminShipment | undefined {
  if (!hasParcel(seed)) return undefined;
  if (seed.status !== "shipped" && seed.status !== "delivered" && seed.status !== "refunded") return undefined;
  const lead = seed.method === "express" ? 2 : 4;
  const digits = refDigits(seed.ref);
  return {
    carrier: CARRIERS[country] ?? CARRIERS.fr,
    number: `${digits}${digits.split("").reverse().join("")}${country.toUpperCase()}`,
    estimatedDelivery: atTime(seed.at, lead, 12, 0).slice(0, 10),
  };
}

function buildTimeline(seed: OrderSeed): TimelineEvent[] {
  const events: TimelineEvent[] = [{ kind: "placed", at: seed.at }];

  if (seed.payment === "failed") events.push({ kind: "paymentFailed", at: shift(seed.at, 2) });
  else if (seed.payment !== "pending") events.push({ kind: "paymentConfirmed", at: shift(seed.at, 1) });

  if (seed.attention === "addressIncomplete") events.push({ kind: "addressFlagged", at: shift(seed.at, 39) });
  if (seed.attention === "lowStock") events.push({ kind: "stockFlagged", at: shift(seed.at, 35) });

  const started =
    seed.status === "processing" || seed.status === "shipped" || seed.status === "delivered" || seed.status === "refunded";
  if (started) events.push({ kind: "processing", at: shift(seed.at, 46) });

  if (seed.attention === "fulfillmentIssue") events.push({ kind: "fulfillmentFlagged", at: shift(seed.at, 154) });

  const shipped = seed.status === "shipped" || seed.status === "delivered" || seed.status === "refunded";
  if (shipped && hasParcel(seed)) events.push({ kind: "shipped", at: atTime(seed.at, 1, 9, 42) });

  if (seed.status === "delivered" || seed.status === "refunded") {
    events.push({ kind: "delivered", at: atTime(seed.at, hasParcel(seed) ? 3 : 0, hasParcel(seed) ? 13 : 0, 18) });
  }

  if (seed.attention === "delayed") events.push({ kind: "delayFlagged", at: atTime(seed.at, 4, 8, 30) });

  if (seed.payment === "partiallyRefunded") {
    events.push({ kind: "refundRequested", at: atTime(seed.at, 1, 10, 2) });
    events.push({ kind: "partiallyRefunded", at: atTime(seed.at, 1, 10, 23) });
  }

  if (seed.status === "cancelled") events.push({ kind: "cancelled", at: shift(seed.at, 252) });
  if (seed.payment === "refunded") {
    events.push({ kind: "refunded", at: seed.status === "cancelled" ? shift(seed.at, 260) : atTime(seed.at, 5, 11, 6) });
  }

  // A digital order has no parcel, so "delivered" would be the access grant. The
  // seeded digital orders never reach that status, but sort anyway: several
  // events share a day and the view renders them in order.
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function buildLines(items: [string, number][]): OrderLine[] {
  return items.map(([id, qty]) => (id.startsWith("course:") ? courseLine(id.slice(7)) : productLine(id, qty)));
}

function buildPayment(seed: OrderSeed, total: number): AdminPayment {
  const prefix = seed.pay === "paypal" ? "PAY" : seed.pay === "bankTransfer" ? "SEPA" : "ch";
  const digits = refDigits(seed.ref);
  const reference = seed.pay === "bankTransfer" ? `${prefix}-${digits}-FR76` : `${prefix}_3Q${digits}aK7Qd`;
  const captured = seed.payment === "pending" || seed.payment === "failed" ? 0 : total;
  const refunded =
    seed.payment === "refunded" ? total : seed.payment === "partiallyRefunded" ? round2(total * 0.24) : undefined;
  return {
    method: seed.pay,
    last4: seed.last4,
    status: seed.payment,
    reference,
    capturedAt: captured > 0 ? shift(seed.at, 1) : undefined,
    captured,
    refunded,
  };
}

function buildOrder(seed: OrderSeed): AdminOrder {
  const customer = CUSTOMERS[seed.customer];
  const lines = buildLines(seed.items);
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const total = round2(subtotal - (seed.discount ?? 0) + seed.ship);
  return {
    reference: seed.ref,
    placedAt: seed.at,
    status: seed.status,
    payment: buildPayment(seed, total),
    fulfillment: seed.fulfillment,
    attention: seed.attention,
    customer,
    lines,
    currency: "EUR",
    shippingMethod: seed.method,
    shippingCost: seed.ship,
    discount: seed.discount ?? 0,
    discountCode: seed.code,
    shipment: buildShipment(seed, customer.country),
    timeline: buildTimeline(seed),
    notes: (NOTES[seed.ref] ?? []).map((n, i) => ({ ...n, id: `${seed.ref}-n${i + 1}` })),
  };
}

/** The whole order book, newest first — the order the table shows by default. */
export const ADMIN_ORDERS: AdminOrder[] = SEEDS.map(buildOrder);

export function getAdminOrder(reference: string): AdminOrder | undefined {
  return ADMIN_ORDERS.find((o) => o.reference === reference);
}

/* -------------------------------------------------------------------------- */
/* Money and counts                                                           */
/* -------------------------------------------------------------------------- */

export function orderSubtotal(order: AdminOrder): number {
  return round2(order.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
}

export function orderTotal(order: AdminOrder): number {
  return round2(orderSubtotal(order) - order.discount + order.shippingCost);
}

/** VAT contained in the total, since catalogue prices are quoted tax-inclusive. */
export function orderTax(order: AdminOrder): number {
  const total = orderTotal(order);
  return round2(total - total / (1 + VAT_RATE));
}

export function orderItemCount(order: AdminOrder): number {
  return order.lines.reduce((sum, l) => sum + l.qty, 0);
}

export function customerName(customer: AdminCustomer): string {
  return `${customer.firstName} ${customer.lastName}`;
}

export function customerInitials(customer: AdminCustomer): string {
  return `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();
}

/** Whether the order has a parcel worth following. */
export function isTrackable(order: AdminOrder): boolean {
  return Boolean(order.shipment) && (order.status === "shipped" || order.status === "delivered");
}
