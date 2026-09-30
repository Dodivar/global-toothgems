import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { CatalogSeed } from "./lib/catalog/CatalogProvider";
import { AppShell, MAINTENANCE_ROUTE } from "./AppShell";
import { ZoneExit } from "./zones/ZoneExit";
import { HomeAlt } from "./screens/HomeAlt";
import { ShopAlt } from "./screens/ShopAlt";
import { Shapes } from "./screens/Shapes";
import { Colors } from "./screens/Colors";
import { ProductDetail } from "./screens/ProductDetail";
import { Cart } from "./screens/Cart";
import { Academy } from "./screens/Academy";
import { CourseDetail } from "./screens/CourseDetail";
import { Login } from "./screens/Login";
import { ConfirmAccount } from "./screens/ConfirmAccount";
import { Register } from "./screens/Register";
import { ForgotPassword } from "./screens/ForgotPassword";
import { ResetPassword } from "./screens/ResetPassword";
import { VerifyEmailLanding } from "./screens/VerifyEmailLanding";
import { Loyalty as LoyaltyProgram } from "./screens/Loyalty";
import { GiftCard } from "./screens/GiftCard";
import { Studio } from "./screens/Studio";
import { StudioSubscribe } from "./screens/StudioSubscribe";
import {
  STUDIO_EDITOR_ALIAS,
  STUDIO_PATH,
  STUDIO_SHARE_ALIAS,
  STUDIO_SHARE_PATH,
  STUDIO_SUBSCRIBE_ALIAS,
  STUDIO_SUBSCRIBE_PATH,
  studioSectionFromPath,
  studioSectionPath,
} from "./lib/studioUrl";
import { ServerError } from "./screens/ServerError";
import { Maintenance } from "./screens/Maintenance";
import { HelpCentre } from "./screens/legal/HelpCentre";
import { Faq } from "./screens/legal/Faq";
import { Contact } from "./screens/legal/Contact";
import { About } from "./screens/legal/About";
import { LegalDocumentPage } from "./components/legal/LegalDocumentPage";
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

/**
 * The public zone (`lib/appZones.ts`, docs/migration-nextjs.md): storefront,
 * public pages, sign-in, registration and recovery, system pages. Rendered by
 * the catch-all page `app/[[...slug]]` — on the server for public pages.
 * `catalog`: what the server read of the catalogue for a server-rendered page.
 */
export default function App({ catalog }: { catalog?: CatalogSeed }) {
  return (
    <AppShell zone="public" catalog={catalog}>
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
        <Route path={`${STUDIO_EDITOR_ALIAS}/*`} element={<StudioEditorAlias />} />
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
        {/* The member space, the learner pages, the back office
            and the Studio workspace are other zones
            (`lib/appZones.ts`): their addresses reload the page. */}
        <Route path="*" element={<ZoneExit zone="public" />} />
      </Routes>
    </AppShell>
  );
}
