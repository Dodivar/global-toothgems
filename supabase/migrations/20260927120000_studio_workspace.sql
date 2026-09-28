-- =============================================================================
-- Migration — 3D Studio workspace: saved creations, Gem Groups, feedback
-- =============================================================================
-- Backs the workspace around the 3D Studio editor (webapp/src/lib/studioWorkspace):
--
--   * creations        a member's saved tooth-gem compositions (scene_data = the
--                      full 3D scene: every piece's transform, finish, size, and
--                      the Gem Groups it came from; see scene.ts, version 1).
--   * gem_groups       reusable multi-gem arrangements ("macros"), stored relative
--                      to an anchor tooth's frame (see gemGroup.ts, version 1).
--   * studio_feedback  ratings and comments about the Studio (insert-only for
--                      members, readable by staff).
--   * studio-thumbnails  PRIVATE bucket for the creations' captured renders:
--                      studio-thumbnails/<auth.uid()>/<creation id>.jpg
--
-- Ownership: every row belongs to auth.uid(). user_id defaults to it, cannot be
-- changed afterwards, and RLS refuses any other row — a client cannot read or
-- write someone else's designs whatever it sends.
--
-- Money: estimated_price_minor is an INDICATIVE estimate in minor units with its
-- currency, computed by the editor from its price list. It is informational
-- (a conversation aid, "total estimated design value"), never charged, never
-- sent to checkout, so the client-computed figure is acceptable here.
--
-- "Last edited" (updated_at) moves only when the content changes — name,
-- description, tags or the design itself — not when a creation is favourited
-- or opened, which is what the library shows as "Edited 2 days ago".
--
-- Not applied by the webapp yet: the prototype runs on a local repository with
-- the same interface (repository.ts). See the webapp README, "3D Studio workspace".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Tags: at most 8, each 1–24 visible characters, no duplicates ignoring case.
create or replace function private.studio_tags_valid(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_tags), 0) <= 8
     and coalesce(bool_and(char_length(btrim(t)) between 1 and 24), true)
     and count(distinct lower(t)) = count(t)
  from unnest(p_tags) as t;
$$;

-- updated_at follows content edits only (see header).
create or replace function private.studio_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := now();
    return new;
  end if;
  if new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.tags is distinct from old.tags
     or (to_jsonb(new) -> 'scene_data') is distinct from (to_jsonb(old) -> 'scene_data')
     or (to_jsonb(new) -> 'group_data') is distinct from (to_jsonb(old) -> 'group_data') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Creations
-- -----------------------------------------------------------------------------
create table public.creations (
  id                    uuid primary key default gen_random_uuid(),
  -- CASCADE: a member's designs are their personal data and go with the account.
  user_id               uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 1 and 60),
  description           text not null default '' check (char_length(description) <= 280),
  tags                  text[] not null default '{}' check (private.studio_tags_valid(tags)),
  scene_data            jsonb not null
                          check (jsonb_typeof(scene_data) = 'object'
                                 and (scene_data ->> 'version') = '1'
                                 and jsonb_typeof(scene_data -> 'pieces') = 'array'
                                 and jsonb_array_length(scene_data -> 'pieces') <= 200
                                 and pg_column_size(scene_data) <= 262144),
  -- Always the number of pieces in the scene: derived, so it can never drift.
  element_count         integer generated always as (jsonb_array_length(scene_data -> 'pieces')) stored,
  estimated_price_minor integer not null default 0 check (estimated_price_minor >= 0),
  currency              char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- Object path in the private `studio-thumbnails` bucket, inside the owner's folder.
  thumbnail_path        text check (thumbnail_path is null or thumbnail_path like user_id::text || '/%'),
  is_favorite           boolean not null default false,
  last_opened_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.creations is
  '3D Studio: a member''s saved tooth-gem compositions. Owner-only (RLS).';
comment on column public.creations.scene_data is
  'Full editor scene (webapp studioWorkspace/scene.ts, version 1): pieces with transforms, finishes, sizes; light; camera; Gem Group references.';
comment on column public.creations.estimated_price_minor is
  'Indicative estimate in minor units, computed by the editor. Informational only: never charged.';

create index creations_user_updated_idx on public.creations (user_id, updated_at desc);

create trigger creations_touch_updated_at
  before insert or update on public.creations
  for each row execute function private.studio_touch_updated_at();

