import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, RequireAccount } from "./lib/auth";
import { AdminAuthProvider, RequireAdmin } from "./lib/adminAuth";
import { CartProvider } from "./lib/cart";
import { OrdersProvider } from "./lib/orders";
import { ProgressProvider } from "./lib/progress";
import { CommunityProvider } from "./lib/community";
import { ToastProvider } from "./lib/toast";
import { SecurityProvider } from "./lib/securityState";
import { CookieConsentProvider } from "./lib/cookieConsent";
import { ReviewModeProvider } from "./lib/reviewMode";
import { PromotionsProvider } from "./lib/adminPromotions";
import { ReviewsProvider } from "./lib/reviews";
import { ReviewOverlays } from "./components/reviews/ReviewOverlays";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { HeaderEditorial } from "./components/layout/HeaderEditorial";
import { FooterEditorial } from "./components/layout/FooterEditorial";
import { Home } from "./pages/Home";
import { AccueilEditorial } from "./pages/AccueilEditorial";
import { Shop } from "./pages/Shop";
import { Shapes } from "./pages/Shapes";
import { Colors } from "./pages/Colors";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Academy } from "./pages/Academy";
import { CourseDetail } from "./pages/CourseDetail";
import { Lesson } from "./pages/Lesson";
import { Login } from "./pages/Login";
import { ConnexionEditorial } from "./pages/ConnexionEditorial";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { VerifyEmailLanding } from "./pages/VerifyEmailLanding";
import { Loyalty as LoyaltyProgram } from "./pages/Loyalty";
import { AccountLayout } from "./pages/account/AccountLayout";
import { Dashboard } from "./pages/account/Dashboard";
import { Certificates } from "./pages/account/Certificates";
import { Orders } from "./pages/account/Orders";
import { Profile } from "./pages/account/Profile";
import { Security } from "./pages/account/Security";
import { Reviews as AccountReviews } from "./pages/account/Reviews";
import { Loyalty as AccountLoyalty } from "./pages/account/Loyalty";
import { CommunityLayout } from "./pages/community/CommunityLayout";
import { CommunityHome } from "./pages/community/CommunityHome";
import { Channel } from "./pages/community/Channel";
import { Discussion } from "./pages/community/Discussion";
import { Members } from "./pages/community/Members";
import { Guidelines } from "./pages/community/Guidelines";
import { Activity } from "./pages/community/Activity";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { Statistics as AdminStatistics } from "./pages/admin/Statistics";
import { AdminProducts } from "./pages/admin/AdminProducts";
import { AdminProductNew } from "./pages/admin/AdminProductNew";
import { AdminProductEdit } from "./pages/admin/AdminProductEdit";
import { AdminCategories } from "./pages/admin/AdminCategories";
import { Orders as AdminOrders } from "./pages/admin/Orders";
import { OrderDetail as AdminOrderDetail } from "./pages/admin/OrderDetail";
import { Customers as AdminCustomers } from "./pages/admin/Customers";
import { CustomerDetail as AdminCustomerDetail } from "./pages/admin/CustomerDetail";
import { Users as AdminUsers } from "./pages/admin/Users";
import { Promotions as AdminPromotions } from "./pages/admin/Promotions";
import { PromotionEditor as AdminPromotionEditor } from "./pages/admin/PromotionEditor";
import { PromotionDetail as AdminPromotionDetail } from "./pages/admin/PromotionDetail";
import { CampaignDetail as AdminCampaignDetail } from "./pages/admin/CampaignDetail";
import { CampaignEditor as AdminCampaignEditor } from "./pages/admin/CampaignEditor";
import { GiftCardDetail as AdminGiftCardDetail } from "./pages/admin/GiftCardDetail";
import { GiftCardSettings as AdminGiftCardSettings } from "./pages/admin/GiftCardSettings";
import { PromotionPreview as AdminPromotionPreview } from "./pages/admin/PromotionPreview";
import { Reviews as AdminReviews } from "./pages/admin/Reviews";
import { Settings as AdminSettings } from "./pages/admin/Settings";
import { GiftCard } from "./pages/GiftCard";
import { Studio } from "./pages/Studio";
import { StudioSubscribe } from "./pages/StudioSubscribe";
import { STUDIO_PATH, STUDIO_SUBSCRIBE_ALIAS, STUDIO_SUBSCRIBE_PATH } from "./lib/studioUrl";
import { NotFound } from "./pages/NotFound";
import { ServerError } from "./pages/ServerError";
import { Maintenance } from "./pages/Maintenance";
import { HelpCentre } from "./pages/legal/HelpCentre";
import { Faq } from "./pages/legal/Faq";
import { Contact } from "./pages/legal/Contact";
import { About } from "./pages/legal/About";
import { LegalDocumentPage } from "./components/legal/LegalDocumentPage";
import { CookieBanner } from "./components/legal/CookieBanner";
import { CookieSettingsDialog } from "./components/legal/CookieSettingsDialog";
import { LEGAL_ALIASES, LEGAL_PATHS } from "./data/legal/routes";
import { LEGAL_NOTICE } from "./data/legal/legalNotice";
import { TERMS } from "./data/legal/terms";
import { PRIVACY } from "./data/legal/privacy";
import { COOKIE_POLICY } from "./data/legal/cookies";
import { SHIPPING } from "./data/legal/shipping";
import { RETURNS } from "./data/legal/returns";

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
 * Route wearing the alternative home-page direction.
 *
 * `Header` and `Footer` render outside `<Routes>`, so the second home page would
 * otherwise inherit the first one's chrome. Swapping them here — rather than
 * restyling the shared components — keeps the comparison honest and keeps every
 * other screen untouched.
 */
