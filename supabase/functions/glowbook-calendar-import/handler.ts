import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { json } from "../_shared/http.ts";
import { busyHours, busyIntervals } from "./icsBusy.ts";

/**
 * POST /functions/v1/glowbook-calendar-import — every 15 minutes (pg_cron,
 * shared secret EMAIL_INTERNAL_SECRET in `x-internal-secret`): reads the other
 * calendar of each artist who set one (decision 144, lot 3) and closes the hours
 * it is busy in, from now to the artist's booking horizon.
 *
 * The address is the artist's: it is fetched only over https, never towards an
 * IP literal or a local / internal host name, with a 10-second limit, 2 MB at
 * most, no cookies, and redirects followed only towards https addresses that
 * pass the same check. A read that fails keeps the hours already closed and
 * records why (unreachable, not_calendar, too_large, forbidden_host, timeout).
 * Answer: {ok, report: {examined, applied, failed}} — counts only.
 */

export type ImportError = "unreachable" | "not_calendar" | "too_large" | "forbidden_host" | "timeout";

export interface ImportTarget {
  userId: string;
  url: string;
  timezone: string;
  horizonDays: number;
}

export interface ImportDeps {
  secret: string | undefined;
  targets(limit: number): Promise<ImportTarget[]>;
  fetchCalendar(url: string): Promise<{ text: string } | { error: ImportError }>;
  apply(target: ImportTarget, hours: string[] | null, error: ImportError | null): Promise<void>;
  now(): number;
  log(message: string, detail?: unknown): void;
}

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
const BATCH = 20;

/** Whether an address may be fetched: https, a public host name. */
export function allowedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[") || host.includes(":")) return false; // IP literals
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|supabase\.internal)$/.test(host)) return false;
  return true;
}

/** Reads at most MAX_BYTES of a body; null when it is larger. */
export async function readCapped(res: Response, max = MAX_BYTES): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Fetches a calendar with the checks above (at most 3 redirects). */
export async function fetchCalendar(raw: string, fetcher: typeof fetch = fetch): Promise<{ text: string } | { error: ImportError }> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!allowedUrl(url)) return { error: "forbidden_host" };
    let res: Response;
    try {
      res = await fetcher(url, {
        redirect: "manual",
        headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "user-agent": "GlobalToothgems-Glowbook/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { error: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "unreachable" };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { error: "unreachable" };
    }
    const text = await readCapped(res);
    if (text === null) return { error: "too_large" };
    if (!/BEGIN:VCALENDAR/i.test(text)) return { error: "not_calendar" };
    return { text };
  }
  return { error: "unreachable" };
}

export async function runImport(deps: ImportDeps): Promise<{ examined: number; applied: number; failed: number }> {
  const report = { examined: 0, applied: 0, failed: 0 };
  for (const target of await deps.targets(BATCH)) {
    report.examined++;
    try {
      const got = await deps.fetchCalendar(target.url);
      if ("error" in got) {
        await deps.apply(target, null, got.error);
        report.failed++;
        continue;
      }
      const now = deps.now();
      const to = now + Math.min(Math.max(target.horizonDays, 7), 180) * 86_400_000;
      const hours = busyHours(busyIntervals(got.text, target.timezone, now, to), target.timezone);
      await deps.apply(target, hours, null);
      report.applied++;
    } catch (error) {
      report.failed++;
      deps.log("import failed", { user: target.userId, error: error instanceof Error ? error.message : error });
    }
  }
  return report;
}

export async function handleCalendarImport(req: Request, deps: ImportDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await hasInternalSecret(req, deps.secret))) return json({ error: "unauthorized" }, 401);
  try {
    return json({ ok: true, report: await runImport(deps) }, 200);
  } catch (error) {
    deps.log("import run failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
}
