-- =============================================================================
-- Glowbook calendar feed validation suite (decision 144, lot 2)
-- (migration 20261114095951_glowbook_calendar_feed)
-- =============================================================================
--   F1  anon and a member without a Glowbook cannot create a link; the artist
--       does, and only the secret's sha256 is stored;
--   F2  the feed answers the artist's appointments for that secret only:
--       nothing for a wrong, malformed or revoked one; another artist's
--       appointments never appear;
--   F3  a new link revokes the old one; disabling removes it;
--   F4  anon and members cannot read the feed function (service role only);
--       the state function says whether a link exists, never the secret.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL GLOWBOOK CALENDAR FEED TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  artist  uuid := '00000000-0000-4000-a000-000000b50001';
  other   uuid := '00000000-0000-4000-a000-000000b50002';
  client  uuid := '00000000-0000-4000-a000-000000b50003';
  token   text;
  token2  text;
  v_j     jsonb;
  v_state text;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (artist, 'authenticated', 'authenticated', 'feed-artist.test@example.invalid', now(), now(), now()),
    (other,  'authenticated', 'authenticated', 'feed-other.test@example.invalid',  now(), now(), now()),
    (client, 'authenticated', 'authenticated', 'feed-client.test@example.invalid', now(), now(), now());
  insert into public.studio_showcases (user_id, handle, display_name, status) values
    (artist, 'feed-artist', 'Feed Artist', 'approved'),
    (other,  'feed-other',  'Feed Other',  'approved');
  insert into public.glowbook_bookings (artist_id, client_id, starts_at, timezone, design_kind, client_name, client_email, client_phone, comment) values
    (artist, client, date_trunc('hour', now()) + interval '3 days', 'Europe/Paris', 'custom', 'Sam Client', 'feed-client.test@example.invalid', '0600000000', 'A star'),
    (other,  client, date_trunc('hour', now()) + interval '4 days', 'Europe/Paris', 'custom', 'Sam Client', 'feed-client.test@example.invalid', '0600000000', 'Other one');

  -- F1
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.glowbook_create_calendar_feed();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F1: anon created a link (%)', v_state; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', client, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_create_calendar_feed();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F1: a member without a Glowbook created a link (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  token := public.glowbook_create_calendar_feed();
  if token !~ '^[0-9a-f]{64}$' then raise exception 'FAIL F1: bad secret %', token; end if;
  v_j := public.glowbook_calendar_feed_state();
  if (v_j ->> 'active')::boolean is not true or v_j::text like '%' || token || '%' then raise exception 'FAIL F4: state %', v_j; end if;
  execute 'reset role';
  if exists (select 1 from public.glowbook_booking_settings where user_id = artist and feed_token_hash = token) then
    raise exception 'FAIL F1: the secret is stored as such';
  end if;

  -- F4: only the service role reads the feed.
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    perform public.glowbook_calendar_feed(token);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F4: a member read the feed function (%)', v_state; end if;
  execute 'reset role';

  -- F2
  perform set_config('role', 'service_role', true);
  v_j := public.glowbook_calendar_feed(token);
  if v_j ->> 'artist_name' <> 'Feed Artist' or jsonb_array_length(v_j -> 'events') <> 1
     or v_j #>> '{events,0,comment}' <> 'A star' then
    raise exception 'FAIL F2: the feed is wrong (%)', v_j;
  end if;
  if public.glowbook_calendar_feed(repeat('0', 64)) is not null or public.glowbook_calendar_feed('nope') is not null
     or public.glowbook_calendar_feed(null) is not null then
    raise exception 'FAIL F2: a wrong secret answered';
  end if;

  -- F3
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  token2 := public.glowbook_create_calendar_feed();
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  if public.glowbook_calendar_feed(token) is not null then raise exception 'FAIL F3: the old link still answers'; end if;
  if public.glowbook_calendar_feed(token2) is null then raise exception 'FAIL F3: the new link does not answer'; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform public.glowbook_disable_calendar_feed();
  if (public.glowbook_calendar_feed_state() ->> 'active')::boolean then raise exception 'FAIL F3: still active after disabling'; end if;
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  if public.glowbook_calendar_feed(token2) is not null then raise exception 'FAIL F3: a disabled link answers'; end if;

  raise exception 'ALL GLOWBOOK CALENDAR FEED TESTS PASSED';
end;
$$;
