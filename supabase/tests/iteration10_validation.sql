-- =============================================================================
-- Iteration 10 validation suite — back-office product management functions.
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 10 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000100002';
  vwr   uuid := '00000000-0000-4000-a000-000000100003';
  p_new uuid := '00000000-0000-4000-a000-0000001000a1';
  p_dup uuid := '00000000-0000-4000-a000-0000001000a2';
  c_gems uuid; p_star uuid; p_gel uuid;
  payload jsonb; res jsonb; v_state text; v_cnt int; v_txt text; v_num numeric; v_ids uuid[];
  m_first uuid; m_second uuid;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'mgr10.test@example.invalid', '{"first_name":"Mia"}', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'vwr10.test@example.invalid', '{"first_name":"Val"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer'  where id = vwr;
  select id into c_gems from public.categories where slug = 'gems';
  select id into p_star from public.products where slug = 'etoile-cristal';
  select id into p_gel  from public.products where slug = 'gel-de-suivi';

  payload := jsonb_build_object(
    'id', p_new, 'category_id', c_gems, 'sku', 'GEM-TEST-100', 'slug', 'etoile-cristal',
    'name', 'Étoile test', 'short_description', 'Courte', 'description', 'Longue',
    'price', '12.50', 'compare_at_price', '15.00', 'status', 'draft',
    'metadata', jsonb_build_object('type', 'single', 'material', jsonb_build_object('fr', 'Cristal', 'en', 'Crystal'), 'tags', jsonb_build_array('test')),
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'Test star', 'slug', 'test-star', 'short_description', 'Short', 'description', 'Long')),
    'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 40, 'low_stock_threshold', 8, 'availability', 'in_stock'),
    'media', jsonb_build_array(
      jsonb_build_object('storage_path', 'products/' || p_new || '/a.jpg', 'alt_fr', 'Vue A', 'alt_en', 'View A'),
      jsonb_build_object('storage_path', 'products/' || p_new || '/b.jpg', 'alt_fr', 'Vue B', 'alt_en', '')));

  -- P1: only manage_products may call ---------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.admin_save_product(payload);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P1: anon got %', v_state; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.admin_save_product(payload);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P1: viewer got %', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'P1 visitors and read-only staff cannot write products');

  -- P2: create = product + translation + stock + media, one call -------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  res := public.admin_save_product(payload);
  execute 'reset role';

  if res ->> 'slug' <> 'etoile-cristal-2' then raise exception 'FAIL P2: slug not made unique: %', res; end if;
  select price into v_num from public.products where id = p_new;
  if v_num <> 12.50 then raise exception 'FAIL P2: price %', v_num; end if;
  select count(*) into v_cnt from public.product_translations where product_id = p_new and locale = 'en' and status = 'published';
  if v_cnt <> 1 then raise exception 'FAIL P2: english translation not published'; end if;
  select count(*) into v_cnt from public.inventory_items where product_id = p_new and quantity_on_hand = 40 and low_stock_threshold = 8;
  if v_cnt <> 1 then raise exception 'FAIL P2: inventory row missing'; end if;
  select id into m_first  from public.product_media where product_id = p_new and position = 0 and is_primary;
  select id into m_second from public.product_media where product_id = p_new and position = 1 and not is_primary;
  if m_first is null or m_second is null then raise exception 'FAIL P2: media order/primary'; end if;
  select count(*) into v_cnt from public.product_media_translations where media_id in (m_first, m_second);
  if v_cnt <> 1 then raise exception 'FAIL P2: expected one english alt text, got %', v_cnt; end if;
  if (select metadata -> 'material' ->> 'en' from public.products where id = p_new) <> 'Crystal' then
    raise exception 'FAIL P2: metadata not stored';
  end if;
  passed := array_append(passed, 'P2 create writes product, published EN translation, stock and ordered media atomically; slug made unique');

  -- P3: update = reorder, drop a media, clear EN, adjust stock ---------------
  payload := payload
    || jsonb_build_object('price', '14', 'status', 'active')
    || jsonb_build_object('translations', jsonb_build_object('en', jsonb_build_object('name', '')))
    || jsonb_build_object('inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 35, 'low_stock_threshold', 8, 'availability', 'in_stock'))
    || jsonb_build_object('media', jsonb_build_array(
         jsonb_build_object('id', m_second, 'storage_path', 'ignored', 'alt_fr', 'Vue B', 'alt_en', 'View B')));
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  res := public.admin_save_product(payload);
  execute 'reset role';

  if res -> 'removed_paths' <> jsonb_build_array('products/' || p_new || '/a.jpg') then
    raise exception 'FAIL P3: removed paths %', res;
  end if;
  if not exists (select 1 from public.product_media where id = m_second and position = 0 and is_primary) then
    raise exception 'FAIL P3: remaining media did not become the cover';
  end if;
  if exists (select 1 from public.product_translations where product_id = p_new and locale = 'en') then
    raise exception 'FAIL P3: empty english name should remove the translation';
  end if;
  if (select slug from public.products where id = p_new) <> 'etoile-cristal-2' then
    raise exception 'FAIL P3: slug changed on update';
  end if;
  select count(*) into v_cnt from public.inventory_movements im
    join public.inventory_items ii on ii.id = im.inventory_item_id
   where ii.product_id = p_new and im.movement_type = 'adjustment' and im.on_hand_delta = -5 and im.actor_id = mgr;
  if v_cnt <> 1 then raise exception 'FAIL P3: stock adjustment not in the ledger'; end if;
  passed := array_append(passed, 'P3 update reorders media, reports orphaned files, removes cleared translation, logs stock adjustment');

  -- P4: money and consistency are validated server-side -----------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  foreach v_txt in array array['12.345', 'abc', '-1', '1e3'] loop
    v_state := null;
    begin
      perform public.admin_save_product(payload || jsonb_build_object('price', v_txt));
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL P4: price % gave %', v_txt, v_state; end if;
  end loop;
  v_state := null;
  begin
    perform public.admin_save_product(payload || jsonb_build_object('compare_at_price', '10.00'));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL P4: compare-at below price gave %', v_state; end if;
  v_state := null;
  begin
    perform public.admin_save_product(payload || jsonb_build_object('media', jsonb_build_array(
      jsonb_build_object('storage_path', '../../avatars/x.jpg'))));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL P4: bad storage path gave %', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'P4 invalid prices, compare-at and storage paths are rejected');

  -- P5: recommendations replaced in order, self and duplicates dropped --------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_product_recommendations(p_new, array[p_gel, p_new, p_star, p_gel], array[p_star]);
  execute 'reset role';
  select array_agg(recommended_product_id order by position) into v_ids
    from public.product_recommendations where product_id = p_new and kind = 'complementary';
  if v_ids is distinct from array[p_gel, p_star] then raise exception 'FAIL P5: complementary %', v_ids; end if;
  select count(*) into v_cnt from public.product_recommendations where product_id = p_new and kind = 'similar';
  if v_cnt <> 1 then raise exception 'FAIL P5: similar count %', v_cnt; end if;
  passed := array_append(passed, 'P5 recommendation lists replaced in order without self links or duplicates');

  -- P6: delete returns only files no other product uses -----------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  -- A duplicate shares the remaining image file.
  perform public.admin_save_product(payload || jsonb_build_object(
    'id', p_dup, 'sku', 'GEM-TEST-100-COPY', 'slug', 'etoile-test-copie', 'status', 'draft',
    'media', jsonb_build_array(jsonb_build_object('storage_path', 'products/' || p_new || '/b.jpg'))));
  v_txt := array_to_string(public.admin_delete_product(p_new), ',');
  if v_txt <> '' then raise exception 'FAIL P6: shared file reported as orphan: %', v_txt; end if;
  v_txt := array_to_string(public.admin_delete_product(p_dup), ',');
  if v_txt <> 'products/' || p_new || '/b.jpg' then raise exception 'FAIL P6: last user did not free the file: %', v_txt; end if;
  v_state := null;
  begin
    perform public.admin_delete_product(p_dup);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL P6: second delete gave %', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'P6 delete cascades and frees storage files only when unused');

  -- P7: a product with variants keeps its stock on the variants ---------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_product(jsonb_build_object(
    'id', p_star, 'category_id', c_gems, 'sku', 'GEM-STAR-001', 'name', 'Étoile Cristal', 'price', '33.00',
    'status', 'active', 'translations', jsonb_build_object('en', jsonb_build_object('name', 'Crystal Star')),
    'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 999),
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'alt_fr', alt_text) order by position)
                         from public.product_media where product_id = p_star), '[]'::jsonb)));
  execute 'reset role';
  if exists (select 1 from public.inventory_items where product_id = p_star) then
    raise exception 'FAIL P7: product-level stock row created for a product with variants';
  end if;
  if (select price from public.products where id = p_star) <> 33.00 then
    raise exception 'FAIL P7: product fields not saved';
  end if;
  passed := array_append(passed, 'P7 saving a product with variants leaves variant stock alone');

  perform set_config('request.jwt.claims', '', true);
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 10 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
