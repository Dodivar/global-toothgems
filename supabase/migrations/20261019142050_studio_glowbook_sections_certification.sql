-- =============================================================================
-- 3D Studio Glowbook: sections and the certified-artist badge (decision 101)
-- =============================================================================
-- Two additions to an artist's Glowbook (decisions 99 and 100):
--
--   * Sections ("Mariage", "Minimaliste"…): the artist names, orders and
--     deletes sections and files each Glowbook creation in at most one of
--     them (or none). The public page groups / filters by section; creations
--     without a section still show. A section name is short public text: like
--     the name, bio and city (decision 99 (b)) it is live once the page is
--     approved (moderators see the names with the page in the queue). Only
--     sections holding at least one approved creation are shown. Sections are
--     part of the look: writes and their public display follow the plan switch
--     private.glowbook_customization_allowed(user).
--   * "Artiste certifiée Global Toothgems": derived by the database from the
--     artist's Academy completions that issued a certificate
--     (course_completions.certificate_code is not null) — never from the
--     browser. The public page shows only the course titles (no code, date or
--     id). The artist may hide it (studio_showcases.show_certification,
--     default shown). Not gated by the plan switch: it rewards training.
--
-- Access model as before: members read their own rows (RLS) and write
-- through the SECURITY DEFINER functions below (Studio access + plan switch +
-- ownership); deleting a section is a plain DELETE of their own row, allowed
-- whatever the access (its creations simply lose their section). The
-- composite foreign key keeps an item from being filed in someone else's
-- section at the schema level.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sections
-- -----------------------------------------------------------------------------
create table public.studio_showcase_sections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.studio_showcases (user_id) on delete cascade,
  name        text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint studio_showcase_sections_owner_key unique (id, user_id)
);

comment on table public.studio_showcase_sections is
  '3D Studio Glowbook: the sections of an artist''s Glowbook (decision 101). Owners read and delete theirs, moderators read all; written through studio_save_showcase_section() / studio_reorder_showcase_sections(); public through studio_public_showcase() only.';

create unique index studio_showcase_sections_name_key on public.studio_showcase_sections (user_id, lower(name));
create index studio_showcase_sections_user_idx on public.studio_showcase_sections (user_id, position);

create trigger studio_showcase_sections_touch before update on public.studio_showcase_sections
  for each row execute function private.set_updated_at();

alter table public.studio_showcase_sections enable row level security;
revoke all on public.studio_showcase_sections from anon, authenticated;
grant select, delete on public.studio_showcase_sections to authenticated;

create policy "studio_showcase_sections: owners and moderators read"
  on public.studio_showcase_sections for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('moderate_reviews')));
create policy "studio_showcase_sections: owners delete"
  on public.studio_showcase_sections for delete to authenticated
  using (user_id = (select auth.uid()));

-- An item is filed in at most one section, of its own author; deleting the
-- section only clears the item's section (the column list keeps user_id).
alter table public.studio_showcase_items
  add column section_id uuid,
  add constraint studio_showcase_items_section_fkey foreign key (section_id, user_id)
    references public.studio_showcase_sections (id, user_id) on delete set null (section_id);

create index studio_showcase_items_section_idx on public.studio_showcase_items (section_id, user_id) where section_id is not null;

-- -----------------------------------------------------------------------------
-- 2. The badge switch
-- -----------------------------------------------------------------------------
alter table public.studio_showcases
  add column show_certification boolean not null default true;

-- -----------------------------------------------------------------------------
-- 3. Members: sections
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_sections_writer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_customization_allowed(v_user) then
    raise exception 'glowbook sections: Studio access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.studio_showcases s where s.user_id = v_user) then
    raise exception 'glowbook sections: no Glowbook yet' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

-- Creates a section (p_section_id null, placed last) or renames one of the caller's.
create or replace function public.studio_save_showcase_section(p_section_id uuid, p_name text)
returns public.studio_showcase_sections
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.glowbook_sections_writer();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_row  public.studio_showcase_sections;
begin
  if char_length(v_name) not between 1 and 40 then
    raise exception 'studio_save_showcase_section: invalid name' using errcode = '22023';
  end if;
  if exists (select 1 from public.studio_showcase_sections x
              where x.user_id = v_user and lower(x.name) = lower(v_name)
                and x.id is distinct from p_section_id) then
    raise exception 'studio_save_showcase_section: name taken' using errcode = '23505';
  end if;

  if p_section_id is null then
    if (select count(*) from public.studio_showcase_sections x where x.user_id = v_user) >= 12 then
      raise exception 'studio_save_showcase_section: too many sections' using errcode = '54000';
    end if;
    insert into public.studio_showcase_sections (user_id, name, position)
    values (v_user, v_name,
            coalesce((select max(x.position) + 1 from public.studio_showcase_sections x where x.user_id = v_user), 0))
    returning * into v_row;
    return v_row;
  end if;

  update public.studio_showcase_sections x set name = v_name
   where x.id = p_section_id and x.user_id = v_user
  returning * into v_row;
  if v_row.id is null then
    raise exception 'studio_save_showcase_section: section not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

