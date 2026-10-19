-- =============================================================================
-- 3D Studio: the Glowbook — an artist's public, read-only showcase
-- =============================================================================
-- A member with Studio access opens a Glowbook (a public page, linked from
-- their Instagram bio: /fr/glowbook/<handle>, /en/glowbook/<handle>) and adds
-- creations to it from My Creations. Nothing reaches the public before a
-- moderator approves it: the page itself (handle, display name, bio,
-- Instagram) and each creation, separately.
--
--   * studio_showcases        one per member: handle, display name, bio,
--                             Instagram account, moderation status.
--   * studio_showcase_items   the creations in it (one row per creation),
--                             their order and moderation status.
--
-- Decisions taken by the owner (2026-10-19, decision 99 in supabase/README.md):
--   * The address is /fr/glowbook/<handle> and /en/glowbook/<handle>.
--   * The page is shown only while its author has Studio access (trial,
--     subscription or staff); it comes back as it was when access returns.
--   * Moderation happens once, before the first publication. Later saves of
--     an approved creation are public at once (no new review): the editor
--     warns the artist before saving. The Glowbook's display name, bio and
--     Instagram stay public when edited too; a NEW handle (a new address)
--     goes back to moderation, as does anything re-sent after a rejection.
--
-- Access model:
--   * Members read their own rows (RLS) and write only through the RPCs
--     below, which check Studio access (like every Studio write) and
--     ownership; removing a creation or the whole Glowbook is a plain DELETE
--     of their own rows, allowed whatever the access.
--   * Moderators (`moderate_reviews`) read every row, see the queue through
--     studio_showcase_queue() (with the creations' names, descriptions and
--     renders, which they cannot otherwise read) and decide through
--     studio_moderate_showcase() / studio_moderate_showcase_item(). A
--     decision can be changed at any time (taking an approved item down
--     included). Decisions are audited.
--   * Visitors (anon included) read through studio_public_showcase(handle)
--     only: approved Glowbook of an author with access, approved items only,
--     never the owner's id, e-mail or names. A storage policy lets them read
--     (sign) exactly the renders of those items in `studio-thumbnails`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Studio access of a given member (the public page's rule)
-- -----------------------------------------------------------------------------
create or replace function private.studio_user_has_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and (
       exists (select 1 from public.studio_trials t
                where t.user_id = p_user and now() < t.trial_expires_at)
       or private.studio_subscription_active(p_user)
       or exists (select 1 from public.profiles p
                    join public.roles r on r.key = p.role and r.is_staff
                   where p.id = p_user and p.status = 'active')
     );
$$;

comment on function private.studio_user_has_access(uuid) is
  '3D Studio: whether a given member may use the Studio now (active trial, active subscription or active staff). Same rule as has_studio_access(), for someone else.';

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.studio_showcases (
  user_id       uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  handle        text not null unique
                  check (handle ~ '^[a-z0-9]([a-z0-9._-]{1,28})[a-z0-9]$' and handle !~ '[._-]{2}'),
  display_name  text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 60),
  bio           text not null default '' check (bio = btrim(bio) and char_length(bio) <= 300),
  instagram     text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text check (char_length(review_note) <= 500),
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.studio_showcases is
  '3D Studio Glowbook: an artist''s public showcase page (decision 99). Owners read theirs, moderators all; written through studio_save_showcase() / studio_moderate_showcase(); public through studio_public_showcase() only.';

create index studio_showcases_pending_idx on public.studio_showcases (submitted_at) where status = 'pending';
create index studio_showcases_reviewed_by_idx on public.studio_showcases (reviewed_by);

create table public.studio_showcase_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.studio_showcases (user_id) on delete cascade,
  creation_id   uuid not null unique references public.creations (id) on delete cascade,
  position      integer not null default 0 check (position >= 0),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text check (char_length(review_note) <= 500),
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.studio_showcase_items is
  '3D Studio Glowbook: the creations an artist put in their Glowbook, each moderated before it is public (decision 99).';

create index studio_showcase_items_user_idx on public.studio_showcase_items (user_id, position);
create index studio_showcase_items_pending_idx on public.studio_showcase_items (submitted_at) where status = 'pending';
create index studio_showcase_items_reviewed_by_idx on public.studio_showcase_items (reviewed_by);

create trigger studio_showcases_touch before update on public.studio_showcases
  for each row execute function private.studio_touch_updated_at();
create trigger studio_showcase_items_touch before update on public.studio_showcase_items
  for each row execute function private.studio_touch_updated_at();

-- Moderation decisions are audited (who published what, who took it down).
create trigger studio_showcases_audit
  after update of status on public.studio_showcases
  for each row execute function private.audit_changes('status', 'review_note', 'handle');
create trigger studio_showcase_items_audit
  after update of status on public.studio_showcase_items
  for each row execute function private.audit_changes('status', 'review_note');

alter table public.studio_showcases enable row level security;
alter table public.studio_showcase_items enable row level security;

revoke all on public.studio_showcases, public.studio_showcase_items from anon, authenticated;
grant select, delete on public.studio_showcases, public.studio_showcase_items to authenticated;

create policy "studio_showcases: owners and moderators read"
  on public.studio_showcases for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('moderate_reviews')));
