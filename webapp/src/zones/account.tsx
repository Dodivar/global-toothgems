"use client";

import type { ReactNode } from "react";
import { RequireAccount } from "../lib/auth";
import { MemberShell } from "../components/layout/MemberShell";
import { AccountLayout } from "../screens/account/AccountLayout";
import { CommunityLayout } from "../screens/community/CommunityLayout";
import { ChatProvider } from "../lib/communityChat/chatStore";
import { MembersLounge } from "../screens/communityChat/MembersLounge";

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
      {/* The Members' Lounge state lives here, not in the lounge: the
          sidebar shows its unread activity on every page of the space, and
          what was read stays read while the member moves around. */}
      <ChatProvider>
        <MemberShell>{children}</MemberShell>
      </ChatProvider>
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

/** The Members' Lounge, whose room follows the address (`app/compte/salons`). */
export function LoungeSectionLayout({ children }: { children: ReactNode }) {
  return <MembersLounge>{children}</MembersLounge>;
}
