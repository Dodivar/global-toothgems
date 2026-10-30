-- =============================================================================
-- Product options (colour × plug…) validation suite
-- (migration 20261029190000_product_variant_options)
-- =============================================================================
-- Proves, as the roles that really call it:
--
--   * a manager turns a product's plain colour variants into the
--     combinations of two options (Couleur × Prise): the existing variants
--     keep their id, SKU and stock, the new combinations are created; names
--     (fr/en) and colour dots are derived from the values, the sent ones
--     ignored; each variant has one link per axis;
--   * a photo shows an option value; a value of another product, or a
--     variant and a value at once, are refused;
--   * removing a value removes its combinations; `variant_options: []`
--     removes the options and leaves plain variants with their names;
--   * refused: a combination twice, a value of the wrong axis, a missing
--     value, two values with the same name, and `custom_variants` without
--     `variant_options` on a product that has options;
--   * a visitor reads the options, values, English names and links of an
--     active product, none of a draft one; a customer and a `viewer` cannot
--     write the tables nor call the function (42501).
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL PRODUCT VARIANT OPTIONS TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  cust   uuid := '00000000-0000-4000-a000-000000360001';
  viewer uuid := '00000000-0000-4000-a000-000000360002';
  mgr    uuid := '00000000-0000-4000-a000-000000360003';
  cat    uuid;
  p      uuid := gen_random_uuid();
  p_dft  uuid := gen_random_uuid();
  v_ag   uuid := gen_random_uuid();
  v_nr   uuid := gen_random_uuid();
  v_agus uuid := gen_random_uuid();
  v_nrus uuid := gen_random_uuid();
  o_col  uuid := gen_random_uuid();
  o_plug uuid := gen_random_uuid();
  x_ag   uuid := gen_random_uuid();
  x_nr   uuid := gen_random_uuid();
  x_eu   uuid := gen_random_uuid();
  x_us   uuid := gen_random_uuid();
  x_far  uuid := gen_random_uuid();
  o_far  uuid := gen_random_uuid();
  m1     uuid;
  base   jsonb;
  opts   jsonb;
  r      jsonb;
  v_cnt  int;
  v_txt  text;
  v_sku  text;
  v_ok   boolean;
  passed text[] := '{}';
