/**
 * Resend contacts and segments, as the newsletter sync needs them: a plain `fetch` client,
 * injectable for tests (no SDK, as for sending, `_shared/email/resend.ts`).
 *
 * Endpoints (Resend's global contacts, where audiences became segments; checked against the
 * official `resend` SDK 6.37.0):
 *   GET    /segments?limit=&after=                     list (object "list", data, has_more)
 *   POST   /segments                     {name}        → {id}
 *   DELETE /segments/{id}                              (its contacts stay)
 *   GET    /contacts/{email}                           → {id, email, first_name, unsubscribed…} | 404
 *   POST   /contacts   {email, first_name, unsubscribed, segments: [{id}]}
 *   PATCH  /contacts/{email}             {first_name}
 *   DELETE /contacts/{email}
 *   GET    /contacts/{email}/segments?limit=&after=    the contact's segments
 *   POST   /contacts/{email}/segments/{segment id}     add
 *   DELETE /contacts/{email}/segments/{segment id}     remove
 *
 * Requests are paced (Resend limits a team to a few requests per second) and a 429 is retried
 * once after its Retry-After. A key without the contacts permission answers 401/403: the error
 * says so, `permanent`.
 */

export class ResendApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ResendApiError";
    this.status = status;
  }
}

export interface Segment {
  id: string;
  name: string;
}

export interface RemoteContact {
  id: string;
  firstName: string | null;
  unsubscribed: boolean;
}

export interface ContactsApi {
  listSegments(): Promise<Segment[]>;
  createSegment(name: string): Promise<Segment>;
  deleteSegment(id: string): Promise<void>;
  getContact(email: string): Promise<RemoteContact | null>;
  createContact(contact: { email: string; firstName: string | null; segmentIds: string[] }): Promise<void>;
  setFirstName(email: string, firstName: string): Promise<void>;
  /** True when a contact was deleted, false when there was none. */
  deleteContact(email: string): Promise<boolean>;
  contactSegments(email: string): Promise<Segment[]>;
  addToSegment(email: string, segmentId: string): Promise<void>;
  removeFromSegment(email: string, segmentId: string): Promise<void>;
}

export interface ContactsApiConfig {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Minimum gap between two requests, in ms (default 550: under 2 per second). */
  minGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const PAGE = 100;

export function resendContactsApi(config: ContactsApiConfig): ContactsApi {
  const doFetch = config.fetch ?? fetch;
  const base = config.baseUrl ?? "https://api.resend.com";
  const gap = config.minGapMs ?? 550;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last = 0;

  async function call(method: string, path: string, body?: unknown, retried = false): Promise<{ status: number; data: unknown }> {
    const wait = last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new ResendApiError(`network error: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // No JSON body (e.g. some 204/404 answers): classified by status.
    }
    if (response.status === 429 && !retried) {
      const after = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 1000);
      return call(method, path, body, true);
    }
    if (response.ok || response.status === 404) return { status: response.status, data };
    const message = typeof (data as { message?: unknown } | null)?.message === "string"
      ? (data as { message: string }).message
      : `HTTP ${response.status}`;
    throw new ResendApiError(`${method} ${path.split("/")[1]}: ${message}`.slice(0, 300), response.status);
  }

  const contactPath = (email: string) => `/contacts/${encodeURIComponent(email)}`;

  async function list(path: string): Promise<Segment[]> {
    const out: Segment[] = [];
    let after: string | undefined;
    for (let page = 0; page < 50; page++) {
      const query = new URLSearchParams({ limit: String(PAGE), ...(after ? { after } : {}) });
      const { status, data } = await call("GET", `${path}?${query}`);
      if (status === 404) return out;
      const body = data as { data?: unknown; has_more?: unknown } | null;
      const rows = Array.isArray(body?.data) ? body.data : [];
      for (const row of rows) {
        const r = row as { id?: unknown; name?: unknown };
        if (typeof r.id === "string" && typeof r.name === "string") out.push({ id: r.id, name: r.name });
      }
      if (body?.has_more !== true || rows.length === 0) return out;
      after = out[out.length - 1].id;
    }
    return out;
  }

  const expectFound = (status: number, what: string) => {
    if (status === 404) throw new ResendApiError(`${what}: not found`, 404);
  };

  return {
    listSegments: () => list("/segments"),

    async createSegment(name) {
      const { status, data } = await call("POST", "/segments", { name });
      expectFound(status, "segments");
      const id = (data as { id?: unknown } | null)?.id;
      if (typeof id !== "string") throw new ResendApiError("segments: no id in the answer", status);
      return { id, name };
    },

    async deleteSegment(id) {
      await call("DELETE", `/segments/${encodeURIComponent(id)}`);
    },

    async getContact(email) {
      const { status, data } = await call("GET", contactPath(email));
      if (status === 404) return null;
      const c = data as { id?: unknown; first_name?: unknown; unsubscribed?: unknown } | null;
      if (typeof c?.id !== "string") throw new ResendApiError("contacts: unexpected answer", status);
      return { id: c.id, firstName: typeof c.first_name === "string" ? c.first_name : null, unsubscribed: c.unsubscribed === true };
    },

    async createContact({ email, firstName, segmentIds }) {
      const { status } = await call("POST", "/contacts", {
        email,
        unsubscribed: false,
        ...(firstName ? { first_name: firstName } : {}),
        segments: segmentIds.map((id) => ({ id })),
      });
      expectFound(status, "contacts");
    },

    async setFirstName(email, firstName) {
      const { status } = await call("PATCH", contactPath(email), { first_name: firstName });
      expectFound(status, "contacts");
    },

    async deleteContact(email) {
      const { status } = await call("DELETE", contactPath(email));
      return status !== 404;
    },

    contactSegments: (email) => list(`${contactPath(email)}/segments`),

    async addToSegment(email, segmentId) {
      const { status } = await call("POST", `${contactPath(email)}/segments/${encodeURIComponent(segmentId)}`);
      expectFound(status, "contacts");
    },

    async removeFromSegment(email, segmentId) {
      await call("DELETE", `${contactPath(email)}/segments/${encodeURIComponent(segmentId)}`);
    },
  };
}
