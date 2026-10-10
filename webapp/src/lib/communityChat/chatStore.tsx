"use client";

import type { ReactNode } from "react";
import { isSupabaseConfigured } from "../supabase/client";
import { LiveChatProvider } from "./liveChatStore";
import { MockChatProvider } from "./mockChatStore";

export { useChat } from "./chatContext";
export type {
  ChannelView,
  ChatContextValue,
  ChatNotification,
  ConversationView,
  LoadStatus,
  NotificationKind,
  SendResult,
} from "./chatContext";

/**
 * The Members' Lounge provider: the live one (Supabase) when the project is
 * configured, the prototype's fixtures in mock mode. The contract the screens
 * read is `chatContext.ts` (`useChat()`).
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? <LiveChatProvider>{children}</LiveChatProvider> : <MockChatProvider>{children}</MockChatProvider>;
}
