-- =============================================================================
-- Quick stock change validation suite (migration 20261014175219_admin_adjust_stock)
-- =============================================================================
-- Proves, as the roles that really call it:
--
--   * a visitor, a customer and a `viewer` are refused (42501);
--   * a manager adds units to a product and to one variant; the change is
--     relative, so a sale recorded meanwhile is kept;
--   * the ledger records an 'adjustment' with the manager as actor;
--   * a correction carrying the count the manager saw is refused (40001) when
--     the shelf moved since, and applied when it did not;
--   * the count cannot drop below the reserved units, nor become negative;
--   * a product with variants, an untracked row, a variant of another product,
--     an unknown product and a zero change are refused.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STOCK ADJUSTMENT TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  cust   uuid := '00000000-0000-4000-a000-000000340001';
  viewer uuid := '00000000-0000-4000-a000-000000340002';
  mgr    uuid := '00000000-0000-4000-a000-000000340003';
  p_one  uuid;
  p_var  uuid;
  p_free uuid;
  v_red  uuid;
  r      jsonb;
  v_cnt  int;
  v_ok   boolean;
  passed text[] := '{}';
begin
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Stock simple', 'sa-test-simple', 10, 'EUR', 'active', 'physical') returning id into p_one;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_one, 3);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Stock options', 'sa-test-options', 10, 'EUR', 'active', 'physical') returning id into p_var;
  insert into public.product_variants (product_id, name) values (p_var, 'Rouge') returning id into v_red;
  insert into public.inventory_items (variant_id, quantity_on_hand) values (v_red, 0);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Sur commande', 'sa-test-untracked', 10, 'EUR', 'active', 'physical') returning id into p_free;
  insert into public.inventory_items (product_id, track_inventory, quantity_on_hand) values (p_free, false, 0);
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (cust, 'authenticated', 'authenticated', 'sa-customer.test@example.invalid', now(), now()),
         (viewer, 'authenticated', 'authenticated', 'sa-viewer.test@example.invalid', now(), now()),
         (mgr, 'authenticated', 'authenticated', 'sa-manager.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer' where id = viewer;
  update public.profiles set role = 'manager' where id = mgr;

  -- S1: visitor, customer and viewer are refused
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, null, 10);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: a visitor changed the stock'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, null, 10);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: a customer changed the stock'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, null, 10);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: a viewer changed the stock'; end if;
  passed := passed || 'S1'::text;

  -- S2: a manager adds units; a sale in between is kept
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  execute 'reset role';
  update public.inventory_items set quantity_on_hand = 2 where product_id = p_one;  -- a sale
  perform set_config('role', 'authenticated', true);
  r := public.admin_adjust_stock(p_one, null, 10);
  if (r ->> 'quantity_on_hand')::int <> 12 then raise exception 'FAIL S2: product count %', r; end if;
  r := public.admin_adjust_stock(p_var, v_red, 5);
  if (r ->> 'quantity_on_hand')::int <> 5 or r ->> 'stock_status' = 'out_of_stock' then
    raise exception 'FAIL S2: variant count %', r;
  end if;
  passed := passed || 'S2'::text;

  -- S3: the ledger records an adjustment by the manager
  execute 'reset role';
  select count(*) into v_cnt
    from public.inventory_movements m
    join public.inventory_items i on i.id = m.inventory_item_id
   where i.product_id = p_one and m.movement_type = 'adjustment' and m.on_hand_delta = 10 and m.actor_id = mgr;
  if v_cnt <> 1 then raise exception 'FAIL S3: ledger rows %', v_cnt; end if;
  passed := passed || 'S3'::text;

  -- S4: a correction against a stale count is refused, a fresh one applied
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, null, -2, 10);
  exception when serialization_failure then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S4: stale correction applied'; end if;
  r := public.admin_adjust_stock(p_one, null, -2, 12);
  if (r ->> 'quantity_on_hand')::int <> 10 then raise exception 'FAIL S4: correction %', r; end if;
  passed := passed || 'S4'::text;

  -- S5: never below the reserved units nor below zero
  execute 'reset role';
  update public.inventory_items set quantity_reserved = 4 where product_id = p_one;
  perform set_config('role', 'authenticated', true);
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, null, -7);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S5: dropped below the reserved units'; end if;
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_var, v_red, -6);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S5: negative stock'; end if;
  passed := passed || 'S5'::text;

  -- S6: refusals
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_var, null, 5);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S6: product stock with variants'; end if;
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_free, null, 5);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S6: untracked stock'; end if;
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, v_red, 5);
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S6: variant of another product'; end if;
  v_ok := false;
  begin
    perform public.admin_adjust_stock(gen_random_uuid(), null, 5);
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S6: unknown product'; end if;
  v_ok := false;
  begin
    perform public.admin_adjust_stock(p_one, null, 0);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S6: zero change'; end if;
  passed := passed || 'S6'::text;

  execute 'reset role';
  raise exception 'ALL STOCK ADJUSTMENT TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
