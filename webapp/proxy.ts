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
 *    office, to the matching sign-in page with `?suite=<the page asked for>`.
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

  const { response, signedIn } = await refreshSession(request, requestHeaders);
  const gate = gateFor(pathname);
  if (!gate || signedIn) return response;

  const redirect = NextResponse.redirect(new URL(signInRedirect(gate, pathname, search), request.url));
  // Keep whatever the refresh wrote (a cleared, expired session included).
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Pages only: not the build output, the image optimizer, nor files from public/ or bundled assets.
    "/((?!_next/static|_next/image|videos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|glb|mp4|webm|txt|xml|json|webmanifest)$).*)",
  ],
};
