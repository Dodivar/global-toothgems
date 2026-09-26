-- =============================================================================
-- Migration — admin_save_product(): leave variant and digital stock alone
-- =============================================================================
-- Products with variants keep one inventory row per VARIANT (migration 002:
-- exactly one of product_id / variant_id). The first version of
-- admin_save_product() always wrote a product-level row, which for such a
-- product would add a second, contradictory stock figure. The admin form does
-- not edit variants yet, so the function now skips stock entirely for products
-- with variants, and for digital products (which have no stock).
-- Everything else is unchanged from `…_admin_product_management.sql`.
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
  v_en        jsonb := p_product -> 'translations' -> 'en';
  v_slug      text;
  v_base      text;
  v_n         integer := 1;
  v_keep      uuid[];
  v_removed   text[];
  v_item      jsonb;
  v_media_id  uuid;
  v_position  integer := 0;
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

  -- 3. Stock: one inventory row per product without variants -----------------
  --    A product with variants keeps its stock on each variant, and a digital
  --    product has none; the admin form edits neither, so both are left alone.
  if exists (select 1 from public.product_variants where product_id = v_id)
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

  -- 4. Media: the payload is the complete, ordered list ------------------------
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
  );
end;
$$;

