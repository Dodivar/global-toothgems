-- =============================================================================
-- Glowbook bookings, the client's side (decision 147 (d), owner's request
-- 2026-11-15): "My appointments" shows the creation booked (its picture and
-- 3D view), where the appointment takes place, and offers to add it to the
-- client's own calendar.
--
-- my_glowbook_bookings() re-created from 20261113233819_glowbook_bookings,
-- with, per booking:
--   * 'item_id', 'item_live' (page and creation approved: the public 3D view
--     exists) and 'thumbnail_path' — only while live, the picture the public
--     page already shows (readable through "anyone reads public Glowbook
--     renders", so the client's browser signs it);
--   * 'place' — the artist's place as their page shows it (decision 108: a
--     salon's address and pin, or an area's name and a rounded centre; a home
--     address is never stored), whatever the page's moderation state: the
--     client booked there.
-- Only the caller's own bookings, as before.
-- =============================================================================

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
               'thumbnail_path', case when i.status = 'approved' and s.status = 'approved' then c.thumbnail_path end,
               'place', case when s.place_mode is not null then jsonb_build_object(
                          'mode', s.place_mode, 'label', s.place_label, 'lat', s.place_lat, 'lng', s.place_lng) end)
             order by k.starts_at desc)
        from public.glowbook_bookings k
        left join public.studio_showcases s on s.user_id = k.artist_id
        left join public.studio_showcase_items i on i.id = k.showcase_item_id and i.user_id = k.artist_id
        left join public.creations c on c.id = i.creation_id and c.user_id = k.artist_id
       where k.client_id = auth.uid()), '[]'::jsonb)) end;
$$;

revoke all on function public.my_glowbook_bookings() from public, anon;
grant execute on function public.my_glowbook_bookings() to authenticated;
