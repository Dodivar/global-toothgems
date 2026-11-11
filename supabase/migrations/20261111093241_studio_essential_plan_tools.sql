-- =============================================================================
-- 3D Studio: what the Essential plan opens, revised (decision 133,
-- owner's request 2026-11-11)
-- =============================================================================
-- "The Essential plan gets the Global Toothgems templates; it no longer gets
-- the posts for the social networks, nor the front view, the placement sheet
-- and the share links." Read as the two lines of the plan cards: "Front view,
-- placement sheet, share link" and "Posts for the social networks" move to the
-- Artist plan and above; the templates move down to every Studio tier.
--
--   * Templates: browsing (studio_templates()), reading their renders and
--     copying one (studio_use_template()) need any Studio tier
--     (private.studio_templates_allowed()). Collections stay Artist and up
--     (private.studio_artist_plan(), decision 113 (b), unchanged).
--   * Share links: creating one (studio_share_creation()) needs the Artist
--     tier (private.studio_share_links_allowed()). Disabling one stays open to
--     every owner. A link whose owner is below Artist no longer opens (viewer,
--     preview card, card render): nothing is deleted, the link comes back as
--     it was on an upgrade — the precedent of the folders and the Glowbook.
--   * Posts, the front view and the placement sheet are drawn in the browser
--     from the member's own creation: the screens hold them back
--     (STUDIO_PLAN_FEATURES `posts` / `clientTools`), nothing to enforce here.
--
-- The tier is private.studio_user_tier() (decision 101): an active trial is
-- essential, active staff atelier.
-- =============================================================================

create or replace function private.studio_templates_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier((select auth.uid())) in ('essential', 'artist', 'atelier'), false);
$$;

comment on function private.studio_templates_allowed() is
  '3D Studio (decision 133): whether the caller may browse and copy the Global Toothgems templates — any Studio tier (trial, Essential, Artist, Atelier, active staff).';

revoke all on function private.studio_templates_allowed() from public;
grant execute on function private.studio_templates_allowed() to authenticated, service_role;

create or replace function private.studio_share_links_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier(p_user) in ('artist', 'atelier'), false);
$$;

comment on function private.studio_share_links_allowed(uuid) is
  '3D Studio (decision 133): whether a member''s read-only share links are open — Artist plan or above (Artist / Atelier subscription, active staff).';

revoke all on function private.studio_share_links_allowed(uuid) from public;
grant execute on function private.studio_share_links_allowed(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Templates: every Studio tier
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
  if (select auth.uid()) is null or not private.studio_templates_allowed() then
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
  '3D Studio: the published Global Toothgems templates, newest first. Any Studio tier (42501 otherwise, decision 133). No owner data.';

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
  if v_user is null or not private.studio_templates_allowed() then
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
  '3D Studio: copies a published template into the caller''s own creations (any Studio tier, decision 133). The template is not modified.';

alter policy "studio-thumbnails: Studio members read template renders"
  on storage.objects
  using (bucket_id = 'studio-thumbnails'
         and (select private.studio_templates_allowed())
         and private.is_studio_template_thumbnail(name));

-- -----------------------------------------------------------------------------
-- 2. Share links: Artist and up
-- -----------------------------------------------------------------------------
create or replace function public.studio_share_creation(p_creation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_token text;
begin
  if v_user is null then
    raise exception 'studio_share_creation: sign-in required' using errcode = '42501';
  end if;
  if not private.studio_share_links_allowed(v_user) then
    raise exception 'studio_share_creation: Artist plan required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creations c where c.id = p_creation_id and c.user_id = v_user) then
    raise exception 'studio_share_creation: creation not found' using errcode = 'P0002';
  end if;

  insert into public.creation_shares (creation_id, user_id)
  values (p_creation_id, v_user)
  on conflict (creation_id) where revoked_at is null do nothing;

  select s.token into v_token
    from public.creation_shares s
   where s.creation_id = p_creation_id and s.user_id = v_user and s.revoked_at is null;
  return v_token;
end;
$$;

comment on function public.studio_share_creation(uuid) is
  '3D Studio: the active read-only link of one of the caller''s creations, created on first use. Artist plan or above (42501 otherwise, decision 133).';

create or replace function public.studio_shared_creation(p_token text)
returns table (name text, description text, scene_data jsonb, updated_at timestamptz, try_on boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name,
         c.description,
         case
           when jsonb_typeof(c.scene_data -> 'groups') = 'array' then
             jsonb_set(c.scene_data, '{groups}', (
               select coalesce(jsonb_agg(case when jsonb_typeof(g) = 'object'
                                              then g || jsonb_build_object('gemGroupId', null)
                                              else g end), '[]'::jsonb)
                 from jsonb_array_elements(c.scene_data -> 'groups') as g))
           else c.scene_data
         end,
         c.updated_at,
         private.studio_try_on_allowed(c.user_id)
    from public.creation_shares s
    join public.creations c on c.id = s.creation_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
     and s.token = p_token
     and s.revoked_at is null
     and private.studio_share_links_allowed(s.user_id);
$$;

comment on function public.studio_shared_creation(text) is
  '3D Studio share link: the shared creation (name, description, scene, whether it may be tried on a photo — decision 111) behind an active token whose owner is on the Artist plan or above (decision 133); nothing about its owner.';

create or replace function public.studio_shared_creation_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', c.name, 'description', c.description, 'thumbnail_path', c.thumbnail_path)
    from public.creation_shares s
    join public.creations c on c.id = s.creation_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
     and s.token = p_token
     and s.revoked_at is null
     and private.studio_share_links_allowed(s.user_id);
$$;

comment on function public.studio_shared_creation_preview(text) is
  '3D Studio share links (decision 101 addendum, 133): name, description and card render path of an active share link whose owner is on the Artist plan or above, for the viewer page''s preview card. Null otherwise.';

create or replace function private.is_shared_creation_thumbnail(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.creations c
      join public.creation_shares s on s.creation_id = c.id and s.revoked_at is null
     where c.thumbnail_path = p_name
       and private.studio_share_links_allowed(s.user_id)
  );
$$;

comment on function private.is_shared_creation_thumbnail(text) is
  '3D Studio: whether a studio-thumbnails file is the card render of a creation with an open share link (decision 101 addendum, 133: owner on the Artist plan or above).';