comment on function public.studio_save_showcase_section(uuid, text) is
  '3D Studio Glowbook (decision 101): creates (null id) or renames one of the caller''s sections. Studio access + plan switch; at most 12; names unique per Glowbook (case-insensitive).';

create or replace function public.studio_reorder_showcase_sections(p_section_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.glowbook_sections_writer();
begin
  if p_section_ids is null or cardinality(p_section_ids) > 12 then
    raise exception 'studio_reorder_showcase_sections: invalid order' using errcode = '22023';
  end if;
  update public.studio_showcase_sections x
     set position = o.ord - 1
    from unnest(p_section_ids) with ordinality as o(id, ord)
   where x.id = o.id and x.user_id = v_user and x.position <> o.ord - 1;
end;
$$;

comment on function public.studio_reorder_showcase_sections(uuid[]) is
  '3D Studio Glowbook (decision 101): sets the order of the caller''s sections (first = first on the page). Others'' rows are ignored.';

-- Files one of the caller's Glowbook creations in one of their sections (null: none).
create or replace function public.studio_set_showcase_item_section(p_item_id uuid, p_section_id uuid)
returns public.studio_showcase_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.glowbook_sections_writer();
  v_row  public.studio_showcase_items;
begin
  if p_section_id is not null and not exists (
    select 1 from public.studio_showcase_sections x where x.id = p_section_id and x.user_id = v_user
  ) then
    raise exception 'studio_set_showcase_item_section: section not found' using errcode = 'P0002';
  end if;
  update public.studio_showcase_items i set section_id = p_section_id
   where i.id = p_item_id and i.user_id = v_user
  returning * into v_row;
  if v_row.id is null then
    raise exception 'studio_set_showcase_item_section: item not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

comment on function public.studio_set_showcase_item_section(uuid, uuid) is
  '3D Studio Glowbook (decision 101): files one of the caller''s Glowbook creations in one of their sections, or in none (null). Studio access + plan switch.';

-- -----------------------------------------------------------------------------
-- 4. The certified-artist badge
-- -----------------------------------------------------------------------------
-- The courses a member completed with a certificate, oldest first, as
-- [{fr, en}] titles (en: the published English title, else the French one).
-- Withdrawn courses still count: the certificate stays valid.
create or replace function private.glowbook_certification(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('fr', c.title, 'en', coalesce(tr.title, c.title))
                            order by cc.completed_at, c.title), '[]'::jsonb)
    from public.course_completions cc
    join public.courses c on c.id = cc.course_id
    left join public.course_translations tr on tr.course_id = c.id and tr.locale = 'en' and tr.status = 'published'
   where cc.user_id = p_user
     and cc.certificate_code is not null;
$$;

-- The caller's own badge, for the Studio's preview (whatever the switch).
create or replace function public.studio_my_certification()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'studio_my_certification: sign-in required' using errcode = '42501';
  end if;
  return private.glowbook_certification((select auth.uid()));
end;
$$;

comment on function public.studio_my_certification() is
  '3D Studio Glowbook (decision 101): the titles of the courses the caller completed with a certificate, [{fr, en}] — what their badge shows.';

-- Shows or hides the badge. The owner only; no Studio access needed (it only
-- changes what their own page says about them).
create or replace function public.studio_set_showcase_certification(p_visible boolean)
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
    raise exception 'studio_set_showcase_certification: sign-in required' using errcode = '42501';
  end if;
  if p_visible is null then
    raise exception 'studio_set_showcase_certification: invalid value' using errcode = '22023';
  end if;
  update public.studio_showcases s set show_certification = p_visible
   where s.user_id = (select auth.uid())
  returning * into v_row;
  if v_row.user_id is null then
    raise exception 'studio_set_showcase_certification: no Glowbook yet' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

comment on function public.studio_set_showcase_certification(boolean) is
  '3D Studio Glowbook (decision 101): shows or hides the "certified artist" badge on the caller''s page.';

