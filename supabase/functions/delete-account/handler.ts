import { corsHeaders, json, readJson, type SiteOrigins } from "../_shared/http.ts";
import { bearer, looksLikeJwt } from "../_shared/studioBilling.ts";

/**
 * POST /functions/v1/delete-account   {"confirm": true}  (the member's token)
 *
 * The signed-in member deletes their own account (GDPR art. 17, decision 125).
 * The account comes from the token only; the body only confirms.
 *
 *   1. the token is checked, and the member must have signed in within the
 *      last 10 minutes (the token's `amr` timestamps): a stolen or forgotten
 *      session cannot erase an account;
 *   2. what blocks the erasure (staff account, running Studio subscription,
 *      withdrawal under way, order being paid) is read as the member;
 *   3. the member's Storage files are removed (only the database knows which);
 *   4. `erase_account()` erases the account in one transaction, re-checking
 *      the blockers;
 *   5. the confirmation e-mail goes to the address the account had.
 *
 * A failure before step 4 leaves the account in place and calling again
 * resumes; after it, the account is gone and the answer is 200 anyway.
 *
 *   200 { status: "deleted" }
 *   400 { error: invalid_request }
 *   401 { error: sign_in_required | session_expired }
 *   403 { error: reauthentication_required }
 *   409 { error: blocked, blockers: [...] }
 *   500 { error: server_error }
 */

/** How recent the member's last sign-in must be, in seconds. */
export const REAUTH_WINDOW_SECONDS = 10 * 60;

const MAX_BODY_BYTES = 256;
const REMOVE_BATCH = 100;

export interface Member {
  id: string;
  /** The address the confirmation e-mail goes to (the account's own). */
  email: string | null;
}

export interface Recipient {
  email: string;
  locale: string;
}

export type EraseResult = { status: "erased" } | { status: "not_found" } | { status: "blocked"; blockers: string[] };

export interface DeleteAccountDeps {
  origins: SiteOrigins;
  /** The account the token belongs to (verified by Supabase Auth), or null. */
  memberFromToken(token: string): Promise<Member | null>;
  /** What blocks the erasure, read as the member (`my_account_erasure_blockers()`). */
  blockers(token: string): Promise<string[]>;
  recipient(member: Member): Promise<Recipient | null>;
  files(userId: string): Promise<{ bucket: string; name: string }[]>;
  removeFiles(bucket: string, names: string[]): Promise<void>;
  erase(userId: string): Promise<EraseResult>;
  confirm(userId: string, recipient: Recipient, erasedAt: Date): Promise<void>;
  now(): Date;
  log(message: string, detail?: unknown): void;
}

function base64UrlJson(segment: string): unknown {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * When the session behind the token last authenticated (password, Google,
 * e-mail link…), in seconds since the epoch: the newest `amr` timestamp.
 * Read only from a token Supabase Auth has just verified. Null when absent.
 */
export function lastAuthenticatedAt(token: string): number | null {
  try {
    const payload = base64UrlJson(token.split(".")[1] ?? "") as { amr?: unknown };
    if (!Array.isArray(payload.amr)) return null;
    const times = payload.amr
      .map((entry) => (entry && typeof entry === "object" ? (entry as { timestamp?: unknown }).timestamp : undefined))
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    return times.length > 0 ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

function isConfirmation(body: unknown): boolean {
  return !!body && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).length === 1 && (body as { confirm?: unknown }).confirm === true;
}

function groupByBucket(files: { bucket: string; name: string }[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const names = groups.get(file.bucket) ?? [];
    names.push(file.name);
    groups.set(file.bucket, names);
  }
  return groups;
}

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return json({ error: "sign_in_required" }, 401, cors);
  if (!isConfirmation(await readJson(req, MAX_BODY_BYTES))) return json({ error: "invalid_request" }, 400, cors);

  let member: Member | null;
  try {
    member = await deps.memberFromToken(token);
  } catch (error) {
    deps.log("token check failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500, cors);
  }
  if (!member) return json({ error: "session_expired" }, 401, cors);

  const authenticatedAt = lastAuthenticatedAt(token);
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  if (authenticatedAt === null || nowSeconds - authenticatedAt > REAUTH_WINDOW_SECONDS) {
    return json({ error: "reauthentication_required" }, 403, cors);
  }

  try {
    const blockers = await deps.blockers(token);
    if (blockers.length > 0) return json({ error: "blocked", blockers }, 409, cors);

    // Read before the erasure: afterwards the account and its address are gone.
    const recipient = await deps.recipient(member);

    for (const [bucket, names] of groupByBucket(await deps.files(member.id))) {
      for (let i = 0; i < names.length; i += REMOVE_BATCH) {
        await deps.removeFiles(bucket, names.slice(i, i + REMOVE_BATCH));
      }
    }

    const result = await deps.erase(member.id);
    if (result.status === "blocked") return json({ error: "blocked", blockers: result.blockers }, 409, cors);

    if (result.status === "erased" && recipient) {
      try {
        await deps.confirm(member.id, recipient, deps.now());
      } catch (error) {
        // The account is gone either way; the e-mail is a courtesy, logged when it fails.
        deps.log("confirmation e-mail failed", error instanceof Error ? error.message : error);
      }
    }
    return json({ status: "deleted" }, 200, cors);
  } catch (error) {
    deps.log("account deletion failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500, cors);
  }
}
