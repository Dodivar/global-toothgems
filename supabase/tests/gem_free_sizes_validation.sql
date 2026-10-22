-- =============================================================================
-- Gem free sizes validation suite — millimetre sizes in admin_save_product()
-- (migration `…_gem_free_sizes`, decision 107).
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL GEM FREE SIZES TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000107002';
  cust  uuid := '00000000-0000-4000-a000-000000107003';
  p_gem uuid := '00000000-0000-4000-a000-0000001070a1';
  p_txt uuid := '00000000-0000-4000-a000-0000001070a2';
  c_gems uuid;
  base jsonb; res jsonb; v_state text; v_txt text; v_id uuid; bad text;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'mgr107.test@example.invalid', '{"first_name":"Mia"}', now(), now()),
    (cust, 'authenticated', 'authenticated', 'cust107.test@example.invalid', '{"first_name":"Cam"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  select id into c_gems from public.categories where slug = 'gems';

  base := jsonb_build_object(
    'id', p_gem, 'category_id', c_gems, 'sku', 'GEM-BAG-T107', 'slug', 'baguette-t107',
    'name', 'Baguette test', 'price', '9.00', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'Test baguette', 'slug', 'test-baguette-t107')),
    'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 0, 'low_stock_threshold', 2),
    'media', '[]'::jsonb);

  perform set_config('role', 'authenticated', true);

  -- S1: a customer cannot save a product, sizes or not -------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.admin_save_product(base || jsonb_build_object('variants', '[{"pack": 10, "mm": [2, 4]}]'::jsonb));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S1: customer saved a product (%)', v_state; end if;
  passed := array_append(passed, 'S1 customer refused');

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  -- S2: millimetre sizes become named, SKU'd variants, dimensions ascending ----
  res := public.admin_save_product(base || jsonb_build_object('variants', jsonb_build_array(
    jsonb_build_object('pack', 10, 'mm', jsonb_build_array(4, 2), 'quantity_on_hand', 5),
    jsonb_build_object('pack', 10, 'mm', jsonb_build_array(2.5, 5.0), 'price', '11.00', 'quantity_on_hand', 3),
    jsonb_build_object('pack', 25, 'mm', jsonb_build_array(3)))));
  if jsonb_array_length(res -> 'variants') <> 3 then raise exception 'FAIL S2: variants not returned: %', res; end if;
  select name || '|' || sku into v_txt from public.product_variants
   where product_id = p_gem and attributes = '{"pack": 10, "mm": [2.5, 5]}'::jsonb;
  if v_txt is distinct from 'Pack de 10 · 2,5 × 5 mm|GEM-BAG-T107-P10-2P5X5MM' then raise exception 'FAIL S2: variant %', v_txt; end if;
  if (select t.name from public.product_variant_translations t join public.product_variants v on v.id = t.variant_id
       where v.product_id = p_gem and v.attributes = '{"pack": 10, "mm": [2, 4]}'::jsonb and t.locale = 'en') <> 'Pack of 10 · 2 × 4 mm' then
    raise exception 'FAIL S2: English name';
  end if;
  if (select sku from public.product_variants where product_id = p_gem and attributes = '{"pack": 25, "mm": [3]}'::jsonb)
     is distinct from 'GEM-BAG-T107-P25-3MM' then
    raise exception 'FAIL S2: one-dimension SKU';
  end if;
  passed := array_append(passed, 'S2 mm sizes saved, named per language, SKU suffixed, ascending');

  -- S3: the same size written the other way round is the same option ----------
  select id into v_id from public.product_variants where product_id = p_gem and attributes = '{"pack": 10, "mm": [2, 4]}'::jsonb;
  perform public.admin_save_product(base || jsonb_build_object('variants', jsonb_build_array(
    jsonb_build_object('pack', 10, 'mm', jsonb_build_array(2, 4), 'quantity_on_hand', 6))));
  if (select count(*) from public.product_variants where product_id = p_gem) <> 1
     or not exists (select 1 from public.product_variants where id = v_id) then
    raise exception 'FAIL S3: option not kept by its size';
  end if;
  if (select quantity_on_hand from public.inventory_items where variant_id = v_id) <> 6 then
    raise exception 'FAIL S3: stock not updated';
  end if;
  v_state := null;
  begin
    perform public.admin_save_product(base || jsonb_build_object('variants', '[{"pack": 10, "mm": [2, 4]}, {"pack": 10, "mm": [4, 2]}]'::jsonb));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL S3: duplicate accepted (%)', v_state; end if;
  passed := array_append(passed, 'S3 options matched by size whatever the order, duplicates refused');

  -- S4: bad dimensions, a mix of SS and mm, both on one option: refused --------
  foreach bad in array array[
    '[{"mm": [0.4]}]', '[{"mm": [31]}]', '[{"mm": [2.55]}]', '[{"mm": [2, 4, 6]}]', '[{"mm": []}]',
    '[{"mm": "2x4"}]', '[{"mm": ["2", "4"]}]', '[{"mm": 3}]', '[{"ss": 6, "mm": [2]}]',
    '[{"ss": 6}, {"mm": [2, 4]}]'
  ] loop
    v_state := null;
    begin
      perform public.admin_save_product(base || jsonb_build_object('variants', bad::jsonb));
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL S4: % accepted (%)', bad, v_state; end if;
  end loop;
  passed := array_append(passed, 'S4 invalid or mixed sizes refused');

  -- S5: SS options still work as before ----------------------------------------
  perform public.admin_save_product(base || jsonb_build_object('variants', '[{"pack": 20, "ss": 6}]'::jsonb));
  if (select name || '|' || sku from public.product_variants where product_id = p_gem and is_active)
     is distinct from 'Pack de 20 · SS6|GEM-BAG-T107-P20-SS6' then
    raise exception 'FAIL S5: SS option';
  end if;
  passed := array_append(passed, 'S5 SS options unchanged');

  -- S6: a free-text `size` variant is not taken over by the gem editor ---------
  perform public.admin_save_product(jsonb_build_object(
    'id', p_txt, 'category_id', c_gems, 'sku', 'GEM-TXT-T107', 'slug', 'charm-t107', 'name', 'Charm test',
    'price', '50.00', 'status', 'active', 'media', '[]'::jsonb));
  execute 'reset role';
  insert into public.product_variants (product_id, name, attributes) values (p_txt, '2 mm', '{"size": "2mm"}');
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    perform public.admin_save_product(jsonb_build_object(
      'id', p_txt, 'category_id', c_gems, 'sku', 'GEM-TXT-T107', 'name', 'Charm test', 'price', '50.00',
      'status', 'active', 'media', '[]'::jsonb, 'variants', '[{"mm": [2]}]'::jsonb));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL S6: free-text size variant overwritten (%)', v_state; end if;
  passed := array_append(passed, 'S6 free-text size variants stay with the generic editor');

  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
  execute 'set constraints all immediate';
  raise exception 'ALL GEM FREE SIZES TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