create policy "studio_showcases: owners delete"
  on public.studio_showcases for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "studio_showcase_items: owners and moderators read"
  on public.studio_showcase_items for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('moderate_reviews')));
create policy "studio_showcase_items: owners delete"
  on public.studio_showcase_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. Members: the Glowbook page and its creations
-- -----------------------------------------------------------------------------
create or replace function public.studio_save_showcase(
  p_handle       text,
  p_display_name text,
  p_bio          text,
  p_instagram    text
)
returns public.studio_showcases
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_handle    text := lower(btrim(coalesce(p_handle, '')));
  v_name      text := btrim(coalesce(p_display_name, ''));
  v_bio       text := btrim(coalesce(p_bio, ''));
  v_instagram text := nullif(ltrim(btrim(coalesce(p_instagram, '')), '@'), '');
  v_current   public.studio_showcases;
  v_row       public.studio_showcases;
begin
  if v_user is null or not private.has_studio_access() then
    raise exception 'studio_save_showcase: Studio access required' using errcode = '42501';
  end if;
  if v_handle !~ '^[a-z0-9]([a-z0-9._-]{1,28})[a-z0-9]$' or v_handle ~ '[._-]{2}' then
    raise exception 'studio_save_showcase: invalid handle' using errcode = '22023';
  end if;
  if v_handle in ('admin', 'api', 'app', 'aide', 'help', 'support', 'contact', 'studio', 'studio-3d', '3d-studio',
                  'glowbook', 'boutique', 'shop', 'academy', 'compte', 'account', 'moderation', 'staff', 'www',
                  'globaltoothgems', 'global-toothgems', 'global.toothgems', 'toothgems') then
    raise exception 'studio_save_showcase: reserved handle' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'studio_save_showcase: invalid display name' using errcode = '22023';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'studio_save_showcase: bio too long' using errcode = '22023';
  end if;
  if v_instagram is not null and v_instagram !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'studio_save_showcase: invalid Instagram account' using errcode = '22023';
  end if;
  if exists (select 1 from public.studio_showcases s where s.handle = v_handle and s.user_id <> v_user) then
    raise exception 'studio_save_showcase: handle taken' using errcode = '23505';
  end if;

  select * into v_current from public.studio_showcases s where s.user_id = v_user for update;

  if v_current.user_id is null then
    insert into public.studio_showcases (user_id, handle, display_name, bio, instagram)
    values (v_user, v_handle, v_name, v_bio, v_instagram)
    returning * into v_row;
    return v_row;
  end if;

  update public.studio_showcases s
     set handle       = v_handle,
         display_name = v_name,
         bio          = v_bio,
         instagram    = v_instagram,
         -- A new address, or a page re-sent after a rejection, is reviewed again;
         -- other edits of an approved page are public at once (decision 99).
         status       = case when s.status = 'rejected' or s.handle <> v_handle then 'pending' else s.status end,
         review_note  = case when s.status = 'rejected' or s.handle <> v_handle then null else s.review_note end,
         submitted_at = case when s.status = 'rejected' or s.handle <> v_handle then now() else s.submitted_at end
   where s.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

comment on function public.studio_save_showcase(text, text, text, text) is
  '3D Studio Glowbook: creates or updates the caller''s page (Studio access required). New pages, new handles and pages re-sent after a rejection wait for moderation.';

