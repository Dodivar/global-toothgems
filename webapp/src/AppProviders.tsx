"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { i18nFor } from "./i18n/instances";
import { AuthProvider } from "./lib/auth";
import { AdminAuthProvider } from "./lib/adminAuth";
import { CartProvider } from "./lib/cart";
import { CatalogProvider, type CatalogSeed } from "./lib/catalog/CatalogProvider";
import { AcademyProvider } from "./lib/academy/AcademyProvider";
import type { PublicCourse } from "./lib/academy/publicCourse";
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
import { parsePath, type Locale } from "./lib/localeRoutes";
import { NavigationTracker } from "./lib/navigation";

/**
 * The stores of the whole site, in the order their comments justify, under
 * the root layout (docs/migration-nextjs.md, phase 5): they outlive a
 * navigation from one page to another, whatever part of the site it leads to.
 *
 * Language: a public page speaks the language of its address, with that
 * language's instance (`i18nFor`) on the server and in the browser alike, so
 * a client-side navigation from `/fr/…` to `/en/…` renders in English at once
 * and concurrent server renders never share one. Other pages use the UI's
 * instance (saved choice, else the browser's language); on the server, the
 * language the proxy negotiated (`locale`). `catalog`: what the server read
 * of the catalogue for a public page it renders; `academy`: the published
 * courses it read for one (header, footer, home and Academy pages list them).
 */
export function AppProviders({
  locale,
  catalog,
  academy,
  children,
}: {
  locale: Locale;
  catalog?: CatalogSeed;
  academy?: PublicCourse[];
  children: ReactNode;
}) {
  const addressLocale = parsePath(usePathname() ?? "/").locale;
  // The UI's language follows the public page last shown, as before: the
  // member space opened from an English page speaks English.
  useEffect(() => {
    if (addressLocale && !i18n.language?.startsWith(addressLocale)) void i18n.changeLanguage(addressLocale);
  }, [addressLocale]);
  const instance = typeof window === "undefined" ? i18nFor(locale) : addressLocale ? i18nFor(addressLocale) : i18n;
  return (
    <I18nextProvider i18n={instance}>
    <NavigationTracker />
    <CatalogProvider seed={catalog}>
    {/* The published Academy, for the public pages (phase B). Not the
        authoring store below, which only staff load. */}
    <AcademyProvider seed={academy}>
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
                  {children}
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
    </AcademyProvider>
    </CatalogProvider>
    </I18nextProvider>
  );
}
