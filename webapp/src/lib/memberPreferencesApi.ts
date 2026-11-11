import { supabase } from "./supabase/client";

/**
 * The member's own preferences (`member_preferences`, migration
 * `20261111181710_member_preferences`): one row per member, owner-only by RLS.
 * Today a single setting, whether the dashboard's first-steps card was closed.
 *
 * `null` = could not be read (no Supabase, network, policy): callers draw
 * nothing rather than guess.
 */
export interface MemberPreferences {
  welcomeDismissed: boolean;
}

export async function fetchMemberPreferences(): Promise<MemberPreferences | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("member_preferences").select("welcome_dismissed_at").maybeSingle();
  if (error) return null;
  return { welcomeDismissed: data?.welcome_dismissed_at != null };
}

/** Closes the first-steps card for good (upsert: the row is created on first change). */
export async function dismissWelcome(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("member_preferences")
    .upsert({ welcome_dismissed_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

/** What the card needs from the auth user: when the account was created and where from. */
export async function fetchAccountOrigin(): Promise<{ createdAt: string | null; forStudio: boolean } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { createdAt: data.user.created_at ?? null, forStudio: data.user.user_metadata?.signup_origin === "studio" };
}
