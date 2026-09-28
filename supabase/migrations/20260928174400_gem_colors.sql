-- =============================================================================
-- Migration — Gem colours managed from the back office
-- =============================================================================
-- The storefront's colour filter (shop chips, /couleurs, header carousels)
-- used a list hard-coded in the front end. It becomes data: the team creates,
-- renames, translates, reorders, hides and deletes colours from the admin
-- "Catégories" page.
--
-- Model:
--   * gem_colors: one row per colour. `slug` is the value stored in
--     products.metadata.color and carried by the `couleur` URL parameter, so
--     it is set once at creation and never changes (a renamed colour keeps its
--     links and its products). `name` is the default-language (fr) label.
--   * A colour is ONE exact shade (`hex`, #rrggbb) — no two-tone colours.
--     Gems with special reflections or several colours go into the single
--     "multicolour" entry (`is_multicolor`, no hex; the storefront paints it
--     with a fixed iridescent swatch). It is a colour like any other in the
--     filter, and products point at it by its slug like any other.
--   * gem_color_translations: other languages, same pattern as
--     category_translations (draft/published, never the default locale).
--   * products.metadata.color stays a slug (presentation data), but a trigger
--     now rejects a slug that is not a known colour, and a colour still used by
--     a product cannot be deleted — hide it (is_active = false) instead.
--
-- Writes go through SECURITY INVOKER functions so a colour and its English
-- name are saved in one transaction; RLS (manage_products) decides.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.gem_colors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  hex           text check (hex ~ '^#[0-9a-f]{6}$'),
  is_multicolor boolean not null default false,
  is_active     boolean not null default true,
  position      integer not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  constraint gem_colors_one_shade
    check ((is_multicolor and hex is null) or (not is_multicolor and hex is not null))
);

comment on table public.gem_colors is
  'Colour families of the storefront gem filter. slug = value of products.metadata.color and of the couleur URL parameter (immutable).';
comment on column public.gem_colors.hex is
  'The exact shade, lowercase #rrggbb. NULL only for the multicolour entry.';
comment on column public.gem_colors.is_multicolor is
  'The single entry grouping gems with special reflections or several colours. At most one row.';

create unique index gem_colors_one_multicolor_idx on public.gem_colors (is_multicolor) where is_multicolor;
create index gem_colors_active_position_idx on public.gem_colors (is_active, position);

alter table public.gem_colors enable row level security;

create trigger gem_colors_audit
  before insert or update on public.gem_colors
  for each row execute function private.set_audit_columns();

-- The slug lives in URLs and in product metadata; the kind decides whether a
-- hex applies. Neither changes after creation.
create or replace function private.guard_gem_color_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'gem_colors: slug cannot change' using errcode = '22023';
  end if;
  if new.is_multicolor is distinct from old.is_multicolor then
    raise exception 'gem_colors: is_multicolor cannot change' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger gem_colors_guard_update
  before update on public.gem_colors
  for each row execute function private.guard_gem_color_update();

create trigger gem_colors_audit_log
  after update on public.gem_colors
  for each row execute function private.audit_changes('name', 'hex', 'is_active');
create trigger gem_colors_audit_log_delete
  after delete on public.gem_colors
  for each row execute function private.audit_changes();

create table public.gem_color_translations (
  gem_color_id uuid not null references public.gem_colors (id) on delete cascade,
  locale       text not null references public.languages (code) on update cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null,
  primary key (gem_color_id, locale)
);

create index gem_color_translations_locale_idx on public.gem_color_translations (locale);

alter table public.gem_color_translations enable row level security;

create trigger gem_color_translations_not_default_locale
  before insert or update on public.gem_color_translations
  for each row execute function private.reject_default_locale_translation();
create trigger gem_color_translations_audit
  before insert or update on public.gem_color_translations
  for each row execute function private.set_translation_audit();

-- -----------------------------------------------------------------------------
-- Privileges + RLS: visitors read active colours and their published
-- translations; staff read everything; manage_products writes.
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on public.gem_colors, public.gem_color_translations from anon, authenticated;
revoke insert, update, delete on public.gem_colors, public.gem_color_translations from anon;

create policy "gem_colors: public reads active, staff read all"
  on public.gem_colors for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy "gem_colors: staff insert"
  on public.gem_colors for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "gem_colors: staff update"
  on public.gem_colors for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "gem_colors: staff delete"
  on public.gem_colors for delete to authenticated
  using ((select private.has_permission('manage_products')));

