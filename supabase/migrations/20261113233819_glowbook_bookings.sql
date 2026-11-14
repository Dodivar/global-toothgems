-- =============================================================================
-- Glowbook booking calendar (decision 144, owner's go-ahead 2026-11-14)
-- =============================================================================
-- A signed-in member books a one-hour slot on an artist's public Glowbook
-- page. The slot is locked at once; an artist who does not want it cancels it
-- (with a reason the client reads). No payment, no deposit.
--
--   artist (Atelier, page approved)
--     glowbook_save_booking_settings(enabled, tz, notice, horizon, rules)
--     glowbook_set_calendar_hours(starts[], blocked|open|default)
--     glowbook_artist_calendar(from, to)        settings, hours, bookings, blocks
--     glowbook_cancel_booking(id, reason)       before the slot, reason required
--     glowbook_mark_booking(id, honoured|no_show) after the slot (60 days)
--     glowbook_block_client(booking) / glowbook_unblock_client(block)
--   anyone
--     glowbook_booking_info(handle)             open? time zone, notice, horizon
--     glowbook_booking_slots(handle, from, to)  free hours only (free/busy)
--   member (client)
--     Edge Function glowbook-booking (JWT + Turnstile + IP limit)
--       → glowbook_book_slot(client, ...)       service role; every rule here
--     my_glowbook_bookings()                    their bookings + any ban
--     glowbook_cancel_booking(id)               free until 24 h before, then "late"
--   e-mails
--     pending_glowbook_booking_emails()         new (artist), confirmed (client,
--                                               with .ics), cancellations both
--                                               ways, reminder the day before
--
-- Slots are whole hours of the artist's own time zone (Europe/Paris by
-- default), computed here from weekly hours + per-hour overrides; one booking
-- per hour is guaranteed by a partial unique index (no btree_gist needed while
-- every booking lasts one hour).
--
-- Abuse without a deposit (decision 144, owner-approved 2026-11-14): confirmed
-- e-mail account, 1 upcoming booking per client and artist, 3 in all, 5 made a
-- day; an artist may block a client; 2 no-shows or late cancellations within 12
-- months block bookings on every Glowbook for 3 months (written into the terms
-- of use; to confirm with a lawyer).
--
-- Personal data: tables reached only through these functions (no grants).
-- Staff read nothing. The artist sees what the client typed (name, e-mail,
-- phone, comment), never the account. Kept 12 months after the slot
-- (private.purge_glowbook_bookings, nightly). A client's erasure cancels their
-- upcoming bookings and clears their details; an artist with upcoming bookings
-- must cancel them before deleting their account.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Global switch (one row; SQL only, like the reminder switches)
-- -----------------------------------------------------------------------------
create table private.glowbook_booking_switch (
  id      boolean primary key default true check (id),
  enabled boolean not null default true
);
insert into private.glowbook_booking_switch (id, enabled) values (true, true);
revoke all on private.glowbook_booking_switch from public, anon, authenticated;

comment on table private.glowbook_booking_switch is
  'Glowbook bookings (decision 144): the platform-wide switch. Off = no page offers booking, no slot can be booked; existing bookings stay.';

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
create table public.glowbook_booking_settings (
  user_id           uuid primary key references public.studio_showcases (user_id) on delete cascade,
  enabled           boolean not null default false,
  timezone          text not null default 'Europe/Paris' check (char_length(timezone) between 1 and 64),
  min_notice_hours  integer not null default 24 check (min_notice_hours between 1 and 336),
  horizon_days      integer not null default 56 check (horizon_days between 7 and 180),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.glowbook_booking_settings is
  'Glowbook bookings (decision 144): an artist''s booking switch, time zone, minimum notice and horizon. Written by glowbook_save_booking_settings() only.';

create table public.glowbook_availability_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.studio_showcases (user_id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),     -- ISO: 1 = Monday
  start_hour  smallint not null check (start_hour between 0 and 23),
  end_hour    smallint not null check (end_hour between 1 and 24),
  created_at  timestamptz not null default now(),
  check (start_hour < end_hour)
);

create index glowbook_availability_rules_user_idx on public.glowbook_availability_rules (user_id, weekday);

comment on table public.glowbook_availability_rules is
  'Glowbook bookings (decision 144): weekly opening hours, local hours of the artist''s time zone, [start_hour, end_hour).';

create table public.glowbook_calendar_overrides (
  user_id     uuid not null references public.studio_showcases (user_id) on delete cascade,
  starts_at   timestamptz not null,
  kind        text not null check (kind in ('blocked', 'open')),
  source      text not null default 'manual' check (source in ('manual', 'import')),
  created_at  timestamptz not null default now(),
  primary key (user_id, starts_at)
);

