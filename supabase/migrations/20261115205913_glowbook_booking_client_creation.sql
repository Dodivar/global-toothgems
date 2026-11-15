-- Decision 148: a member books an artist with one of their own Studio creations.
--
-- A booking had two kinds of design: one of the artist's Glowbook creations
-- ('creation') or a custom idea described in the comment ('custom'). A third
-- kind, 'client_creation', joins a creation the member saved in the 3D
-- Studio, whatever their plan: the artist sees exactly what the client wants.
--
-- * The booking keeps a reference to the client's creation (no copy), and its
--   name as a snapshot for the e-mails and the calendar feed. Deleting the
--   creation (or the account) leaves the booking, without the design.
-- * Only the booked artist reads it, read-only, through
--   glowbook_booking_creation(): while the booking exists (purged 12 months
--   after the hour) and is not cancelled, and never once the client erased
--   their data. The client reads it too. No public link is created, so the
--   share-link plan rule (decision 133) is untouched.
-- * glowbook_book_slot() takes the creation id (it must belong to the client;
--   a Glowbook creation and a client creation are exclusive). The new
--   argument has a default, so a caller that does not send it still works.

alter table public.glowbook_bookings
  add column client_creation_id uuid references public.creations (id) on delete set null;

create index glowbook_bookings_client_creation_idx on public.glowbook_bookings (client_creation_id)
  where client_creation_id is not null;

alter table public.glowbook_bookings drop constraint glowbook_bookings_design_kind_check;
alter table public.glowbook_bookings add constraint glowbook_bookings_design_kind_check
  check (design_kind in ('creation', 'custom', 'client_creation'));

-- A comment is required for a custom idea only: a joined creation speaks for itself.
alter table public.glowbook_bookings drop constraint glowbook_bookings_check;
alter table public.glowbook_bookings add constraint glowbook_bookings_check
  check (design_kind in ('creation', 'client_creation') or client_erased or char_length(btrim(coalesce(comment, ''))) >= 1);

-- ---------------------------------------------------------------------------
-- Booking: the client's creation as a third kind of design.
-- ---------------------------------------------------------------------------
drop function public.glowbook_book_slot(uuid, text, timestamptz, uuid, text, text, text, text);

