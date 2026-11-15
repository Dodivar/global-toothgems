-- =============================================================================
-- Member area: the first-steps card ticks "Academy" once the member visited it
-- =============================================================================
-- The Academy step of the dashboard's first-steps card used to tick only when
-- the member held a course, so it stayed on screen for anyone who looked and
-- did not buy. Owner's request (2026-11-15): visiting the Academy page is
-- enough.
--
--   * academy_visited_at  when the signed-in member first opened the Academy
--                         page (/fr/academy, /en/academy). Null = never.
--
-- Same rules as the rest of the table: owner-only (RLS), written column by
-- column, display state only — nothing is granted or protected by it.
-- =============================================================================

alter table public.member_preferences
  add column academy_visited_at timestamptz;

comment on column public.member_preferences.academy_visited_at is
  'First time the member opened the Academy page; ticks the first-steps card''s Academy step. Display state only.';

grant insert (academy_visited_at) on public.member_preferences to authenticated;
grant update (academy_visited_at) on public.member_preferences to authenticated;
