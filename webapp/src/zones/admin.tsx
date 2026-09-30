"use client";

import type { ReactNode } from "react";
import { RequireAdmin } from "../lib/adminAuth";
import { AdminLogin } from "../screens/admin/AdminLogin";
import { AdminLayout } from "../screens/admin/AdminLayout";
import { NotFound } from "../screens/NotFound";
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

/*
 * The admin zone's screens (`app/admin`): the back office and its access
 * screen, behind the client boundary their segments render.
 */

/** The access screen, open: it is where the guard sends anyone without a session. */
export const AdminLoginScreen = () => <AdminLogin />;

/**
 * The back office's shell (rail, drawer and the stores of its sections), for a
 * staff session: `RequireAdmin` checks the role (navigation; RLS is the
 * authority, and the server layout only turned signed-out visitors away).
 */
export function AdminStaffLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAdmin>
      <AdminLayout>{children}</AdminLayout>
    </RequireAdmin>
  );
}

/** An address the back office has no screen for: the 404 screen, in the bare admin chrome. */
export const AdminNotFoundScreen = () => <NotFound />;

export const AdminCampaignDetailScreen = () => <AdminCampaignDetail />;
export const AdminCampaignEditorScreen = () => <AdminCampaignEditor />;
export const AdminCategoriesScreen = () => <AdminCategories />;
export const AdminCustomerDetailScreen = () => <AdminCustomerDetail />;
export const AdminCustomersScreen = () => <AdminCustomers />;
export const AdminDashboardScreen = () => <AdminDashboard />;
export const AdminGiftCardDetailScreen = () => <AdminGiftCardDetail />;
export const AdminGiftCardSettingsScreen = () => <AdminGiftCardSettings />;
export const AdminOrderDetailScreen = () => <AdminOrderDetail />;
export const AdminOrdersScreen = () => <AdminOrders />;
export const AdminProductEditScreen = () => <AdminProductEdit />;
export const AdminProductNewScreen = () => <AdminProductNew />;
export const AdminProductRecommendationsScreen = () => <AdminProductRecommendations />;
export const AdminProductsScreen = () => <AdminProducts />;
export const AdminPromotionDetailScreen = () => <AdminPromotionDetail />;
export const AdminPromotionEditorScreen = () => <AdminPromotionEditor />;
export const AdminPromotionPreviewScreen = () => <AdminPromotionPreview />;
export const AdminPromotionsScreen = () => <AdminPromotions />;
export const AdminReviewsScreen = () => <AdminReviews />;
export const AdminSettingsScreen = () => <AdminSettings />;
export const AdminStatisticsScreen = () => <AdminStatistics />;
export const AdminTrainingScreen = () => <AdminTraining />;
export const AdminTrainingBuilderScreen = () => <AdminTrainingBuilder />;
export const AdminTrainingNewScreen = () => <AdminTrainingNew />;
export const AdminTrainingPreviewScreen = () => <AdminTrainingPreview />;
export const AdminTrainingReviewScreen = () => <AdminTrainingReview />;
export const AdminUsersScreen = () => <AdminUsers />;