alter table public.creations enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Gem Groups
-- -----------------------------------------------------------------------------
create table public.gem_groups (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 1 and 60),
  description           text not null default '' check (char_length(description) <= 280),
  tags                  text[] not null default '{}' check (private.studio_tags_valid(tags)),
  group_data            jsonb not null
                          check (jsonb_typeof(group_data) = 'object'
                                 and (group_data ->> 'version') = '1'
                                 and jsonb_typeof(group_data -> 'pieces') = 'array'
                                 and jsonb_array_length(group_data -> 'pieces') between 2 and 24
                                 and pg_column_size(group_data) <= 65536),
  element_count         integer generated always as (jsonb_array_length(group_data -> 'pieces')) stored,
  estimated_price_minor integer not null default 0 check (estimated_price_minor >= 0),
  currency              char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  is_favorite           boolean not null default false,
  last_used_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.gem_groups is
  '3D Studio: reusable multi-gem arrangements, relative to an anchor tooth (webapp studioWorkspace/gemGroup.ts, version 1). Owner-only (RLS).';

create index gem_groups_user_updated_idx on public.gem_groups (user_id, updated_at desc);

create trigger gem_groups_touch_updated_at
  before insert or update on public.gem_groups
  for each row execute function private.studio_touch_updated_at();

alter table public.gem_groups enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Studio feedback
-- -----------------------------------------------------------------------------
create table public.studio_feedback (
  id          uuid primary key default gen_random_uuid(),
  -- SET NULL: product feedback outlives the account, without pointing at anyone.
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  category    text not null check (category in ('general', 'bug', 'feature', 'usability', 'performance')),
  message     text not null check (char_length(btrim(message)) between 3 and 2000),
  -- Page, piece count, language, window size — nothing personal (FeedbackModal.tsx).
  context     jsonb not null default '{}' check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 2048),
  created_at  timestamptz not null default now()
);

comment on table public.studio_feedback is
  '3D Studio feedback. Members insert their own; staff read. Append-only.';

create index studio_feedback_created_idx on public.studio_feedback (created_at desc);
alter table public.studio_feedback enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Privileges and policies
-- -----------------------------------------------------------------------------
revoke all on public.creations, public.gem_groups, public.studio_feedback from anon;
revoke truncate, references, trigger on public.creations, public.gem_groups, public.studio_feedback from authenticated;

-- Owners write the content and their own flags — never the owner (it defaults
-- to auth.uid()), the id, the derived count or the timestamps.
revoke insert on public.creations from authenticated;
grant insert (name, description, tags, scene_data, estimated_price_minor, currency, thumbnail_path, is_favorite, last_opened_at)
  on public.creations to authenticated;
revoke insert on public.gem_groups from authenticated;
grant insert (name, description, tags, group_data, estimated_price_minor, currency, is_favorite)
  on public.gem_groups to authenticated;
revoke insert on public.studio_feedback from authenticated;
grant insert (rating, category, message, context) on public.studio_feedback to authenticated;

revoke update on public.creations from authenticated;
grant update (name, description, tags, scene_data, estimated_price_minor, currency, thumbnail_path, is_favorite, last_opened_at)
  on public.creations to authenticated;
revoke update on public.gem_groups from authenticated;
grant update (name, description, tags, group_data, estimated_price_minor, currency, is_favorite, last_used_at)
  on public.gem_groups to authenticated;
-- Feedback is append-only for members.
revoke update, delete on public.studio_feedback from authenticated;

create policy "creations: owners read"
  on public.creations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "creations: owners insert"
  on public.creations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "creations: owners update"
  on public.creations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "creations: owners delete"
  on public.creations for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "gem_groups: owners read"
  on public.gem_groups for select to authenticated
  using (user_id = (select auth.uid()));
create policy "gem_groups: owners insert"
  on public.gem_groups for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "gem_groups: owners update"
  on public.gem_groups for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "gem_groups: owners delete"
  on public.gem_groups for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "studio_feedback: members insert their own"
  on public.studio_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "studio_feedback: staff read"
  on public.studio_feedback for select to authenticated
  using ((select private.is_staff()));

-- -----------------------------------------------------------------------------
-- 5. Storage: private thumbnails, one folder per member
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-thumbnails', 'studio-thumbnails', false, 524288,   -- 512 kB
        array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "studio-thumbnails: owners read"
  on storage.objects for select to authenticated
  using (bucket_id = 'studio-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "studio-thumbnails: owners upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "studio-thumbnails: owners replace own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'studio-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'studio-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "studio-thumbnails: owners delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'studio-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);
