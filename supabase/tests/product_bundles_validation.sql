-- =============================================================================
-- Product bundles validation suite (migration 20261028221344_product_bundles)
-- =============================================================================
-- Proves, as the roles that really call it (decision 117):
--
--   K1  a visitor, a customer and a `viewer` cannot set a composition (42501);
--   K2  a manager makes a product a kit: its stock becomes what the components
--       can make; invalid compositions are refused (itself, a kit in a kit, a
--       product with options but no option chosen, a duplicate, a bad quantity);
--   K3  a sale of a single component lowers the kit;
--   K4  the kit's stock cannot be written (direct update, quick restock);
--   K5  create_order() reserves a kit line's components (with a single line of
--       one of them in the same order), snapshots the composition, and refuses
--       a kit the components cannot make (P0001); the snapshot is readable by
--       the order's owner only (and staff);
--   K6  payment sells the SNAPSHOT's units even after the composition changed;
--   K7  a refund with restock returns the snapshot's units;
--   K8  an expired / cancelled order releases the components;
--   K9  a kit has no options; a product held whole by a kit cannot gain one;
--       a kit can hold one option of a product (2 × the red one);
--   K10 a product whose own units are held by unpaid orders cannot become a kit;
--   K11 [] turns a kit back into an ordinary product at 0 units, restockable;
--   K12 the public reads the contents of an active kit, not of a draft one.
--
-- The kit refresh is a DEFERRED trigger (it runs at commit); this suite, which
-- never commits, makes it immediate.
-- ONE transaction, ALWAYS rolled back by raising `ALL PRODUCT BUNDLE TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

set constraints public.inventory_items_refresh_bundles immediate;

do $$
declare
  cust    uuid := '00000000-0000-4000-a000-000000470001';
  other   uuid := '00000000-0000-4000-a000-000000470002';
  viewer  uuid := '00000000-0000-4000-a000-000000470003';
  mgr     uuid := '00000000-0000-4000-a000-000000470004';
  addr    jsonb := '{"first_name":"Test","last_name":"Kit","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  v_rate  uuid;
  g1 uuid; g2 uuid; g3 uuid; kit uuid; opt uuid; v_red uuid; kit2 uuid; held uuid;
  o1 public.orders; o2 public.orders;
  kit_line uuid;
  r      jsonb;
  v_ref  public.refunds;
  v_cnt  int;
  v_ok   boolean;
  passed text[] := '{}';

  function_stock int;
begin
  select r.id into v_rate
    from public.shipping_rates r
    join public.shipping_zones z on z.id = r.zone_id and z.is_active
   where r.is_active and r.currency = 'EUR'
     and z.id = public.shipping_zone_for_country('FR')
     and r.min_order_amount is null and r.max_order_amount is null
     and r.min_weight_grams is null and r.max_weight_grams is null
   order by r.price limit 1;
  if v_rate is null then raise exception 'FAIL setup: no open shipping rate for FR'; end if;

  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Gloss A', 'kit-test-gloss-a', 9, 'EUR', 'active', 'physical') returning id into g1;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Gloss B', 'kit-test-gloss-b', 9, 'EUR', 'active', 'physical') returning id into g2;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Gloss C', 'kit-test-gloss-c', 9, 'EUR', 'draft', 'physical') returning id into g3;   -- sold only in the kit
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Trio', 'kit-test-trio', 25, 'EUR', 'active', 'physical') returning id into kit;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Gems options', 'kit-test-options', 5, 'EUR', 'active', 'physical') returning id into opt;
  insert into public.product_variants (product_id, name) values (opt, 'Rouge') returning id into v_red;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Kit rouge', 'kit-test-red', 15, 'EUR', 'draft', 'physical') returning id into kit2;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Réservé', 'kit-test-held', 15, 'EUR', 'active', 'physical') returning id into held;
  insert into public.inventory_items (product_id, quantity_on_hand) values
    (g1, 10), (g2, 8), (g3, 10), (kit, 10), (kit2, 0), (held, 5);
  insert into public.inventory_items (variant_id, quantity_on_hand) values (v_red, 7);

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (cust,   'authenticated', 'authenticated', 'kit-customer.test@example.invalid', now(), now()),
    (other,  'authenticated', 'authenticated', 'kit-other.test@example.invalid', now(), now()),
    (viewer, 'authenticated', 'authenticated', 'kit-viewer.test@example.invalid', now(), now()),
    (mgr,    'authenticated', 'authenticated', 'kit-manager.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer'  where id = viewer;
  update public.profiles set role = 'manager' where id = mgr;

  -- K1: visitor, customer and viewer are refused ------------------------------------
  foreach v_cnt in array array[1, 2, 3] loop
    perform set_config('role', case v_cnt when 1 then 'anon' else 'authenticated' end, true);
    perform set_config('request.jwt.claims',
      case v_cnt when 1 then '{"role":"anon"}'
                 when 2 then json_build_object('sub', cust, 'role', 'authenticated')::text
                 else json_build_object('sub', viewer, 'role', 'authenticated')::text end, true);
    v_ok := false;
    begin
      perform public.admin_save_product_bundle(kit, jsonb_build_array(jsonb_build_object('product_id', g1, 'quantity', 1)));
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'FAIL K1: caller % set a composition', v_cnt; end if;
  end loop;
  execute 'reset role';
  if private.is_bundle(kit) then raise exception 'FAIL K1: a refused call left a composition'; end if;
  passed := passed || 'K1'::text;

  -- K2: a manager makes the trio a kit; invalid compositions refused --------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.admin_save_product_bundle(kit, jsonb_build_array(
         jsonb_build_object('product_id', g1, 'quantity', 1),
         jsonb_build_object('product_id', g2, 'quantity', 1),
         jsonb_build_object('product_id', g3, 'quantity', 1)));
  if (r ->> 'components')::int <> 3 or (r ->> 'quantity_on_hand')::int <> 8 then
    raise exception 'FAIL K2: kit saved as %', r;
  end if;
  foreach v_cnt in array array[1, 2, 3, 4, 5] loop
    v_ok := false;
    begin
      perform public.admin_save_product_bundle(kit2, case v_cnt
        when 1 then jsonb_build_array(jsonb_build_object('product_id', kit2, 'quantity', 1))
        when 2 then jsonb_build_array(jsonb_build_object('product_id', kit, 'quantity', 1))
        when 3 then jsonb_build_array(jsonb_build_object('product_id', opt, 'quantity', 1))
        when 4 then jsonb_build_array(jsonb_build_object('product_id', g1, 'quantity', 1),
                                      jsonb_build_object('product_id', g1, 'quantity', 2))
        else        jsonb_build_array(jsonb_build_object('product_id', g1, 'quantity', 0)) end);
    exception when invalid_parameter_value then v_ok := true;
    end;
    if not v_ok then raise exception 'FAIL K2: invalid composition % accepted', v_cnt; end if;
  end loop;
  -- A kit's components cannot become a kit themselves.
  v_ok := false;
  begin
    perform public.admin_save_product_bundle(g1, jsonb_build_array(jsonb_build_object('product_id', held, 'quantity', 1)));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K2: a component became a kit'; end if;
  execute 'reset role';
  -- The kit's own count left no ledger movement.
  select count(*) into v_cnt from public.inventory_movements m join public.inventory_items i on i.id = m.inventory_item_id
   where i.product_id = kit and m.movement_type <> 'initial';
  if v_cnt <> 0 then raise exception 'FAIL K2: % ledger rows on the kit', v_cnt; end if;
  passed := passed || 'K2'::text;

  -- K3: five units of gloss B sold alone take five kits away ------------------------------
  update public.inventory_items set quantity_on_hand = quantity_on_hand - 5 where product_id = g2;
  select quantity_on_hand into function_stock from public.inventory_items where product_id = kit;
  if function_stock <> 3 then raise exception 'FAIL K3: kit at % instead of 3', function_stock; end if;
  passed := passed || 'K3'::text;

  -- K4: the kit's stock is not writable --------------------------------------------------
  v_ok := false;
  begin
    update public.inventory_items set quantity_on_hand = 50 where product_id = kit;
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K4: the kit row was written'; end if;
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin
    perform public.admin_adjust_stock(kit, null, 5);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K4: quick restock of a kit'; end if;
  -- The threshold stays the team's.
  update public.inventory_items set low_stock_threshold = 2 where product_id = kit;
  execute 'reset role';
  passed := passed || 'K4'::text;

  -- K5: an order of 2 kits + 1 gloss A reserves the components -----------------------
  o1 := public.create_order(cust, 'kit-customer.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', kit, 'quantity', 2),
                            jsonb_build_object('product_id', g1, 'quantity', 1)),
          addr, addr, v_rate);
  if o1.stock_state <> 'reserved' then raise exception 'FAIL K5: order stock state %', o1.stock_state; end if;
  if (select quantity_reserved from public.inventory_items where product_id = g1) <> 3
     or (select quantity_reserved from public.inventory_items where product_id = g2) <> 2
     or (select quantity_reserved from public.inventory_items where product_id = g3) <> 2
     or (select quantity_reserved from public.inventory_items where product_id = kit) <> 0 then
    raise exception 'FAIL K5: reservations not on the components';
  end if;
  -- B: 8 − 5 sold − 2 reserved = 1 → one kit left.
  if (select quantity_on_hand from public.inventory_items where product_id = kit) <> 1 then
    raise exception 'FAIL K5: kit not lowered by the reservation';
  end if;
  select id into kit_line from public.order_items where order_id = o1.id and product_id = kit;
  select count(*) into v_cnt from public.order_item_components where order_item_id = kit_line;
  if v_cnt <> 3 then raise exception 'FAIL K5: % components snapshotted', v_cnt; end if;
  v_ok := false;
  begin
    perform public.create_order(null, 'kit-guest.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', kit, 'quantity', 2)), addr, addr, v_rate);
  exception when raise_exception then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K5: a kit was oversold'; end if;
  -- The snapshot is the owner's (and staff's) to read.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_item_components where order_item_id = kit_line;
  if v_cnt <> 0 then raise exception 'FAIL K5: another customer read the snapshot'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_item_components where order_item_id = kit_line;
  if v_cnt <> 3 then raise exception 'FAIL K5: the owner reads % components', v_cnt; end if;
  execute 'reset role';
  passed := passed || 'K5'::text;

  -- K6: the composition changes, then the order is paid: the snapshot is sold ---------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_save_product_bundle(kit, jsonb_build_array(jsonb_build_object('product_id', g1, 'quantity', 2)));
  execute 'reset role';
  o1 := public.mark_order_paid(o1.id, o1.amount_due, 'EUR', 'cs_test_kit_1', 'pi_test_kit_1');
  if o1.stock_state <> 'committed' then raise exception 'FAIL K6: stock state %', o1.stock_state; end if;
  if (select (quantity_on_hand, quantity_reserved) from public.inventory_items where product_id = g1) <> (7, 0)
     or (select (quantity_on_hand, quantity_reserved) from public.inventory_items where product_id = g2) <> (1, 0)
     or (select (quantity_on_hand, quantity_reserved) from public.inventory_items where product_id = g3) <> (8, 0) then
    raise exception 'FAIL K6: the sale did not follow the snapshot';
  end if;
  -- Now 2 × gloss A per kit: 7 / 2 = 3.
  if (select quantity_on_hand from public.inventory_items where product_id = kit) <> 3 then
    raise exception 'FAIL K6: kit not recomputed on the new composition';
  end if;
  select count(*) into v_cnt from public.inventory_movements
   where order_id = o1.id and movement_type = 'sale';
  if v_cnt <> 3 then raise exception 'FAIL K6: % sale movements', v_cnt; end if;
  passed := passed || 'K6'::text;

  -- K7: one kit refunded with restock: its three glosses come back -----------------------
  v_ref := public.request_refund(o1.id, 25.00, 'return',
             jsonb_build_array(jsonb_build_object('order_item_id', kit_line, 'quantity', 1)), true);
  perform public.mark_refund_succeeded(v_ref.id, 're_test_kit_1');
  if (select quantity_on_hand from public.inventory_items where product_id = g1) <> 8
     or (select quantity_on_hand from public.inventory_items where product_id = g2) <> 2
     or (select quantity_on_hand from public.inventory_items where product_id = g3) <> 9 then
    raise exception 'FAIL K7: restock did not follow the snapshot';
  end if;
  passed := passed || 'K7'::text;

  -- K8: a cancelled unpaid order releases the components ----------------------------------
  o2 := public.create_order(null, 'kit-guest.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', kit, 'quantity', 4)), addr, addr, v_rate);
  if (select quantity_reserved from public.inventory_items where product_id = g1) <> 8
     or (select quantity_on_hand from public.inventory_items where product_id = kit) <> 0 then
    raise exception 'FAIL K8: kit order of 4 did not reserve 8 glosses';
  end if;
  perform public.cancel_order(o2.id, 'test');
  if (select quantity_reserved from public.inventory_items where product_id = g1) <> 0
     or (select quantity_on_hand from public.inventory_items where product_id = kit) <> 4 then
    raise exception 'FAIL K8: the cancellation did not release the components';
  end if;
  passed := passed || 'K8'::text;

  -- K9: options ------------------------------------------------------------------------
  v_ok := false;
  begin
    insert into public.product_variants (product_id, name) values (kit, 'Rose');
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K9: a kit gained an option'; end if;
  v_ok := false;
  begin
    insert into public.product_variants (product_id, name) values (g1, 'Rose');
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K9: a product held whole gained an option'; end if;
  perform set_config('role', 'authenticated', true);
  r := public.admin_save_product_bundle(kit2, jsonb_build_array(
         jsonb_build_object('product_id', opt, 'variant_id', v_red, 'quantity', 2),
         jsonb_build_object('product_id', g2, 'quantity', 1)));
  -- red 7 / 2 = 3, gloss B 2 / 1 = 2.
  if (r ->> 'quantity_on_hand')::int <> 2 then raise exception 'FAIL K9: option kit at %', r; end if;
  execute 'reset role';
  update public.inventory_items set quantity_on_hand = 3 where variant_id = v_red;
  if (select quantity_on_hand from public.inventory_items where product_id = kit2) <> 1 then
    raise exception 'FAIL K9: option kit not lowered by its option';
  end if;
  passed := passed || 'K9'::text;

  -- K10: units held by an unpaid order: cannot become a kit ------------------------------
  update public.inventory_items set quantity_reserved = 1 where product_id = held;
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin
    perform public.admin_save_product_bundle(held, jsonb_build_array(jsonb_build_object('product_id', g3, 'quantity', 1)));
  exception when object_in_use then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K10: reserved product became a kit'; end if;
  passed := passed || 'K10'::text;

  -- K11: back to an ordinary product: 0 units, restockable --------------------------------
  r := public.admin_save_product_bundle(kit2, '[]'::jsonb);
  execute 'reset role';
  if private.is_bundle(kit2) or (select quantity_on_hand from public.inventory_items where product_id = kit2) <> 0 then
    raise exception 'FAIL K11: kit2 still a kit or not at 0';
  end if;
  perform set_config('role', 'authenticated', true);
  r := public.admin_adjust_stock(kit2, null, 6);
  if (r ->> 'quantity_on_hand')::int <> 6 then raise exception 'FAIL K11: restock %', r; end if;
  execute 'reset role';
  passed := passed || 'K11'::text;

  -- K12: the public reads an active kit's contents, not a draft's ------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_save_product_bundle(kit2, jsonb_build_array(jsonb_build_object('product_id', g2, 'quantity', 1)));
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_cnt from public.product_bundle_items where bundle_product_id = kit;
  if v_cnt <> 1 then raise exception 'FAIL K12: anon reads % rows of the active kit', v_cnt; end if;
  select count(*) into v_cnt from public.product_bundle_items where bundle_product_id = kit2;
  if v_cnt <> 0 then raise exception 'FAIL K12: anon reads the draft kit'; end if;
  v_ok := false;
  begin
    insert into public.product_bundle_items (bundle_product_id, component_product_id, quantity) values (kit, g2, 1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL K12: anon wrote a composition'; end if;
  execute 'reset role';
  passed := passed || 'K12'::text;

  raise exception 'ALL PRODUCT BUNDLE TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
