// A stand-in for the few Supabase endpoints the auth plumbing calls, so the
// proxy and `/auth/confirm` can be tested end to end without touching a real
// project. Tokens are fake HS256 JWTs signed "e2e": the app never verifies
// them itself (with a shared-secret project, `getClaims()` asks Auth, i.e. this
// server). Not a Supabase emulator: only what e2e/auth-server.spec.ts needs.
//
//   POST /auth/v1/verify   token_hash "valid-…" → session; "expired" → otp_expired;
//                          type email_change + "halfway" → accepted, no session
//   GET  /auth/v1/user     200 for a token issued here, 401 otherwise
//   GET  /rest/v1/profiles the member's profile row
//   GET  /rest/v1/products, /product_translations, /product_review_stats:
//                          one product with a French and an English slug, for
//                          the per-language product addresses (locale tests);
//                          `slug=eq.` / `id=eq.` filters honoured
//   other /rest/v1 → []
//   GET  /__server-reads   how many REST reads each table got from the Next.js
//                          server (requests without an Origin header), for the
//                          catalogue cache test
import { createServer } from "node:http";

const port = Number(process.env.FAKE_SUPABASE_PORT) || 54399;
const USER = {
  id: "00000000-0000-4000-8000-00000000e2e0",
  aud: "authenticated",
  role: "authenticated",
  email: "membre.e2e@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: USER.id, email: USER.email, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, session_id: "e2e", aal: "aal1", is_anonymous: false };
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.e2e`;
}

function issuedHere(token) {
  const [header, payload, signature] = (token ?? "").split(".");
  if (!header || !payload || signature !== "e2e") return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

function session() {
  return { access_token: accessToken(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "e2e-refresh", user: USER };
}

const PROFILE = { first_name: "Membre", last_name: "E2E", email: USER.email, phone: null, country_code: "FR", marketing_opt_in: false, status: "active", role: "customer" };

const PRODUCT = {
  id: "00000000-0000-4000-8000-0000000000a1",
  slug: "coeur-chrome",
  name: "Cœur Chrome",
  short_description: "Un cœur chromé.",
  description: "Un cœur chromé, poli miroir.",
  price: 29,
  compare_at_price: null,
  currency: "EUR",
  is_featured: false,
  metadata: {},
  category: null,
  family: null,
  product_translations: [
    { locale: "en", name: "Chrome Heart", slug: "chrome-heart-tooth-gem", short_description: "A chrome heart.", description: "A mirror-polished chrome heart.", status: "published" },
  ],
  product_variants: [],
  product_media: [],
  inventory_items: [{ stock_status: "in_stock" }],
};

/** PostgREST `column=eq.value` filters of a request (only `eq` is faked). */
function matches(url, row) {
  for (const [column, filter] of url.searchParams) {
    if (filter.startsWith("eq.") && column in row && String(row[column]) !== filter.slice(3)) return false;
  }
  return true;
}

const serverReads = {};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith("/rest/v1/") && req.method === "GET" && !req.headers.origin) {
    const table = url.pathname.slice("/rest/v1/".length);
    serverReads[table] = (serverReads[table] ?? 0) + 1;
  }
  const send = (status, body) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(204, {});

  let body = {};
  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      body = {};
    }
  }

  if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
    const { token_hash: hash, type } = body;
    if (type === "email_change" && hash === "halfway") return send(200, { msg: "Confirmation link accepted. Please proceed to confirm link sent to the other email", code: 200 });
    if (typeof hash === "string" && hash.startsWith("valid-")) return send(200, session());
    if (hash === "expired") return send(403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
    return send(403, { code: 403, error_code: "otp_disabled", msg: "Token has expired or is invalid" });
  }
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    return issuedHere(token) ? send(200, USER) : send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (url.pathname === "/auth/v1/token") {
    return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
  }
  if (url.pathname === "/auth/v1/logout") return send(204, {});
  if (url.pathname === "/rest/v1/profiles") {
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    return send(200, single ? PROFILE : [PROFILE]);
  }
  if (url.pathname === "/rest/v1/products") return send(200, [PRODUCT].filter((row) => matches(url, row)));
  if (url.pathname === "/rest/v1/product_translations") {
    const rows = PRODUCT.product_translations.map((t) => ({ ...t, product_id: PRODUCT.id }));
    return send(200, rows.filter((row) => matches(url, row)));
  }
  if (url.pathname.startsWith("/rest/v1/")) return send(200, []);
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/__server-reads") return send(200, serverReads);
  return send(404, { message: "not faked" });
}).listen(port, () => console.log(`fake Supabase on http://localhost:${port}`));
