import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, RequireAccount } from "./lib/auth";
import { AdminAuthProvider, RequireAdmin } from "./lib/adminAuth";
import { CartProvider } from "./lib/cart";
import { CatalogProvider, useCatalog } from "./lib/catalog/CatalogProvider";
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
import { MemberShell } from "./components/layout/MemberShell";
import { isMemberSpacePath } from "./lib/memberSpace";
import { HomeAlt } from "./screens/HomeAlt";
import { ShopAlt } from "./screens/ShopAlt";
import { Shapes } from "./screens/Shapes";
import { Colors } from "./screens/Colors";
import { ProductDetail } from "./screens/ProductDetail";
import { Cart } from "./screens/Cart";
import { Academy } from "./screens/Academy";
import { CourseDetail } from "./screens/CourseDetail";
import { CourseOverview } from "./screens/learn/CourseOverview";
import { LessonPlayer } from "./screens/learn/LessonPlayer";
import { CourseCompleted } from "./screens/learn/CourseCompleted";
import { ResumeTraining } from "./screens/learn/ResumeTraining";
import { isLessonPlayerPath } from "./lib/academyUrl";
import { Login } from "./screens/Login";
import { ConfirmAccount } from "./screens/ConfirmAccount";
import { Register } from "./screens/Register";
import { ForgotPassword } from "./screens/ForgotPassword";
import { ResetPassword } from "./screens/ResetPassword";
import { VerifyEmailLanding } from "./screens/VerifyEmailLanding";
import { Loyalty as LoyaltyProgram } from "./screens/Loyalty";
import { AccountLayout } from "./screens/account/AccountLayout";
import { Dashboard } from "./screens/account/Dashboard";
import { Certificates } from "./screens/account/Certificates";
import { Orders } from "./screens/account/Orders";
import { Profile } from "./screens/account/Profile";
import { Security } from "./screens/account/Security";
import { Reviews as AccountReviews } from "./screens/account/Reviews";
import { Loyalty as AccountLoyalty } from "./screens/account/Loyalty";
import { CommunityLayout } from "./screens/community/CommunityLayout";
import { CommunityHome } from "./screens/community/CommunityHome";
import { Channel } from "./screens/community/Channel";
import { Discussion } from "./screens/community/Discussion";
import { Members } from "./screens/community/Members";
import { Guidelines } from "./screens/community/Guidelines";
import { Activity } from "./screens/community/Activity";
import { AdminLogin } from "./screens/admin/AdminLogin";
import { AdminLayout } from "./screens/admin/AdminLayout";
import { AdminDashboard } from "./screens/admin/AdminDashboard";
import { Statistics as AdminStatistics } from "./screens/admin/Statistics";
import { AdminProducts } from "./screens/admin/AdminProducts";
import { AdminProductNew } from "./screens/admin/AdminProductNew";
import { AdminProductEdit } from "./screens/admin/AdminProductEdit";
import { AdminProductRecommendations } from "./screens/admin/AdminProductRecommendations";
import { AdminCategories } from "./screens/admin/AdminCategories";
import { Orders as AdminOrders } from "./screens/admin/Orders";
import { OrderDetail as AdminOrderDetail } from "./screens/admin/OrderDetail";
import { Customers as AdminCustomers } from "./screens/admin/Customers";
import { CustomerDetail as AdminCustomerDetail } from "./screens/admin/CustomerDetail";
import { Users as AdminUsers } from "./screens/admin/Users";
import { Promotions as AdminPromotions } from "./screens/admin/Promotions";
import { PromotionEditor as AdminPromotionEditor } from "./screens/admin/PromotionEditor";
import { PromotionDetail as AdminPromotionDetail } from "./screens/admin/PromotionDetail";
import { CampaignDetail as AdminCampaignDetail } from "./screens/admin/CampaignDetail";
import { CampaignEditor as AdminCampaignEditor } from "./screens/admin/CampaignEditor";
import { GiftCardDetail as AdminGiftCardDetail } from "./screens/admin/GiftCardDetail";
import { GiftCardSettings as AdminGiftCardSettings } from "./screens/admin/GiftCardSettings";
import { PromotionPreview as AdminPromotionPreview } from "./screens/admin/PromotionPreview";
import { Reviews as AdminReviews } from "./screens/admin/Reviews";
import { Settings as AdminSettings } from "./screens/admin/Settings";
import { Training as AdminTraining } from "./screens/admin/Training";
import { TrainingNew as AdminTrainingNew } from "./screens/admin/TrainingNew";
import { TrainingBuilder as AdminTrainingBuilder } from "./screens/admin/TrainingBuilder";
import { TrainingPreview as AdminTrainingPreview } from "./screens/admin/TrainingPreview";
import { TrainingReview as AdminTrainingReview } from "./screens/admin/TrainingReview";
import { GiftCard } from "./screens/GiftCard";
import { Studio } from "./screens/Studio";
import { StudioSubscribe } from "./screens/StudioSubscribe";
import {
  STUDIO_EDITOR_ALIAS,
  STUDIO_EDITOR_PATH,
  STUDIO_PATH,
  STUDIO_SHARE_ALIAS,
  STUDIO_SHARE_PATH,
  STUDIO_SUBSCRIBE_ALIAS,
  STUDIO_SUBSCRIBE_PATH,
  studioSectionFromPath,
  studioSectionPath,
} from "./lib/studioUrl";
import { RequireStudioAccess } from "./lib/studioAccess";
import { StudioEditorLoading } from "./components/studio/editor/StudioEditorLoading";
import { NotFound } from "./screens/NotFound";
import { parsePath, toAddress } from "./lib/localeRoutes";
import { titleFor } from "./lib/pageMeta";
import { productTitle } from "./lib/catalog/productMeta";

