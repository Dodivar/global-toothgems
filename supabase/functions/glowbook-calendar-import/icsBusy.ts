/**
 * Busy hours from an iCalendar file (decision 144, lot 3): the times another
 * calendar (Google, Apple, Outlook, Planity…) is taken, turned into the whole
 * local hours of the artist's Glowbook calendar.
 *
 * Read: VEVENT with DTSTART and DTEND or DURATION; UTC times, times with a TZID
 * (IANA names, and the common Windows names Outlook writes), floating times and
 * all-day dates (in the artist's zone); RRULE with FREQ DAILY / WEEKLY / MONTHLY /
 * YEARLY, INTERVAL, COUNT, UNTIL and BYDAY (weekly days), EXDATE, and moved or
 * cancelled occurrences (RECURRENCE-ID). Left out: events marked free
 * (TRANSP:TRANSPARENT) or cancelled. Only times are kept — never a title,
 * place or guest.
 */

export interface BusyInterval {
  start: number;
  end: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Iterations of one recurrence, at most (a daily event since 2000 is ~10 000). */
const MAX_STEPS = 20_000;

/** The common Windows zone names (Outlook / Exchange) → IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  "Romance Standard Time": "Europe/Paris",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "Mauritius Standard Time": "Indian/Mauritius",
  "SA Western Standard Time": "America/La_Paz",
  UTC: "UTC",
};

function validZone(zone: string | undefined): string | null {
  if (!zone) return null;
  const name = WINDOWS_ZONES[zone] ?? zone.replace(/^\/+/, "");
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

function wallClock(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** The instant of a local wall time ("as if UTC" ms) in a zone. */
export function zonedToInstant(wall: number, zone: string): number {
  let guess = wall;
  for (let i = 0; i < 3; i++) guess += wall - wallClock(guess, zone);
  return guess;
}

/** The start of the local hour holding an instant, in a zone. */
export function floorToLocalHour(ms: number, zone: string): number {
  const wall = wallClock(ms, zone);
  return ms - (((wall % HOUR) + HOUR) % HOUR);
}

/** Unfolds continuation lines and splits "NAME;PARAM=V:VALUE". */
export function contentLines(text: string): { name: string; params: Record<string, string>; value: string }[] {
  const raw = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: { name: string; params: Record<string, string>; value: string }[] = [];
  for (const line of raw) {
    const colon = findValueColon(line);
    if (colon < 0) continue;
    const head = line.slice(0, colon).split(";");
    const params: Record<string, string> = {};
    for (const p of head.slice(1)) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    }
    out.push({ name: head[0].toUpperCase(), params, value: line.slice(colon + 1) });
  }
  return out;
}

/** The colon that ends the parameters (a quoted parameter may hold one). */
function findValueColon(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) return i;
  }
  return -1;
}

interface Stamp {
  /** Local wall time "as if UTC", or the instant when `utc`. */
  wall: number;
  utc: boolean;
  zone: string | null;
  allDay: boolean;
}

function parseStamp(value: string, params: Record<string, string>): Stamp | null {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    return { wall: Date.UTC(+m[1], +m[2] - 1, +m[3]), utc: false, zone: null, allDay: true };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!dt) return null;
  const wall = Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +(dt[6] ?? 0));
  return { wall, utc: dt[7] === "Z", zone: dt[7] ? null : validZone(params.TZID), allDay: false };
}

function instantOf(stamp: Stamp, wall: number, fallbackZone: string): number {
  if (stamp.utc) return wall;
  return zonedToInstant(wall, stamp.zone ?? fallbackZone);
}

function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const ms = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * DAY + +(m[4] ?? 0) * HOUR + +(m[5] ?? 0) * 60_000 + +(m[6] ?? 0) * 1000;
  return m[1] === "-" ? -ms : ms;
}

