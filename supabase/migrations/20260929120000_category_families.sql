-- =============================================================================
-- Migration — Product families: a second level under categories
-- =============================================================================
-- The shop is reorganised into four categories, each split into families:
--
--   Toothgems (gems)        Swarovski, Preciosa, Bijoux en or 18ct, Opales, Micro gems
--   Matériel  (materiel)    Essentiels, Accessoires
--   Kits      (kits)        Kit professionnel, Kit DIY
--   Global Lip Gloss        (no family)
--
-- The storefront's header menu, the shop's "product type" filter (a tree:
-- category › family) and the home page tiles read this taxonomy.
--
-- Model:
--   * category_families: one row per family, under exactly one category.
--     `slug` is unique across all families, since it is the value of the
--     `famille` URL parameter (/boutique?categorie=gems&famille=swarovski).
--   * category_family_translations: other languages, same pattern as
--     category_translations (draft/published, never the default locale).
--   * products.family_id: optional. A composite foreign key
--     (category_id, family_id) → category_families (category_id, id) makes a
--     family of another category impossible. products.category_id keeps its
--     meaning, so promotions, recommendations and statistics are unchanged.
--     A trigger clears a family the product's new category does not have
--     (moving a product to another category must not fail on its old family)
--     and turns a mismatched family into a readable error.
--
-- A separate table rather than categories.parent_id: every consumer of
-- products.category_id (promotion scopes, "same category" recommendations,
-- revenue buckets, the admin's gem editor keyed on the `gems` slug) keeps
-- working on the top level without learning about a hierarchy.
--
-- Data: the five former categories become the four above. `outils` is renamed
-- `materiel`; `entretien` and `accessoires` are emptied into it and hidden
-- (is_active = false), not deleted, so their audit history and translations
-- stay. Existing products are classified by slug. Every statement is an
-- upsert or a no-op when its rows are missing, so it runs the same on the
-- hosted database and on a fresh local one (where seed.sql comes after).
--
-- admin_save_product() gains one OPTIONAL input, `family_id` (uuid or null);
-- absent = the family is left as it is. It returns `family_id` when the
-- payload carried the key, so an admin deployed before this migration notices.
-- Everything else is unchanged from `…_product_custom_variants.sql`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.category_families (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  image_path  text,
  is_active   boolean not null default true,
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null,
  constraint category_families_category_id_id_key unique (category_id, id)
);

comment on table public.category_families is
  'Second level of the shop taxonomy (category › family). slug = value of the famille URL parameter, unique across categories.';

create index category_families_category_position_idx on public.category_families (category_id, is_active, position);

alter table public.category_families enable row level security;

create trigger category_families_audit
  before insert or update on public.category_families
  for each row execute function private.set_audit_columns();
create trigger category_families_audit_log
  after update on public.category_families
  for each row execute function private.audit_changes('is_active', 'slug', 'category_id');
create trigger category_families_audit_log_delete
  after delete on public.category_families
  for each row execute function private.audit_changes();

create table public.category_family_translations (
  family_id   uuid not null references public.category_families (id) on delete cascade,
  locale      text not null references public.languages (code) on update cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  slug        text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  primary key (family_id, locale),
  constraint category_family_translations_slug_unique unique (locale, slug)
);

create index category_family_translations_locale_idx on public.category_family_translations (locale);

alter table public.category_family_translations enable row level security;

create trigger category_family_translations_not_default_locale
  before insert or update on public.category_family_translations
  for each row execute function private.reject_default_locale_translation();
create trigger category_family_translations_audit
  before insert or update on public.category_family_translations
  for each row execute function private.set_translation_audit();

-- -----------------------------------------------------------------------------
-- Privileges + RLS: visitors read active families and their published
-- translations; staff read everything; manage_products writes.
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on public.category_families, public.category_family_translations from anon, authenticated;
revoke insert, update, delete on public.category_families, public.category_family_translations from anon;

create policy "category_families: public reads active, staff read all"
  on public.category_families for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy "category_families: staff insert"
  on public.category_families for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "category_families: staff update"
  on public.category_families for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "category_families: staff delete"
  on public.category_families for delete to authenticated
  using ((select private.has_permission('manage_products')));

create policy "category_family_translations: public reads published, staff read all"
  on public.category_family_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.category_families f
      where f.id = category_family_translations.family_id and f.is_active))
    or (select private.is_staff())
  );