/* The 3D Studio editor carries three.js, the heaviest code in the site: it is
   split into its own chunk and only downloaded when the editor is opened. */
const StudioEditor = lazy(() => import("./screens/StudioEditor").then((m) => ({ default: m.StudioEditor })));
/* A shared design is viewed in the same 3D engine: same on-demand chunk. */
const StudioShare = lazy(() => import("./screens/StudioShare").then((m) => ({ default: m.StudioShare })));
import { ServerError } from "./screens/ServerError";
import { Maintenance } from "./screens/Maintenance";
import { HelpCentre } from "./screens/legal/HelpCentre";
import { Faq } from "./screens/legal/Faq";
import { Contact } from "./screens/legal/Contact";
import { About } from "./screens/legal/About";
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

/** `/studio-3d/editor/groups` → `/studio-3d/atelier/mes-groupes`: the English alias keeps its section. */
function StudioEditorAlias() {
  const { pathname } = useLocation();
  return <Navigate to={studioSectionPath(studioSectionFromPath(pathname))} replace />;
}

/**
 * `/studio-3d/share/<token>` → `/studio-3d/partage/<token>`, and
 * `/studio-3d/share#…` → `/studio-3d/partage#…`: the token or the fragment is
 * the design, so it must come along.
 */
function StudioShareAlias() {
  const { pathname, hash } = useLocation();
  return <Navigate to={{ pathname: pathname.replace(STUDIO_SHARE_ALIAS, STUDIO_SHARE_PATH), hash }} replace />;
}

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
const MAINTENANCE_ROUTE = "/maintenance";

/**
 * The 3D Studio editor is a full-screen workspace with its own application
 * bar, so it also leaves out the storefront header and footer. Unlike the back
 * office it stays a customer page: the cookie banner still shows. A shared
 * design's page is the same kind of screen: a 3D stage with its own bar.
 */
const WORKSPACE_ROUTES = [STUDIO_EDITOR_PATH, STUDIO_SHARE_PATH];

