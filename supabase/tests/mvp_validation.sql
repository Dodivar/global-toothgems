-- =============================================================================
-- MVP database validation suite
-- =============================================================================
-- Run against a database that has all migrations + seed.sql applied, e.g. in
-- the Supabase SQL editor or through the MCP `execute_sql` tool.
--
-- The whole suite runs in ONE transaction and ALWAYS rolls back: it ends by
-- raising `ALL MVP VALIDATION TESTS PASSED` (or `FAIL: ...` on the first
-- failed assertion). No test users, orders or edits persist.
--
-- Roles are impersonated exactly as PostgREST does it: `role` is switched to
-- anon / authenticated / service_role and `request.jwt.claims` carries `sub`,
-- so RLS policies, grants and triggers are exercised for real.
-- =============================================================================

do $$
declare
  alice   uuid := '00000000-0000-4000-a000-00000000a11c';
  bob     uuid := '00000000-0000-4000-a000-000000000b0b';
  admin   uuid := '00000000-0000-4000-a000-0000000ad814';
  v_cat   uuid;
  v_prod  uuid;
  v_var_a uuid;
  v_var_b uuid;
  v_inv_a uuid;
  v_inv_b uuid;
  v_addr  uuid;
  v_order uuid;
  v_order_number text;
  v_cnt   int;
  v_num   numeric;
  v_txt   text;
  v_ok    boolean;
  v_snap  jsonb;
  passed  text[] := '{}';
