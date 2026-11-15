-- =============================================================================
-- Glowbook calendar (decision 147 (c), owner's request 2026-11-15): the week
-- view shows each appointment by name and opens it, with the creation asked
-- for — its picture and its 3D view.
--
-- glowbook_artist_calendar() re-created from 20261115154130_glowbook_closures,
-- with: 'handle' (the artist's page address, null without a page) and, on
-- each booking, 'item_id' (the Glowbook creation chosen, null for a custom
-- design or a creation since removed), 'thumbnail_path' (its picture in the
-- private bucket studio-thumbnails, signed by the artist's browser — the
-- artist's own file) and 'item_live' (page and creation approved: the public
-- 3D view exists). Only the artist's own rows, as before.
-- =============================================================================

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
