-- =============================================================================
-- 3D Studio Glowbook: the spotlight creation as a turning video (decision 103,
-- owner's request 2026-10-21)
-- =============================================================================
-- The public Glowbook opens on the artist's creations, the creation in the
-- spotlight first, shown as a short video turning around it (4 seconds by
-- default; 4, 6 or 8). The banner is no longer shown (the column stays).
--
-- The video can only be drawn where WebGL runs: the artist's own Studio tab
-- records it on a hidden stage (the "Create a post" turntable) and uploads it
-- here. It is a mechanical render of a creation already approved for the
-- page, like the creation's still render (studio-thumbnails), so it is not
-- moderated: the same trust as the render, whose later edits are live too.
--
-- A video belongs to one item and one state of its scene:
--   * studio_set_spotlight_video() records it for the CURRENT spotlight item
--     only, and only when the creation has not changed since the tab read it
--     (p_creation_updated_at); it stamps md5(scene_data);
--   * the public page and the read policy show it only while that item is
--     still the approved spotlight AND its scene still has that md5 — an edit
--     of the design (live on the page) puts the still render back until the
--     artist's tab records the new turn.
--
-- Files live in the private bucket `glowbook-videos` (`<user id>/<file>`,
-- 8 MB, MP4 / WebM): owners with Studio access and the Glowbook look upload
-- into their folder (never overwrite: a new render is a new file) and read
-- their own; moderators read every file; anyone reads (signs) exactly the
-- current spotlight video of a public Glowbook; owners delete the files no
-- page uses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.studio_showcases
  add column spotlight_video_path      text check (spotlight_video_path like user_id::text || '/%'),
  add column spotlight_video_item_id   uuid references public.studio_showcase_items (id) on delete set null,
  add column spotlight_video_scene_md5 text check (spotlight_video_scene_md5 ~ '^[0-9a-f]{32}$'),
  add column spotlight_video_type      text check (spotlight_video_type in ('video/mp4', 'video/webm')),
  add column spotlight_video_seconds   smallint check (spotlight_video_seconds in (4, 6, 8)),
  add column spotlight_video_at        timestamptz,
  add constraint studio_showcases_spotlight_video_complete check (
    (spotlight_video_path is null) = (spotlight_video_type is null)
    and (spotlight_video_path is null) = (spotlight_video_seconds is null)
    and (spotlight_video_path is null) = (spotlight_video_scene_md5 is null)
  );

create index studio_showcases_spotlight_video_item_idx on public.studio_showcases (spotlight_video_item_id);
create index studio_showcases_spotlight_video_path_idx on public.studio_showcases (spotlight_video_path) where spotlight_video_path is not null;

comment on column public.studio_showcases.spotlight_video_path is
  'Glowbook spotlight video (decision 103): the turning video of the spotlight creation in glowbook-videos, recorded in the artist''s browser; shown only while spotlight_video_item_id is the approved spotlight and its scene still hashes to spotlight_video_scene_md5.';

-- -----------------------------------------------------------------------------
-- 2. The rule: is a Glowbook's video the current one?
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_spotlight_video_current(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.studio_showcases s
      join public.studio_showcase_items i on i.id = s.spotlight_video_item_id and i.user_id = s.user_id
      join public.creations c on c.id = i.creation_id
     where s.user_id = p_user
       and s.spotlight_video_path is not null
       and s.spotlight_video_item_id = s.featured_item_id
       and md5(c.scene_data::text) = s.spotlight_video_scene_md5
  );
$$;

-- The current spotlight video of a public Glowbook (same rule as the page).
create or replace function private.is_public_glowbook_video(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.studio_showcases s
      join public.studio_showcase_items i on i.id = s.featured_item_id and i.status = 'approved'
     where s.spotlight_video_path = p_name
       and s.status = 'approved'
       and private.studio_user_has_access(s.user_id)
       and private.glowbook_customization_allowed(s.user_id)
       and private.glowbook_spotlight_video_current(s.user_id)
  );
$$;

create or replace function private.glowbook_video_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.studio_showcases s where s.spotlight_video_path = p_name);
$$;

-- -----------------------------------------------------------------------------
-- 3. Storage: glowbook-videos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('glowbook-videos', 'glowbook-videos', false, 8388608, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy "glowbook-videos: owners with the Glowbook look upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'glowbook-videos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.has_studio_access())
              and (select private.glowbook_customization_allowed((select auth.uid()))));

