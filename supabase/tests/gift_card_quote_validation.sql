-- =============================================================================
-- Gift card preview in the cart (quote_gift_cards) — validation suite.
-- =============================================================================
-- Requires all migrations (including 20261011171901_quote_gift_cards) + seed.sql.
-- ONE transaction, ALWAYS rolled back by raising `ALL GIFT CARD QUOTE TESTS PASSED`
-- (or `FAIL: ...`).
--
--   GQ1 a usable card applies its balance, capped at the amount asked
--   GQ2 several cards add up; duplicates (case, spaces) count once
--   GQ3 unknown, expired, cancelled, not yet delivered, wrong currency, empty: refused, same answer
--   GQ4 an amount held by an unpaid order counts as available (the checkout releases it)
--   GQ5 the answer never carries a balance, an expiry or an order
--   GQ6 refused codes are throttled per caller (10 per 10 minutes); valid codes are not counted
--   GQ7 malformed calls: more than 5 codes, negative amount
--   GQ8 visitors cannot read the throttle table
-- =============================================================================

-- This suite checks the standard VAT regime: the franchise (decision 114) is
-- switched off for its transaction.
update public.store_settings set vat_franchise = false where id;

do $$
declare
  fr jsonb := '{"first_name":"Ana","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gel uuid; r_std uuid;
  o public.orders;
  c40 uuid; c25 uuid; c_exp uuid; c_can uuid; c_later uuid; c_usd uuid; c_empty uuid; c_held uuid;
  k40 text; k25 text; k_exp text; k_can text; k_later text; k_usd text; k_empty text; k_held text;
  r jsonb; i int; v_cnt int;
begin
  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select r2.id into r_std from public.shipping_rates r2 join public.shipping_zones z on z.id = r2.zone_id
   where z.name = 'France' and r2.kind = 'standard';

  -- Fixtures, as the backend --------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  c40 := public.issue_gift_card(40, 'gq40@example.invalid');
  c25 := public.issue_gift_card(25, 'gq25@example.invalid');
  c_exp := public.issue_gift_card(30, 'gqexp@example.invalid');
  c_can := public.issue_gift_card(30, 'gqcan@example.invalid');
  perform public.cancel_gift_card(c_can, 'Test');
  c_later := public.issue_gift_card(30, 'gqlater@example.invalid');
  c_usd := public.issue_gift_card(30, 'gqusd@example.invalid');
  c_empty := public.issue_gift_card(30, 'gqempty@example.invalid');
  c_held := public.issue_gift_card(10, 'gqheld@example.invalid');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.gift_cards set expires_at = now() - interval '1 day' where id = c_exp;
  update public.gift_cards set deliver_at = now() + interval '3 days' where id = c_later;
  update public.gift_cards set currency = 'USD' where id = c_usd;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note) values (c_empty, 'adjustment', -30, 'Test');
  select code into k40 from public.gift_cards where id = c40;
  select code into k25 from public.gift_cards where id = c25;
  select code into k_exp from public.gift_cards where id = c_exp;
  select code into k_can from public.gift_cards where id = c_can;
  select code into k_later from public.gift_cards where id = c_later;
  select code into k_usd from public.gift_cards where id = c_usd;
  select code into k_empty from public.gift_cards where id = c_empty;
  select code into k_held from public.gift_cards where id = c_held;

  -- An unpaid order holds the whole of a 10 € card (the rest goes to the card payment the customer left).
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  o := public.create_order(p_user_id => null, p_customer_email => 'gqheld@example.invalid',
         p_items => jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
         p_billing_address => fr, p_shipping_address => fr, p_shipping_rate_id => r_std,
         p_gift_card_codes => array[k_held]);
  perform set_config('role', 'postgres', true);
  if (select balance from public.gift_cards where id = c_held) <> 0 then
    raise exception 'FAIL fixture: the unpaid order does not hold the whole card';
  end if;

  -- As a visitor -------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.headers', json_build_object('sb-forwarded-for', '203.0.113.7')::text, true);
  perform set_config('role', 'anon', true);

  -- GQ1
  r := public.quote_gift_cards(array[k40], 100, 'EUR');
  if r ->> 'ok' <> 'true' or (r ->> 'applied')::numeric <> 40 or jsonb_array_length(r -> 'refused') <> 0 then
    raise exception 'FAIL GQ1 full balance: %', r;
  end if;
  r := public.quote_gift_cards(array[k40], 12.5, 'EUR');
  if (r ->> 'applied')::numeric <> 12.5 then raise exception 'FAIL GQ1 cap: %', r; end if;

  -- GQ2
  r := public.quote_gift_cards(array[k40, lower(k25), ' ' || k40 || ' '], 1000, 'EUR');
  if (r ->> 'applied')::numeric <> 65 then raise exception 'FAIL GQ2: %', r; end if;

  -- GQ3
  r := public.quote_gift_cards(array[k40, k_exp, k_can, k_later, k_usd, k_empty, 'GT-ZZZZ-ZZZZ-ZZZZ'], 1000, 'EUR');
  if r ->> 'ok' <> 'false' or r ->> 'error' <> 'unavailable' then raise exception 'FAIL GQ7 >5 codes: %', r; end if;
  r := public.quote_gift_cards(array[k_exp, k_can, k_later, k_usd, k_empty], 1000, 'EUR');
  if (r ->> 'applied')::numeric <> 0 or jsonb_array_length(r -> 'refused') <> 5 then
    raise exception 'FAIL GQ3: %', r;
  end if;

  -- GQ4
  r := public.quote_gift_cards(array[k_held], 1000, 'EUR');
  if (r ->> 'applied')::numeric <> 10 then raise exception 'FAIL GQ4: %', r; end if;

  -- GQ5
  if exists (select 1 from jsonb_object_keys(r) k where k not in ('ok', 'applied', 'refused')) then
    raise exception 'FAIL GQ5: unexpected keys %', r;
  end if;

  -- GQ7
  r := public.quote_gift_cards(array[k40], -1, 'EUR');
  if r ->> 'error' <> 'unavailable' then raise exception 'FAIL GQ7 negative: %', r; end if;

  -- GQ6: 5 refusals so far for this address; 5 more reach the limit, then every call is refused.
  for i in 1..5 loop
    r := public.quote_gift_cards(array['GT-ZZZZ-ZZZZ-ZZ' || lpad(i::text, 2, '0')], 100, 'EUR');
    if r ->> 'ok' <> 'true' then raise exception 'FAIL GQ6 early throttle at %: %', i, r; end if;
  end loop;
  r := public.quote_gift_cards(array[k40], 100, 'EUR');
  if r ->> 'error' <> 'too_many_attempts' then raise exception 'FAIL GQ6 throttle: %', r; end if;
  -- Another address is not affected.
  perform set_config('request.headers', json_build_object('sb-forwarded-for', '198.51.100.9')::text, true);
  r := public.quote_gift_cards(array[k40], 100, 'EUR');
  if (r ->> 'applied')::numeric <> 40 then raise exception 'FAIL GQ6 other caller: %', r; end if;

  -- GQ8
  begin
    select count(*) into v_cnt from public.gift_card_code_attempts;
    raise exception 'FAIL GQ8: visitors read the throttle';
  exception when insufficient_privilege then null;
  end;

  raise exception 'ALL GIFT CARD QUOTE TESTS PASSED';
end;
$$;
