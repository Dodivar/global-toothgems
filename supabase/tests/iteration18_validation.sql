-- =============================================================================
-- Iteration 18 validation suite — "My orders" isolation and staff notes
-- (migration `…_order_staff_notes`).
-- =============================================================================
-- What a member reads through the API for the member area's order history and
-- order detail page: their own orders, lines, parcels, refunds, discounts and
-- payments — never another account's, never the internal notes.
--
-- Requires all migrations + at least one active product. Orders are written
-- directly as the table owner (the trusted backend), so the suite does not
-- depend on the checkout functions. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 18 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1    uuid := '00000000-0000-4000-a000-000000180001';
  m2    uuid := '00000000-0000-4000-a000-000000180002';
  staff uuid := '00000000-0000-4000-a000-000000180003';
  addr  jsonb := '{"first_name":"Test","last_name":"Member","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p     uuid;
  o1 uuid; o2 uuid; pay1 uuid; pay2 uuid; i1 uuid; i2 uuid; s1 uuid; s2 uuid; r1 uuid; r2 uuid;
  v_cnt  int;
  v_txt  text;
  passed text[] := '{}';
begin
  select id into p from public.products where status = 'active' order by created_at limit 1;
  if p is null then raise exception 'FAIL setup: no active product'; end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1,    'authenticated', 'authenticated', 'orders18a.test@example.invalid', now(), now()),
    (m2,    'authenticated', 'authenticated', 'orders18b.test@example.invalid', now(), now()),
    (staff, 'authenticated', 'authenticated', 'orders18s.test@example.invalid', now(), now());
  update public.profiles set role = 'admin' where id = staff;

  -- One paid order per member: a line, a payment, a parcel, a refund, a discount.
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m1, 'orders18a.test@example.invalid', addr, addr, 'EUR', 40.00, 4.00, 4.90, 6.82, 40.90)
  returning id into o1;
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m2, 'orders18b.test@example.invalid', addr, addr, 'EUR', 20.00, 0, 0, 3.33, 20.00)
  returning id into o2;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, discount_amount)
  values (o1, p, 'Line of m1', 20.00, 2, 4.00) returning id into i1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o2, p, 'Line of m2', 20.00, 1) returning id into i2;

  insert into public.order_discounts (order_id, source, user_id, customer_email, label, goods_amount)
  values (o1, 'loyalty', m1, 'orders18a.test@example.invalid', 'Carte de fidélité', 4.00),
         (o2, 'loyalty', m2, 'orders18b.test@example.invalid', 'Carte de fidélité m2', 0);

  insert into public.payments (order_id, status, amount, currency) values (o1, 'succeeded', 40.90, 'EUR') returning id into pay1;
  insert into public.payments (order_id, status, amount, currency) values (o2, 'succeeded', 20.00, 'EUR') returning id into pay2;
  update public.orders set payment_status = 'paid', status = 'confirmed' where id in (o1, o2);

  insert into public.shipments (order_id, status, carrier, tracking_number) values (o1, 'shipped', 'Colissimo', 'TRACK18A') returning id into s1;
  insert into public.shipments (order_id, status, carrier, tracking_number) values (o2, 'shipped', 'Colissimo', 'TRACK18B') returning id into s2;
  insert into public.shipment_items (shipment_id, order_item_id, quantity) values (s1, i1, 2), (s2, i2, 1);

  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o1, pay1, 5.00, 'EUR', 'goodwill') returning id into r1;
  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o2, pay2, 5.00, 'EUR', 'goodwill') returning id into r2;
  insert into public.refund_items (refund_id, order_item_id, quantity) values (r1, i1, 1), (r2, i2, 1);

  -- N1: a staff note written the old way lands in order_notes, the column stays empty
  update public.orders set admin_note = 'Internal: customer called about m1' where id = o1;
  update public.orders set admin_note = 'Internal: second note' where id = o1;
  update public.orders set admin_note = 'Internal: note on m2' where id = o2;
  select body into v_txt from public.order_notes where order_id = o1;
  if v_txt is distinct from E'Internal: customer called about m1\n\nInternal: second note' then
    raise exception 'FAIL N1: order_notes body is %', v_txt;
  end if;
  if exists (select 1 from public.orders where id in (o1, o2) and admin_note is not null) then
    raise exception 'FAIL N1: orders.admin_note still holds a note';
  end if;
  passed := passed || 'N1'::text;

  -- N2: an order cannot be created with a readable note
  begin
    insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount, admin_note)
    values (m1, 'orders18a.test@example.invalid', addr, 'EUR', 1, 1, 'readable');
    raise exception 'FAIL N2: order inserted with admin_note';
  exception when check_violation then null;
  end;
  passed := passed || 'N2'::text;

  -- N3: no order in the database still carries a note in the old column
  select count(*) into v_cnt from public.orders where admin_note is not null;
  if v_cnt <> 0 then raise exception 'FAIL N3: % orders keep admin_note', v_cnt; end if;
  passed := passed || 'N3'::text;

  -- Act as m1 ------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);

  -- M1: own orders only
  select count(*) into v_cnt from public.orders where id in (o1, o2);
  if v_cnt <> 1 or not exists (select 1 from public.orders where id = o1) then
    raise exception 'FAIL M1: member sees % of the two orders', v_cnt;
  end if;
  passed := passed || 'M1'::text;

  -- M2: own lines only
  select count(*) into v_cnt from public.order_items where order_id in (o1, o2);
  if v_cnt <> 1 then raise exception 'FAIL M2: member sees % lines', v_cnt; end if;
  passed := passed || 'M2'::text;

  -- M3: own parcels and parcel contents only
  select count(*) into v_cnt from public.shipments where order_id in (o1, o2);
  if v_cnt <> 1 then raise exception 'FAIL M3: member sees % shipments', v_cnt; end if;
  select count(*) into v_cnt from public.shipment_items where shipment_id in (s1, s2);
  if v_cnt <> 1 then raise exception 'FAIL M3: member sees % shipment items', v_cnt; end if;
  passed := passed || 'M3'::text;

  -- M4: own refunds and refunded lines only
  select count(*) into v_cnt from public.refunds where order_id in (o1, o2);
  if v_cnt <> 1 then raise exception 'FAIL M4: member sees % refunds', v_cnt; end if;
  select count(*) into v_cnt from public.refund_items where refund_id in (r1, r2);
  if v_cnt <> 1 then raise exception 'FAIL M4: member sees % refund items', v_cnt; end if;
  passed := passed || 'M4'::text;

  -- M5: own discounts only
  select count(*) into v_cnt from public.order_discounts where order_id in (o1, o2);
  if v_cnt <> 1 then raise exception 'FAIL M5: member sees % discounts', v_cnt; end if;
  passed := passed || 'M5'::text;

  -- M6: own payments only
  select count(*) into v_cnt from public.payments where order_id in (o1, o2);
  if v_cnt <> 1 then raise exception 'FAIL M6: member sees % payments', v_cnt; end if;
  passed := passed || 'M6'::text;

  -- M7: no internal note, not even on their own order
  select count(*) into v_cnt from public.order_notes;
  if v_cnt <> 0 then raise exception 'FAIL M7: member reads % order notes', v_cnt; end if;
  select admin_note into v_txt from public.orders where id = o1;
  if v_txt is not null then raise exception 'FAIL M7: member reads admin_note'; end if;
  passed := passed || 'M7'::text;

  -- M8: a member writes neither notes nor orders
  begin
    insert into public.order_notes (order_id, body) values (o1, 'from the member');
    raise exception 'FAIL M8: member wrote an order note';
  exception when insufficient_privilege then null;
  end;
  update public.orders set status = 'delivered', admin_note = 'from the member' where id = o1;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL M8: member updated an order'; end if;
  passed := passed || 'M8'::text;

  -- Act as m2 ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);

  -- M9: the other member sees their own order and nothing of m1's
  if exists (select 1 from public.orders where id = o1)
     or exists (select 1 from public.order_items where order_id = o1)
     or exists (select 1 from public.shipments where order_id = o1)
     or exists (select 1 from public.refunds where order_id = o1)
     or exists (select 1 from public.order_discounts where order_id = o1)
     or exists (select 1 from public.payments where order_id = o1) then
    raise exception 'FAIL M9: m2 reads m1''s order data';
  end if;
  if not exists (select 1 from public.orders where id = o2) then raise exception 'FAIL M9: m2 cannot read own order'; end if;
  passed := passed || 'M9'::text;

  -- Act as staff ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);

  -- S1: staff read and write the notes
  select count(*) into v_cnt from public.order_notes where order_id in (o1, o2);
  if v_cnt <> 2 then raise exception 'FAIL S1: staff read % notes', v_cnt; end if;
  update public.order_notes set body = 'Rewritten by staff' where order_id = o2;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL S1: staff could not edit a note'; end if;
  passed := passed || 'S1'::text;

  -- S2: a staff note written through orders.admin_note is appended, not readable on the order
  update public.orders set admin_note = 'Third note' where id = o1;
  select body into v_txt from public.order_notes where order_id = o1;
  if v_txt not like '%Third note' then raise exception 'FAIL S2: note not appended (%)', v_txt; end if;
  if (select admin_note from public.orders where id = o1) is not null then raise exception 'FAIL S2: column kept the note'; end if;
  passed := passed || 'S2'::text;

  -- Anonymous visitor ------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  -- A1: nothing at all
  begin
    select count(*) into v_cnt from public.order_notes;
    raise exception 'FAIL A1: anon reads order_notes (% rows)', v_cnt;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_cnt from public.orders;
    if v_cnt <> 0 then raise exception 'FAIL A1: anon reads % orders', v_cnt; end if;
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'A1'::text;

  raise exception 'ALL ITERATION 18 TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
