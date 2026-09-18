import type { Localized } from "./types";
import { ADMIN_CUSTOMERS, type AdminCustomer, type AdminNote, type AdminOrder } from "./adminOrders";

/**
 * The customer base as the back office sees it.
 *
 * This file *extends* `data/adminOrders.ts` rather than replacing it. That file
 * already owns `AdminCustomer` — the identity an order is attached to — and the
 * fourteen people who have ordered in the current book. Re-declaring them here
 * would give the same person two records, and the order detail page's customer
 * card and this page's table would drift apart on the first edit.
 *
 * So the split is: `adminOrders` owns *who the customer is*, and this file owns
 * *what the relationship is* — account status, tags, training, internal notes.
 * `AGENTS.md` section 6 keeps commerce and learning separate while sharing one
 * customer identity, and this is what that looks like in the prototype.
 *
 * Two figures are worth being explicit about, because they look like a bug
 * until you know the shape of the data:
 *
 * - `orderCount` and `lifetimeValue` are **lifetime** totals, seeded per
 *   customer. They are what `DetailPanels`' customer card already shows.
 * - `ADMIN_ORDERS` is a **recent window** — 46 orders over eleven days. A
 *   customer with fifteen lifetime orders has four of them in the book.
 *
 * Both are true at once, so the interface never presents them as the same
 * number: the summary says "15 orders · 2,380 € lifetime", and the orders tab
 * says "4 orders in this workspace". A single figure derived from the book
 * would contradict the order pages; a single seeded figure would contradict the
 * list of orders printed under it.
 *
 * Mock data, front-end only. A real customer record is a server-side row behind
 * RBAC, a status change is an audited transition, and none of this is
 * authorization.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export type CustomerStatus = "active" | "inactive" | "suspended";

export const CUSTOMER_STATUSES: CustomerStatus[] = ["active", "inactive", "suspended"];

/**
 * Tags an administrator assigns by hand.
 *
 * Deliberately not derived from the figures: "needs follow-up" is a judgement,
 * and a tag the system can rewrite under the operator is not a tag they can
 * rely on. The ones that *look* derivable — VIP, repeat customer — stay manual
 * for the same reason a CRM keeps them manual: they mean "we treat this person
 * as VIP", not "this person crossed a threshold".
 */
export type CustomerTag =
  | "vip"
  | "repeat"
  | "trainingStudent"
  | "trainingCompleted"
  | "newCustomer"
  | "highValue"
  | "followUp";

export const CUSTOMER_TAGS: CustomerTag[] = [
  "vip",
  "repeat",
  "trainingStudent",
  "trainingCompleted",
  "newCustomer",
  "highValue",
  "followUp",
];

/** Where a customer stands with the Academy, as one word for the table. */
export type TrainingState = "none" | "enrolled" | "inProgress" | "completed";

/** The segment filter. Derived, never stored — see `customerSegment`. */
export type CustomerSegment = "customer" | "student" | "vip";

export const CUSTOMER_SEGMENTS: CustomerSegment[] = ["customer", "student", "vip"];

/** One seat in one course. */
export interface Enrollment {
  /** A real id from `data/courses.ts`. */
  courseId: string;
  /** ISO date the seat was bought. */
  enrolledAt: string;
  /** Lessons completed, 0–100. */
  progress: number;
  /** Final quiz score, once the course is finished. */
  score?: number;
  /** Whether the certificate has been issued. */
  certificate?: boolean;
  /** ISO date of the last lesson opened. */
  lastActivity: string;
}

/**
 * Something that happened on the account.
 *
 * Most of these are *derived* rather than seeded — see `customerActivity`. Only
 * the events that leave no other trace (a profile edit, a suspension) are typed
 * out, which is the same rule `adminOrders` applies to order timelines: a
 * history that can disagree with the record above it is worse than no history.
 */
export type CustomerEventKind =
  | "accountCreated"
  | "orderPlaced"
  | "orderDelivered"
  | "trainingPurchased"
  | "courseStarted"
  | "courseCompleted"
  | "diplomaIssued"
  | "profileUpdated"
  | "statusChanged"
  | "noteAdded";

