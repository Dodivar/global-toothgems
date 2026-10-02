import type { SupabaseClient } from "@supabase/supabase-js";
import { WEEKDAYS, type OpeningSlot, type StoreDetails, type Weekday } from "../data/adminSettings";
import type { Database, Json } from "./supabase/database.types";

/**
 * The store's identity, legal mentions and contact details — one row of
 * `store_settings` plus its translations (`store_settings_translations`).
 *
 * Read by the back office (Settings › Store) and by the public pages that
 * publish it (legal notice, contact page), with the same mapping so the two
 * can never disagree. Everything in that row is public by design (RLS
 * "everyone reads"). Pure functions, except `fetchStoreDetails`, which takes
 * the client it reads with (browser session or the server's publishable key).
 */

export const STORE_SETTINGS_SELECT =
  "store_name, legal_name, legal_form, share_capital, registration_number, vat_number, business_email, support_email, phone, address_line1, address_line2, postal_code, city, region, country_code, publication_director, publication_director_role, host_name, host_address, host_contact, show_email, show_phone, show_address, opening_hours, support_message";

type StoreSettingsTable = Database["public"]["Tables"]["store_settings"]["Row"];
export type StoreSettingsRow = Pick<
  StoreSettingsTable,
  | "store_name"
  | "legal_name"
  | "legal_form"
  | "share_capital"
  | "registration_number"
  | "vat_number"
  | "business_email"
  | "support_email"
  | "phone"
  | "address_line1"
  | "address_line2"
  | "postal_code"
  | "city"
  | "region"
  | "country_code"
  | "publication_director"
  | "publication_director_role"
  | "host_name"
  | "host_address"
  | "host_contact"
  | "show_email"
  | "show_phone"
  | "show_address"
  | "opening_hours"
  | "support_message"
>;

export interface StoreTranslationRow {
  locale: string;
  support_message: string | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSED: OpeningSlot = { open: false, from: "09:00", to: "18:00" };

/** The stored week, day by day; a malformed day reads as closed rather than failing the page. */
export function parseOpeningHours(value: Json | null | undefined): Record<Weekday, OpeningSlot> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json | undefined>) : {};
  const out = {} as Record<Weekday, OpeningSlot>;
  for (const day of WEEKDAYS) {
    const raw = source[day];
    const slot = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, Json | undefined>) : null;
    const fromOk = typeof slot?.from === "string" && TIME.test(slot.from);
    const toOk = typeof slot?.to === "string" && TIME.test(slot.to);
    const from = fromOk ? String(slot?.from) : CLOSED.from;
    const to = toOk ? String(slot?.to) : CLOSED.to;
    out[day] = { open: slot?.open === true && fromOk && toOk && from < to, from, to };
  }
  return out;
}

export function mapStoreDetails(row: StoreSettingsRow, translations: StoreTranslationRow[]): StoreDetails {
  const text = (v: string | null) => v ?? "";
  return {
    storeName: row.store_name,
    legalName: text(row.legal_name),
    legalForm: text(row.legal_form),
    shareCapital: text(row.share_capital),
    registrationNumber: text(row.registration_number),
    vatNumber: text(row.vat_number),
    businessEmail: text(row.business_email),
    supportEmail: text(row.support_email),
    phone: text(row.phone),
    country: row.country_code,
    address1: text(row.address_line1),
    address2: text(row.address_line2),
    postalCode: text(row.postal_code),
    city: text(row.city),
    region: text(row.region),
    publicationDirector: text(row.publication_director),
    publicationDirectorRole: text(row.publication_director_role),
    hostName: text(row.host_name),
    hostAddress: text(row.host_address),
    hostContact: text(row.host_contact),
    showEmail: row.show_email,
    showPhone: row.show_phone,
    showAddress: row.show_address,
    hours: parseOpeningHours(row.opening_hours),
    supportMessage: {
      fr: text(row.support_message),
      en: text(translations.find((t) => t.locale === "en")?.support_message ?? null),
    },
  };
}

