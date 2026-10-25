-- =============================================================================
-- Migration — Product characteristics and FAQ groups
-- =============================================================================
-- The product page showed the same "Characteristics" and "Frequently asked
-- questions" on every product: back, packaging and wear were fixed UI strings,
-- the material fell back to the category name ("Matière : Matériel" on a
-- tool), the FAQ was three gem questions hard-coded in the front end. This
-- migration makes both real catalogue data.
--
-- 1. Characteristics (decided by the owner on 2026-10-25: five fields, shown
--    for gems only — the storefront decides what to show, the data is per
--    product). Base columns on `products` hold French, English lives in
--    `product_translations` like every other product text:
--      spec_material, spec_center, spec_back, spec_packaging, spec_wear
--    Each is optional (null = not shown), 1–120 characters. `spec_material`
--    replaces `metadata.material` (which the storefront read only as a plain
--    string, so the admin's `{fr, en}` value never reached the page): it is
--    copied here once; `metadata.material` is left in place, unread, rather
--    than deleted from a shared project without the owner's go-ahead.
--    No default value is invented (no "6 to 12 months" for every gem): a
--    durability or packaging claim is written per product by the shop.
--
--    admin_save_product() gains one OPTIONAL input, `specs`:
--      { "material": { "fr": "…", "en": "…" }, "center": …, "back": …,
--        "packaging": …, "wear": … }
--    absent = characteristics left as they are; an empty or missing language
--    clears that value. English values need the English translation row,
--    which the same save creates when the product has an English name (no
--    English name = no English row = the storefront shows French anyway).
--    It returns `specs: true` when the payload carried the key, so an admin
--    deployed before this migration notices. Everything else is unchanged
--    from `…_gem_free_sizes.sql`.
--
-- 2. FAQ groups (decided by the owner on 2026-10-25: a set of questions is
--    written once and assigned to products and to categories):
--      faq_groups            name (back office only), status draft/published,
--                            position (order of several groups on one page)
--      faq_items             question + answer in French, position
--      faq_item_translations other languages (published when both texts set)
--      product_faq_groups    group ↔ product
--      category_faq_groups   group ↔ category
--    Rule (in product_faq()): a product with at least one published group of
--    its own shows only those; otherwise it shows its category's published
--    groups; neither = no FAQ section. Visitors read published groups only
--    (RLS); manage_products writes, through admin_save_faq_group() (one
--    transaction for the group, its questions and its assignments) or a plain
--    delete / position update on faq_groups. Audited like the catalogue.
--
--    Seed: the three questions the product page used to show become one
--    published group assigned to the `gems` category, so gem pages keep their
--    FAQ. Inserted only when no group exists yet and the category exists
--    (a no-op on a fresh database, where seed.sql runs after migrations).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Characteristics
-- -----------------------------------------------------------------------------
alter table public.products
  add column spec_material  text,
  add column spec_center    text,
  add column spec_back      text,
  add column spec_packaging text,
  add column spec_wear      text;

alter table public.product_translations
  add column spec_material  text,
  add column spec_center    text,
  add column spec_back      text,
  add column spec_packaging text,
  add column spec_wear      text;

comment on column public.products.spec_material is
  'Characteristic "material" in French (null = not shown). Shown on gem product pages and as the product card subtitle.';
comment on column public.products.spec_center is 'Characteristic "centre stone" in French (null = not shown).';
comment on column public.products.spec_back is 'Characteristic "back" in French (null = not shown).';
comment on column public.products.spec_packaging is 'Characteristic "packaging" in French (null = not shown).';
comment on column public.products.spec_wear is 'Characteristic "indicative wear" in French (null = not shown).';

-- metadata.material was either a plain French string (seed) or { fr, en }
-- (back office). A brand typed only in English is used for French too.
update public.products p
   set spec_material = left(btrim(m.fr), 120)
  from (
    select id,
           case jsonb_typeof(metadata -> 'material')
             when 'string' then metadata ->> 'material'
             when 'object' then coalesce(nullif(btrim(metadata -> 'material' ->> 'fr'), ''),
                                         nullif(btrim(metadata -> 'material' ->> 'en'), ''))
           end as fr
      from public.products
  ) m
 where m.id = p.id
   and nullif(btrim(m.fr), '') is not null
   and p.spec_material is null;

update public.product_translations t
   set spec_material = left(btrim(p.metadata -> 'material' ->> 'en'), 120)
  from public.products p
 where p.id = t.product_id
   and t.locale = 'en'
   and jsonb_typeof(p.metadata -> 'material') = 'object'
   and nullif(btrim(p.metadata -> 'material' ->> 'en'), '') is not null
   and t.spec_material is null;

alter table public.products
  add constraint products_spec_material_check  check (char_length(btrim(spec_material))  between 1 and 120),
  add constraint products_spec_center_check    check (char_length(btrim(spec_center))    between 1 and 120),
  add constraint products_spec_back_check      check (char_length(btrim(spec_back))      between 1 and 120),
  add constraint products_spec_packaging_check check (char_length(btrim(spec_packaging)) between 1 and 120),
  add constraint products_spec_wear_check      check (char_length(btrim(spec_wear))      between 1 and 120);

alter table public.product_translations
  add constraint product_translations_spec_material_check  check (char_length(btrim(spec_material))  between 1 and 120),
  add constraint product_translations_spec_center_check    check (char_length(btrim(spec_center))    between 1 and 120),
  add constraint product_translations_spec_back_check      check (char_length(btrim(spec_back))      between 1 and 120),
  add constraint product_translations_spec_packaging_check check (char_length(btrim(spec_packaging)) between 1 and 120),
  add constraint product_translations_spec_wear_check      check (char_length(btrim(spec_wear))      between 1 and 120);

-- -----------------------------------------------------------------------------
-- admin_save_product(): optional `specs` (see the header)
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
  v_specs     jsonb := p_product -> 'specs';
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
  v_mm         jsonb;
  v_mm_fr      text;
  v_mm_en      text;
  v_mm_sku     text;
  v_kind       text;
  v_kinds      text[] := '{}';
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

  -- Characteristics: five optional { fr, en } values, 120 characters at most.
  if v_specs is not null and jsonb_typeof(v_specs) = 'null' then
    v_specs := null;
  end if;
  if v_specs is not null and (
       jsonb_typeof(v_specs) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_specs) k
                   where k not in ('material', 'center', 'back', 'packaging', 'wear'))
       or exists (select 1 from jsonb_each(v_specs) e
                   where jsonb_typeof(e.value) not in ('object', 'null')
                      or (jsonb_typeof(e.value) = 'object' and (
                            exists (select 1 from jsonb_object_keys(e.value) l where l not in ('fr', 'en'))
                            or char_length(btrim(coalesce(e.value ->> 'fr', ''))) > 120
                            or char_length(btrim(coalesce(e.value ->> 'en', ''))) > 120)))) then
    raise exception 'admin_save_product: invalid characteristics' using errcode = '22023';
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

  -- 2b. Characteristics (only when the payload carries them): French on the
  --     product, English on its English row when there is one ---------------
  if v_specs is not null then
    update public.products
       set spec_material  = nullif(btrim(v_specs -> 'material'  ->> 'fr'), ''),
           spec_center    = nullif(btrim(v_specs -> 'center'    ->> 'fr'), ''),
           spec_back      = nullif(btrim(v_specs -> 'back'      ->> 'fr'), ''),
           spec_packaging = nullif(btrim(v_specs -> 'packaging' ->> 'fr'), ''),
           spec_wear      = nullif(btrim(v_specs -> 'wear'      ->> 'fr'), '')
     where id = v_id;
    update public.product_translations
       set spec_material  = nullif(btrim(v_specs -> 'material'  ->> 'en'), ''),
           spec_center    = nullif(btrim(v_specs -> 'center'    ->> 'en'), ''),
           spec_back      = nullif(btrim(v_specs -> 'back'      ->> 'en'), ''),
           spec_packaging = nullif(btrim(v_specs -> 'packaging' ->> 'en'), ''),
           spec_wear      = nullif(btrim(v_specs -> 'wear'      ->> 'en'), '')
     where product_id = v_id and locale = 'en';
  end if;

  -- 3. Pack / size options (only when the payload carries them) ---------------
  if v_variants is not null then
    -- Only pack/size variants are managed here: a product whose variants are
    -- something else (colours, boxes…) must not lose them to this editor.
    if exists (
      select 1 from public.product_variants pv
       where pv.product_id = v_id
         and (pv.attributes = '{}'::jsonb
              or exists (select 1 from jsonb_object_keys(pv.attributes) k where k not in ('pack', 'ss', 'mm')))
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
      -- Dimensions in millimetres: one value (diameter / longest side) or two
      -- (width × length), each 0.5–30 mm to a tenth, stored ascending.
      v_mm := v_item -> 'mm';
      if v_mm is not null and jsonb_typeof(v_mm) = 'null' then
        v_mm := null;
      end if;
      if v_mm is not null then
        if jsonb_typeof(v_mm) <> 'array' or jsonb_array_length(v_mm) not between 1 and 2
           or exists (select 1 from jsonb_array_elements(v_mm) d
                       where jsonb_typeof(d) <> 'number'
                          or (d #>> '{}')::numeric not between 0.5 and 30
                          or (d #>> '{}')::numeric <> round((d #>> '{}')::numeric, 1)) then
          raise exception 'admin_save_product: invalid dimensions' using errcode = '22023';
        end if;
        select jsonb_agg(to_jsonb(trim_scale(x)) order by x),
               string_agg(replace(trim_scale(x)::text, '.', ','), ' × ' order by x) || ' mm',
               string_agg(trim_scale(x)::text, ' × ' order by x) || ' mm',
               string_agg(replace(trim_scale(x)::text, '.', 'P'), 'X' order by x) || 'MM'
          into v_mm, v_mm_fr, v_mm_en, v_mm_sku
          from (select (d #>> '{}')::numeric as x from jsonb_array_elements(v_mm) d) dims;
      else
        v_mm_fr := null;
        v_mm_en := null;
        v_mm_sku := null;
      end if;
      if v_ss is not null and v_mm is not null then
        raise exception 'admin_save_product: a variant has a stone size or dimensions, not both' using errcode = '22023';
      end if;
      if v_pack is null and v_ss is null and v_mm is null then
        raise exception 'admin_save_product: a variant needs a pack or a size' using errcode = '22023';
      end if;
      -- One way of sizing per product: SS gauges or millimetre dimensions.
      v_kind := case when v_ss is not null then 'ss' when v_mm is not null then 'mm' end;
      if v_kind is not null and not (v_kind = any (v_kinds)) then
        v_kinds := array_append(v_kinds, v_kind);
      end if;
      if cardinality(v_kinds) > 1 then
        raise exception 'admin_save_product: a product is sized in SS or in millimetres, not both' using errcode = '22023';
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

      v_name_fr := concat_ws(' · ', 'Pack de ' || v_pack, 'SS' || v_ss, v_mm_fr);
      v_name_en := concat_ws(' · ', 'Pack of ' || v_pack, 'SS' || v_ss, v_mm_en);
      v_vsku := case when v_sku is null then null
                     else v_sku || concat('-P' || v_pack, '-SS' || v_ss, '-' || v_mm_sku) end;
      if v_vsku is not null and v_vsku !~ '^[A-Z0-9][A-Z0-9-]{1,63}$' then
        raise exception 'admin_save_product: product SKU too long for its option SKUs' using errcode = '22023';
      end if;

      -- The same combination twice in one payload would silently merge.
      select pv.id into v_variant_id
        from public.product_variants pv
       where pv.product_id = v_id
         and pv.attributes -> 'pack' is not distinct from to_jsonb(v_pack)
         and pv.attributes -> 'ss'   is not distinct from to_jsonb(v_ss)
         and pv.attributes -> 'mm'   is not distinct from v_mm;
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
                jsonb_strip_nulls(jsonb_build_object('pack', v_pack, 'ss', v_ss, 'mm', v_mm)),
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
         and not exists (select 1 from jsonb_object_keys(pv.attributes) k where k not in ('pack', 'ss', 'mm'))
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
            else '{}'::jsonb end
    || case when v_specs is not null
            then jsonb_build_object('specs', true)
            else '{}'::jsonb end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. FAQ groups — tables
-- -----------------------------------------------------------------------------
create table public.faq_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  status     text not null default 'draft' check (status in ('draft', 'published')),
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.faq_groups is
  'A set of frequently asked questions, assigned to products and categories. name is for the back office only.';

create index faq_groups_status_position_idx on public.faq_groups (status, position);

alter table public.faq_groups enable row level security;

create trigger faq_groups_audit
  before insert or update on public.faq_groups
  for each row execute function private.set_audit_columns();
create trigger faq_groups_audit_log
  after update on public.faq_groups
  for each row execute function private.audit_changes('status', 'name');
create trigger faq_groups_audit_log_delete
  after delete on public.faq_groups
  for each row execute function private.audit_changes();

create table public.faq_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.faq_groups (id) on delete cascade,
  question   text not null check (char_length(btrim(question)) between 1 and 300),
  answer     text not null check (char_length(btrim(answer)) between 1 and 2000),
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.faq_items is 'One question and its answer (French) in a FAQ group.';

create index faq_items_group_position_idx on public.faq_items (group_id, position);

alter table public.faq_items enable row level security;

create trigger faq_items_audit
  before insert or update on public.faq_items
  for each row execute function private.set_audit_columns();

create table public.faq_item_translations (
  item_id    uuid not null references public.faq_items (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  question   text not null check (char_length(btrim(question)) between 1 and 300),
  answer     text not null check (char_length(btrim(answer)) between 1 and 2000),
  status     text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (item_id, locale)
);

create index faq_item_translations_locale_idx on public.faq_item_translations (locale);

alter table public.faq_item_translations enable row level security;

create trigger faq_item_translations_not_default_locale
  before insert or update on public.faq_item_translations
  for each row execute function private.reject_default_locale_translation();
create trigger faq_item_translations_audit
  before insert or update on public.faq_item_translations
  for each row execute function private.set_translation_audit();

create table public.product_faq_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id   uuid not null references public.faq_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, group_id)
);

create index product_faq_groups_group_idx on public.product_faq_groups (group_id);

alter table public.product_faq_groups enable row level security;

create table public.category_faq_groups (
  category_id uuid not null references public.categories (id) on delete cascade,
  group_id    uuid not null references public.faq_groups (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (category_id, group_id)
);

create index category_faq_groups_group_idx on public.category_faq_groups (group_id);

alter table public.category_faq_groups enable row level security;

-- -----------------------------------------------------------------------------
-- Privileges + RLS: visitors read published groups, their questions, published
-- translations and assignments; staff read everything; manage_products writes.
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on public.faq_groups, public.faq_items, public.faq_item_translations,
  public.product_faq_groups, public.category_faq_groups from anon, authenticated;
revoke insert, update, delete on public.faq_groups, public.faq_items, public.faq_item_translations,
  public.product_faq_groups, public.category_faq_groups from anon;
grant select on public.faq_groups, public.faq_items, public.faq_item_translations,
  public.product_faq_groups, public.category_faq_groups to anon, authenticated;
grant insert, update, delete on public.faq_groups, public.faq_items, public.faq_item_translations,
  public.product_faq_groups, public.category_faq_groups to authenticated;

-- Whether a group is published, whatever the caller may read (used inside the
-- child tables' policies; reads one boolean, never writes).
create or replace function private.faq_group_published(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.faq_groups g where g.id = p_group_id and g.status = 'published');
$$;

revoke all on function private.faq_group_published(uuid) from public;
grant execute on function private.faq_group_published(uuid) to anon, authenticated;

create policy "faq_groups: public reads published, staff read all"
  on public.faq_groups for select to anon, authenticated
  using (status = 'published' or (select private.is_staff()));
create policy "faq_groups: staff insert"
  on public.faq_groups for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "faq_groups: staff update"
  on public.faq_groups for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "faq_groups: staff delete"
  on public.faq_groups for delete to authenticated
  using ((select private.has_permission('manage_products')));

create policy "faq_items: public reads published groups, staff read all"
  on public.faq_items for select to anon, authenticated
  using (private.faq_group_published(group_id) or (select private.is_staff()));
create policy "faq_items: staff insert"
  on public.faq_items for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "faq_items: staff update"
  on public.faq_items for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "faq_items: staff delete"
  on public.faq_items for delete to authenticated
  using ((select private.has_permission('manage_products')));

create policy "faq_item_translations: public reads published, staff read all"
  on public.faq_item_translations for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.faq_items i
       where i.id = faq_item_translations.item_id and private.faq_group_published(i.group_id)))
    or (select private.is_staff())
  );
create policy "faq_item_translations: staff insert"
  on public.faq_item_translations for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "faq_item_translations: staff update"
  on public.faq_item_translations for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "faq_item_translations: staff delete"
  on public.faq_item_translations for delete to authenticated
  using ((select private.has_permission('manage_products')));

create policy "product_faq_groups: public reads published groups, staff read all"
  on public.product_faq_groups for select to anon, authenticated
  using (private.faq_group_published(group_id) or (select private.is_staff()));
create policy "product_faq_groups: staff insert"
  on public.product_faq_groups for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "product_faq_groups: staff delete"
  on public.product_faq_groups for delete to authenticated
  using ((select private.has_permission('manage_products')));

create policy "category_faq_groups: public reads published groups, staff read all"
  on public.category_faq_groups for select to anon, authenticated
  using (private.faq_group_published(group_id) or (select private.is_staff()));
create policy "category_faq_groups: staff insert"
  on public.category_faq_groups for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "category_faq_groups: staff delete"
  on public.category_faq_groups for delete to authenticated
  using ((select private.has_permission('manage_products')));

-- -----------------------------------------------------------------------------
-- product_faq(): the questions a product page shows, in one language
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: RLS limits visitors to active products and published
-- content. Only published groups count, for staff too, so a preview is what a
-- customer sees. A product's own groups replace its category's. Text in
-- p_locale when a published translation exists, else French.
create or replace function public.product_faq(p_product_id uuid, p_locale text default 'fr')
returns table (group_id uuid, item_id uuid, question text, answer text)
language sql
stable
security invoker
set search_path = ''
as $$
  with product as (
    select p.id, p.category_id from public.products p where p.id = p_product_id
  ),
  own as (
    select pg.group_id
      from public.product_faq_groups pg
      join product on product.id = pg.product_id
      join public.faq_groups g on g.id = pg.group_id and g.status = 'published'
  ),
  chosen as (
    select group_id from own
    union
    select cg.group_id
      from public.category_faq_groups cg
      join product on product.category_id = cg.category_id
     where not exists (select 1 from own)
  )
  select g.id, i.id,
         coalesce(t.question, i.question),
         coalesce(t.answer, i.answer)
    from chosen c
    join public.faq_groups g on g.id = c.group_id and g.status = 'published'
    join public.faq_items i on i.group_id = g.id
    left join public.faq_item_translations t
      on t.item_id = i.id and t.locale = p_locale and t.status = 'published'
   order by g.position, g.name, g.id, i.position, i.id;
$$;

revoke all on function public.product_faq(uuid, text) from public;
grant execute on function public.product_faq(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- admin_save_faq_group(): a group, its questions and its assignments at once
-- -----------------------------------------------------------------------------
-- Payload:
--   { "id": uuid, "name": text, "status": "draft" | "published",
--     "items": [ { "id": uuid, "question": text, "answer": text,
--                  "question_en": text, "answer_en": text } ],   -- complete, ordered
--     "product_ids": [uuid], "category_ids": [uuid] }               -- complete sets
-- Items not listed are deleted; an English translation is published when both
-- English texts are set, else removed (the page falls back to French). A new
-- group goes after the existing ones. SECURITY INVOKER: RLS and the explicit
-- permission check both apply.
create or replace function public.admin_save_faq_group(p_group jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id         uuid;
  v_name       text := btrim(coalesce(p_group ->> 'name', ''));
  v_status     text := coalesce(p_group ->> 'status', 'draft');
  v_items      jsonb := coalesce(p_group -> 'items', '[]'::jsonb);
  v_products   jsonb := coalesce(p_group -> 'product_ids', '[]'::jsonb);
  v_categories jsonb := coalesce(p_group -> 'category_ids', '[]'::jsonb);
  v_item       jsonb;
  v_item_id    uuid;
  v_item_ids   uuid[] := '{}';
  v_owner      uuid;
  v_q          text;
  v_a          text;
  v_q_en       text;
  v_a_en       text;
  v_position   integer := 0;
  v_uuid       constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_save_faq_group: permission denied' using errcode = '42501';
  end if;
  if coalesce(p_group ->> 'id', '') !~* v_uuid then
    raise exception 'admin_save_faq_group: id is required' using errcode = '22023';
  end if;
  v_id := (p_group ->> 'id')::uuid;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'admin_save_faq_group: a group needs a name of 1 to 120 characters' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'admin_save_faq_group: invalid status' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 50 then
    raise exception 'admin_save_faq_group: items must be an array of at most 50 questions' using errcode = '22023';
  end if;
  if v_status = 'published' and jsonb_array_length(v_items) = 0 then
    raise exception 'admin_save_faq_group: a published group needs at least one question' using errcode = '22023';
  end if;
  if jsonb_typeof(v_products) <> 'array' or jsonb_array_length(v_products) > 5000
     or exists (select 1 from jsonb_array_elements(v_products) e
                 where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~* v_uuid) then
    raise exception 'admin_save_faq_group: invalid product_ids' using errcode = '22023';
  end if;
  if jsonb_typeof(v_categories) <> 'array' or jsonb_array_length(v_categories) > 200
     or exists (select 1 from jsonb_array_elements(v_categories) e
                 where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~* v_uuid) then
    raise exception 'admin_save_faq_group: invalid category_ids' using errcode = '22023';
  end if;

  -- Validate every question first, so nothing half-applies.
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'id', '') !~* v_uuid then
      raise exception 'admin_save_faq_group: a question needs an id' using errcode = '22023';
    end if;
    v_item_id := (v_item ->> 'id')::uuid;
    if v_item_id = any (v_item_ids) then
      raise exception 'admin_save_faq_group: duplicate question %', v_item_id using errcode = '22023';
    end if;
    select i.group_id into v_owner from public.faq_items i where i.id = v_item_id;
    if v_owner is not null and v_owner <> v_id then
      raise exception 'admin_save_faq_group: question % belongs to another group', v_item_id using errcode = '22023';
    end if;
    v_owner := null;
    if char_length(btrim(coalesce(v_item ->> 'question', ''))) not between 1 and 300
       or char_length(btrim(coalesce(v_item ->> 'question_en', ''))) > 300 then
      raise exception 'admin_save_faq_group: a question needs 1 to 300 characters' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_item ->> 'answer', ''))) not between 1 and 2000
       or char_length(btrim(coalesce(v_item ->> 'answer_en', ''))) > 2000 then
      raise exception 'admin_save_faq_group: an answer needs 1 to 2000 characters' using errcode = '22023';
    end if;
    v_item_ids := array_append(v_item_ids, v_item_id);
  end loop;

  -- Group
  if exists (select 1 from public.faq_groups where id = v_id) then
    update public.faq_groups set name = v_name, status = v_status where id = v_id;
  else
    insert into public.faq_groups (id, name, status, position)
    values (v_id, v_name, v_status,
            coalesce((select max(position) + 1 from public.faq_groups), 0));
  end if;

  -- Questions
  delete from public.faq_items where group_id = v_id and not (id = any (v_item_ids));

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_item_id := (v_item ->> 'id')::uuid;
    v_q := btrim(v_item ->> 'question');
    v_a := btrim(v_item ->> 'answer');
    v_q_en := nullif(btrim(coalesce(v_item ->> 'question_en', '')), '');
    v_a_en := nullif(btrim(coalesce(v_item ->> 'answer_en', '')), '');

    insert into public.faq_items (id, group_id, question, answer, position)
    values (v_item_id, v_id, v_q, v_a, v_position)
    on conflict (id) do update
       set question = excluded.question, answer = excluded.answer, position = excluded.position;

    if v_q_en is not null and v_a_en is not null then
      insert into public.faq_item_translations (item_id, locale, question, answer, status)
      values (v_item_id, 'en', v_q_en, v_a_en, 'published')
      on conflict (item_id, locale) do update
         set question = excluded.question, answer = excluded.answer, status = 'published';
    else
      delete from public.faq_item_translations where item_id = v_item_id and locale = 'en';
    end if;

    v_position := v_position + 1;
  end loop;

  -- Assignments: the payload is the complete set.
  delete from public.product_faq_groups pg
   where pg.group_id = v_id
     and not exists (select 1 from jsonb_array_elements_text(v_products) e where e::uuid = pg.product_id);
  insert into public.product_faq_groups (product_id, group_id)
  select distinct e::uuid, v_id from jsonb_array_elements_text(v_products) e
  on conflict do nothing;

  delete from public.category_faq_groups cg
   where cg.group_id = v_id
     and not exists (select 1 from jsonb_array_elements_text(v_categories) e where e::uuid = cg.category_id);
  insert into public.category_faq_groups (category_id, group_id)
  select distinct e::uuid, v_id from jsonb_array_elements_text(v_categories) e
  on conflict do nothing;

  return jsonb_build_object('id', v_id, 'items', to_jsonb(v_item_ids));
exception
  when foreign_key_violation then
    raise exception 'admin_save_faq_group: unknown product or category' using errcode = '22023';
end;
$$;

revoke all on function public.admin_save_faq_group(jsonb) from public, anon;
grant execute on function public.admin_save_faq_group(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Seed: the product page's former three questions, for the gems category
-- -----------------------------------------------------------------------------
do $$
declare
  v_category uuid := (select id from public.categories where slug = 'gems');
  v_group    uuid := gen_random_uuid();
  v_item     uuid;
  v_row      record;
begin
  if v_category is null or exists (select 1 from public.faq_groups) then
    return;
  end if;

  insert into public.faq_groups (id, name, status, position)
  values (v_group, 'Toothgems — questions fréquentes', 'published', 0);

  for v_row in
    select * from (values
      (0, 'Combien de temps une gem tient-elle ?',
          'Posée correctement, de six à douze mois. Le collage est réversible et laisse l’émail intact.',
          'How long does a gem last?',
          'Applied correctly, six to twelve months. The bond is reversible and leaves the enamel intact.'),
      (1, 'Y a-t-il un perçage ?',
          'Non. La gem est collée sur l’émail avec un adhésif dentaire : rien n’est percé ni limé.',
          'Is there any drilling involved?',
          'No. The gem is bonded to the enamel with a dental adhesive: nothing is drilled or filed.'),
      (2, 'Puis-je la poser moi-même ?',
          'Nous vendons aux artistes formés. La formation Fondation couvre la préparation, la pose et le suivi.',
          'Can I apply it myself?',
          'We sell to trained artists. The Foundation course covers prep, application and aftercare.')
    ) as q (position, question, answer, question_en, answer_en)
  loop
    insert into public.faq_items (group_id, question, answer, position)
    values (v_group, v_row.question, v_row.answer, v_row.position)
    returning id into v_item;
    insert into public.faq_item_translations (item_id, locale, question, answer, status)
    values (v_item, 'en', v_row.question_en, v_row.answer_en, 'published');
  end loop;

  insert into public.category_faq_groups (category_id, group_id) values (v_category, v_group);
end;
$$;
