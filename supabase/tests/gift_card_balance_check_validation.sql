-- =============================================================================
-- Gift card balance check (check_gift_card_balance, check_gift_card_balance_for_visitor,
-- gift_card_balance_ip_allowed; decision 140) — validation suite.
-- =============================================================================
-- Requires all migrations (including 20261113111051_gift_card_balance_check) + seed.sql.
-- ONE transaction, ALWAYS rolled back by raising `ALL GIFT CARD BALANCE CHECK TESTS PASSED`
-- (or `FAIL: ...`).
--
--   GB1 a member reads an active card: status, available amount, currency, expiry, last 4 — nothing else
--   GB2 spaces, case and missing dashes do not matter
--   GB3 used up, expired, cancelled: their own status (real codes, not counted as refusals)
--   GB4 unknown, malformed, pending, void and not-yet-delivered codes: the same found=false answer
--   GB5 an amount held by an unpaid order counts as available
--   GB6 refusals are throttled per account (10 / 10 min), shared with quote_gift_cards();
--       another member and a visitor keep their own budget
--   GB7 visitors: the service-role wrapper is keyed by the address hash, refuses a malformed hash,
--       throttles refusals per hash; the per-address lookup limit stops at 20 / hour
--   GB8 a visitor (anon) cannot call any of the three functions; a member cannot call the
--       service-role ones; nobody reads the code or the throttle table through the API
-- =============================================================================