create policy "glowbook-videos: owners and moderators read"
  on storage.objects for select to authenticated
  using (bucket_id = 'glowbook-videos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select private.has_permission('moderate_reviews'))));

create policy "glowbook-videos: anyone reads the public spotlight videos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'glowbook-videos' and private.is_public_glowbook_video(name));

create policy "glowbook-videos: owners delete unused files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'glowbook-videos'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and not private.glowbook_video_in_use(name));

-- -----------------------------------------------------------------------------
-- 4. Members: record the video, read its state
-- -----------------------------------------------------------------------------
-- p_item_id              the spotlight item the video turns around (must be the current spotlight)
-- p_path                 a file of the caller's folder in glowbook-videos
-- p_type                 'video/mp4' | 'video/webm'
-- p_seconds              4, 6 or 8
-- p_creation_updated_at  the creation's updated_at when the tab drew it: a later edit refuses the video (40001)
create or replace function public.studio_set_spotlight_video(
  p_item_id uuid, p_path text, p_type text, p_seconds integer, p_creation_updated_at timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_md5  text;
  v_at   timestamptz;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_customization_allowed(v_user) then
    raise exception 'studio_set_spotlight_video: Studio access required' using errcode = '42501';
  end if;
  if p_item_id is null or p_path is null or p_type is null or p_seconds is null or p_creation_updated_at is null
     or p_type not in ('video/mp4', 'video/webm') or p_seconds not in (4, 6, 8) then
    raise exception 'studio_set_spotlight_video: invalid video' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_showcases s
                  where s.user_id = v_user and s.featured_item_id = p_item_id) then
    raise exception 'studio_set_spotlight_video: not your spotlight creation' using errcode = '22023';
  end if;
  if p_path not like v_user::text || '/%' or not exists (
    select 1 from storage.objects o where o.bucket_id = 'glowbook-videos' and o.name = p_path
  ) then
    raise exception 'studio_set_spotlight_video: unknown file' using errcode = '22023';
  end if;
  select md5(c.scene_data::text), c.updated_at into v_md5, v_at
    from public.studio_showcase_items i
    join public.creations c on c.id = i.creation_id
   where i.id = p_item_id and i.user_id = v_user;
  if v_at is distinct from p_creation_updated_at then
    raise exception 'studio_set_spotlight_video: the creation changed' using errcode = '40001';
  end if;

  update public.studio_showcases s
     set spotlight_video_path = p_path, spotlight_video_item_id = p_item_id, spotlight_video_scene_md5 = v_md5,
         spotlight_video_type = p_type, spotlight_video_seconds = p_seconds, spotlight_video_at = now()
   where s.user_id = v_user;
  return public.studio_spotlight_video_state();
end;
$$;

comment on function public.studio_set_spotlight_video(uuid, text, text, integer, timestamptz) is
  'Glowbook spotlight video (decision 103): records the turning video the artist''s browser drew for the current spotlight creation; refused (40001) when the creation changed since.';

-- The caller's spotlight video, for their Studio to know whether to record one:
-- null without a Glowbook; otherwise the spotlight item, the recorded video and whether it is current.
create or replace function public.studio_spotlight_video_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'featured_item_id', s.featured_item_id,
           'item_id', s.spotlight_video_item_id,
           'path', s.spotlight_video_path,
           'type', s.spotlight_video_type,
           'seconds', s.spotlight_video_seconds,
           'current', private.glowbook_spotlight_video_current(s.user_id))
    from public.studio_showcases s
   where s.user_id = (select auth.uid());
$$;

comment on function public.studio_spotlight_video_state() is
  'Glowbook spotlight video (decision 103): the caller''s spotlight item, its recorded video and whether that video still matches the creation.';

-- -----------------------------------------------------------------------------
-- 5. The public page carries the current video
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
                                   where i.id = s.featured_item_id and i.status = 'approved'),
             -- The spotlight's turning video, only while it matches the approved spotlight (decision 103).
             'spotlight_video', case when exists (select 1 from public.studio_showcase_items i
                                                   where i.id = s.featured_item_id and i.status = 'approved')
                                      and private.glowbook_spotlight_video_current(s.user_id)
                                     then jsonb_build_object('path', s.spotlight_video_path,
                                                             'type', s.spotlight_video_type,
                                                             'seconds', s.spotlight_video_seconds)
                                     else null end)
             else null end,
           -- Sections holding at least one approved creation, in the artist's order (plan switch).
           'sections', case when private.glowbook_customization_allowed(s.user_id) then coalesce((
             select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.position, x.created_at)
               from public.studio_showcase_sections x
              where x.user_id = s.user_id
                and exists (select 1 from public.studio_showcase_items i
                             where i.section_id = x.id and i.user_id = s.user_id and i.status = 'approved')
           ), '[]'::jsonb) else '[]'::jsonb end,
           -- Course titles only; absent when hidden or when there is none.
           'certification', case when s.show_certification
                                  and jsonb_array_length(private.glowbook_certification(s.user_id)) > 0
                                 then jsonb_build_object('courses', private.glowbook_certification(s.user_id))
                                 else null end,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', i.id,
                      'name', c.name,
                      'description', c.description,
                      'element_count', jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
                      'thumbnail_path', c.thumbnail_path,
                      'updated_at', c.updated_at,
                      'section_id', case when private.glowbook_customization_allowed(s.user_id) then i.section_id end)
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
revoke all on function private.glowbook_spotlight_video_current(uuid),
                       private.is_public_glowbook_video(text),
                       private.glowbook_video_in_use(text),
                       public.studio_set_spotlight_video(uuid, text, text, integer, timestamptz),
                       public.studio_spotlight_video_state() from public;
grant execute on function private.glowbook_spotlight_video_current(uuid),
                          private.is_public_glowbook_video(text) to anon, authenticated, service_role;
grant execute on function private.glowbook_video_in_use(text) to authenticated, service_role;
grant execute on function public.studio_set_spotlight_video(uuid, text, text, integer, timestamptz),
                          public.studio_spotlight_video_state() to authenticated;