comment on table public.glowbook_calendar_overrides is
  'Glowbook bookings (decision 144): one hour closed (blocked) or opened outside the weekly hours. starts_at is a whole local hour.';

create table public.glowbook_bookings (
  id                uuid primary key default gen_random_uuid(),
  artist_id         uuid not null references public.profiles (id) on delete cascade,
  -- Null once the client's account is erased (their upcoming bookings are cancelled first).
  client_id         uuid references public.profiles (id) on delete set null,
  starts_at         timestamptz not null,
  timezone          text not null,
  status            text not null default 'booked'
                      check (status in ('booked', 'cancelled_client', 'cancelled_artist', 'honoured', 'no_show')),
  late_cancel       boolean not null default false,
  client_erased     boolean not null default false,
  showcase_item_id  uuid references public.studio_showcase_items (id) on delete set null,
  design_kind       text not null check (design_kind in ('creation', 'custom')),
  creation_name     text check (char_length(creation_name) <= 120),
  client_name       text check (char_length(client_name) between 1 and 120),
  client_email      text check (client_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  client_phone      text check (client_phone ~ '^\+?[0-9 ().-]{6,24}$'),
  comment           text check (char_length(comment) <= 1000),
  locale            text not null default 'fr' check (locale in ('fr', 'en')),
  cancel_reason     text check (char_length(cancel_reason) <= 500),
  cancelled_at      timestamptz,
  marked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (design_kind = 'creation' or client_erased or char_length(btrim(coalesce(comment, ''))) >= 1),
  check (status <> 'cancelled_artist' or char_length(btrim(coalesce(cancel_reason, ''))) >= 3),
  check (client_erased or (client_name is not null and client_email is not null and client_phone is not null))
);

comment on table public.glowbook_bookings is
  'Glowbook bookings (decision 144): one-hour appointments booked by a signed-in member on an artist''s Glowbook. '
  'Locked at booking; cancelled by either side; reached through the glowbook_* functions only. Kept 12 months after the slot.';

-- The lock: one live booking per artist and hour.
create unique index glowbook_bookings_slot_uniq on public.glowbook_bookings (artist_id, starts_at) where status = 'booked';
create index glowbook_bookings_artist_idx on public.glowbook_bookings (artist_id, starts_at);
create index glowbook_bookings_client_idx on public.glowbook_bookings (client_id, starts_at);
create index glowbook_bookings_item_idx on public.glowbook_bookings (showcase_item_id);
create index glowbook_bookings_starts_idx on public.glowbook_bookings (starts_at);

create table public.glowbook_client_blocks (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references public.profiles (id) on delete cascade,
  client_id    uuid not null references public.profiles (id) on delete cascade,
  client_name  text not null check (char_length(client_name) between 1 and 120),
  created_at   timestamptz not null default now(),
  unique (artist_id, client_id)
);

create index glowbook_client_blocks_client_idx on public.glowbook_client_blocks (client_id);

comment on table public.glowbook_client_blocks is
  'Glowbook bookings (decision 144): clients an artist no longer accepts on their calendar (name as booked, never the account).';

create trigger glowbook_booking_settings_touch before update on public.glowbook_booking_settings
  for each row execute function private.studio_touch_updated_at();
create trigger glowbook_bookings_touch before update on public.glowbook_bookings
  for each row execute function private.studio_touch_updated_at();

alter table public.glowbook_booking_settings enable row level security;
alter table public.glowbook_availability_rules enable row level security;
alter table public.glowbook_calendar_overrides enable row level security;
alter table public.glowbook_bookings enable row level security;
alter table public.glowbook_client_blocks enable row level security;

-- Deny by default: no grant, no policy; everything goes through the functions below.
revoke all on public.glowbook_booking_settings, public.glowbook_availability_rules, public.glowbook_calendar_overrides,
              public.glowbook_bookings, public.glowbook_client_blocks from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Erasure of a client: their upcoming bookings are cancelled and their
--    details cleared when the profile goes (the foreign key sets client_id
--    to null, which runs this trigger).
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_booking_client_erased()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.client_id is not null and new.client_id is null then
    if new.status = 'booked' and new.starts_at > now() then
      new.status := 'cancelled_client';
      new.cancelled_at := now();
      new.late_cancel := false;
    end if;
    new.client_erased := true;
    new.client_name := null;
    new.client_email := null;
    new.client_phone := null;
    new.comment := null;
  end if;
  return new;
end;
$$;

create trigger glowbook_bookings_client_erased before update of client_id on public.glowbook_bookings
  for each row execute function private.glowbook_booking_client_erased();

-- -----------------------------------------------------------------------------
-- 4. Helpers
-- -----------------------------------------------------------------------------

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
     and private.glowbook_allowed(p_user);
$$;

-- Every whole local hour of [p_from, p_to] (dates in the artist's time zone)
-- with what decides it: the weekly hours, an override, a live booking.
create or replace function private.glowbook_calendar_hours(p_user uuid, p_from date, p_to date)
returns table (starts_at timestamptz, local_day date, local_hour integer, weekly boolean, override text, booking_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (
    select coalesce((select b.timezone from public.glowbook_booking_settings b where b.user_id = p_user), 'Europe/Paris') as name
  ), grid as (
    -- A local hour that does not exist (spring forward) lands on the next one: keep the first.
    select distinct on (h.at) h.at, h.day, h.hour
      from (select (d::date + make_interval(hours => x)) at time zone tz.name as at, d::date as day, x as hour
              from tz, generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d, generate_series(0, 23) x) h
     order by h.at, h.day, h.hour
  )
  select g.at, g.day, g.hour,
         exists (select 1 from public.glowbook_availability_rules r
                  where r.user_id = p_user
                    and r.weekday = extract(isodow from g.day)
                    and g.hour >= r.start_hour and g.hour < r.end_hour),
         (select o.kind from public.glowbook_calendar_overrides o where o.user_id = p_user and o.starts_at = g.at),
         (select k.id from public.glowbook_bookings k where k.artist_id = p_user and k.starts_at = g.at and k.status = 'booked')
    from grid g
   where p_from is not null and p_to is not null and p_to >= p_from and p_to - p_from <= 62;
$$;

-- When a client may book again: 2 strikes (no-show, late cancellation) within
-- 12 months block bookings for 3 months from the second one. Null = free.
create or replace function private.glowbook_client_banned_until(p_client uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with strikes as (
    select coalesce(case when k.status = 'no_show' then k.marked_at else k.cancelled_at end, k.updated_at) as at
      from public.glowbook_bookings k
     where k.client_id = p_client
       and (k.status = 'no_show' or (k.status = 'cancelled_client' and k.late_cancel))
  )
  select max(s.at + interval '3 months')
    from strikes s
   where (select count(*) from strikes p where p.at > s.at - interval '12 months' and p.at <= s.at) >= 2
  having max(s.at + interval '3 months') > now();
$$;

revoke all on function private.glowbook_booking_open(uuid), private.glowbook_calendar_hours(uuid, date, date),
                       private.glowbook_client_banned_until(uuid), private.glowbook_booking_client_erased() from public;

-- -----------------------------------------------------------------------------
-- 5. Public: is the page bookable, and its free hours
-- -----------------------------------------------------------------------------
create or replace function public.glowbook_booking_info(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('timezone', b.timezone, 'min_notice_hours', b.min_notice_hours, 'horizon_days', b.horizon_days)
    from public.studio_showcases s
    join public.glowbook_booking_settings b on b.user_id = s.user_id
   where s.handle = lower(btrim(p_handle))
     and private.glowbook_booking_open(s.user_id);
$$;

create or replace function public.glowbook_booking_slots(p_handle text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_set   public.glowbook_booking_settings;
  v_today date;
  v_from  date;
  v_to    date;
begin
  select s.user_id into v_user from public.studio_showcases s where s.handle = lower(btrim(p_handle));
  if v_user is null or not private.glowbook_booking_open(v_user) then
    return null;
  end if;
  select * into v_set from public.glowbook_booking_settings where user_id = v_user;
  v_today := (now() at time zone v_set.timezone)::date;
  v_from := greatest(coalesce(p_from, v_today), v_today);
  v_to := least(coalesce(p_to, v_from + 13), v_from + 41, v_today + v_set.horizon_days);
  return jsonb_build_object(
    'timezone', v_set.timezone,
    'min_notice_hours', v_set.min_notice_hours,
    'horizon_days', v_set.horizon_days,
    'from', v_from,
    'to', v_to,
    'slots', coalesce((
      select jsonb_agg(h.starts_at order by h.starts_at)
        from private.glowbook_calendar_hours(v_user, v_from, greatest(v_to, v_from)) h
       where v_to >= v_from
         and (h.weekly or h.override = 'open')
         and h.override is distinct from 'blocked'
         and h.booking_id is null
         and h.starts_at >= now() + make_interval(hours => v_set.min_notice_hours)
         and h.starts_at < now() + make_interval(days => v_set.horizon_days)
    ), '[]'::jsonb));
end;
$$;

grant execute on function public.glowbook_booking_info(text), public.glowbook_booking_slots(text, date, date) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Booking (service role: the Edge Function has checked the JWT and the captcha)
-- -----------------------------------------------------------------------------
create or replace function public.glowbook_booking_ip_allowed(p_ip_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.hit_rate_limit('glowbook_booking_ip', p_ip_hash, 20, interval '1 hour');
$$;

revoke all on function public.glowbook_booking_ip_allowed(text) from public, anon, authenticated;
grant execute on function public.glowbook_booking_ip_allowed(text) to service_role;

-- Refusals: 23514 'glowbook_booking: <code>' (closed, own_calendar, slot_unavailable,
-- slot_taken, limit_artist, limit_total, limit_daily, banned, blocked,
-- comment_required, item_unavailable), 42501 'glowbook_booking: email_unconfirmed',
-- 22023 'glowbook_booking: invalid'.
create or replace function public.glowbook_book_slot(
  p_client     uuid,
  p_handle     text,
  p_starts_at  timestamptz,
  p_item_id    uuid,
  p_name       text,
  p_phone      text,
  p_comment    text,
  p_locale     text
)
returns jsonb
language plpgsql
volatile
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
  v_id       uuid;
begin
  if p_client is null or p_starts_at is null or p_handle is null
     or char_length(v_name) not between 1 and 120
     or v_phone !~ '^\+?[0-9 ().-]{6,24}$'
     or char_length(coalesce(v_comment, '')) > 1000 then
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
  elsif v_comment is null then
    raise exception 'glowbook_booking: comment_required' using errcode = '23514';
  end if;

  begin
    insert into public.glowbook_bookings (artist_id, client_id, starts_at, timezone, showcase_item_id, design_kind,
                                          creation_name, client_name, client_email, client_phone, comment, locale)
    values (v_artist, p_client, p_starts_at, v_set.timezone, p_item_id,
            case when p_item_id is null then 'custom' else 'creation' end,
            left(v_creation, 120), v_name, lower(v_user.email), v_phone, v_comment,
            case when p_locale = 'en' then 'en' else 'fr' end)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'glowbook_booking: slot_taken' using errcode = '23514';
  end;

  return jsonb_build_object('id', v_id, 'starts_at', p_starts_at, 'ends_at', p_starts_at + interval '1 hour',
                            'timezone', v_set.timezone);
end;
$$;

revoke all on function public.glowbook_book_slot(uuid, text, timestamptz, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.glowbook_book_slot(uuid, text, timestamptz, uuid, text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 7. The client: their bookings, cancelling
-- -----------------------------------------------------------------------------
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
               'artist_name', s.display_name, 'artist_handle', case when s.status = 'approved' then s.handle end)
             order by k.starts_at desc)
        from public.glowbook_bookings k
        left join public.studio_showcases s on s.user_id = k.artist_id
       where k.client_id = auth.uid()), '[]'::jsonb)) end;
$$;

revoke all on function public.my_glowbook_bookings() from public, anon;
grant execute on function public.my_glowbook_bookings() to authenticated;

-- The client (free until 24 h before, "late" afterwards) or the artist (reason
-- required) cancels a booking before its hour.
create or replace function public.glowbook_cancel_booking(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_row    public.glowbook_bookings;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'glowbook_booking: sign in first' using errcode = '42501';
  end if;
  select * into v_row from public.glowbook_bookings k
   where k.id = p_id and (k.client_id = v_uid or k.artist_id = v_uid)
   for update;
  if v_row.id is null then
    raise exception 'glowbook_booking: not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'booked' or v_row.starts_at <= now() then
    raise exception 'glowbook_booking: not_cancellable' using errcode = '23514';
  end if;

  if v_row.artist_id = v_uid then
    if char_length(coalesce(v_reason, '')) not between 3 and 500 then
      raise exception 'glowbook_booking: reason_required' using errcode = '22023';
    end if;
    update public.glowbook_bookings
       set status = 'cancelled_artist', cancel_reason = v_reason, cancelled_at = now()
     where id = p_id;
    return jsonb_build_object('status', 'cancelled_artist');
  end if;

  update public.glowbook_bookings
     set status = 'cancelled_client', cancelled_at = now(),
         late_cancel = v_row.starts_at < now() + interval '24 hours'
   where id = p_id;
  return jsonb_build_object('status', 'cancelled_client', 'late', v_row.starts_at < now() + interval '24 hours');
end;
$$;

revoke all on function public.glowbook_cancel_booking(uuid, text) from public, anon;
grant execute on function public.glowbook_cancel_booking(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. The artist: settings, hours, calendar, outcome, blocks
-- -----------------------------------------------------------------------------
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
  if v_uid is null or not private.has_studio_access() or not private.glowbook_allowed(v_uid)
     or not exists (select 1 from public.studio_showcases s where s.user_id = v_uid) then
    raise exception 'glowbook_booking: not_allowed' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke all on function private.glowbook_require_artist() from public;

-- p_rules: [{weekday 1..7, start_hour 0..23, end_hour 1..24}], at most 28.
create or replace function public.glowbook_save_booking_settings(
  p_enabled          boolean,
  p_timezone         text,
  p_min_notice_hours integer,
  p_horizon_days     integer,
  p_rules            jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.glowbook_require_artist();
  v_rule jsonb;
begin
  if p_enabled is null or p_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone)
     or p_min_notice_hours is null or p_min_notice_hours not between 1 and 336
     or p_horizon_days is null or p_horizon_days not between 7 and 180
     or jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules) > 28 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  for v_rule in select * from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(v_rule -> 'weekday') is distinct from 'number'
       or jsonb_typeof(v_rule -> 'start_hour') is distinct from 'number'
       or jsonb_typeof(v_rule -> 'end_hour') is distinct from 'number'
       or (v_rule ->> 'weekday')::numeric not in (1, 2, 3, 4, 5, 6, 7)
       or (v_rule ->> 'start_hour')::numeric <> trunc((v_rule ->> 'start_hour')::numeric)
       or (v_rule ->> 'end_hour')::numeric <> trunc((v_rule ->> 'end_hour')::numeric)
       or (v_rule ->> 'start_hour')::numeric not between 0 and 23
       or (v_rule ->> 'end_hour')::numeric not between 1 and 24
       or (v_rule ->> 'start_hour')::numeric >= (v_rule ->> 'end_hour')::numeric then
      raise exception 'glowbook_booking: invalid' using errcode = '22023';
    end if;
  end loop;

  insert into public.glowbook_booking_settings (user_id, enabled, timezone, min_notice_hours, horizon_days)
  values (v_uid, p_enabled, p_timezone, p_min_notice_hours, p_horizon_days)
  on conflict (user_id) do update
     set enabled = excluded.enabled, timezone = excluded.timezone,
         min_notice_hours = excluded.min_notice_hours, horizon_days = excluded.horizon_days;

  delete from public.glowbook_availability_rules where user_id = v_uid;
  insert into public.glowbook_availability_rules (user_id, weekday, start_hour, end_hour)
  select v_uid, (r ->> 'weekday')::smallint, (r ->> 'start_hour')::smallint, (r ->> 'end_hour')::smallint
    from jsonb_array_elements(p_rules) r;
end;
$$;

revoke all on function public.glowbook_save_booking_settings(boolean, text, integer, integer, jsonb) from public, anon;
grant execute on function public.glowbook_save_booking_settings(boolean, text, integer, integer, jsonb) to authenticated;

-- Close (blocked), open, or give back to the weekly hours (default) whole local hours.
create or replace function public.glowbook_set_calendar_hours(p_starts timestamptz[], p_state text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.glowbook_require_artist();
  v_tz   text := coalesce((select b.timezone from public.glowbook_booking_settings b where b.user_id = v_uid), 'Europe/Paris');
  v_at   timestamptz;
  v_n    integer := 0;
begin
  if p_state not in ('blocked', 'open', 'default') or p_starts is null
     or cardinality(p_starts) not between 1 and 24 * 14 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  foreach v_at in array p_starts loop
    if v_at is null
       or extract(minute from v_at at time zone v_tz) <> 0
       or extract(second from v_at at time zone v_tz) <> 0
       or v_at < now() - interval '1 day' or v_at > now() + interval '366 days' then
      raise exception 'glowbook_booking: invalid' using errcode = '22023';
    end if;
  end loop;

  if p_state = 'default' then
    delete from public.glowbook_calendar_overrides o
     where o.user_id = v_uid and o.starts_at = any (p_starts) and o.source = 'manual';
    get diagnostics v_n = row_count;
  else
    insert into public.glowbook_calendar_overrides (user_id, starts_at, kind, source)
    select distinct v_uid, s, p_state, 'manual' from unnest(p_starts) s
    on conflict (user_id, starts_at) do update set kind = excluded.kind, source = 'manual';
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;

revoke all on function public.glowbook_set_calendar_hours(timestamptz[], text) from public, anon;
grant execute on function public.glowbook_set_calendar_hours(timestamptz[], text) to authenticated;

-- The artist's calendar between two local dates (at most 62 days). Readable
-- without the plan, so an artist who left Atelier can still honour or cancel
-- the appointments already booked.
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
begin
  if v_uid is null then
    raise exception 'glowbook_booking: sign in first' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  select * into v_set from public.glowbook_booking_settings where user_id = v_uid;
  return jsonb_build_object(
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
                             'client_blocked', exists (select 1 from public.glowbook_client_blocks b
                                                        where b.artist_id = v_uid and b.client_id = k.client_id))
                           order by k.starts_at)
                            from public.glowbook_bookings k
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

-- After the hour (up to 60 days): honoured or no-show (correctable).
create or replace function public.glowbook_mark_booking(p_id uuid, p_outcome text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.glowbook_bookings;
begin
  if auth.uid() is null then
    raise exception 'glowbook_booking: sign in first' using errcode = '42501';
  end if;
  if p_outcome not in ('honoured', 'no_show') then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  select * into v_row from public.glowbook_bookings k where k.id = p_id and k.artist_id = auth.uid() for update;
  if v_row.id is null then
    raise exception 'glowbook_booking: not_found' using errcode = 'P0002';
  end if;
  if v_row.status not in ('booked', 'honoured', 'no_show') or v_row.starts_at > now()
     or v_row.starts_at < now() - interval '60 days' or v_row.client_erased then
    raise exception 'glowbook_booking: not_markable' using errcode = '23514';
  end if;
  update public.glowbook_bookings set status = p_outcome, marked_at = now() where id = p_id;
end;
$$;

revoke all on function public.glowbook_mark_booking(uuid, text) from public, anon;
grant execute on function public.glowbook_mark_booking(uuid, text) to authenticated;

-- The artist stops accepting the client of one of their bookings (any plan:
-- protecting oneself needs no subscription).
create or replace function public.glowbook_block_client(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.glowbook_bookings;
begin
  if auth.uid() is null then
    raise exception 'glowbook_booking: sign in first' using errcode = '42501';
  end if;
  select * into v_row from public.glowbook_bookings k where k.id = p_booking_id and k.artist_id = auth.uid();
  if v_row.id is null or v_row.client_id is null then
    raise exception 'glowbook_booking: not_found' using errcode = 'P0002';
  end if;
  insert into public.glowbook_client_blocks (artist_id, client_id, client_name)
  values (auth.uid(), v_row.client_id, coalesce(v_row.client_name, '—'))
  on conflict (artist_id, client_id) do nothing;
end;
$$;

create or replace function public.glowbook_unblock_client(p_block_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.glowbook_client_blocks b where b.id = p_block_id and b.artist_id = auth.uid();
$$;

revoke all on function public.glowbook_block_client(uuid), public.glowbook_unblock_client(uuid) from public, anon;
grant execute on function public.glowbook_block_client(uuid), public.glowbook_unblock_client(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. E-mails (send-pending-emails, every 5 minutes; the booking function also
--    sends the first two at once)
--
--   glowbook_booking_new:<id>          artist   a booking (Reply-To: the client)
--   glowbook_booking_confirmed:<id>    client   the confirmation, with .ics
--   glowbook_booking_cancel_client:<id> artist  the client cancelled (or was erased)
--   glowbook_booking_cancel_artist:<id> client  the artist cancelled, with the reason
--   glowbook_booking_reminder:<id>     client   the day before (not for a booking
--                                               made less than 30 hours ahead)
-- -----------------------------------------------------------------------------
create or replace function public.pending_glowbook_booking_emails(p_limit integer default 25, p_only uuid default null)
returns table (
  kind           text,
  event_key      text,
  booking_id     uuid,
  email          text,
  locale         text,
  reply_to       text,
  artist_name    text,
  artist_handle  text,
  client_name    text,
  client_email   text,
  client_phone   text,
  client_erased  boolean,
  starts_at      timestamptz,
  ends_at        timestamptz,
  timezone       text,
  design_kind    text,
  creation_name  text,
  comment        text,
  cancel_reason  text,
  late_cancel    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select k.*,
           coalesce(s.display_name, p.display_name, '') as a_name,
           case when s.status = 'approved' then s.handle end as a_handle,
           lower(u.email) as a_email,
           case when p.preferred_locale = 'en' then 'en' else 'fr' end as a_locale
      from public.glowbook_bookings k
      join auth.users u on u.id = k.artist_id
      join public.profiles p on p.id = k.artist_id
      left join public.studio_showcases s on s.user_id = k.artist_id
     where p_only is null or k.id = p_only
  ), mails as (
    select 'new' as kind, 'glowbook_booking_new:' || b.id as event_key, b.a_email as to_email, b.a_locale as to_locale,
           b.client_email as reply_to, b.*
      from b where b.status = 'booked' and b.starts_at > now() and b.created_at > now() - interval '2 days'
    union all
    select 'confirmed', 'glowbook_booking_confirmed:' || b.id, b.client_email, b.locale, null, b.*
      from b where b.status = 'booked' and b.starts_at > now() and b.created_at > now() - interval '2 days'
               and b.client_email is not null
    union all
    select 'cancel_client', 'glowbook_booking_cancel_client:' || b.id, b.a_email, b.a_locale, null, b.*
      from b where b.status = 'cancelled_client' and b.cancelled_at > now() - interval '2 days'
    union all
    select 'cancel_artist', 'glowbook_booking_cancel_artist:' || b.id, b.client_email, b.locale, null, b.*
      from b where b.status = 'cancelled_artist' and b.cancelled_at > now() - interval '2 days'
               and b.client_email is not null
    union all
    select 'reminder', 'glowbook_booking_reminder:' || b.id, b.client_email, b.locale, null, b.*
      from b where b.status = 'booked' and b.client_email is not null
               and b.starts_at > now() + interval '2 hours' and b.starts_at <= now() + interval '24 hours'
               and b.created_at < b.starts_at - interval '30 hours'
  )
  select m.kind, m.event_key, m.id, m.to_email, m.to_locale, m.reply_to, m.a_name, m.a_handle,
         m.client_name, m.client_email, m.client_phone, m.client_erased, m.starts_at, m.starts_at + interval '1 hour', m.timezone,
         m.design_kind, m.creation_name, m.comment, m.cancel_reason, m.late_cancel
    from mails m
   where m.to_email is not null
     and private.email_event_open(m.event_key)
   order by m.created_at
   limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.pending_glowbook_booking_emails(integer, uuid) from public, anon, authenticated;
grant execute on function public.pending_glowbook_booking_emails(integer, uuid) to service_role;

insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('glowbook_booking_new', 'Glowbook: new booking (artist)',
   'Sent to an artist when a member books a slot on their Glowbook (decision 144). Reply goes to the client.',
   'Nouveau rendez-vous le {{date}}',
   '{{client_name}} a réservé un créneau sur votre Glowbook.',
   E'Bonjour {{artist_name}},\n\n{{client_name}} a réservé le {{date}} sur votre Glowbook. Le créneau est bloqué dans votre agenda.\n\nRépondez à cet e-mail pour écrire directement à votre client. Si ce rendez-vous ne vous convient pas, annulez-le depuis votre agenda en indiquant la raison : votre client sera prévenu.',
   array['artist_name', 'client_name', 'date'], 'high'),
  ('glowbook_booking_confirmed', 'Glowbook: booking confirmed (client)',
   'Sent to a member who booked a slot on an artist''s Glowbook (decision 144), with the appointment as a calendar file.',
   'Votre rendez-vous avec {{artist_name}} le {{date}}',
   'Votre créneau est réservé.',
   E'Bonjour {{client_name}},\n\nVotre rendez-vous avec {{artist_name}} est réservé le {{date}}. Ajoutez-le à votre agenda avec le fichier joint.\n\nL''artiste peut vous contacter pour préciser votre projet. Si vous ne pouvez pas venir, annulez au plus tôt depuis votre espace : l''annulation est libre jusqu''à 24 heures avant le rendez-vous.',
   array['artist_name', 'client_name', 'date'], 'high'),
  ('glowbook_booking_cancel_client', 'Glowbook: client cancelled (artist)',
   'Sent to an artist when a client cancels a booking, or when the client''s account was deleted (decision 144).',
   'Rendez-vous du {{date}} annulé par votre client',
   'Le créneau est de nouveau libre.',
   E'Bonjour {{artist_name}},\n\nLe rendez-vous du {{date}} a été annulé par votre client. Le créneau est de nouveau proposé sur votre Glowbook.',
   array['artist_name', 'date'], 'high'),
  ('glowbook_booking_cancel_artist', 'Glowbook: artist cancelled (client)',
   'Sent to a client when the artist cancels their booking, with the artist''s reason (decision 144).',
   'Votre rendez-vous du {{date}} avec {{artist_name}} est annulé',
   'L''artiste a annulé votre rendez-vous.',
   E'Bonjour {{client_name}},\n\n{{artist_name}} a annulé votre rendez-vous du {{date}}. Vous trouverez sa raison ci-dessous. Vous pouvez réserver un autre créneau sur son Glowbook.',
   array['artist_name', 'client_name', 'date'], 'high'),
  ('glowbook_booking_reminder', 'Glowbook: appointment reminder (client)',
   'Sent to a client the day before their Glowbook appointment (decision 144).',
   'Rappel : rendez-vous demain avec {{artist_name}}',
   'Votre rendez-vous est le {{date}}.',
   E'Bonjour {{client_name}},\n\nPetit rappel : vous avez rendez-vous avec {{artist_name}} le {{date}}. Si vous ne pouvez plus venir, prévenez l''artiste en annulant depuis votre espace.',
   array['artist_name', 'client_name', 'date'], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('glowbook_booking_new', 'New appointment on {{date}}',
     '{{client_name}} booked a slot on your Glowbook.',
     E'Hello {{artist_name}},\n\n{{client_name}} booked {{date}} on your Glowbook. The slot is blocked in your calendar.\n\nReply to this e-mail to write to your client directly. If this appointment does not suit you, cancel it from your calendar and give the reason: your client will be told.'),
    ('glowbook_booking_confirmed', 'Your appointment with {{artist_name}} on {{date}}',
     'Your slot is booked.',
     E'Hello {{client_name}},\n\nYour appointment with {{artist_name}} is booked for {{date}}. Add it to your calendar with the attached file.\n\nThe artist may contact you about your project. If you cannot come, cancel as early as possible from your account: cancelling is free until 24 hours before the appointment.'),
    ('glowbook_booking_cancel_client', 'Appointment on {{date}} cancelled by your client',
     'The slot is free again.',
     E'Hello {{artist_name}},\n\nThe appointment on {{date}} was cancelled by your client. The slot is offered again on your Glowbook.'),
    ('glowbook_booking_cancel_artist', 'Your appointment on {{date}} with {{artist_name}} is cancelled',
     'The artist cancelled your appointment.',
     E'Hello {{client_name}},\n\n{{artist_name}} cancelled your appointment on {{date}}. You will find their reason below. You can book another slot on their Glowbook.'),
    ('glowbook_booking_reminder', 'Reminder: appointment tomorrow with {{artist_name}}',
     'Your appointment is on {{date}}.',
     E'Hello {{client_name}},\n\nA quick reminder: you have an appointment with {{artist_name}} on {{date}}. If you can no longer come, let the artist know by cancelling from your account.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- -----------------------------------------------------------------------------
-- 10. Retention: 12 months after the slot (decision 144, to confirm), blocks
--     3 years after they were set; past manual overrides after 30 days.
-- -----------------------------------------------------------------------------
create or replace function private.purge_glowbook_bookings(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bookings  integer;
  v_blocks    integer;
  v_overrides integer;
begin
  if p_now is null or p_now > now() + interval '1 day' then
    raise exception 'purge_glowbook_bookings: invalid date' using errcode = '22023';
  end if;
  delete from public.glowbook_bookings k where k.starts_at < p_now - interval '12 months';
  get diagnostics v_bookings = row_count;
  delete from public.glowbook_client_blocks b where b.created_at < p_now - interval '3 years';
  get diagnostics v_blocks = row_count;
  delete from public.glowbook_calendar_overrides o where o.starts_at < p_now - interval '30 days';
  get diagnostics v_overrides = row_count;
  if v_bookings + v_blocks > 0 then
    insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
    values (null, 'retention_purge', 'delete', 'glowbook_bookings', p_now::date::text,
            jsonb_build_object('reason', 'retention_purge', 'bookings', v_bookings, 'client_blocks', v_blocks));
  end if;
  return jsonb_build_object('bookings', v_bookings, 'client_blocks', v_blocks, 'overrides', v_overrides);
end;
$$;

revoke all on function private.purge_glowbook_bookings(timestamptz) from public, anon, authenticated, service_role;

select cron.schedule('purge-glowbook-bookings', '25 2 * * *', $job$select private.purge_glowbook_bookings()$job$);

-- -----------------------------------------------------------------------------
-- 11. Account erasure: an artist with appointments to come cancels them first
-- -----------------------------------------------------------------------------
create or replace function private.account_erasure_blockers(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when exists (select 1 from public.profiles p where p.id = p_user and private.role_is_staff(p.role))
         then 'staff' end,
    case when exists (select 1 from public.studio_subscriptions s
                       where s.user_id = p_user
                         and s.status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'))
         then 'studio_subscription' end,
    case when exists (select 1 from public.studio_withdrawals w
                       where w.user_id = p_user and w.status in ('requested', 'refund_pending'))
         then 'studio_withdrawal' end,
    case when exists (select 1 from public.orders o
                       where o.user_id = p_user and o.status = 'pending' and o.payment_status = 'pending'
                         and o.expires_at > now())
         then 'order_payment_pending' end,
    case when exists (select 1 from public.glowbook_bookings k
                       where k.artist_id = p_user and k.status = 'booked' and k.starts_at > now())
         then 'glowbook_bookings' end
  ], null);
$$;

revoke all on function private.account_erasure_blockers(uuid) from public;