export interface CustomerEvent {
  kind: CustomerEventKind;
  /** ISO datetime (YYYY-MM-DDTHH:mm) or ISO date. */
  at: string;
  /** Free detail shown after the event name: an order reference, a course id. */
  detail?: string;
}

export interface AdminCustomerRecord extends AdminCustomer {
  status: CustomerStatus;
  tags: CustomerTag[];
  /** ISO date. Absent for the customers who never filled it in — most of them. */
  birthDate?: string;
  enrollments: Enrollment[];
  notes: AdminNote[];
  /** Hand-written history only. `customerActivity` merges it with the rest. */
  events: CustomerEvent[];
  marketingOptIn: boolean;
}

/* -------------------------------------------------------------------------- */
/* The customers who have ordered                                             */
/* -------------------------------------------------------------------------- */

/**
 * CRM fields for the fourteen identities `adminOrders` already defines.
 *
 * Keyed by their existing id so the two files cannot fall out of step: adding a
 * customer to the order book without giving them a relationship here throws at
 * module load rather than rendering a blank row nobody notices.
 */
type Relationship = Omit<AdminCustomerRecord, keyof AdminCustomer>;

const RELATIONSHIPS: Record<string, Relationship> = {
  camille: {
    status: "active",
    tags: ["vip", "repeat", "highValue"],
    birthDate: "1994-05-22",
    marketingOptIn: true,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2024-04-02", progress: 100, score: 92, certificate: true, lastActivity: "2024-05-18" },
      { courseId: "avance", enrolledAt: "2026-06-11", progress: 64, lastActivity: "2026-09-11" },
    ],
    notes: [
      {
        id: "camille-n1",
        author: "Léa — Support",
        at: "2026-08-28T10:20",
        body: {
          fr: "Studio partenaire depuis 2024. Commande pour son salon, facturation au nom de la société — vérifier le champ société avant chaque facture.",
          en: "Partner studio since 2024. Orders for her salon, invoiced to the company — check the company field before every invoice.",
        },
      },
    ],
    events: [{ kind: "profileUpdated", at: "2026-07-02T09:15" }],
  },
  nora: {
    status: "active",
    tags: ["repeat"],
    marketingOptIn: true,
    enrollments: [],
    notes: [],
    events: [],
  },
  elodie: {
    status: "active",
    tags: ["repeat", "highValue", "trainingCompleted"],
    birthDate: "1991-11-30",
    marketingOptIn: false,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2024-11-20", progress: 100, score: 88, certificate: true, lastActivity: "2025-01-14" },
      { courseId: "business", enrolledAt: "2025-03-08", progress: 100, score: 95, certificate: true, lastActivity: "2025-05-02" },
    ],
    notes: [],
    events: [{ kind: "profileUpdated", at: "2026-03-19T16:40" }],
  },
  lucas: {
    status: "active",
    tags: ["newCustomer", "followUp"],
    marketingOptIn: true,
    enrollments: [],
    notes: [
      {
        id: "lucas-n1",
        author: "Léa — Support",
        at: "2026-09-17T12:14",
        body: {
          fr: "Première commande, paiement refusé par la banque. Lien de paiement renvoyé — à rappeler si rien sous 48 h.",
          en: "First order, payment declined by the bank. Payment link resent — call back if nothing within 48 h.",
        },
      },
    ],
    events: [],
  },
  sofia: {
    status: "active",
    tags: ["repeat"],
    marketingOptIn: true,
    enrollments: [{ courseId: "fondation", enrolledAt: "2026-08-30", progress: 38, lastActivity: "2026-09-14" }],
    notes: [],
    events: [],
  },
  mathis: {
    status: "active",
    tags: [],
    marketingOptIn: false,
    enrollments: [],
    notes: [],
    events: [],
  },
  aisling: {
    status: "active",
    tags: ["repeat", "trainingStudent", "highValue"],
    birthDate: "1996-02-08",
    marketingOptIn: true,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2025-03-14", progress: 100, score: 79, certificate: true, lastActivity: "2025-04-29" },
      { courseId: "avance", enrolledAt: "2026-09-02", progress: 22, lastActivity: "2026-09-16" },
    ],
    notes: [
      {
        id: "aisling-n1",
        author: "Marc — Logistique",
        at: "2026-09-08T11:05",
        body: {
          fr: "Livraisons Irlande : privilégier l'expédition express, le standard dépasse souvent 10 jours sur cette adresse.",
          en: "Ireland deliveries: prefer express shipping, standard regularly exceeds 10 days to this address.",
        },
      },
    ],
    events: [],
  },
  hannah: {
    status: "active",
    tags: ["vip", "repeat", "highValue", "trainingCompleted"],
    birthDate: "1989-07-17",
    marketingOptIn: true,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2024-08-21", progress: 100, score: 96, certificate: true, lastActivity: "2024-10-03" },
      { courseId: "avance", enrolledAt: "2025-01-16", progress: 100, score: 91, certificate: true, lastActivity: "2025-03-11" },
      { courseId: "business", enrolledAt: "2026-05-04", progress: 71, lastActivity: "2026-09-13" },
    ],
    notes: [],
    events: [{ kind: "profileUpdated", at: "2026-01-23T14:02" }],
  },
  ines: {
    status: "active",
    tags: [],
    marketingOptIn: true,
    enrollments: [],
    notes: [],
    events: [],
  },
  theo: {
    status: "active",
    tags: ["repeat", "trainingStudent"],
    marketingOptIn: false,
    enrollments: [{ courseId: "fondation", enrolledAt: "2026-07-19", progress: 55, lastActivity: "2026-09-15" }],
    notes: [],
    events: [],
  },
  clara: {
    status: "active",
    tags: ["vip", "repeat", "highValue", "trainingCompleted"],
    birthDate: "1987-09-04",
    marketingOptIn: true,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2023-10-15", progress: 100, score: 94, certificate: true, lastActivity: "2023-12-01" },
      { courseId: "avance", enrolledAt: "2024-02-27", progress: 100, score: 98, certificate: true, lastActivity: "2024-04-16" },
      { courseId: "business", enrolledAt: "2024-09-10", progress: 100, score: 90, certificate: true, lastActivity: "2024-11-22" },
    ],
    notes: [
      {
        id: "clara-n1",
        author: "Léa — Support",
        at: "2026-06-04T09:40",
        body: {
          fr: "Meilleure cliente du fichier. Formatrice invitée sur l'atelier de novembre — accord verbal, à confirmer par écrit.",
          en: "Highest-value customer on file. Guest trainer for the November workshop — verbal agreement, to be confirmed in writing.",
        },
      },
      {
        id: "clara-n2",
        author: "Marc — Logistique",
        at: "2026-09-10T15:28",
        body: {
          fr: "Commandes groupées pour son studio : préparer en une seule expédition quand deux commandes tombent le même jour.",
          en: "Bulk orders for her studio: combine into a single shipment when two orders land on the same day.",
        },
      },
    ],
    events: [{ kind: "profileUpdated", at: "2025-11-08T10:11" }],
  },
  julien: {
    status: "active",
    tags: ["newCustomer"],
    marketingOptIn: true,
    enrollments: [],
    notes: [],
    events: [],
  },
  maelys: {
    status: "active",
    tags: ["repeat", "trainingStudent"],
    marketingOptIn: true,
    enrollments: [{ courseId: "fondation", enrolledAt: "2026-08-12", progress: 47, lastActivity: "2026-09-16" }],
    notes: [],
    events: [],
  },
  fatou: {
    status: "active",
    tags: ["repeat", "highValue", "trainingCompleted"],
    birthDate: "1993-03-26",
    marketingOptIn: false,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2024-07-02", progress: 100, score: 85, certificate: true, lastActivity: "2024-08-20" },
      { courseId: "avance", enrolledAt: "2025-10-14", progress: 100, score: 87, certificate: true, lastActivity: "2025-12-05" },
    ],
    notes: [],
    events: [],
  },
};

