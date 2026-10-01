-- =============================================================================
-- Iteration 19 validation suite — Stripe Checkout wiring (migration
-- `…_stripe_checkout`): expiry job, webhook idempotency, payment return page,
-- and the database calls the two Edge Functions make, in their order.
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 19 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  cust    uuid := '00000000-0000-4000-a000-000000180001';
  p_gel   uuid;
  inv_gel uuid;
  r_std   uuid;
  fr      jsonb := '{"first_name":"Test","last_name":"Stripe","address_line1":"1 rue du Test","postal_code":"75001","city":"Paris","country_code":"FR"}';
  o       public.orders;
  o2      public.orders;
  v_txt   text;
  v_state text;
  v_num   text;
  v_cnt   int;
  v_res0  int;
  v_res   int;
  v_hand  int;
  cs1     text := 'cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0';
  cs2     text := 'cs_test_z9Y8x7W6v5U4t3S2r1Q0p9O8n7M6l5K4j3I2h1G0';
  passed  text[] := '{}';
begin
  select id into p_gel from public.products where slug = 'gel-de-suivi';                      -- 19.00, tracked stock
  select id into inv_gel from public.inventory_items where product_id = p_gel;
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';                                           -- 4.90
  if p_gel is null or r_std is null then raise exception 'FAIL setup: run seed.sql'; end if;
  select quantity_reserved into v_res0 from public.inventory_items where id = inv_gel;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (cust, 'authenticated', 'authenticated', 'stripe18.test@example.invalid', now(), now());

  -- S1: the expiry job is scheduled once, every 5 minutes ------------------------
  select count(*) into v_cnt from cron.job
   where jobname = 'expire-stale-orders' and schedule = '*/5 * * * *'
     and command ilike '%public.expire_stale_orders()%';
  if v_cnt <> 1 then raise exception 'FAIL S1: expire-stale-orders job missing or duplicated (%)', v_cnt; end if;
  passed := passed || 'S1 cron'::text;

  -- S2: rights — webhook helper for the service role only, status for everyone --
  if has_function_privilege('anon', 'public.record_stripe_webhook_event(text, text, boolean, text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.record_stripe_webhook_event(text, text, boolean, text, uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.record_stripe_webhook_event(text, text, boolean, text, uuid)', 'execute') then
    raise exception 'FAIL S2: record_stripe_webhook_event rights';
  end if;
  if not has_function_privilege('anon', 'public.checkout_session_status(text)', 'execute')
     or has_function_privilege('anon', 'public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[], text[], boolean)', 'execute')
     or has_function_privilege('anon', 'public.mark_order_paid(uuid, numeric, text, text, text, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.mark_order_paid(uuid, numeric, text, text, text, text, text, text)', 'execute') then
    raise exception 'FAIL S2: checkout function rights';
  end if;
  passed := passed || 'S2 rights'::text;

  -- S3: create-checkout-session — order (70 min reservation) + pending payment row
  o := public.create_order(cust, 'stripe18.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'variant_id', null, 'quantity', 2)),
         fr, fr, r_std, 'EUR', 'fr', null, 70, null, null, false);
  if o.status <> 'pending' or o.payment_status <> 'pending' or o.amount_due <> 42.90
     or o.expires_at not between now() + interval '69 minutes' and now() + interval '71 minutes' then
    raise exception 'FAIL S3: order %', row_to_json(o);
  end if;
  select quantity_reserved into v_res from public.inventory_items where id = inv_gel;
  if v_res <> v_res0 + 2 then raise exception 'FAIL S3: stock not reserved (% → %)', v_res0, v_res; end if;
  insert into public.payments (order_id, provider, provider_checkout_id, status, amount, currency)
  values (o.id, 'stripe', cs1, 'pending', o.amount_due, o.currency);
  passed := passed || 'S3 order + pending payment'::text;

  -- S4: return page — a visitor holding the session id sees "pending" only ------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select order_number, state into v_num, v_state from public.checkout_session_status(cs1);
  if v_num is distinct from o.order_number::text or v_state is distinct from 'pending' then
    raise exception 'FAIL S4: status % %', v_num, v_state;
  end if;
  select count(*) into v_cnt from public.checkout_session_status('cs_test_unknownunknownunknown');
  if v_cnt <> 0 then raise exception 'FAIL S4: unknown session answered'; end if;
  select count(*) into v_cnt from public.checkout_session_status('x'' or 1=1 --');
  if v_cnt <> 0 then raise exception 'FAIL S4: malformed session answered'; end if;
  v_state := null;                                                            -- orders stay unreadable
  begin
    select count(*) into v_cnt from public.orders where id = o.id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S4: anon reads orders (%)', v_state; end if;
  v_state := null;
  begin
    perform public.record_stripe_webhook_event('evt_test_anon', 'checkout.session.completed', false, cs1, o.id);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S4: anon recorded an event (%)', v_state; end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  passed := passed || 'S4 status page'::text;

  -- S5: webhook idempotency — first delivery new, retries counted, status kept --
  v_txt := public.record_stripe_webhook_event('evt_test_18a', 'checkout.session.completed', false, cs1, o.id);
  if v_txt <> 'received' then raise exception 'FAIL S5: first delivery %', v_txt; end if;
  v_txt := public.record_stripe_webhook_event('evt_test_18a', 'checkout.session.completed', false, cs1, o.id);
  select attempts into v_cnt from public.stripe_webhook_events where id = 'evt_test_18a';
  if v_txt <> 'received' or v_cnt <> 2 then raise exception 'FAIL S5: retry % / %', v_txt, v_cnt; end if;
  -- unknown order id: stored without it instead of failing the foreign key
  v_txt := public.record_stripe_webhook_event('evt_test_18b', 'checkout.session.completed', false, cs1,
                                              '00000000-0000-4000-a000-0000001800ff');
  if v_txt <> 'received' or (select order_id from public.stripe_webhook_events where id = 'evt_test_18b') is not null then
    raise exception 'FAIL S5: unknown order id';
  end if;
  passed := passed || 'S5 idempotency'::text;

  -- S6: a wrong amount is refused (never a paid order for less than due) --------
  v_state := null;
  begin
    perform public.mark_order_paid(o.id, 4.29, 'EUR', cs1, 'pi_test_18a');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL S6: wrong amount accepted (%)', v_state; end if;
  passed := passed || 'S6 amount check'::text;

  -- S7: checkout.session.completed → paid, the pending row completed, stock sold -
  o := public.mark_order_paid(o.id, 42.90, 'eur', cs1, 'pi_test_18a', 'card', 'visa', '4242');
  update public.stripe_webhook_events set status = 'processed', processed_at = now() where id = 'evt_test_18a';
  select count(*) into v_cnt from public.payments
   where order_id = o.id and provider_checkout_id = cs1 and provider_payment_id = 'pi_test_18a' and status = 'succeeded';
  if o.payment_status <> 'paid' or o.status <> 'confirmed' or o.stock_state <> 'committed' or v_cnt <> 1 then
    raise exception 'FAIL S7: paid order % (payment rows %)', row_to_json(o), v_cnt;
  end if;
  select quantity_reserved into v_res from public.inventory_items where id = inv_gel;
  if v_res <> v_res0 then raise exception 'FAIL S7: reservation not turned into a sale'; end if;
  -- replayed event: status says processed; replayed call: no second payment
  v_txt := public.record_stripe_webhook_event('evt_test_18a', 'checkout.session.completed', false, cs1, o.id);
  o := public.mark_order_paid(o.id, 42.90, 'EUR', cs1, 'pi_test_18a');
  select count(*) into v_cnt from public.payments where order_id = o.id and provider = 'stripe';
  if v_txt <> 'processed' or v_cnt <> 1 then raise exception 'FAIL S7: replay % / % payments', v_txt, v_cnt; end if;
  perform set_config('role', 'anon', true);
  select state into v_state from public.checkout_session_status(cs1);
  perform set_config('role', 'postgres', true);
  if v_state <> 'paid' then raise exception 'FAIL S7: status page says %', v_state; end if;
  passed := passed || 'S7 paid + replay'::text;

  -- S8: checkout.session.expired → cancelled, reservation released, replay no-op -
  o2 := public.create_order(null, 'guest18.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
          fr, fr, r_std, 'EUR', 'en', null, 70, null, null, false);
  insert into public.payments (order_id, provider, provider_checkout_id, status, amount, currency)
  values (o2.id, 'stripe', cs2, 'pending', o2.amount_due, o2.currency);
  update public.payments set status = 'cancelled', failure_reason = 'expired'
   where provider_checkout_id = cs2 and status = 'pending';
  o2 := public.cancel_order(o2.id, 'expired');
  o2 := public.cancel_order(o2.id, 'expired');
  select quantity_reserved into v_res from public.inventory_items where id = inv_gel;
  if o2.status <> 'cancelled' or o2.stock_state <> 'released' or v_res <> v_res0 then
    raise exception 'FAIL S8: expired order % (reserved %)', row_to_json(o2), v_res;
  end if;
  select state into v_state from public.checkout_session_status(cs2);
  if v_state <> 'cancelled' then raise exception 'FAIL S8: status page says %', v_state; end if;
  passed := passed || 'S8 expiry'::text;

  -- S9: the job itself cancels an abandoned order past its reservation ----------
  o2 := public.create_order(null, 'guest18b.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
          fr, fr, r_std, 'EUR', 'fr', null, 70, null, null, false);
  update public.orders set expires_at = now() - interval '1 minute' where id = o2.id;   -- owner: trusted backend
  perform public.expire_stale_orders();
  select * into o2 from public.orders where id = o2.id;
  select quantity_reserved into v_res from public.inventory_items where id = inv_gel;
  if o2.status <> 'cancelled' or o2.cancellation_reason <> 'expired' or v_res <> v_res0 then
    raise exception 'FAIL S9: abandoned order % (reserved %)', row_to_json(o2), v_res;
  end if;
  passed := passed || 'S9 expire_stale_orders'::text;

  raise exception 'ALL ITERATION 19 TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
