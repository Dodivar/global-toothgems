-- Decision 153 (owner's request, 2026-11-16): the Artist plan gets the Glowbook
-- for visibility, but not what takes clients' appointments.
--
--   * The Glowbook (the page, its creations, moderation, place, sections,
--     spotlight video, QR code and poster): Artist and Atelier
--     (`private.glowbook_allowed()` — every page-side caller follows).
--   * Online bookings, the artist's calendar (hours, time off, feed, import)
--     and the "Find an artist" directory: Atelier only, through the new
--     `private.glowbook_booking_allowed()`.
--   * Artist keeps 30 creations and 10 Gem Groups (was 150 / 30). Saves already
--     above the new numbers stay; only new ones are refused (insert trigger).
--   * The AI smile try-on stays Atelier (`private.studio_try_on_allowed()`,
--     unchanged).
--
-- The Essential price (4,90 €) is a Stripe Price + `studio_plan_prices` row set
-- per environment by `studio-billing-setup`, never by a migration.

-- -----------------------------------------------------------------------------
-- 1. The saved-content limits
-- -----------------------------------------------------------------------------
create or replace function private.studio_plan_limit(p_tier text, p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'essential' then case p_kind when 'creations' then 15 when 'gem_groups' then 3 end
    when 'artist'    then case p_kind when 'creations' then 30 when 'gem_groups' then 10 end
  end;
$$;

comment on function private.studio_plan_limit(text, text) is
  '3D Studio (decisions 113, 153): how many creations / gem_groups a plan tier may hold — essential 15 / 3, artist 30 / 10; null = unlimited (atelier) or no tier. Mirrored for display in webapp/src/data/studio.ts.';

-- -----------------------------------------------------------------------------
-- 2. The Glowbook: Artist and Atelier
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier(p_user) in ('artist', 'atelier'), false);
$$;

comment on function private.glowbook_allowed(uuid) is
  'Glowbook (decisions 113, 153): whether this member may run a Glowbook and whether it is public — the Artist and Atelier tiers (subscription, grant or active staff). Bookings, the calendar and the directory are private.glowbook_booking_allowed().';

-- -----------------------------------------------------------------------------
-- 3. Bookings, calendar, directory: Atelier only
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_booking_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier(p_user) = 'atelier', false);
$$;

comment on function private.glowbook_booking_allowed(uuid) is
  'Glowbook (decision 153): whether this member''s plan takes online bookings, runs the artist''s calendar (hours, time off, feed, import) and appears in the artist directory — the Atelier tier only (Atelier subscription or grant, or active staff).';

revoke all on function private.glowbook_booking_allowed(uuid) from public;
grant execute on function private.glowbook_booking_allowed(uuid) to service_role;

-- Whether this artist's page takes bookings now.
create or replace function private.glowbook_booking_open(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select w.enabled from private.glowbook_booking_switch w where w.id), false)
     and exists (select 1
                   from public.glowbook_booking_settings b
                   join public.studio_showcases s on s.user_id = b.user_id
                  where b.user_id = p_user
                    and b.enabled
                    and s.status = 'approved')
     and private.studio_user_has_access(p_user)
     and private.glowbook_booking_allowed(p_user);
$$;

-- The artist's own calendar writes (hours, time off, import address).
create or replace function private.glowbook_require_artist()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.has_studio_access() or not private.glowbook_booking_allowed(v_uid)
     or not exists (select 1 from public.studio_showcases s where s.user_id = v_uid) then
    raise exception 'glowbook_booking: not_allowed' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke all on function private.glowbook_require_artist() from public;

-- A new private calendar link: the calendar's plan (an existing link keeps
-- serving the appointments already booked, like the calendar itself).
create or replace function public.glowbook_create_calendar_feed()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.glowbook_require_artist();
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.glowbook_booking_settings (user_id, feed_token_hash, feed_created_at)
  values (v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'), now())
  on conflict (user_id) do update
     set feed_token_hash = excluded.feed_token_hash, feed_created_at = excluded.feed_created_at;
  return v_token;
end;
$$;

-- Calendars to read: only artists whose plan still runs the calendar.
create or replace function public.glowbook_calendar_import_targets(p_limit integer default 20)
returns table (user_id uuid, url text, timezone text, horizon_days integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.user_id, b.import_url, b.timezone, b.horizon_days
    from public.glowbook_booking_settings b
   where b.import_url is not null
     and private.glowbook_booking_allowed(b.user_id)
     and private.studio_user_has_access(b.user_id)
   order by b.import_checked_at nulls first
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- The directory lists Atelier artists only (the switch stays the artist's: on
-- without the plan it shows nothing until the plan is back, as before).
create or replace function public.glowbook_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.entry order by x.sort_name, x.handle), '[]'::jsonb)
    from (
      select s.handle,
             lower(s.display_name) as sort_name,
             jsonb_build_object(
               'handle', s.handle,
               'display_name', s.display_name,
               'bio', s.bio,
               'location', s.location,
               'avatar_path', s.avatar_path,
               'place', jsonb_build_object('mode', s.place_mode, 'label', s.place_label,
                                           'lat', s.place_lat, 'lng', s.place_lng),
               'certified', s.show_certification
                            and jsonb_array_length(private.glowbook_certification(s.user_id)) > 0,
               'creation_count', (select count(*) from public.studio_showcase_items i
                                   where i.user_id = s.user_id and i.status = 'approved'),
               -- The spotlight's render, else the first approved creation's.
               'cover_path', coalesce(
                 (select c.thumbnail_path
                    from public.studio_showcase_items i
                    join public.creations c on c.id = i.creation_id
                   where i.id = s.featured_item_id and i.status = 'approved' and c.thumbnail_path is not null),
                 (select c.thumbnail_path
                    from public.studio_showcase_items i
                    join public.creations c on c.id = i.creation_id
                   where i.user_id = s.user_id and i.status = 'approved' and c.thumbnail_path is not null
                   order by i.position, i.created_at
                   limit 1))
             ) as entry
        from public.studio_showcases s
       where s.status = 'approved'
         and s.in_directory
         and s.place_mode is not null
         and exists (select 1 from public.studio_showcase_items i
                      where i.user_id = s.user_id and i.status = 'approved')
         and private.glowbook_booking_allowed(s.user_id)
       order by lower(s.display_name), s.handle
       limit 1000
    ) x;
$$;

comment on function public.glowbook_directory() is
  'Artist directory (decisions 145, 153): the artists who opted in, whose Glowbook is public (approved) with a place and an approved creation, on the Atelier plan — only what their page already shows.';

-- -----------------------------------------------------------------------------
-- 4. The state the screens read: the Glowbook and the bookings apart
-- -----------------------------------------------------------------------------
-- Security definer since decision 153: the two plan helpers are not callable by
-- members; the function only ever reads the caller's own state (auth.uid()).
create or replace function public.studio_access_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'studio_access_state: sign-in required' using errcode = '42501';
  end if;
  return private.studio_access_json(v_uid)
      || jsonb_build_object('glowbook', private.glowbook_allowed(v_uid),
                            'bookings', private.glowbook_booking_allowed(v_uid));
end;
$$;

revoke all on function public.studio_access_state() from public, anon;
grant execute on function public.studio_access_state() to authenticated, service_role;
