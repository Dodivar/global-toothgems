-- Glowbook: no way out to contact the artist elsewhere (decision 146, owner's
-- request 2026-11-15). Since bookings are taken on the platform (decision 144),
-- the page no longer carries a booking link, a website, a TikTok account or
-- the Instagram account: a client books here, with a comment and a creation.
--
-- * the three link columns are emptied and must stay empty (CHECK); they are
--   kept rather than dropped, so the change can be reversed;
-- * studio_save_showcase_look() refuses a value for them (null / '' still
--   accepted, so an older screen sending a removal does not fail) and no longer
--   proposes them for moderation; pending proposals are dropped;
-- * apply_glowbook_changes() only promotes pictures;
-- * studio_public_showcase() no longer returns the links nor the Instagram
--   account (still stored: staff read it in /admin/glowbook to check who the
--   artist is).

update public.studio_showcases
   set booking_url = null,
       website_url = null,
       tiktok = null
 where booking_url is not null or website_url is not null or tiktok is not null;

update public.studio_showcases
   set pending_changes = nullif(pending_changes - array['booking_url', 'website_url', 'tiktok'], '{}'::jsonb)
 where pending_changes ?| array['booking_url', 'website_url', 'tiktok'];

update public.studio_showcases
   set changes_submitted_at = null
 where pending_changes is null and changes_submitted_at is not null;

alter table public.studio_showcases
  add constraint studio_showcases_no_external_links
  check (booking_url is null and website_url is null and tiktok is null);

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
         pending_changes = null, changes_submitted_at = null, changes_review_note = null
   where s.user_id = p_user and s.pending_changes is not null;
$$;

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
  v_place   jsonb;
  v_lat     numeric;
  v_lng     numeric;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_customization_allowed(v_user) then
    raise exception 'studio_save_showcase_look: Studio access required' using errcode = '42501';
  end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' then
    raise exception 'studio_save_showcase_look: invalid look' using errcode = '22023';
  end if;
  -- No external links any more (decision 146): a removal is accepted, a value is not.
  foreach v_key in array array['booking_url', 'website_url', 'tiktok'] loop
    if nullif(btrim(coalesce(p_look ->> v_key, '')), '') is not null then
      raise exception 'studio_save_showcase_look: external links are not allowed' using errcode = '22023';
    end if;
  end loop;
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

  -- The place (decision 107): live, all or nothing, an area rounded to ~1 km.
  if p_look ? 'place' then
    v_place := p_look -> 'place';
    if v_place is null or jsonb_typeof(v_place) = 'null' then
      v_row.place_mode := null; v_row.place_label := null; v_row.place_lat := null; v_row.place_lng := null;
    else
      if jsonb_typeof(v_place) <> 'object'
         or coalesce(v_place ->> 'mode', '') not in ('exact', 'area')
         or jsonb_typeof(v_place -> 'lat') is distinct from 'number'
         or jsonb_typeof(v_place -> 'lng') is distinct from 'number' then
        raise exception 'studio_save_showcase_look: invalid place' using errcode = '22023';
      end if;
      v_lat := (v_place ->> 'lat')::numeric;
      v_lng := (v_place ->> 'lng')::numeric;
      if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        raise exception 'studio_save_showcase_look: invalid place' using errcode = '22023';
      end if;
      v_row.place_mode := v_place ->> 'mode';
      v_row.place_label := nullif(btrim(coalesce(v_place ->> 'label', '')), '');
      if v_row.place_label is null or char_length(v_row.place_label) not between 2 and 120 then
        raise exception 'studio_save_showcase_look: invalid place' using errcode = '22023';
      end if;
      v_row.place_lat := round(v_lat, case v_row.place_mode when 'area' then 2 else 5 end);
      v_row.place_lng := round(v_lng, case v_row.place_mode when 'area' then 2 else 5 end);
    end if;
  end if;

  -- Pictures: removed at once, or proposed.
  v_pending := coalesce(v_row.pending_changes, '{}'::jsonb) - array['booking_url', 'website_url', 'tiktok'];
  foreach v_key in array array['avatar_path', 'banner_path'] loop
    continue when not p_look ? v_key;
    v_value := nullif(btrim(coalesce(p_look ->> v_key, '')), '');
    v_current := case v_key when 'avatar_path' then v_row.avatar_path else v_row.banner_path end;
    if v_value is null then
      v_pending := v_pending - v_key;
      if v_key = 'avatar_path' then v_row.avatar_path := null; else v_row.banner_path := null; end if;
    elsif v_value is not distinct from v_current then
      v_pending := v_pending - v_key;
    else
      if v_value not like v_user::text || '/%' or not exists (
        select 1 from storage.objects o where o.bucket_id = 'glowbook-media' and o.name = v_value
      ) then
        raise exception 'studio_save_showcase_look: unknown picture' using errcode = '22023';
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
         place_mode = v_row.place_mode, place_label = v_row.place_label,
         place_lat = v_row.place_lat, place_lng = v_row.place_lng,
         avatar_path = v_row.avatar_path, banner_path = v_row.banner_path,
         pending_changes = v_row.pending_changes, changes_submitted_at = v_row.changes_submitted_at,
         changes_review_note = v_row.changes_review_note
   where s.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

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
           'location', s.location,
           'look', case when private.glowbook_customization_allowed(s.user_id) then jsonb_build_object(
             'accent', s.accent, 'background', s.background, 'layout', s.layout,
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path,
             -- Where the artist works (decision 107); an area is already rounded.
             'place', case when s.place_mode is not null then jsonb_build_object(
               'mode', s.place_mode, 'label', s.place_label, 'lat', s.place_lat, 'lng', s.place_lng) end,
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
     and private.glowbook_allowed(s.user_id);
$$;
