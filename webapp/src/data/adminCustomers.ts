import type { Localized } from "./types";
import type { AdminOrder } from "./adminOrders";
import type { SpentTotal } from "./orders";

/**
 * The customer base as the back office sees it: vocabulary and derived facts.
 *
 * The records come from Supabase (`lib/adminCustomers.tsx`, mapped by
 * `lib/adminCustomerMapping.ts`): `profiles` (role `customer`), the default
 * shipping address, `customer_tags`, `customer_notes`, the course seats of
 * `admin_customer_courses()` and the live order book. Nothing here is seeded.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/** `profiles.status`, as the database spells it. */
export type CustomerStatus = "active" | "suspended" | "deactivated";

export const CUSTOMER_STATUSES: CustomerStatus[] = ["active", "suspended", "deactivated"];

/**
 * What staff may set. A deactivated account is a closed one: it is shown and
 * filtered, never chosen from the back office.
 */
export type StaffSettableStatus = Exclude<CustomerStatus, "deactivated">;

export const STAFF_SETTABLE_STATUSES: StaffSettableStatus[] = ["active", "suspended"];

/**
 * Tags an administrator assigns by hand (`customer_tags.tag`, camel-cased).
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

/** One course seat (`admin_customer_courses()`), revoked seats left out. */
export interface Enrollment {
  courseId: string;
  title: Localized;
  /** ISO timestamp the seat starts. */
  enrolledAt: string;
  /** The learner's own rule: steps validated + checks passed, 0–100. */
  progress: number;
  /** Average check score once the course is completed. */
  score?: number;
  /** ISO timestamp the course was completed, from `course_completions`. */
  completedAt?: string;
  /** Whether a certificate code was issued. */
  certificate: boolean;
  /** ISO timestamp of the last step validated or check submitted. */
  lastActivity?: string;
  /** The course is no longer published (the learner sees it greyed out). */
  withdrawn: boolean;
}

/** An internal note (`customer_notes`). */
export interface CustomerNote {
  id: string;
  /** Null when the author's account no longer exists. */
  authorId: string | null;
  author: string;
  /** ISO timestamp. */
  at: string;
  body: string;
}

/** A status change read from the audit trail (`admin_customer_status_history()`). */
export interface StatusChange {
  at: string;
  from: CustomerStatus | null;
  to: CustomerStatus;
  actor: string | null;
}

export type CustomerEventKind =
  | "accountCreated"
  | "orderPlaced"
  | "orderDelivered"
  | "trainingPurchased"
  | "courseCompleted"
  | "diplomaIssued"
  | "statusChanged"
  | "noteAdded";

/** Something that happened on the account, assembled from the records. */
export interface CustomerEvent {
  kind: CustomerEventKind;
  /** ISO date or timestamp. */
  at: string;
  /** Free detail shown after the event name: an order reference, an author, a status. */
  detail?: string;
  /** The course an Academy event is about. */
  course?: Localized;
}

/** The default shipping address of the customer's own address book. */
export interface CustomerAddress {
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  /** Lower-case ISO code. */
  country: string;
}

export interface AdminCustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Empty when not given. */
  phone: string;
  /** ISO date (YYYY-MM-DD) of registration. */
  since: string;
  /** `profiles.country_code`, lower-case, empty when not given. */
  country: string;
  address: CustomerAddress | null;
  status: CustomerStatus;
  tags: CustomerTag[];
  /** ISO date. */
  birthDate?: string;
  /** The consent cache the customer controls; read-only here. */
  marketingOptIn: boolean;
  enrollments: Enrollment[];
  notes: CustomerNote[];
  /** Orders of the live book. */
  orderCount: number;
  /** Net spend per currency, minor units, never added across currencies. */
  spend: SpentTotal[];
  /** Net spend in the store currency (EUR), minor units: sorting and filtering only. */
  spendRank: number;
}

/* -------------------------------------------------------------------------- */
/* Derived facts                                                              */
/* -------------------------------------------------------------------------- */

/** The currency spend is ranked and filtered in. Amounts in others are shown, never converted. */
export const RANK_CURRENCY = "EUR";

/**
 * Where the customer stands with the Academy, as one value.
 *
 * Derived from the seats rather than stored, so the training badge in the table
 * cannot contradict the course list on the detail page. "Completed" means every
 * seat is completed; a student who finished one course and started another is
 * still in progress, because that is what an administrator needs to know before
 * sending them anything.
 */