create function public.glowbook_book_slot(
  p_client     uuid,
  p_handle     text,
  p_starts_at  timestamptz,
  p_item_id    uuid,
  p_name       text,
  p_phone      text,
  p_comment    text,
  p_locale     text,
  p_client_creation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     auth.users;
  v_artist   uuid;
  v_set      public.glowbook_booking_settings;
  v_local    date;
  v_name     text := btrim(coalesce(p_name, ''));
  v_phone    text := btrim(coalesce(p_phone, ''));
  v_comment  text := nullif(btrim(coalesce(p_comment, '')), '');
  v_creation text;
  v_kind     text;
  v_id       uuid;
begin
  if p_client is null or p_starts_at is null or p_handle is null
     or char_length(v_name) not between 1 and 120
     or v_phone !~ '^\+?[0-9 ().-]{6,24}$'
     or char_length(coalesce(v_comment, '')) > 1000
     or (p_item_id is not null and p_client_creation_id is not null) then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;

  select * into v_user from auth.users u where u.id = p_client;
  if v_user.id is null or v_user.email is null or v_user.email_confirmed_at is null
     or coalesce(v_user.is_anonymous, false) then
    raise exception 'glowbook_booking: email_unconfirmed' using errcode = '42501';
  end if;

  select s.user_id into v_artist from public.studio_showcases s where s.handle = lower(btrim(p_handle));
  if v_artist is null or not private.glowbook_booking_open(v_artist) then
    raise exception 'glowbook_booking: closed' using errcode = '23514';
  end if;
  if v_artist = p_client then
    raise exception 'glowbook_booking: own_calendar' using errcode = '23514';
  end if;

  -- One booking at a time per artist and per client (the unique index is the last guard).
  perform pg_advisory_xact_lock(hashtextextended('glowbook_booking:' || v_artist::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('glowbook_client:' || p_client::text, 0));

  if exists (select 1 from public.glowbook_client_blocks b where b.artist_id = v_artist and b.client_id = p_client) then
    raise exception 'glowbook_booking: blocked' using errcode = '23514';
  end if;
  if private.glowbook_client_banned_until(p_client) is not null then
    raise exception 'glowbook_booking: banned' using errcode = '23514';
  end if;
  if exists (select 1 from public.glowbook_bookings k
              where k.client_id = p_client and k.artist_id = v_artist and k.status = 'booked' and k.starts_at > now()) then
    raise exception 'glowbook_booking: limit_artist' using errcode = '23514';
  end if;
  if (select count(*) from public.glowbook_bookings k
       where k.client_id = p_client and k.status = 'booked' and k.starts_at > now()) >= 3 then
    raise exception 'glowbook_booking: limit_total' using errcode = '23514';
  end if;
  if (select count(*) from public.glowbook_bookings k
       where k.client_id = p_client and k.created_at > now() - interval '1 day') >= 5 then
    raise exception 'glowbook_booking: limit_daily' using errcode = '23514';
  end if;

  select * into v_set from public.glowbook_booking_settings where user_id = v_artist;
  v_local := (p_starts_at at time zone v_set.timezone)::date;
  if not exists (
    select 1 from private.glowbook_calendar_hours(v_artist, v_local, v_local) h
     where h.starts_at = p_starts_at
       and (h.weekly or h.override = 'open')
       and h.override is distinct from 'blocked'
       and not private.glowbook_day_closed(v_artist, h.local_day)
       and h.starts_at >= now() + make_interval(hours => v_set.min_notice_hours)
       and h.starts_at < now() + make_interval(days => v_set.horizon_days)) then
    raise exception 'glowbook_booking: slot_unavailable' using errcode = '23514';
  end if;
  if exists (select 1 from public.glowbook_bookings k
              where k.artist_id = v_artist and k.starts_at = p_starts_at and k.status = 'booked') then
    raise exception 'glowbook_booking: slot_taken' using errcode = '23514';
  end if;

  if p_item_id is not null then
    select c.name into v_creation
      from public.studio_showcase_items i
      join public.creations c on c.id = i.creation_id
     where i.id = p_item_id and i.user_id = v_artist and i.status = 'approved';
    if v_creation is null then
      raise exception 'glowbook_booking: item_unavailable' using errcode = '23514';
    end if;
    v_kind := 'creation';
  elsif p_client_creation_id is not null then
    -- The client's own creation only: never someone else's.
    select coalesce(nullif(btrim(c.name), ''), '—') into v_creation
      from public.creations c
     where c.id = p_client_creation_id and c.user_id = p_client;
    if v_creation is null then
      raise exception 'glowbook_booking: creation_unavailable' using errcode = '23514';
    end if;
    v_kind := 'client_creation';
  elsif v_comment is null then
    raise exception 'glowbook_booking: comment_required' using errcode = '23514';
  else
    v_kind := 'custom';
  end if;

  begin
    insert into public.glowbook_bookings (artist_id, client_id, starts_at, timezone, showcase_item_id, client_creation_id,
                                          design_kind, creation_name, client_name, client_email, client_phone, comment, locale)
    values (v_artist, p_client, p_starts_at, v_set.timezone, p_item_id, p_client_creation_id,
            v_kind, left(v_creation, 120), v_name, lower(v_user.email), v_phone, v_comment,
            case when p_locale = 'en' then 'en' else 'fr' end)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'glowbook_booking: slot_taken' using errcode = '23514';
  end;

  return jsonb_build_object('id', v_id, 'starts_at', p_starts_at, 'ends_at', p_starts_at + interval '1 hour',
                            'timezone', v_set.timezone);
end;
$$;

revoke all on function public.glowbook_book_slot(uuid, text, timestamptz, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.glowbook_book_slot(uuid, text, timestamptz, uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The client's list: their joined creation, with its own picture.
-- ---------------------------------------------------------------------------
create or replace function public.my_glowbook_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'banned_until', private.glowbook_client_banned_until(auth.uid()),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'starts_at', k.starts_at, 'ends_at', k.starts_at + interval '1 hour', 'timezone', k.timezone,
               'status', k.status, 'late_cancel', k.late_cancel, 'design_kind', k.design_kind,
               'creation_name', k.creation_name, 'comment', k.comment, 'phone', k.client_phone,
               'cancel_reason', k.cancel_reason, 'cancelled_at', k.cancelled_at, 'created_at', k.created_at,
               'artist_name', s.display_name, 'artist_handle', case when s.status = 'approved' then s.handle end,
               'item_id', case when i.status = 'approved' and s.status = 'approved' then k.showcase_item_id end,
               'item_live', coalesce(i.status = 'approved' and s.status = 'approved', false),
               'thumbnail_path', case when k.design_kind = 'client_creation' then own.thumbnail_path
                                      when i.status = 'approved' and s.status = 'approved' then c.thumbnail_path end,
               'client_creation', own.id is not null,
               'place', case when s.place_mode is not null then jsonb_build_object(
                          'mode', s.place_mode, 'label', s.place_label, 'lat', s.place_lat, 'lng', s.place_lng) end)
             order by k.starts_at desc)
        from public.glowbook_bookings k
        left join public.studio_showcases s on s.user_id = k.artist_id
        left join public.studio_showcase_items i on i.id = k.showcase_item_id and i.user_id = k.artist_id
        left join public.creations c on c.id = i.creation_id and c.user_id = k.artist_id
        left join public.creations own on own.id = k.client_creation_id and own.user_id = k.client_id
       where k.client_id = auth.uid()), '[]'::jsonb)) end;