const EDITORIAL_ROUTE = "/accueil-b";

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
const MAINTENANCE_ROUTE = "/maintenance";

export default function App() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const editorial = pathname === EDITORIAL_ROUTE;
  const adminArea = pathname === ADMIN_ROUTE_PREFIX || pathname.startsWith(`${ADMIN_ROUTE_PREFIX}/`);
  const bareChrome = adminArea || pathname === MAINTENANCE_ROUTE;

  return (
    <AuthProvider>
      {/* Pending email change, password date and data-export status: read by
          the member area and by the verification page a link lands on. */}
      <SecurityProvider>
      <AdminAuthProvider>
      {/* Promotions, campaigns and gift cards. Above the routes rather than in
          the admin layout: the storefront gift card page reads the same product
          configuration, so an edit in the back office shows on /carte-cadeau. */}
      <PromotionsProvider>
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
                  <ScrollToTop />
                  <DocumentLanguage />
                  <a href="#main" className="gt-skip-link">
                    {t("common.skipToContent")}
                  </a>
                  {/* First in the document so keyboard and screen-reader users
                      meet it before the page, though it sits at the bottom of
                      the screen. Not on the back office or maintenance chrome. */}
                  {!bareChrome && <CookieBanner />}
                  {!bareChrome && (editorial ? <HeaderEditorial /> : <Header />)}
                  <main id="main" tabIndex={-1}>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      {/* The alternative home-page direction, live beside the
                          current one so the team can compare the same content in
                          two art directions. Not linked from the navigation: it is
                          a design comparison, not a second entry point. */}
                      <Route path={EDITORIAL_ROUTE} element={<AccueilEditorial />} />
                      <Route path="/boutique" element={<Shop />} />
                      <Route path="/boutique/:id" element={<ProductDetail />} />
                      {/* Top level, not /boutique/formes: a static child of /boutique
                          would permanently shadow a product with that id. */}
                      <Route path="/formes" element={<Shapes />} />
                      <Route path="/couleurs" element={<Colors />} />
                      <Route path="/panier" element={<Cart />} />
                      <Route path="/connexion" element={<Login />} />
                      {/* Account creation, as its own multi-step journey. The
                          reason the visitor came (a purchase, a training) travels
                          in the query string or in history state, so the flow
                          can keep it in view and finish on it. */}
                      <Route path="/inscription" element={<Register />} />
                      {/* Account recovery and email verification. Open routes:
                          they are reached from an email, often signed out. The
                          English paths are aliases of the French ones, so links
                          written either way land on the same screen. */}
                      <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/verifier-email" element={<VerifyEmailLanding />} />
                      <Route path="/verify-email" element={<VerifyEmailLanding />} />
                      {/* The alternative authentication direction, live beside the
                          current one so the team can compare the same flow, fields
                          and copy in two art directions. Not linked from the
                          navigation: it is a design comparison, not a second way in. */}
                      <Route path="/connexion-b" element={<ConnexionEditorial />} />
                      {/* The loyalty programme's own sales page, open like the Academy
                          landing page: gating it would hide what it advertises. */}
                      <Route path="/fidelite" element={<LoyaltyProgram />} />
                      {/* The gift card product page. Open to everyone; its amounts,
                          designs and fields come from the back office's gift card
                          configuration. The English path is an alias. */}
                      <Route path="/carte-cadeau" element={<GiftCard />} />
                      <Route path="/gift-card" element={<GiftCard />} />
                      {/* The 3D Studio: its presentation page and its subscription
                          page. Both open, like the Academy and Loyalty sales
                          pages — the subscription page asks for the account
                          itself. Visual prototypes: no editor, no payment. */}
                      <Route path={STUDIO_PATH} element={<Studio />} />
                      <Route path={STUDIO_SUBSCRIBE_PATH} element={<StudioSubscribe />} />
                      <Route path={STUDIO_SUBSCRIBE_ALIAS} element={<Navigate to={STUDIO_SUBSCRIBE_PATH} replace />} />
                      {/* The Academy landing page stays open — it is the sales page.
                          Only the course content itself requires an account, and gating
                          the route covers the menu links and direct URLs at once. */}
                      <Route path="/academy" element={<Academy />} />
                      {/* The training detail page is the sales page for one course,
                          so it stays open for the same reason the Academy landing
                          page does. Nested under /academy/formation rather than
                          /academy/:id: a dynamic child there would sit alongside
                          the player's own static /academy/lecon segment. */}
                      <Route path="/academy/formation/:id" element={<CourseDetail />} />
                      <Route
                        path="/academy/lecon"
                        element={
                          <RequireAccount>
                            <Lesson />
                          </RequireAccount>
                        }
                      />
                      {/* The member dashboard: a sidebar layout with one route per
                          section. Gating the layout covers every child, for the same
                          reason the lesson is gated — this is the account itself. */}
                      <Route
                        path="/compte"
                        element={
                          <RequireAccount>
                            <AccountLayout />
                          </RequireAccount>
                        }
                      >
                        <Route index element={<Dashboard />} />
                        <Route path="attestations" element={<Certificates />} />
                        <Route path="commandes" element={<Orders />} />
                        <Route path="profil" element={<Profile />} />
                        <Route path="securite" element={<Security />} />
                        <Route path="fidelite" element={<AccountLoyalty />} />
                        <Route path="avis" element={<AccountReviews />} />
                      </Route>
                      {/* The Artist Community. A sibling of `/compte` rather than
                          one of its children: it is part of the member area, but
                          it carries its own navigation, and nesting it would put
                          two sidebars on the same screen. Gated by the same
                          `RequireAccount`; whether the account may enter the
                          community is then decided inside the layout, from the
                          courses it owns. */}
                      <Route
                        path="/compte/communaute"
                        element={
                          <RequireAccount>
                            <CommunityLayout />
                          </RequireAccount>
                        }
                      >
                        <Route index element={<CommunityHome />} />
                        <Route path="canal/:channelId" element={<Channel />} />
                        <Route path="discussion/:discussionId" element={<Discussion />} />
                        <Route path="activite/:view" element={<Activity />} />
                        <Route path="membres" element={<Members />} />
                        <Route path="charte" element={<Guidelines />} />
                      </Route>

                      {/* Administration. The access screen sits outside the guard —
                          it is where the guard sends anyone without a session. */}
                      <Route path="/admin/connexion" element={<AdminLogin />} />
                      <Route
                        path="/admin"
                        element={
                          <RequireAdmin>
                            <AdminLayout />
                          </RequireAdmin>
                        }
                      >
                        <Route index element={<AdminDashboard />} />
                        {/* Orders. The detail page is a route rather than a
                            drawer, for the reason `OrderDetail` documents: an
                            order is the thing a colleague pastes into a
                            message, and a drawer has no address. */}
                        <Route path="commandes" element={<AdminOrders />} />
                        <Route path="commandes/:reference" element={<AdminOrderDetail />} />
                        {/* Customers. Same reasoning as Orders: the detail
                            page is a route, because a customer record is the
                            thing a colleague pastes into a message and a
                            drawer has no address. The list's filters travel
                            in the query string, so "back" returns to the
                            filtered page rather than to row one. */}
                        <Route path="clients" element={<AdminCustomers />} />
                        <Route path="clients/:id" element={<AdminCustomerDetail />} />
                        {/* Users — the people who work in the back office and
                            their roles. One route: the profile is a drawer
                            whose address is the `utilisateur` query key, so it
                            can still be linked to. Not in the navigation rail,
                            which this change deliberately leaves untouched. */}
                        <Route path="utilisateurs" element={<AdminUsers />} />
                        {/* Statistics. Read-only, and entirely derived from the
                            filters in its query string, so a filtered report is
                            a link a colleague can open on the same numbers. */}
                        <Route path="statistiques" element={<AdminStatistics />} />
                        <Route path="produits" element={<AdminProducts />} />
                        <Route path="produits/nouveau" element={<AdminProductNew />} />
                        <Route path="produits/:id" element={<AdminProductEdit />} />
                        <Route path="categories" element={<AdminCategories />} />
                        {/* Promotions, campaigns and gift cards: one workspace
                            with tabs in the query string, and one route per
                            record so a promotion, a campaign or a gift card is
                            a link a colleague can open. */}
                        <Route path="promotions" element={<AdminPromotions />} />
                        <Route path="promotions/nouvelle" element={<AdminPromotionEditor />} />
                        <Route path="promotions/apercu" element={<AdminPromotionPreview />} />
                        <Route path="promotions/cartes-cadeaux/configuration" element={<AdminGiftCardSettings />} />
                        <Route path="promotions/cartes-cadeaux/:code" element={<AdminGiftCardDetail />} />
                        <Route path="promotions/campagnes/nouvelle" element={<AdminCampaignEditor />} />
                        <Route path="promotions/campagnes/:id" element={<AdminCampaignDetail />} />
                        <Route path="promotions/campagnes/:id/modifier" element={<AdminCampaignEditor />} />
                        <Route path="promotions/:id" element={<AdminPromotionDetail />} />
                        <Route path="promotions/:id/modifier" element={<AdminPromotionEditor />} />
                        {/* Reviews: dashboard, moderation queue and reported
                            reviews as tabs in the query string (`?vue=`); the
                            review being moderated is a panel whose address is
                            the `avis` key, so it can be linked to. */}
                        <Route path="avis" element={<AdminReviews />} />
                        {/* Store settings: one route, the section in the query
                            string (`section=livraison`), and the translation
                            editor addressed by `traduire` + `langue`, so a
                            missing translation is a link a colleague can open. */}
                        <Route path="parametres" element={<AdminSettings />} />
                      </Route>

                      {/* Help centre and legal pages. Every one is reachable from
                          the footer; the documents are data rendered by one
                          layout (see `data/legal/`). The English paths redirect
                          to the French ones, like the account-recovery aliases. */}
                      <Route path={LEGAL_PATHS.help} element={<HelpCentre />} />
                      <Route path={LEGAL_PATHS.faq} element={<Faq />} />
                      <Route path={LEGAL_PATHS.contact} element={<Contact />} />
                      <Route path={LEGAL_PATHS.about} element={<About />} />
                      <Route path={LEGAL_PATHS.legalNotice} element={<LegalDocumentPage key={LEGAL_NOTICE.id} doc={LEGAL_NOTICE} />} />
                      <Route path={LEGAL_PATHS.terms} element={<LegalDocumentPage key={TERMS.id} doc={TERMS} />} />
                      <Route path={LEGAL_PATHS.privacy} element={<LegalDocumentPage key={PRIVACY.id} doc={PRIVACY} />} />
                      <Route path={LEGAL_PATHS.cookies} element={<LegalDocumentPage key={COOKIE_POLICY.id} doc={COOKIE_POLICY} />} />
                      <Route path={LEGAL_PATHS.shipping} element={<LegalDocumentPage key={SHIPPING.id} doc={SHIPPING} />} />
                      <Route path={LEGAL_PATHS.returns} element={<LegalDocumentPage key={RETURNS.id} doc={RETURNS} />} />
                      {Object.entries(LEGAL_ALIASES).map(([alias, to]) => (
                        <Route key={alias} path={alias} element={<Navigate to={to} replace />} />
                      ))}

                      {/* System pages. The server-error and maintenance screens
                          have their own addresses so they can be reviewed as
                          mockups; in production the server would serve them in
                          place of the page that failed. The catch-all is the
                          real 404 for every address nothing above matches. */}
                      <Route path="/erreur" element={<ServerError />} />
                      <Route path={MAINTENANCE_ROUTE} element={<Maintenance />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                  {!bareChrome && (editorial ? <FooterEditorial /> : <Footer />)}
                  <CookieSettingsDialog />
                  <ReviewOverlays />
                </ReviewsProvider>
                </ReviewModeProvider>
                </CookieConsentProvider>
                </ToastProvider>
              </CommunityProvider>
            </CartProvider>
          </OrdersProvider>
        </ProgressProvider>
      </PromotionsProvider>
      </AdminAuthProvider>
      </SecurityProvider>
    </AuthProvider>
  );
}
