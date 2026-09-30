import { useLocation } from "./lib/navigation";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCatalog } from "./lib/catalog/CatalogProvider";
import { ReviewOverlays } from "./components/reviews/ReviewOverlays";
import { FavoriteAccountDialogHost } from "./lib/favorites";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { isMemberSpacePath } from "./lib/memberSpace";
import { isLessonPlayerPath } from "./lib/academyUrl";
import { STUDIO_EDITOR_PATH, STUDIO_SHARE_PATH } from "./lib/studioUrl";
import { CookieBanner } from "./components/legal/CookieBanner";
import { CookieSettingsDialog } from "./components/legal/CookieSettingsDialog";
import { parsePath, toAddress } from "./lib/localeRoutes";
import { titleFor } from "./lib/pageMeta";
import { productTitle } from "./lib/catalog/productMeta";
import type { AppZone } from "./lib/appZones";
import { ZoneArrival } from "./zones/ZoneExit";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Keeps <html lang> in step with the UI language for screen readers and search engines. */
function DocumentLanguage() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language.slice(0, 2);
  }, [i18n.language]);
  return null;
}

/**
 * Tab title of public pages, from the table the server's `<head>` uses
 * (`lib/pageMeta.ts`, `lib/catalog/productMeta.ts`), so it follows client-side
 * navigation. Screens that name themselves (legal, system pages) set theirs
 * after it; other screens keep the site name, as before.
 */
function DocumentTitle() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const { findProduct } = useCatalog();
  const locale = i18n.language.startsWith("en") ? "en" : "fr";
  useEffect(() => {
    const address = parsePath(toAddress(pathname, locale));
    // A product page is titled by its product, as the server titles it.
    const product = address.route?.id === "product" ? findProduct(address.params.id) : undefined;
    document.title = product ? productTitle(product, locale) : titleFor(address);
  }, [pathname, locale, findProduct]);
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
 * The chrome every zone's page shares (docs/migration-nextjs.md, phase 4):
 * skip link, cookie banner and dialog, header and footer, and the page-level
 * helpers. `children` is the zone's `<Routes>`; `zone` is the zone rendering
 * it (`lib/appZones.ts`). The stores are above, in the root layout
 * (`src/AppProviders.tsx`, phase 5).
 */
export function AppShell({ zone, children }: { zone: AppZone; children: ReactNode }) {
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
      <ZoneArrival zone={zone} />
      <ScrollToTop />
      <DocumentLanguage />
      <DocumentTitle />
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