/* -------------------------------------------------------------------------- */
/* The customers who have not                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Accounts with no order in the current book.
 *
 * They exist because the states an administrator has to be able to *find* —
 * a suspended account, a dormant one, someone who registered yesterday and has
 * bought nothing — are exactly the ones the order book cannot contain. A
 * customer list seeded only from orders would have no empty rows in it, and the
 * "no orders" filter would be untestable.
 */
const EXTRA: AdminCustomerRecord[] = [
  {
    id: "ilhan",
    firstName: "Ilhan",
    lastName: "Yilmaz",
    email: "ilhan.yilmaz@gmail.com",
    phone: "+33 6 12 77 40 18",
    orderCount: 0,
    since: "2026-09-16",
    lifetimeValue: 0,
    addressLine: "9 rue des Trois Frères",
    postalCode: "75018",
    city: "Paris",
    country: "fr",
    status: "active",
    tags: ["newCustomer"],
    marketingOptIn: true,
    enrollments: [],
    notes: [],
    events: [],
  },
  {
    id: "margot",
    firstName: "Margot",
    lastName: "Lefèvre",
    email: "margot.lefevre@outlook.fr",
    phone: "+33 7 61 05 93 22",
    orderCount: 0,
    since: "2026-09-12",
    lifetimeValue: 0,
    addressLine: "24 quai Saint-Vincent",
    postalCode: "69001",
    city: "Lyon",
    country: "fr",
    status: "active",
    tags: ["newCustomer", "followUp"],
    marketingOptIn: true,
    enrollments: [],
    notes: [
      {
        id: "margot-n1",
        author: "Léa — Support",
        at: "2026-09-15T14:35",
        body: {
          fr: "A demandé par mail si la Fondation couvre le matériel. Réponse envoyée, panier abandonné depuis — relancer en fin de semaine.",
          en: "Asked by email whether the Foundation course covers equipment. Answered; cart abandoned since — follow up at the end of the week.",
        },
      },
    ],
    events: [],
  },
  {
    id: "priya",
    firstName: "Priya",
    lastName: "Raman",
    email: "priya.raman@studiolumen.de",
    phone: "+49 151 2277 9043",
    orderCount: 1,
    since: "2026-09-04",
    lifetimeValue: 249,
    addressLine: "Kastanienallee 71",
    postalCode: "10435",
    city: "Berlin",
    country: "de",
    status: "active",
    tags: ["newCustomer", "trainingStudent"],
    marketingOptIn: true,
    enrollments: [{ courseId: "fondation", enrolledAt: "2026-09-04", progress: 12, lastActivity: "2026-09-15" }],
    notes: [],
    events: [],
  },
  {
    id: "yasmine",
    firstName: "Yasmine",
    lastName: "Benali",
    email: "yasmine.benali@gmail.com",
    phone: "+32 470 88 21 06",
    orderCount: 2,
    since: "2025-04-11",
    lifetimeValue: 164,
    addressLine: "18 rue du Marché aux Herbes",
    postalCode: "1000",
    city: "Bruxelles",
    country: "be",
    status: "inactive",
    tags: [],
    marketingOptIn: false,
    enrollments: [],
    notes: [
      {
        id: "yasmine-n1",
        author: "Léa — Support",
        at: "2026-05-02T09:50",
        body: {
          fr: "Aucune commande depuis avril 2025. Désinscrite de la newsletter à sa demande — ne pas inclure dans les relances marketing.",
          en: "No order since April 2025. Unsubscribed from the newsletter at her request — do not include in marketing follow-ups.",
        },
      },
    ],
    events: [{ kind: "profileUpdated", at: "2026-05-02T09:44" }],
  },
  {
    id: "romain",
    firstName: "Romain",
    lastName: "Delcourt",
    email: "romain.delcourt@laposte.net",
    phone: "+33 6 33 51 08 74",
    orderCount: 1,
    since: "2024-01-29",
    lifetimeValue: 42,
    addressLine: "6 rue Gambetta",
    postalCode: "59000",
    city: "Lille",
    country: "fr",
    status: "inactive",
    tags: [],
    marketingOptIn: false,
    enrollments: [],
    notes: [],
    events: [],
  },
  {
    id: "noemie",
    firstName: "Noémie",
    lastName: "Carpentier",
    email: "noemie.carpentier@gmail.com",
    phone: "+33 7 14 62 39 55",
    orderCount: 3,
    since: "2025-08-07",
    lifetimeValue: 231,
    addressLine: "12 rue Sainte-Catherine",
    postalCode: "33000",
    city: "Bordeaux",
    country: "fr",
    status: "suspended",
    tags: ["followUp"],
    marketingOptIn: false,
    enrollments: [{ courseId: "fondation", enrolledAt: "2025-09-19", progress: 31, lastActivity: "2025-11-24" }],
    notes: [
      {
        id: "noemie-n1",
        author: "Marc — Logistique",
        at: "2026-02-17T11:22",
        body: {
          fr: "Compte suspendu : trois litiges bancaires ouverts sur des commandes livrées. Dossier transmis à la comptabilité.",
          en: "Account suspended: three chargebacks opened on delivered orders. File passed to accounting.",
        },
      },
    ],
    events: [{ kind: "statusChanged", at: "2026-02-17T11:20", detail: "suspended" }],
  },
  {
    id: "dieter",
    firstName: "Dieter",
    lastName: "Hoffmann",
    email: "dieter.hoffmann@web.de",
    phone: "+49 172 5510 288",
    orderCount: 0,
    since: "2026-03-22",
    lifetimeValue: 0,
    addressLine: "Lindenstraße 14",
    postalCode: "50667",
    city: "Köln",
    country: "de",
    status: "suspended",
    tags: [],
    marketingOptIn: false,
    enrollments: [],
    notes: [
      {
        id: "dieter-n1",
        author: "Léa — Support",
        at: "2026-04-05T16:10",
        body: {
          fr: "Compte suspendu après signalement : tentatives répétées de création de comptes multiples avec la même carte.",
          en: "Account suspended after a report: repeated attempts to create multiple accounts with the same card.",
        },
      },
    ],
    events: [{ kind: "statusChanged", at: "2026-04-05T16:08", detail: "suspended" }],
  },
  {
    id: "siobhan",
    firstName: "Siobhán",
    lastName: "Murphy",
    email: "siobhan.murphy@gemstudio.ie",
    phone: "+353 85 774 1290",
    orderCount: 6,
    since: "2024-10-16",
    lifetimeValue: 870,
    addressLine: "31 South William Street",
    postalCode: "D02 XK75",
    city: "Dublin",
    country: "ie",
    status: "active",
    tags: ["repeat", "trainingCompleted", "highValue"],
    birthDate: "1990-12-19",
    marketingOptIn: true,
    enrollments: [
      { courseId: "fondation", enrolledAt: "2024-11-03", progress: 100, score: 82, certificate: true, lastActivity: "2025-01-08" },
      { courseId: "business", enrolledAt: "2026-09-09", progress: 8, lastActivity: "2026-09-17" },
    ],
    notes: [],
    events: [],
  },
];

