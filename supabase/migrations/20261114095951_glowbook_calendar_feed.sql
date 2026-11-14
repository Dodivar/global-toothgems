-- =============================================================================
-- Glowbook calendar feed (decision 144, lot 2)
-- =============================================================================
-- The artist subscribes their own calendar app (Google, Apple, Outlook) to a
-- private iCalendar address that lists their Glowbook appointments.
--
--   glowbook_create_calendar_feed()   artist: a new secret (64 hex) returned once;
--                                     only its sha256 is stored; any older link stops
--   glowbook_disable_calendar_feed()  artist: no link any more
--   glowbook_calendar_feed(token)     service role (Edge Function glowbook-calendar-feed):
--                                     the appointments from 30 days ago to 180 days
--                                     ahead (booked, honoured, no-show; cancellations
--                                     of the last 30 days as cancelled events)
--
-- The feed carries what the artist already sees (client name, phone, design,
-- comment): the artist decides to send it to their calendar provider (they are
-- the controller of their clients' data, Studio terms). Available whatever the
-- plan, like the calendar reading: an artist who left Atelier keeps their
-- appointments in view until they are over.
-- =============================================================================

alter table public.glowbook_booking_settings
  add column feed_token_hash text unique check (feed_token_hash ~ '^[0-9a-f]{64}$'),
  add column feed_created_at timestamptz;

comment on column public.glowbook_booking_settings.feed_token_hash is
  'Glowbook calendar feed (decision 144, lot 2): sha256 of the private link''s secret; null = no link. The secret itself is never stored.';

create or replace function public.glowbook_create_calendar_feed()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_uid is null or not exists (select 1 from public.studio_showcases s where s.user_id = v_uid) then
    raise exception 'glowbook_booking: not_allowed' using errcode = '42501';
  end if;
  insert into public.glowbook_booking_settings (user_id, feed_token_hash, feed_created_at)
  values (v_uid, encode(extensions.digest(v_token, 'sha256'), 'hex'), now())
  on conflict (user_id) do update
     set feed_token_hash = excluded.feed_token_hash, feed_created_at = excluded.feed_created_at;
  return v_token;
end;
$$;

create or replace function public.glowbook_disable_calendar_feed()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.glowbook_booking_settings
     set feed_token_hash = null, feed_created_at = null
   where user_id = auth.uid();
$$;

revoke all on function public.glowbook_create_calendar_feed(), public.glowbook_disable_calendar_feed() from public, anon;
grant execute on function public.glowbook_create_calendar_feed(), public.glowbook_disable_calendar_feed() to authenticated;

-- {artist_name, timezone, events: [...]} or null for an unknown or revoked link.
create or replace function public.glowbook_calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.glowbook_booking_settings;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_set from public.glowbook_booking_settings b
   where b.feed_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_set.user_id is null then
    return null;
  end if;
  return jsonb_build_object(
    'artist_name', (select s.display_name from public.studio_showcases s where s.user_id = v_set.user_id),
    'timezone', v_set.timezone,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'starts_at', k.starts_at, 'ends_at', k.starts_at + interval '1 hour',
               'status', k.status, 'design_kind', k.design_kind, 'creation_name', k.creation_name,
               'client_name', k.client_name, 'client_phone', k.client_phone, 'client_email', k.client_email,
               'comment', k.comment, 'cancel_reason', k.cancel_reason, 'updated_at', k.updated_at)
             order by k.starts_at)
        from public.glowbook_bookings k
       where k.artist_id = v_set.user_id
         and k.starts_at >= now() - interval '30 days'
         and k.starts_at < now() + interval '180 days'
         and (k.status in ('booked', 'honoured', 'no_show')
              or (k.status in ('cancelled_client', 'cancelled_artist') and k.cancelled_at > now() - interval '30 days'))
    ), '[]'::jsonb));
end;
$$;

revoke all on function public.glowbook_calendar_feed(text) from public, anon, authenticated;
grant execute on function public.glowbook_calendar_feed(text) to service_role;

-- Feed requests are throttled per address (calendar apps poll every few hours).
create or replace function public.glowbook_calendar_feed_ip_allowed(p_ip_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.hit_rate_limit('glowbook_calendar_feed_ip', p_ip_hash, 120, interval '1 hour');
$$;

revoke all on function public.glowbook_calendar_feed_ip_allowed(text) from public, anon, authenticated;
grant execute on function public.glowbook_calendar_feed_ip_allowed(text) to service_role;

-- The artist's calendar says whether a link exists (never the secret).
create or replace function public.glowbook_calendar_feed_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('active', b.feed_token_hash is not null, 'created_at', b.feed_created_at)
    from public.glowbook_booking_settings b
   where b.user_id = auth.uid();
$$;

revoke all on function public.glowbook_calendar_feed_state() from public, anon;
grant execute on function public.glowbook_calendar_feed_state() to authenticated;
