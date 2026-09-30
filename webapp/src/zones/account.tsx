"use client";

import type { ReactNode } from "react";
import { RequireAccount } from "../lib/auth";
import { MemberShell } from "../components/layout/MemberShell";
import { AccountLayout } from "../screens/account/AccountLayout";
import { CommunityLayout } from "../screens/community/CommunityLayout";

/*
 * The account zone's layouts (`app/compte`): the member space and the Artist
 * Community. Each page imports its own screen.
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
