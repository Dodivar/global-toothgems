-- =============================================================================
-- Glowbook closures (decision 146): an artist closes whole days of their
-- calendar at once — holidays, a training, a salon closed — instead of one
-- hour at a time.
--
--   * public.glowbook_closures: one period [starts_on, ends_on], local dates
--     of the artist's time zone, an optional private note (never shown to
--     clients). Deny by default, written by the functions below only.
--   * A closed day offers no slot (glowbook_booking_slots) and refuses every
--     booking (glowbook_book_slot); it wins over the weekly hours, an hour
--     opened by hand and the imported calendar.
--   * Appointments already booked inside a new period are kept: the artist is
--     told how many (glowbook_add_closure, glowbook_artist_calendar) and
--     cancels them if they want, with a reason, as usual.
--   * glowbook_artist_calendar also returns the page's moderation state, so
--     the calendar page (/compte/agenda) needs nothing else to load.
--   * my_personal_data() lists the periods; the nightly purge drops periods
--     ended more than 30 days ago, like the hours closed by hand.
--
-- Re-creates glowbook_booking_slots, glowbook_book_slot,
-- glowbook_artist_calendar and purge_glowbook_bookings from
-- 20261113233819_glowbook_bookings, and my_personal_data from
-- 20261114084038_glowbook_bookings_personal_data, each with the closure added.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
create table public.glowbook_closures (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.studio_showcases (user_id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  note        text check (note is null or char_length(note) between 1 and 80),
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 365)
);

create index glowbook_closures_user_idx on public.glowbook_closures (user_id, ends_on);

comment on table public.glowbook_closures is
  'Glowbook closures (decision 146): whole local days an artist''s calendar is closed, [starts_on, ends_on]. The note is private. Written by glowbook_add_closure() / glowbook_delete_closure() only.';

alter table public.glowbook_closures enable row level security;

-- Deny by default: no grant, no policy.
revoke all on public.glowbook_closures from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Helper: is this local day closed for this artist?
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_day_closed(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.glowbook_closures c
                  where c.user_id = p_user and p_day between c.starts_on and c.ends_on);
$$;

revoke all on function private.glowbook_day_closed(uuid, date) from public;

-- -----------------------------------------------------------------------------
-- 3. Free hours and booking: a closed day offers nothing
-- -----------------------------------------------------------------------------
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
         and not private.glowbook_day_closed(v_user, h.local_day)
         and h.booking_id is null
         and h.starts_at >= now() + make_interval(hours => v_set.min_notice_hours)
         and h.starts_at < now() + make_interval(days => v_set.horizon_days)
    ), '[]'::jsonb));
end;
$$;

grant execute on function public.glowbook_booking_slots(text, date, date) to anon, authenticated;

-- Booking (service role: the Edge Function has checked the JWT and the captcha).
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
-- 4. The artist: add and remove a period
-- -----------------------------------------------------------------------------
-- Returns the new period and how many appointments to come it covers (kept).
create or replace function public.glowbook_add_closure(p_starts_on date, p_ends_on date, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.glowbook_require_artist();
  v_tz    text := coalesce((select b.timezone from public.glowbook_booking_settings b where b.user_id = v_uid), 'Europe/Paris');
  v_today date := (now() at time zone v_tz)::date;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_id    uuid;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_starts_on < v_today or p_ends_on > v_today + 366 or p_ends_on - p_starts_on > 365
     or char_length(coalesce(v_note, '')) > 80 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('glowbook_booking:' || v_uid::text, 0));
  if (select count(*) from public.glowbook_closures c where c.user_id = v_uid and c.ends_on >= v_today) >= 20 then
    raise exception 'glowbook_booking: too_many_closures' using errcode = '23514';
  end if;
  insert into public.glowbook_closures (user_id, starts_on, ends_on, note)
  values (v_uid, p_starts_on, p_ends_on, v_note)
  returning id into v_id;
  return jsonb_build_object(
    'id', v_id,
    'bookings', (select count(*) from public.glowbook_bookings k
                  where k.artist_id = v_uid and k.status = 'booked' and k.starts_at > now()
                    and (k.starts_at at time zone v_tz)::date between p_starts_on and p_ends_on));
end;
$$;

revoke all on function public.glowbook_add_closure(date, date, text) from public, anon;
grant execute on function public.glowbook_add_closure(date, date, text) to authenticated;

