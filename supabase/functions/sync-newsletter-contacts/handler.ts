import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { json, readJson } from "../_shared/http.ts";
import { type ContactsApi, ResendApiError, type Segment } from "./resendContacts.ts";

/**
 * POST /functions/v1/sync-newsletter-contacts — mirrors the newsletter list into Resend contacts,
 * so campaigns can be written and sent with Resend Broadcasts (owner's choice, 2026-11-06).
 * Called by pg_cron every 5 minutes (migration newsletter_contact_sync); deployed with
 * verify_jwt = false, authenticated by EMAIL_INTERNAL_SECRET in `x-internal-secret`.
 *
 * For each row the database queued (pending_newsletter_contacts):
 *   subscribed → the contact exists, with the member's first name, in exactly the segments
 *                this code manages that apply (the language, and VIP for members tagged so);
 *                segments the team made by hand in Resend are never touched
 *   otherwise  → the contact is deleted in Resend
 * then record_newsletter_contact_sync() closes the row, or keeps it queued with a backoff.
 *
 * Consent stays ours: a contact who unsubscribed in Resend is never set back to subscribed here
 * (counted as `unsubscribedInResend`; mirroring that choice back is the next step).
 *
 * Body (optional): { "limit": 1..100 }, default 25. Answer: { ok, report } with counts only.
 */

/**
 * The segments this code owns, by exact name (the team reads French). Three, the free Resend
 * plan's limit (owner's choice, 2026-11-06): a campaign goes out once per language anyway (its
 * text differs), so no "all subscribers" segment; VIP is the only CRM tag sent. Another tag is
 * one line in TAG_SEGMENTS once the plan allows more segments.
 */
export const LOCALE_SEGMENTS: Record<string, string> = {
  fr: "Newsletter — français",
  en: "Newsletter — English",
};
/** Marketing CRM tags (customer_tags) → segment. Other tags never leave the database. */
export const TAG_SEGMENTS: Record<string, string> = {
  vip: "Clients — VIP",
};
export const MANAGED_SEGMENTS: readonly string[] = [...Object.values(LOCALE_SEGMENTS), ...Object.values(TAG_SEGMENTS)];
/**
 * Segments this code created before and no longer uses: deleted in Resend on sight to free the
 * plan's slots (deleting a segment keeps its contacts). Only these exact names, never the team's.
 */
export const RETIRED_SEGMENTS: readonly string[] = [
  "Newsletter — tous les abonnés",
  "Clients — fidèles",
  "Clients — gros paniers",
  "Clients — nouveaux",
  "Academy — élèves",
  "Academy — certifiés",
];

export interface PendingContact {
  id: string;
  email: string;
  subscribed: boolean;
  locale: string;
  firstName: string | null;
  tags: string[];
  dueAt: string;
}

export interface SyncStore {
  pending(limit: number): Promise<PendingContact[]>;
  /** Closes the row (error null) or keeps it queued with a backoff. */
  record(id: string, dueAt: string, error: string | null): Promise<void>;
}

export interface SyncReport {
  synced: number;
  created: number;
  deleted: number;
  failed: number;
  unsubscribedInResend: number;
  segmentsCreated: number;
  /** Segments this code no longer uses, deleted in Resend. */
  segmentsRetired: number;
  /** Set when the run stopped early (a key without the contacts permission, say). */
  stopped?: string;
}