$$;

revoke all on function public.my_glowbook_bookings() from public, anon;
grant execute on function public.my_glowbook_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- The artist's calendar: whether the client joined a creation they may open.
-- ---------------------------------------------------------------------------
create or replace function public.glowbook_artist_calendar(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.glowbook_booking_settings;
  v_tz  text;
begin
  if v_uid is null then
    raise exception 'glowbook_booking: sign in first' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  select * into v_set from public.glowbook_booking_settings where user_id = v_uid;
  v_tz := coalesce(v_set.timezone, 'Europe/Paris');
  return jsonb_build_object(
    'page_status', (select s.status from public.studio_showcases s where s.user_id = v_uid),
    'handle', (select s.handle from public.studio_showcases s where s.user_id = v_uid),
    'closures', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', c.id, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'note', c.note,
                             'bookings', (select count(*) from public.glowbook_bookings k
                                           where k.artist_id = v_uid and k.status = 'booked' and k.starts_at > now()
                                             and (k.starts_at at time zone v_tz)::date between c.starts_on and c.ends_on))
                           order by c.starts_on, c.ends_on)
                            from public.glowbook_closures c
                           where c.user_id = v_uid and c.ends_on >= (now() at time zone v_tz)::date), '[]'::jsonb),
    'switch_on', coalesce((select w.enabled from private.glowbook_booking_switch w where w.id), false),
    'open', private.glowbook_booking_open(v_uid),
    'settings', case when v_set.user_id is null then null else jsonb_build_object(
      'enabled', v_set.enabled, 'timezone', v_set.timezone,
      'min_notice_hours', v_set.min_notice_hours, 'horizon_days', v_set.horizon_days) end,
    'rules', coalesce((select jsonb_agg(jsonb_build_object('weekday', r.weekday, 'start_hour', r.start_hour, 'end_hour', r.end_hour)
                                        order by r.weekday, r.start_hour)
                         from public.glowbook_availability_rules r where r.user_id = v_uid), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('starts_at', h.starts_at, 'day', h.local_day, 'hour', h.local_hour,
                                                         'weekly', h.weekly, 'override', h.override)
                                        order by h.starts_at)
                         from private.glowbook_calendar_hours(v_uid, p_from, p_to) h
                        where h.weekly or h.override is not null), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', k.id, 'starts_at', k.starts_at, 'ends_at', k.starts_at + interval '1 hour', 'timezone', k.timezone,
                             'status', k.status, 'late_cancel', k.late_cancel, 'client_erased', k.client_erased,
                             'design_kind', k.design_kind, 'creation_name', k.creation_name,
                             'client_name', k.client_name, 'client_email', k.client_email, 'client_phone', k.client_phone,
                             'comment', k.comment, 'cancel_reason', k.cancel_reason, 'cancelled_at', k.cancelled_at,
                             'created_at', k.created_at,
                             'item_id', k.showcase_item_id,
                             'thumbnail_path', c.thumbnail_path,
                             'item_live', coalesce(i.status = 'approved' and s.status = 'approved', false),
                             -- The client's creation, openable read-only (glowbook_booking_creation()).
                             'client_creation', k.client_creation_id is not null and not k.client_erased
                                                and k.status not in ('cancelled_client', 'cancelled_artist'),
                             'client_blocked', exists (select 1 from public.glowbook_client_blocks b
                                                        where b.artist_id = v_uid and b.client_id = k.client_id))
                           order by k.starts_at)
                            from public.glowbook_bookings k
                            left join public.studio_showcase_items i on i.id = k.showcase_item_id and i.user_id = v_uid
                            left join public.creations c on c.id = i.creation_id and c.user_id = v_uid
                            left join public.studio_showcases s on s.user_id = v_uid
                           where k.artist_id = v_uid
                             and k.starts_at >= (p_from::timestamp at time zone coalesce(v_set.timezone, 'Europe/Paris'))
                             and k.starts_at < ((p_to + 1)::timestamp at time zone coalesce(v_set.timezone, 'Europe/Paris'))), '[]'::jsonb),
    -- Coming appointments, whatever the range: the list beside the week.
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'starts_at', k.starts_at)
                                         order by k.starts_at)
                            from public.glowbook_bookings k
                           where k.artist_id = v_uid and k.status = 'booked' and k.starts_at > now()), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'client_name', b.client_name, 'created_at', b.created_at)
                                       order by b.created_at desc)
                          from public.glowbook_client_blocks b where b.artist_id = v_uid), '[]'::jsonb));