export default function App() {
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
    <CatalogProvider>
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
                    <Routes>
                      <Route path="/" element={<HomeAlt />} />
                      {/* The home page used to be previewed here while two art
                          directions were compared; keep the old link working. */}
                      <Route path="/accueil-b" element={<Navigate to="/" replace />} />
                      <Route path="/boutique" element={<ShopAlt />} />
                      {/* The shop layout used to be previewed here; keep the old link working. */}
                      <Route path="/boutique-b" element={<Navigate to="/boutique" replace />} />
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
                      {/* Where the account-confirmation email sent by Supabase Auth lands. */}
                      <Route path="/confirmation-compte" element={<ConfirmAccount />} />
                      {/* The former design-comparison URL of the login page, kept
                          so an old link still lands on it. */}
                      <Route path="/connexion-b" element={<Navigate to="/connexion" replace />} />
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
                          itself. The subscription is a visual prototype: no
                          payment is taken. */}
                      <Route path={STUDIO_PATH} element={<Studio />} />
                      <Route path={STUDIO_SUBSCRIBE_PATH} element={<StudioSubscribe />} />
                      <Route path={STUDIO_SUBSCRIBE_ALIAS} element={<Navigate to={STUDIO_SUBSCRIBE_PATH} replace />} />
                      {/* The editor itself. Gated by `RequireStudioAccess`,
                          which during the preview lets every visitor in for
                          free — the one place to change when the paid
                          subscription goes live. Lazy: see `StudioEditor`. */}
                      <Route
                        path={`${STUDIO_EDITOR_PATH}/*`}
                        element={
                          <RequireStudioAccess>
                            <Suspense fallback={<StudioEditorLoading />}>
                              <StudioEditor />
                            </Suspense>
                          </RequireStudioAccess>
                        }
                      />
                      <Route path={`${STUDIO_EDITOR_ALIAS}/*`} element={<StudioEditorAlias />} />
                      {/* A design shared read-only. Open to everyone, outside
                          `RequireStudioAccess`: looking at a design someone sent
                          is not using the Studio. Full-screen like the editor. */}
                      {[STUDIO_SHARE_PATH, `${STUDIO_SHARE_PATH}/:token`].map((path) => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            <Suspense fallback={<StudioEditorLoading />}>
                              <StudioShare />
                            </Suspense>
                          }
                        />
                      ))}
                      <Route path={STUDIO_SHARE_ALIAS} element={<StudioShareAlias />} />
                      <Route path={`${STUDIO_SHARE_ALIAS}/:token`} element={<StudioShareAlias />} />
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
                      {/* The historical entry point: every "open this course"
                          action lands here, and it forwards to the overview of
                          the course that was just opened. */}
                      <Route
                        path="/academy/lecon"
                        element={
                          <RequireAccount>
                            <ResumeTraining />
                          </RequireAccount>
                        }
                      />
                      {/* The learner's own pages for a course on the account:
                          its overview, each lesson (a step, or a module's
                          knowledge check) and the completion screen. Gated by
                          the account here, and by the enrolment inside each
                          page (`lib/learning/access.ts`). */}
                      <Route
                        path="/academy/mes-formations/:courseId"
                        element={
                          <RequireAccount>
                            <CourseOverview />
                          </RequireAccount>
                        }
                      />
                      <Route
                        path="/academy/mes-formations/:courseId/lecon/:nodeKey"
                        element={
                          <RequireAccount>
                            <LessonPlayer />
                          </RequireAccount>
                        }
                      />
                      <Route
                        path="/academy/mes-formations/:courseId/terminee"
                        element={
                          <RequireAccount>
                            <CourseCompleted />
                          </RequireAccount>
                        }
                      />
                      {/* The member space: the dashboard and the Artist
                          Community share one shell — a full-height sidebar
                          with the member's sections and the way out to the
                          shop, the Academy and the Studio — in place of the
                          storefront header. Gating the shell covers every
                          child: this is the account itself. */}
                      <Route
                        element={
                          <RequireAccount>
                            <MemberShell />
                          </RequireAccount>
                        }
                      >
                        <Route path="/compte" element={<AccountLayout />}>
                          <Route index element={<Dashboard />} />
                          <Route path="attestations" element={<Certificates />} />
                          <Route path="commandes" element={<Orders />} />
                          <Route path="profil" element={<Profile />} />
                          <Route path="securite" element={<Security />} />
                          <Route path="fidelite" element={<AccountLoyalty />} />
                          <Route path="avis" element={<AccountReviews />} />
                          {/* An unknown address in the member space is a 404
                              inside its shell: the storefront header is not
                              there to lead back out. */}
                          <Route path="*" element={<NotFound />} />
                        </Route>
                        {/* The Artist Community. A sibling of `/compte` rather
                            than one of its children: it has its own layout and
                            its channels. Whether the account may enter it is
                            decided inside that layout, from the courses it owns. */}
                        <Route path="/compte/communaute" element={<CommunityLayout />}>
                          <Route index element={<CommunityHome />} />
                          <Route path="canal/:channelId" element={<Channel />} />
                          <Route path="discussion/:discussionId" element={<Discussion />} />
                          <Route path="activite/:view" element={<Activity />} />
                          <Route path="membres" element={<Members />} />
                          <Route path="charte" element={<Guidelines />} />
                          <Route path="*" element={<NotFound />} />
                        </Route>
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
                        {/* The products recommended next to a product: saved
                            apart from the product form (their own table). */}
                        <Route path="produits/:id/recommandations" element={<AdminProductRecommendations />} />
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
                        {/* Training. The builder keeps its selection in the
                            query string rather than in the path: a module, a
                            step and a quiz are all edited in the same
                            workspace, and four nested routes would put the
                            same three panels behind four addresses. Preview
                            and review are their own routes, because both are
                            places an administrator arrives at rather than
                            states the builder happens to be in. */}
                        <Route path="formations" element={<AdminTraining />} />
                        <Route path="formations/nouvelle" element={<AdminTrainingNew />} />
                        <Route path="formations/:id" element={<AdminTrainingBuilder />} />
                        <Route path="formations/:id/apercu" element={<AdminTrainingPreview />} />
                        <Route path="formations/:id/publication" element={<AdminTrainingReview />} />
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