interface RawEvent {
  start?: Stamp;
  end?: Stamp;
  duration?: number;
  rrule?: Record<string, string>;
  exdates: number[];
  recurrenceId?: number;
  uid?: string;
  free: boolean;
  cancelled: boolean;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Every occurrence's local wall start of a recurrence, until `until` (instant) / count / window end. */
function occurrences(e: RawEvent, zone: string, windowEnd: number): number[] {
  const start = e.start!;
  const rule = e.rrule;
  if (!rule) return [start.wall];
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const untilStamp = rule.UNTIL ? parseStamp(rule.UNTIL, {}) : null;
  const until = untilStamp ? (untilStamp.utc ? untilStamp.wall : instantOf(start, untilStamp.wall + (untilStamp.allDay ? DAY - 1 : 0), zone)) : Infinity;
  const byDay = (rule.BYDAY ?? "").split(",").map((d) => d.trim().replace(/^[+-]?\d+/, "")).filter((d) => WEEKDAYS.includes(d));
  const out: number[] = [];
  const timeOfDay = ((start.wall % DAY) + DAY) % DAY;
  const startDay = start.wall - timeOfDay;
  const at = (wall: number) => (start.allDay ? wall : instantOf(start, wall, zone));
  const push = (wall: number): boolean => {
    if (wall < start.wall) return true;
    const instant = at(wall);
    if (instant > until || out.length >= count || instant > windowEnd) return false;
    out.push(wall);
    return true;
  };

  if (freq === "DAILY") {
    for (let i = 0; i < MAX_STEPS; i++) if (!push(start.wall + i * interval * DAY)) break;
  } else if (freq === "WEEKLY") {
    const days = byDay.length ? byDay.map((d) => WEEKDAYS.indexOf(d)) : [new Date(start.wall).getUTCDay()];
    const mondayOffset = (new Date(startDay).getUTCDay() + 6) % 7;
    const weekStart = startDay - mondayOffset * DAY;
    outer: for (let w = 0; w < MAX_STEPS; w++) {
      const base = weekStart + w * interval * 7 * DAY;
      for (const d of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        if (!push(base + ((d + 6) % 7) * DAY + timeOfDay)) break outer;
      }
    }
  } else if (freq === "MONTHLY" || freq === "YEARLY") {
    const s = new Date(start.wall);
    for (let i = 0; i < MAX_STEPS / 10; i++) {
      const months = freq === "MONTHLY" ? i * interval : i * interval * 12;
      const y = s.getUTCFullYear() + Math.floor((s.getUTCMonth() + months) / 12);
      const m = (s.getUTCMonth() + months) % 12;
      const candidate = Date.UTC(y, m, s.getUTCDate()) + timeOfDay;
      if (new Date(candidate).getUTCDate() !== s.getUTCDate()) continue; // no 31st this month
      if (!push(candidate)) break;
    }
  } else {
    return [start.wall];
  }
  return out;
}

/**
 * The busy intervals of a calendar between `from` and `to` (instants), all-day
 * and floating times read in `zone`.
 */
export function busyIntervals(text: string, zone: string, from: number, to: number): BusyInterval[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0; // VALARM and other children of a VEVENT
  for (const line of contentLines(text)) {
    if (line.name === "BEGIN" && line.value.toUpperCase() === "VEVENT") {
      current = { exdates: [], free: false, cancelled: false };
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.name === "BEGIN") {
      depth++;
      continue;
    }
    if (line.name === "END") {
      if (depth > 0) {
        depth--;
        continue;
      }
      if (line.value.toUpperCase() === "VEVENT") {
        events.push(current);
        current = null;
      }
      continue;
    }
    if (depth > 0) continue;
    switch (line.name) {
      case "DTSTART":
        current.start = parseStamp(line.value, line.params) ?? undefined;
        break;
      case "DTEND":
        current.end = parseStamp(line.value, line.params) ?? undefined;
        break;
      case "DURATION":
        current.duration = parseDuration(line.value) ?? undefined;
        break;
      case "RRULE":
        current.rrule = Object.fromEntries(line.value.split(";").map((p) => p.split("=").map((x) => x.trim().toUpperCase()) as [string, string]));
        break;
      case "EXDATE":
        for (const v of line.value.split(",")) {
          const s = parseStamp(v.trim(), line.params);
          if (s) current.exdates.push(s.allDay ? zonedToInstant(s.wall, zone) : instantOf(s, s.wall, zone));
        }
        break;
      case "RECURRENCE-ID": {
        const s = parseStamp(line.value, line.params);
        if (s) current.recurrenceId = s.allDay ? zonedToInstant(s.wall, zone) : instantOf(s, s.wall, zone);
        break;
      }
      case "UID":
        current.uid = line.value;
        break;
      case "TRANSP":
        current.free = line.value.toUpperCase() === "TRANSPARENT";
        break;
      case "STATUS":
        current.cancelled = line.value.toUpperCase() === "CANCELLED";
        break;
    }
  }

  // Occurrences moved or cancelled by a RECURRENCE-ID copy leave their series.
  const replaced = new Map<string, Set<number>>();
  for (const e of events) {
    if (e.recurrenceId !== undefined && e.uid) {
      const set = replaced.get(e.uid) ?? new Set<number>();
      set.add(e.recurrenceId);
      replaced.set(e.uid, set);
    }
  }

  const out: BusyInterval[] = [];
  for (const e of events) {
    if (!e.start || e.free || e.cancelled) continue;
    const startInstant = e.start.allDay ? zonedToInstant(e.start.wall, zone) : instantOf(e.start, e.start.wall, zone);
    let length: number;
    if (e.end) {
      const endInstant = e.end.allDay ? zonedToInstant(e.end.wall, zone) : instantOf(e.end, e.end.wall, zone);
      length = endInstant - startInstant;
    } else if (e.duration !== undefined) {
      length = e.duration;
    } else {
      length = e.start.allDay ? DAY : 0;
    }
    if (length <= 0) continue;
    const skip = new Set([...e.exdates, ...(e.rrule && e.uid ? (replaced.get(e.uid) ?? []) : [])]);
    for (const wall of occurrences(e, zone, to)) {
      const start = e.start.allDay ? zonedToInstant(wall, zone) : instantOf(e.start, wall, zone);
      if (e.rrule && skip.has(start)) continue;
      const end = start + length;
      if (end <= from || start >= to) continue;
      out.push({ start: Math.max(start, from), end: Math.min(end, to) });
    }
  }
  return out;
}

/** The whole local hours (instants, ISO) the intervals touch, in the artist's zone; at most `max`. */
export function busyHours(intervals: readonly BusyInterval[], zone: string, max = 24 * 180): string[] {
  const hours = new Set<number>();
  for (const i of intervals) {
    let h = floorToLocalHour(i.start, zone);
    while (h < i.end && hours.size < max) {
      hours.add(h);
      // The next local hour (DST-safe: re-floor one hour and a bit later).
      h = floorToLocalHour(h + HOUR + 60_000, zone);
    }
    if (hours.size >= max) break;
  }
  return [...hours].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());
}
