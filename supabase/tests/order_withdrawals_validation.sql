-- =============================================================================
-- Shop withdrawal validation suite (migration 20261109213000_order_withdrawals)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   W1  a member cannot read another member's options; a visitor cannot either;
--       the declaration is service-role only (a member's JWT is refused)
--   W2  a declaration for another member's order is refused
--   W3  a declaration after the period (14 days from receipt) is refused
--   W4  a sealed hygiene product: the answer is required, opened is refused
--   W5  a gift card line (not goods) is refused
--   W6  a professional buyer is refused
--   W7  a valid declaration records its lines and the period end
--   W8  no double declaration: the same units cannot be declared twice
--   W9  the acknowledgement e-mail is pending at once
--   W10 RLS: the owner reads their withdrawal, another member and a visitor do not
--   W11 guests: neutral link request (wrong e-mail = none), throttled after 3,
--       the token opens its own order only, declaration through the link
--   W12 the team: viewer refused; return received; refund linked to the
--       withdrawal with its lines; no refusal while it is under way; the
--       confirmed refund settles the withdrawal; the units are no longer open
--   W13 staff cannot link a refund to a withdrawal by hand
--   W14 refusal needs a reason (and a note for 'other'); it frees the units
--   W15 the member's data export lists the withdrawals of their orders
--   W16 the nightly purge drops guest links 30 days after they expired
--
-- Orders, parcels and payments are written as the table owner (the backend).
-- ONE transaction, ALWAYS rolled back by raising `ALL ORDER WITHDRAWAL TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000130001';
  m2      uuid := '00000000-0000-4000-a000-000000130002';
  viewer  uuid := '00000000-0000-4000-a000-000000130003';
  manager uuid := '00000000-0000-4000-a000-000000130004';
  addr    jsonb := '{"first_name":"Test","last_name":"Retract","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_plain uuid; p_seal uuid; p_gift uuid;
  o1 uuid; o2 uuid; o3 uuid;
  a1 uuid; b1 uuid; g1 uuid; c2 uuid; d3 uuid;
  pay1 uuid;
  w1 public.order_withdrawals;
  w3 public.order_withdrawals;
  v_ref  public.refunds;
  v_json jsonb;
  v_text text;
  v_cnt  int;
  v_tok  text;
  passed text[] := '{}';
begin
  insert into public.products (name, slug, price, product_type, status)
  values ('Retract plain', 'retract-plain-test', 10.00, 'physical', 'active') returning id into p_plain;
  insert into public.products (name, slug, price, product_type, status, withdrawal_hygiene_seal)
  values ('Retract sealed', 'retract-sealed-test', 5.00, 'physical', 'active', true) returning id into p_seal;
  select id into p_gift from public.products where product_type = 'gift_card' order by created_at limit 1;
  if p_gift is null then raise exception 'FAIL setup: no gift card product'; end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1,      'authenticated', 'authenticated', 'retract-a.test@example.invalid', now(), now()),
    (m2,      'authenticated', 'authenticated', 'retract-b.test@example.invalid', now(), now()),
    (viewer,  'authenticated', 'authenticated', 'retract-v.test@example.invalid', now(), now()),
    (manager, 'authenticated', 'authenticated', 'retract-m.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer'  where id = viewer;
  update public.profiles set role = 'manager' where id = manager;

  -- o1 (m1): sealed A ×2, plain B ×3, gift card G ×1; delivered 2 days ago.
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, order_number)
  values (m1, 'retract-a.test@example.invalid', addr, addr, 'EUR', 60.00, 0, 5.00, 0, 65.00, 'GT-RETRACT-1') returning id into o1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o1, p_seal, 'A', 5.00, 2) returning id into a1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o1, p_plain, 'B', 10.00, 3) returning id into b1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o1, p_gift, 'G', 20.00, 1) returning id into g1;
  -- o2 (m1): delivered 20 days ago.
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, order_number)
  values (m1, 'retract-a.test@example.invalid', addr, addr, 'EUR', 10.00, 0, 0, 0, 10.00, 'GT-RETRACT-2') returning id into o2;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o2, p_plain, 'C', 10.00, 1) returning id into c2;
  -- o3: a guest's order, not shipped yet.
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, order_number)
  values (null, 'retract-guest.test@example.invalid', addr, addr, 'EUR', 10.00, 0, 0, 0, 10.00, 'GT-RETRACT-3') returning id into o3;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  values (o3, p_plain, 'D', 10.00, 1) returning id into d3;

  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o1, 'succeeded', 65.00, 'EUR', 'pi_retract_o1') returning id into pay1;
  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o2, 'succeeded', 10.00, 'EUR', 'pi_retract_o2'), (o3, 'succeeded', 10.00, 'EUR', 'pi_retract_o3');
  update public.orders set payment_status = 'paid', status = 'confirmed', paid_at = now() where id in (o1, o2, o3);

  with s as (
    insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at, delivered_at)
    values (o1, 'delivered', 'Colissimo', 'RETRACT1', now() - interval '4 days', now() - interval '2 days')
    returning id)
  insert into public.shipment_items (shipment_id, order_item_id, quantity)
  select s.id, x.item, x.qty from s, (values (a1, 2), (b1, 3)) as x(item, qty);
  with s as (
    insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at, delivered_at)
    values (o2, 'delivered', 'Colissimo', 'RETRACT2', now() - interval '22 days', now() - interval '20 days')
    returning id)
  insert into public.shipment_items (shipment_id, order_item_id, quantity) select s.id, c2, 1 from s;

  -- W1 -------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  begin
    perform public.order_withdrawal_options(o1);
    raise exception 'FAIL W1: another member read the options';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.declare_order_withdrawal(o1, 'X', '[]'::jsonb, true, m2);
    raise exception 'FAIL W1: a member called the declaration directly';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.order_withdrawal_options(o1);
    raise exception 'FAIL W1: a visitor read the options';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.request_order_withdrawal_link('GT-RETRACT-3', 'retract-guest.test@example.invalid');
    raise exception 'FAIL W1: a visitor asked for a link without the Edge Function';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_json := public.order_withdrawal_options(o1);
  if (v_json ->> 'open')::boolean is not true or v_json ->> 'deadline_at' is null then
    raise exception 'FAIL W1: the owner should see an open period: %', v_json;
  end if;
  if (select l ->> 'excluded' from jsonb_array_elements(v_json -> 'lines') l where l ->> 'order_item_id' = g1::text) <> 'gift_card' then
    raise exception 'FAIL W1: the gift card line is not marked excluded';
  end if;
  if v_json ? 'suggested_refund' or (v_json -> 'withdrawals') <> '[]'::jsonb then
    raise exception 'FAIL W1: unexpected content for the owner: %', v_json;
  end if;
  passed := passed || 'W1'::text;

  -- From here the declaration runs as the backend (the Edge Function).
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);

  -- W2
  begin
    perform public.declare_order_withdrawal(o1, 'Intruder', jsonb_build_array(jsonb_build_object('order_item_id', b1, 'quantity', 1)), true, m2);
    raise exception 'FAIL W2: another member declared on o1';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.declare_order_withdrawal(o1, 'Nobody', jsonb_build_array(jsonb_build_object('order_item_id', b1, 'quantity', 1)), true);
    raise exception 'FAIL W2: a declaration without identity passed';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W2'::text;

  -- W3
  begin
    perform public.declare_order_withdrawal(o2, 'Late', jsonb_build_array(jsonb_build_object('order_item_id', c2, 'quantity', 1)), true, m1);
    raise exception 'FAIL W3: a late declaration passed';
  exception when check_violation then
    get stacked diagnostics v_text = message_text;
    if v_text <> 'order_withdrawal: deadline_passed' then raise exception 'FAIL W3: %', v_text; end if;
  end;
  passed := passed || 'W3'::text;

  -- W4
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract', jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1)), true, m1);
    raise exception 'FAIL W4: a sealed product without the answer passed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract',
      jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1, 'seal_opened', true)), true, m1);
    raise exception 'FAIL W4: an opened sealed product passed';
  exception when check_violation then
    get stacked diagnostics v_text = message_text;
    if v_text <> 'order_withdrawal: unsealed_hygiene' then raise exception 'FAIL W4: %', v_text; end if;
  end;
  passed := passed || 'W4'::text;

  -- W5
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract', jsonb_build_array(jsonb_build_object('order_item_id', g1, 'quantity', 1)), true, m1);
    raise exception 'FAIL W5: a gift card line passed';
  exception when check_violation then
    get stacked diagnostics v_text = message_text;
    if v_text <> 'order_withdrawal: excluded_line' then raise exception 'FAIL W5: %', v_text; end if;
  end;
  passed := passed || 'W5'::text;

  -- W6
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract', jsonb_build_array(jsonb_build_object('order_item_id', b1, 'quantity', 1)), false, m1);
    raise exception 'FAIL W6: a professional passed';
  exception when check_violation then
    get stacked diagnostics v_text = message_text;
    if v_text <> 'order_withdrawal: professional_buyer' then raise exception 'FAIL W6: %', v_text; end if;
  end;
  select count(*) into v_cnt from public.order_withdrawals where order_id in (o1, o2);
  if v_cnt <> 0 then raise exception 'FAIL W6: refused declarations left % rows', v_cnt; end if;
  passed := passed || 'W6'::text;

  -- W7
  w1 := public.declare_order_withdrawal(o1, '  Test Retract ',
    jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1, 'seal_opened', false),
                      jsonb_build_object('order_item_id', b1, 'quantity', 3)), true, m1, null, 'en');
  if w1.status <> 'declared' or w1.channel <> 'account' or w1.user_id <> m1 or w1.customer_name <> 'Test Retract'
     or w1.deadline_at is null or w1.locale <> 'en' or w1.email <> 'retract-a.test@example.invalid' then
    raise exception 'FAIL W7: unexpected row %', to_jsonb(w1);
  end if;
  select count(*) into v_cnt from public.order_withdrawal_items where withdrawal_id = w1.id;
  if v_cnt <> 2 then raise exception 'FAIL W7: % lines recorded', v_cnt; end if;
  passed := passed || 'W7'::text;

  -- W8
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract', jsonb_build_array(jsonb_build_object('order_item_id', b1, 'quantity', 1)), true, m1);
    raise exception 'FAIL W8: the same units were declared twice';
  exception when check_violation then
    get stacked diagnostics v_text = message_text;
    if v_text <> 'order_withdrawal: quantity' then raise exception 'FAIL W8: %', v_text; end if;
  end;
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract',
      jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 2, 'seal_opened', false)), true, m1);
    raise exception 'FAIL W8: more units than left were declared';
  exception when check_violation then null;
  end;
  begin
    perform public.declare_order_withdrawal(o1, 'Test Retract',
      jsonb_build_array(jsonb_build_object('order_item_id', a1, 'quantity', 1, 'seal_opened', false),
                        jsonb_build_object('order_item_id', a1, 'quantity', 1, 'seal_opened', false)), true, m1);
    raise exception 'FAIL W8: a line listed twice passed';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'W8'::text;

  -- W9
  select count(*) into v_cnt from public.pending_order_withdrawal_emails(100) e
   where e.withdrawal_id = w1.id and e.email = 'retract-a.test@example.invalid' and e.locale = 'en'
     and jsonb_array_length(e.items) = 2 and e.is_member;
  if v_cnt <> 1 then raise exception 'FAIL W9: acknowledgement not pending'; end if;
  passed := passed || 'W9'::text;

  -- W10
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_withdrawals where id = w1.id;
  if v_cnt <> 1 then raise exception 'FAIL W10: the owner cannot read the withdrawal'; end if;
  select count(*) into v_cnt from public.order_withdrawal_items where withdrawal_id = w1.id;
  if v_cnt <> 2 then raise exception 'FAIL W10: the owner cannot read the lines'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_withdrawals;
  if v_cnt <> 0 then raise exception 'FAIL W10: another member reads % withdrawals', v_cnt; end if;
  select count(*) into v_cnt from public.order_withdrawal_items;
  if v_cnt <> 0 then raise exception 'FAIL W10: another member reads % lines', v_cnt; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    select count(*) into v_cnt from public.order_withdrawals;
    raise exception 'FAIL W10: a visitor read withdrawals';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W10'::text;

  -- W11
  perform set_config('role', 'postgres', true);
  v_json := public.request_order_withdrawal_link('GT-RETRACT-3', 'someone-else@example.invalid');
  if v_json ->> 'status' <> 'none' or v_json ? 'token' then raise exception 'FAIL W11: wrong e-mail gave %', v_json; end if;
  v_json := public.request_order_withdrawal_link(' gt-retract-3 ', 'Retract-Guest.Test@example.invalid');
  if v_json ->> 'status' <> 'ok' or v_json ->> 'order_id' <> o3::text then raise exception 'FAIL W11: right pair gave %', v_json; end if;
  v_tok := v_json ->> 'token';
  if exists (select 1 from public.order_withdrawal_links where token_hash = v_tok) then
    raise exception 'FAIL W11: the token is stored in clear';
  end if;
  -- Third request for this pair (the first one above used another address); the fourth is throttled.
  perform public.request_order_withdrawal_link('GT-RETRACT-3', 'retract-guest.test@example.invalid');
  perform public.request_order_withdrawal_link('GT-RETRACT-3', 'retract-guest.test@example.invalid');
  v_json := public.request_order_withdrawal_link('GT-RETRACT-3', 'retract-guest.test@example.invalid');
  if v_json ->> 'status' <> 'throttled' then raise exception 'FAIL W11: the 4th request was not throttled: %', v_json; end if;
  v_json := public.order_withdrawal_options_by_token(v_tok);
  if v_json ->> 'order_id' <> o3::text or (v_json ->> 'open')::boolean is not true or v_json ->> 'deadline_at' is not null then
    raise exception 'FAIL W11: the link opened %', v_json;
  end if;
  if public.order_withdrawal_options_by_token(repeat('0', 64)) is not null then
    raise exception 'FAIL W11: an unknown token opened an order';
  end if;
  begin
    perform public.declare_order_withdrawal(o1, 'Guest', jsonb_build_array(jsonb_build_object('order_item_id', b1, 'quantity', 1)), true, null, v_tok);
    raise exception 'FAIL W11: the link opened another order';
  exception when insufficient_privilege then null;
  end;
  w3 := public.declare_order_withdrawal(o3, 'Guest Buyer', jsonb_build_array(jsonb_build_object('order_item_id', d3, 'quantity', 1)), true, null, v_tok);
  if w3.channel <> 'email_link' or w3.user_id is not null or w3.deadline_at is not null then
    raise exception 'FAIL W11: unexpected guest row %', to_jsonb(w3);
  end if;
  passed := passed || 'W11'::text;

  -- W12
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_withdrawal_return_received(w1.id);
    raise exception 'FAIL W12: a viewer marked a return';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.request_withdrawal_refund(w1.id, o1, 10.00, true);
    raise exception 'FAIL W12: a viewer requested a refund';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_refuse_withdrawal(w1.id, 'other', 'no');
    raise exception 'FAIL W12: a customer refused a withdrawal';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  v_json := public.order_withdrawal_options(o1);
  if (v_json -> 'withdrawals' -> 0 ->> 'suggested_refund')::numeric <> 35.00 then
    raise exception 'FAIL W12: suggested refund % (expected 5 + 30)', v_json -> 'withdrawals' -> 0 ->> 'suggested_refund';
  end if;
  w1 := public.admin_withdrawal_return_received(w1.id);
  if w1.status <> 'return_received' or w1.return_received_at is null or w1.handled_by <> manager then
    raise exception 'FAIL W12: return not recorded %', to_jsonb(w1);
  end if;
  begin
    perform public.request_withdrawal_refund(w1.id, o2, 10.00, true);
    raise exception 'FAIL W12: a refund on another order passed';
  exception when invalid_parameter_value then null;
  end;
  v_ref := public.request_withdrawal_refund(w1.id, o1, 35.00, true);
  if v_ref.withdrawal_id <> w1.id or v_ref.status <> 'pending' or v_ref.reason <> 'return' or not v_ref.restock then
    raise exception 'FAIL W12: unexpected refund %', to_jsonb(v_ref);
  end if;
  select count(*) into v_cnt from public.refund_items where refund_id = v_ref.id
     and ((order_item_id = a1 and quantity = 1) or (order_item_id = b1 and quantity = 3));
  if v_cnt <> 2 then raise exception 'FAIL W12: the refund does not carry the withdrawal''s lines'; end if;
  begin
    perform public.request_withdrawal_refund(w1.id, o1, 1.00, false);
    raise exception 'FAIL W12: a second refund passed';
  exception when check_violation then null;
  end;
  begin
    perform public.admin_refuse_withdrawal(w1.id, 'goods_damaged', 'Broken');
    raise exception 'FAIL W12: refused while a refund is under way';
  exception when check_violation then null;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform public.mark_refund_succeeded(v_ref.id, 're_retract_1');
  select * into w1 from public.order_withdrawals where id = w1.id;
  if w1.status <> 'refunded' or w1.refunded_at is null then raise exception 'FAIL W12: not settled %', to_jsonb(w1); end if;
  v_json := private.order_withdrawal_overview(o1, false);
  if (select (l ->> 'withdrawable')::int from jsonb_array_elements(v_json -> 'lines') l where l ->> 'order_item_id' = b1::text) <> 0
     or (select (l ->> 'withdrawable')::int from jsonb_array_elements(v_json -> 'lines') l where l ->> 'order_item_id' = a1::text) <> 1 then
    raise exception 'FAIL W12: units left after the refund: %', v_json -> 'lines';
  end if;
  passed := passed || 'W12'::text;

  -- W13
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  begin
    update public.refunds set withdrawal_id = w3.id where id = v_ref.id;
    raise exception 'FAIL W13: staff relinked a refund';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W13'::text;

  -- W14
  begin
    perform public.admin_refuse_withdrawal(w3.id, 'other', '  ');
    raise exception 'FAIL W14: "other" without a note passed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_refuse_withdrawal(w3.id, 'because', null);
    raise exception 'FAIL W14: an unknown reason passed';
  exception when invalid_parameter_value then null;
  end;
  w3 := public.admin_refuse_withdrawal(w3.id, 'professional_buyer', 'Commande passée pour votre salon.');
  if w3.status <> 'refused' or w3.refusal_reason <> 'professional_buyer' or w3.refused_at is null then
    raise exception 'FAIL W14: unexpected refusal %', to_jsonb(w3);
  end if;
  perform set_config('role', 'postgres', true);
  if private.order_item_withdrawable(d3) <> 1 then raise exception 'FAIL W14: the refused units stay taken'; end if;
  perform set_config('role', 'authenticated', true);
  begin
    perform public.admin_withdrawal_return_received(w3.id);
    raise exception 'FAIL W14: a refused withdrawal moved again';
  exception when check_violation then null;
  end;
  passed := passed || 'W14'::text;

  -- W15
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_json := public.my_personal_data();
  select count(*) into v_cnt
    from jsonb_array_elements(v_json -> 'archive' -> 'shop' -> 'orders') o, jsonb_array_elements(o -> 'withdrawals') w
   where w ->> 'id' = w1.id::text and jsonb_array_length(w -> 'items') = 2;
  if v_cnt <> 1 then raise exception 'FAIL W15: the export misses the withdrawal'; end if;
  passed := passed || 'W15'::text;

  -- W16
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.order_withdrawal_links (order_id, token_hash, created_at, expires_at)
  values (o3, repeat('a', 64), now() - interval '40 days', now() - interval '38 days');
  v_json := private.purge_expired_personal_data(now());
  if exists (select 1 from public.order_withdrawal_links where token_hash = repeat('a', 64)) then
    raise exception 'FAIL W16: an old link survived the purge';
  end if;
  if not exists (select 1 from public.order_withdrawal_links where order_id = o3 and expires_at > now()) then
    raise exception 'FAIL W16: the purge removed a live link';
  end if;
  if not exists (select 1 from public.order_withdrawals where id = w3.id) then
    raise exception 'FAIL W16: the purge removed a withdrawal';
  end if;
  passed := passed || 'W16'::text;

  raise exception 'ALL ORDER WITHDRAWAL TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
