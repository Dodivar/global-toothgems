import { NextResponse, type NextRequest } from "next/server";
import { confirmNext, parseConfirmType, withLinkError } from "../../../src/lib/authRoutes";
import { isSupabaseConfigured } from "../../../src/lib/supabase/env";
import { createServerSupabase } from "../../../src/lib/supabase/server";

/**
 * Where every Supabase Auth e-mail link lands: account confirmation, password
 * recovery, e-mail change, team invitation. It opens the session server-side (cookies), then
 * sends the member on to the page that shows the outcome — the pages that
 * already existed for it (`/confirmation-compte`, `/reinitialiser-mot-de-passe`,
 * `/verifier-email?type=changement`, or the safe `next` the app asked for).
 *
 * Two shapes are accepted:
 * - `?token_hash=…&type=…` (the e-mail templates in supabase/templates/):
 *   verified with `verifyOtp`, works whichever device opens the link;
 * - `?code=…` (Supabase's default templates with the PKCE flow): exchanged
 *   with the code verifier cookie, so only in the browser that asked for it.
 *
 * A refused link goes to the same page with `error` / `error_code` in the
 * query string, which the pages already read (`authLinkErrorFromUrl`). The
 * token never travels further than this request.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = parseConfirmType(params.get("type"));
  const next = confirmNext(params.get("next"), type);

  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  if (!isSupabaseConfigured) return go(withLinkError(next, undefined));

  // Supabase refused the link itself before redirecting here.
  if (params.has("error") || params.has("error_code")) return go(withLinkError(next, params.get("error_code") ?? undefined));

  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  if (!(tokenHash && type) && !code) return go(withLinkError(next, undefined));

  const supabase = await createServerSupabase();

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return go(withLinkError(next, error.code));
    // Secure e-mail change: the first of the two links is accepted without a
    // session; the landing page asks for the other one.
    if (type === "email_change" && !data.session) {
      const halfway = new URL(next, request.nextUrl.origin);
      halfway.searchParams.set("message", "confirm_other_address");
      return go(halfway.pathname + halfway.search);
    }
    return go(next);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code!);
  return go(error ? withLinkError(next, error.code) : next);
}
