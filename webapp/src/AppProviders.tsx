"use client";

import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { i18nFor } from "./i18n/instances";
import { AuthProvider } from "./lib/auth";
import { AdminAuthProvider } from "./lib/adminAuth";
import { CartProvider } from "./lib/cart";
import { CatalogProvider, type CatalogSeed } from "./lib/catalog/CatalogProvider";
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
import type { Locale } from "./lib/localeRoutes";

/**
 * The stores of the whole site, in the order their comments justify, under
 * the root layout (docs/migration-nextjs.md, phase 5): they outlive a
 * navigation from one page to another, whatever part of the site it leads to.
 *
 * Language: on the server, the instance of the page's language (`locale`,
 * from the proxy), so concurrent renders never share one; in the browser, the
 * UI's instance. `catalog`: what the server read of the catalogue for a
 * public page it renders.
 */
export function AppProviders({ locale, catalog, children }: { locale: Locale; catalog?: CatalogSeed; children: ReactNode }) {
  return (
    <I18nextProvider i18n={typeof window === "undefined" ? i18nFor(locale) : i18n}>
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
    </CatalogProvider>
    </I18nextProvider>
  );
}
