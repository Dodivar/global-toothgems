-- =============================================================================
-- 3D Studio Glowbook: the artist's own look (decision 100, owner's request 2026-10-19)
-- =============================================================================
-- The artist makes their Glowbook look like them: profile picture, banner,
-- identity colour, background, layout, a creation "in the spotlight", their
-- city and their links (booking, website, TikTok).
--
-- Moderation keeps its promise ("nothing public before a moderator"):
--   * Pictures and links are PROPOSED: a new value waits in `pending_changes`
--     while the page keeps showing the approved one, until a moderator
--     approves (studio_moderate_showcase_changes) — or approves the page
--     itself, which applies what waits with it. Removing a picture or a link
--     needs no review and is immediate.
--   * Colour, background, layout and spotlight are chosen from fixed lists
--     (or one's own approved creations): live, nothing to review. The city
--     is short text, live like the name and bio (decision 99 (b)).
--
-- The look is a paid-plan feature to come: one switch,
-- private.glowbook_customization_allowed(user), decides who may set it and
-- whether the public page shows it. Today it lets every member with Studio
-- access do it (the owner will restrict it to a plan later).
--
-- Pictures live in the private bucket `glowbook-media` (`<user id>/<file>`,
-- 5 MB, JPEG / PNG / WebP): owners upload (Studio access) and read their own
-- files; moderators read every file; anyone reads (signs) exactly the
-- approved pictures of a public Glowbook. No update policy and no deleting a
-- file a page still uses, so an approved picture cannot be swapped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. The plan switch
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_customization_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Open to every member with Studio access for now (owner's decision, 2026-10-19).
  -- To reserve it to a plan: check public.studio_subscriptions here.
  select private.studio_user_has_access(p_user);
$$;

comment on function private.glowbook_customization_allowed(uuid) is
  'Glowbook look (decision 100): who may customise their Glowbook and whose custom look the public page shows. Today: Studio access.';

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.studio_showcases
  add column accent           text not null default 'ink'
    check (accent in ('ink', 'blue', 'fuchsia', 'rose', 'coral', 'gold', 'emerald', 'teal', 'violet', 'plum')),
  add column background       text not null default 'light' check (background in ('light', 'tinted', 'dark')),
  add column layout           text not null default 'grid' check (layout in ('grid', 'large')),
  add column location         text check (location = btrim(location) and char_length(location) between 1 and 60),
  add column featured_item_id uuid references public.studio_showcase_items (id) on delete set null,
  -- Approved pictures and links (what the public sees).
  add column avatar_path      text check (avatar_path like user_id::text || '/%'),
  add column banner_path      text check (banner_path like user_id::text || '/%'),
  add column booking_url      text check (booking_url ~ '^https://[^\s<>"]{3,290}$'),
  add column website_url      text check (website_url ~ '^https://[^\s<>"]{3,290}$'),
  add column tiktok           text check (tiktok ~ '^[A-Za-z0-9._]{2,24}$'),
  -- Proposed pictures and links, waiting for a moderator.
  add column pending_changes       jsonb check (pending_changes is null or jsonb_typeof(pending_changes) = 'object'),
  add column changes_submitted_at  timestamptz,
  add column changes_review_note   text check (char_length(changes_review_note) <= 500);

create index studio_showcases_featured_idx on public.studio_showcases (featured_item_id);
create index studio_showcases_changes_idx on public.studio_showcases (changes_submitted_at) where pending_changes is not null;

-- Moderation of the proposed pictures and links is audited like the rest.
create trigger studio_showcases_changes_audit
  after update of avatar_path, banner_path, booking_url, website_url, tiktok, changes_review_note on public.studio_showcases
  for each row execute function private.audit_changes('avatar_path', 'banner_path', 'booking_url', 'website_url', 'tiktok', 'changes_review_note');

-- -----------------------------------------------------------------------------
-- 2. Storage: glowbook-media
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('glowbook-media', 'glowbook-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- A picture some Glowbook uses or proposes: never deletable (no swapping an approved file).
create or replace function private.glowbook_media_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.studio_showcases s
     where s.avatar_path = p_name or s.banner_path = p_name
        or s.pending_changes ->> 'avatar_path' = p_name or s.pending_changes ->> 'banner_path' = p_name
  );
$$;

-- An approved picture of a public Glowbook (same rule as the page).
create or replace function private.is_public_glowbook_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.studio_showcases s
     where (s.avatar_path = p_name or s.banner_path = p_name)
       and s.status = 'approved'
       and private.studio_user_has_access(s.user_id)
       and private.glowbook_customization_allowed(s.user_id)
  );
$$;

create policy "glowbook-media: owners with Studio access upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'glowbook-media'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.has_studio_access()));

create policy "glowbook-media: owners and moderators read"
  on storage.objects for select to authenticated
  using (bucket_id = 'glowbook-media'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select private.has_permission('moderate_reviews'))));

