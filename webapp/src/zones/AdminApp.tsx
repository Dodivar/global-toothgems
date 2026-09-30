import { Routes, Route } from "react-router-dom";
import { RequireAdmin } from "../lib/adminAuth";
import { AdminLogin } from "../screens/admin/AdminLogin";
import { AdminLayout } from "../screens/admin/AdminLayout";
import { AdminDashboard } from "../screens/admin/AdminDashboard";
import { Statistics as AdminStatistics } from "../screens/admin/Statistics";
import { AdminProducts } from "../screens/admin/AdminProducts";
import { AdminProductNew } from "../screens/admin/AdminProductNew";
import { AdminProductEdit } from "../screens/admin/AdminProductEdit";
import { AdminProductRecommendations } from "../screens/admin/AdminProductRecommendations";
import { AdminCategories } from "../screens/admin/AdminCategories";
import { Orders as AdminOrders } from "../screens/admin/Orders";
import { OrderDetail as AdminOrderDetail } from "../screens/admin/OrderDetail";
import { Customers as AdminCustomers } from "../screens/admin/Customers";
import { CustomerDetail as AdminCustomerDetail } from "../screens/admin/CustomerDetail";
import { Users as AdminUsers } from "../screens/admin/Users";
import { Promotions as AdminPromotions } from "../screens/admin/Promotions";
import { PromotionEditor as AdminPromotionEditor } from "../screens/admin/PromotionEditor";
import { PromotionDetail as AdminPromotionDetail } from "../screens/admin/PromotionDetail";
import { CampaignDetail as AdminCampaignDetail } from "../screens/admin/CampaignDetail";
import { CampaignEditor as AdminCampaignEditor } from "../screens/admin/CampaignEditor";
import { GiftCardDetail as AdminGiftCardDetail } from "../screens/admin/GiftCardDetail";
import { GiftCardSettings as AdminGiftCardSettings } from "../screens/admin/GiftCardSettings";
import { PromotionPreview as AdminPromotionPreview } from "../screens/admin/PromotionPreview";
import { Reviews as AdminReviews } from "../screens/admin/Reviews";
import { Settings as AdminSettings } from "../screens/admin/Settings";
import { Training as AdminTraining } from "../screens/admin/Training";
import { TrainingNew as AdminTrainingNew } from "../screens/admin/TrainingNew";
import { TrainingBuilder as AdminTrainingBuilder } from "../screens/admin/TrainingBuilder";
import { TrainingPreview as AdminTrainingPreview } from "../screens/admin/TrainingPreview";
import { TrainingReview as AdminTrainingReview } from "../screens/admin/TrainingReview";
import { AppShell } from "../AppShell";
import { BrowserRoot } from "../AppRoot";
import { ZoneExit } from "./ZoneExit";

/**
 * The admin zone (`lib/appZones.ts`): the back office under `/admin`, its
 * access screen included, mounted by `app/admin/…` in the browser only. The
 * access screen is open; every other screen sits under a layout that turns
 * signed-out visitors away on the server. The staff role is not checked
 * there: `RequireAdmin` and the back office do it, RLS enforces it.
 */
export default function AdminApp() {
  return (
    <BrowserRoot>
      <AppShell zone="admin">
        <Routes>
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
          <Route path="*" element={<ZoneExit zone="admin" />} />
        </Routes>
      </AppShell>
    </BrowserRoot>
  );
}
