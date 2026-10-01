import { useLocation } from "./lib/navigation";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ReviewOverlays } from "./components/reviews/ReviewOverlays";
import { FavoriteAccountDialogHost } from "./lib/favorites";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { isMemberSpacePath } from "./lib/memberSpace";
import { isLessonPlayerPath } from "./lib/academyUrl";
import { STUDIO_EDITOR_PATH, STUDIO_SHARE_PATH } from "./lib/studioUrl";
import { CookieBanner } from "./components/legal/CookieBanner";
import { CookieSettingsDialog } from "./components/legal/CookieSettingsDialog";

/* Every new page starts at the top, as it always has: the navigation module
   turns the Next.js router's own scrolling off (it keeps the position while
   the page is visible). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Keeps <html lang> in step with the UI language for screen readers and search
    engines: the root layout sets it on the server, and is not rendered again
    by a client-side navigation from `/fr/…` to `/en/…`. */
function DocumentLanguage() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language.slice(0, 2);
  }, [i18n.language]);
  return null;
}

/**
 * The administration workspace has its own chrome — a navigation rail and its
 * own header — so the storefront header and footer are left out entirely on
 * these routes. Prefix rather than exact match: every `/admin/...` screen,
 * including the access screen, is part of the same area.
 */
const ADMIN_ROUTE_PREFIX = "/admin";

/**
 * During maintenance the storefront's navigation leads nowhere, so the page
 * wears its own quiet chrome and the header and footer are left out.
 */
export const MAINTENANCE_ROUTE = "/maintenance";

/**
 * The 3D Studio editor is a full-screen workspace with its own application
 * bar, so it also leaves out the storefront header and footer. Unlike the back
 * office it stays a customer page: the cookie banner still shows. A shared
 * design's page is the same kind of screen: a 3D stage with its own bar.
 */
const WORKSPACE_ROUTES = [STUDIO_EDITOR_PATH, STUDIO_SHARE_PATH];

/**
 * The chrome every page shares (docs/migration-nextjs.md, phases 4–5): skip
 * link, cookie banner and dialog, header and footer, and two page-level
 * helpers the Next.js router does not replace (`ScrollToTop`,
 * `DocumentLanguage`). Each zone's layout renders it around its pages
 * (`src/zones/`); the stores are above, in the root layout
 * (`src/AppProviders.tsx`).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const adminArea = pathname === ADMIN_ROUTE_PREFIX || pathname.startsWith(`${ADMIN_ROUTE_PREFIX}/`);
  const bareChrome = adminArea || pathname === MAINTENANCE_ROUTE;
  // The editor and its sections (`/studio-3d/atelier/mes-creations`…), and
  // the member space, which carries its own sidebar (see `MemberShell`), and
  // the lesson player, a distraction-free workspace with its own bar.
  const workspace = WORKSPACE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`)) || isMemberSpacePath(pathname) || isLessonPlayerPath(pathname);

  return (
    <>
      <ScrollToTop />
      <DocumentLanguage />
      <a href="#main" className="gt-skip-link">
        {t("common.skipToContent")}
      </a>
      {/* First in the document so keyboard and screen-reader users
          meet it before the page, though it sits at the bottom of
          the screen. Not on the back office or maintenance chrome. */}
      {!bareChrome && <CookieBanner />}
      {!bareChrome && !workspace && <Header />}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      {!bareChrome && !workspace && <Footer />}
      <CookieSettingsDialog />
      <ReviewOverlays />
      <FavoriteAccountDialogHost />
    </>
  );
}