/** The `admin_save_store_details()` argument: every key, empty strings clear a value. */
export function storeDetailsPayload(d: StoreDetails) {
  return {
    store_name: d.storeName.trim(),
    legal_name: d.legalName.trim(),
    legal_form: d.legalForm.trim(),
    share_capital: d.shareCapital.trim(),
    registration_number: d.registrationNumber.trim(),
    vat_number: d.vatNumber.replace(/\s/g, "").toUpperCase(),
    business_email: d.businessEmail.trim(),
    support_email: d.supportEmail.trim(),
    phone: d.phone.trim(),
    address_line1: d.address1.trim(),
    address_line2: d.address2.trim(),
    postal_code: d.postalCode.trim(),
    city: d.city.trim(),
    region: d.region.trim(),
    country_code: d.country,
    publication_director: d.publicationDirector.trim(),
    publication_director_role: d.publicationDirectorRole.trim(),
    host_name: d.hostName.trim(),
    host_address: d.hostAddress.trim(),
    host_contact: d.hostContact.trim(),
    show_email: d.showEmail,
    show_phone: d.showPhone,
    show_address: d.showAddress,
    opening_hours: Object.fromEntries(WEEKDAYS.map((day) => [day, { ...d.hours[day] }])),
    support_message: d.supportMessage.fr.trim(),
    translations: { en: { support_message: d.supportMessage.en.trim() } },
  };
}

/** One read of the row and its translations. Throws on failure (callers decide the fallback). */
export async function fetchStoreDetails(client: SupabaseClient<Database>, signal?: AbortSignal): Promise<StoreDetails> {
  let settings = client.from("store_settings").select(STORE_SETTINGS_SELECT).eq("id", true);
  let translations = client.from("store_settings_translations").select("locale, support_message");
  if (signal) {
    settings = settings.abortSignal(signal);
    translations = translations.abortSignal(signal);
  }
  const [row, tr] = await Promise.all([settings.single(), translations]);
  if (row.error) throw row.error;
  if (tr.error) throw tr.error;
  return mapStoreDetails(row.data, tr.data ?? []);
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers shared by the preview and the public pages            */
/* -------------------------------------------------------------------------- */

/** Weekday name in a language, from the platform (2024-01-01 was a Monday). */
export function weekdayName(day: Weekday, lang: string, width: "short" | "long" = "short"): string {
  const date = new Date(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(day), 12));
  return new Intl.DateTimeFormat(lang.startsWith("fr") ? "fr-FR" : "en-GB", { weekday: width, timeZone: "UTC" }).format(date);
}

/**
 * Consecutive days with the same hours grouped into one line:
 * "Mon – Thu · 09:30 – 18:00". `closed` is the word for a closed day.
 */
export function hoursSummary(hours: Record<Weekday, OpeningSlot>, lang: string, closed: string): string[] {
  const lines: string[] = [];
  let i = 0;
  while (i < WEEKDAYS.length) {
    const slot = hours[WEEKDAYS[i]];
    let j = i;
    while (
      j + 1 < WEEKDAYS.length &&
      hours[WEEKDAYS[j + 1]].open === slot.open &&
      (!slot.open || (hours[WEEKDAYS[j + 1]].from === slot.from && hours[WEEKDAYS[j + 1]].to === slot.to))
    )
      j++;
    const first = weekdayName(WEEKDAYS[i], lang);
    const days = i === j ? first : `${first} – ${weekdayName(WEEKDAYS[j], lang)}`;
    lines.push(`${days} · ${slot.open ? `${slot.from} – ${slot.to}` : closed}`);
    i = j + 1;
  }
  return lines;
}

export function hasOpeningHours(hours: Record<Weekday, OpeningSlot>): boolean {
  return WEEKDAYS.some((day) => hours[day].open);
}

/** The postal address on one or two lines, without the country. */
export function addressLines(d: StoreDetails): string[] {
  const street = [d.address1, d.address2].map((s) => s.trim()).filter(Boolean).join(", ");
  const town = [d.postalCode, d.city].map((s) => s.trim()).filter(Boolean).join(" ");
  return [street, [town, d.region.trim()].filter(Boolean).join(", ")].filter(Boolean);
}

/** The support message in a language (French unless English is asked for). */
export function supportMessageIn(d: StoreDetails, lang: string): string {
  return (lang.startsWith("en") ? d.supportMessage.en : d.supportMessage.fr).trim();
}

/** Whether the contact page has anything to show besides the form. */
export function hasVisibleContact(d: StoreDetails, lang: string): boolean {
  return (
    (d.showEmail && d.supportEmail.trim() !== "") ||
    (d.showPhone && d.phone.trim() !== "") ||
    (d.showAddress && addressLines(d).length > 0) ||
    hasOpeningHours(d.hours) ||
    supportMessageIn(d, lang) !== ""
  );
}
