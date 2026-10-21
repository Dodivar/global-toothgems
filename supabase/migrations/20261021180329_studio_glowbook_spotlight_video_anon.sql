-- Decision 103: the spotlight video functions are for signed-in members only.
-- Supabase's default privileges gave anon EXECUTE on the new functions; both
-- already refuse a visitor without a session, this removes the endpoint.
revoke execute on function public.studio_set_spotlight_video(uuid, text, text, integer, timestamptz),
                           public.studio_spotlight_video_state() from anon;