create policy "gem_color_translations: public reads published, staff read all"
  on public.gem_color_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.gem_colors c
      where c.id = gem_color_translations.gem_color_id and c.is_active))
    or (select private.is_staff())
  );
create policy "gem_color_translations: staff insert"
  on public.gem_color_translations for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "gem_color_translations: staff update"
  on public.gem_color_translations for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "gem_color_translations: staff delete"
  on public.gem_color_translations for delete to authenticated
  using ((select private.has_permission('manage_products')));

-- -----------------------------------------------------------------------------
-- Seed: the ten colours the front end offered until now (same slugs, so the
-- products already tagged keep their colour), plus the multicolour entry.
-- -----------------------------------------------------------------------------
with seeded (slug, name_fr, name_en, hex, is_multicolor, position) as (
  values
    ('crystal',    'Cristal clair', 'Clear crystal', '#d3e0ef', false, 0),
    ('aquamarine', 'Aigue-marine',  'Aquamarine',    '#6fb3c9', false, 1),
    ('capri',      'Bleu Capri',    'Capri blue',    '#1f6dab', false, 2),
    ('sapphire',   'Saphir',        'Sapphire',      '#2b3f96', false, 3),
    ('amethyst',   'Améthyste',     'Amethyst',      '#8e6bb5', false, 4),
    ('heliotrope', 'Héliotrope AB', 'Heliotrope AB', '#9c8fd8', false, 5),
    ('peridot',    'Péridot',       'Peridot',       '#8fb34a', false, 6),
    ('topaz',      'Topaze',        'Topaz',         '#d9a03f', false, 7),
    ('opal',       'Opale',         'Opal',          '#cfe6e2', false, 8),
    ('gold',       'Or 18k',        '18k gold',      '#c8992f', false, 9),
    ('multicolor', 'Multicolore',   'Multicolour',   null,      true,  10)
), inserted as (
  insert into public.gem_colors (slug, name, hex, is_multicolor, position)
  select slug, name_fr, hex, is_multicolor, position from seeded
  returning id, slug
)
insert into public.gem_color_translations (gem_color_id, locale, name, status)
select i.id, 'en', s.name_en, 'published'
  from inserted i join seeded s using (slug);

-- -----------------------------------------------------------------------------
-- products.metadata.color must name a known colour. SECURITY DEFINER only to
-- read gem_colors whatever the caller's RLS; it reads, never writes.
-- -----------------------------------------------------------------------------
create or replace function private.check_product_gem_color()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_color text := nullif(new.metadata ->> 'color', '');
begin
  if v_color is not null
     and (tg_op = 'INSERT' or v_color is distinct from nullif(old.metadata ->> 'color', ''))
     and not exists (select 1 from public.gem_colors where slug = v_color) then
    raise exception 'products: unknown gem colour %', v_color using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function private.check_product_gem_color() from public;

create trigger products_check_gem_color
  before insert or update of metadata on public.products
  for each row execute function private.check_product_gem_color();

