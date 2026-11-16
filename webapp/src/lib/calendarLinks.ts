/**
 * Ways to put a Glowbook appointment in a calendar from a phone as well as a
 * computer. An `.ics` file alone is not enough there: Google Calendar's
 * Android app does not open one, and iOS Safari saves a downloaded file to
 * Files instead of offering it to Calendar. So each appointment also gets the
 * calendars' own "new event" links (Google, Outlook), and the artist's private
 * feed gets one-tap subscription links (webcal:// for Apple Calendar and the
 * iPhone, Google's subscription page). Pure functions: the component decides
 * what to show first (`calendarPlatform`, read once hydrated).
 */

export interface CalendarEvent {
  startsAt: string;
  endsAt: string;
  summary: string;
  description: string;
  location: string | null;
}

export type CalendarPlatform = "ios" | "android" | "other";

/** `20261220T130000Z` — UTC, the form Google's link takes. */
const compactUtc = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** `2026-12-20T13:00:00Z` — UTC, the form Outlook's link takes. */
const isoUtc = (iso: string): string => new Date(iso).toISOString().replace(/\.\d{3}/, "");

/** Google Calendar's "new event" page, prefilled; opens the app on Android when installed. */
export function googleEventUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${compactUtc(event.startsAt)}/${compactUtc(event.endsAt)}`,
    details: event.description,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook on the web's "new event" page (personal accounts; work accounts are asked to sign in there). */
export function outlookEventUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    subject: event.summary,
    startdt: isoUtc(event.startsAt),
    enddt: isoUtc(event.endsAt),
    body: event.description,
  });
  if (event.location) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/** The feed's address as a subscription link: Apple Calendar (iPhone, Mac) and Outlook desktop open it. */
export function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//i, "webcal://");
}

/** Google Calendar's "add this calendar" page for the feed. */
export function googleSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;
}

/** Which calendar the device most likely uses (iPadOS reports itself as a Mac with touch). */
export function calendarPlatform(userAgent: string, maxTouchPoints = 0): CalendarPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}