create policy "category_family_translations: staff insert"
  on public.category_family_translations for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "category_family_translations: staff update"
  on public.category_family_translations for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "category_family_translations: staff delete"
  on public.category_family_translations for delete to authenticated
  using ((select private.has_permission('manage_products')));

-- -----------------------------------------------------------------------------
-- products.family_id
-- -----------------------------------------------------------------------------
alter table public.products add column family_id uuid;

alter table public.products
  add constraint products_family_fkey
  foreign key (category_id, family_id)
  references public.category_families (category_id, id)
  on delete restrict;

create index products_family_idx on public.products (family_id);

comment on column public.products.family_id is
  'Optional family of the product, always one of its category''s families (composite FK products_family_fkey).';

-- A family the product's category does not have: cleared when only the
-- category changed (the old family followed along), an error otherwise.
-- SECURITY DEFINER only to read category_families whatever the caller's RLS;
-- it reads, never writes.
create or replace function private.check_product_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.family_id is null
     or exists (select 1 from public.category_families f
                 where f.id = new.family_id and f.category_id = new.category_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.family_id is not distinct from old.family_id then
    new.family_id := null;
    return new;
  end if;
  raise exception 'products: family does not belong to the product category' using errcode = '22023';
end;
$$;

revoke all on function private.check_product_family() from public;

create trigger products_check_family
  before insert or update of category_id, family_id on public.products
  for each row execute function private.check_product_family();

-- -----------------------------------------------------------------------------
-- Categories: gems, materiel, kits, lip-gloss
-- -----------------------------------------------------------------------------
update public.categories set slug = 'materiel'
 where slug = 'outils'
   and not exists (select 1 from public.categories where slug = 'materiel');

insert into public.categories (slug, name, description, position, report_group, is_active) values
  ('gems',      'Toothgems',        'Cristaux, bijoux en or et pièces décoratives posées sur l’émail.', 1, 'jewelry', true),
  ('materiel',  'Matériel',         'Instruments, consommables et accessoires de pose.',                 2, 'kits',    true),
  ('kits',      'Kits',             'Coffrets complets de pose, pour les pros comme pour débuter.',      3, 'kits',    true),
  ('lip-gloss', 'Global Lip Gloss', 'Les gloss Global Toothgems.',                                        4, 'other',   true)
on conflict (slug) do update
   set name         = excluded.name,
       description  = excluded.description,
       position     = excluded.position,
       report_group = excluded.report_group,
       is_active    = true;

insert into public.category_translations (category_id, locale, name, slug, description, status)
select c.id, 'en', t.name, t.slug, t.description, 'published'
  from (values
    ('gems',      'Toothgems',        'toothgems', 'Crystals, gold jewellery and decorative pieces set on the enamel.'),
    ('materiel',  'Equipment',        'equipment', 'Application instruments, consumables and accessories.'),
    ('kits',      'Kits',             'kits',      'Complete application kits, for professionals and beginners.'),
    ('lip-gloss', 'Global Lip Gloss', 'lip-gloss', 'Global Toothgems lip glosses.')
  ) as t (category_slug, name, slug, description)
  join public.categories c on c.slug = t.category_slug
on conflict (category_id, locale) do update
   set name        = excluded.name,
       slug        = excluded.slug,
       description = excluded.description,
       status      = 'published';

-- -----------------------------------------------------------------------------
-- Families
-- -----------------------------------------------------------------------------
with seeded (category_slug, slug, name_fr, name_en, slug_en, position) as (
  values
    ('gems',     'swarovski',         'Swarovski',         'Swarovski',        'swarovski',        0),
    ('gems',     'preciosa',          'Preciosa',          'Preciosa',         'preciosa',         1),
    ('gems',     'bijoux-or-18ct',    'Bijoux en or 18ct', '18ct gold jewels', '18ct-gold-jewels', 2),
    ('gems',     'opales',            'Opales',            'Opals',            'opals',            3),
    ('gems',     'micro-gems',        'Micro gems',        'Micro gems',       'micro-gems',       4),
    ('materiel', 'essentiels',        'Essentiels',        'Essentials',       'essentials',       0),
    ('materiel', 'accessoires',       'Accessoires',       'Accessories',      'accessories',      1),
    ('kits',     'kit-professionnel', 'Kit professionnel', 'Professional kit', 'professional-kit', 0),
    ('kits',     'kit-diy',           'Kit DIY',           'DIY kit',          'diy-kit',          1)
), upserted as (
  insert into public.category_families (category_id, slug, name, position)
  select c.id, s.slug, s.name_fr, s.position
    from seeded s join public.categories c on c.slug = s.category_slug
  on conflict (slug) do update
     set name = excluded.name, position = excluded.position, is_active = true
  returning id, slug
)
insert into public.category_family_translations (family_id, locale, name, slug, status)
select u.id, 'en', s.name_en, s.slug_en, 'published'
  from upserted u join seeded s using (slug)
on conflict (family_id, locale) do update
   set name = excluded.name, slug = excluded.slug, status = 'published';

-- -----------------------------------------------------------------------------
-- Existing products, classified by slug (no-op where they do not exist)
-- -----------------------------------------------------------------------------
with moves (product_slug, category_slug, family_slug) as (
  values
    ('charm-etoile-or-18k',               'gems',     'bijoux-or-18ct'),
    ('cerises-en-or-18ct',                'gems',     'bijoux-or-18ct'),
    ('serpent-en-or-18ct',                'gems',     'bijoux-or-18ct'),
    ('teckel-en-or-18ct',                 'gems',     'bijoux-or-18ct'),
    ('goutte-opale',                      'gems',     'opales'),
    ('pince-de-depose',                   'materiel', 'essentiels'),
    ('gel-de-suivi',                      'materiel', 'essentiels'),
    ('capsules-steriles',                 'materiel', 'essentiels'),
    ('miroir-hot-people-have-tooth-gems', 'materiel', 'accessoires'),
    ('kit-application-premium',           'kits',     'kit-professionnel'),
    ('kit-decouverte',                    'kits',     'kit-professionnel')
  union all
  -- Every Swarovski gem, by name.
  select p.slug, 'gems', 'swarovski'
    from public.products p
    join public.categories c on c.id = p.category_id
   where c.slug = 'gems' and p.slug like '%swarovski%'
)
update public.products p
   set category_id = c.id,
       family_id   = f.id
  from moves m
  join public.categories c on c.slug = m.category_slug
  join public.category_families f on f.slug = m.family_slug and f.category_id = c.id
 where p.slug = m.product_slug;

-- Whatever is left in the two retired categories joins Matériel, unclassified.
-- The gift card is not a shop product (it has its own page): no category.
update public.products
   set category_id = null, family_id = null
 where product_type = 'gift_card';

update public.products
   set category_id = (select id from public.categories where slug = 'materiel')
 where category_id in (select id from public.categories where slug in ('entretien', 'accessoires'));

update public.categories
   set is_active = false,
       position  = case slug when 'entretien' then 5 else 6 end
 where slug in ('entretien', 'accessoires');

-- -----------------------------------------------------------------------------
-- admin_save_product(): + optional family_id (see the header)
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_product(p_product jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id        uuid := (p_product ->> 'id')::uuid;
  v_price     text := p_product ->> 'price';
  v_compare   text := nullif(p_product ->> 'compare_at_price', '');
  v_inventory jsonb := coalesce(p_product -> 'inventory', '{}'::jsonb);
  v_media     jsonb := coalesce(p_product -> 'media', '[]'::jsonb);
  v_variants  jsonb := p_product -> 'variants';
  v_custom    jsonb := p_product -> 'custom_variants';
  v_en        jsonb := p_product -> 'translations' -> 'en';
  v_slug      text;
  v_base      text;
  v_n         integer := 1;
  v_keep      uuid[];
  v_removed   text[];
  v_item      jsonb;
  v_media_id  uuid;
  v_position  integer := 0;
  -- variants
  v_sku        text;
  v_pack       integer;
  v_ss         integer;
  v_vprice     text;
  v_name_fr    text;
  v_name_en    text;
  v_vsku       text;
  v_variant_id uuid;
  v_variant_ids uuid[] := '{}';
  -- custom variants
  v_custom_ids uuid[] := '{}';
  v_swatch     text;
  v_owner      uuid;
  v_code       text;
  v_media_variant uuid;
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_save_product: permission denied' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'admin_save_product: id is required' using errcode = '22023';
  end if;
  if v_price is null or v_price !~ '^\d{1,10}(\.\d{1,2})?$' then
    raise exception 'admin_save_product: invalid price' using errcode = '22023';
  end if;
  if v_compare is not null and v_compare !~ '^\d{1,10}(\.\d{1,2})?$' then
    raise exception 'admin_save_product: invalid compare_at_price' using errcode = '22023';
  end if;
  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'admin_save_product: media must be an array' using errcode = '22023';
  end if;
  if v_variants is not null and jsonb_typeof(v_variants) = 'null' then
    v_variants := null;
  end if;
  if v_variants is not null and jsonb_typeof(v_variants) <> 'array' then
    raise exception 'admin_save_product: variants must be an array' using errcode = '22023';
  end if;
  if v_custom is not null and jsonb_typeof(v_custom) = 'null' then
    v_custom := null;
  end if;
  if v_custom is not null and jsonb_typeof(v_custom) <> 'array' then
    raise exception 'admin_save_product: custom_variants must be an array' using errcode = '22023';
  end if;
  if v_variants is not null and v_custom is not null then
    raise exception 'admin_save_product: send either variants or custom_variants, not both' using errcode = '22023';
  end if;

  -- 1. Product row ------------------------------------------------------------
  if exists (select 1 from public.products where id = v_id) then
    update public.products
       set category_id       = (p_product ->> 'category_id')::uuid,
           family_id         = case when p_product ? 'family_id'
                                    then nullif(p_product ->> 'family_id', '')::uuid
                                    else family_id end,
           sku               = nullif(p_product ->> 'sku', ''),
           name              = p_product ->> 'name',
           short_description = nullif(p_product ->> 'short_description', ''),
           description       = nullif(p_product ->> 'description', ''),
           price             = v_price::numeric(12, 2),
           compare_at_price  = v_compare::numeric(12, 2),
           status            = p_product ->> 'status',
           metadata          = metadata || coalesce(p_product -> 'metadata', '{}'::jsonb)
     where id = v_id
    returning slug into v_slug;
  else
    -- The slug is the storefront URL: set once, made unique with a suffix.
    v_base := p_product ->> 'slug';
    v_slug := v_base;
    while exists (select 1 from public.products where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;

    insert into public.products
      (id, category_id, family_id, sku, name, slug, short_description, description,
       price, compare_at_price, status, metadata)
    values
      (v_id, (p_product ->> 'category_id')::uuid, nullif(p_product ->> 'family_id', '')::uuid,
       nullif(p_product ->> 'sku', ''),
       p_product ->> 'name', v_slug,
       nullif(p_product ->> 'short_description', ''), nullif(p_product ->> 'description', ''),
       v_price::numeric(12, 2), v_compare::numeric(12, 2),
       p_product ->> 'status', coalesce(p_product -> 'metadata', '{}'::jsonb));
  end if;

  -- 2. English translation (published on save; absent = storefront falls back
  --    to French) ---------------------------------------------------------------
  if coalesce(trim(v_en ->> 'name'), '') <> '' then
    v_base := nullif(v_en ->> 'slug', '');
    v_n := 1;
    if not exists (select 1 from public.product_translations where product_id = v_id and locale = 'en')
       and v_base is not null then
      v_slug := v_base;
      while exists (select 1 from public.product_translations where locale = 'en' and slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
      end loop;
    else
      v_slug := null;  -- keep the existing English URL
    end if;

    insert into public.product_translations
      (product_id, locale, name, slug, short_description, description, status)
    values
      (v_id, 'en', v_en ->> 'name', v_slug,
       nullif(v_en ->> 'short_description', ''), nullif(v_en ->> 'description', ''), 'published')
    on conflict (product_id, locale) do update
       set name              = excluded.name,
           short_description = excluded.short_description,
           description       = excluded.description,
           status            = 'published';
  else
    delete from public.product_translations where product_id = v_id and locale = 'en';
  end if;

  -- 3. Pack / stone-size options (only when the payload carries them) ---------
  if v_variants is not null then
    -- Only pack/SS variants are managed here: a product whose variants are
    -- something else (colours, boxes…) must not lose them to this editor.
    if exists (
      select 1 from public.product_variants pv
       where pv.product_id = v_id
         and (pv.attributes = '{}'::jsonb
              or exists (select 1 from jsonb_object_keys(pv.attributes) k where k not in ('pack', 'ss')))
    ) then
      raise exception 'admin_save_product: this product has other kinds of variants' using errcode = '22023';
    end if;

    v_sku := (select sku from public.products where id = v_id);
    v_position := 0;

    for v_item in select value from jsonb_array_elements(v_variants) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'admin_save_product: invalid variant' using errcode = '22023';
      end if;
      if coalesce(v_item ->> 'pack', '') !~ '^\d{0,5}$' then
        raise exception 'admin_save_product: invalid pack size' using errcode = '22023';
      end if;
      if coalesce(v_item ->> 'ss', '') !~ '^\d{1,2}$' and coalesce(v_item ->> 'ss', '') <> '' then
        raise exception 'admin_save_product: invalid stone size' using errcode = '22023';
      end if;
      v_pack := nullif(v_item ->> 'pack', '')::integer;
      v_ss   := nullif(v_item ->> 'ss', '')::integer;
      if v_pack is null and v_ss is null then
        raise exception 'admin_save_product: a variant needs a pack or a stone size' using errcode = '22023';
      end if;
      if v_pack is not null and v_pack not between 1 and 10000 then
        raise exception 'admin_save_product: pack size must be between 1 and 10000' using errcode = '22023';
      end if;
      if v_ss is not null and v_ss not between 1 and 60 then
        raise exception 'admin_save_product: invalid stone size' using errcode = '22023';
      end if;
      v_vprice := nullif(v_item ->> 'price', '');
      if v_vprice is not null and v_vprice !~ '^\d{1,10}(\.\d{1,2})?$' then
        raise exception 'admin_save_product: invalid variant price' using errcode = '22023';
      end if;

      v_name_fr := concat_ws(' · ', 'Pack de ' || v_pack, 'SS' || v_ss);
      v_name_en := concat_ws(' · ', 'Pack of ' || v_pack, 'SS' || v_ss);
      v_vsku := case when v_sku is null then null
                     else v_sku || concat('-P' || v_pack, '-SS' || v_ss) end;
      if v_vsku is not null and v_vsku !~ '^[A-Z0-9][A-Z0-9-]{1,63}$' then
        raise exception 'admin_save_product: product SKU too long for its option SKUs' using errcode = '22023';
      end if;

      -- The same combination twice in one payload would silently merge.
      select pv.id into v_variant_id
        from public.product_variants pv
       where pv.product_id = v_id
         and pv.attributes -> 'pack' is not distinct from to_jsonb(v_pack)
         and pv.attributes -> 'ss'   is not distinct from to_jsonb(v_ss);
      if v_variant_id = any (v_variant_ids) then
        raise exception 'admin_save_product: duplicate option %', v_name_en using errcode = '22023';
      end if;

      if v_variant_id is not null then
        update public.product_variants
           set name       = v_name_fr,
               sku        = v_vsku,
               price      = v_vprice::numeric(12, 2),
               is_active  = true,
               position   = v_position
         where id = v_variant_id;
      else
        insert into public.product_variants (product_id, name, sku, attributes, price, is_active, position)
        values (v_id, v_name_fr, v_vsku,
                jsonb_strip_nulls(jsonb_build_object('pack', v_pack, 'ss', v_ss)),
                v_vprice::numeric(12, 2), true, v_position)
        returning id into v_variant_id;
      end if;

      insert into public.product_variant_translations (variant_id, locale, name, status)
      values (v_variant_id, 'en', v_name_en, 'published')
      on conflict (variant_id, locale) do update set name = excluded.name, status = 'published';

      update public.inventory_items
         set track_inventory     = coalesce((v_item ->> 'track_inventory')::boolean, track_inventory),
             quantity_on_hand    = coalesce((v_item ->> 'quantity_on_hand')::integer, quantity_on_hand),
             low_stock_threshold = coalesce((v_item ->> 'low_stock_threshold')::integer, low_stock_threshold)
       where variant_id = v_variant_id;
      if not found then
        insert into public.inventory_items (variant_id, track_inventory, quantity_on_hand, low_stock_threshold)
        values (v_variant_id,
                coalesce((v_item ->> 'track_inventory')::boolean, true),
                coalesce((v_item ->> 'quantity_on_hand')::integer, 0),
                coalesce((v_item ->> 'low_stock_threshold')::integer, 5));
      end if;

      v_variant_ids := array_append(v_variant_ids, v_variant_id);
      v_variant_id := null;
      v_position := v_position + 1;
    end loop;

    -- Options no longer offered: gone, unless an order remembers them.
    update public.product_variants pv
       set is_active = false
     where pv.product_id = v_id
       and not (pv.id = any (v_variant_ids))
       and exists (select 1 from public.order_items oi where oi.variant_id = pv.id);
    delete from public.product_variants pv
     where pv.product_id = v_id
       and not (pv.id = any (v_variant_ids))
       and not exists (select 1 from public.order_items oi where oi.variant_id = pv.id);
  end if;

  -- 3b. Any other kind of variant (only when the payload carries them) --------
  if v_custom is not null then
    -- Pack/SS options have their own editor, which derives names and SKUs
    -- from the grid; this list must not take them over.
    if exists (
      select 1 from public.product_variants pv
       where pv.product_id = v_id and pv.is_active
         and pv.attributes <> '{}'::jsonb
         and not exists (select 1 from jsonb_object_keys(pv.attributes) k where k not in ('pack', 'ss'))
    ) then
      raise exception 'admin_save_product: this product sells pack/stone-size options' using errcode = '22023';
    end if;

    -- Validate the whole list first, so the renames below never half-apply.
    for v_item in select value from jsonb_array_elements(v_custom) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'admin_save_product: invalid variant' using errcode = '22023';
      end if;
      if coalesce(v_item ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'admin_save_product: a variant needs an id' using errcode = '22023';
      end if;
      v_variant_id := (v_item ->> 'id')::uuid;
      if v_variant_id = any (v_custom_ids) then
        raise exception 'admin_save_product: duplicate variant %', v_variant_id using errcode = '22023';
      end if;
      select product_id into v_owner from public.product_variants where id = v_variant_id;
      if v_owner is not null and v_owner <> v_id then
        raise exception 'admin_save_product: variant % belongs to another product', v_variant_id using errcode = '22023';
      end if;
      v_owner := null;
      v_name_fr := btrim(coalesce(v_item ->> 'name', ''));
      if char_length(v_name_fr) not between 1 and 200 or char_length(btrim(coalesce(v_item ->> 'name_en', ''))) > 200 then
        raise exception 'admin_save_product: a variant needs a name of 1 to 200 characters' using errcode = '22023';
      end if;
      v_swatch := nullif(v_item ->> 'swatch', '');
      if v_swatch is not null and v_swatch !~ '^#[0-9a-f]{6}$' then
        raise exception 'admin_save_product: invalid swatch colour' using errcode = '22023';
      end if;
      v_vprice := nullif(v_item ->> 'price', '');
      if v_vprice is not null and v_vprice !~ '^\d{1,10}(\.\d{1,2})?$' then
        raise exception 'admin_save_product: invalid variant price' using errcode = '22023';
      end if;
      v_custom_ids := array_append(v_custom_ids, v_variant_id);
    end loop;
    v_variant_id := null;

    -- Variants no longer listed go first, so their SKUs and names are free for
    -- the list: deleted, unless an order remembers them (then deactivated).
    update public.product_variants pv
       set is_active = false
     where pv.product_id = v_id
       and not (pv.id = any (v_custom_ids))
       and exists (select 1 from public.order_items oi where oi.variant_id = pv.id);
    delete from public.product_variants pv
     where pv.product_id = v_id
       and not (pv.id = any (v_custom_ids))
       and not exists (select 1 from public.order_items oi where oi.variant_id = pv.id);

    -- product_variants_name_unique is not deferrable: swapping two names in one
    -- save would collide halfway. Listed variants first take their id as a
    -- placeholder name; a kept inactive variant holding a name the list reuses
    -- is renamed out of the way (its orders keep their own copy of the name).
    update public.product_variants
       set name = id::text
     where product_id = v_id and id = any (v_custom_ids);
    update public.product_variants pv
       set name = left(pv.name, 190) || ' #' || left(pv.id::text, 8)
     where pv.product_id = v_id
       and not (pv.id = any (v_custom_ids))
       and pv.name in (select btrim(e ->> 'name') from jsonb_array_elements(v_custom) e);

    v_sku := (select sku from public.products where id = v_id);
    v_position := 0;

    for v_item in select value from jsonb_array_elements(v_custom) loop
      v_variant_id := (v_item ->> 'id')::uuid;
      v_name_fr := btrim(v_item ->> 'name');
      v_name_en := nullif(btrim(coalesce(v_item ->> 'name_en', '')), '');
      v_swatch  := nullif(v_item ->> 'swatch', '');
      v_vprice  := nullif(v_item ->> 'price', '');

      if exists (select 1 from public.product_variants where id = v_variant_id) then
        update public.product_variants
           set name       = v_name_fr,
               attributes = case when v_swatch is null then attributes - 'swatch'
                                 else attributes || jsonb_build_object('swatch', v_swatch) end,
               price      = v_vprice::numeric(12, 2),
               is_active  = true,
               position   = v_position
         where id = v_variant_id
        returning sku into v_vsku;
      else
        v_vsku := null;
        insert into public.product_variants (id, product_id, name, attributes, price, is_active, position)
        values (v_variant_id, v_id, v_name_fr,
                case when v_swatch is null then '{}'::jsonb else jsonb_build_object('swatch', v_swatch) end,
                v_vprice::numeric(12, 2), true, v_position);
      end if;

      -- SKU: set once, from the product SKU and the French name in plain
      -- ASCII (no unaccent extension needed), unique with a suffix.
      if v_vsku is null and v_sku is not null then
        v_code := upper(btrim(regexp_replace(
          translate(replace(replace(replace(replace(v_name_fr, 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE'),
                    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
                    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYY'),
          '[^A-Za-z0-9]+', '-', 'g'), '-'));
        if v_code = '' then
          v_code := 'V' || (v_position + 1);
        end if;
        v_base := rtrim(left(v_sku || '-' || v_code, 60), '-');
        v_vsku := v_base;
        v_n := 1;
        while exists (select 1 from public.product_variants where sku = v_vsku and id <> v_variant_id) loop
          v_n := v_n + 1;
          v_vsku := v_base || '-' || v_n;
        end loop;
        update public.product_variants set sku = v_vsku where id = v_variant_id;
      end if;

      if v_name_en is not null then
        insert into public.product_variant_translations (variant_id, locale, name, status)
        values (v_variant_id, 'en', v_name_en, 'published')
        on conflict (variant_id, locale) do update set name = excluded.name, status = 'published';
      else
        delete from public.product_variant_translations where variant_id = v_variant_id and locale = 'en';
      end if;

      update public.inventory_items
         set track_inventory     = coalesce((v_item ->> 'track_inventory')::boolean, track_inventory),
             quantity_on_hand    = coalesce((v_item ->> 'quantity_on_hand')::integer, quantity_on_hand),
             low_stock_threshold = coalesce((v_item ->> 'low_stock_threshold')::integer, low_stock_threshold)
       where variant_id = v_variant_id;
      if not found then
        insert into public.inventory_items (variant_id, track_inventory, quantity_on_hand, low_stock_threshold)
        values (v_variant_id,
                coalesce((v_item ->> 'track_inventory')::boolean, true),
                coalesce((v_item ->> 'quantity_on_hand')::integer, 0),
                coalesce((v_item ->> 'low_stock_threshold')::integer, 5));
      end if;

      v_variant_id := null;
      v_position := v_position + 1;
    end loop;
  end if;

  -- 4. Stock: one inventory row per product without active variants ---------
  --    A product with active variants keeps its stock on each variant (see
  --    step 3), and a digital product has none; both are left alone.
  if exists (select 1 from public.product_variants where product_id = v_id and is_active)
     or exists (select 1 from public.products where id = v_id and product_type = 'digital') then
    v_inventory := null;
  end if;

  if v_inventory is not null then
    update public.inventory_items
       set track_inventory     = coalesce((v_inventory ->> 'track_inventory')::boolean, track_inventory),
           quantity_on_hand    = coalesce((v_inventory ->> 'quantity_on_hand')::integer, quantity_on_hand),
           low_stock_threshold = coalesce((v_inventory ->> 'low_stock_threshold')::integer, low_stock_threshold),
           availability        = coalesce(v_inventory ->> 'availability', availability)
     where product_id = v_id;
    if not found then
      insert into public.inventory_items
        (product_id, track_inventory, quantity_on_hand, low_stock_threshold, availability)
      values
        (v_id,
         coalesce((v_inventory ->> 'track_inventory')::boolean, true),
         coalesce((v_inventory ->> 'quantity_on_hand')::integer, 0),
         coalesce((v_inventory ->> 'low_stock_threshold')::integer, 5),
         coalesce(v_inventory ->> 'availability', 'in_stock'));
    end if;
  end if;

  -- 5. Media: the payload is the complete, ordered list ------------------------
  v_position := 0;
  v_keep := array(
    select (e ->> 'id')::uuid
      from jsonb_array_elements(v_media) e
     where coalesce(e ->> 'id', '') <> ''
  );

  with gone as (
    delete from public.product_media
     where product_id = v_id and not (id = any (v_keep))
    returning storage_path
  )
  select array_agg(storage_path) into v_removed from gone;

  -- One primary per product (partial unique index): clear before re-setting.
  update public.product_media set is_primary = false where product_id = v_id and is_primary;

  for v_item in select value from jsonb_array_elements(v_media) loop
    -- The variant a photo shows: only a variant of this very product.
    v_media_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    if v_media_variant is not null
       and not exists (select 1 from public.product_variants where id = v_media_variant and product_id = v_id) then
      raise exception 'admin_save_product: media variant % does not belong to this product', v_media_variant
        using errcode = '22023';
    end if;

    if coalesce(v_item ->> 'id', '') <> '' then
      update public.product_media
         set position   = v_position,
             is_primary = (v_position = 0),
             alt_text   = nullif(v_item ->> 'alt_fr', ''),
             variant_id = case when v_item ? 'variant_id' then v_media_variant else variant_id end
       where id = (v_item ->> 'id')::uuid and product_id = v_id
      returning id into v_media_id;
      if v_media_id is null then
        raise exception 'admin_save_product: media % does not belong to this product', v_item ->> 'id'
          using errcode = '22023';
      end if;
    else
      if coalesce(v_item ->> 'storage_path', '') !~ '^products/[A-Za-z0-9._/-]+$' then
        raise exception 'admin_save_product: invalid storage path' using errcode = '22023';
      end if;
      insert into public.product_media (product_id, variant_id, storage_path, alt_text, position, is_primary)
      values (v_id, v_media_variant, v_item ->> 'storage_path', nullif(v_item ->> 'alt_fr', ''), v_position, v_position = 0)
      returning id into v_media_id;
    end if;

    if coalesce(trim(v_item ->> 'alt_en'), '') <> '' then
      insert into public.product_media_translations (media_id, locale, alt_text, status)
      values (v_media_id, 'en', v_item ->> 'alt_en', 'published')
      on conflict (media_id, locale) do update
         set alt_text = excluded.alt_text, status = 'published';
    else
      delete from public.product_media_translations where media_id = v_media_id and locale = 'en';
    end if;

    v_media_id := null;
    v_position := v_position + 1;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'slug', (select slug from public.products where id = v_id),
    'removed_paths', to_jsonb(coalesce(array(
      select distinct path
        from unnest(v_removed) as path
       where path like 'products/%'
         and not exists (select 1 from public.product_media m where m.storage_path = path)
    ), '{}'::text[]))
  ) || case when v_variants is not null
            then jsonb_build_object('variants', to_jsonb(v_variant_ids))
            else '{}'::jsonb end
    || case when v_custom is not null
            then jsonb_build_object('custom_variants', to_jsonb(v_custom_ids))
            else '{}'::jsonb end
    || case when p_product ? 'family_id'
            then jsonb_build_object('family_id', (select family_id from public.products where id = v_id))
            else '{}'::jsonb end;
end;
$$;

comment on function public.admin_save_product(jsonb) is
  'Back office: create/update a product with its English translation, stock, media and (optional) either pack (1–10 000 stones) × stone-size options or a free list of variants (colours, boxes…) with their photos, and its optional family, in one transaction. SECURITY INVOKER — RLS applies.';
