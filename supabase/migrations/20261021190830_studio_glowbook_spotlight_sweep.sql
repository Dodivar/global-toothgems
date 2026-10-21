-- =============================================================================
-- 3D Studio Glowbook: the spotlight video sweeps in front of the smile
-- (decision 105, owner's request 2026-10-21)
-- =============================================================================
-- The spotlight video no longer turns all around the model: the camera stays
-- in front of the smile and sweeps from 45° left to 45° right and back, in one
-- fixed length of 5 seconds (no choice offered to the artist), so the looping
-- video goes right, left, right… over the gems.
--
-- Only the 5-second kind is current: the 4/6/8-second full turns recorded
-- under decision 103 stop being shown, and the artist's Studio records the
-- new kind automatically (it records whenever the state is not current).
-- =============================================================================

alter table public.studio_showcases
  drop constraint studio_showcases_spotlight_video_seconds_check,
  add constraint studio_showcases_spotlight_video_seconds_check check (spotlight_video_seconds in (4, 5, 6, 8));

comment on column public.studio_showcases.spotlight_video_seconds is
  'Glowbook spotlight video length: 5 = the front sweep (decision 105), the only current kind; 4/6/8 = full turns of decision 103, no longer shown.';

create or replace function private.glowbook_spotlight_video_current(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.studio_showcases s
      join public.studio_showcase_items i on i.id = s.spotlight_video_item_id and i.user_id = s.user_id
      join public.creations c on c.id = i.creation_id
     where s.user_id = p_user
       and s.spotlight_video_path is not null
       and s.spotlight_video_seconds = 5   -- the front sweep (decision 105)
       and s.spotlight_video_item_id = s.featured_item_id
       and md5(c.scene_data::text) = s.spotlight_video_scene_md5
  );
$$;

create or replace function public.studio_set_spotlight_video(
  p_item_id uuid, p_path text, p_type text, p_seconds integer, p_creation_updated_at timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_md5  text;
  v_at   timestamptz;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_customization_allowed(v_user) then
    raise exception 'studio_set_spotlight_video: Studio access required' using errcode = '42501';
  end if;
  if p_item_id is null or p_path is null or p_type is null or p_seconds is null or p_creation_updated_at is null
     or p_type not in ('video/mp4', 'video/webm') or p_seconds <> 5 then
    raise exception 'studio_set_spotlight_video: invalid video' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_showcases s
                  where s.user_id = v_user and s.featured_item_id = p_item_id) then
    raise exception 'studio_set_spotlight_video: not your spotlight creation' using errcode = '22023';
  end if;
  if p_path not like v_user::text || '/%' or not exists (
    select 1 from storage.objects o where o.bucket_id = 'glowbook-videos' and o.name = p_path
  ) then
    raise exception 'studio_set_spotlight_video: unknown file' using errcode = '22023';
  end if;
  select md5(c.scene_data::text), c.updated_at into v_md5, v_at
    from public.studio_showcase_items i
    join public.creations c on c.id = i.creation_id
   where i.id = p_item_id and i.user_id = v_user;
  if v_at is distinct from p_creation_updated_at then
    raise exception 'studio_set_spotlight_video: the creation changed' using errcode = '40001';
  end if;

  update public.studio_showcases s
     set spotlight_video_path = p_path, spotlight_video_item_id = p_item_id, spotlight_video_scene_md5 = v_md5,
         spotlight_video_type = p_type, spotlight_video_seconds = p_seconds, spotlight_video_at = now()
   where s.user_id = v_user;
  return public.studio_spotlight_video_state();
end;
$$;

comment on function public.studio_set_spotlight_video(uuid, text, text, integer, timestamptz) is
  'Glowbook spotlight video (decisions 103 and 105): records the 5-second front sweep the artist''s browser drew for the current spotlight creation; refused (40001) when the creation changed since.';