export function trainingState(customer: Pick<AdminCustomerRecord, "enrollments">): TrainingState {
  if (customer.enrollments.length === 0) return "none";
  if (customer.enrollments.every((e) => e.completedAt)) return "completed";
  if (customer.enrollments.some((e) => e.progress > 0 || e.completedAt)) return "inProgress";
  return "enrolled";
}

/** The segment filter's value. Judged from the relationship, not stored. */
export function customerSegment(customer: Pick<AdminCustomerRecord, "tags" | "enrollments">): CustomerSegment {
  if (customer.tags.includes("vip") || customer.tags.includes("highValue")) return "vip";
  if (customer.enrollments.length > 0) return "student";
  return "customer";
}

/** This customer's orders in the book, newest first. */
export function customerOrders(customer: Pick<AdminCustomerRecord, "id">, orders: AdminOrder[]): AdminOrder[] {
  return orders
    .filter((o) => o.customer.id === customer.id)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** ISO timestamp of the customer's most recent order, if there is one. */
export function lastOrderAt(customer: Pick<AdminCustomerRecord, "id">, orders: AdminOrder[]): string | undefined {
  return customerOrders(customer, orders)[0]?.placedAt;
}

/**
 * Average basket, minor units, when every paid order is in one currency.
 * Null otherwise: an average across currencies is not a number.
 */
export function averageBasket(
  customer: Pick<AdminCustomerRecord, "spend">,
  orders: AdminOrder[],
): SpentTotal | null {
  if (customer.spend.length !== 1) return null;
  const { currency, amount } = customer.spend[0];
  const paid = orders.filter(
    (o) =>
      o.currency === currency &&
      o.status !== "cancelled" &&
      (o.payment.status === "paid" || o.payment.status === "partiallyRefunded" || o.payment.status === "refunded"),
  ).length;
  return paid === 0 ? null : { currency, amount: Math.round(amount / paid) };
}

/**
 * The account's history, oldest first.
 *
 * Assembled from the facts rather than typed out: the registration date, the
 * orders the book holds, each course seat's dates, the notes and the status
 * changes the audit trail recorded. A timeline that can disagree with the
 * record above it is worse than no timeline.
 */
export function customerActivity(
  customer: AdminCustomerRecord,
  orders: AdminOrder[],
  statusHistory: StatusChange[] = [],
): CustomerEvent[] {
  const events: CustomerEvent[] = [{ kind: "accountCreated", at: customer.since }];

  customerOrders(customer, orders).forEach((order) => {
    events.push({ kind: "orderPlaced", at: order.placedAt, detail: `#${order.reference}` });
    const delivered = order.timeline.find((e) => e.kind === "delivered");
    if (delivered) events.push({ kind: "orderDelivered", at: delivered.at, detail: `#${order.reference}` });
  });

  customer.enrollments.forEach((seat) => {
    events.push({ kind: "trainingPurchased", at: seat.enrolledAt, course: seat.title });
    if (seat.completedAt) {
      events.push({ kind: "courseCompleted", at: seat.completedAt, course: seat.title });
      if (seat.certificate) events.push({ kind: "diplomaIssued", at: seat.completedAt, course: seat.title });
    }
  });

  customer.notes.forEach((note) => events.push({ kind: "noteAdded", at: note.at, detail: note.author }));
  statusHistory.forEach((change) =>
    events.push({ kind: "statusChanged", at: change.at, detail: change.to }),
  );

  return events.sort((a, b) => toDate(a.at).getTime() - toDate(b.at).getTime());
}

/**
 * A date or timestamp as a `Date`. Plain days are read at noon, so a time zone
 * can never move them to the day before.
 */
export function toDate(at: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return new Date(`${at}T12:00:00`);
  return new Date(at);
}

/** True when `at` carries a time of day (a timestamp rather than a plain date). */
export function hasTime(at: string): boolean {
  return at.includes("T");
}

/** The name to show: first and last name, else the e-mail's local part. */
export function customerName(customer: Pick<AdminCustomerRecord, "firstName" | "lastName" | "email">): string {
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  return name || customer.email.split("@")[0];
}

export function customerInitials(customer: Pick<AdminCustomerRecord, "firstName" | "lastName" | "email">): string {
  const initials = `${customer.firstName.trim()[0] ?? ""}${customer.lastName.trim()[0] ?? ""}`;
  return (initials || customer.email[0] || "?").toUpperCase();
}

/** The first block of the account id: enough to tell two people apart on screen. */
export function customerShortId(customer: Pick<AdminCustomerRecord, "id">): string {
  return customer.id.slice(0, 8);
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
