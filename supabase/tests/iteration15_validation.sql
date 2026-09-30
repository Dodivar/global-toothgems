-- =============================================================================
-- Iteration 15 validation suite — variants of any kind (colours, boxes…) and
-- their photos in admin_save_product() (migration `…_product_custom_variants`).
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 15 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr     uuid := '00000000-0000-4000-a000-000000140002';
  p_mir   uuid := '00000000-0000-4000-a000-0000001400a1';
  p_gem   uuid := '00000000-0000-4000-a000-0000001400a2';
  v_blue  uuid := '00000000-0000-4000-a000-0000001400b1';
  v_pink  uuid := '00000000-0000-4000-a000-0000001400b2';
  v_green uuid := '00000000-0000-4000-a000-0000001400b3';
  c_tools uuid; c_gems uuid;
  base jsonb; media jsonb; res jsonb; v_state text; v_txt text; v_cnt int; m_blue uuid; m_pink uuid;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'mgr14.test@example.invalid', '{"first_name":"Mia"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  select id into c_tools from public.categories where slug = 'materiel';
  select id into c_gems from public.categories where slug = 'gems';

  base := jsonb_build_object(
    'id', p_mir, 'category_id', c_tools, 'sku', 'TOO-MIR-TEST', 'slug', 'miroir-test',
    'name', 'Miroir test', 'price', '12.95', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'Test mirror', 'slug', 'test-mirror')),
    'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 9, 'low_stock_threshold', 2),
    'media', jsonb_build_array(
      jsonb_build_object('storage_path', 'products/test14/blue.webp', 'alt_fr', 'Bleu'),
      jsonb_build_object('storage_path', 'products/test14/pink.webp', 'alt_fr', 'Rose')));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  -- V1: variants saved with names, swatch, price, stock, derived SKU ----------
  perform public.admin_save_product(base);
  select id into m_blue from public.product_media where product_id = p_mir and storage_path = 'products/test14/blue.webp';
  select id into m_pink from public.product_media where product_id = p_mir and storage_path = 'products/test14/pink.webp';
  media := jsonb_build_array(
    jsonb_build_object('id', m_blue, 'alt_fr', 'Bleu', 'variant_id', v_blue),
    jsonb_build_object('id', m_pink, 'alt_fr', 'Rose', 'variant_id', v_pink));

  res := public.admin_save_product(base || jsonb_build_object('media', media, 'custom_variants', jsonb_build_array(
    jsonb_build_object('id', v_blue, 'name', 'Bleu pâle', 'name_en', 'Pale blue', 'swatch', '#bcd0e0',
                       'price', null, 'quantity_on_hand', 20, 'low_stock_threshold', 3),
    jsonb_build_object('id', v_pink, 'name', 'Rose', 'name_en', '', 'swatch', null,
                       'price', '14.50', 'quantity_on_hand', 4, 'low_stock_threshold', 5))));
  if res -> 'custom_variants' <> jsonb_build_array(v_blue, v_pink) then
    raise exception 'FAIL V1: ids not returned in order: %', res;
  end if;
  select name || '|' || sku || '|' || attributes::text || '|' || coalesce(price::text, 'null') || '|' || position
    into v_txt from public.product_variants where id = v_blue;
  if v_txt is distinct from 'Bleu pâle|TOO-MIR-TEST-BLEU-PALE|{"swatch": "#bcd0e0"}|null|0' then
    raise exception 'FAIL V1: blue variant %', v_txt;
  end if;
  select name || '|' || sku || '|' || attributes::text || '|' || price::text into v_txt from public.product_variants where id = v_pink;
  if v_txt is distinct from 'Rose|TOO-MIR-TEST-ROSE|{}|14.50' then raise exception 'FAIL V1: pink variant %', v_txt; end if;
  if (select name from public.product_variant_translations where variant_id = v_blue and locale = 'en') is distinct from 'Pale blue'
     or exists (select 1 from public.product_variant_translations where variant_id = v_pink) then
    raise exception 'FAIL V1: English names';
  end if;
  if (select quantity_on_hand || '/' || low_stock_threshold from public.inventory_items where variant_id = v_pink) <> '4/5' then
    raise exception 'FAIL V1: variant stock';
  end if;
  if (select variant_id from public.product_media where id = m_blue) is distinct from v_blue
     or (select variant_id from public.product_media where id = m_pink) is distinct from v_pink then
    raise exception 'FAIL V1: photo links';
  end if;
  passed := array_append(passed, 'V1 variants saved with names, swatch, price, stock, SKU and photos');

  -- V2: a save without the keys leaves variants and photo links alone --------
  perform public.admin_save_product(base || jsonb_build_object('media', jsonb_build_array(
    jsonb_build_object('id', m_blue, 'alt_fr', 'Bleu'), jsonb_build_object('id', m_pink, 'alt_fr', 'Rose'))));
  if (select count(*) from public.product_variants where product_id = p_mir and is_active) <> 2
     or (select variant_id from public.product_media where id = m_blue) is distinct from v_blue then
    raise exception 'FAIL V2: variants or links changed';
  end if;
  passed := array_append(passed, 'V2 a save without the keys keeps variants and photo links');

  -- V3: rename swap, reorder, swatch removal; SKU kept; attributes merged -----
  execute 'reset role';
  update public.product_variants set attributes = attributes || '{"quantity": 50}' where id = v_pink;
  perform set_config('role', 'authenticated', true);
  perform public.admin_save_product(base || jsonb_build_object('media', media, 'custom_variants', jsonb_build_array(
    jsonb_build_object('id', v_pink, 'name', 'Bleu pâle', 'swatch', '#f2c4d2', 'quantity_on_hand', 4),
    jsonb_build_object('id', v_blue, 'name', 'Rose', 'name_en', 'Pink', 'swatch', null, 'quantity_on_hand', 20))));
  select string_agg(name || ':' || sku || ':' || attributes::text, ',' order by position) into v_txt
    from public.product_variants where product_id = p_mir;
  if v_txt is distinct from
     'Bleu pâle:TOO-MIR-TEST-ROSE:{"swatch": "#f2c4d2", "quantity": 50},Rose:TOO-MIR-TEST-BLEU-PALE:{}' then
    raise exception 'FAIL V3: %', v_txt;
  end if;
  passed := array_append(passed, 'V3 names swapped in one save, SKUs kept, other attributes preserved');

  -- V4: bad input refused ------------------------------------------------------
  foreach v_txt in array array[
    '[{"name": "Sans id"}]',
    '[{"id": "00000000-0000-4000-a000-0000001400b1", "name": ""}]',
    '[{"id": "00000000-0000-4000-a000-0000001400b1", "name": "X", "swatch": "#BCD0E0"}]',
    '[{"id": "00000000-0000-4000-a000-0000001400b1", "name": "X", "price": "1.999"}]',
    '[{"id": "00000000-0000-4000-a000-0000001400b1", "name": "X"}, {"id": "00000000-0000-4000-a000-0000001400b1", "name": "Y"}]'
  ] loop
    v_state := null;
    begin
      perform public.admin_save_product(base || jsonb_build_object('custom_variants', v_txt::jsonb));
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL V4: % accepted (%)', v_txt, v_state; end if;
  end loop;
  -- Both editors at once, and a photo pointing at another product's variant.
  v_state := null;
  begin
    perform public.admin_save_product(base || '{"variants": [], "custom_variants": []}'::jsonb);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL V4: both keys accepted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.admin_save_product(base || jsonb_build_object('media', jsonb_build_array(
      jsonb_build_object('id', m_blue, 'variant_id', (select id from public.product_variants where product_id <> p_mir limit 1)))));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL V4: foreign variant photo accepted (%)', v_state; end if;
  passed := array_append(passed, 'V4 missing id, empty name, bad swatch or price, duplicates, both editors, foreign photo refused');

  -- V5: pack/SS products are not taken over; their variants cannot be claimed -
  perform public.admin_save_product(jsonb_build_object(
    'id', p_gem, 'category_id', c_gems, 'sku', 'GEM-SS-T14', 'slug', 'strass-t14', 'name', 'Strass t14',
    'price', '10.00', 'status', 'active', 'media', '[]'::jsonb, 'variants', '[{"pack": 20, "ss": 6}]'::jsonb));
  v_state := null;
  begin
    perform public.admin_save_product(jsonb_build_object(
      'id', p_gem, 'category_id', c_gems, 'sku', 'GEM-SS-T14', 'name', 'Strass t14', 'price', '10.00',
      'status', 'active', 'media', '[]'::jsonb,
      'custom_variants', '[{"id": "00000000-0000-4000-a000-0000001400c1", "name": "Rouge"}]'::jsonb));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL V5: pack/SS product taken over (%)', v_state; end if;
  v_state := null;
  begin
    perform public.admin_save_product(base || jsonb_build_object('custom_variants', jsonb_build_array(
      jsonb_build_object('id', (select id from public.product_variants where product_id = p_gem limit 1), 'name', 'Volé'))));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL V5: another product''s variant claimed (%)', v_state; end if;
  passed := array_append(passed, 'V5 pack/SS options and other products'' variants protected');

  -- V6: removal — ordered variant deactivated, its name reusable; others deleted
  execute 'reset role';
  insert into public.orders (id, customer_email, billing_address, currency, subtotal_amount, total_amount)
  values ('00000000-0000-4000-a000-0000001400f1', 'order14.test@example.invalid',
          '{"first_name": "Test", "last_name": "Order", "address_line1": "1 rue Test", "city": "Paris", "country_code": "FR"}',
          'EUR', 12.95, 12.95);
  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, unit_price, quantity)
  values ('00000000-0000-4000-a000-0000001400f1', p_mir, v_blue, 'Miroir test', 'Rose', 'TOO-MIR-TEST-BLEU-PALE', 12.95, 1);
  perform set_config('role', 'authenticated', true);
  perform public.admin_save_product(base || jsonb_build_object(
    'media', jsonb_build_array(jsonb_build_object('id', m_blue, 'variant_id', v_green), jsonb_build_object('id', m_pink, 'variant_id', null)),
    'custom_variants', jsonb_build_array(
      jsonb_build_object('id', v_green, 'name', 'Rose', 'swatch', '#f2c4d2', 'quantity_on_hand', 7))));
  execute 'reset role';
  if (select is_active from public.product_variants where id = v_blue) is distinct from false then
    raise exception 'FAIL V6: ordered variant not kept inactive';
  end if;
  if exists (select 1 from public.product_variants where id = v_pink) then
    raise exception 'FAIL V6: unordered variant not deleted';
  end if;
  if (select name || '|' || sku from public.product_variants where id = v_green) is distinct from 'Rose|TOO-MIR-TEST-ROSE' then
    raise exception 'FAIL V6: new variant %', (select name || '|' || sku from public.product_variants where id = v_green);
  end if;
  if (select variant_id from public.product_media where id = m_blue) is distinct from v_green
     or (select variant_id from public.product_media where id = m_pink) is not null then
    raise exception 'FAIL V6: photo links';
  end if;
  passed := array_append(passed, 'V6 ordered variant deactivated (name freed), others deleted, new SKU unique');

  -- V7: an empty list gives the product its own stock again -----------------
  perform set_config('role', 'authenticated', true);
  perform public.admin_save_product(base || jsonb_build_object(
    'media', jsonb_build_array(jsonb_build_object('id', m_blue, 'variant_id', null), jsonb_build_object('id', m_pink)),
    'custom_variants', '[]'::jsonb));
  execute 'reset role';
  select count(*) into v_cnt from public.product_variants where product_id = p_mir and is_active;
  if v_cnt <> 0 then raise exception 'FAIL V7: % active variants remain', v_cnt; end if;
  if (select quantity_on_hand from public.inventory_items where product_id = p_mir) is distinct from 9 then
    raise exception 'FAIL V7: product-level stock not applied';
  end if;
  passed := array_append(passed, 'V7 no variants left → product-level stock applies');

  perform set_config('request.jwt.claims', '', true);
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 15 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