/* -------------------------------------------------------------------------- */
/* The base                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every customer, newest registration first — the order the table opens on.
 *
 * Built by joining `ADMIN_CUSTOMERS` to `RELATIONSHIPS`, so the identity has
 * exactly one definition in the codebase.
 */
export const ADMIN_CUSTOMER_RECORDS: AdminCustomerRecord[] = [
  ...ADMIN_CUSTOMERS.map((customer) => {
    const relationship = RELATIONSHIPS[customer.id];
    if (!relationship) throw new Error(`No admin relationship seeded for customer "${customer.id}"`);
    return { ...customer, ...relationship };
  }),
  ...EXTRA,
].sort((a, b) => b.since.localeCompare(a.since));

/**
 * "Today" for the registration-date presets, anchored to the most recent
 * registration for the same reason `adminOrderFilters` anchors to the newest
 * order: the data is fixed, and a "Today" preset that returns nothing reads as
 * a broken filter rather than as a quiet seed date.
 */
export const BASE_TODAY: string = ADMIN_CUSTOMER_RECORDS.reduce(
  (latest, c) => (c.since > latest ? c.since : latest),
  ADMIN_CUSTOMER_RECORDS[0].since,
);

/* -------------------------------------------------------------------------- */
/* Derived facts                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where the customer stands with the Academy, as one value.
 *
 * Derived from the seats rather than stored, so the training badge in the table
 * cannot contradict the course list on the detail page. "Completed" means every
 * seat is finished; a student who finished one course and started another is
 * still in progress, because that is what an administrator needs to know before
 * sending them anything.
 */