begin
  -- ---------------------------------------------------------------------------
  -- 1. Create customers (and an admin) through Supabase Auth's table
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (alice, 'authenticated', 'authenticated', 'alice.test@example.invalid',
       '{"first_name": "Alice", "last_name": "Testeuse", "role": "admin"}', now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob.test@example.invalid',
       '{"first_name": "Bob"}', now(), now()),
    (admin, 'authenticated', 'authenticated', 'admin.test@example.invalid',
       '{"first_name": "Ada", "last_name": "Admin"}', now(), now());
  passed := array_append(passed, 'T01 create customers');

  -- ---------------------------------------------------------------------------
  -- 2. Profiles are created automatically; metadata cannot grant a role
  -- ---------------------------------------------------------------------------
  select count(*) into v_cnt from public.profiles where id in (alice, bob, admin);
  if v_cnt <> 3 then raise exception 'FAIL T02: expected 3 profiles, got %', v_cnt; end if;
  select role into v_txt from public.profiles where id = alice;
  if v_txt <> 'customer' then raise exception 'FAIL T02: metadata escalated role to %', v_txt; end if;
  select first_name into v_txt from public.profiles where id = alice;
  if v_txt <> 'Alice' then raise exception 'FAIL T02: first_name not copied'; end if;
  -- Bootstrap admin the only supported way: trusted backend / SQL editor.
  update public.profiles set role = 'admin' where id = admin;
  passed := array_append(passed, 'T02 profiles auto-created, metadata role ignored');

  -- ===========================================================================
  -- ADMIN session
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 3. Admin creates a category
  insert into public.categories (slug, name, position)
  values ('test-categorie', 'Catégorie de test', 99) returning id into v_cat;
  select created_by into v_txt from public.categories where id = v_cat;
  if v_txt::uuid <> admin then raise exception 'FAIL T03: created_by not recorded'; end if;
  passed := array_append(passed, 'T03 admin creates category (created_by recorded)');

  -- 4. Admin creates a product (optional fields left null)
  insert into public.products (category_id, name, slug, price, status)
  values (v_cat, 'Gem de test', 'gem-de-test', 25.50, 'active') returning id into v_prod;
  passed := array_append(passed, 'T04 admin creates product');

  -- 5. Admin creates variants (one inherits price, one overrides)
  insert into public.product_variants (product_id, name, sku, attributes)
  values (v_prod, 'Rose', 'TEST-GEM-ROSE', '{"colour": "rose"}') returning id into v_var_a;
  insert into public.product_variants (product_id, name, sku, attributes, price)
  values (v_prod, 'Or', 'TEST-GEM-OR', '{"colour": "or"}', 30.00) returning id into v_var_b;
  passed := array_append(passed, 'T05 admin creates variants');

  -- 6. Admin adds inventory
  insert into public.inventory_items (variant_id, quantity_on_hand, low_stock_threshold)
  values (v_var_a, 10, 2) returning id into v_inv_a;
  insert into public.inventory_items (variant_id, quantity_on_hand, low_stock_threshold)
  values (v_var_b, 1, 2) returning id into v_inv_b;
  select stock_status into v_txt from public.inventory_items where id = v_inv_b;
  if v_txt <> 'low_stock' then raise exception 'FAIL T06: expected low_stock, got %', v_txt; end if;
  -- An inventory row cannot target both a product and a variant.
  v_ok := false;
  begin
    insert into public.inventory_items (product_id, variant_id) values (v_prod, v_var_a);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T06: inventory row accepted two targets'; end if;
  passed := array_append(passed, 'T06 admin adds inventory, stock_status derived');

  -- 15. Product / media relationships
  insert into public.product_media (product_id, storage_path, alt_text, is_primary, position)
  values (v_prod, 'products/gem-de-test/01.jpg', 'Gem de test', true, 0);
  insert into public.product_media (product_id, variant_id, storage_path, position)
  values (v_prod, v_var_b, 'products/gem-de-test/or.jpg', 1);
  v_ok := false;
  begin
    insert into public.product_media (product_id, storage_path, is_primary)
    values (v_prod, 'products/gem-de-test/02.jpg', true);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T15: two primary media accepted'; end if;
  v_ok := false;
  begin
    insert into public.product_media (product_id, storage_path) values (v_prod, '../../etc/passwd');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T15: path traversal accepted in storage_path'; end if;

  -- ===========================================================================
  -- ALICE (customer) session
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  -- 7. Alice manages her addresses; optional fields null (T16)
  insert into public.customer_addresses
    (user_id, first_name, last_name, address_line1, city, country_code, is_default)
  values (alice, 'Alice', 'Testeuse', '1 rue Fictive', 'Paris', 'FR', true)
  returning id into v_addr;
  insert into public.customer_addresses
    (user_id, first_name, last_name, address_line1, postal_code, city, country_code, is_default)
  values (alice, 'Alice', 'Testeuse', '2 avenue Imaginaire', '69000', 'Lyon', 'FR', true);
  select count(*) into v_cnt from public.customer_addresses where user_id = alice and is_default;
  if v_cnt <> 1 then raise exception 'FAIL T07: % default shipping addresses', v_cnt; end if;
  -- Alice cannot create an address for Bob.
  v_ok := false;
  begin
    insert into public.customer_addresses (user_id, first_name, last_name, address_line1, city, country_code)
    values (bob, 'X', 'Y', 'Z', 'Nice', 'FR');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T07: customer wrote an address for another user'; end if;
  passed := array_append(passed, 'T07 customer manages own addresses (single default kept)');

  -- Alice updates her own profile but cannot escalate.
  update public.profiles set display_name = 'Alice T.' where id = alice;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL T11: customer could not update own profile'; end if;
  v_ok := false;
  begin
    update public.profiles set role = 'admin' where id = alice;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T11: customer escalated own role'; end if;

  -- Customers cannot create orders directly (prices must be server-computed).
  v_ok := false;
  begin
    insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount)
    values (alice, 'a@b.c', '{"first_name":"A","last_name":"B","address_line1":"C","city":"D","country_code":"FR"}', 'EUR', 0, 0);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T11: customer inserted an order'; end if;

  -- ===========================================================================
  -- SERVICE ROLE (checkout backend) session
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);

  -- 8/9. Server creates the order from trusted catalogue data + address snapshot
  select jsonb_build_object(
           'first_name', first_name, 'last_name', last_name, 'company', company,
           'address_line1', address_line1, 'address_line2', address_line2,
           'postal_code', postal_code, 'city', city, 'region', region,
           'country_code', country_code, 'phone', phone)
    into v_snap
    from public.customer_addresses where id = v_addr;

  -- 2 × Rose (inherits 25.50) + 1 × Or (30.00) = 81.00; shipping 6.90; VAT incl. 14.65
  insert into public.orders
    (user_id, customer_email, billing_address, shipping_address, currency,
     subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values
    (alice, 'alice.test@example.invalid', v_snap, v_snap, 'EUR',
     81.00, 0, 6.90, 14.65, 87.90)
  returning id, order_number into v_order, v_order_number;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, unit_price, quantity)
  select v_order, p.id, v.id, p.name, v.name, v.sku, coalesce(v.price, p.price), q.qty
    from (values (v_var_a, 2), (v_var_b, 1)) as q(variant_id, qty)
    join public.product_variants v on v.id = q.variant_id
    join public.products p on p.id = v.product_id;

  insert into public.payments (order_id, provider_checkout_id, provider_payment_id, status, amount, currency,
                               payment_method_type, card_brand, card_last4)
  values (v_order, 'cs_test_fake_001', 'pi_test_fake_001', 'succeeded', 87.90, 'EUR', 'card', 'visa', '4242');

  execute 'set constraints all immediate';   -- run deferred subtotal checks now
  execute 'set constraints all deferred';
  if v_order_number !~ '^GT-[0-9]+$' then raise exception 'FAIL T08: bad order number %', v_order_number; end if;
  passed := array_append(passed, 'T08 service role creates order (' || v_order_number || ')');
  passed := array_append(passed, 'T09 order items added with snapshots');

  -- Stock decrement is atomic and cannot oversell.
  perform public.consume_inventory(v_inv_a, 2);
  perform public.consume_inventory(v_inv_b, 1);
  select quantity_on_hand into v_cnt from public.inventory_items where id = v_inv_a;
  if v_cnt <> 8 then raise exception 'FAIL T06b: stock not decremented (%)', v_cnt; end if;
  v_ok := false;
  begin
    perform public.consume_inventory(v_inv_b, 1);
  exception when raise_exception then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T06b: oversold an out-of-stock variant'; end if;
  passed := array_append(passed, 'T06b atomic stock decrement, oversell rejected');

  -- 10. Totals are verified by the database
  select sum(subtotal_amount) into v_num from public.order_items where order_id = v_order;
  if v_num <> 81.00 then raise exception 'FAIL T10: items sum %', v_num; end if;
  v_ok := false;
  begin
    insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, shipping_amount, total_amount)
    values (alice, 'alice.test@example.invalid', v_snap, 'EUR', 10.00, 5.00, 99.00);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T10: inconsistent total accepted'; end if;
  v_ok := false;
  begin
    insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount)
    values (alice, 'alice.test@example.invalid', v_snap, 'EUR', 50.00, 50.00);
    execute 'set constraints all immediate';   -- order with no items but subtotal 50
  exception when check_violation then v_ok := true;
  end;
  execute 'set constraints all deferred';
  if not v_ok then raise exception 'FAIL T10: subtotal not matching items accepted'; end if;
  passed := array_append(passed, 'T10 totals enforced (row check + deferred item-sum check)');

  -- ===========================================================================
  -- ALICE again: read own data only
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_cnt from public.orders where id = v_order;
  if v_cnt <> 1 then raise exception 'FAIL T11: customer cannot read own order'; end if;
  select count(*) into v_cnt from public.order_items where order_id = v_order;
  if v_cnt <> 2 then raise exception 'FAIL T11: customer cannot read own items (%)', v_cnt; end if;
  select count(*) into v_cnt from public.payments where order_id = v_order;
  if v_cnt <> 1 then raise exception 'FAIL T11: customer cannot read own payment'; end if;

  update public.orders set status = 'delivered' where id = v_order;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T11: customer modified own order status'; end if;
  update public.products set price = 0.01 where id = v_prod;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T11: customer modified a product'; end if;
  update public.inventory_items set quantity_on_hand = 9999 where id = v_inv_a;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T11: customer modified inventory'; end if;
  v_ok := false;
  begin
    insert into public.products (name, slug, price) values ('Hack', 'hack', 1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T11: customer created a product'; end if;
  v_ok := false;
  begin
    perform public.consume_inventory(v_inv_a, 1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T11: customer called consume_inventory'; end if;
  select count(*) into v_cnt from public.products where status <> 'active';
  if v_cnt <> 0 then raise exception 'FAIL T11: customer sees % non-active products', v_cnt; end if;
  select count(*) into v_cnt from public.profiles;
  if v_cnt <> 1 then raise exception 'FAIL T11: customer sees % profiles', v_cnt; end if;
  passed := array_append(passed, 'T11 customer restrictions (read own; no writes to orders/catalogue/inventory/role)');

  -- ===========================================================================
  -- BOB session: must see none of Alice's private data
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);

  select count(*) into v_cnt from public.orders;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob sees % orders', v_cnt; end if;
  select count(*) into v_cnt from public.order_items;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob sees % order items', v_cnt; end if;
  select count(*) into v_cnt from public.payments;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob sees % payments', v_cnt; end if;
  select count(*) into v_cnt from public.customer_addresses;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob sees % addresses', v_cnt; end if;
  select count(*) into v_cnt from public.profiles where id <> bob;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob sees other profiles'; end if;
  update public.customer_addresses set city = 'Hacked' where user_id = alice;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob modified Alice address'; end if;
  delete from public.customer_addresses where user_id = alice;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob deleted Alice address'; end if;
  update public.profiles set first_name = 'Hacked' where id = alice;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T13: Bob modified Alice profile'; end if;
  passed := array_append(passed, 'T13 another customer cannot read or modify private data');

  -- ===========================================================================
  -- ANON (visitor) session
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);

  select count(*) into v_cnt from public.products where status = 'active';
  if v_cnt < 1 then raise exception 'FAIL anon: cannot read active catalogue'; end if;
  select count(*) into v_cnt from public.products where status <> 'active';
  if v_cnt <> 0 then raise exception 'FAIL anon: sees draft/archived products'; end if;
  select count(*) into v_cnt from public.product_media where product_id = v_prod;
  if v_cnt <> 2 then raise exception 'FAIL T15: anon cannot see media of active product (%)', v_cnt; end if;
  v_ok := false;
  begin
    select count(*) into v_cnt from public.orders;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL anon: can query orders'; end if;
  v_ok := false;
  begin
    select count(*) into v_cnt from public.profiles;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL anon: can query profiles'; end if;
  passed := array_append(passed, 'Anon reads public catalogue only');

  -- ===========================================================================
  -- ADMIN session: full access, but order history is protected
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_cnt from public.orders where id = v_order;
  if v_cnt <> 1 then raise exception 'FAIL T12: admin cannot read customer order'; end if;
  select count(*) into v_cnt from public.profiles where id in (alice, bob, admin);
  if v_cnt <> 3 then raise exception 'FAIL T12: admin cannot read customers'; end if;
  select count(*) into v_cnt from public.customer_addresses where user_id = alice;
  if v_cnt <> 2 then raise exception 'FAIL T12: admin cannot read customer addresses'; end if;
  select count(*) into v_cnt from public.products where status in ('draft', 'archived');
  if v_cnt < 2 then raise exception 'FAIL T12: admin cannot read draft/archived products'; end if;
  update public.orders set status = 'processing', fulfillment_status = 'preparing',
                           admin_note = 'Préparation lancée' where id = v_order;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL T12: admin cannot update order status'; end if;
  v_ok := false;
  begin
    update public.orders set total_amount = 1.00, subtotal_amount = 1.00 where id = v_order;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T12: admin rewrote order amounts'; end if;
  update public.profiles set status = 'suspended' where id = bob;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL T12: admin cannot suspend a customer'; end if;
  v_ok := false;
  begin
    update public.profiles set role = 'customer' where id = admin;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T12: admin changed own role'; end if;
  passed := array_append(passed, 'T12 admin access (customers, orders, status updates; amounts immutable)');

  -- 14. Historical order data survives catalogue changes
  update public.products set name = 'Gem de test (renommée)', price = 99.00 where id = v_prod;
  update public.product_variants set price = 45.00, name = 'Or massif' where id = v_var_b;
  update public.products set status = 'archived' where id = v_prod;
  select string_agg(product_name || '/' || variant_name || '/' || unit_price::text, ', ' order by variant_name)
    into v_txt from public.order_items where order_id = v_order;
  if v_txt <> 'Gem de test/Or/30.00, Gem de test/Rose/25.50' then
    raise exception 'FAIL T14: order items changed with catalogue: %', v_txt;
  end if;
  v_ok := false;
  begin
    delete from public.products where id = v_prod;
  exception when foreign_key_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T14: ordered product was hard-deleted'; end if;
  -- Customer address edits do not change the order snapshot.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  update public.customer_addresses set city = 'Marseille' where id = v_addr;
  select shipping_address ->> 'city' into v_txt from public.orders where id = v_order;
  if v_txt <> 'Paris' then raise exception 'FAIL T14: address snapshot changed (%)', v_txt; end if;
  passed := array_append(passed, 'T14 order history unchanged after product/price/address edits; ordered product cannot be deleted');

  -- 15 (cont.). Archived product media are no longer public
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.product_media where product_id = v_prod;
  if v_cnt <> 0 then raise exception 'FAIL T15: media of archived product still public'; end if;
  passed := array_append(passed, 'T15 product/media relationships (single primary, variant media, visibility follows product)');

  -- 16. Empty / null optional fields
  execute 'reset role';
  select count(*) into v_cnt from public.products
   where id = v_prod and sku is null and description is null and compare_at_price is null;
  if v_cnt <> 1 then raise exception 'FAIL T16: null optional product fields'; end if;
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, total_amount)
  values (null, 'guest.test@example.invalid', v_snap, null, 'EUR', 0, 0);
  execute 'set constraints all immediate';
  passed := array_append(passed, 'T16 null optional fields (product, address, guest/digital order)');

  -- A suspended admin loses admin rights immediately.
  update public.profiles set status = 'suspended' where id = admin;
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cnt from public.orders;
  if v_cnt <> 0 then raise exception 'FAIL: suspended admin still reads orders'; end if;
  execute 'reset role';
  passed := array_append(passed, 'Suspended admin loses access');

  raise exception 'ALL MVP VALIDATION TESTS PASSED (% checks, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
