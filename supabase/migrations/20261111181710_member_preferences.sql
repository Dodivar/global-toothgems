-- =============================================================================
-- Member area: a member's own preferences
-- =============================================================================
-- One row per member, created on first change, holding choices about how the
-- member space behaves for them. Today a single setting:
--
--   * welcome_dismissed_at  when the member closed the "first steps" card of the
--                           dashboard (/compte). Null = not closed (the card is
--                           shown while the account is new and has steps left).
--
-- No row = every default. The choice follows the account on every device.
--
-- Owner-only (RLS), user_id = auth.uid() and not writable. Display state only:
-- nothing is granted or protected by it.
-- =============================================================================

create table public.member_preferences (
  user_id               uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  welcome_dismissed_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.member_preferences is
  'Member area: a member''s own preferences (first-steps card dismissed). One row per member, owner-only (RLS).';

create trigger member_preferences_set_updated_at
  before update on public.member_preferences
  for each row execute function private.set_updated_at();

alter table public.member_preferences enable row level security;

revoke all on public.member_preferences from anon;
revoke truncate, references, trigger on public.member_preferences from authenticated;
-- Members write the settings only — never the owner or the timestamps.
revoke insert, update on public.member_preferences from authenticated;
grant insert (welcome_dismissed_at) on public.member_preferences to authenticated;
grant update (welcome_dismissed_at) on public.member_preferences to authenticated;

create policy "member_preferences: owners read"
  on public.member_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "member_preferences: owners insert"
  on public.member_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "member_preferences: owners update"
  on public.member_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "member_preferences: owners delete"
  on public.member_preferences for delete to authenticated
  using (user_id = (select auth.uid()));
