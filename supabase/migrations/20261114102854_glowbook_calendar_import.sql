-- =============================================================================
-- Glowbook calendar import (decision 144, lot 3)
-- =============================================================================
-- The artist pastes the private iCalendar address of another calendar (Google
-- Calendar's "secret address in iCal format", Planity if it offers one, Apple,
-- Outlook…). Every 15 minutes the Edge Function glowbook-calendar-import reads
-- it and the hours it is busy in are closed on the Glowbook calendar
-- (glowbook_calendar_overrides, source 'import').
--
--   glowbook_set_calendar_import(url|null)       artist (Atelier): https address, or none
--   glowbook_calendar_import_state()             artist: address, last read, status
--   glowbook_imported_hours(from, to)            artist: the hours closed by the import
--   glowbook_calendar_import_targets(limit)      service role: who to read next
--   glowbook_apply_calendar_import(user, url, hours[], error)
--                                                service role: replace the imported hours
--                                                (a failed read keeps the previous ones)
--
-- What is stored: only the busy hours (never an event's title, place or
-- guests). A manual choice wins: an hour the artist closed or opened by hand
-- is never overwritten by the import. Existing bookings are never touched.
-- =============================================================================

alter table public.glowbook_booking_settings
  add column import_url        text check (import_url ~ '^https://[^\s<>"]{3,1000}$'),
  add column import_checked_at timestamptz,
  add column import_status     text check (import_status in ('ok', 'error')),
  add column import_error      text check (import_error in ('unreachable', 'not_calendar', 'too_large', 'forbidden_host', 'timeout'));

comment on column public.glowbook_booking_settings.import_url is
  'Glowbook calendar import (decision 144, lot 3): the private iCalendar address of another calendar whose busy hours are closed here.';

create index glowbook_booking_settings_import_idx on public.glowbook_booking_settings (import_checked_at nulls first)
  where import_url is not null;

create or replace function public.glowbook_set_calendar_import(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.glowbook_require_artist();
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_url is not null then
    -- webcal:// is how calendar apps often give the address: same thing over https.
    if v_url ~* '^webcals?://' then
      v_url := regexp_replace(v_url, '^webcals?://', 'https://', 'i');
    end if;
    if v_url !~ '^https://[^\s<>"]{3,1000}$' then
      raise exception 'glowbook_booking: invalid' using errcode = '22023';
    end if;
  end if;
  insert into public.glowbook_booking_settings (user_id, import_url)
  values (v_uid, v_url)
  on conflict (user_id) do update
     set import_url = excluded.import_url, import_checked_at = null, import_status = null, import_error = null;
  if v_url is null then
    delete from public.glowbook_calendar_overrides o where o.user_id = v_uid and o.source = 'import';
  end if;
end;
$$;

revoke all on function public.glowbook_set_calendar_import(text) from public, anon;
grant execute on function public.glowbook_set_calendar_import(text) to authenticated;

create or replace function public.glowbook_calendar_import_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('url', b.import_url, 'checked_at', b.import_checked_at,
                            'status', b.import_status, 'error', b.import_error,
                            'hours', (select count(*) from public.glowbook_calendar_overrides o
                                       where o.user_id = b.user_id and o.source = 'import' and o.starts_at > now()))
    from public.glowbook_booking_settings b
   where b.user_id = auth.uid();
$$;

revoke all on function public.glowbook_calendar_import_state() from public, anon;
grant execute on function public.glowbook_calendar_import_state() to authenticated;

create or replace function public.glowbook_imported_hours(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(o.starts_at order by o.starts_at), '[]'::jsonb)
    from public.glowbook_calendar_overrides o
   where o.user_id = auth.uid() and o.source = 'import'
     and o.starts_at >= p_from and o.starts_at < p_to
     and p_to - p_from <= interval '63 days';
$$;

revoke all on function public.glowbook_imported_hours(timestamptz, timestamptz) from public, anon;
grant execute on function public.glowbook_imported_hours(timestamptz, timestamptz) to authenticated;

-- Calendars to read: never read first, then the oldest read; only artists who may
-- still take bookings (the plan and the page), so a lapsed account costs nothing.
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
     and private.glowbook_allowed(b.user_id)
     and private.studio_user_has_access(b.user_id)
   order by b.import_checked_at nulls first
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.glowbook_calendar_import_targets(integer) from public, anon, authenticated;
grant execute on function public.glowbook_calendar_import_targets(integer) to service_role;

-- p_hours: the whole local hours the other calendar is busy in, from now to the
-- horizon. p_url guards against an address changed while it was being read.
create or replace function public.glowbook_apply_calendar_import(p_user uuid, p_url text, p_hours timestamptz[], p_error text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_set public.glowbook_booking_settings;
  v_n   integer := 0;
begin
  select * into v_set from public.glowbook_booking_settings where user_id = p_user for update;
  if v_set.user_id is null or v_set.import_url is distinct from p_url then
    return 0;
  end if;
  if p_error is not null then
    update public.glowbook_booking_settings
       set import_checked_at = now(), import_status = 'error',
           import_error = case when p_error in ('unreachable', 'not_calendar', 'too_large', 'forbidden_host', 'timeout') then p_error else 'unreachable' end
     where user_id = p_user;
    return 0;
  end if;
  if p_hours is not null and cardinality(p_hours) > 24 * 180 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;

  delete from public.glowbook_calendar_overrides o
   where o.user_id = p_user and o.source = 'import' and o.starts_at >= now() - interval '1 hour';
  insert into public.glowbook_calendar_overrides (user_id, starts_at, kind, source)
  select distinct p_user, h, 'blocked', 'import'
    from unnest(coalesce(p_hours, '{}')) h
   where h >= now() - interval '1 hour' and h < now() + interval '181 days'
  on conflict (user_id, starts_at) do nothing;            -- a manual choice wins
  get diagnostics v_n = row_count;

  update public.glowbook_booking_settings
     set import_checked_at = now(), import_status = 'ok', import_error = null
   where user_id = p_user;
  return v_n;
end;
$$;

revoke all on function public.glowbook_apply_calendar_import(uuid, text, timestamptz[], text) from public, anon, authenticated;
grant execute on function public.glowbook_apply_calendar_import(uuid, text, timestamptz[], text) to service_role;

-- The cron's caller knows the new function.
create or replace function private.call_email_function(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in ('deliver-gift-cards', 'send-pending-emails', 'sync-newsletter-contacts', 'purge-storage-objects',
                    'glowbook-calendar-import') then
    raise exception 'call_email_function: unknown function %', p_name using errcode = '22023';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_internal_secret';
  if v_secret is null then
    return null;                              -- internal calls not set up yet: nothing to call
  end if;
  return net.http_post(
    url                  := 'https://abvuyvryerpzlvibttxp.supabase.co/functions/v1/' || p_name,
    headers              := jsonb_build_object('content-type', 'application/json', 'x-internal-secret', v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.call_email_function(text) from public, anon, authenticated;

select cron.schedule('glowbook-calendar-import', '*/15 * * * *',
  $job$select private.call_email_function('glowbook-calendar-import')$job$);