-- -----------------------------------------------------------------------------
-- 5. The public page: sections and badge
-- -----------------------------------------------------------------------------
create or replace function public.studio_public_showcase(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'handle', s.handle,
           'display_name', s.display_name,
           'bio', s.bio,
           'instagram', s.instagram,
           'location', s.location,
           'look', case when private.glowbook_customization_allowed(s.user_id) then jsonb_build_object(
             'accent', s.accent, 'background', s.background, 'layout', s.layout,
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path,
             'booking_url', s.booking_url, 'website_url', s.website_url, 'tiktok', s.tiktok,
             'featured_item_id', (select i.id from public.studio_showcase_items i
                                   where i.id = s.featured_item_id and i.status = 'approved'))
             else null end,
           -- Sections holding at least one approved creation, in the artist's order (plan switch).
           'sections', case when private.glowbook_customization_allowed(s.user_id) then coalesce((
             select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.position, x.created_at)
               from public.studio_showcase_sections x
              where x.user_id = s.user_id
                and exists (select 1 from public.studio_showcase_items i
                             where i.section_id = x.id and i.user_id = s.user_id and i.status = 'approved')
           ), '[]'::jsonb) else '[]'::jsonb end,
           -- Course titles only; absent when hidden or when there is none.
           'certification', case when s.show_certification
                                  and jsonb_array_length(private.glowbook_certification(s.user_id)) > 0
                                 then jsonb_build_object('courses', private.glowbook_certification(s.user_id))
                                 else null end,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', i.id,
                      'name', c.name,
                      'description', c.description,
                      'element_count', jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
                      'thumbnail_path', c.thumbnail_path,
                      'updated_at', c.updated_at,
                      'section_id', case when private.glowbook_customization_allowed(s.user_id) then i.section_id end)
                    order by i.position, i.created_at)
               from public.studio_showcase_items i
               join public.creations c on c.id = i.creation_id
              where i.user_id = s.user_id and i.status = 'approved'
           ), '[]'::jsonb))
    from public.studio_showcases s
   where s.handle = lower(btrim(p_handle))
     and s.status = 'approved'
     and private.studio_user_has_access(s.user_id);
$$;

-- -----------------------------------------------------------------------------
-- 6. Moderators see the section names with the page
-- -----------------------------------------------------------------------------
create or replace function public.studio_showcase_queue()
returns table (
  kind              text,       -- 'showcase' | 'item' | 'changes'
  id                uuid,       -- item id, or the showcase's user id
  user_id           uuid,
  status            text,
  review_note       text,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  handle            text,
  display_name      text,
  bio               text,
  instagram         text,
  showcase_status   text,
  creation_name     text,
  creation_description text,
  element_count     integer,
  thumbnail_path    text,
  creation_updated_at timestamptz,
  details           jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_permission('moderate_reviews') then
    raise exception 'studio_showcase_queue: moderate_reviews required' using errcode = '42501';
  end if;
  return query
    select 'showcase'::text, s.user_id, s.user_id, s.status, s.review_note, s.submitted_at, s.reviewed_at,
           s.handle, s.display_name, s.bio, s.instagram, s.status,
           null::text, null::text, null::integer, null::text, null::timestamptz,
           jsonb_build_object('approved', jsonb_build_object(
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path, 'booking_url', s.booking_url,
             'website_url', s.website_url, 'tiktok', s.tiktok, 'location', s.location, 'accent', s.accent),
             'pending', s.pending_changes,
             'sections', coalesce((select jsonb_agg(x.name order by x.position, x.created_at)
                                     from public.studio_showcase_sections x where x.user_id = s.user_id), '[]'::jsonb))
      from public.studio_showcases s
    union all
    select 'changes'::text, s.user_id, s.user_id,
           case when s.pending_changes is not null then 'pending' else 'rejected' end,
           s.changes_review_note, coalesce(s.changes_submitted_at, s.updated_at), null::timestamptz,
           s.handle, s.display_name, null::text, null::text, s.status,
           null::text, null::text, null::integer, null::text, null::timestamptz,
           jsonb_build_object('approved', jsonb_build_object(
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path, 'booking_url', s.booking_url,
             'website_url', s.website_url, 'tiktok', s.tiktok),
             'pending', s.pending_changes)
      from public.studio_showcases s
     where s.pending_changes is not null or s.changes_review_note is not null
    union all
    select 'item'::text, i.id, i.user_id, i.status, i.review_note, i.submitted_at, i.reviewed_at,
           s.handle, s.display_name, null::text, null::text, s.status,
           c.name, c.description, jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
           c.thumbnail_path, c.updated_at, null::jsonb
      from public.studio_showcase_items i
      join public.studio_showcases s on s.user_id = i.user_id
      join public.creations c on c.id = i.creation_id
    order by 6 desc
    limit 1000;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.glowbook_sections_writer(), private.glowbook_certification(uuid) from public;
grant execute on function private.glowbook_sections_writer() to authenticated, service_role;
grant execute on function private.glowbook_certification(uuid) to service_role;

revoke all on function public.studio_save_showcase_section(uuid, text), public.studio_reorder_showcase_sections(uuid[]),
                       public.studio_set_showcase_item_section(uuid, uuid), public.studio_my_certification(),
                       public.studio_set_showcase_certification(boolean) from public, anon;
grant execute on function public.studio_save_showcase_section(uuid, text), public.studio_reorder_showcase_sections(uuid[]),
                          public.studio_set_showcase_item_section(uuid, uuid), public.studio_my_certification(),
                          public.studio_set_showcase_certification(boolean) to authenticated, service_role;
