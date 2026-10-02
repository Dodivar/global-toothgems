import type { AdminOrder } from "../data/adminOrders";
import {
  RANK_CURRENCY,
  customerOrders,
  type AdminCustomerRecord,
  type CustomerNote,
  type CustomerStatus,
  type CustomerTag,
  type Enrollment,
  type StaffSettableStatus,
  type StatusChange,
} from "../data/adminCustomers";
import { spendOf } from "./adminOrderMapping";
import type { Database, TablesUpdate } from "./supabase/database.types";

/**
 * Row ↔ UI mapping of the customers workspace — pure, unit-tested.
 *
 * The reads are the Supabase rows `lib/adminCustomers.tsx` fetches; the writes
 * are the patches it sends. Every rule the database would refuse anyway
 * (`profiles` CHECKs, read-only columns) is mirrored here so the form can say
 * which field is wrong instead of a generic refusal.
 */

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export const CUSTOMER_PROFILE_SELECT =
  "id, email, first_name, last_name, display_name, phone, status, created_at, country_code, birth_date, marketing_opt_in";

export interface CustomerProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  country_code: string | null;
  birth_date: string | null;
  marketing_opt_in: boolean | null;
}

export const CUSTOMER_ADDRESS_SELECT = "user_id, address_line1, address_line2, postal_code, city, country_code";

export interface CustomerAddressRow {
  user_id: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string | null;
  city: string;
  country_code: string;
}

export interface CustomerTagRow {
  user_id: string;
  tag: string;
}

export const CUSTOMER_NOTE_SELECT =
  "id, user_id, author_id, body, created_at, author:profiles!customer_notes_author_id_fkey(display_name, first_name, last_name, email)";

export interface CustomerNoteRow {
  id: string;
  user_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author: { display_name: string | null; first_name: string | null; last_name: string | null; email: string | null } | null;
}

export type CustomerCourseRow = Database["public"]["Functions"]["admin_customer_courses"]["Returns"][number];
export type StatusHistoryRow = Database["public"]["Functions"]["admin_customer_status_history"]["Returns"][number];

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

const STATUSES: CustomerStatus[] = ["active", "suspended", "deactivated"];

/** An unknown status reads as closed: never show an account as usable when it may not be. */
export function statusFromDb(value: string | null | undefined): CustomerStatus {
  return STATUSES.includes(value as CustomerStatus) ? (value as CustomerStatus) : "deactivated";
}

const TAG_TO_DB: Record<CustomerTag, string> = {
  vip: "vip",
  repeat: "repeat",
  trainingStudent: "training_student",
  trainingCompleted: "training_completed",
  newCustomer: "new_customer",
  highValue: "high_value",
  followUp: "follow_up",
};

const TAG_FROM_DB: Record<string, CustomerTag> = Object.fromEntries(
  Object.entries(TAG_TO_DB).map(([ui, db]) => [db, ui as CustomerTag]),
);

export function tagToDb(tag: CustomerTag): string {
  return TAG_TO_DB[tag];
}

export function tagFromDb(value: string): CustomerTag | null {
  return TAG_FROM_DB[value] ?? null;
}

