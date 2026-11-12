/**
 * Cloudflare Turnstile server-side check (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
 * A plain `fetch`, injectable for tests. The token is single use and lives 300 seconds;
 * Cloudflare answers `{ success, "error-codes": [...] }`.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp: string | null,
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await doFetch(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`turnstile siteverify answered ${response.status}`);
  const body = (await response.json()) as { success?: unknown };
  return body.success === true;
}
