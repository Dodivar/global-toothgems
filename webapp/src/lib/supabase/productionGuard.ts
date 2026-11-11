/**
 * Build-time guard (called from `next.config.ts`): a Vercel PRODUCTION build
 * without the Supabase variables fails instead of shipping the mock mode.
 *
 * Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 * the app silently runs on its fixtures (`isSupabaseConfigured`): demo
 * catalogue, demo payment, mock accounts and back office. That is what the
 * CI's mock-mode build and the Playwright smoke suite want, and what a
 * production deployment must never serve (AGENTS.md §4).
 *
 * Keyed on `VERCEL_ENV === "production"` only — never on `NODE_ENV`, which is
 * "production" for every `next build`, the CI's mock-mode builds included.
 * Preview deployments keep the fallback.
 */

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function productionConfigProblems(env: Env): string[] {
  if (env.VERCEL_ENV !== "production") return [];
  const problems: string[] = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  else {
    let host = "";
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      if (parsed.protocol !== "https:") problems.push("NEXT_PUBLIC_SUPABASE_URL must be an https:// address");
    } catch {
      problems.push("NEXT_PUBLIC_SUPABASE_URL is not a valid address");
    }
    if (LOCAL_HOSTS.has(host)) problems.push("NEXT_PUBLIC_SUPABASE_URL points at a local stack");
  }
  if (!key) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  // Next.js inlines NEXT_PUBLIC_* into the browser bundle: a secret key there is public.
  else if (/^sb_secret_/.test(key) || /"role"\s*:\s*"service_role"/.test(decodeJwtPayload(key))) {
    problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret / service-role key");
  }
  return problems;
}

function decodeJwtPayload(value: string): string {
  const part = value.split(".")[1];
  if (!part) return "";
  try {
    return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function assertProductionConfig(env: Env): void {
  const problems = productionConfigProblems(env);
  if (problems.length) {
    throw new Error(`Refusing to build production: ${problems.join("; ")}. Set them in Vercel › Project › Environment Variables (Production).`);
  }
}
