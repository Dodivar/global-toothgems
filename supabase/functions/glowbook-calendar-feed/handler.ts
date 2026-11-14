import { clientAddress } from "../_shared/http.ts";
import { hashAddress } from "../_shared/email/send.ts";
import { buildCalendar, type IcsEvent } from "../_shared/ics.ts";

/**
 * GET /functions/v1/glowbook-calendar-feed?token=<64 hex> — the artist's
 * private iCalendar feed of their Glowbook appointments (decision 144, lot 2),
 * subscribed from Google Calendar, Apple Calendar or Outlook, which poll it.
 *
 * The secret in the address is the authentication: glowbook_calendar_feed()
 * (service role) compares its sha256 and answers null for an unknown or
 * revoked link (404 here, no detail). 120 requests / hour / address. Events:
 * booked, honoured and no-show appointments from 30 days ago to 180 days ahead,
 * and the cancellations of the last 30 days as cancelled events, so calendars
 * drop them. Nothing is cached by intermediaries (`private, no-store`).
 */

export interface FeedEvent {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  designKind: "creation" | "custom";
  creationName: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  comment: string | null;
  cancelReason: string | null;
  updatedAt: string;
}

export interface Feed {
  artistName: string;
  timezone: string;
  events: FeedEvent[];
}

export interface CalendarFeedDeps {
  ipAllowed(ipHash: string): Promise<boolean>;
  feed(token: string): Promise<Feed | null>;
  siteUrl: string;
  log(message: string, detail?: unknown): void;
}

const TOKEN_RE = /^[0-9a-f]{64}$/;

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** One appointment as a calendar event, in French (the artist's calendar is theirs; the app's language is not known here). */
export function feedEvent(e: FeedEvent, siteUrl: string): IcsEvent {
  const who = e.clientName ?? "Client";
  const design = e.designKind === "custom" ? "Création personnalisée" : (e.creationName ?? "Création");
  const cancelled = e.status === "cancelled_client" || e.status === "cancelled_artist";
  const lines = [
    `Création : ${design}`,
    ...(e.clientPhone ? [`Téléphone : ${e.clientPhone}`] : []),
    ...(e.clientEmail ? [`E-mail : ${e.clientEmail}`] : []),
    ...(e.comment ? [`Envie du client : ${e.comment}`] : []),
    ...(e.status === "no_show" ? ["Noté absent"] : []),
    ...(e.status === "cancelled_client" ? ["Annulé par le client"] : []),
    ...(e.status === "cancelled_artist" ? [`Annulé${e.cancelReason ? ` : ${e.cancelReason}` : ""}`] : []),
    "",
    "Glowbook — Global Toothgems",
  ];
  return {
    uid: `${e.id}@glowbook.globaltoothgems`,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    summary: `${cancelled ? "[Annulé] " : ""}Tooth gem — ${who}`,
    description: lines.join("\n"),
    url: `${siteUrl.replace(/\/+$/, "")}/studio-3d/atelier/glowbook?tab=agenda`,
    stamp: e.updatedAt,
    status: cancelled ? "CANCELLED" : "CONFIRMED",
    sequence: Math.floor(new Date(e.updatedAt).getTime() / 1000) % 2147483647,
  };
}

export function feedBody(feed: Feed, siteUrl: string, now?: string): string {
  return buildCalendar(feed.events.map((e) => feedEvent(e, siteUrl)), { name: `Glowbook — ${feed.artistName}`, now });
}

export async function handleCalendarFeed(req: Request, deps: CalendarFeedDeps): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return text("Not found", 404);
  try {
    const ip = clientAddress(req);
    if (ip && !(await deps.ipAllowed(await hashAddress(ip)))) return text("Too many requests", 429);
    const feed = await deps.feed(token);
    if (!feed) return text("Not found", 404);
    const body = feedBody(feed, deps.siteUrl);
    return new Response(req.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="glowbook.ics"',
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (error) {
    deps.log("feed failed", error instanceof Error ? error.message : error);
    return text("Unavailable", 503);
  }
}

/** The function's rows, mapped. */
export function mapFeed(data: unknown): Feed | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const events = Array.isArray(d.events) ? (d.events as Record<string, unknown>[]) : [];
  return {
    artistName: s(d.artist_name) ?? "Glowbook",
    timezone: s(d.timezone) ?? "Europe/Paris",
    events: events.map((e) => ({
      id: String(e.id),
      startsAt: String(e.starts_at),
      endsAt: String(e.ends_at),
      status: String(e.status),
      designKind: e.design_kind === "custom" ? "custom" : "creation",
      creationName: s(e.creation_name),
      clientName: s(e.client_name),
      clientPhone: s(e.client_phone),
      clientEmail: s(e.client_email),
      comment: s(e.comment),
      cancelReason: s(e.cancel_reason),
      updatedAt: String(e.updated_at),
    })),
  };
}
