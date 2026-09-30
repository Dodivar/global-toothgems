import { NextResponse, type NextRequest } from "next/server";
import { gateFor, signInRedirect } from "./src/lib/authRoutes";
import { isSupabaseConfigured } from "./src/lib/supabase/env";
import { refreshSession } from "./src/lib/supabase/proxySession";

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware).
 *
 * - Keeps the Supabase session fresh: the cookie session written by the
 *   browser client is refreshed here, so server code sees a valid one.
 * - Turns signed-out visitors away from the member space, the learner pages
 *   and the back office before any of it is sent, to the matching sign-in
 *   page with `?suite=<the page they asked for>`.
 *
 * This is navigation, not authorization: RLS decides every read and write,
 * and the back office checks the staff role itself. In mock mode (no Supabase
 * variables) there is no real session to read, so the client guards decide,
 * as before. See docs/migration-nextjs.md, phase 2.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  const { response, signedIn } = await refreshSession(request);
  const { pathname, search } = request.nextUrl;
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
