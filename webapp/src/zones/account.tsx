"use client";

import type { ReactNode } from "react";
import { RequireAccount } from "../lib/auth";
import { MemberShell } from "../components/layout/MemberShell";
import { AccountLayout } from "../screens/account/AccountLayout";
import { Dashboard } from "../screens/account/Dashboard";
import { Certificates } from "../screens/account/Certificates";
import { Orders } from "../screens/account/Orders";
import { OrderDetail } from "../screens/account/OrderDetail";
import { Profile } from "../screens/account/Profile";
import { Security } from "../screens/account/Security";
import { Reviews } from "../screens/account/Reviews";
import { Loyalty } from "../screens/account/Loyalty";
import { CommunityLayout } from "../screens/community/CommunityLayout";
import { CommunityHome } from "../screens/community/CommunityHome";
import { Channel } from "../screens/community/Channel";
import { Discussion } from "../screens/community/Discussion";
import { Members } from "../screens/community/Members";
import { Guidelines } from "../screens/community/Guidelines";
import { Activity } from "../screens/community/Activity";
import { NotFound } from "../screens/NotFound";

/*
 * The account zone's screens (`app/compte`): the member space and the Artist
 * Community, behind the client boundary their segments render.
 */

/**
 * The member space's shell — a full-height sidebar with the member's sections
 * and the way out to the shop, the Academy and the Studio — shared by the
 * member space and the community. Gating the shell covers every page: this is
 * the account itself (navigation; the server layout turned signed-out
 * visitors away already).
 */
export function MemberShellLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAccount>
      <MemberShell>{children}</MemberShell>
    </RequireAccount>
  );
}

export function AccountSectionLayout({ children }: { children: ReactNode }) {
  return <AccountLayout>{children}</AccountLayout>;
}

/** Whether the account may enter the community is decided inside its layout, from the courses it owns. */
export function CommunitySectionLayout({ children }: { children: ReactNode }) {
  return <CommunityLayout>{children}</CommunityLayout>;
}

export const DashboardScreen = () => <Dashboard />;
export const CertificatesScreen = () => <Certificates />;
export const OrdersScreen = () => <Orders />;
export const OrderDetailScreen = () => <OrderDetail />;
export const ProfileScreen = () => <Profile />;
export const SecurityScreen = () => <Security />;
export const ReviewsScreen = () => <Reviews />;
export const LoyaltyScreen = () => <Loyalty />;
export const CommunityHomeScreen = () => <CommunityHome />;
export const ChannelScreen = () => <Channel />;
export const DiscussionScreen = () => <Discussion />;
export const MembersScreen = () => <Members />;
export const GuidelinesScreen = () => <Guidelines />;
export const ActivityScreen = () => <Activity />;
/** An unknown address in the member space: the 404 screen inside its shell (the storefront header is not there to lead back out). */
export const NotFoundScreen = () => <NotFound />;