/** Tags to insert and to delete to go from `current` to `next`. */
export function tagDiff(current: CustomerTag[], next: CustomerTag[]): { add: CustomerTag[]; remove: CustomerTag[] } {
  return {
    add: next.filter((tag) => !current.includes(tag)),
    remove: current.filter((tag) => !next.includes(tag)),
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

function personName(p: { display_name: string | null; first_name: string | null; last_name: string | null; email: string | null }) {
  const full = [p.first_name, p.last_name].map((s) => s?.trim() ?? "").filter(Boolean).join(" ");
  return p.display_name?.trim() || full || p.email || "";
}

export function mapNote(row: CustomerNoteRow): CustomerNote {
  return {
    id: row.id,
    authorId: row.author_id,
    author: row.author ? personName(row.author) : "",
    at: row.created_at,
    body: row.body,
  };
}

export function mapEnrollment(row: CustomerCourseRow): Enrollment {
  const total = row.nodes_total ?? 0;
  const done = Math.min(row.nodes_done ?? 0, total);
  return {
    courseId: row.course_id,
    title: { fr: row.title, en: row.title_en || row.title },
    enrolledAt: row.starts_at,
    progress: row.completed_at ? 100 : total === 0 ? 0 : Math.round((done / total) * 100),
    score: row.completed_at && row.average_score != null ? row.average_score : undefined,
    completedAt: row.completed_at ?? undefined,
    certificate: Boolean(row.certificate_code),
    lastActivity: row.last_activity ?? undefined,
    withdrawn: row.course_status !== "published",
  };
}

export function mapStatusHistory(rows: StatusHistoryRow[]): StatusChange[] {
  return rows.map((row) => ({
    at: row.changed_at,
    from: row.old_status ? statusFromDb(row.old_status) : null,
    to: statusFromDb(row.new_status),
    actor: row.actor_name || null,
  }));
}

export interface CustomerSources {
  profiles: CustomerProfileRow[];
  addresses: CustomerAddressRow[];
  tags: CustomerTagRow[];
  notes: CustomerNoteRow[];
  courses: CustomerCourseRow[];
  orders: AdminOrder[];
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

/**
 * The base, newest registration first. Order count and spend come from the
 * live order book (`spendOf`: paid orders that stand, less refunds, one total
 * per currency); `spendRank` keeps the store currency only, for sorting.
 */
export function mapCustomers(sources: CustomerSources): AdminCustomerRecord[] {
  const addresses = new Map(sources.addresses.map((a) => [a.user_id, a]));
  const tags = groupBy(sources.tags, (t) => t.user_id);
  const notes = groupBy(sources.notes, (n) => n.user_id);
  const courses = groupBy(sources.courses, (c) => c.user_id);

  return sources.profiles
    .map((p): AdminCustomerRecord => {
      const address = addresses.get(p.id);
      const orders = customerOrders({ id: p.id }, sources.orders);
      const spend = spendOf(orders);
      return {
        id: p.id,
        firstName: p.first_name?.trim() ?? "",
        lastName: p.last_name?.trim() ?? "",
        email: p.email ?? "",
        phone: p.phone?.trim() ?? "",
        since: p.created_at.slice(0, 10),
        country: p.country_code?.toLowerCase() ?? "",
        address: address
          ? {
              line1: address.address_line1,
              line2: address.address_line2 ?? "",
              postalCode: address.postal_code ?? "",
              city: address.city,
              country: address.country_code.toLowerCase(),
            }
          : null,
        status: statusFromDb(p.status),
        tags: (tags.get(p.id) ?? [])
          .map((t) => tagFromDb(t.tag))
          .filter((t): t is CustomerTag => t !== null),
        birthDate: p.birth_date ?? undefined,
        marketingOptIn: Boolean(p.marketing_opt_in),
        enrollments: (courses.get(p.id) ?? []).map(mapEnrollment),
        notes: (notes.get(p.id) ?? [])
          .map(mapNote)
          .sort((a, b) => a.at.localeCompare(b.at)),
        orderCount: orders.length,
        spend,
        spendRank: spend.find((s) => s.currency === RANK_CURRENCY)?.amount ?? 0,
      };
    })
    .sort((a, b) => b.since.localeCompare(a.since) || a.id.localeCompare(b.id));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** What the edit form may write. Email, consent and the address book belong to the customer. */
export interface CustomerProfileDraft {
  firstName: string;
  lastName: string;
  phone: string;
  /** ISO date or empty. */
  birthDate: string;
  /** Lower-case ISO code or empty. */
  country: string;
  /** Null for a closed (deactivated) account: its status is not written from here. */
  status: StaffSettableStatus | null;
  tags: CustomerTag[];
}

export type DraftField = "firstName" | "lastName" | "phone" | "birthDate" | "country";
export type DraftError = "required" | "tooLong" | "phone" | "birthDate" | "country";

const NAME_MAX = 100;
const PHONE = /^\+?[0-9 ().-]{6,20}$/;
/** `profiles.birth_date` CHECK bounds. */
export const BIRTH_DATE_MIN = "1900-01-01";
export const BIRTH_DATE_MAX = "2020-01-01";

/** The form's errors, keyed by field; empty when the draft can be sent. */
export function validateDraft(draft: CustomerProfileDraft): Partial<Record<DraftField, DraftError>> {
  const errors: Partial<Record<DraftField, DraftError>> = {};
  const first = draft.firstName.trim();
  const last = draft.lastName.trim();
  if (!first) errors.firstName = "required";
  else if (first.length > NAME_MAX) errors.firstName = "tooLong";
  if (!last) errors.lastName = "required";
  else if (last.length > NAME_MAX) errors.lastName = "tooLong";
  const phone = draft.phone.trim();
  if (phone && !PHONE.test(phone)) errors.phone = "phone";
  const birth = draft.birthDate.trim();
  if (birth && (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth < BIRTH_DATE_MIN || birth > BIRTH_DATE_MAX)) {
    errors.birthDate = "birthDate";
  }
  if (draft.country && !/^[a-z]{2}$/i.test(draft.country)) errors.country = "country";
  return errors;
}

/** The `profiles` update of a valid draft: blanks become NULL, the country upper-case. */
export function profilePatch(draft: CustomerProfileDraft): TablesUpdate<"profiles"> {
  return {
    first_name: draft.firstName.trim(),
    last_name: draft.lastName.trim(),
    phone: draft.phone.trim() || null,
    birth_date: draft.birthDate.trim() || null,
    country_code: draft.country ? draft.country.toUpperCase() : null,
    ...(draft.status ? { status: draft.status } : {}),
  };
}

/** The form's starting point for a customer. */
export function draftOf(customer: AdminCustomerRecord): CustomerProfileDraft {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    birthDate: customer.birthDate ?? "",
    country: customer.country,
    status: customer.status === "deactivated" ? null : customer.status,
    tags: customer.tags,
  };
}

export type CustomerWriteError = "forbidden" | "invalid" | "notFound" | "unavailable";

interface WriteFailure {
  code?: string;
  message?: string;
}

export function writeErrorOf(error: WriteFailure): CustomerWriteError {
  // 42501: RLS or the profile guard; PGRST116: `.single()` on a write RLS let touch no row.
  if (error.code === "42501" || error.code === "PGRST116") return "forbidden";
  if (error.code === "23514" || error.code === "22023" || error.code === "22001" || error.code === "22007" || error.code === "22008") {
    return "invalid";
  }
  if (error.code === "23503") return "notFound";
  return "unavailable";
}