create or replace function public.studio_showcase_add(p_creation_id uuid)
returns public.studio_showcase_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row  public.studio_showcase_items;
begin
  if v_user is null or not private.has_studio_access() then
    raise exception 'studio_showcase_add: Studio access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.studio_showcases s where s.user_id = v_user) then
    raise exception 'studio_showcase_add: no Glowbook yet' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.creations c
     where c.id = p_creation_id and c.user_id = v_user
       and jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)) > 0
  ) then
    raise exception 'studio_showcase_add: creation not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.studio_showcase_items i where i.user_id = v_user) >= 60
     and not exists (select 1 from public.studio_showcase_items i where i.creation_id = p_creation_id) then
    raise exception 'studio_showcase_add: Glowbook full' using errcode = '54000';
  end if;

  insert into public.studio_showcase_items (user_id, creation_id, position)
  values (v_user, p_creation_id,
          coalesce((select max(i.position) + 1 from public.studio_showcase_items i where i.user_id = v_user), 0))
  on conflict (creation_id) do update
     -- Already there: re-sent for review only after a rejection.
     set status       = case when public.studio_showcase_items.status = 'rejected' then 'pending' else public.studio_showcase_items.status end,
         review_note  = case when public.studio_showcase_items.status = 'rejected' then null else public.studio_showcase_items.review_note end,
         submitted_at = case when public.studio_showcase_items.status = 'rejected' then now() else public.studio_showcase_items.submitted_at end
   where public.studio_showcase_items.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

comment on function public.studio_showcase_add(uuid) is
  '3D Studio Glowbook: puts one of the caller''s creations in their Glowbook, pending moderation (Studio access required; at most 60). Re-sends a rejected one.';

create or replace function public.studio_showcase_reorder(p_creation_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.has_studio_access() then
    raise exception 'studio_showcase_reorder: Studio access required' using errcode = '42501';
  end if;
  if p_creation_ids is null or cardinality(p_creation_ids) > 60 then
    raise exception 'studio_showcase_reorder: invalid order' using errcode = '22023';
  end if;
  update public.studio_showcase_items i
     set position = o.ord - 1
    from unnest(p_creation_ids) with ordinality as o(creation_id, ord)
   where i.creation_id = o.creation_id and i.user_id = v_user and i.position <> o.ord - 1;
end;
$$;

comment on function public.studio_showcase_reorder(uuid[]) is
  '3D Studio Glowbook: sets the order of the caller''s Glowbook creations (first = top). Others'' rows are ignored.';

-- -----------------------------------------------------------------------------
-- 3. Moderators (moderate_reviews)
-- -----------------------------------------------------------------------------
create or replace function public.studio_showcase_queue()
returns table (
  kind              text,       -- 'showcase' | 'item'
  id                uuid,       -- item id, or the showcase's user id
  user_id           uuid,
  status            text,
  review_note       text,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  handle            text,
  display_name      text,
  bio               text,
  instagram         text,
  showcase_status   text,
  creation_name     text,
  creation_description text,
  element_count     integer,
  thumbnail_path    text,
  creation_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_permission('moderate_reviews') then
    raise exception 'studio_showcase_queue: moderate_reviews required' using errcode = '42501';
  end if;
  return query
    select 'showcase'::text, s.user_id, s.user_id, s.status, s.review_note, s.submitted_at, s.reviewed_at,
           s.handle, s.display_name, s.bio, s.instagram, s.status,
           null::text, null::text, null::integer, null::text, null::timestamptz
      from public.studio_showcases s
    union all
    select 'item'::text, i.id, i.user_id, i.status, i.review_note, i.submitted_at, i.reviewed_at,
           s.handle, s.display_name, null::text, null::text, s.status,
           c.name, c.description, jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
           c.thumbnail_path, c.updated_at
      from public.studio_showcase_items i
      join public.studio_showcases s on s.user_id = i.user_id
      join public.creations c on c.id = i.creation_id
    order by 6 desc
    limit 1000;
end;
$$;

comment on function public.studio_showcase_queue() is
  '3D Studio Glowbook: every Glowbook and Glowbook creation with what moderators need to decide (moderate_reviews), newest submission first.';

create or replace function public.studio_moderate_showcase(p_user_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null or not private.has_permission('moderate_reviews') then
    raise exception 'studio_moderate_showcase: moderate_reviews required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') or char_length(v_note) > 500 then
    raise exception 'studio_moderate_showcase: invalid decision' using errcode = '22023';
  end if;
  update public.studio_showcases s
     set status = p_status, review_note = case when p_status = 'rejected' then v_note else null end,
         reviewed_at = now(), reviewed_by = v_user
   where s.user_id = p_user_id;
  if not found then
    raise exception 'studio_moderate_showcase: Glowbook not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.studio_moderate_showcase_item(p_item_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null or not private.has_permission('moderate_reviews') then
    raise exception 'studio_moderate_showcase_item: moderate_reviews required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') or char_length(v_note) > 500 then
    raise exception 'studio_moderate_showcase_item: invalid decision' using errcode = '22023';
  end if;
  update public.studio_showcase_items i
     set status = p_status, review_note = case when p_status = 'rejected' then v_note else null end,
         reviewed_at = now(), reviewed_by = v_user
   where i.id = p_item_id;
  if not found then
    raise exception 'studio_moderate_showcase_item: item not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.studio_moderate_showcase(uuid, text, text) is
  '3D Studio Glowbook: approve or reject (with a note shown to the artist) a Glowbook page (moderate_reviews). Audited.';
comment on function public.studio_moderate_showcase_item(uuid, text, text) is
  '3D Studio Glowbook: approve or reject (with a note shown to the artist) one Glowbook creation (moderate_reviews). Audited.';

-- -----------------------------------------------------------------------------
-- 4. Visitors: the public page
-- -----------------------------------------------------------------------------
create or replace function public.studio_public_showcase(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'handle', s.handle,
           'display_name', s.display_name,
           'bio', s.bio,
           'instagram', s.instagram,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', i.id,
                      'name', c.name,
                      'description', c.description,
                      'element_count', jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
                      'thumbnail_path', c.thumbnail_path,
                      'updated_at', c.updated_at)
                    order by i.position, i.created_at)
               from public.studio_showcase_items i
               join public.creations c on c.id = i.creation_id
              where i.user_id = s.user_id and i.status = 'approved'
           ), '[]'::jsonb))
    from public.studio_showcases s
   where s.handle = lower(btrim(p_handle))
     and s.status = 'approved'
     and private.studio_user_has_access(s.user_id);