do $$
declare
  fr jsonb := '{"first_name":"Ana","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  alice uuid := 'b1a1ce00-0000-4000-8000-0000000000b1';
  bruno uuid := 'b1a1ce00-0000-4000-8000-0000000000b2';
  p_gel uuid; v_gel uuid; r_std uuid; line jsonb;
  c40 uuid; c_exp uuid; c_can uuid; c_later uuid; c_empty uuid; c_pend uuid; c_void uuid; c_held uuid;
  k40 text; k_exp text; k_can text; k_later text; k_empty text; k_pend text; k_void text; k_held text;
  ip_a text := encode(extensions.digest('203.0.113.7', 'sha256'), 'hex');
  ip_b text := encode(extensions.digest('198.51.100.9', 'sha256'), 'hex');
  r jsonb; ref jsonb; i int; ok boolean;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (alice, 'authenticated', 'authenticated', 'alice.gb@example.invalid', '{"first_name":"Alice"}', now(), now()),
    (bruno, 'authenticated', 'authenticated', 'bruno.gb@example.invalid', '{"first_name":"Bruno"}', now(), now());

  select id into p_gel from public.products where slug = 'gel-de-suivi';
  -- Outside seed.sql (a suite run on the project): any active product in stock.
  if p_gel is null then
    select p.id, v.id into p_gel, v_gel from public.products p
      join public.product_variants v on v.product_id = p.id
      join public.inventory_items i on i.variant_id = v.id
     where p.status = 'active' and p.product_type = 'physical' and i.stock_status = 'in_stock'
     order by p.price desc limit 1;
  end if;
  line := jsonb_build_object('product_id', p_gel, 'quantity', 1)
          || case when v_gel is null then '{}'::jsonb else jsonb_build_object('variant_id', v_gel) end;
  select r2.id into r_std from public.shipping_rates r2 join public.shipping_zones z on z.id = r2.zone_id
   where z.name = 'France' and r2.kind = 'standard';

  -- Fixtures, as the backend --------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  c40 := public.issue_gift_card(40, 'gb40@example.invalid');
  c_exp := public.issue_gift_card(30, 'gbexp@example.invalid');
  c_can := public.issue_gift_card(30, 'gbcan@example.invalid');
  perform public.cancel_gift_card(c_can, 'Test');
  c_later := public.issue_gift_card(30, 'gblater@example.invalid');
  c_empty := public.issue_gift_card(30, 'gbempty@example.invalid');
  c_pend := public.issue_gift_card(30, 'gbpend@example.invalid');
  c_void := public.issue_gift_card(30, 'gbvoid@example.invalid');
  c_held := public.issue_gift_card(10, 'gbheld@example.invalid');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.gift_cards set expires_at = now() - interval '1 day' where id = c_exp;
  update public.gift_cards set deliver_at = now() + interval '3 days' where id = c_later;
  update public.gift_cards set state = 'pending' where id = c_pend;
  update public.gift_cards set state = 'void' where id = c_void;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note) values (c_empty, 'adjustment', -30, 'Test');
  select code into k40 from public.gift_cards where id = c40;
  select code into k_exp from public.gift_cards where id = c_exp;
  select code into k_can from public.gift_cards where id = c_can;
  select code into k_later from public.gift_cards where id = c_later;
  select code into k_empty from public.gift_cards where id = c_empty;
  select code into k_pend from public.gift_cards where id = c_pend;
  select code into k_void from public.gift_cards where id = c_void;
  select code into k_held from public.gift_cards where id = c_held;

  -- An unpaid order holds the whole of the 10 € card.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  perform public.create_order(p_user_id => null, p_customer_email => 'gbheld@example.invalid',
         p_items => jsonb_build_array(line),
         p_billing_address => fr, p_shipping_address => fr, p_shipping_rate_id => r_std,
         p_gift_card_codes => array[k_held]);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if (select balance from public.gift_cards where id = c_held) <> 0 then
    raise exception 'FAIL fixture: the unpaid order does not hold the whole card';
  end if;

  -- As Alice ------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- GB1
  r := public.check_gift_card_balance(k40);
  if r ->> 'ok' <> 'true' or r ->> 'found' <> 'true'
     or r -> 'card' ->> 'status' <> 'active'
     or (r -> 'card' ->> 'balance')::numeric <> 40
     or r -> 'card' ->> 'currency' <> 'EUR'
     or r -> 'card' ->> 'last4' <> right(k40, 4)
     or not (r -> 'card' ? 'expires_at') then
    raise exception 'FAIL GB1: %', r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['card', 'found', 'ok']
     or (select array_agg(k order by k) from jsonb_object_keys(r -> 'card') k)
        <> array['balance', 'currency', 'expires_at', 'last4', 'status'] then
    raise exception 'FAIL GB1 unexpected keys: %', r;
  end if;
  if r::text like '%' || k40 || '%' then raise exception 'FAIL GB1: the answer carries the code'; end if;

  -- GB2
  r := public.check_gift_card_balance('  ' || lower(replace(k40, '-', '')) || ' ');
  if r -> 'card' ->> 'status' <> 'active' then raise exception 'FAIL GB2 no dashes: %', r; end if;
  r := public.check_gift_card_balance(lower(k40));
  if r -> 'card' ->> 'status' <> 'active' then raise exception 'FAIL GB2 lower case: %', r; end if;

  -- GB3
  r := public.check_gift_card_balance(k_empty);
  if r -> 'card' ->> 'status' <> 'used_up' or (r -> 'card' ->> 'balance')::numeric <> 0 then raise exception 'FAIL GB3 used up: %', r; end if;
  r := public.check_gift_card_balance(k_exp);
  if r -> 'card' ->> 'status' <> 'expired' then raise exception 'FAIL GB3 expired: %', r; end if;
  r := public.check_gift_card_balance(k_can);
  if r -> 'card' ->> 'status' <> 'cancelled' or (r -> 'card' ->> 'balance')::numeric <> 0 then raise exception 'FAIL GB3 cancelled: %', r; end if;
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.gift_card_code_attempts where actor = 'user:' || alice) <> 3 then
    raise exception 'FAIL GB3: spent / expired / cancelled codes must count as refusals, like the cart';
  end if;
  perform set_config('role', 'authenticated', true);

  -- GB5
  r := public.check_gift_card_balance(k_held);
  if r -> 'card' ->> 'status' <> 'active' or (r -> 'card' ->> 'balance')::numeric <> 10 then raise exception 'FAIL GB5: %', r; end if;

  -- GB4: five refusals, one answer
  ref := jsonb_build_object('ok', true, 'found', false);
  foreach k_later in array array[k_later, k_pend, k_void, 'GT-ZZZZ-ZZZZ-ZZZZ', 'not a code'] loop
    r := public.check_gift_card_balance(k_later);
    if r <> ref then raise exception 'FAIL GB4 % answered %', k_later, r; end if;
  end loop;
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.gift_card_code_attempts where actor = 'user:' || alice) <> 8 then
    raise exception 'FAIL GB4: refusals not counted';
  end if;
  perform set_config('role', 'authenticated', true);

  -- GB6: 1 more refusal here (9), 1 through the cart's quote (10, shared counter) → limit reached
  for i in 1..1 loop
    r := public.check_gift_card_balance('GT-ZZZZ-ZZZZ-ZZZ' || i + 1);
    if r <> ref then raise exception 'FAIL GB6 early throttle at %: %', i, r; end if;
  end loop;
  r := public.quote_gift_cards(array['GT-YYYY-YYYY-YYYY'], 50, 'EUR');
  if r ->> 'ok' <> 'true' then raise exception 'FAIL GB6 quote: %', r; end if;
  r := public.check_gift_card_balance(k40);
  if r ->> 'ok' <> 'false' or r ->> 'error' <> 'too_many_attempts' or r ? 'card' then
    raise exception 'FAIL GB6 throttle: %', r;
  end if;

  -- Another member keeps their own budget.
  perform set_config('request.jwt.claims', json_build_object('sub', bruno, 'role', 'authenticated')::text, true);
  r := public.check_gift_card_balance(k40);
  if r -> 'card' ->> 'status' <> 'active' then raise exception 'FAIL GB6 other member: %', r; end if;

  -- GB8 (members): the service-role functions are refused.
  begin
    perform public.check_gift_card_balance_for_visitor(k40, ip_a);
    raise exception 'FAIL GB8: a member called the visitor wrapper';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gift_card_balance_ip_allowed(ip_a);
    raise exception 'FAIL GB8: a member called the address throttle';
  exception when insufficient_privilege then null;
  end;
  begin
    perform code from public.gift_cards limit 1;
    raise exception 'FAIL GB8: a member read gift card codes';
  exception when insufficient_privilege then null;
  end;

  -- GB8 (visitors) ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform public.check_gift_card_balance(k40);
    raise exception 'FAIL GB8: a visitor called the member check';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.check_gift_card_balance_for_visitor(k40, ip_a);
    raise exception 'FAIL GB8: a visitor called the visitor wrapper directly (captcha bypass)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gift_card_balance_ip_allowed(ip_a);
    raise exception 'FAIL GB8: a visitor called the address throttle';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.gift_card_code_attempts limit 1;
    raise exception 'FAIL GB8: a visitor read the throttle table';
  exception when insufficient_privilege then null;
  end;

  -- GB7: the Edge Function, as the service role ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  r := public.check_gift_card_balance_for_visitor(k40, ip_a);
  if r -> 'card' ->> 'status' <> 'active' or (r -> 'card' ->> 'balance')::numeric <> 40 then raise exception 'FAIL GB7 visitor: %', r; end if;
  r := public.check_gift_card_balance_for_visitor(k40, '203.0.113.7');
  if r ->> 'error' <> 'unavailable' then raise exception 'FAIL GB7 raw address accepted: %', r; end if;
  r := public.check_gift_card_balance_for_visitor(k40, null);
  if r ->> 'error' <> 'unavailable' then raise exception 'FAIL GB7 no address accepted: %', r; end if;
  for i in 1..10 loop
    r := public.check_gift_card_balance_for_visitor('GT-XXXX-XXXX-XX' || lpad(i::text, 2, '2'), ip_a);
    if r <> ref then raise exception 'FAIL GB7 refusal %: %', i, r; end if;
  end loop;
  r := public.check_gift_card_balance_for_visitor(k40, ip_a);
  if r ->> 'error' <> 'too_many_attempts' then raise exception 'FAIL GB7 visitor throttle: %', r; end if;
  r := public.check_gift_card_balance_for_visitor(k40, ip_b);
  if r -> 'card' ->> 'status' <> 'active' then raise exception 'FAIL GB7 other address: %', r; end if;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.gift_card_code_attempts where actor like '%203.0.113.7%') then
    raise exception 'FAIL GB7: a raw address was stored';
  end if;
  perform set_config('role', 'service_role', true);

  for i in 1..20 loop
    ok := public.gift_card_balance_ip_allowed(ip_b);
    if not ok then raise exception 'FAIL GB7 lookup limit early at %', i; end if;
  end loop;
  if public.gift_card_balance_ip_allowed(ip_b) then raise exception 'FAIL GB7: 21st lookup allowed'; end if;
  if not public.gift_card_balance_ip_allowed(ip_a) then raise exception 'FAIL GB7: limit shared between addresses'; end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  raise exception 'ALL GIFT CARD BALANCE CHECK TESTS PASSED';
end;
$$;
