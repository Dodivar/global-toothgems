/**
 * Authentication of internal callers (pg_cron, the Next.js server routes) of
 * functions deployed with verify_jwt = false: a shared secret in the
 * `x-internal-secret` header, compared in constant time.
 */

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** True when the header equals the secret. An empty secret never authenticates anyone. */
export async function hasInternalSecret(req: Request, secret: string | undefined): Promise<boolean> {
  const expected = secret?.trim();
  const given = req.headers.get("x-internal-secret");
  if (!expected || !given) return false;
  // Hashing first makes the comparison length-independent; the loop never exits early.
  const [a, b] = await Promise.all([digest(expected), digest(given)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
