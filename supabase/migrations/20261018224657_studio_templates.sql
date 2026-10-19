-- =============================================================================
-- 3D Studio: the Global Toothgems template library
-- =============================================================================
-- Templates are ordinary Studio creations made by team members and published
-- with one flag (`creations.template_published_at`). Every member with Studio
-- access (active trial, active subscription or active staff — the same
-- `private.has_studio_access()` as the write policies, decision 93) browses
-- them and reuses one: "Use this template" copies it into the member's own
-- creations, a new design they own and edit freely. The original is never
-- touched. No separate authoring tool: staff design in the editor like anyone.
--
-- Access model:
--   * The `creations` SELECT policy is unchanged (owners only): members never
--     read a staff design row, flagged or not. Their only door to templates is
--     `public.studio_templates()`, a SECURITY DEFINER reader that checks Studio
--     access and returns the published rows' content — never their owner,
--     favourite flag or opening dates.
--   * `public.studio_use_template(id)` copies one published template into the
--     caller's designs (owner = auth.uid(), never published, no thumbnail —
--     the browser copies the render afterwards, best effort, like a duplicate).
--     Gem Group references are dropped: they point at the author's own groups.
--   * `public.studio_set_template(id, published)` is the only writer of the
--     flag (not in the column grants): `manage_content` staff publish their
--     own creations and unpublish any template (an author who left included).
--     Publishing keeps the first publication date; changes are audited.
--   * Template renders stay in the author's folder of the private
--     `studio-thumbnails` bucket; a read policy lets members with Studio
--     access read (sign, copy) exactly the files of published templates.
--   * Templates are live, like share links: the author's later saves show at
--     once. Deleting the creation (or the account) removes the template; the
--     members' copies are theirs and stay.
--
-- Decision 97 in supabase/README.md.
-- =============================================================================

alter table public.creations add column template_published_at timestamptz;

comment on column public.creations.template_published_at is
  'Set: published as a Global Toothgems template since then (staff, studio_set_template()). Read by members through studio_templates() only.';

create index creations_templates_idx on public.creations (template_published_at desc)
  where template_published_at is not null;

-- -----------------------------------------------------------------------------
-- 1. Members: the library and the copy
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
  if (select auth.uid()) is null or not private.has_studio_access() then
    raise exception 'studio_templates: Studio access required' using errcode = '42501';
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
  '3D Studio: the published Global Toothgems templates, newest first. Studio access required (42501). No owner data.';

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
  if v_user is null or not private.has_studio_access() then
    raise exception 'studio_use_template: Studio access required' using errcode = '42501';
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
  '3D Studio: copies a published template into the caller''s own creations (Studio access required). The template is not modified.';

-- -----------------------------------------------------------------------------
-- 2. Staff: publish / unpublish
-- -----------------------------------------------------------------------------
create or replace function public.studio_set_template(p_creation_id uuid, p_published boolean)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_at   timestamptz;
begin
  if v_user is null or not private.has_permission('manage_content') then
    raise exception 'studio_set_template: manage_content required' using errcode = '42501';
  end if;
  if p_published is null then
    raise exception 'studio_set_template: published must be true or false' using errcode = '22023';
  end if;

  if p_published then
    -- Only one's own creation: a template is a design its author made.
    update public.creations c
       set template_published_at = coalesce(c.template_published_at, now())
     where c.id = p_creation_id and c.user_id = v_user
    returning c.template_published_at into v_at;
    if not found then
      raise exception 'studio_set_template: creation not found' using errcode = 'P0002';
    end if;
    return v_at;
  end if;

  -- Any template, whoever made it.
  update public.creations c
     set template_published_at = null
   where c.id = p_creation_id and (c.user_id = v_user or c.template_published_at is not null);
  if not found then
    raise exception 'studio_set_template: template not found' using errcode = 'P0002';
  end if;
  return null;
end;
$$;

comment on function public.studio_set_template(uuid, boolean) is
  '3D Studio: manage_content staff publish their own creation as a template (keeps the first date) or unpublish any template. Audited.';

create trigger creations_template_audit
  after update of template_published_at on public.creations
  for each row execute function private.audit_changes('template_published_at');

-- -----------------------------------------------------------------------------
-- 3. Template renders: readable by members with Studio access
-- -----------------------------------------------------------------------------
create or replace function private.is_studio_template_thumbnail(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.creations c
     where c.thumbnail_path = p_name and c.template_published_at is not null
  );
$$;

create index creations_template_thumbnail_idx on public.creations (thumbnail_path)
  where template_published_at is not null;

create policy "studio-thumbnails: Studio members read template renders"
  on storage.objects for select to authenticated
  using (bucket_id = 'studio-thumbnails'
         and (select private.has_studio_access())
         and private.is_studio_template_thumbnail(name));

-- -----------------------------------------------------------------------------
-- 4. Privileges
-- -----------------------------------------------------------------------------
-- The flag is not in the column grants of 20260928222836: only the function writes it.
revoke all on function private.is_studio_template_thumbnail(text) from public;
grant execute on function private.is_studio_template_thumbnail(text) to authenticated, service_role;

revoke all on function public.studio_templates(), public.studio_use_template(uuid),
                       public.studio_set_template(uuid, boolean) from public, anon;
grant execute on function public.studio_templates(), public.studio_use_template(uuid),
                          public.studio_set_template(uuid, boolean) to authenticated, service_role;