create or replace function public.glowbook_delete_closure(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.glowbook_require_artist();
begin
  delete from public.glowbook_closures c where c.id = p_id and c.user_id = v_uid;
  if not found then
    raise exception 'glowbook_booking: not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.glowbook_delete_closure(uuid) from public, anon;
grant execute on function public.glowbook_delete_closure(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. The artist's calendar: the periods to come and the page's state
-- -----------------------------------------------------------------------------
-- The artist's calendar between two local dates (at most 62 days). Readable
-- without the plan, so an artist who left Atelier can still honour or cancel
-- the appointments already booked. Since decision 146: the page's moderation
-- state ('page_status', null without a page) and the closures not ended yet,
-- each with the appointments to come it covers.
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

-- -----------------------------------------------------------------------------
-- 6. Retention: periods ended more than 30 days ago go with the hours closed by hand
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
  v_closures  integer;
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
  delete from public.glowbook_closures c where c.ends_on < (p_now - interval '30 days')::date;
  get diagnostics v_closures = row_count;
  if v_bookings + v_blocks > 0 then
    insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
    values (null, 'retention_purge', 'delete', 'glowbook_bookings', p_now::date::text,
            jsonb_build_object('reason', 'retention_purge', 'bookings', v_bookings, 'client_blocks', v_blocks));
  end if;
  return jsonb_build_object('bookings', v_bookings, 'client_blocks', v_blocks, 'overrides', v_overrides, 'closures', v_closures);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Personal data export: the periods
-- -----------------------------------------------------------------------------
create or replace function public.my_personal_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users;
  v_email   text;
  v_last    timestamptz;
  v_archive jsonb;
begin
  if v_uid is null then
    raise exception 'my_personal_data: sign in first' using errcode = '42501';
  end if;
  select * into v_user from auth.users where id = v_uid;
  if v_user.id is null then
    raise exception 'my_personal_data: unknown account' using errcode = '42501';
  end if;

  select max(r.ready_at) into v_last
    from public.data_export_requests r
   where r.user_id = v_uid and r.status = 'delivered';
  if v_last > now() - interval '5 minutes' then
    return jsonb_build_object('status', 'too_soon', 'retry_at', v_last + interval '5 minutes');
  end if;

  -- Guest orders placed with the account's address belong to the member only
  -- once that address is confirmed.
  v_email := case when v_user.email_confirmed_at is not null then lower(v_user.email) end;

  v_archive := jsonb_build_object(
    'format', 'global-toothgems-personal-data/2',
    'generated_at', now(),
    'account', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'email_confirmed_at', v_user.email_confirmed_at,
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'sign_in_methods', coalesce(v_user.raw_app_meta_data -> 'providers', '[]'::jsonb)),
    'profile', (select private.personal_data_clean(to_jsonb(p)) from public.profiles p where p.id = v_uid),
    'addresses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(a)) order by a.created_at), '[]')
                    from public.customer_addresses a where a.user_id = v_uid),
    'consents', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(c)) order by c.created_at), '[]')
                   from public.consent_records c where c.user_id = v_uid),
    'newsletter', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(n))), '[]')
                     from public.newsletter_subscriptions n
                    where n.user_id = v_uid or (v_email is not null and lower(n.email) = v_email)),

    'shop', jsonb_build_object(
      'orders', (select coalesce(jsonb_agg(
                   private.personal_data_clean(to_jsonb(o)) || jsonb_build_object(
                     'items', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(i)) order by i.created_at), '[]')
                                 from public.order_items i where i.order_id = o.id),
                     'parcels', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                                   from public.shipments s where s.order_id = o.id),
                     'refunds', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(r)) order by r.created_at), '[]')
                                   from public.refunds r where r.order_id = o.id),
                     'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) || jsonb_build_object(
                                       'items', (select coalesce(jsonb_agg(to_jsonb(wi) - 'withdrawal_id'), '[]')
                                                   from public.order_withdrawal_items wi where wi.withdrawal_id = w.id))
                                       order by w.declared_at), '[]')
                                       from public.order_withdrawals w where w.order_id = o.id),
                     'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                                     'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                                     order by d.issued_at), '[]')
                                     from public.invoices d where d.order_id = o.id))
                   order by o.created_at), '[]')
                   from public.orders o
                  where o.user_id = v_uid
                     or (o.user_id is null and v_email is not null and lower(o.customer_email) = v_email)),
      'gift_cards_bought', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(g)) order by g.created_at), '[]')
                              from public.gift_cards g where g.purchaser_user_id = v_uid),
      'loyalty_cards', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                          from public.loyalty_cards l where l.user_id = v_uid),
      'loyalty_stamps', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                           from public.loyalty_stamps l where l.user_id = v_uid),
      'favourites', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w))), '[]')
                       from public.wishlist_items w where w.user_id = v_uid),
      'back_in_stock_alerts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(b)) order by b.created_at), '[]')
                                 from public.back_in_stock_requests b
                                where b.user_id = v_uid or (v_email is not null and lower(b.email) = v_email)),
      'reviews', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(v)) || jsonb_build_object(
                    'photos', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ph)) order by ph.position), '[]')
                                 from public.review_photos ph where ph.review_id = v.id))
                    order by v.created_at), '[]')
                    from public.reviews v where v.user_id = v_uid),
      'review_votes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(h))), '[]')
                         from public.review_helpful_votes h where h.user_id = v_uid)),

    'academy', jsonb_build_object(
      'courses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(e)) || jsonb_build_object('course_title', c.title)), '[]')
                    from public.course_entitlements e join public.courses c on c.id = e.course_id
                   where e.user_id = v_uid),
      'progress', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lp)) order by lp.completed_at), '[]')
                     from public.lesson_progress lp where lp.user_id = v_uid),
      'quiz_attempts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(q)) order by q.started_at), '[]')
                          from public.quiz_attempts q where q.user_id = v_uid),
      'certificates', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cc)) || jsonb_build_object('course_title', c.title)), '[]')
                         from public.course_completions cc join public.courses c on c.id = cc.course_id
                        where cc.user_id = v_uid)),

    'studio', jsonb_build_object(
      'trial', (select private.personal_data_clean(to_jsonb(t)) from public.studio_trials t where t.user_id = v_uid),
      'subscriptions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                          from public.studio_subscriptions s where s.user_id = v_uid),
      'subscription_payments', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(si)) order by si.occurred_at), '[]')
                                  from public.studio_subscription_invoices si where si.user_id = v_uid),
      'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) order by w.requested_at), '[]')
                        from public.studio_withdrawals w where w.user_id = v_uid),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                      'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                      'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                      order by d.issued_at), '[]')
                      from public.invoices d
                     where d.studio_invoice_id in (select si.stripe_invoice_id from public.studio_subscription_invoices si where si.user_id = v_uid)
                        or d.studio_withdrawal_id in (select w.id from public.studio_withdrawals w where w.user_id = v_uid)),
      'creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cr)) order by cr.created_at), '[]')
                      from public.creations cr where cr.user_id = v_uid),
      'gem_groups', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(gg))), '[]')
                       from public.gem_groups gg where gg.user_id = v_uid),
      'share_links', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(sh)) order by sh.created_at), '[]')
                        from public.creation_shares sh where sh.user_id = v_uid),
      'collections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(co))), '[]')
                        from public.studio_collections co where co.user_id = v_uid),
      'collection_entries', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ce))), '[]')
                               from public.studio_collection_creations ce where ce.user_id = v_uid),
      'preferences', (select private.personal_data_clean(to_jsonb(sp)) from public.studio_preferences sp where sp.user_id = v_uid),
      'share_logo', (select private.personal_data_clean(to_jsonb(sl)) from public.studio_share_logos sl where sl.user_id = v_uid),
      'glowbook', (select private.personal_data_clean(to_jsonb(sc)) from public.studio_showcases sc where sc.user_id = v_uid),
      'glowbook_creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(it))), '[]')
                               from public.studio_showcase_items it where it.user_id = v_uid),
      'glowbook_sections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(se))), '[]')
                              from public.studio_showcase_sections se where se.user_id = v_uid),
      'try_on_requests', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(tr)) order by tr.created_at), '[]')
                            from public.studio_try_on_requests tr where tr.user_id = v_uid),
      'feedback', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(f))), '[]')
                     from public.studio_feedback f where f.user_id = v_uid)),

    'community', jsonb_build_object(
      'lounge_profile', (select private.personal_data_clean(to_jsonb(lm)) from public.lounge_members lm where lm.user_id = v_uid),
      'messages', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(m)) order by m.created_at), '[]')
                     from public.lounge_messages m where m.author_id = v_uid),
      'reactions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lr))), '[]')
                      from public.lounge_reactions lr where lr.user_id = v_uid),
      -- Moderation (decision 132): what the member reported, what was decided
      -- about them (with the content concerned), their complaints, whom they hid.
      'reports', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'message_id', r.message_id, 'reason', r.reason, 'illegal_category', r.illegal_category,
                    'details', r.details, 'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at)
                    order by r.created_at), '[]')
                    from public.lounge_reports r where r.reporter_id = v_uid),
      'moderation_decisions', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', d.id, 'action', d.action, 'reason', d.reason, 'illegal_category', d.illegal_category,
                                 'ground', d.ground, 'statement', d.statement, 'ends_at', d.ends_at,
                                 'automated', d.automated, 'created_at', d.created_at, 'message_id', d.message_id,
                                 'content', s.body_text)
                                 order by d.created_at), '[]')
                                 from public.lounge_moderation_decisions d
                                 left join public.lounge_moderation_snapshots s on s.decision_id = d.id
                                where d.target_user_id = v_uid),
      'complaints', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'decision_id', a.decision_id, 'as', a.appellant_role, 'body', a.body,
                       'status', a.status, 'response', a.response, 'created_at', a.created_at, 'answered_at', a.answered_at)
                       order by a.created_at), '[]')
                       from public.lounge_appeals a where a.appellant_id = v_uid),
      'hidden_members', (select coalesce(jsonb_agg(jsonb_build_object('handle', m.handle, 'since', b.created_at)
                           order by b.created_at), '[]')
                           from public.lounge_blocks b
                           left join public.lounge_members m on m.user_id = b.blocked_id
                          where b.blocker_id = v_uid)),

    -- Glowbook bookings (decision 144): those the member made, and their own calendar
    -- (settings, hours, appointments received without the clients' details, which are the clients' own).
    'glowbook_bookings', jsonb_build_object(
      'made', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(k) - 'artist_id' - 'client_id') || jsonb_build_object(
                     'artist_name', (select s.display_name from public.studio_showcases s where s.user_id = k.artist_id))
                     order by k.starts_at), '[]')
                   from public.glowbook_bookings k where k.client_id = v_uid),
      'calendar_settings', (select private.personal_data_clean(to_jsonb(b)) from public.glowbook_booking_settings b where b.user_id = v_uid),
      'weekly_hours', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(r)) order by r.weekday, r.start_hour), '[]')
                         from public.glowbook_availability_rules r where r.user_id = v_uid),
      'calendar_hours', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(o)) order by o.starts_at), '[]')
                           from public.glowbook_calendar_overrides o where o.user_id = v_uid),
      'closures', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(c) - 'user_id') order by c.starts_on), '[]')
                     from public.glowbook_closures c where c.user_id = v_uid),
      'received', (select coalesce(jsonb_agg(jsonb_build_object('starts_at', k.starts_at, 'status', k.status,
                       'design_kind', k.design_kind, 'creation_name', k.creation_name, 'created_at', k.created_at)
                       order by k.starts_at), '[]')
                       from public.glowbook_bookings k where k.artist_id = v_uid),
      'blocked_clients', (select count(*) from public.glowbook_client_blocks b where b.artist_id = v_uid)),

    'customer_service', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cq)) order by cq.created_at), '[]')
                           from public.contact_requests cq
                          where cq.user_id = v_uid or (v_email is not null and lower(cq.email) = v_email)),

    -- What the team recorded about the member: the right of access covers it.
    'customer_file', jsonb_build_object(
      'tags', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ct))), '[]')
                 from public.customer_tags ct where ct.user_id = v_uid),
      'notes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cn)) order by cn.created_at), '[]')
                  from public.customer_notes cn where cn.user_id = v_uid)),

    'files', (select coalesce(jsonb_agg(jsonb_build_object(
                'bucket', o.bucket_id, 'path', o.name,
                'size', (o.metadata ->> 'size')::bigint, 'created_at', o.created_at)
                order by o.bucket_id, o.name), '[]')
                from storage.objects o
               where o.bucket_id = any (private.personal_file_buckets() || array['contact-attachments'])
                 and (storage.foldername(o.name))[1] = v_uid::text)
  );

  insert into public.data_export_requests (user_id, status, requested_at, ready_at)
  values (v_uid, 'delivered', now(), now());

  return jsonb_build_object('status', 'ok', 'archive', v_archive);
end;
$$;

revoke all on function public.my_personal_data() from public, anon;
grant execute on function public.my_personal_data() to authenticated;

comment on function public.my_personal_data() is
  'GDPR access/portability: the signed-in member''s personal data as one JSON archive ({status: ok, archive}), '
  'or {status: too_soon, retry_at} within 5 minutes of the previous one.';