/** The managed segment names a subscriber belongs in. */
export function wantedSegments(contact: Pick<PendingContact, "locale" | "tags">): string[] {
  const names = [LOCALE_SEGMENTS[contact.locale] ?? LOCALE_SEGMENTS.fr];
  for (const tag of contact.tags) {
    const name = TAG_SEGMENTS[tag];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Segment ids by managed name, created in Resend on first need. */
class SegmentDirectory {
  private byName: Map<string, string> | null = null;
  created = 0;
  retired = 0;
  constructor(private readonly api: ContactsApi) {}

  private async load(): Promise<Map<string, string>> {
    if (!this.byName) {
      this.byName = new Map();
      for (const segment of await this.api.listSegments()) {
        if (RETIRED_SEGMENTS.includes(segment.name)) {
          await this.api.deleteSegment(segment.id);
          this.retired++;
          continue;
        }
        // Two segments with one name: the first listed wins, always the same one.
        if (MANAGED_SEGMENTS.includes(segment.name) && !this.byName.has(segment.name)) this.byName.set(segment.name, segment.id);
      }
    }
    return this.byName;
  }

  async ids(names: string[]): Promise<string[]> {
    const map = await this.load();
    const out: string[] = [];
    for (const name of names) {
      let id = map.get(name);
      if (!id) {
        id = (await this.api.createSegment(name)).id;
        map.set(name, id);
        this.created++;
      }
      out.push(id);
    }
    return out;
  }

  async managedIds(): Promise<Set<string>> {
    return new Set((await this.load()).values());
  }
}

async function syncOne(api: ContactsApi, segments: SegmentDirectory, row: PendingContact, report: SyncReport): Promise<void> {
  if (!row.subscribed) {
    if (await api.deleteContact(row.email)) report.deleted++;
    return;
  }
  const wanted = await segments.ids(wantedSegments(row));
  const existing = await api.getContact(row.email);
  if (!existing) {
    await api.createContact({ email: row.email, firstName: row.firstName, segmentIds: wanted });
    report.created++;
    return;
  }
  if (existing.unsubscribed) report.unsubscribedInResend++;
  if (row.firstName && row.firstName !== existing.firstName) await api.setFirstName(row.email, row.firstName);
  const managed = await segments.managedIds();
  const current = new Set((await api.contactSegments(row.email)).map((s: Segment) => s.id));
  for (const id of wanted) if (!current.has(id)) await api.addToSegment(row.email, id);
  for (const id of current) if (managed.has(id) && !wanted.includes(id)) await api.removeFromSegment(row.email, id);
  report.synced++;
}

/** The sweep: never throws for one row; a key Resend refuses stops the run. */
export async function syncNewsletterContacts(
  api: ContactsApi,
  store: SyncStore,
  limit: number,
  log: (message: string, detail?: unknown) => void,
): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, created: 0, deleted: 0, failed: 0, unsubscribedInResend: 0, segmentsCreated: 0, segmentsRetired: 0 };
  const segments = new SegmentDirectory(api);
  for (const row of await store.pending(limit)) {
    try {
      await syncOne(api, segments, row, report);
      await store.record(row.id, row.dueAt, null);
    } catch (error) {
      const status = error instanceof ResendApiError ? error.status : 0;
      const message = error instanceof Error ? error.message : String(error);
      report.failed++;
      // Never the address in a log: the row id is enough to find it.
      log("contact not synced", { id: row.id, status, message });
      await store.record(row.id, row.dueAt, status === 401 || status === 403 ? `resend_forbidden: ${message}` : message);
      if (status === 401 || status === 403) {
        report.stopped = "resend_forbidden";
        break;
      }
    }
  }
  report.segmentsCreated = segments.created;
  report.segmentsRetired = segments.retired;
  return report;
}

export interface SyncDeps {
  /** EMAIL_INTERNAL_SECRET */
  secret: string | undefined;
  run(limit: number): Promise<SyncReport>;
  log(message: string, detail?: unknown): void;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function handleSyncNewsletterContacts(req: Request, deps: SyncDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await hasInternalSecret(req, deps.secret))) return json({ error: "unauthorized" }, 401);

  let limit = DEFAULT_LIMIT;
  if (req.headers.get("content-length") !== "0") {
    const body = await readJson(req, 1024);
    if (body !== null && typeof body === "object" && "limit" in body) {
      const asked = (body as { limit: unknown }).limit;
      if (typeof asked !== "number" || !Number.isInteger(asked) || asked < 1 || asked > MAX_LIMIT) {
        return json({ error: "invalid_limit" }, 400);
      }
      limit = asked;
    }
  }

  try {
    return json({ ok: true, report: await deps.run(limit) }, 200);
  } catch (error) {
    deps.log("sweep failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
}
