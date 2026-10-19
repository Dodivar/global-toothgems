-- =============================================================================
-- 3D Studio: collections of saved creations
-- =============================================================================
-- A member sorts their saved creations into named collections ("Bridal",
-- "Client: Léa", "Summer 2027"…). Many-to-many: one creation can sit in
-- several collections, and a collection holds any number of creations.
--
--   * studio_collections            name + optional colour, one owner
--   * studio_collection_creations   membership rows (collection, creation)
--
-- Ownership mirrors the designs (`creations`, `gem_groups`): user_id defaults
-- to auth.uid(), is not writable, and RLS refuses every other row.
-- A membership row can only join the caller's own collection (composite FK on
-- (collection_id, user_id), user_id = auth.uid()) to the caller's own creation
-- (RLS check on the creation's owner): cross-owner links are impossible.
--
-- Deleting a collection removes its membership rows only, never a creation.
-- Deleting a creation removes its membership rows.
--
-- Studio access (decision 93, `private.has_studio_access()`), like the designs:
-- creating or renaming a collection and adding a creation to one need access;
-- reading, deleting a collection and taking a creation out of one do not, so
-- a member whose trial or subscription ended still sees and tidies their work.
--
-- Decision 96 in supabase/README.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Collections
-- -----------------------------------------------------------------------------
create table public.studio_collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  -- A design-token name, never a free colour: the interface maps it to its palette.
  color       text check (color is null or color in ('blue', 'fuchsia', 'emerald', 'amber', 'ink')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Target of the membership rows' composite key (same owner on both sides).
  constraint studio_collections_id_owner_key unique (id, user_id)
);

comment on table public.studio_collections is
  '3D Studio: a member''s named collections of saved creations. Owner-only (RLS); writes need Studio access.';

-- One name per owner, ignoring case.
create unique index studio_collections_owner_name_key on public.studio_collections (user_id, lower(name));

create trigger studio_collections_set_updated_at
  before update on public.studio_collections
  for each row execute function private.set_updated_at();

alter table public.studio_collections enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Memberships
-- -----------------------------------------------------------------------------
create table public.studio_collection_creations (
  collection_id  uuid not null,
  creation_id    uuid not null references public.creations (id) on delete cascade,
  user_id        uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  primary key (collection_id, creation_id),
  -- The collection must belong to the row's owner; deleting it removes the row only.
  constraint studio_collection_creations_collection_fkey
    foreign key (collection_id, user_id) references public.studio_collections (id, user_id) on delete cascade
);

comment on table public.studio_collection_creations is
  '3D Studio: which saved creation sits in which collection. Insert/delete only; both sides belong to the same member.';

create index studio_collection_creations_creation_idx on public.studio_collection_creations (creation_id);
create index studio_collection_creations_owner_idx on public.studio_collection_creations (user_id);

alter table public.studio_collection_creations enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Privileges and policies
-- -----------------------------------------------------------------------------
revoke all on public.studio_collections, public.studio_collection_creations from anon;
revoke truncate, references, trigger on public.studio_collections, public.studio_collection_creations from authenticated;

-- Members write the name and colour only — never the owner, id or timestamps.
revoke insert, update on public.studio_collections from authenticated;
grant insert (name, color) on public.studio_collections to authenticated;
grant update (name, color) on public.studio_collections to authenticated;

-- A membership is added or removed, never re-pointed.
revoke insert, update on public.studio_collection_creations from authenticated;
grant insert (collection_id, creation_id) on public.studio_collection_creations to authenticated;

create policy "studio_collections: owners read"
  on public.studio_collections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "studio_collections: owners with Studio access insert"
  on public.studio_collections for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_studio_access()));
create policy "studio_collections: owners with Studio access update"
  on public.studio_collections for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.has_studio_access()));
create policy "studio_collections: owners delete"
  on public.studio_collections for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "studio_collection_creations: owners read"
  on public.studio_collection_creations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "studio_collection_creations: owners with Studio access add their own creations"
  on public.studio_collection_creations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.has_studio_access())
    and exists (select 1 from public.creations c
                 where c.id = creation_id and c.user_id = (select auth.uid()))
  );
create policy "studio_collection_creations: owners remove"
  on public.studio_collection_creations for delete to authenticated
  using (user_id = (select auth.uid()));
