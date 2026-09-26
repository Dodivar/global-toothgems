-- =============================================================================
-- Migration — Back-office product management (iteration 10)
-- =============================================================================
-- The admin product form edits one product as a whole: base (fr) columns, the
-- English translation, stock, media and their alt texts. Written as separate
-- PostgREST calls, a failure halfway would leave e.g. a product without its
-- inventory row. These functions apply each edit in ONE transaction.
--
-- All three are SECURITY INVOKER: they add no privilege. Every statement runs
-- as the calling user, so the existing RLS policies (manage_products) still
-- decide what is allowed; the explicit permission check only turns a silent
-- zero-row write into a clear error.
--
-- Money arrives as a decimal STRING ("32.00") and is validated before the
-- cast, so no float ever reaches numeric(12,2).
--
-- Storage objects cannot be deleted from SQL; the functions return the object
-- paths that no product_media row references any more, and the browser
-- removes them from the `product-media` bucket (RLS-protected as well).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Create or update a product.
-- Payload:
--   id                uuid (client-generated on create, so media can be
--                     uploaded under products/<id>/ before the first save)
--   category_id, sku, slug (create only), name, short_description, description
--   price, compare_at_price   decimal strings, compare_at_price nullable
--   status            draft | active | archived
--   metadata          merged into products.metadata (presentation only)
--   translations.en   { name, short_description, description, slug }
--                     empty name = no English translation (row removed)
--   inventory         { track_inventory, quantity_on_hand,
--                       low_stock_threshold, availability }
--   media             ordered array of { id?, storage_path, alt_fr, alt_en };
--                     the first item is the cover (is_primary)
-- Returns { id, slug, removed_paths }.
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

comment on function public.admin_save_product(jsonb) is
  'Back office: create/update a product with its English translation, stock and media in one transaction. SECURITY INVOKER — RLS applies.';

-- -----------------------------------------------------------------------------
-- Delete a product. Products already ordered are protected by the order_items
-- foreign key (RESTRICT): the caller gets 23503 and should archive instead.
-- Returns the storage paths no other product uses any more.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_product(p_product_id uuid)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paths text[];
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_delete_product: permission denied' using errcode = '42501';
  end if;

  select array_agg(storage_path) into v_paths from public.product_media where product_id = p_product_id;

  delete from public.products where id = p_product_id;
  if not found then
    raise exception 'admin_delete_product: product not found' using errcode = 'P0002';
  end if;

  return coalesce(array(
    select distinct path
      from unnest(v_paths) as path
     where path like 'products/%'
       and not exists (select 1 from public.product_media m where m.storage_path = path)
  ), '{}'::text[]);
end;
$$;

comment on function public.admin_delete_product(uuid) is
  'Back office: hard-delete a never-ordered product. SECURITY INVOKER — RLS applies.';

-- -----------------------------------------------------------------------------
-- Replace a product's recommendation lists (both kinds) in one transaction.
-- Order in each array = display position; duplicates and self links dropped.
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_product_recommendations(
  p_product_id    uuid,
  p_complementary uuid[],
  p_similar       uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_save_product_recommendations: permission denied' using errcode = '42501';
  end if;

  delete from public.product_recommendations where product_id = p_product_id;

  insert into public.product_recommendations (product_id, recommended_product_id, kind, position)
  select p_product_id, r.id, r.kind, (row_number() over (partition by r.kind order by r.ord) - 1)::integer
    from (
      select distinct on (x.kind, x.id) x.kind, x.id, x.ord
        from (
          select 'complementary'::text as kind, u.id, u.ord
            from unnest(coalesce(p_complementary, '{}'::uuid[])) with ordinality as u (id, ord)
          union all
          select 'similar'::text, u.id, u.ord
            from unnest(coalesce(p_similar, '{}'::uuid[])) with ordinality as u (id, ord)
        ) x
       where x.id <> p_product_id
       order by x.kind, x.id, x.ord
    ) r;
end;
$$;

comment on function public.admin_save_product_recommendations(uuid, uuid[], uuid[]) is
  'Back office: replace the complementary and similar lists of a product. SECURITY INVOKER — RLS applies.';

-- -----------------------------------------------------------------------------
-- Grants: signed-in staff only (the permission check and RLS do the rest).
-- -----------------------------------------------------------------------------
revoke all on function public.admin_save_product(jsonb) from public, anon;
revoke all on function public.admin_delete_product(uuid) from public, anon;
revoke all on function public.admin_save_product_recommendations(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_save_product(jsonb) to authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;
grant execute on function public.admin_save_product_recommendations(uuid, uuid[], uuid[]) to authenticated;
