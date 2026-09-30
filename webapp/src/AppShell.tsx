import { useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "./lib/auth";
import { AdminAuthProvider } from "./lib/adminAuth";
import { CartProvider } from "./lib/cart";
import { CatalogProvider, useCatalog, type CatalogSeed } from "./lib/catalog/CatalogProvider";
import { OrdersProvider } from "./lib/orders";
import { ProgressProvider } from "./lib/progress";
import { AdminTrainingProvider } from "./lib/adminTraining";
import { TrainingMediaProvider } from "./lib/trainingMedia";
import { CommunityProvider } from "./lib/community";
import { ToastProvider } from "./lib/toast";
import { SecurityProvider } from "./lib/securityState";
import { CookieConsentProvider } from "./lib/cookieConsent";
import { ReviewModeProvider } from "./lib/reviewMode";
import { PromotionsProvider } from "./lib/adminPromotions";
import { ReviewsProvider } from "./lib/reviews";
import { FavoritesProvider } from "./lib/favorites";
import { ReviewOverlays } from "./components/reviews/ReviewOverlays";
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
 * What every zone of the site shares (docs/migration-nextjs.md, phase 4): the
 * stores, in the order their comments justify, and the chrome around the
 * page. `children` is the zone's `<Routes>`; `zone` is the zone rendering it
 * (`lib/appZones.ts`). `catalog`: what the server read of the catalogue for a
 * server-rendered page.
 */
export function AppShell({ zone, catalog, children }: { zone: AppZone; catalog?: CatalogSeed; children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const adminArea = pathname === ADMIN_ROUTE_PREFIX || pathname.startsWith(`${ADMIN_ROUTE_PREFIX}/`);
  const bareChrome = adminArea || pathname === MAINTENANCE_ROUTE;
  // The editor and its sections (`/studio-3d/atelier/mes-creations`…), and
  // the member space, which carries its own sidebar (see `MemberShell`), and
  // the lesson player, a distraction-free workspace with its own bar.
  const workspace = WORKSPACE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`)) || isMemberSpacePath(pathname) || isLessonPlayerPath(pathname);

  return (
    // The product catalogue (Supabase, or the mock fixtures when it is not
    // configured) is read by the shop, product pages, home and cart alike.
    <CatalogProvider seed={catalog}>
    <AuthProvider>
      {/* Pending email change, password date and data-export status: read by
          the member area and by the verification page a link lands on. */}
      <SecurityProvider>
      <AdminAuthProvider>
      {/* Promotions, campaigns and gift cards. Above the routes rather than in
          the admin layout: the storefront gift card page reads the same product
          configuration, so an edit in the back office shows on /carte-cadeau. */}
      <PromotionsProvider>
        {/* The authored training catalogue: what the back office builds is
            exactly what a learner reads, so the store sits above both rather
            than inside the admin layout. Learning progress reads it. */}
        <AdminTrainingProvider>
        {/* The training image library (back office). Beside the courses so an
            uploaded lesson image keeps showing on the learner's side. */}
        <TrainingMediaProvider>
        {/* Learning progress and orders sit above the cart: paying turns the cart
            into an order, and both histories feed the member dashboard. */}
        <ProgressProvider>
          <OrdersProvider>
            <CartProvider>
              {/* The community reads the account and the courses on it: forum
                  access is what a training purchase unlocks, so the provider sits
                  under both rather than owning that fact itself. */}
              <CommunityProvider>
                <ToastProvider>
                <CookieConsentProvider>
                <ReviewModeProvider>
                {/* Customer reviews and their moderation. Inside the toasts and
                    under the account, orders and progress it checks eligibility
                    against; above both the storefront and the back office, so a
                    review approved in /admin/avis shows on the product page. */}
                <ReviewsProvider>
                {/* The member's favourite products: reads the account and the
                    catalogue above it, and confirms with a toast. */}
                <FavoritesProvider>
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
                </FavoritesProvider>
                </ReviewsProvider>
                </ReviewModeProvider>
                </CookieConsentProvider>
                </ToastProvider>
              </CommunityProvider>
            </CartProvider>
          </OrdersProvider>
        </ProgressProvider>
        </TrainingMediaProvider>
        </AdminTrainingProvider>
      </PromotionsProvider>
      </AdminAuthProvider>
      </SecurityProvider>
    </AuthProvider>
    </CatalogProvider>
  );
}
