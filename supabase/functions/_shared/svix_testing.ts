/** Test helper: signs a webhook body the way Svix does. Not imported by deployed code. */

export const TEST_SECRET = "whsec_" + btoa("0123456789abcdef0123456789abcdef");

export async function sign(body: string, id: string, timestamp: number | string, secret = TEST_SECRET): Promise<string> {
  const raw = Uint8Array.from(atob(secret.slice("whsec_".length)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return "v1," + btoa(String.fromCharCode(...mac));
}

