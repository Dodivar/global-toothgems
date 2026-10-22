-- =============================================================================
-- 3D Studio Glowbook: where the artist works, on a map (decision 107,
-- owner's request 2026-10-22: "let the artist set where they operate on their
-- Glowbook, so visitors find their place of activity more easily — with an
-- open-source map, no extra usage cost")
-- =============================================================================
-- One place per Glowbook, part of the artist's look (same plan switch,
-- private.glowbook_customization_allowed):
--   * place_mode  'exact' — a salon open to clients: the pin and its address
--                           are public, with directions links;
--                 'area'  — at home, mobile, by appointment: only an area is
--                           public (a circle of about a kilometre), never a
--                           door. The coordinates are ROUNDED HERE, before they
--                           are stored (2 decimals ≈ 1.1 km), so a home
--                           address is never held, even privately.
--   * place_label the address (exact) or the area's name (area), as shown;
--   * place_lat / place_lng WGS 84, 5 decimals (≈ 1 m) for a salon.
-- All four are set together or all null.
-- Live like the city and the bio (decisions 99 (b), 100): no moderation.
-- The map itself is drawn in the browser from OpenFreeMap's free tiles and the
-- artist's search uses OpenStreetMap's Nominatim: nothing here calls out.
-- =============================================================================

alter table public.studio_showcases
  add column place_mode  text check (place_mode in ('exact', 'area')),
  add column place_label text check (place_label = btrim(place_label) and char_length(place_label) between 2 and 120),
  add column place_lat   numeric(7, 5) check (place_lat between -90 and 90),
  add column place_lng   numeric(8, 5) check (place_lng between -180 and 180),
  add constraint studio_showcases_place_complete check (
    (place_mode is null and place_label is null and place_lat is null and place_lng is null)
    or (place_mode is not null and place_label is not null and place_lat is not null and place_lng is not null)
  ),
  -- An area is never more precise than ~1 km, whoever writes the row.
  add constraint studio_showcases_place_area_rounded check (
    place_mode is distinct from 'area' or (place_lat = round(place_lat, 2) and place_lng = round(place_lng, 2))
  );

comment on column public.studio_showcases.place_mode is
  'Glowbook place (decision 107): exact = a salon whose address is public; area = only an area (~1 km), coordinates rounded on save.';

-- -----------------------------------------------------------------------------
-- 1. Members: the place is saved with the look (key "place": an object or null)
-- -----------------------------------------------------------------------------
-- Same body as 20261019135003, plus the "place" key:
--   {"mode": "exact" | "area", "label": text, "lat": number, "lng": number} or null (removes it).
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
        if not private.glowbook_link_valid(v_value) then
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
         place_mode = v_row.place_mode, place_label = v_row.place_label,
         place_lat = v_row.place_lat, place_lng = v_row.place_lng,
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
  'Glowbook look (decisions 100, 107): colour, background, layout, city, place and spotlight are live; new pictures and links wait for a moderator in pending_changes; removing one is immediate.';

-- -----------------------------------------------------------------------------
-- 2. The public page carries the place, inside the look (plan switch)
-- -----------------------------------------------------------------------------
-- Same body as 20261021174016, plus look.place.
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
     and private.studio_user_has_access(s.user_id);
$$;
