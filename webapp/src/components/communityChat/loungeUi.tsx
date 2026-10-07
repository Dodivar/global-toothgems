"use client";

import { createContext, useContext } from "react";

/**
 * What the lounge's chrome can open from anywhere inside it: dialogs, the
 * mobile drawers and the members panel. Kept apart from `useChat()`, which
 * holds the conversation data — this is presentation state only.
 */
export type NavTab = "channels" | "messages";

export interface LoungeUi {
  openProfile: (memberId: string) => void;
  openSearch: () => void;
  openInbox: () => void;
  openNewMessage: () => void;
  /** Opens the mobile navigation drawer on a tab. */
  openNav: (tab?: NavTab) => void;
  /** Closes the mobile navigation drawer, after a choice was made in it. */
  closeNav: () => void;
  membersOpen: boolean;
  toggleMembers: () => void;
}

export const LoungeUiContext = createContext<LoungeUi | null>(null);

export function useLoungeUi(): LoungeUi {
  const ctx = useContext(LoungeUiContext);
  if (!ctx) throw new Error("useLoungeUi must be used within the Members' Lounge");
  return ctx;
}
