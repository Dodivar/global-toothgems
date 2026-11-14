/**
 * Glowbook booking e-mails (decision 144), driven by
 * `pending_glowbook_booking_emails()`:
 *
 *   glowbook_booking_new             to the artist: a member booked an hour
 *                                    (Reply-To = the client, so the artist answers
 *                                    from their own mailbox), with a calendar file.
 *   glowbook_booking_confirmed       to the client, with a calendar file.
 *   glowbook_booking_cancel_client   to the artist: the client cancelled (or their
 *                                    account was deleted).
 *   glowbook_booking_cancel_artist   to the client: the artist cancelled, with the reason.
 *   glowbook_booking_reminder        to the client, the day before.
 *
 * The first two leave at once from the `glowbook-booking` function (`only` = the
 * booking just made); everything else, and anything that failed, through the
 * `send-pending-emails` sweep. The booking's facts are laid out by the code; the
 * staff-editable template carries the greeting and the sentence around them.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type Block, type DetailRow, details, notice } from "./components.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";
import { type EmailDeps, sendTemplatedEmail, type SendResult } from "./send.ts";

export type BookingMailKind = "new" | "confirmed" | "cancel_client" | "cancel_artist" | "reminder";

export interface PendingBookingMail {
  kind: BookingMailKind;
  eventKey: string;
  bookingId: string;
  email: string;
  locale: string;
  replyTo: string | null;
  artistName: string;
  artistHandle: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientErased: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  designKind: "creation" | "custom";
  creationName: string | null;
  comment: string | null;
  cancelReason: string | null;
  lateCancel: boolean;
}

export interface BookingMailSource {
  pending(limit: number, only?: string): Promise<PendingBookingMail[]>;
}

export const BOOKING_TEMPLATES: Record<BookingMailKind, string> = {
  new: "glowbook_booking_new",
  confirmed: "glowbook_booking_confirmed",
  cancel_client: "glowbook_booking_cancel_client",
  cancel_artist: "glowbook_booking_cancel_artist",
  reminder: "glowbook_booking_reminder",
};

/** Where each side manages the appointment. */
export const ARTIST_AGENDA_PATH = "/studio-3d/atelier/glowbook?tab=agenda";
export const CLIENT_BOOKINGS_PATH = "/compte/rendez-vous";
const GLOWBOOK_PATH = { fr: "/fr/glowbook/", en: "/en/glowbook/" } as const;

const LABELS = {
  fr: {
    eyebrow: "Glowbook",
    summary: "Le rendez-vous",
    when: "Date",
    duration: "Durée",
    oneHour: "1 heure",
    artist: "Artiste",
    design: "Création",
    custom: "Création personnalisée",
    comment: "Envie du client",
    yourComment: "Votre message",
    client: "Client",
    email: "E-mail",
    phone: "Téléphone",
    clientGone: "Le client a supprimé son compte.",
    late: "Annulation à moins de 24 heures du rendez-vous.",
    reason: "Raison donnée par l’artiste",
    agenda: "Ouvrir mon agenda",
    bookings: "Voir mes rendez-vous",
    bookAgain: "Réserver un autre créneau",
    noHealth: "Ne transmettez pas d’information de santé par e-mail : parlez-en directement avec l’artiste le jour du rendez-vous.",
    timeIn: (tz: string) => `heure de ${tz}`,
  },
  en: {
    eyebrow: "Glowbook",
    summary: "The appointment",
    when: "Date",
    duration: "Duration",
    oneHour: "1 hour",
    artist: "Artist",
    design: "Design",
    custom: "Custom design",
    comment: "Client’s idea",
    yourComment: "Your message",
    client: "Client",
    email: "E-mail",
    phone: "Phone",
    clientGone: "The client deleted their account.",
    late: "Cancelled less than 24 hours before the appointment.",
    reason: "The artist’s reason",
    agenda: "Open my calendar",
    bookings: "See my appointments",
    bookAgain: "Book another slot",
    noHealth: "Do not send health information by e-mail: talk about it with the artist in person on the day.",
    timeIn: (tz: string) => `${tz} time`,
  },
} as const;

