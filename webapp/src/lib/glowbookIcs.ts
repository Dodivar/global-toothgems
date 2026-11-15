/**
 * "Add to my calendar" for a client's Glowbook appointment (decision 147 (d)):
 * a one-event iCalendar file (RFC 5545) built in the browser, which every
 * calendar opens — Apple Calendar and Outlook directly, Google Calendar by
 * import. Times in UTC (each calendar shows them in its own zone); the same
 * UID as the booking e-mails' attachment, so a calendar that already has the
 * event replaces it instead of doubling it.
 *
 * Mirrors `supabase/functions/_shared/ics.ts` (Deno), kept small on purpose.
 */

export interface AppointmentEvent {
  bookingId: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  description: string;
  location: string | null;
  url: string | null;
}

const ESCAPE = /[\\;,\n]/g;
const icsText = (value: string): string => value.replace(/\r/g, "").replace(ESCAPE, (c) => (c === "\n" ? "\\n" : `\\${c}`));
const icsTime = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Folds a content line at 75 octets, never inside a UTF-8 character. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
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

/** The booking e-mails' event UID (`_shared/email/glowbookBookingEmails.ts`). */
export const appointmentUid = (bookingId: string): string => `${bookingId}@glowbook.globaltoothgems`;

export function appointmentIcs(event: AppointmentEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Global Toothgems//Glowbook//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appointmentUid(event.bookingId)}`,
    `DTSTAMP:${icsTime(now.toISOString())}`,
    `DTSTART:${icsTime(event.startsAt)}`,
    `DTEND:${icsTime(event.endsAt)}`,
    `SUMMARY:${icsText(event.summary)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Hands the file to the browser: the system opens it with the calendar app, or saves it. */
export function downloadIcs(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
