import { NextResponse, type NextRequest } from "next/server";
import { gateFor, signInRedirect } from "./src/lib/authRoutes";
import { LANGUAGE_KEY, legacyAddress, negotiateLocale, parsePath } from "./src/lib/localeRoutes";
import { LOCALE_HEADER, PATH_HEADER } from "./src/lib/localeHeader";
import { isSupabaseConfigured } from "./src/lib/supabase/env";
import { refreshSession } from "./src/lib/supabase/proxySession";

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware).
 *
 * 1. Language in the address (phase 3, `src/lib/localeRoutes.ts`): `/` is
 *    sent to `/fr` or `/en` by the saved choice, else the browser's language,
 *    else English; old unprefixed public addresses are permanently moved
 *    (`/boutique` → `/fr/boutique`, `/help` → `/en/help`). The language of the
 *    request is passed on to the root layout (`<html lang>`).
 * 2. Session (phase 2): keeps the Supabase session fresh and turns signed-out
 *    visitors away from the member space, the learner pages and the back
 *    office: the member zones to `/connexion?suite=<the page asked for>`; the
 *    back office answers the site's 404 to anyone who is not an active staff
 *    member (its own profile, read under RLS; decided 2026-10-01, 404
 *    instead of a sign-in page since 2026-11-11).
 *    Navigation, not authorization: RLS decides every read and write. In mock
 *    mode (no Supabase variables) the client guards decide, as before. The
 *    zones' server layouts and pages check again (`app/_zones/guard.ts`).
 *
 * See docs/migration-nextjs.md.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const saved = request.cookies.get(LANGUAGE_KEY)?.value;
  const acceptLanguage = request.headers.get("accept-language");

  if (pathname === "/") {
    const home = new URL(`/${negotiateLocale(saved, acceptLanguage)}${search}`, request.url);
    const response = NextResponse.redirect(home, 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie, Accept-Language");
    return response;
  }
  const moved = legacyAddress(pathname);
  if (moved) return NextResponse.redirect(new URL(`${moved}${search}`, request.url), 308);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, parsePath(pathname).locale ?? negotiateLocale(saved, acceptLanguage));
  // For the server layouts of the private zones, which are not given the address.
  requestHeaders.set(PATH_HEADER, pathname + search);

  if (!isSupabaseConfigured) return NextResponse.next({ request: { headers: requestHeaders } });

  const gate = gateFor(pathname);
  const { response, signedIn, staff } = await refreshSession(request, requestHeaders, { checkStaff: gate === "staff" });
  if (!gate || (signedIn && (gate !== "staff" || staff))) return response;

  // The back office answers anyone who is not an active staff member, signed
  // in or not, with the site's 404 (decided 2026-11-11): no redirect and no
  // sign-in page confirming the address. A rewrite, because only the proxy
  // can still set the status: the pages' own `notFound()` comes after the
  // stream has started (200). Next.js keeps an `x-middleware-rewrite` header
  // on the response; the route names are in the public bundles anyway, so
  // this is noise reduction, not secrecy — the second factor is the lock.
  const refused =
    gate === "staff"
      ? NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { request: { headers: requestHeaders } })
      : NextResponse.redirect(new URL(signInRedirect(pathname, search), request.url));
  // Keep whatever the refresh wrote (a cleared, expired session included).
  for (const cookie of response.cookies.getAll()) refused.cookies.set(cookie);
  return refused;
}

/** An address no route matches (`_` folders are never routes): rendered by `app/not-found.tsx` with a 404. */
const NOT_FOUND_PATH = "/_introuvable";

export const config = {
  matcher: [
    // Pages only: not the build output, the image optimizer, files from public/ or bundled assets,
    // nor the Academy's public course covers (`app/media/formations`, read with the publishable key).
    "/((?!_next/static|_next/image|videos/|media/formations/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|glb|mp4|webm|txt|xml|json|webmanifest)$).*)",
  ],
};
