-- =============================================================================
-- Iteration 23 validation suite — Academy course sales (migration `…_course_checkout`).
-- =============================================================================
-- Requires all migrations + seed.sql (product `gel-de-suivi`, French shipping rates).
-- ONE transaction, ALWAYS rolled back by raising `ALL ITERATION 23 TESTS PASSED`
-- (or `FAIL: ...`).
-- Covers:
--   D1 course lines need an account, a published course, one seat, a pure line
--   D2 price = current price (course promotion), VAT `training` at the billing
--      country, nothing to ship, no stock touched
--   D3 mixed basket: courses never count for shipping thresholds nor discounts
--   D4 payment (verified webhook path, mark_order_paid) grants a `purchase`
--      entitlement; the buyer reads it, another member does not; replay harmless
--   D5 a held course cannot be ordered again
--   D6 held by the time of payment: no second entitlement, [auto] note for staff
--   D7 cancelled unpaid order grants nothing
--   D8 a full refund revokes the purchase entitlement
--   D9 a course line is never put in a parcel
--   D10 gift cards can pay for a course (paid at once, access granted)
--   D11 nobody but the backend creates orders with course lines
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000230001';  -- manager: manage_training, manage_orders
  buyer uuid := '00000000-0000-4000-a000-000000230002';
  oth   uuid := '00000000-0000-4000-a000-000000230003';
  dbl   uuid := '00000000-0000-4000-a000-000000230004';  -- granted by hand while paying
  gcb   uuid := '00000000-0000-4000-a000-000000230005';  -- pays with a gift card
  c1    uuid := '00000000-0000-4000-a000-0000002300c1';  -- published, 200.00, promotion -25 %
  c2    uuid := '00000000-0000-4000-a000-0000002300c2';  -- draft
  m1    uuid := '00000000-0000-4000-a000-0000002300a1';
  s1    uuid := '00000000-0000-4000-a000-0000002300b1';
  fr jsonb := '{"first_name":"Lou","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  be jsonb := '{"first_name":"Lou","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"1000","city":"Bruxelles","country_code":"BE"}';
  p_gel uuid; gel_price numeric; r_std uuid; r_free uuid;
  o public.orders; o2 public.orders; o_gel public.orders;
  v_card uuid; v_code text; v_refund public.refunds; v_ship uuid; v_item uuid;
  v_cnt int; v_num numeric; v_txt text; v_state text;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr,   'authenticated', 'authenticated', 'academy23mgr.test@example.invalid', now(), now()),
    (buyer, 'authenticated', 'authenticated', 'academy23buyer.test@example.invalid', now(), now()),
    (oth,   'authenticated', 'authenticated', 'academy23oth.test@example.invalid', now(), now()),
    (dbl,   'authenticated', 'authenticated', 'academy23dbl.test@example.invalid', now(), now()),
    (gcb,   'authenticated', 'authenticated', 'academy23gcb.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;

  select id, price into p_gel, gel_price from public.products where slug = 'gel-de-suivi';
  if gel_price >= 75 then raise exception 'FAIL setup: gel-de-suivi must cost less than the free-delivery minimum'; end if;
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard' and r.is_active;
  select r.id into r_free from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'free' and r.is_active and r.min_order_amount is not null;

  -- Courses, as the manager ------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'vente-test-23', 'title', 'Vente test', 'category', 'technique', 'level', 'beginner',
    'price', '200.00', 'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Module', 'steps', jsonb_build_array(
        jsonb_build_object('id', s1, 'title', 'Étape', 'duration_minutes', 5))))));
  update public.courses set status = 'published' where id = c1;
  insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at)
  values (c1, 'Lancement', 'percentage', 25, now() - interval '1 hour');
  perform public.admin_save_course(jsonb_build_object(
    'id', c2, 'slug', 'brouillon-23', 'title', 'Brouillon', 'category', 'technique', 'level', 'beginner',
    'price', '90.00', 'modules', '[]'::jsonb));

  -- Everything below is the backend (service role), like the Edge Functions ----------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);

  -- D1 --------------------------------------------------------------------------------
  begin
    perform public.create_order(null, 'guest23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
    raise exception 'FAIL D1: a guest bought a course';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_order(buyer, 'b23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c2, 'quantity', 1)), fr);
    raise exception 'FAIL D1: a draft course was sold';
  exception when no_data_found then null;
  end;
  begin
    perform public.create_order(buyer, 'b23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 2)), fr);
    raise exception 'FAIL D1: two seats on one line';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_order(buyer, 'b23@example.invalid', jsonb_build_array(
      jsonb_build_object('course_id', c1, 'quantity', 1), jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
    raise exception 'FAIL D1: the same course twice';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_order(buyer, 'b23@example.invalid', jsonb_build_array(
      jsonb_build_object('course_id', c1, 'product_id', p_gel, 'quantity', 1)), fr);
    raise exception 'FAIL D1: a line naming a course and a product';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'D1'::text;

  -- D2 (Belgian billing address: VAT of the buyer's country, nothing shipped) --------
  o := public.create_order(buyer, 'b23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), be);
  if o.subtotal_amount <> 150.00 or o.total_amount <> 150.00 or o.amount_due <> 150.00 then
    raise exception 'FAIL D2: course priced % / % (expected 150.00 after -25 %%)', o.subtotal_amount, o.total_amount;
  end if;
  if o.shipping_amount <> 0 or o.shipping_address is not null or o.shipping_rate_id is not null or o.tax_country_code <> 'BE' then
    raise exception 'FAIL D2: shipping % / tax country %', o.shipping_amount, o.tax_country_code;
  end if;
  if o.stock_state <> 'none' then raise exception 'FAIL D2: stock state %', o.stock_state; end if;
  select count(*) into v_cnt from public.order_items i
   where i.order_id = o.id and i.course_id = c1 and i.product_id is null and i.variant_id is null
     and i.product_name = 'Vente test' and i.unit_price = 150.00 and i.quantity = 1 and i.discount_amount = 0
     and i.tax_rate_bp = public.vat_rate_bp('BE', 'training')
     and i.tax_amount = public.vat_included(150.00, public.vat_rate_bp('BE', 'training'));
  if v_cnt <> 1 then raise exception 'FAIL D2: course line not recorded as expected'; end if;
  if o.tax_amount <> public.vat_included(150.00, public.vat_rate_bp('BE', 'training')) then
    raise exception 'FAIL D2: order VAT %', o.tax_amount;
  end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = buyer;
  if v_cnt <> 0 then raise exception 'FAIL D2: access granted before payment'; end if;
  passed := passed || 'D2'::text;

  -- D3 --------------------------------------------------------------------------------
  begin
    perform public.create_order(oth, 'o23@example.invalid', jsonb_build_array(
      jsonb_build_object('product_id', p_gel, 'quantity', 1), jsonb_build_object('course_id', c1, 'quantity', 1)),
      fr, fr, r_free);
    raise exception 'FAIL D3: a course counted towards the free delivery minimum';
  exception when invalid_parameter_value then null;
  end;
  o_gel := public.create_order(oth, 'o23@example.invalid', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  o2 := public.create_order(oth, 'o23@example.invalid', jsonb_build_array(
      jsonb_build_object('product_id', p_gel, 'quantity', 1), jsonb_build_object('course_id', c1, 'quantity', 1)),
      fr, fr, r_std);
  if o2.shipping_amount <> o_gel.shipping_amount or o2.subtotal_amount <> o_gel.subtotal_amount + 150.00
     or o2.discount_amount <> o_gel.discount_amount then
    raise exception 'FAIL D3: mixed basket shipping % vs %, subtotal % vs %',
      o2.shipping_amount, o_gel.shipping_amount, o2.subtotal_amount, o_gel.subtotal_amount;
  end if;
  if o2.tax_country_code <> 'FR' or o2.stock_state <> 'reserved' then
    raise exception 'FAIL D3: tax country % / stock %', o2.tax_country_code, o2.stock_state;
  end if;
  perform public.cancel_order(o_gel.id, 'test');
  passed := passed || 'D3'::text;

  -- D4 --------------------------------------------------------------------------------
  perform public.mark_order_paid(o.id, o.amount_due, o.currency, 'cs_test_d23_1', 'pi_test_d23_1');
  select count(*) into v_cnt from public.course_entitlements
   where user_id = buyer and course_id = c1 and source = 'purchase' and order_id = o.id and revoked_at is null;
  if v_cnt <> 1 then raise exception 'FAIL D4: % purchase entitlements after payment', v_cnt; end if;
  perform public.mark_order_paid(o.id, o.amount_due, o.currency, 'cs_test_d23_1', 'pi_test_d23_1');   -- webhook replay
  select count(*) into v_cnt from public.course_entitlements where user_id = buyer;
  if v_cnt <> 1 then raise exception 'FAIL D4: replay added entitlements (%)', v_cnt; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'course_entitlements' and action = 'insert'
     and record_id = (select id::text from public.course_entitlements where user_id = buyer);
  if v_cnt <> 1 then raise exception 'FAIL D4: purchase entitlement not audited'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.course_entitlements where course_id = c1;
  if v_cnt <> 1 then raise exception 'FAIL D4: the buyer reads % entitlements', v_cnt; end if;
  if jsonb_array_length(public.learner_courses()) <> 1 then raise exception 'FAIL D4: the buyer cannot open the course'; end if;
  select count(*) into v_cnt from public.order_items where order_id = o.id and course_id = c1;
  if v_cnt <> 1 then raise exception 'FAIL D4: the buyer cannot read the course line of their order'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.course_entitlements where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL D4: another member reads the buyer''s entitlement'; end if;
  if public.learner_courses() <> '[]'::jsonb then raise exception 'FAIL D4: another member opens the course'; end if;
  select count(*) into v_cnt from public.order_items where order_id = o.id;
  if v_cnt <> 0 then raise exception 'FAIL D4: another member reads the buyer''s order lines'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  passed := passed || 'D4'::text;

  -- D5 --------------------------------------------------------------------------------
  begin
    perform public.create_order(buyer, 'b23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
    raise exception 'FAIL D5: a held course was ordered again';
  exception when unique_violation then null;
  end;
  passed := passed || 'D5'::text;

  -- D6 --------------------------------------------------------------------------------
  o2 := public.create_order(dbl, 'd23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
  insert into public.course_entitlements (user_id, course_id, source, note) values (dbl, c1, 'manual_grant', 'Test');
  perform public.mark_order_paid(o2.id, o2.amount_due, o2.currency, 'cs_test_d23_2', 'pi_test_d23_2');
  select count(*) into v_cnt from public.course_entitlements where user_id = dbl and revoked_at is null;
  if v_cnt <> 1 then raise exception 'FAIL D6: % open entitlements for a course held twice', v_cnt; end if;
  select body into v_txt from public.order_notes where order_id = o2.id;
  if v_txt is null or position('[auto]' in v_txt) = 0 then raise exception 'FAIL D6: no note for the team'; end if;
  select payment_status into v_state from public.orders where id = o2.id;
  if v_state <> 'paid' then raise exception 'FAIL D6: payment not recorded (%)', v_state; end if;
  passed := passed || 'D6'::text;

  -- D7 --------------------------------------------------------------------------------
  o2 := public.create_order(oth, 'o23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
  perform public.cancel_order(o2.id, 'expired');
  select count(*) into v_cnt from public.course_entitlements where user_id = oth;
  if v_cnt <> 0 then raise exception 'FAIL D7: a cancelled order granted access'; end if;
  passed := passed || 'D7'::text;

  -- D8 --------------------------------------------------------------------------------
  select id into v_item from public.order_items where order_id = o.id;
  v_refund := public.request_refund(o.id, o.amount_due, 'requested_by_customer',
                jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)), false);
  perform public.mark_refund_succeeded(v_refund.id, 're_test_d23_1');
  select payment_status into v_state from public.orders where id = o.id;
  if v_state <> 'refunded' then raise exception 'FAIL D8: order %', v_state; end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = buyer and revoked_at is null;
  if v_cnt <> 0 then raise exception 'FAIL D8: a refunded course is still open'; end if;
  passed := passed || 'D8'::text;

  -- D9 --------------------------------------------------------------------------------
  o2 := public.create_order(oth, 'o23@example.invalid', jsonb_build_array(
      jsonb_build_object('product_id', p_gel, 'quantity', 1), jsonb_build_object('course_id', c1, 'quantity', 1)),
      fr, fr, r_std);
  perform public.mark_order_paid(o2.id, o2.amount_due, o2.currency, 'cs_test_d23_3', 'pi_test_d23_3');
  insert into public.shipments (order_id, status) values (o2.id, 'preparing') returning id into v_ship;
  select id into v_item from public.order_items where order_id = o2.id and course_id is not null;
  begin
    insert into public.shipment_items (shipment_id, order_item_id, quantity) values (v_ship, v_item, 1);
    raise exception 'FAIL D9: a course line went into a parcel';
  exception when check_violation then null;
  end;
  select id into v_item from public.order_items where order_id = o2.id and product_id = p_gel;
  insert into public.shipment_items (shipment_id, order_item_id, quantity) values (v_ship, v_item, 1);
  update public.shipments set status = 'shipped', carrier = 'Colissimo', tracking_number = 'TEST23' where id = v_ship;
  select fulfillment_status into v_state from public.orders where id = o2.id;
  if v_state <> 'fulfilled' then raise exception 'FAIL D9: the course line kept the order % (expected fulfilled)', v_state; end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = oth and order_id = o2.id and revoked_at is null;
  if v_cnt <> 1 then raise exception 'FAIL D9: mixed basket did not grant the course'; end if;
  passed := passed || 'D9'::text;

  -- D10 -------------------------------------------------------------------------------
  v_card := public.issue_gift_card(200, 'gcb23@example.invalid');
  select code into v_code from public.gift_cards where id = v_card;
  o2 := public.create_order(gcb, 'gcb23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)),
          fr, null, null, 'EUR', 'fr', null, 60, array[v_code]);
  if o2.payment_status <> 'paid' or o2.amount_due <> 0 or o2.gift_card_amount <> 150.00 then
    raise exception 'FAIL D10: % / due % / cards %', o2.payment_status, o2.amount_due, o2.gift_card_amount;
  end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = gcb and order_id = o2.id and revoked_at is null;
  if v_cnt <> 1 then raise exception 'FAIL D10: paid by gift card, access not granted'; end if;
  passed := passed || 'D10'::text;

  -- D11 -------------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  begin
    perform public.create_order(oth, 'o23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
    raise exception 'FAIL D11: a member called create_order';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform public.create_order(null, 'x23@example.invalid', jsonb_build_array(jsonb_build_object('course_id', c1, 'quantity', 1)), fr);
    raise exception 'FAIL D11: a visitor called create_order';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'D11'::text;

  raise exception 'ALL ITERATION 23 TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
