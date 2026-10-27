-- =============================================================================
-- 3D Studio: templates and collections from the Artist plan up
-- (decision 113 (b), owner's request 2026-10-26)
-- =============================================================================
-- "Only give the Artist subscription access to the Global Toothgems templates
-- page. Creating folders in the Studio must only be available to Artist
-- subscriptions." Read as: the Artist plan and above (Atelier, active staff =
-- atelier) — a higher plan never loses what a lower one has.
--
--   * Templates: browsing them (studio_templates()), reading their renders
--     and copying one (studio_use_template()) need the Artist tier.
--     Publishing stays staff work (manage_content), unchanged.
--   * Collections ("folders"): reading, creating, renaming and filing a
--     creation into one need the Artist tier (owner, 2026-10-26: "after a move
--     to a smaller plan, simply stop showing the folders; they can no longer
--     be seen"). Nothing is deleted: the rows stay, unreadable, and come back
--     as they were on an upgrade. Their creations stay readable as ever.
--
-- The tier is private.studio_user_tier() (decision 101): an active trial is
-- essential, so a trial member has neither.
-- =============================================================================

create or replace function private.studio_artist_plan()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier((select auth.uid())) in ('artist', 'atelier'), false);
$$;

comment on function private.studio_artist_plan() is
  '3D Studio (decision 113 (b)): whether the caller is on the Artist plan or above (Artist / Atelier subscription, active staff) — templates and collections.';

revoke all on function private.studio_artist_plan() from public;
grant execute on function private.studio_artist_plan() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Templates
-- -----------------------------------------------------------------------------
create or replace function public.studio_templates()
returns table (
  id                    uuid,
  name                  text,
  description           text,
  tags                  text[],
  scene_data            jsonb,
  element_count         integer,
  estimated_price_minor integer,
  currency              char(3),
  thumbnail_path        text,
  published_at          timestamptz,
  updated_at            timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.studio_artist_plan() then
    raise exception 'studio_templates: Artist plan required' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.description, c.tags,
           c.scene_data || jsonb_build_object('groups', '[]'::jsonb),
           c.element_count, c.estimated_price_minor, c.currency, c.thumbnail_path,
           c.template_published_at, c.updated_at
      from public.creations c
     where c.template_published_at is not null
     order by c.template_published_at desc, c.id
     limit 500;
end;
$$;

comment on function public.studio_templates() is
  '3D Studio: the published Global Toothgems templates, newest first. Artist plan or above required (42501, decision 113 (b)). No owner data.';

create or replace function public.studio_use_template(p_template_id uuid)
returns public.creations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_template public.creations;
  v_copy     public.creations;
begin
  if v_user is null or not private.studio_artist_plan() then
    raise exception 'studio_use_template: Artist plan required' using errcode = '42501';
  end if;
  select * into v_template from public.creations c
   where c.id = p_template_id and c.template_published_at is not null;
  if v_template.id is null then
    raise exception 'studio_use_template: template not found' using errcode = 'P0002';
  end if;

  insert into public.creations (user_id, name, description, tags, scene_data,
                                estimated_price_minor, currency, last_opened_at)
  values (v_user, v_template.name, v_template.description, v_template.tags,
          v_template.scene_data || jsonb_build_object('groups', '[]'::jsonb),
          v_template.estimated_price_minor, v_template.currency, now())
  returning * into v_copy;
  return v_copy;
end;
$$;

comment on function public.studio_use_template(uuid) is
  '3D Studio: copies a published template into the caller''s own creations (Artist plan or above, decision 113 (b)). The template is not modified.';

alter policy "studio-thumbnails: Studio members read template renders"
  on storage.objects
  using (bucket_id = 'studio-thumbnails'
         and (select private.studio_artist_plan())
         and private.is_studio_template_thumbnail(name));

-- -----------------------------------------------------------------------------
-- 2. Collections
-- -----------------------------------------------------------------------------
drop policy "studio_collections: owners read" on public.studio_collections;
drop policy "studio_collection_creations: owners read" on public.studio_collection_creations;
drop policy "studio_collections: owners with Studio access insert" on public.studio_collections;
drop policy "studio_collections: owners with Studio access update" on public.studio_collections;
drop policy "studio_collection_creations: owners with Studio access add their own creations" on public.studio_collection_creations;

create policy "studio_collections: owners on the Artist plan read"
  on public.studio_collections for select to authenticated
  using (user_id = (select auth.uid()) and (select private.studio_artist_plan()));
create policy "studio_collection_creations: owners on the Artist plan read"
  on public.studio_collection_creations for select to authenticated
  using (user_id = (select auth.uid()) and (select private.studio_artist_plan()));
create policy "studio_collections: owners on the Artist plan insert"
  on public.studio_collections for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.studio_artist_plan()));
create policy "studio_collections: owners on the Artist plan update"
  on public.studio_collections for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.studio_artist_plan()));
create policy "studio_collection_creations: owners on the Artist plan add their own creations"
  on public.studio_collection_creations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.studio_artist_plan())
    and exists (select 1 from public.creations c
                 where c.id = creation_id and c.user_id = (select auth.uid()))
  );
