-- =============================================================================
-- Shipping and refunds validation suite (migration 20261007184209_shipping_refunds)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * create_shipment / set_shipment_status / request_refund: a read-only team
--     member (`viewer`), a customer and a visitor are refused; a manager works;
--     record_external_refund is backend-only (a manager is refused too);
--   * a parcel is written with its lines in one call, rules enforced: carrier and
--     tracking number to ship, no allocation beyond the quantity, forward-only
--     transitions, the order's fulfilment and status follow the parcels;
--   * refunded units are not to ship (fulfilment recomputed when a partial refund
--     is confirmed) and cannot be shipped;
--   * a refund made in the Stripe dashboard is recorded once (idempotent on the
--     Stripe refund id), moves payment and order, and an over-refund is refused;
--   * the refund e-mail lists card refunds only;
--   * a refund is refused while a gift card bought in the order is active.
--
-- Orders and payments are written as the table owner (the trusted backend).
-- ONE transaction, ALWAYS rolled back by raising `ALL SHIPPING REFUNDS TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000220001';
  viewer  uuid := '00000000-0000-4000-a000-000000220002';
  manager uuid := '00000000-0000-4000-a000-000000220003';
  addr    jsonb := '{"first_name":"Test","last_name":"Member","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p       uuid;
  o1 uuid; o2 uuid; o3 uuid;
  a1 uuid; b1 uuid; c2 uuid; d2 uuid; e3 uuid;
  pay1 uuid; pay2 uuid; pay3 uuid;
  sh1 uuid; sh2 uuid; sh3 uuid;
  r1 uuid; r2 uuid;
  v_ship  public.shipments;
  v_ref   public.refunds;
  v_ref2  public.refunds;
  v_ord   public.orders;
  v_pay   public.payments;
  v_cnt   int;
  passed  text[] := '{}';
begin
  select id into p from public.products where status = 'active' order by created_at limit 1;
  if p is null then raise exception 'FAIL setup: no active product'; end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1,      'authenticated', 'authenticated', 'shiprefund-a.test@example.invalid', now(), now()),
    (viewer,  'authenticated', 'authenticated', 'shiprefund-v.test@example.invalid', now(), now()),
    (manager, 'authenticated', 'authenticated', 'shiprefund-m.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer'  where id = viewer;
  update public.profiles set role = 'manager' where id = manager;

  -- o1: paid, lines A (3 units) and B (1 unit). o2: paid, lines C (2) and D (1). o3: paid, line E (1).
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m1, 'shiprefund-a.test@example.invalid', addr, addr, 'EUR', 40.00, 0, 0, 6.67, 40.00) returning id into o1;
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m1, 'shiprefund-a.test@example.invalid', addr, addr, 'EUR', 30.00, 0, 0, 5.00, 30.00) returning id into o2;
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m1, 'shiprefund-a.test@example.invalid', addr, addr, 'EUR', 20.00, 0, 0, 3.33, 20.00) returning id into o3;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o1, p, 'A', 10.00, 3) returning id into a1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o1, p, 'B', 10.00, 1) returning id into b1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o2, p, 'C', 10.00, 2) returning id into c2;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o2, p, 'D', 10.00, 1) returning id into d2;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o3, p, 'E', 20.00, 1) returning id into e3;

  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o1, 'succeeded', 40.00, 'EUR', 'pi_shiprefund_o1') returning id into pay1;
  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o2, 'succeeded', 30.00, 'EUR', 'pi_shiprefund_o2') returning id into pay2;
  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o3, 'succeeded', 20.00, 'EUR', 'pi_shiprefund_o3') returning id into pay3;
  update public.orders set payment_status = 'paid', status = 'confirmed', paid_at = now() where id in (o1, o2, o3);

  -- Refused: viewer, customer, visitor -----------------------------------------------
  foreach v_cnt in array array[1, 2, 3] loop
    perform set_config('role', case v_cnt when 3 then 'anon' else 'authenticated' end, true);
    perform set_config('request.jwt.claims',
      case v_cnt when 1 then json_build_object('sub', viewer, 'role', 'authenticated')::text
                 when 2 then json_build_object('sub', m1, 'role', 'authenticated')::text
                 else '{}' end, true);
    begin
      perform public.create_shipment(o1, jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1)),
                                     'Colissimo', null, 'TRACKX1', null, null, 'shipped');
      raise exception 'FAIL S1: caller % created a shipment', v_cnt;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.set_shipment_status(gen_random_uuid(), 'shipped');
      raise exception 'FAIL S1: caller % changed a shipment', v_cnt;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.request_refund(o1, 5.00, 'goodwill');
      raise exception 'FAIL S1: caller % requested a refund', v_cnt;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.record_external_refund('pi_shiprefund_o1', 're_shiprefund_x', 1.00, 'EUR');
      raise exception 'FAIL S1: caller % recorded an external refund', v_cnt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  passed := passed || 'S1'::text;

  -- Manager ---------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);

  begin
    perform public.record_external_refund('pi_shiprefund_o1', 're_shiprefund_x', 1.00, 'EUR');
    raise exception 'FAIL S2: a manager recorded an external refund';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'S2'::text;

  -- S3: carrier and tracking number are required to ship; lines are required
  begin
    perform public.create_shipment(o1, jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1)));
    raise exception 'FAIL S3: shipped without carrier or tracking';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_shipment(o1, '[]'::jsonb, 'Colissimo', null, 'TRACKX2');
    raise exception 'FAIL S3: parcel without lines';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into v_cnt from public.shipments where order_id = o1;
  if v_cnt <> 0 then raise exception 'FAIL S3: a refused call left % parcels', v_cnt; end if;
  passed := passed || 'S3'::text;

  -- S4: a parcel with its lines, in one call; the order follows
  v_ship := public.create_shipment(o1, jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 2)),
                                   'Colissimo', 'Expert', 'TRACKA1', 'https://track.example.invalid/A1', null, 'shipped');
  sh1 := v_ship.id;
  select count(*) into v_cnt from public.shipment_items where shipment_id = sh1;
  if v_ship.status <> 'shipped' or v_ship.shipped_at is null or v_cnt <> 1 then
    raise exception 'FAIL S4: parcel % / % lines', v_ship.status, v_cnt;
  end if;
  select * into v_ord from public.orders where id = o1;
  if v_ord.fulfillment_status <> 'partially_fulfilled' or v_ord.status <> 'processing' then
    raise exception 'FAIL S4: order % / %', v_ord.fulfillment_status, v_ord.status;
  end if;
  passed := passed || 'S4'::text;

  -- S5: never beyond the quantity ordered
  begin
    perform public.create_shipment(o1, jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 2)),
                                   'Colissimo', null, 'TRACKA2');
    raise exception 'FAIL S5: 4 of 3 units allocated';
  exception when check_violation then null;
  end;
  select count(*) into v_cnt from public.shipments where order_id = o1;
  if v_cnt <> 1 then raise exception 'FAIL S5: refused parcel left a row (%)', v_cnt; end if;
  passed := passed || 'S5'::text;

  -- S6: last lines; the order is shipped, then delivered parcel by parcel
  v_ship := public.create_shipment(o1, jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1),
                                                          jsonb_build_object('order_item_id', b1, 'quantity', 1)),
                                   'Colissimo', null, 'TRACKA3', null, null, 'preparing');
  sh2 := v_ship.id;
  if v_ship.status <> 'preparing' or v_ship.shipped_at is not null then raise exception 'FAIL S6: preparing parcel'; end if;
  v_ship := public.set_shipment_status(sh2, 'shipped');
  select * into v_ord from public.orders where id = o1;
  if v_ord.fulfillment_status <> 'fulfilled' or v_ord.status <> 'shipped' then
    raise exception 'FAIL S6: order % / %', v_ord.fulfillment_status, v_ord.status;
  end if;
  perform public.set_shipment_status(sh1, 'delivered');
  select * into v_ord from public.orders where id = o1;
  if v_ord.status <> 'shipped' then raise exception 'FAIL S6: one parcel delivered, order %', v_ord.status; end if;
  perform public.set_shipment_status(sh2, 'delivered');
  select * into v_ord from public.orders where id = o1;
  if v_ord.status <> 'delivered' then raise exception 'FAIL S6: all delivered, order %', v_ord.status; end if;
  passed := passed || 'S6'::text;

  -- S7: forward only; delivered details are frozen
  begin
    perform public.set_shipment_status(sh1, 'shipped');
    raise exception 'FAIL S7: delivered went back to shipped';
  exception when check_violation then null;
  end;
  begin
    perform public.set_shipment_status(sh1, 'delivered');
    raise exception 'FAIL S7: delivered twice';
  exception when check_violation then null;
  end;
  begin
    perform public.set_shipment_status(sh1, 'returned', 'Other carrier');
    raise exception 'FAIL S7: details changed on a returned parcel';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'S7'::text;

  -- S8: a preparing parcel can be corrected then cancelled; a cancelled one frees its units
  v_ship := public.create_shipment(o3, jsonb_build_array(jsonb_build_object('order_item_id', e3, 'quantity', 1)),
                                   null, null, null, null, null, 'preparing');
  sh3 := v_ship.id;
  select fulfillment_status into v_ord.fulfillment_status from public.orders where id = o3;
  if v_ord.fulfillment_status <> 'preparing' then raise exception 'FAIL S8: order not preparing'; end if;
  v_ship := public.set_shipment_status(sh3, 'preparing', 'Colissimo', null, 'TRACKE1');
  if v_ship.carrier <> 'Colissimo' or v_ship.tracking_number <> 'TRACKE1' then raise exception 'FAIL S8: details not saved'; end if;
  perform public.set_shipment_status(sh3, 'cancelled');
  select fulfillment_status into v_ord.fulfillment_status from public.orders where id = o3;
  if v_ord.fulfillment_status <> 'unfulfilled' then raise exception 'FAIL S8: cancelled parcel, order %', v_ord.fulfillment_status; end if;
  begin
    perform public.set_shipment_status(sh3, 'shipped');
    raise exception 'FAIL S8: a cancelled parcel shipped';
  exception when check_violation then null;
  end;
  passed := passed || 'S8'::text;

  -- R1: refunded units are not to ship. o2: C shipped (2), D refunded → fulfilled.
  perform public.create_shipment(o2, jsonb_build_array(jsonb_build_object('order_item_id', c2, 'quantity', 2)),
                                 'Colissimo', null, 'TRACKC1');
  select * into v_ord from public.orders where id = o2;
  if v_ord.fulfillment_status <> 'partially_fulfilled' then raise exception 'FAIL R1: expected partial, got %', v_ord.fulfillment_status; end if;
  v_ref := public.request_refund(o2, 10.00, 'defective',
             jsonb_build_array(jsonb_build_object('order_item_id', d2, 'quantity', 1)), true);
  r1 := v_ref.id;
  if v_ref.status <> 'pending' then raise exception 'FAIL R1: refund %', v_ref.status; end if;
  -- the unit being refunded cannot be shipped meanwhile
  begin
    perform public.create_shipment(o2, jsonb_build_array(jsonb_build_object('order_item_id', d2, 'quantity', 1)),
                                   'Colissimo', null, 'TRACKD1');
    raise exception 'FAIL R1: a unit being refunded was shipped';
  exception when check_violation then null;
  end;
  -- only the backend confirms; staff cannot
  begin
    perform public.mark_refund_succeeded(r1, 're_shiprefund_o2');
    raise exception 'FAIL R1: staff confirmed a refund';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform public.mark_refund_succeeded(r1, 're_shiprefund_o2');
  select * into v_ord from public.orders where id = o2;
  if v_ord.fulfillment_status <> 'fulfilled' or v_ord.status <> 'shipped' or v_ord.payment_status <> 'partially_refunded' then
    raise exception 'FAIL R1: order % / % / %', v_ord.fulfillment_status, v_ord.status, v_ord.payment_status;
  end if;
  passed := passed || 'R1'::text;

  -- R2: a refund from the Stripe dashboard, recorded once
  v_ref := public.record_external_refund('pi_shiprefund_o1', 're_shiprefund_ext1', 5.00, 'eur');
  if v_ref.status <> 'succeeded' or v_ref.provider_refund_id <> 're_shiprefund_ext1' or v_ref.reason <> 'other' then
    raise exception 'FAIL R2: external refund %', v_ref.status;
  end if;
  v_ref2 := public.record_external_refund('pi_shiprefund_o1', 're_shiprefund_ext1', 5.00, 'EUR');
  if v_ref2.id <> v_ref.id then raise exception 'FAIL R2: replay created another refund'; end if;
  select * into v_pay from public.payments where id = pay1;
  select * into v_ord from public.orders where id = o1;
  if v_pay.amount_refunded <> 5.00 or v_pay.status <> 'partially_refunded' or v_ord.payment_status <> 'partially_refunded' then
    raise exception 'FAIL R2: payment % / % , order %', v_pay.amount_refunded, v_pay.status, v_ord.payment_status;
  end if;
  begin
    perform public.record_external_refund('pi_shiprefund_o1', 're_shiprefund_ext2', 40.00, 'EUR');
    raise exception 'FAIL R2: over-refund accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.record_external_refund('pi_unknown', 're_shiprefund_ext3', 1.00, 'EUR');
    raise exception 'FAIL R2: unknown payment accepted';
  exception when no_data_found then null;
  end;
  begin
    perform public.record_external_refund('pi_shiprefund_o1', 're_shiprefund_ext4', 1.00, 'USD');
    raise exception 'FAIL R2: currency mismatch accepted';
  exception when check_violation then null;
  end;
  passed := passed || 'R2'::text;

  -- R3: the refund e-mail lists card refunds only
  if not exists (select 1 from public.pending_refund_emails(100) where refund_id = v_ref.id)
     or not exists (select 1 from public.pending_refund_emails(100) where refund_id = r1) then
    raise exception 'FAIL R3: card refunds missing from the e-mail list';
  end if;
  passed := passed || 'R3'::text;

  -- R4: no refund while a gift card bought in the order is active
  insert into public.gift_cards (code, state, source, currency, initial_amount, order_id, order_item_id, recipient_email)
  values ('GT-AAAA-BBBB-CCCC', 'active', 'purchase', 'EUR', 20.00, o3, e3, 'recipient.test@example.invalid');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  begin
    perform public.request_refund(o3, 5.00, 'goodwill');
    raise exception 'FAIL R4: refunded an order whose gift card is active';
  exception when check_violation then null;
  end;
  execute 'reset role';
  update public.gift_cards set state = 'cancelled', cancelled_at = now() where code = 'GT-AAAA-BBBB-CCCC';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  v_ref := public.request_refund(o3, 5.00, 'goodwill');
  if v_ref.status <> 'pending' then raise exception 'FAIL R4: refund after cancelling the card'; end if;
  passed := passed || 'R4'::text;

  -- R5: a pending refund can be cancelled by staff; a customer reads their own parcels
  update public.refunds set status = 'cancelled' where id = v_ref.id;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.shipments where order_id in (o1, o2);
  if v_cnt < 3 then raise exception 'FAIL R5: customer reads % of their parcels', v_cnt; end if;
  passed := passed || 'R5'::text;

  raise exception 'ALL SHIPPING REFUNDS TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