-- -----------------------------------------------------------------------------
-- Create or update a colour with its English name, in one transaction.
-- Payload:
--   id        uuid, absent/null = create
--   slug      create only: wished slug (made unique with a suffix); ignored on update
--   name      French name (base column), required
--   name_en   English name, required (published on save)
--   hex       #rrggbb, required for a normal colour, forbidden for the
--             multicolour entry. New colours are always normal colours.
--   is_active boolean, default true
-- Returns { id, slug }.
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_gem_color(p_color jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id      uuid := nullif(p_color ->> 'id', '')::uuid;
  v_name    text := btrim(coalesce(p_color ->> 'name', ''));
  v_name_en text := btrim(coalesce(p_color ->> 'name_en', ''));
  v_hex     text := lower(nullif(btrim(coalesce(p_color ->> 'hex', '')), ''));
  v_active  boolean := coalesce((p_color ->> 'is_active')::boolean, true);
  v_multi   boolean;
  v_base    text;
  v_slug    text;
  v_n       integer := 1;
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_save_gem_color: permission denied' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'admin_save_gem_color: a French name is required' using errcode = '22023';
  end if;
  if char_length(v_name_en) not between 1 and 60 then
    raise exception 'admin_save_gem_color: an English name is required' using errcode = '22023';
  end if;

  if v_id is not null and exists (select 1 from public.gem_colors where id = v_id) then
    select is_multicolor into v_multi from public.gem_colors where id = v_id;
    if v_multi and v_hex is not null then
      raise exception 'admin_save_gem_color: the multicolour entry has no single shade' using errcode = '22023';
    end if;
    if not v_multi and (v_hex is null or v_hex !~ '^#[0-9a-f]{6}$') then
      raise exception 'admin_save_gem_color: invalid colour' using errcode = '22023';
    end if;
    update public.gem_colors
       set name = v_name, hex = v_hex, is_active = v_active
     where id = v_id
    returning slug into v_slug;
  else
    if v_hex is null or v_hex !~ '^#[0-9a-f]{6}$' then
      raise exception 'admin_save_gem_color: invalid colour' using errcode = '22023';
    end if;
    v_base := coalesce(p_color ->> 'slug', '');
    if v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_base) > 50 then
      raise exception 'admin_save_gem_color: invalid slug' using errcode = '22023';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.gem_colors where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
    insert into public.gem_colors (id, slug, name, hex, is_multicolor, is_active, position)
    values (coalesce(v_id, gen_random_uuid()), v_slug, v_name, v_hex, false, v_active,
            coalesce((select max(position) + 1 from public.gem_colors), 0))
    returning id into v_id;
  end if;

  insert into public.gem_color_translations (gem_color_id, locale, name, status)
  values (v_id, 'en', v_name_en, 'published')
  on conflict (gem_color_id, locale) do update set name = excluded.name, status = 'published';

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

comment on function public.admin_save_gem_color(jsonb) is
  'Back office: create/update a gem colour with its English name in one transaction. SECURITY INVOKER — RLS applies.';

-- -----------------------------------------------------------------------------
-- Delete a colour. Refused while a product (any status) uses it: the product
-- would silently lose its colour. The multicolour entry is never deleted; it
-- can be hidden.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_gem_color(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_color public.gem_colors;
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_delete_gem_color: permission denied' using errcode = '42501';
  end if;
  select * into v_color from public.gem_colors where id = p_id for update;
  if not found then
    raise exception 'admin_delete_gem_color: colour not found' using errcode = 'P0002';
  end if;
  if v_color.is_multicolor then
    raise exception 'admin_delete_gem_color: the multicolour entry cannot be deleted' using errcode = '23503';
  end if;
  if exists (select 1 from public.products where metadata ->> 'color' = v_color.slug) then
    raise exception 'admin_delete_gem_color: colour % is used by products', v_color.slug using errcode = '23503';
  end if;
  delete from public.gem_colors where id = p_id;
end;
$$;

comment on function public.admin_delete_gem_color(uuid) is
  'Back office: delete a gem colour no product uses. SECURITY INVOKER — RLS applies.';

-- -----------------------------------------------------------------------------
-- Reorder: the complete list of colour ids, in display order.
-- -----------------------------------------------------------------------------
create or replace function public.admin_reorder_gem_colors(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_reorder_gem_colors: permission denied' using errcode = '42501';
  end if;
  if p_ids is null
     or cardinality(p_ids) <> (select count(*) from public.gem_colors)
     or cardinality(p_ids) <> (select count(distinct u.id) from unnest(p_ids) as u (id))
     or exists (select 1 from unnest(p_ids) as u (id)
                 where not exists (select 1 from public.gem_colors c where c.id = u.id)) then
    raise exception 'admin_reorder_gem_colors: the list must name every colour once' using errcode = '22023';
  end if;
  update public.gem_colors c
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o (id, ord)
   where c.id = o.id and c.position is distinct from o.ord - 1;
end;
$$;

comment on function public.admin_reorder_gem_colors(uuid[]) is
  'Back office: set the display order of every gem colour. SECURITY INVOKER — RLS applies.';

revoke all on function public.admin_save_gem_color(jsonb), public.admin_delete_gem_color(uuid),
  public.admin_reorder_gem_colors(uuid[]) from public, anon;
grant execute on function public.admin_save_gem_color(jsonb), public.admin_delete_gem_color(uuid),
  public.admin_reorder_gem_colors(uuid[]) to authenticated, service_role;
