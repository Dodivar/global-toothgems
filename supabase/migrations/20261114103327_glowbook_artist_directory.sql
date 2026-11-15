-- =============================================================================
-- Glowbook artist directory, "Find an artist near me" (decision 145)
-- =============================================================================
-- A public directory of the artists whose Glowbook is public, at /fr/artistes
-- and /en/artists, with one page per city (/fr/artistes/<city>). Decided by
-- the owner on 2026-11-14:
--   * explicit opt-in: the artist switches "Appear in the directory" on from
--     My Glowbook (off by default) — the directory shows their place of work
--     to people who never visited their page;
--   * search by city / area and "near me" (the browser's position, on a click
--     only, never sent to us: distances are computed in the browser);
--   * the map loads like the Glowbook's (as the visitor scrolls near it).
--
-- The directory exposes nothing the Glowbook page does not already show:
-- an approved page whose author holds the Glowbook's plan (the same checks as
-- studio_public_showcase()), its place as stored — a salon's public address,
-- or an area already rounded to ~1 km by the database (decision 108) —, the
-- approved profile picture, the approved spotlight / first creation render,
-- the badge only when the artist shows it. A listing also needs a place (a
-- directory "near me" without one is useless) and at least one approved
-- creation (no empty page in the list).
-- =============================================================================

alter table public.studio_showcases
  add column in_directory boolean not null default false;

comment on column public.studio_showcases.in_directory is
  'Artist directory (decision 145): the artist chose to appear in the public directory. Listed only while the page is public, has a place and an approved creation.';

-- -----------------------------------------------------------------------------
-- 1. The artist's switch
-- -----------------------------------------------------------------------------
-- The owner only; no Studio access needed, so leaving the directory is always
-- possible (joining without the plan shows nothing until the plan is back).
create or replace function public.studio_set_showcase_directory(p_listed boolean)
returns public.studio_showcases
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.studio_showcases;
begin
  if (select auth.uid()) is null then
    raise exception 'studio_set_showcase_directory: sign-in required' using errcode = '42501';
  end if;
  if p_listed is null then
    raise exception 'studio_set_showcase_directory: invalid value' using errcode = '22023';
  end if;
  update public.studio_showcases s set in_directory = p_listed
   where s.user_id = (select auth.uid())
  returning * into v_row;
  if v_row.user_id is null then
    raise exception 'studio_set_showcase_directory: no Glowbook yet' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

comment on function public.studio_set_showcase_directory(boolean) is
  'Artist directory (decision 145): the caller joins or leaves the public directory of artists.';

-- -----------------------------------------------------------------------------
-- 2. The public read
-- -----------------------------------------------------------------------------
-- Every listed artist, by name. Read by the server with the publishable key
-- (anon); the renders and pictures it names are signed through the existing
-- storage policies ("anyone reads public Glowbook renders / pictures").
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
         and private.glowbook_allowed(s.user_id)
         and private.glowbook_customization_allowed(s.user_id)
       order by lower(s.display_name), s.handle
       limit 1000
    ) x;
$$;

comment on function public.glowbook_directory() is
  'Artist directory (decision 145): the artists who opted in, whose Glowbook is public (approved, Glowbook plan) with a place and an approved creation — only what their page already shows.';

revoke all on function public.studio_set_showcase_directory(boolean) from public, anon;
grant execute on function public.studio_set_showcase_directory(boolean) to authenticated;
revoke all on function public.glowbook_directory() from public;
grant execute on function public.glowbook_directory() to anon, authenticated, service_role;
