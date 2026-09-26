-- =============================================================================
-- Iteration 11 validation suite — gem options (pack × stone size) in
-- admin_save_product().
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 11 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000110002';
  p_gem uuid := '00000000-0000-4000-a000-0000001100a1';
  c_gems uuid; p_star uuid;
  base jsonb; res jsonb; v_state text; v_cnt int; v_txt text; v_id uuid;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'mgr11.test@example.invalid', '{"first_name":"Mia"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  select id into c_gems from public.categories where slug = 'gems';
  select id into p_star from public.products where slug = 'etoile-cristal';

  base := jsonb_build_object(
    'id', p_gem, 'category_id', c_gems, 'sku', 'GEM-SS-TEST', 'slug', 'strass-test',
    'name', 'Strass test', 'price', '12.00', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'Test rhinestone', 'slug', 'test-rhinestone')),
    'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 7, 'low_stock_threshold', 2),
    'media', '[]'::jsonb);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  -- G1: packs × sizes become variants with names, SKUs, prices and stock -------
  res := public.admin_save_product(base || jsonb_build_object('variants', jsonb_build_array(
    jsonb_build_object('pack', 20, 'ss', 6, 'price', null, 'quantity_on_hand', 40, 'low_stock_threshold', 5),
    jsonb_build_object('pack', 20, 'ss', 10, 'price', null, 'quantity_on_hand', 0, 'low_stock_threshold', 5),
    jsonb_build_object('pack', 50, 'ss', 6, 'price', '25.00', 'quantity_on_hand', 12, 'low_stock_threshold', 3),
    jsonb_build_object('pack', 50, 'ss', 10, 'price', '27.50', 'quantity_on_hand', 3, 'low_stock_threshold', 3))));
  if jsonb_array_length(res -> 'variants') <> 4 then raise exception 'FAIL G1: variants not returned: %', res; end if;
  select count(*) into v_cnt from public.product_variants where product_id = p_gem and is_active;
  if v_cnt <> 4 then raise exception 'FAIL G1: % variants', v_cnt; end if;
  select name || '|' || sku || '|' || price into v_txt from public.product_variants
   where product_id = p_gem and attributes = '{"pack": 50, "ss": 10}'::jsonb;
  if v_txt is distinct from 'Pack de 50 · SS10|GEM-SS-TEST-P50-SS10|27.50' then raise exception 'FAIL G1: variant %', v_txt; end if;
  if (select t.name from public.product_variant_translations t join public.product_variants v on v.id = t.variant_id
       where v.product_id = p_gem and v.attributes = '{"pack": 20, "ss": 6}'::jsonb and t.locale = 'en') <> 'Pack of 20 · SS6' then
    raise exception 'FAIL G1: English name';
  end if;
  if (select price from public.product_variants where product_id = p_gem and attributes = '{"pack": 20, "ss": 6}'::jsonb) is not null then
    raise exception 'FAIL G1: empty price should inherit the product price';
  end if;
  select sum(i.quantity_on_hand) into v_cnt from public.inventory_items i join public.product_variants v on v.id = i.variant_id
   where v.product_id = p_gem;
  if v_cnt <> 55 then raise exception 'FAIL G1: variant stock %', v_cnt; end if;
  if exists (select 1 from public.inventory_items where product_id = p_gem) then
    raise exception 'FAIL G1: product-level stock row created for a product with options';
  end if;
  if (select string_agg(attributes::text, ',' order by position) from public.product_variants where product_id = p_gem)
     <> '{"ss": 6, "pack": 20},{"ss": 10, "pack": 20},{"ss": 6, "pack": 50},{"ss": 10, "pack": 50}' then
    raise exception 'FAIL G1: positions do not follow the payload order';
  end if;
  passed := array_append(passed, 'G1 pack × SS options saved as named, priced, stocked variants');

  -- G2: invalid options are refused ------------------------------------------
  foreach v_txt in array array[
    '[{"pack": 30, "ss": 6}]', '[{"pack": 20, "ss": 0}]', '[{"pack": null, "ss": null}]',
    '[{"pack": 20, "ss": 6, "price": "1.999"}]', '[{"pack": 20, "ss": 6}, {"pack": 20, "ss": 6}]', '{"pack": 20}'
  ] loop
    v_state := null;
    begin
      perform public.admin_save_product(base || jsonb_build_object('variants', v_txt::jsonb));
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL G2: % gave %', v_txt, v_state; end if;
  end loop;
  v_state := null;
  begin
    perform public.admin_save_product(base || jsonb_build_object(
      'sku', 'GEM-' || repeat('X', 56), 'variants', '[{"pack": 100, "ss": 10}]'::jsonb));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G2: over-long option SKU gave %', v_state; end if;
  passed := array_append(passed, 'G2 bad pack, size, price, duplicate or over-long SKU refused');

  -- G3: no `variants` key leaves the options alone ---------------------------
  perform public.admin_save_product(base || jsonb_build_object('price', '13.00'));
  select count(*) into v_cnt from public.product_variants where product_id = p_gem and is_active;
  if v_cnt <> 4 then raise exception 'FAIL G3: options changed without a variants key (%)', v_cnt; end if;
  passed := array_append(passed, 'G3 a save without options keeps them');

  -- G4: removed options disappear; re-added ones reuse their row -------------
  select id into v_id from public.product_variants where product_id = p_gem and attributes = '{"pack": 20, "ss": 6}'::jsonb;
  perform public.admin_save_product(base || jsonb_build_object('variants', jsonb_build_array(
    jsonb_build_object('pack', 20, 'ss', 6, 'quantity_on_hand', 41),
    jsonb_build_object('pack', 50, 'ss', 6, 'price', '25.00'))));
  select count(*) into v_cnt from public.product_variants where product_id = p_gem;
  if v_cnt <> 2 then raise exception 'FAIL G4: % variants left', v_cnt; end if;
  if not exists (select 1 from public.product_variants where id = v_id) then
    raise exception 'FAIL G4: kept option got a new row';
  end if;
  if (select quantity_on_hand from public.inventory_items where variant_id = v_id) <> 41 then
    raise exception 'FAIL G4: stock of kept option not updated';
  end if;
  passed := array_append(passed, 'G4 unticked options deleted, kept ones updated in place');

  -- G5: an ordered option is deactivated, never deleted ----------------------
  select id into v_id from public.product_variants where product_id = p_gem and attributes = '{"pack": 50, "ss": 6}'::jsonb;
  execute 'reset role';
  -- Minimal order line pointing at the option (the FK is what matters).
  insert into public.orders (id, customer_email, billing_address, currency, subtotal_amount, total_amount)
  values ('00000000-0000-4000-a000-0000001100f1', 'order11.test@example.invalid',
          '{"first_name": "Test", "last_name": "Order", "address_line1": "1 rue Test", "city": "Paris", "country_code": "FR"}',
          'EUR', 25.00, 25.00);
  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, unit_price, quantity)
  values ('00000000-0000-4000-a000-0000001100f1', p_gem, v_id, 'Strass test', 'Pack de 50 · SS6', 'GEM-SS-TEST-P50-SS6', 25.00, 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_product(base || jsonb_build_object('variants', '[{"pack": 20, "ss": 6}]'::jsonb));
  if (select is_active from public.product_variants where id = v_id) is distinct from false then
    raise exception 'FAIL G5: ordered option not kept inactive';
  end if;
  -- Re-adding it brings the same row back.
  perform public.admin_save_product(base || jsonb_build_object('variants', '[{"pack": 20, "ss": 6}, {"pack": 50, "ss": 6}]'::jsonb));
  if (select is_active from public.product_variants where id = v_id) is distinct from true then
    raise exception 'FAIL G5: re-added option not reactivated';
  end if;
  passed := array_append(passed, 'G5 ordered options deactivated, then reactivated on re-add');

  -- G6: switching options off gives the product its own stock again ----------
  perform public.admin_save_product(base || jsonb_build_object('variants', '[]'::jsonb));
  if exists (select 1 from public.product_variants where product_id = p_gem and is_active) then
    raise exception 'FAIL G6: active options remain';
  end if;
  if (select quantity_on_hand from public.inventory_items where product_id = p_gem) is distinct from 7 then
    raise exception 'FAIL G6: product-level stock not restored';
  end if;
  passed := array_append(passed, 'G6 options off → product-level stock applies');

  -- G7: products with other kinds of variants are protected ------------------
  v_state := null;
  begin
    perform public.admin_save_product(jsonb_build_object(
      'id', p_star, 'category_id', c_gems, 'sku', 'GEM-STAR-001', 'name', 'Étoile Cristal', 'price', '32.00',
      'status', 'active', 'variants', '[{"pack": 20}]'::jsonb,
      'media', coalesce((select jsonb_agg(jsonb_build_object('id', id) order by position)
                           from public.product_media where product_id = p_star), '[]'::jsonb)));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G7: colour variants overwritten (%)', v_state; end if;
  execute 'reset role';
  if (select count(*) from public.product_variants where product_id = p_star) <> 3 then
    raise exception 'FAIL G7: colour variants changed';
  end if;
  passed := array_append(passed, 'G7 colour variants cannot be replaced by pack/SS options');

  perform set_config('request.jwt.claims', '', true);
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 11 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
