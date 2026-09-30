/**
 * Which addresses need a session, where a signed-out visitor is sent, and
 * where an e-mail link lands — the rules shared by the proxy (`proxy.ts`), the
 * `/auth/confirm` route and the browser. Pure: no Next.js, no Supabase, no
 * `window`, so the three can import it and it can be unit-tested.
 *
 * These are navigation rules, not authorization: every read and write is
 * still authorized by Row Level Security in Postgres.
 */

export const SIGN_IN_PATH = "/connexion";
export const ADMIN_SIGN_IN_PATH = "/admin/connexion";
export const AUTH_CONFIRM_PATH = "/auth/confirm";

/** The query key carrying the page to return to (also used by `/confirmation-compte`). */
export const RETURN_PARAM = "suite";

/** The pages e-mail links end on, per kind of link. */
export const CONFIRM_ACCOUNT_PATH = "/confirmation-compte";
export const RESET_PASSWORD_PATH = "/reinitialiser-mot-de-passe";
export const VERIFY_EMAIL_PATH = "/verifier-email";
export const EMAIL_CHANGE_LANDING = `${VERIFY_EMAIL_PATH}?type=changement`;

/** Only same-site paths: never let a link send someone to another origin. */
export function isSafeNext(path: string): boolean {
  // Browsers drop tabs and newlines inside URLs and read "\" as "/", so
  // "/\t/evil.example" or "/\\evil.example" would leave the site.
  // eslint-disable-next-line no-control-regex
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(path);
}

export type Gate = "account" | "staff";

/**
 * The session a path needs, or null when it is open. Mirrors the client
 * guards in `App.tsx`: `RequireAccount` (member space, learner pages) and
 * `RequireAdmin` (back office, except its own sign-in screen). The staff role
 * itself is checked by the back office and by RLS, not here.
 */
export function gateFor(pathname: string): Gate | null {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (under(ADMIN_SIGN_IN_PATH)) return null;
  if (under("/admin")) return "staff";
  if (under("/compte") || under("/academy/lecon") || pathname.startsWith("/academy/mes-formations/")) return "account";
  return null;
}

/** Where a signed-out visitor is sent, carrying the page they asked for. */
export function signInRedirect(gate: Gate, pathname: string, search: string): string {
  const params = new URLSearchParams({ [RETURN_PARAM]: pathname + search });
  return `${gate === "staff" ? ADMIN_SIGN_IN_PATH : SIGN_IN_PATH}?${params}`;
}

/** The return path in a query string, when it is a safe same-site path. */
export function returnPathFrom(search: string): string | undefined {
  const value = new URLSearchParams(search).get(RETURN_PARAM);
  return value && isSafeNext(value) ? value : undefined;
}

/** E-mail link kinds `/auth/confirm` accepts: the ones the app sends. */
export type ConfirmType = "signup" | "email" | "recovery" | "email_change";

const DEFAULT_NEXT: Record<ConfirmType, string> = {
  signup: CONFIRM_ACCOUNT_PATH,
  email: CONFIRM_ACCOUNT_PATH,
  recovery: RESET_PASSWORD_PATH,
  email_change: EMAIL_CHANGE_LANDING,
};

export function parseConfirmType(value: string | null): ConfirmType | null {
  return value !== null && Object.hasOwn(DEFAULT_NEXT, value) ? (value as ConfirmType) : null;
}

/** The page a link lands on: its safe `next`, else the page for its kind. */
export function confirmNext(next: string | null, type: ConfirmType | null): string {
  if (next && isSafeNext(next)) return next;
  return type ? DEFAULT_NEXT[type] : CONFIRM_ACCOUNT_PATH;
}

/** `/auth/confirm?next=…`: what the app gives Supabase as the e-mail redirect. */
export function authConfirmUrl(next: string, origin: string): string {
  const url = new URL(AUTH_CONFIRM_PATH, origin);
  url.searchParams.set("next", next);
  return url.toString();
}

/**
 * Adds a refused link's error to the landing page's query string, in the
 * shape Supabase itself uses (`error`, `error_code`), which
 * `authLinkErrorFromUrl` already reads.
 */
export function withLinkError(path: string, code: string | undefined): string {
  const url = new URL(path, "http://x");
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("error_code", code || "invalid_link");
  return url.pathname + url.search;
}
