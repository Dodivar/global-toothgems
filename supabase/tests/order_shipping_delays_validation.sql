-- =============================================================================
-- Order shipping delays validation suite (migration 20261022113049_order_shipping_delays)
-- =============================================================================
-- Proves:
--
--   * an order naming a shipping rate keeps that rate's min/max working days;
--   * editing or deleting the rate afterwards changes nothing on the order;
--   * an order without a rate keeps no delay;
--   * the delays are both set or both null, never negative, max >= min;
--   * a customer cannot change the delays of their own order, nor read
--     another customer's.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL ORDER SHIPPING DELAYS TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1     uuid := gen_random_uuid();
  m2     uuid := gen_random_uuid();
  addr   jsonb := '{"first_name":"T","last_name":"T","address_line1":"1 rue","postal_code":"75001","city":"Paris","country_code":"FR"}';
  z      uuid;
  r      uuid;
  o1     uuid;
  o2     uuid;
  v_min  int;
  v_max  int;
  v_cnt  int;
  v_ok   boolean;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'shipdelay-a.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'shipdelay-b.test@example.invalid', now(), now());

  insert into public.shipping_zones (name) values ('SD test zone') returning id into z;
  insert into public.shipping_rates (zone_id, kind, name, min_days, max_days, price)
  values (z, 'standard', 'SD Colissimo', 2, 4, 6.90) returning id into r;

  -- 1. The rate's delays are copied onto the order at insert.
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount,
                             shipping_rate_id, shipping_method_name)
  values (m1, 'shipdelay-a.test@example.invalid', addr, addr, 'EUR', 20, 0, 6.90, 4.48, 26.90, r, 'SD Colissimo')
  returning id into o1;
  select shipping_min_days, shipping_max_days into v_min, v_max from public.orders where id = o1;
  if v_min is distinct from 2 or v_max is distinct from 4 then
    raise exception 'FAIL 1: delays not copied (% / %)', v_min, v_max;
  end if;
  passed := passed || 'copied at insert';

  -- 2. A later edit, then the deletion, of the rate leave the order's promise as it was.
  update public.shipping_rates set min_days = 5, max_days = 9 where id = r;
  select shipping_min_days, shipping_max_days into v_min, v_max from public.orders where id = o1;
  if v_min <> 2 or v_max <> 4 then raise exception 'FAIL 2a: rate edit changed the order'; end if;
  delete from public.shipping_rates where id = r;
  select shipping_min_days, shipping_max_days into v_min, v_max from public.orders where id = o1;
  if v_min is distinct from 2 or v_max is distinct from 4 then raise exception 'FAIL 2b: rate deletion changed the order'; end if;
  passed := passed || 'kept after rate edit and deletion';

  -- 3. No rate (course or gift card only): no delay.
  insert into public.orders (user_id, customer_email, billing_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount)
  values (m2, 'shipdelay-b.test@example.invalid', addr, 'EUR', 50, 0, 0, 8.33, 50)
  returning id into o2;
  if exists (select 1 from public.orders where id = o2 and (shipping_min_days is not null or shipping_max_days is not null)) then
    raise exception 'FAIL 3: an order without rate got delays';
  end if;
  passed := passed || 'none without rate';

  -- 4. The check constraint.
  begin
    update public.orders set shipping_min_days = 3, shipping_max_days = null where id = o2;
    raise exception 'FAIL 4a: half a delay accepted';
  exception when check_violation then null;
  end;
  begin
    update public.orders set shipping_min_days = 5, shipping_max_days = 2 where id = o2;
    raise exception 'FAIL 4b: max below min accepted';
  exception when check_violation then null;
  end;
  begin
    update public.orders set shipping_min_days = -1, shipping_max_days = 2 where id = o2;
    raise exception 'FAIL 4c: negative delay accepted';
  exception when check_violation then null;
  end;
  passed := passed || 'constraint';

  -- 5. A customer: their own delays read, not changed; another customer's order not read.
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select shipping_max_days into v_max from public.orders where id = o1;
  if v_max is distinct from 4 then raise exception 'FAIL 5a: owner cannot read the delay'; end if;
  begin
    update public.orders set shipping_max_days = 30 where id = o1;
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_cnt from public.orders where id = o2;
  if v_cnt <> 0 then raise exception 'FAIL 5c: another customer''s order is readable'; end if;
  reset role;
  select shipping_max_days = 4 into v_ok from public.orders where id = o1;
  if not v_ok then raise exception 'FAIL 5b: the customer changed the promised delay'; end if;
  passed := passed || 'customer cannot change or read others';

  raise exception 'ALL ORDER SHIPPING DELAYS TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
