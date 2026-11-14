/**
 * iCalendar (RFC 5545) helpers for the Glowbook (decision 144): the one-event
 * file attached to the booking e-mails, and the artist's subscribed feed.
 * Times are written in UTC; every calendar shows them in its own zone.
 */

export interface IcsEvent {
  uid: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  description: string;
  url?: string;
  /** Last change of the event (DTSTAMP / LAST-MODIFIED). */
  stamp?: string;
  status?: "CONFIRMED" | "CANCELLED";
  /** Increases on each change, so calendars replace their copy. */
  sequence?: number;
}

const ESCAPE = /[\\;,\n]/g;
export const icsText = (value: string): string => value.replace(/\r/g, "").replace(ESCAPE, (c) => (c === "\n" ? "\\n" : `\\${c}`));
export const icsTime = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Folds a content line at 75 octets, never inside a UTF-8 character. */
export function foldLine(line: string): string {
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

function eventLines(e: IcsEvent, now: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsTime(e.stamp ?? now)}`,
    ...(e.stamp ? [`LAST-MODIFIED:${icsTime(e.stamp)}`] : []),
    `DTSTART:${icsTime(e.startsAt)}`,
    `DTEND:${icsTime(e.endsAt)}`,
    `SUMMARY:${icsText(e.summary)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.status ?? "CONFIRMED"}`,
    ...(e.sequence !== undefined ? [`SEQUENCE:${e.sequence}`] : []),
    "END:VEVENT",
  ];
}

/** A calendar of events; `name` titles a subscribed feed. */
export function buildCalendar(events: readonly IcsEvent[], options: { name?: string; now?: string } = {}): string {
  const now = options.now ?? new Date().toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Global Toothgems//Glowbook//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.name ? [`X-WR-CALNAME:${icsText(options.name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"] : []),
    ...events.flatMap((e) => eventLines(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
