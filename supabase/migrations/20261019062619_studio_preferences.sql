-- =============================================================================
-- 3D Studio: a member's workspace preferences
-- =============================================================================
-- One row per member, created on first change, holding how they like the
-- Studio workspace laid out. Today a single setting:
--
--   * library_view   'grid'      the library as one grid, collections as a filter bar (default)
--                    'explorer'  the library as folders: the collections first, opened to see
--                                their creations, then the creations in no collection
--
-- No row = every default. The setting follows the account on every device.
--
-- Owner-only (RLS), user_id = auth.uid() and not writable. Not gated by Studio
-- access: it changes how the member's own work is shown, not the Studio's use
-- (a member whose trial ended still reads and tidies their creations).
--
-- Decision 98 in supabase/README.md.
-- =============================================================================

create table public.studio_preferences (
  user_id       uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  library_view  text not null default 'grid' check (library_view in ('grid', 'explorer')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.studio_preferences is
  '3D Studio: a member''s workspace preferences (library view). One row per member, owner-only (RLS).';

create trigger studio_preferences_set_updated_at
  before update on public.studio_preferences
  for each row execute function private.set_updated_at();

alter table public.studio_preferences enable row level security;

revoke all on public.studio_preferences from anon;
revoke truncate, references, trigger on public.studio_preferences from authenticated;
-- Members write the settings only — never the owner or the timestamps.
revoke insert, update on public.studio_preferences from authenticated;
grant insert (library_view) on public.studio_preferences to authenticated;
grant update (library_view) on public.studio_preferences to authenticated;

create policy "studio_preferences: owners read"
  on public.studio_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "studio_preferences: owners insert"
  on public.studio_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "studio_preferences: owners update"
  on public.studio_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "studio_preferences: owners delete"
  on public.studio_preferences for delete to authenticated
  using (user_id = (select auth.uid()));
