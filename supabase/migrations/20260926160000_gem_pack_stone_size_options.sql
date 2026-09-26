-- =============================================================================
-- Migration — Gem options: pack (20 / 50 / 100 stones) × stone size (SS)
-- =============================================================================
-- Gems are sold in packs of 20, 50 or 100 stones, each in a stone size (SS,
-- "stone size", the rhinestone gauge: SS6 ≈ 2 mm). Every pack × size a
-- product offers is one row of `product_variants`, with its own price and its
-- own stock row, exactly like the existing variants (migration 002):
--
--   attributes = {"pack": 50, "ss": 6}      -- integers, so SS6 sorts before SS10
--
-- Either axis may be absent: {"pack": 20} or {"ss": 6} are valid variants of
-- a product offered in packs only / in sizes only. No new column: option
-- values live in `attributes` by design. The key is `pack`, not the existing
-- `quantity` of the sterile capsule boxes, so the gem editor never takes over
-- a non-gem product's variants.
--
-- admin_save_product() gains an OPTIONAL `variants` key:
--   absent        variants are left exactly as they are (products whose
--                 variants are colours, sizes in mm, boxes… keep them);
--   [] or a list  the complete list of pack/SS options the product offers:
--                 [{ pack, ss, price, track_inventory, quantity_on_hand,
--                    low_stock_threshold }]
--                 pack ∈ {20, 50, 100} or null, ss ∈ 1..60 or null (not both
--                 null), price a decimal string or null (null = the product
--                 price). Names (fr + en) and SKUs (<product sku>-P50-SS6) are
--                 derived here, never trusted from the browser.
--
-- Rows are matched by their (pack, ss) combination, not by id, so an option
-- removed then re-added reuses its row (names and SKUs are unique). An option
-- no longer offered is deleted, or deactivated when an order references it
-- (order_items.variant_id is ON DELETE RESTRICT).
--
-- Stock: a product keeps its stock on its variants while it has ACTIVE
-- variants — the same test create_order() uses to require a variant. Once it
-- has none, the product-level inventory row applies again.
--
-- The function returns `variants` (ids, in position order) when the payload
-- carried the key: the admin checks for it, so a front end deployed before
-- this migration fails loudly instead of silently dropping the options.
-- Everything else is unchanged from `…_admin_save_product_variant_stock.sql`.
-- =============================================================================

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

  -- 1. Product row ------------------------------------------------------------
  if exists (select 1 from public.products where id = v_id) then
    update public.products
       set category_id       = (p_product ->> 'category_id')::uuid,
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
      (id, category_id, sku, name, slug, short_description, description,
       price, compare_at_price, status, metadata)
    values
      (v_id, (p_product ->> 'category_id')::uuid, nullif(p_product ->> 'sku', ''),
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
      if coalesce(v_item ->> 'pack', '') !~ '^(20|50|100)?$' then
        raise exception 'admin_save_product: pack must be 20, 50 or 100' using errcode = '22023';
      end if;
      if coalesce(v_item ->> 'ss', '') !~ '^\d{1,2}$' and coalesce(v_item ->> 'ss', '') <> '' then
        raise exception 'admin_save_product: invalid stone size' using errcode = '22023';
      end if;
      v_pack := nullif(v_item ->> 'pack', '')::integer;
      v_ss   := nullif(v_item ->> 'ss', '')::integer;
      if v_pack is null and v_ss is null then
        raise exception 'admin_save_product: a variant needs a pack or a stone size' using errcode = '22023';
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
    if coalesce(v_item ->> 'id', '') <> '' then
      update public.product_media
         set position   = v_position,
             is_primary = (v_position = 0),
             alt_text   = nullif(v_item ->> 'alt_fr', '')
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
      insert into public.product_media (product_id, storage_path, alt_text, position, is_primary)
      values (v_id, v_item ->> 'storage_path', nullif(v_item ->> 'alt_fr', ''), v_position, v_position = 0)
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
            else '{}'::jsonb end;
end;
$$;

comment on function public.admin_save_product(jsonb) is
  'Back office: create/update a product with its English translation, stock, media and (optional) pack × stone-size options in one transaction. SECURITY INVOKER — RLS applies.';
