-- =============================================================================
-- Iteration 4 validation suite — gift cards.
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 4 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  alice uuid := '00000000-0000-4000-a000-00000000a11c';
  bob   uuid := '00000000-0000-4000-a000-000000000b0b';
  admin uuid := '00000000-0000-4000-a000-0000000ad814';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gc uuid; p_gel uuid; p_kit uuid; inv_gel uuid; r_std uuid;
  o_buy public.orders; o_b1 public.orders; o_b2 public.orders; o_b3 public.orders; o_b4 public.orders; o_void public.orders;
  gc public.gift_cards; gc2 public.gift_cards;
  v_code text; v_code2 text; v_manual uuid; v_manual_code text;
  v_cnt int; v_num numeric; v_txt text; v_state text; v_ok boolean;
  gc_item jsonb;
  passed text[] := '{}';

begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (alice, 'authenticated', 'authenticated', 'alice.test@example.invalid', '{"first_name":"Alice","last_name":"Test"}', now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob.test@example.invalid',   '{"first_name":"Bob"}', now(), now()),
    (admin, 'authenticated', 'authenticated', 'admin.test@example.invalid', '{"first_name":"Ada"}', now(), now());
  update public.profiles set role = 'admin' where id = admin;

  select id into p_gc from public.products where slug = 'carte-cadeau';
  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select id into p_kit from public.products where slug = 'kit-application-premium';
  select id into inv_gel from public.inventory_items where product_id = p_gel;
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  gc_item := jsonb_build_object('product_id', p_gc, 'quantity', 1, 'amount', 50,
               'gift_card', jsonb_build_object('recipient_name', 'Bob', 'recipient_email', 'bob.test@example.invalid',
                                               'sender_name', 'Alice', 'message', 'Joyeux anniversaire !', 'design', 'blush'));

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);

  -- G1 purchase ----------------------------------------------------------------
  o_buy := public.create_order(alice, 'alice.test@example.invalid',
             jsonb_build_array(gc_item, jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  select * into gc from public.gift_cards where order_id = o_buy.id;
  if o_buy.total_amount <> 73.90 or o_buy.tax_amount <> 3.99 or o_buy.amount_due <> 73.90
     or gc.state <> 'pending' or gc.balance <> 0 or gc.initial_amount <> 50 or gc.design <> 'blush'
     or gc.purchaser_user_id <> alice or gc.recipient_email <> 'bob.test@example.invalid' then
    raise exception 'FAIL G1: order % card %', row_to_json(o_buy), row_to_json(gc);
  end if;
  select count(*) into v_cnt from public.order_items where order_id = o_buy.id and tax_amount = 0 and product_id = p_gc;
  if v_cnt <> 1 then raise exception 'FAIL G1: gift card line should carry no VAT'; end if;
  passed := array_append(passed, 'G1 gift card bought through checkout: pending card, no VAT on the card line');

  -- G2 invalid purchases -------------------------------------------------------
  foreach v_txt in array array[
    jsonb_set(gc_item, '{amount}', '12')::text,                                       -- below minimum
    jsonb_set(gc_item, '{amount}', '33.333')::text,                                   -- sub-cent
    jsonb_set(gc_item, '{amount}', '600')::text,                                      -- above maximum
    jsonb_set(gc_item, '{quantity}', '2')::text,                                      -- one card per line
    (gc_item #- '{gift_card,recipient_email}')::text,                                 -- no recipient
    (gc_item #- '{gift_card,sender_name}')::text,                                     -- sender required
    jsonb_set(gc_item, '{gift_card,message}', to_jsonb(repeat('x', 241)))::text,      -- message too long
    jsonb_set(gc_item, '{gift_card,design}', '"photo"')::text,                        -- design disabled
    jsonb_set(gc_item, '{gift_card,deliver_at}', to_jsonb((now() + interval '2 years')::text))::text
  ] loop
    v_state := null;
    begin
      perform public.create_order(alice, 'alice.test@example.invalid', jsonb_build_array(v_txt::jsonb), fr);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL G2: accepted % (%)', v_txt, v_state; end if;
  end loop;
  v_state := null;
  begin
    perform public.create_order(alice, 'alice.test@example.invalid',
      jsonb_build_array(jsonb_set(gc_item, '{amount}', '50')), fr, null, null, 'GBP');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G2: currency (%)', v_state; end if;
  passed := array_append(passed, 'G2 purchase rules: amount presets/bounds/cents, one per line, recipient, sender, message, design, delivery date, currency');

  -- G3 a pending card cannot be used ------------------------------------------------
  execute 'reset role';
  select code into v_code from public.gift_cards where id = gc.id;
  perform set_config('role', 'service_role', true);
  v_state := null;
  begin
    perform public.create_order(bob, 'bob.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
      'EUR', 'fr', null, 60, array[v_code]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL G3: unpaid card redeemed (%)', v_state; end if;
  v_code := lower(v_code);   -- codes are case-insensitive for customers
  passed := array_append(passed, 'G3 a card is unusable until its order is paid');

  -- G4 payment issues the card --------------------------------------------------------
  o_buy := public.mark_order_paid(o_buy.id, 73.90, 'EUR', 'cs_gc_buy');
  select * into gc from public.gift_cards where id = gc.id;
  if gc.state <> 'active' or gc.balance <> 50 or gc.issued_at is null or gc.delivery_status <> 'pending'
     or gc.expires_at < now() + interval '11 months' or gc.expires_at > now() + interval '13 months' then
    raise exception 'FAIL G4: issuance %', row_to_json(gc);
  end if;
  select count(*) into v_cnt from public.gift_card_transactions where gift_card_id = gc.id and kind = 'purchase' and amount = 50;
  if v_cnt <> 1 then raise exception 'FAIL G4: purchase ledger line'; end if;
  passed := array_append(passed, 'G4 verified payment issues the card: active, balance from ledger, 12-month expiry');

  -- G5 order fully covered by a card: paid immediately ------------------------------------
  o_b1 := public.create_order(bob, 'bob.test@example.invalid',
            jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
            'EUR', 'fr', null, 60, array[v_code, upper(v_code)]);     -- duplicate code ignored
  select * into gc from public.gift_cards where id = gc.id;
  if o_b1.gift_card_amount <> 23.90 or o_b1.amount_due <> 0 or o_b1.payment_status <> 'paid'
     or o_b1.status <> 'confirmed' or o_b1.stock_state <> 'committed' or gc.balance <> 26.10
     or o_b1.total_amount <> 23.90 or o_b1.tax_amount <> 3.99 then
    raise exception 'FAIL G5: order % card balance %', row_to_json(o_b1), gc.balance;
  end if;
  passed := array_append(passed, 'G5 card pays the whole order: paid at once, stock committed, VAT unchanged (payment, not discount)');

  -- G6 partial cover, Stripe collects the rest ------------------------------------------
  o_b2 := public.create_order(bob, 'bob.test@example.invalid',
            jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
            'EUR', 'fr', null, 60, array[v_code]);
  if o_b2.gift_card_amount <> 26.10 or o_b2.amount_due <> 227.80 or o_b2.payment_status <> 'pending' then
    raise exception 'FAIL G6: %', row_to_json(o_b2);
  end if;
  v_state := null;
  begin
    perform public.mark_order_paid(o_b2.id, 253.90, 'EUR', 'cs_gc_b2');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G6: Stripe charged the full total (%)', v_state; end if;
  o_b2 := public.mark_order_paid(o_b2.id, 227.80, 'EUR', 'cs_gc_b2');
  if o_b2.payment_status <> 'paid' then raise exception 'FAIL G6: not paid'; end if;
  passed := array_append(passed, 'G6 partial cover: Stripe must collect exactly amount_due');

  -- G7 exhausted card -----------------------------------------------------------------
  v_state := null;
  begin
    perform public.create_order(bob, 'bob.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
      'EUR', 'fr', null, 60, array[v_code]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL G7: empty card accepted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.create_order(bob, 'bob.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
      'EUR', 'fr', null, 60, array['GT-AAAA-BBBB-CCCC']);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL G7: unknown code (%)', v_state; end if;
  passed := array_append(passed, 'G7 empty or unknown cards refused with the same generic error');

  -- G12 staff operations -----------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_manual := public.issue_gift_card(100, 'Bob.Test@example.invalid', 'Bob', 'Geste commercial', null, 'Retard de livraison');
  select balance, state into v_num, v_txt from public.gift_cards where id = v_manual;
  if v_num <> 100 or v_txt <> 'active' then raise exception 'FAIL G12: manual issue % %', v_num, v_txt; end if;
  perform public.adjust_gift_card(v_manual, -30, 'Correction');
  v_state := null;
  begin
    perform public.adjust_gift_card(v_manual, -1000, 'Trop');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0001' then raise exception 'FAIL G12: negative balance (%)', v_state; end if;
  v_state := null;
  begin
    perform public.adjust_gift_card(v_manual, 5, '  ');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G12: adjustment without note (%)', v_state; end if;
  v_state := null;
  begin
    perform public.extend_gift_card(v_manual, now() - interval '1 day');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G12: extension into the past (%)', v_state; end if;
  perform public.extend_gift_card(v_manual, now() + interval '2 years', 'Geste');
  select balance into v_num from public.gift_cards where id = v_manual;
  if v_num <> 70 then raise exception 'FAIL G12: balance after adjustment %', v_num; end if;
  passed := array_append(passed, 'G12 staff: manual card, adjustments (note required, never negative), extension (later only)');

  -- G13 privacy -------------------------------------------------------------------------
  v_state := null;
  begin
    select code into v_txt from public.gift_cards where id = v_manual;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: staff read a full code (%)', v_state; end if;
  select code_last4 into v_txt from public.gift_cards where id = v_manual;
  if char_length(v_txt) <> 4 then raise exception 'FAIL G13: last 4 not visible'; end if;
  v_state := null;
  begin
    perform public.gift_card_balance(v_code);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: balance lookup from the API (%)', v_state; end if;
  select display_status into v_txt from public.gift_card_overview where id = gc.id;
  if v_txt <> 'redeemed' then raise exception 'FAIL G13: display status %', v_txt; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(id) into v_cnt from public.gift_cards;
  if v_cnt <> 0 then raise exception 'FAIL G13: customer lists gift cards'; end if;
  v_state := null;
  begin
    perform public.adjust_gift_card(v_manual, 1000, 'Cadeau pour moi');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: customer adjusted a card (%)', v_state; end if;
  v_state := null;
  begin
    perform public.refund_to_gift_cards(o_b1.id, 5, 'goodwill');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: customer refunded to card (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.gift_card_settings where is_published;
  if v_cnt <> 1 then raise exception 'FAIL G13: visitors cannot read the gift card configuration'; end if;
  v_state := null;
  begin
    select count(id) into v_cnt from public.gift_cards;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: anon can query gift cards (%)', v_state; end if;
  passed := array_append(passed, 'G13 codes never exposed (staff see last 4), no API balance lookup, customers/anon cannot read or operate cards');

  -- G8 cards cannot buy gift cards ---------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select code into v_manual_code from public.gift_cards where id = v_manual;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  o_b3 := public.create_order(bob, 'bob.test@example.invalid', jsonb_build_array(gc_item), fr,
            null, null, 'EUR', 'fr', null, 60, array[v_manual_code]);
  select balance into v_num from public.gift_cards where id = v_manual;
  if o_b3.gift_card_amount <> 0 or o_b3.amount_due <> 50 or v_num <> 70 then
    raise exception 'FAIL G8: gift card paid for a gift card % / %', row_to_json(o_b3), v_num;
  end if;
  passed := array_append(passed, 'G8 a gift card cannot pay for another gift card');

  -- G9 cancelling an unpaid order credits cards back and voids purchased cards ---------------
  o_b4 := public.create_order(bob, 'bob.test@example.invalid',
            jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1), gc_item), fr, fr, r_std,
            'EUR', 'fr', null, 60, array[v_manual_code]);
  select balance into v_num from public.gift_cards where id = v_manual;
  if o_b4.gift_card_amount <> 70 or v_num <> 0 then raise exception 'FAIL G9: redemption % / %', o_b4.gift_card_amount, v_num; end if;
  o_b4 := public.cancel_order(o_b4.id, 'Client injoignable');
  select balance into v_num from public.gift_cards where id = v_manual;
  select state into v_txt from public.gift_cards where order_id = o_b4.id;
  if v_num <> 70 or o_b4.gift_card_amount <> 0 or v_txt <> 'void' then
    raise exception 'FAIL G9: reversal balance % order % purchased card %', v_num, o_b4.gift_card_amount, v_txt;
  end if;
  select count(*) into v_cnt from public.payments where order_id = o_b4.id and provider = 'gift_card' and status = 'cancelled';
  if v_cnt <> 1 then raise exception 'FAIL G9: gift card payment not cancelled'; end if;
  passed := array_append(passed, 'G9 unpaid order cancelled: redeemed amount credited back, purchased card voided');

  -- G11 refunds onto the card -------------------------------------------------------------
  v_state := null;
  begin
    perform public.request_refund(o_b1.id, 5, 'goodwill');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL G11: card refund of a gift-card payment (%)', v_state; end if;
  perform public.refund_to_gift_cards(o_b1.id, 10, 'goodwill');
  select balance into v_num from public.gift_cards where id = gc.id;
  select * into o_b1 from public.orders where id = o_b1.id;
  if v_num <> 10 or o_b1.payment_status <> 'partially_refunded' then
    raise exception 'FAIL G11: refund to card balance % order %', v_num, o_b1.payment_status;
  end if;
  v_state := null;
  begin
    perform public.refund_to_gift_cards(o_b1.id, 50, 'goodwill');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL G11: over-refund to card (%)', v_state; end if;
  perform public.refund_to_gift_cards(o_b1.id, 13.90, 'requested_by_customer');
  select * into o_b1 from public.orders where id = o_b1.id;
  if o_b1.payment_status <> 'refunded' or o_b1.status <> 'refunded' then
    raise exception 'FAIL G11: full refund to card %/%', o_b1.payment_status, o_b1.status;
  end if;
  passed := array_append(passed, 'G11 gift-card-paid amounts refunded onto the card (bounded; card payments via Stripe only)');

  -- G15 delivery ----------------------------------------------------------------------------
  perform public.record_gift_card_delivery(gc.id, 'sent');
  perform public.record_gift_card_delivery(gc.id, 'sent', 'bob.new@example.invalid');
  select count(*) into v_cnt from public.gift_card_transactions where gift_card_id = gc.id and kind = 'resend';
  select recipient_email into v_txt from public.gift_cards where id = gc.id;
  if v_cnt <> 1 or v_txt <> 'bob.new@example.invalid' then raise exception 'FAIL G15: resend % / %', v_cnt, v_txt; end if;
  if public.gift_card_code_for_delivery(gc.id) is distinct from upper(v_code) then
    raise exception 'FAIL G15: backend cannot read code for delivery';
  end if;
  select balance, redeemable into v_num, v_ok from public.gift_card_balance(lower(v_code));
  if v_num <> 23.90 or not v_ok then raise exception 'FAIL G15: balance lookup % %', v_num, v_ok; end if;   -- 10 + 13.90 refunded
  passed := array_append(passed, 'G15 delivery tracking, resend logged in ledger, backend-only code and balance lookup');

  -- G16 scheduled delivery: not redeemable before its date ------------------------------------
  o_void := public.create_order(alice, 'alice.test@example.invalid', jsonb_build_array(
              jsonb_set(gc_item, '{gift_card,deliver_at}', to_jsonb((now() + interval '10 days')::text))), fr);
  o_void := public.mark_order_paid(o_void.id, 50, 'EUR', 'cs_gc_sched');
  select * into gc2 from public.gift_cards where order_id = o_void.id;
  if gc2.delivery_status <> 'scheduled' then raise exception 'FAIL G16: not scheduled'; end if;
  v_state := null;
  begin
    perform public.create_order(bob, 'bob.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
      'EUR', 'fr', null, 60, array[gc2.code]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL G16: scheduled card used early (%)', v_state; end if;
  passed := array_append(passed, 'G16 scheduled cards cannot be used before their delivery date');

  -- G12b cancel ------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.cancel_gift_card(v_manual, 'Fraude suspectée');
  select balance, state into v_num, v_txt from public.gift_cards where id = v_manual;
  if v_num <> 0 or v_txt <> 'cancelled' then raise exception 'FAIL G12b: cancel % %', v_num, v_txt; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'gift_cards' and record_id = v_manual::text
     and changes -> 'state' ->> 'new' = 'cancelled' and actor_id = admin;
  if v_cnt <> 1 then raise exception 'FAIL G12b: cancellation not audited'; end if;
  passed := array_append(passed, 'G12b cancellation zeroes the balance through the ledger and is audited');

  -- G14 ledger integrity ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_cnt from public.gift_cards g
   where g.balance <> coalesce((select sum(t.amount) from public.gift_card_transactions t where t.gift_card_id = g.id), 0);
  if v_cnt <> 0 then raise exception 'FAIL G14: % cards whose balance differs from their ledger', v_cnt; end if;
  v_state := null;
  begin
    update public.gift_card_transactions set amount = amount + 1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G14: ledger rewritten (%)', v_state; end if;
  passed := array_append(passed, 'G14 every balance equals the sum of its ledger; the ledger is append-only');

  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 4 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
