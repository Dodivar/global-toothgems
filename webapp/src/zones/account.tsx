"use client";

import type { ReactNode } from "react";
import { RequireAccount } from "../lib/auth";
import { MemberShell } from "../components/layout/MemberShell";
import { AccountLayout } from "../screens/account/AccountLayout";
import { ChatProvider } from "../lib/communityChat/chatStore";
import { MembersLounge } from "../screens/communityChat/MembersLounge";

/*
 * The account zone's layouts (`app/compte`): the member space and the
 * Members' Lounge. Each page imports its own screen.
 */

/**
 * The member space's shell — a full-height sidebar with the member's sections
 * and the way out to the shop, the Academy and the Studio — shared by the
 * member space and the lounge. Gating the shell covers every page: this is
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

/** The Members' Lounge, whose room follows the address (`app/compte/salons`). */
export function LoungeSectionLayout({ children }: { children: ReactNode }) {
  return <MembersLounge>{children}</MembersLounge>;
}
