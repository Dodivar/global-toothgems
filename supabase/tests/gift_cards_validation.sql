-- =============================================================================
-- Gift cards — back office and storefront wiring validation suite.
-- =============================================================================
-- Requires all migrations (including 20261001200000_gift_card_staff_functions)
-- + seed.sql. ONE transaction, ALWAYS rolled back by raising
-- `ALL GIFT CARD TESTS PASSED` (or `FAIL: ...`).
--
-- What the screens rely on:
--   GC1 a customer reads no card, no ledger line, never a code (even their own purchase)
--   GC2 a read-only staff member reads cards but cannot issue, adjust, extend,
--       cancel or change the settings
--   GC3 manage_promotions issues / adjusts / extends / cancels; the functions
--       hand back ids, never the code; staff cannot select the code either
--   GC4 the balance never goes below zero (adjustment, direct ledger write)
--   GC5 unknown, expired, cancelled or empty codes all give the same error
--   GC6 staff input is validated (sub-cent, note required, past expiry, email)
--   GC7 settings: written by manage_promotions, read by visitors only when published
-- =============================================================================

do $$
declare
  alice uuid := '00000000-0000-4000-a000-0000000a1ce1';
  vwr   uuid := '00000000-0000-4000-a000-00000000f1e1';
  mgr   uuid := '00000000-0000-4000-a000-000000003a91';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gc uuid; p_gel uuid; r_std uuid;
  o public.orders;
  v_card uuid; v_expired uuid; v_cancelled uuid; v_empty uuid;
  v_code text; v_code_expired text; v_code_cancelled text; v_code_empty text;
  v_cnt int; v_num numeric; v_state text; v_msg text; v_id uuid;
  v_errors text[] := '{}';
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (alice, 'authenticated', 'authenticated', 'alice.gc@example.invalid', '{"first_name":"Alice"}', now(), now()),
    (vwr,   'authenticated', 'authenticated', 'viewer.gc@example.invalid', '{"first_name":"Vera"}', now(), now()),
    (mgr,   'authenticated', 'authenticated', 'manager.gc@example.invalid', '{"first_name":"Max"}', now(), now());
  update public.profiles set role = 'viewer' where id = vwr;
  update public.profiles set role = 'manager' where id = mgr;

  select id into p_gc from public.products where slug = 'carte-cadeau';
  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  update public.gift_card_settings set is_published = true where id;

  -- Fixtures, as the backend (service role) -------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  -- Alice buys a card and pays: her purchase must stay invisible to her through the API.
  o := public.create_order(alice, 'alice.gc@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gc, 'quantity', 1, 'amount', 50,
           'gift_card', jsonb_build_object('recipient_name', 'Bob', 'recipient_email', 'bob.gc@example.invalid',
                                           'sender_name', 'Alice'))), fr);
  perform public.mark_order_paid(o.id, o.total_amount, o.currency, 'cs_test_gc_suite', 'pi_test_gc_suite');
  v_card := public.issue_gift_card(40, 'jade.gc@example.invalid', 'Jade', null, null, 'Geste commercial');
  v_expired := public.issue_gift_card(30, 'expired.gc@example.invalid');
  update public.gift_cards set expires_at = now() - interval '1 day' where id = v_expired;
  v_cancelled := public.issue_gift_card(30, 'cancelled.gc@example.invalid');
  perform public.cancel_gift_card(v_cancelled, 'Test');
  v_empty := public.issue_gift_card(10, 'empty.gc@example.invalid');
  perform public.adjust_gift_card(v_empty, -10, 'Vidée pour le test');
  select code into v_code from public.gift_cards where id = v_card;
  select code into v_code_expired from public.gift_cards where id = v_expired;
  select code into v_code_cancelled from public.gift_cards where id = v_cancelled;
  select code into v_code_empty from public.gift_cards where id = v_empty;

  -- GC1 customer ----------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.gift_card_overview;
  if v_cnt <> 0 then raise exception 'FAIL GC1: a customer reads % cards in the overview', v_cnt; end if;
  select count(*) into v_cnt from public.gift_cards;
  if v_cnt <> 0 then raise exception 'FAIL GC1: a customer reads % cards', v_cnt; end if;
  select count(*) into v_cnt from public.gift_card_transactions;
  if v_cnt <> 0 then raise exception 'FAIL GC1: a customer reads % ledger lines', v_cnt; end if;
  v_state := null;
  begin
    perform code from public.gift_cards;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC1: the code column is selectable (%)', v_state; end if;
  v_state := null;
  begin
    perform public.issue_gift_card(500, 'alice.gc@example.invalid');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC1: a customer issued a card (%)', v_state; end if;
  v_state := null;
  begin
    perform public.gift_card_balance(v_code);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC1: a customer checked a balance (%)', v_state; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform 1 from public.gift_card_overview;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC1: a visitor reads the overview (%)', v_state; end if;
  passed := array_append(passed, 'GC1 customers and visitors read no card, no ledger, no code, no balance');

  -- GC2 read-only staff -----------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.gift_card_overview where id in (v_card, v_expired, v_cancelled, v_empty);
  if v_cnt <> 4 then raise exception 'FAIL GC2: viewer reads % of the 4 cards', v_cnt; end if;
  select count(*) into v_cnt from public.gift_card_transactions where gift_card_id = v_card;
  if v_cnt <> 1 then raise exception 'FAIL GC2: viewer reads % ledger lines', v_cnt; end if;
  foreach v_msg in array array['issue', 'adjust', 'extend', 'cancel'] loop
    v_state := null;
    begin
      case v_msg
        when 'issue'  then perform public.issue_gift_card(25, 'x.gc@example.invalid');
        when 'adjust' then perform public.adjust_gift_card(v_card, 10, 'Viewer');
        when 'extend' then perform public.extend_gift_card(v_card, now() + interval '5 years');
        else               perform public.cancel_gift_card(v_card, 'Viewer');
      end case;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL GC2: viewer could %  (%)', v_msg, v_state; end if;
  end loop;
  update public.gift_card_settings set preset_amounts = '{1}' where id;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL GC2: viewer changed the settings'; end if;
  passed := array_append(passed, 'GC2 read-only staff read cards and ledger; issue/adjust/extend/cancel/settings refused');

  -- GC3 manage_promotions ---------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  v_id := public.issue_gift_card(25.50, ' Lea.GC@Example.invalid ', 'Léa', 'Merci', null, 'Réclamation');
  select count(*) into v_cnt from public.gift_card_overview
   where id = v_id and display_status = 'active' and balance = 25.50 and recipient_email = 'lea.gc@example.invalid'
     and code_last4 ~ '^[A-Z2-9]{4}$';
  if v_cnt <> 1 then raise exception 'FAIL GC3: issued card not in the overview'; end if;
  perform public.adjust_gift_card(v_id, -5.50, 'Correction');
  select balance into v_num from public.gift_card_overview where id = v_id;
  if v_num <> 20 then raise exception 'FAIL GC3: balance after adjustment %', v_num; end if;
  if public.extend_gift_card(v_id, now() + interval '3 years', 'Prolongation') <> v_id
     or public.cancel_gift_card(v_id, 'Annulée') <> v_id then
    raise exception 'FAIL GC3: extend/cancel should return the card id';
  end if;
  select count(*) into v_cnt from public.gift_card_overview where id = v_id and display_status = 'cancelled' and balance = 0;
  if v_cnt <> 1 then raise exception 'FAIL GC3: cancelled card'; end if;
  select count(*) into v_cnt from public.gift_card_transactions where gift_card_id = v_id
   and kind in ('issue', 'adjustment', 'extension', 'cancellation') and actor_id = mgr;
  if v_cnt <> 4 then raise exception 'FAIL GC3: ledger has % attributed lines', v_cnt; end if;
  v_state := null;
  begin
    perform code from public.gift_cards where id = v_id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC3: staff can select the code (%)', v_state; end if;
  -- No staff-callable function returns the gift_cards row (it would carry the code).
  select count(*) into v_cnt from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prorettype = 'public.gift_cards'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_cnt <> 0 then raise exception 'FAIL GC3: % functions callable by signed-in users return a gift_cards row', v_cnt; end if;
  passed := array_append(passed, 'GC3 manager issues, adjusts, extends, cancels (ids only, ledger attributed); code never readable');

  -- GC4 balance never below zero ------------------------------------------------------
  v_state := null;
  begin
    perform public.adjust_gift_card(v_card, -40.01, 'Trop');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  if v_state is distinct from 'P0001' or v_msg not like '%balance insufficient%' then
    raise exception 'FAIL GC4: overdraw by adjustment (%, %)', v_state, v_msg;
  end if;
  v_state := null;
  begin
    insert into public.gift_card_transactions (gift_card_id, kind, amount, balance_after) values (v_card, 'adjustment', 100, 0);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC4: direct ledger write (%)', v_state; end if;
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_state := null;
  begin
    insert into public.gift_card_transactions (gift_card_id, kind, amount) values (v_card, 'redemption', -40.01);
  exception when others then v_state := sqlstate;
  end;
  if v_state is null then raise exception 'FAIL GC4: the ledger trigger let a card go negative'; end if;
  select balance into v_num from public.gift_cards where id = v_card;
  if v_num <> 40 then raise exception 'FAIL GC4: balance moved to %', v_num; end if;
  select count(*) into v_cnt from public.gift_cards where balance < 0;
  if v_cnt <> 0 then raise exception 'FAIL GC4: negative balances exist'; end if;
  passed := array_append(passed, 'GC4 no adjustment, ledger line or redemption takes a balance below zero');

  -- GC5 one generic error for every unusable code --------------------------------------
  foreach v_msg in array array['GT-ZZZZ-ZZZZ-ZZZZ', v_code_expired, v_code_cancelled, v_code_empty, 'not a code'] loop
    v_state := null;
    begin
      perform public.create_order(null, 'guest.gc@example.invalid',
        jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
        p_gift_card_codes => array[v_msg]);
    exception when others then v_state := sqlstate || ' ' || sqlerrm;
    end;
    v_errors := array_append(v_errors, v_state);
  end loop;
  if (select count(distinct e) from unnest(v_errors) e) <> 1 or v_errors[1] is distinct from 'P0002 create_order: gift card not usable' then
    raise exception 'FAIL GC5: errors differ %', v_errors;
  end if;
  o := public.create_order(null, 'guest.gc@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
         p_gift_card_codes => array[lower(v_code)]);
  select balance into v_num from public.gift_cards where id = v_card;
  if o.gift_card_amount <= 0 or o.amount_due <> o.total_amount - o.gift_card_amount or v_num <> greatest(0, 40 - o.total_amount) then
    raise exception 'FAIL GC5: a valid code was not applied (order %, balance %)', row_to_json(o), v_num;
  end if;
  passed := array_append(passed, 'GC5 unknown / expired / cancelled / empty / malformed codes: one identical error; a valid one pays');

  -- GC5b a card held by an abandoned (unpaid) order is listed, releasable, and usable again --
  v_id := public.issue_gift_card(5, 'held.gc@example.invalid');
  select code into v_code_empty from public.gift_cards where id = v_id;
  o := public.create_order(null, 'guest.gc@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
         p_gift_card_codes => array[v_code_empty]);
  if o.payment_status = 'paid' then raise exception 'FAIL GC5b: fixture order paid in full, pick a cheaper card'; end if;
  select count(*) into v_cnt from public.unpaid_orders_holding_gift_cards(array[lower(v_code_empty)]) where order_id = o.id;
  if v_cnt <> 1 then raise exception 'FAIL GC5b: the held order is not listed'; end if;
  select count(*) into v_cnt from public.unpaid_orders_holding_gift_cards(array[v_code]) where order_id = o.id;
  if v_cnt <> 0 then raise exception 'FAIL GC5b: an order is listed for a card it does not hold'; end if;
  if (select balance from public.gift_cards where id = v_id) <> 0 then raise exception 'FAIL GC5b: the card was not held'; end if;
  perform public.cancel_order(o.id, 'payment_retried');
  if (select balance from public.gift_cards where id = v_id) <> 5 then raise exception 'FAIL GC5b: cancelling did not credit the card back'; end if;
  select count(*) into v_cnt from public.unpaid_orders_holding_gift_cards(array[v_code_empty]);
  if v_cnt <> 0 then raise exception 'FAIL GC5b: a released order is still listed'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.unpaid_orders_holding_gift_cards(array[v_code_empty]);
  exception when others then v_state := sqlstate;
  end;
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  if v_state is distinct from '42501' then raise exception 'FAIL GC5b: a customer may call the release lookup (%)', v_state; end if;
  passed := array_append(passed, 'GC5b held cards listed for the backend only, balance restored by cancelling, never listed after');

  -- GC6 staff input validation -------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  foreach v_msg in array array['subcent', 'zero', 'huge', 'email', 'past', 'adjust_note', 'adjust_subcent', 'cancel_note'] loop
    v_state := null;
    begin
      case v_msg
        when 'subcent'        then perform public.issue_gift_card(10.005, 'a.gc@example.invalid');
        when 'zero'           then perform public.issue_gift_card(0, 'a.gc@example.invalid');
        when 'huge'           then perform public.issue_gift_card(10000.01, 'a.gc@example.invalid');
        when 'email'          then perform public.issue_gift_card(10, 'not-an-email');
        when 'past'           then perform public.issue_gift_card(10, 'a.gc@example.invalid', null, null, now() - interval '1 day');
        when 'adjust_note'    then perform public.adjust_gift_card(v_card, 5, '  ');
        when 'adjust_subcent' then perform public.adjust_gift_card(v_card, 0.001, 'x');
        else                       perform public.cancel_gift_card(v_card, '');
      end case;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL GC6: % accepted (%)', v_msg, v_state; end if;
  end loop;
  passed := array_append(passed, 'GC6 sub-cent, zero, oversized amounts, bad e-mail, past expiry, missing notes refused');

  -- GC7 settings -------------------------------------------------------------------
  update public.gift_card_settings set preset_amounts = '{20,40,80}', is_published = false where id;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL GC7: manager could not save the settings'; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.gift_card_settings;
  if v_cnt <> 0 then raise exception 'FAIL GC7: visitors read unpublished settings'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.gift_card_settings set is_published = true where id;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.gift_card_settings where preset_amounts = '{20,40,80}';
  if v_cnt <> 1 then raise exception 'FAIL GC7: visitors do not read published settings'; end if;
  v_state := null;
  begin
    update public.gift_card_settings set is_published = false where id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL GC7: a visitor could write the settings (%)', v_state; end if;
  passed := array_append(passed, 'GC7 settings saved by manage_promotions, public only when published, never written by visitors');

  raise exception 'ALL GIFT CARD TESTS PASSED (% checks): %', array_length(passed, 1), array_to_string(passed, ' | ');
end;
$$;
