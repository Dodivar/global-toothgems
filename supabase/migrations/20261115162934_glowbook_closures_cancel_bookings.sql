-- =============================================================================
-- Glowbook closures (decision 147 (a), owner's choice 2026-11-15): the
-- appointments already booked on the days an artist closes are cancelled, and
-- each client is e-mailed — instead of being kept.
--
-- glowbook_add_closure() re-created from 20261115154130_glowbook_closures:
-- in the same transaction (under the artist's booking lock, so no booking can
-- slip in between), every appointment to come whose local day falls inside
-- the period becomes `cancelled_artist` with a fixed reason in the client's
-- language (the period's note stays private). The existing sweep
-- (pending_glowbook_booking_emails → send-pending-emails, every 5 minutes)
-- sends the usual "the artist cancelled" e-mail with that reason; nothing new
-- to deploy. It answers {id, cancelled: n} (was {id, bookings: n}).
-- =============================================================================

create or replace function public.glowbook_add_closure(p_starts_on date, p_ends_on date, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.glowbook_require_artist();
  v_tz        text := coalesce((select b.timezone from public.glowbook_booking_settings b where b.user_id = v_uid), 'Europe/Paris');
  v_today     date := (now() at time zone v_tz)::date;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_id        uuid;
  v_cancelled integer;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_starts_on < v_today or p_ends_on > v_today + 366 or p_ends_on - p_starts_on > 365
     or char_length(coalesce(v_note, '')) > 80 then
    raise exception 'glowbook_booking: invalid' using errcode = '22023';
  end if;
  -- The lock glowbook_book_slot() takes: no booking lands on these days meanwhile.
  perform pg_advisory_xact_lock(hashtextextended('glowbook_booking:' || v_uid::text, 0));
  if (select count(*) from public.glowbook_closures c where c.user_id = v_uid and c.ends_on >= v_today) >= 20 then
    raise exception 'glowbook_booking: too_many_closures' using errcode = '23514';
  end if;
  insert into public.glowbook_closures (user_id, starts_on, ends_on, note)
  values (v_uid, p_starts_on, p_ends_on, v_note)
  returning id into v_id;

  update public.glowbook_bookings k
     set status = 'cancelled_artist',
         cancel_reason = case when k.locale = 'en'
                              then 'The artist has closed their calendar on that day.'
                              else 'L’artiste a fermé son agenda ce jour-là.' end,
         cancelled_at = now()
   where k.artist_id = v_uid
     and k.status = 'booked'
     and k.starts_at > now()
     and (k.starts_at at time zone v_tz)::date between p_starts_on and p_ends_on;
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object('id', v_id, 'cancelled', v_cancelled);
end;
$$;

revoke all on function public.glowbook_add_closure(date, date, text) from public, anon;
grant execute on function public.glowbook_add_closure(date, date, text) to authenticated;