$$;

comment on function public.studio_public_showcase(text) is
  '3D Studio Glowbook: the public page behind a handle (approved, author with Studio access), its approved creations in order; null otherwise. No owner id or personal data.';

-- The renders of public Glowbook creations, readable (signable) by anyone.
create or replace function private.is_studio_showcase_thumbnail(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.creations c
      join public.studio_showcase_items i on i.creation_id = c.id and i.status = 'approved'
      join public.studio_showcases s on s.user_id = i.user_id and s.status = 'approved'
     where c.thumbnail_path = p_name
       and private.studio_user_has_access(s.user_id)
  );
$$;

-- Moderators read the renders of every creation sent to a Glowbook.
create or replace function private.is_studio_showcase_submission_thumbnail(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.creations c
      join public.studio_showcase_items i on i.creation_id = c.id
     where c.thumbnail_path = p_name
  );
$$;

create index creations_thumbnail_path_idx on public.creations (thumbnail_path) where thumbnail_path is not null;

create policy "studio-thumbnails: anyone reads public Glowbook renders"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'studio-thumbnails' and private.is_studio_showcase_thumbnail(name));

create policy "studio-thumbnails: moderators read Glowbook submissions"
  on storage.objects for select to authenticated
  using (bucket_id = 'studio-thumbnails'
         and (select private.has_permission('moderate_reviews'))
         and private.is_studio_showcase_submission_thumbnail(name));

-- -----------------------------------------------------------------------------
-- 5. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.studio_user_has_access(uuid),
                       private.is_studio_showcase_thumbnail(text),
                       private.is_studio_showcase_submission_thumbnail(text) from public;
grant execute on function private.studio_user_has_access(uuid),
                          private.is_studio_showcase_thumbnail(text) to anon, authenticated, service_role;
grant execute on function private.is_studio_showcase_submission_thumbnail(text) to authenticated, service_role;

revoke all on function public.studio_save_showcase(text, text, text, text),
                       public.studio_showcase_add(uuid),
                       public.studio_showcase_reorder(uuid[]),
                       public.studio_showcase_queue(),
                       public.studio_moderate_showcase(uuid, text, text),
                       public.studio_moderate_showcase_item(uuid, text, text),
                       public.studio_public_showcase(text) from public, anon;
grant execute on function public.studio_save_showcase(text, text, text, text),
                          public.studio_showcase_add(uuid),
                          public.studio_showcase_reorder(uuid[]),
                          public.studio_showcase_queue(),
                          public.studio_moderate_showcase(uuid, text, text),
                          public.studio_moderate_showcase_item(uuid, text, text) to authenticated, service_role;
grant execute on function public.studio_public_showcase(text) to anon, authenticated, service_role;