/** "jeudi 20 novembre 2026 à 14:00 (heure de Paris)", in the booking's time zone. */
export function bookingDate(iso: string, timezone: string, locale: string): string {
  const lang = chromeLocale(locale);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  let zone = timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    zone = "Europe/Paris";
  }
  const formatted = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(date);
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  return `${formatted} (${LABELS[lang].timeIn(city)})`;
}

const ICS_ESCAPE = /[\\;,\n]/g;
const icsText = (value: string) => value.replace(/\r/g, "").replace(ICS_ESCAPE, (c) => (c === "\n" ? "\\n" : `\\${c}`));
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Folds a content line at 75 octets (RFC 5545 §3.1), never inside a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) {
      out.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n");
}

export interface CalendarEvent {
  uid: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  description: string;
  url?: string;
  stamp?: string;
}

/** A one-event iCalendar file (times in UTC; every calendar shows them in its own zone). */
export function buildIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Global Toothgems//Glowbook//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsTime(event.stamp ?? new Date().toISOString())}`,
    `DTSTART:${icsTime(event.startsAt)}`,
    `DTEND:${icsTime(event.endsAt)}`,
    `SUMMARY:${icsText(event.summary)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    ...(event.url ? [`URL:${event.url}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

function base64Utf8(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const site = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

/** The calendar file attached to the booking and confirmation e-mails. */
export function bookingAttachment(mail: PendingBookingMail, siteUrl: string): { filename: string; content: string } {
  const lang = chromeLocale(mail.locale);
  const forArtist = mail.kind === "new";
  const who = forArtist ? (mail.clientName ?? "") : mail.artistName;
  const summary = lang === "fr" ? `Rendez-vous tooth gem — ${who}` : `Tooth gem appointment — ${who}`;
  const design = mail.designKind === "custom" ? LABELS[lang].custom : (mail.creationName ?? LABELS[lang].design);
  const url = forArtist ? `${site(siteUrl)}${ARTIST_AGENDA_PATH}` : `${site(siteUrl)}${CLIENT_BOOKINGS_PATH}`;
  return {
    filename: lang === "fr" ? "rendez-vous.ics" : "appointment.ics",
    content: base64Utf8(
      buildIcs({ uid: `${mail.bookingId}@glowbook.globaltoothgems`, startsAt: mail.startsAt, endsAt: mail.endsAt, summary, description: design, url }),
    ),
  };
}

export function bookingContent(mail: PendingBookingMail, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const forArtist = mail.kind === "new" || mail.kind === "cancel_client";
  const rows: DetailRow[] = [
    { label: l.when, value: bookingDate(mail.startsAt, mail.timezone, lang) },
    { label: l.duration, value: l.oneHour },
  ];
  if (!forArtist) rows.push({ label: l.artist, value: mail.artistName });
  rows.push({ label: l.design, value: mail.designKind === "custom" ? l.custom : (mail.creationName ?? "—") });
  if (mail.comment) rows.push({ label: forArtist ? l.comment : l.yourComment, value: mail.comment });
  if (forArtist && !mail.clientErased) {
    if (mail.clientName) rows.push({ label: l.client, value: mail.clientName });
    if (mail.kind === "new") {
      if (mail.clientEmail) rows.push({ label: l.email, value: mail.clientEmail });
      if (mail.clientPhone) rows.push({ label: l.phone, value: mail.clientPhone });
    }
  }
  const blocks: Block[] = [details({ title: l.summary, rows })];
  if (mail.kind === "cancel_client" && mail.clientErased) blocks.push(notice({ tone: "info", title: l.clientGone }));
  if (mail.kind === "cancel_client" && mail.lateCancel) blocks.push(notice({ tone: "warning", title: l.late }));
  if (mail.kind === "cancel_artist" && mail.cancelReason) blocks.push(notice({ tone: "info", title: l.reason, body: mail.cancelReason }));
  if (mail.kind === "confirmed") blocks.push(notice({ tone: "info", title: l.noHealth }));

  const base = site(siteUrl);
  const primaryAction = forArtist
    ? { label: l.agenda, url: `${base}${ARTIST_AGENDA_PATH}` }
    : mail.kind === "cancel_artist" && mail.artistHandle
      ? { label: l.bookAgain, url: `${base}${GLOWBOOK_PATH[lang]}${encodeURIComponent(mail.artistHandle)}` }
      : { label: l.bookings, url: `${base}${CLIENT_BOOKINGS_PATH}` };
  return { eyebrow: l.eyebrow, primaryAction, blocks };
}

export function bookingVariables(mail: PendingBookingMail, locale: string): Record<string, string> {
  const lang = chromeLocale(locale);
  const fallback = lang === "fr" ? "Un client" : "A client";
  return {
    artist_name: mail.artistName || "Glowbook",
    client_name: mail.clientName ?? fallback,
    date: bookingDate(mail.startsAt, mail.timezone, lang),
  };
}

type Log = (message: string, detail?: unknown) => void;

export interface BookingMailReport {
  examined: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function sendGlowbookBookingEmails(
  deps: EmailDeps,
  source: BookingMailSource,
  options: { limit?: number; log?: Log; only?: string } = {},
): Promise<BookingMailReport> {
  const log = options.log ?? (() => {});
  const report: BookingMailReport = { examined: 0, sent: 0, skipped: 0, failed: 0 };
  for (const mail of await source.pending(options.limit ?? 25, options.only)) {
    report.examined++;
    let result: SendResult;
    try {
      result = await sendTemplatedEmail(deps, {
        templateKey: BOOKING_TEMPLATES[mail.kind],
        to: mail.email,
        locale: mail.locale,
        variables: bookingVariables(mail, mail.locale),
        eventKey: mail.eventKey,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        ...(mail.kind === "new" || mail.kind === "confirmed" ? { attachments: [bookingAttachment(mail, deps.layout.siteUrl)] } : {}),
        content: (locale) => bookingContent(mail, locale, deps.layout.siteUrl),
      });
    } catch (error) {
      log("booking e-mail crashed", { event: mail.eventKey, error: error instanceof Error ? error.message : error });
      report.failed++;
      continue;
    }
    if (result.status === "sent") report.sent++;
    else if (result.status === "failed") {
      log("booking e-mail failed", { event: mail.eventKey, error: result.error });
      report.failed++;
    } else report.skipped++;
  }
  return report;
}

const KINDS: readonly BookingMailKind[] = ["new", "confirmed", "cancel_client", "cancel_artist", "reminder"];
const text = (v: unknown) => (typeof v === "string" ? v : null);

export function mapBookingMail(row: Record<string, unknown>): PendingBookingMail | null {
  const kind = row.kind as BookingMailKind;
  if (!KINDS.includes(kind) || typeof row.email !== "string" || typeof row.event_key !== "string") return null;
  return {
    kind,
    eventKey: row.event_key,
    bookingId: String(row.booking_id),
    email: row.email,
    locale: text(row.locale) ?? "fr",
    replyTo: text(row.reply_to),
    artistName: text(row.artist_name) ?? "",
    artistHandle: text(row.artist_handle),
    clientName: text(row.client_name),
    clientEmail: text(row.client_email),
    clientPhone: text(row.client_phone),
    clientErased: row.client_erased === true,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    timezone: text(row.timezone) ?? "Europe/Paris",
    designKind: row.design_kind === "custom" ? "custom" : "creation",
    creationName: text(row.creation_name),
    comment: text(row.comment),
    cancelReason: text(row.cancel_reason),
    lateCancel: row.late_cancel === true,
  };
}

export function supabaseBookingMailSource(db: SupabaseClient): BookingMailSource {
  return {
    async pending(limit, only) {
      const { data, error } = await db.rpc("pending_glowbook_booking_emails", { p_limit: limit, p_only: only ?? null });
      if (error) throw new Error(`pending_glowbook_booking_emails: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
        const mail = mapBookingMail(row);
        return mail ? [mail] : [];
      });
    },
  };
}
