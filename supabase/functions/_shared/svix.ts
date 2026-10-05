/**
 * Verification of Svix-signed webhooks (Resend uses Svix), with Web Crypto only.
 *
 * Svix signs `<svix-id>.<svix-timestamp>.<raw body>` with HMAC-SHA256 under the
 * endpoint secret (`whsec_` + base64). The `svix-signature` header holds one or
 * more space-separated `v1,<base64 signature>` entries (several while a secret
 * is being rotated); any valid one is enough. A timestamp more than five minutes
 * from now, in either direction, is refused so a captured request cannot be
 * replayed later.
 */

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const raw = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  const trimmed = secret?.trim();
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!trimmed || !id || !timestamp || !signatures) return false;

  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;

  const keyBytes = base64ToBytes(trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed);
  if (!keyBytes || keyBytes.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);

  let valid = false;
  for (const entry of signatures.split(" ")) {
    const [version, signature] = entry.split(",", 2);
    if (version !== "v1" || !signature) continue;
    const bytes = base64ToBytes(signature);
    // subtle.verify compares in constant time; every entry is checked, none short-circuits the work.
    if (bytes && (await crypto.subtle.verify("HMAC", key, bytes, signed))) valid = true;
  }
  return valid;
}