create policy "glowbook-media: anyone reads public Glowbook pictures"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'glowbook-media' and private.is_public_glowbook_media(name));

create policy "glowbook-media: owners delete unused files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'glowbook-media'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and not private.glowbook_media_in_use(name));

-- -----------------------------------------------------------------------------
-- 3. Members: save the look
-- -----------------------------------------------------------------------------
-- p_look keys (all optional; a missing key keeps the current value):
--   accent, background, layout           fixed lists, live
--   location                             text ≤ 60 or null, live
--   featured_item_id                     one of the caller's items or null, live
--   avatar_path, banner_path             a file of the caller's folder in glowbook-media, or null
--   booking_url, website_url             https:// URL, or null
--   tiktok                               handle, or null
-- Pictures and links: null removes at once; the approved value again cancels
-- what waited; anything else waits for a moderator in pending_changes.
create or replace function public.studio_save_showcase_look(p_look jsonb)
returns public.studio_showcases
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_row     public.studio_showcases;
  v_pending jsonb;
  v_key     text;
  v_value   text;
  v_current text;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_customization_allowed(v_user) then
    raise exception 'studio_save_showcase_look: Studio access required' using errcode = '42501';
  end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' then
    raise exception 'studio_save_showcase_look: invalid look' using errcode = '22023';
  end if;
  select * into v_row from public.studio_showcases s where s.user_id = v_user for update;
  if v_row.user_id is null then
    raise exception 'studio_save_showcase_look: no Glowbook yet' using errcode = 'P0002';
  end if;

  -- Live settings (the CHECKs validate the lists).
  if p_look ? 'accent' then v_row.accent := p_look ->> 'accent'; end if;
  if p_look ? 'background' then v_row.background := p_look ->> 'background'; end if;
  if p_look ? 'layout' then v_row.layout := p_look ->> 'layout'; end if;
  if p_look ? 'location' then v_row.location := nullif(btrim(coalesce(p_look ->> 'location', '')), ''); end if;
  if p_look ? 'featured_item_id' then
    v_row.featured_item_id := nullif(p_look ->> 'featured_item_id', '')::uuid;
    if v_row.featured_item_id is not null and not exists (
      select 1 from public.studio_showcase_items i where i.id = v_row.featured_item_id and i.user_id = v_user
    ) then
      raise exception 'studio_save_showcase_look: not one of your creations' using errcode = '22023';
    end if;
  end if;

  -- Pictures and links: removed at once, or proposed.
  v_pending := coalesce(v_row.pending_changes, '{}'::jsonb);
  foreach v_key in array array['avatar_path', 'banner_path', 'booking_url', 'website_url', 'tiktok'] loop
    continue when not p_look ? v_key;
    v_value := nullif(btrim(coalesce(p_look ->> v_key, '')), '');
    if v_key = 'tiktok' then v_value := ltrim(v_value, '@'); end if;
    v_current := case v_key when 'avatar_path' then v_row.avatar_path when 'banner_path' then v_row.banner_path
                            when 'booking_url' then v_row.booking_url when 'website_url' then v_row.website_url
                            else v_row.tiktok end;
    if v_value is null then
      v_pending := v_pending - v_key;
      case v_key when 'avatar_path' then v_row.avatar_path := null; when 'banner_path' then v_row.banner_path := null;
                 when 'booking_url' then v_row.booking_url := null; when 'website_url' then v_row.website_url := null;
                 else v_row.tiktok := null; end case;
    elsif v_value is not distinct from v_current then
      v_pending := v_pending - v_key;
    else
      if v_key in ('avatar_path', 'banner_path') then
        if v_value not like v_user::text || '/%' or not exists (
          select 1 from storage.objects o where o.bucket_id = 'glowbook-media' and o.name = v_value
        ) then
          raise exception 'studio_save_showcase_look: unknown picture' using errcode = '22023';
        end if;
      elsif v_key in ('booking_url', 'website_url') then
        if v_value !~ '^https://[^\s<>"]{3,290}$' then
          raise exception 'studio_save_showcase_look: invalid link' using errcode = '22023';
        end if;
      elsif v_value !~ '^[A-Za-z0-9._]{2,24}$' then
        raise exception 'studio_save_showcase_look: invalid TikTok account' using errcode = '22023';
      end if;
      v_pending := v_pending || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if v_pending = '{}'::jsonb then
    v_row.pending_changes := null;
    v_row.changes_submitted_at := null;
  elsif v_pending is distinct from v_row.pending_changes then
    v_row.pending_changes := v_pending;
    v_row.changes_submitted_at := now();
    v_row.changes_review_note := null;
  end if;

  update public.studio_showcases s
     set accent = v_row.accent, background = v_row.background, layout = v_row.layout,
         location = v_row.location, featured_item_id = v_row.featured_item_id,
         avatar_path = v_row.avatar_path, banner_path = v_row.banner_path,
         booking_url = v_row.booking_url, website_url = v_row.website_url, tiktok = v_row.tiktok,
         pending_changes = v_row.pending_changes, changes_submitted_at = v_row.changes_submitted_at,
         changes_review_note = v_row.changes_review_note
   where s.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