end;
$$;

revoke all on function public.glowbook_artist_calendar(date, date) from public, anon;
grant execute on function public.glowbook_artist_calendar(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The joined creation, read-only, for the booked artist and the client only.
-- Same shape as studio_shared_creation (Gem Group links dropped).
-- ---------------------------------------------------------------------------
create or replace function public.glowbook_booking_creation(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'name', c.name,
           'description', c.description,
           'scene_data', case
             when jsonb_typeof(c.scene_data -> 'groups') = 'array' then
               jsonb_set(c.scene_data, '{groups}', (
                 select coalesce(jsonb_agg(case when jsonb_typeof(g) = 'object'
                                                then g || jsonb_build_object('gemGroupId', null)
                                                else g end), '[]'::jsonb)
                   from jsonb_array_elements(c.scene_data -> 'groups') as g))
             else c.scene_data
           end,
           'updated_at', c.updated_at,
           'starts_at', k.starts_at,
           'timezone', k.timezone,
           'client_name', k.client_name,
           'artist_name', s.display_name,
           'viewer', case when k.artist_id = auth.uid() then 'artist' else 'client' end)
    from public.glowbook_bookings k
    join public.creations c on c.id = k.client_creation_id and c.user_id = k.client_id
    left join public.studio_showcases s on s.user_id = k.artist_id
   where k.id = p_booking
     and auth.uid() is not null
     and not k.client_erased
     and (k.client_id = auth.uid()
          or (k.artist_id = auth.uid() and k.status not in ('cancelled_client', 'cancelled_artist')));
$$;

revoke all on function public.glowbook_booking_creation(uuid) from public, anon;
grant execute on function public.glowbook_booking_creation(uuid) to authenticated;