begin
  insert into public.categories (name, slug, is_active, position)
  values ('Options test', 'options-test-cat', true, 99) returning id into cat;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (cust, 'authenticated', 'authenticated', 'opt-customer.test@example.invalid', now(), now()),
         (viewer, 'authenticated', 'authenticated', 'opt-viewer.test@example.invalid', now(), now()),
         (mgr, 'authenticated', 'authenticated', 'opt-manager.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer' where id = viewer;
  update public.profiles set role = 'manager' where id = mgr;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  base := jsonb_build_object(
    'id', p, 'category_id', cat, 'sku', 'OPT-LED-01', 'slug', 'options-test-lamp', 'name', 'Lampe test',
    'price', '89.90', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'Test lamp', 'slug', 'options-test-lamp-en')));

  -- S1: plain colour variants, then the same variants as Couleur × Prise
  r := public.admin_save_product(base || jsonb_build_object(
    'custom_variants', jsonb_build_array(
      jsonb_build_object('id', v_ag, 'name', 'Argent', 'name_en', 'Silver', 'swatch', '#d9d9d9', 'quantity_on_hand', 15),
      jsonb_build_object('id', v_nr, 'name', 'Noir', 'name_en', 'Black', 'swatch', '#0d0d0d', 'quantity_on_hand', 12)),
    'media', jsonb_build_array(jsonb_build_object('storage_path', 'products/opt-test/silver.webp', 'variant_id', v_ag))));
  select sku into v_sku from public.product_variants where id = v_ag;

  opts := jsonb_build_array(
    jsonb_build_object('id', o_col, 'name', 'Couleur', 'name_en', 'Colour', 'values', jsonb_build_array(
      jsonb_build_object('id', x_ag, 'name', 'Argent', 'name_en', 'Silver', 'swatch', '#d9d9d9'),
      jsonb_build_object('id', x_nr, 'name', 'Noir', 'name_en', 'Black', 'swatch', '#0d0d0d'))),
    jsonb_build_object('id', o_plug, 'name', 'Prise', 'name_en', 'Plug', 'values', jsonb_build_array(
      jsonb_build_object('id', x_eu, 'name', 'Prise EU', 'name_en', 'EU plug'),
      jsonb_build_object('id', x_us, 'name', 'Prise US', 'name_en', ''))));
  select id into m1 from public.product_media where product_id = p;
  r := public.admin_save_product(base || jsonb_build_object(
    'variant_options', opts,
    'custom_variants', jsonb_build_array(
      jsonb_build_object('id', v_ag, 'name', 'ignored', 'option_values', jsonb_build_array(x_ag, x_eu), 'quantity_on_hand', 15),
      jsonb_build_object('id', v_agus, 'option_values', jsonb_build_array(x_ag, x_us), 'quantity_on_hand', 4),
      jsonb_build_object('id', v_nr, 'option_values', jsonb_build_array(x_nr, x_eu), 'quantity_on_hand', 12),
      jsonb_build_object('id', v_nrus, 'option_values', jsonb_build_array(upper(x_nr::text), x_us), 'quantity_on_hand', 0)),
    'media', jsonb_build_array(jsonb_build_object('id', m1, 'storage_path', 'products/opt-test/silver.webp',
                                                  'variant_id', null, 'option_value_id', x_ag))));
  if (r ->> 'variant_options')::boolean is not true then raise exception 'FAIL S1: flag %', r; end if;
  select string_agg(v.name || '|' || coalesce(t.name, '-') || '|' || coalesce(v.attributes ->> 'swatch', '-'), ';' order by v.position)
    into v_txt
    from public.product_variants v
    left join public.product_variant_translations t on t.variant_id = v.id and t.locale = 'en'
   where v.product_id = p;
  if v_txt <> 'Argent · Prise EU|Silver · EU plug|#d9d9d9;Argent · Prise US|Silver · Prise US|#d9d9d9;'
             'Noir · Prise EU|Black · EU plug|#0d0d0d;Noir · Prise US|Black · Prise US|#0d0d0d' then
    raise exception 'FAIL S1: derived names %', v_txt;
  end if;
  if (select sku from public.product_variants where id = v_ag) is distinct from v_sku
     or (select quantity_on_hand from public.inventory_items where variant_id = v_ag) <> 15
     or (select quantity_on_hand from public.inventory_items where variant_id = v_agus) <> 4 then
    raise exception 'FAIL S1: kept variant lost its SKU or stock';
  end if;
  if (select sku from public.product_variants where id = v_agus) is distinct from 'OPT-LED-01-ARGENT-PRISE-US' then
    raise exception 'FAIL S1: new SKU %', (select sku from public.product_variants where id = v_agus);
  end if;
  select count(*) into v_cnt from public.product_variant_option_values l
    join public.product_variants v on v.id = l.variant_id where v.product_id = p;
  if v_cnt <> 8 then raise exception 'FAIL S1: % links', v_cnt; end if;
  if (select value_id from public.product_variant_option_values where variant_id = v_nrus and option_id = o_col) <> x_nr then
    raise exception 'FAIL S1: upper-case id not linked';
  end if;
  if (select string_agg(name || '@' || position, ',' order by position) from public.product_options where product_id = p)
     <> 'Couleur@0,Prise@1' then
    raise exception 'FAIL S1: options';
  end if;
  if exists (select 1 from public.product_option_value_translations where value_id = x_us) then
    raise exception 'FAIL S1: empty English value name stored';
  end if;
  if (select option_value_id from public.product_media where id = m1) <> x_ag
     or (select variant_id from public.product_media where id = m1) is not null then
    raise exception 'FAIL S1: photo not moved to the value';
  end if;
  passed := passed || 'S1'::text;

  -- S2: refused inputs
  insert into public.products (id, name, slug, price, currency, status, product_type, category_id)
  values (gen_random_uuid(), 'Far', 'options-test-far', 1, 'EUR', 'active', 'physical', cat);
  insert into public.product_options (id, product_id, name)
  values (o_far, (select id from public.products where slug = 'options-test-far'), 'Taille');
  insert into public.product_option_values (id, option_id, name) values (x_far, o_far, 'M');

  -- a combination twice
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('variant_options', opts,
      'custom_variants', jsonb_build_array(
        jsonb_build_object('id', v_ag, 'option_values', jsonb_build_array(x_ag, x_eu)),
        jsonb_build_object('id', v_nr, 'option_values', jsonb_build_array(x_ag, x_eu)))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: duplicate combination accepted'; end if;
  -- values in the wrong axis order
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('variant_options', opts,
      'custom_variants', jsonb_build_array(jsonb_build_object('id', v_ag, 'option_values', jsonb_build_array(x_eu, x_ag)))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: wrong axis accepted'; end if;
  -- a value missing
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('variant_options', opts,
      'custom_variants', jsonb_build_array(jsonb_build_object('id', v_ag, 'option_values', jsonb_build_array(x_ag)))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: missing value accepted'; end if;
  -- two values with the same name
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object(
      'variant_options', jsonb_build_array(jsonb_build_object('id', o_col, 'name', 'Couleur', 'values', jsonb_build_array(
        jsonb_build_object('id', x_ag, 'name', 'Argent'), jsonb_build_object('id', x_nr, 'name', ' argent')))),
      'custom_variants', '[]'::jsonb));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: duplicate value name accepted'; end if;
  -- an option of another product
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object(
      'variant_options', jsonb_build_array(jsonb_build_object('id', o_far, 'name', 'Taille', 'values', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'name', 'S')))),
      'custom_variants', '[]'::jsonb));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: option of another product accepted'; end if;
  -- custom_variants without variant_options, on a product that has options
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('custom_variants', jsonb_build_array(
      jsonb_build_object('id', v_ag, 'name', 'Argent'))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: old payload accepted on a product with options'; end if;
  -- a photo of another product's value, or of a variant and a value at once
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('media', jsonb_build_array(
      jsonb_build_object('id', m1, 'storage_path', 'products/opt-test/silver.webp', 'option_value_id', x_far))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: value of another product accepted on a photo'; end if;
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('media', jsonb_build_array(
      jsonb_build_object('id', m1, 'storage_path', 'products/opt-test/silver.webp', 'variant_id', v_ag, 'option_value_id', x_ag))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: variant and value on one photo accepted'; end if;
  -- the old payload without custom_variants still saves the product, untouched options
  perform public.admin_save_product(base || jsonb_build_object('media', jsonb_build_array(
    jsonb_build_object('id', m1, 'storage_path', 'products/opt-test/silver.webp'))));
  if (select count(*) from public.product_options where product_id = p) <> 2
     or (select option_value_id from public.product_media where id = m1) <> x_ag then
    raise exception 'FAIL S2: a save without variants changed the options';
  end if;
  passed := passed || 'S2'::text;

  -- S3: a visitor reads an active product's options, nothing of a draft one
  insert into public.products (id, name, slug, price, currency, status, product_type, category_id)
  values (p_dft, 'Draft', 'options-test-draft', 1, 'EUR', 'draft', 'physical', cat);
  insert into public.product_options (id, product_id, name) values (gen_random_uuid(), p_dft, 'Secret');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if (select count(*) from public.product_options where product_id = p) <> 2
     or (select count(*) from public.product_option_values where option_id in (o_col, o_plug)) <> 4
     or (select count(*) from public.product_option_translations where option_id in (o_col, o_plug)) <> 2
     or (select count(*) from public.product_option_value_translations where value_id in (x_ag, x_nr, x_eu, x_us)) <> 3
     or (select count(*) from public.product_variant_option_values where variant_id in (v_ag, v_agus, v_nr, v_nrus)) <> 8 then
    raise exception 'FAIL S3: a visitor misses options of an active product';
  end if;
  if exists (select 1 from public.product_options where product_id = p_dft) then
    raise exception 'FAIL S3: a visitor reads a draft product''s options';
  end if;
  v_ok := false;
  begin
    insert into public.product_options (product_id, name) values (p, 'X');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S3: a visitor inserted an option'; end if;
  passed := passed || 'S3'::text;

  -- S4: a customer and a viewer cannot write
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    insert into public.product_option_values (option_id, name) values (o_col, 'Or');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S4: a customer inserted a value'; end if;
  update public.product_options set name = 'Hacked' where id = o_col;
  delete from public.product_variant_option_values where variant_id = v_ag;
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.admin_save_product(base || jsonb_build_object('variant_options', '[]'::jsonb, 'custom_variants', '[]'::jsonb));
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S4: a viewer saved a product'; end if;
  update public.product_option_values set name = 'Hacked' where id = x_ag;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  if (select name from public.product_options where id = o_col) <> 'Couleur'
     or (select name from public.product_option_values where id = x_ag) <> 'Argent'
     or (select count(*) from public.product_variant_option_values where variant_id = v_ag) <> 2 then
    raise exception 'FAIL S4: a customer or a viewer changed the options';
  end if;
  passed := passed || 'S4'::text;

  -- S5: removing a value removes its combinations; [] removes the options
  perform public.admin_save_product(base || jsonb_build_object(
    'variant_options', jsonb_set(opts, '{1,values}', jsonb_build_array(opts -> 1 -> 'values' -> 0)),
    'custom_variants', jsonb_build_array(
      jsonb_build_object('id', v_ag, 'option_values', jsonb_build_array(x_ag, x_eu)),
      jsonb_build_object('id', v_nr, 'option_values', jsonb_build_array(x_nr, x_eu)))));
  if exists (select 1 from public.product_variants where id in (v_agus, v_nrus))
     or exists (select 1 from public.product_option_values where id = x_us) then
    raise exception 'FAIL S5: removed value kept';
  end if;
  perform public.admin_save_product(base || jsonb_build_object(
    'variant_options', '[]'::jsonb,
    'custom_variants', jsonb_build_array(
      jsonb_build_object('id', v_ag, 'name', 'Argent · Prise EU', 'name_en', 'Silver · EU plug', 'swatch', '#d9d9d9'),
      jsonb_build_object('id', v_nr, 'name', 'Noir · Prise EU', 'name_en', 'Black · EU plug'))));
  if exists (select 1 from public.product_options where product_id = p)
     or exists (select 1 from public.product_variant_option_values where variant_id in (v_ag, v_nr))
     or (select option_value_id from public.product_media where id = m1) is not null
     or (select name from public.product_variants where id = v_nr) <> 'Noir · Prise EU' then
    raise exception 'FAIL S5: options not removed cleanly';
  end if;
  passed := passed || 'S5'::text;

  raise exception 'ALL PRODUCT VARIANT OPTIONS TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