comment on function public.studio_save_showcase_look(jsonb) is
  'Glowbook look (decision 100): colour, background, layout, city and spotlight are live; new pictures and links wait for a moderator in pending_changes; removing one is immediate.';

-- -----------------------------------------------------------------------------
-- 4. Moderators
-- -----------------------------------------------------------------------------
create or replace function private.apply_glowbook_changes(p_user uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.studio_showcases s
     set avatar_path = case when s.pending_changes ? 'avatar_path' then s.pending_changes ->> 'avatar_path' else s.avatar_path end,
         banner_path = case when s.pending_changes ? 'banner_path' then s.pending_changes ->> 'banner_path' else s.banner_path end,
         booking_url = case when s.pending_changes ? 'booking_url' then s.pending_changes ->> 'booking_url' else s.booking_url end,
         website_url = case when s.pending_changes ? 'website_url' then s.pending_changes ->> 'website_url' else s.website_url end,
         tiktok      = case when s.pending_changes ? 'tiktok' then s.pending_changes ->> 'tiktok' else s.tiktok end,
         pending_changes = null, changes_submitted_at = null, changes_review_note = null
   where s.user_id = p_user and s.pending_changes is not null;
$$;

create or replace function public.studio_moderate_showcase_changes(p_user_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if (select auth.uid()) is null or not private.has_permission('moderate_reviews') then
    raise exception 'studio_moderate_showcase_changes: moderate_reviews required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') or char_length(v_note) > 500 then
    raise exception 'studio_moderate_showcase_changes: invalid decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_showcases s where s.user_id = p_user_id and s.pending_changes is not null) then
    raise exception 'studio_moderate_showcase_changes: nothing waiting' using errcode = 'P0002';
  end if;
  if p_status = 'approved' then
    perform private.apply_glowbook_changes(p_user_id);
  else
    update public.studio_showcases s
       set pending_changes = null, changes_submitted_at = null, changes_review_note = coalesce(v_note, '')
     where s.user_id = p_user_id;
  end if;
end;
$$;

comment on function public.studio_moderate_showcase_changes(uuid, text, text) is
  'Glowbook look (decision 100): approve (apply) or reject (with a note shown to the artist) the pictures and links an artist proposed. moderate_reviews; audited.';

-- Approving a page applies what waits with it (the moderator sees both together).
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
  if p_status = 'approved' then
    perform private.apply_glowbook_changes(p_user_id);
  end if;
end;
$$;

-- The queue gains the proposed pictures and links ('changes' rows) and, for
-- every row, the page's look (`details`), so moderators see what they publish.
drop function public.studio_showcase_queue();
create function public.studio_showcase_queue()
returns table (
  kind              text,       -- 'showcase' | 'item' | 'changes'
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
  creation_updated_at timestamptz,
  details           jsonb
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
           null::text, null::text, null::integer, null::text, null::timestamptz,
           jsonb_build_object('approved', jsonb_build_object(
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path, 'booking_url', s.booking_url,
             'website_url', s.website_url, 'tiktok', s.tiktok, 'location', s.location, 'accent', s.accent),
             'pending', s.pending_changes)
      from public.studio_showcases s
    union all
    select 'changes'::text, s.user_id, s.user_id,
           case when s.pending_changes is not null then 'pending' else 'rejected' end,
           s.changes_review_note, coalesce(s.changes_submitted_at, s.updated_at), null::timestamptz,
           s.handle, s.display_name, null::text, null::text, s.status,
           null::text, null::text, null::integer, null::text, null::timestamptz,
           jsonb_build_object('approved', jsonb_build_object(
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path, 'booking_url', s.booking_url,
             'website_url', s.website_url, 'tiktok', s.tiktok),
             'pending', s.pending_changes)
      from public.studio_showcases s
     where s.pending_changes is not null or s.changes_review_note is not null
    union all
    select 'item'::text, i.id, i.user_id, i.status, i.review_note, i.submitted_at, i.reviewed_at,
           s.handle, s.display_name, null::text, null::text, s.status,
           c.name, c.description, jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
           c.thumbnail_path, c.updated_at, null::jsonb
      from public.studio_showcase_items i
      join public.studio_showcases s on s.user_id = i.user_id
      join public.creations c on c.id = i.creation_id
    order by 6 desc
    limit 1000;
end;
$$;

comment on function public.studio_showcase_queue() is
  '3D Studio Glowbook: pages, proposed pictures and links, and creations, with what moderators need to decide (moderate_reviews), newest submission first.';

-- -----------------------------------------------------------------------------
-- 5. The public page carries the look
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
           'location', s.location,
           'look', case when private.glowbook_customization_allowed(s.user_id) then jsonb_build_object(
             'accent', s.accent, 'background', s.background, 'layout', s.layout,
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path,
             'booking_url', s.booking_url, 'website_url', s.website_url, 'tiktok', s.tiktok,
             'featured_item_id', (select i.id from public.studio_showcase_items i
                                   where i.id = s.featured_item_id and i.status = 'approved'))
             else null end,
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

-- -----------------------------------------------------------------------------
-- 6. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.glowbook_customization_allowed(uuid), private.glowbook_media_in_use(text),
                       private.is_public_glowbook_media(text), private.apply_glowbook_changes(uuid) from public;
grant execute on function private.glowbook_customization_allowed(uuid), private.is_public_glowbook_media(text)
  to anon, authenticated, service_role;
grant execute on function private.glowbook_media_in_use(text) to authenticated, service_role;
grant execute on function private.apply_glowbook_changes(uuid) to service_role;

revoke all on function public.studio_save_showcase_look(jsonb), public.studio_moderate_showcase_changes(uuid, text, text),
                       public.studio_showcase_queue() from public, anon;
grant execute on function public.studio_save_showcase_look(jsonb), public.studio_moderate_showcase_changes(uuid, text, text),
                          public.studio_showcase_queue() to authenticated, service_role;