export function trainingState(customer: AdminCustomerRecord): TrainingState {
  if (customer.enrollments.length === 0) return "none";
  if (customer.enrollments.every((e) => e.progress >= 100)) return "completed";
  if (customer.enrollments.some((e) => e.progress > 0)) return "inProgress";
  return "enrolled";
}

/** The segment filter's value. Judged from the relationship, not stored. */
export function customerSegment(customer: AdminCustomerRecord): CustomerSegment {
  if (customer.tags.includes("vip") || customer.tags.includes("highValue")) return "vip";
  if (customer.enrollments.length > 0) return "student";
  return "customer";
}

/** Lifetime average basket. Zero orders has no average, so it reports zero. */
export function averageOrderValue(customer: AdminCustomerRecord): number {
  if (customer.orderCount === 0) return 0;
  return Math.round((customer.lifetimeValue / customer.orderCount) * 100) / 100;
}

/** This customer's orders in the current book, newest first. */
export function customerOrders(customer: AdminCustomerRecord, orders: AdminOrder[]): AdminOrder[] {
  return orders
    .filter((o) => o.customer.id === customer.id)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** ISO datetime of the most recent order in the book, if there is one. */
export function lastOrderAt(customer: AdminCustomerRecord, orders: AdminOrder[]): string | undefined {
  return customerOrders(customer, orders)[0]?.placedAt;
}

/**
 * The account's history, oldest first.
 *
 * Assembled from the facts rather than typed out: the account's own
 * registration date, the orders the book holds, and each course seat's dates.
 * Only what leaves no other trace — a profile edit, a suspension — is seeded.
 * The rule is `adminOrders`': a timeline that can disagree with the record
 * above it is worse than no timeline.
 */
export function customerActivity(customer: AdminCustomerRecord, orders: AdminOrder[]): CustomerEvent[] {
  const events: CustomerEvent[] = [{ kind: "accountCreated", at: customer.since }];

  customerOrders(customer, orders).forEach((order) => {
    events.push({ kind: "orderPlaced", at: order.placedAt, detail: `#${order.reference}` });
    if (order.status === "delivered") {
      const delivered = order.timeline.find((e) => e.kind === "delivered");
      if (delivered) events.push({ kind: "orderDelivered", at: delivered.at, detail: `#${order.reference}` });
    }
  });

  customer.enrollments.forEach((seat) => {
    events.push({ kind: "trainingPurchased", at: seat.enrolledAt, detail: seat.courseId });
    if (seat.progress > 0) events.push({ kind: "courseStarted", at: seat.enrolledAt, detail: seat.courseId });
    if (seat.progress >= 100) {
      events.push({ kind: "courseCompleted", at: seat.lastActivity, detail: seat.courseId });
      if (seat.certificate) events.push({ kind: "diplomaIssued", at: seat.lastActivity, detail: seat.courseId });
    }
  });

  customer.notes.forEach((note) => events.push({ kind: "noteAdded", at: note.at, detail: note.author }));
  customer.events.forEach((event) => events.push(event));

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function customerName(customer: AdminCustomerRecord): string {
  return `${customer.firstName} ${customer.lastName}`;
}

export function customerInitials(customer: AdminCustomerRecord): string {
  return `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();
}

/**
 * A stable pastel for the avatar, chosen from the id.
 *
 * Not random and not stored: the same person keeps the same colour across the
 * table, the detail page and a reload, which is what makes an avatar a
 * recognition aid rather than decoration. Initials carry the identity; the
 * tint only helps the eye come back to the same row.
 */
const AVATAR_TINTS = [
  "var(--gt-blue-200)",
  "var(--gt-emerald-300)",
  "var(--gt-fuchsia-300)",
  "var(--gt-blue-300)",
  "var(--gt-amber-400)",
  "var(--gt-ink-200)",
];

export function avatarTint(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

/** A `Localized` body for a note typed now, in whichever language it was typed. */
export function noteBody(body: string): Localized {
  return { fr: body, en: body };
}
