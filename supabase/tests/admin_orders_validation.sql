-- =============================================================================
-- Back-office order book validation suite — what `/admin/commandes` reads and
-- who may change it (webapp `lib/adminOrders.tsx`, `ADMIN_ORDER_SELECT`).
-- =============================================================================
-- No schema change: this proves the existing RLS and grants for the columns
-- and relations the back office now reads (recorded amounts, `paid_at`,
-- `cancelled_at`, discounts with their source, every payment row with the
-- gift card's last four characters, refunds with their dates, parcels with
-- their contents, staff notes):
--
--   * a read-only team member (`viewer`) reads every order and all of the
--     above, and changes nothing: no status, no note, no cancellation;
--   * a manager changes a status and cancels an unpaid order;
--   * a customer reads only their own orders and never a staff note nor a
--     gift card; a visitor reads nothing;
--   * nobody reads a gift card's code through the API, staff included.
--
-- Requires all migrations (including `…_order_staff_notes`) and one active
-- product. Orders are written as the table owner (the trusted backend). ONE
-- transaction, ALWAYS rolled back by raising `ALL ADMIN ORDERS TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000210001';
  m2      uuid := '00000000-0000-4000-a000-000000210002';
  viewer  uuid := '00000000-0000-4000-a000-000000210003';
  manager uuid := '00000000-0000-4000-a000-000000210004';
  addr    jsonb := '{"first_name":"Test","last_name":"Member","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p       uuid;
  o1 uuid; o2 uuid; pay1 uuid; i1 uuid; s1 uuid;
  v_cnt   int;
  v_txt   text;
  v_ts    timestamptz;
  passed  text[] := '{}';
begin
  select id into p from public.products where status = 'active' order by created_at limit 1;
  if p is null then raise exception 'FAIL setup: no active product'; end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1,      'authenticated', 'authenticated', 'adminorders-a.test@example.invalid', now(), now()),
    (m2,      'authenticated', 'authenticated', 'adminorders-b.test@example.invalid', now(), now()),
    (viewer,  'authenticated', 'authenticated', 'adminorders-v.test@example.invalid', now(), now()),
    (manager, 'authenticated', 'authenticated', 'adminorders-m.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer'  where id = viewer;
  update public.profiles set role = 'manager' where id = manager;

  -- o1: m1, paid, a line, a discount, a payment, a parcel, a refund, a note. o2: m2, unpaid.
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m1, 'adminorders-a.test@example.invalid', addr, addr, 'EUR', 40.00, 4.00, 4.90, 6.82, 40.90)
  returning id into o1;
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m2, 'adminorders-b.test@example.invalid', addr, null, 'EUR', 20.00, 0, 0, 3.33, 20.00)
  returning id into o2;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, discount_amount, tax_rate_bp, tax_amount)
  values (o1, p, 'Line of m1', 20.00, 2, 4.00, 2000, 6.00) returning id into i1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o2, p, 'Line of m2', 20.00, 1);

  insert into public.order_discounts (order_id, source, user_id, customer_email, label, goods_amount)
  values (o1, 'loyalty', m1, 'adminorders-a.test@example.invalid', 'Carte de fidélité', 4.00);

  insert into public.payments (order_id, status, amount, currency, card_brand, card_last4, provider_payment_id)
  values (o1, 'succeeded', 40.90, 'EUR', 'visa', '4242', 'pi_admin_orders_suite') returning id into pay1;
  update public.orders set payment_status = 'paid', status = 'confirmed', paid_at = now() where id = o1;

  insert into public.shipments (order_id, status, carrier, tracking_number) values (o1, 'shipped', 'Colissimo', 'TRACKADM') returning id into s1;
  insert into public.shipment_items (shipment_id, order_item_id, quantity) values (s1, i1, 2);

  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o1, pay1, 5.00, 'EUR', 'goodwill');
  update public.orders set admin_note = 'Internal: suite note' where id = o1;

  -- Act as the read-only team member --------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);

  -- V1: every order, with the columns the back office reads
  select count(*) into v_cnt from public.orders where id in (o1, o2);
  if v_cnt <> 2 then raise exception 'FAIL V1: viewer reads % of 2 orders', v_cnt; end if;
  select paid_at into v_ts from public.orders where id = o1;
  if v_ts is null then raise exception 'FAIL V1: viewer cannot read paid_at'; end if;
  perform id, order_number, user_id, customer_email, created_at, updated_at, paid_at, cancelled_at,
          status, payment_status, fulfillment_status, currency, subtotal_amount, discount_amount,
          shipping_amount, tax_amount, total_amount, gift_card_amount, amount_due, prices_include_tax,
          shipping_method_name, billing_address, shipping_address, admin_note
     from public.orders where id = o1;
  passed := passed || 'V1'::text;

  -- V2: the embedded relations, and the staff note
  if not exists (select 1 from public.order_items where order_id = o1 and tax_rate_bp = 2000 and tax_amount = 6.00)
     or not exists (select 1 from public.order_discounts where order_id = o1 and source = 'loyalty')
     or not exists (select 1 from public.payments where order_id = o1 and provider = 'stripe' and card_last4 = '4242')
     or not exists (select 1 from public.refunds where order_id = o1 and processed_at is null)
     or not exists (select 1 from public.shipment_items where shipment_id = s1)
     or not exists (select 1 from public.order_notes where order_id = o1) then
    raise exception 'FAIL V2: viewer misses part of the order';
  end if;
  passed := passed || 'V2'::text;

  -- V3: no status change, no note, no cancellation
  update public.orders set status = 'processing', fulfillment_status = 'preparing' where id in (o1, o2);
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V3: viewer updated % orders', v_cnt; end if;
  update public.orders set admin_note = 'from the viewer' where id = o1;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V3: viewer wrote a note through orders'; end if;
  begin
    insert into public.order_notes (order_id, body) values (o2, 'from the viewer');
    raise exception 'FAIL V3: viewer inserted an order note';
  exception when insufficient_privilege then null;
  end;
  update public.order_notes set body = 'rewritten by the viewer' where order_id = o1;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V3: viewer edited an order note'; end if;
  begin
    perform public.cancel_order(o2);
    raise exception 'FAIL V3: viewer cancelled an order';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'V3'::text;

  -- G1: staff see a gift card's last four characters, never its code
  if not has_column_privilege('authenticated', 'public.gift_cards', 'code_last4', 'SELECT') then
    raise exception 'FAIL G1: code_last4 not readable by staff';
  end if;
  begin
    select count(code) into v_cnt from public.gift_cards;
    raise exception 'FAIL G1: gift card codes are readable';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'G1'::text;

  -- Act as a manager --------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);

  -- W1: a status change and a cancellation of an unpaid order go through
  update public.orders set status = 'processing', fulfillment_status = 'preparing' where id = o1;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL W1: manager could not move the order'; end if;
  perform public.cancel_order(o2);
  select cancelled_at into v_ts from public.orders where id = o2;
  if v_ts is null then raise exception 'FAIL W1: cancellation not dated (cancelled_at)'; end if;
  passed := passed || 'W1'::text;

  -- Act as the customer m2 --------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);

  -- C1: nothing of m1's order, no note, no gift card; no write
  if exists (select 1 from public.orders where id = o1)
     or exists (select 1 from public.payments where order_id = o1)
     or exists (select 1 from public.refunds where order_id = o1)
     or exists (select 1 from public.order_discounts where order_id = o1)
     or exists (select 1 from public.shipments where order_id = o1) then
    raise exception 'FAIL C1: a customer reads another customer''s order';
  end if;
  select count(*) into v_cnt from public.order_notes;
  if v_cnt <> 0 then raise exception 'FAIL C1: a customer reads % staff notes', v_cnt; end if;
  select count(*) into v_cnt from public.gift_cards;
  if v_cnt <> 0 then raise exception 'FAIL C1: a customer reads % gift cards', v_cnt; end if;
  update public.orders set status = 'delivered' where id in (o1, o2);
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL C1: a customer updated % orders', v_cnt; end if;
  begin
    perform public.cancel_order(o1);
    raise exception 'FAIL C1: a customer cancelled an order';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'C1'::text;

  -- Anonymous visitor ---------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  -- A1: no order, no payment
  begin
    select count(*) into v_cnt from public.orders;
    if v_cnt <> 0 then raise exception 'FAIL A1: anon reads % orders', v_cnt; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_cnt from public.payments;
    if v_cnt <> 0 then raise exception 'FAIL A1: anon reads % payments', v_cnt; end if;
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'A1'::text;

  raise exception 'ALL ADMIN ORDERS TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
