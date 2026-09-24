-- =============================================================================
-- Iteration 8 validation suite — back-office statistics.
-- =============================================================================
-- Orders are dated in March 2020 so that no real order falls in the period.
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 8 TESTS PASSED` (or `FAIL: ...`).
--
-- Period 2020-03-10..11 (Europe/Paris), previous period 2020-03-08..09:
--   A1 alice 03-09 12:00  gel 19                       (previous period)
--   A2 alice 03-10 12:00  premium kit 249 + gel 19     (returning order), shipped 6 h later
--   B1 bob   03-11 12:00  pliers 78, delivered in DE   (new customer)
--   GC alice 03-10 14:00  gift card 50                 (not revenue)
--   C  alice 03-10 created, unpaid                     (pending)
--   D  bob   03-11 created, cancelled
-- =============================================================================

do $$
declare
  vwr   uuid := '00000000-0000-4000-a000-000000080003';
  alice uuid := '00000000-0000-4000-a000-00000008a11c';
  bob   uuid := '00000000-0000-4000-a000-000000080b0b';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  de jsonb := '{"first_name":"Bob","last_name":"Test","address_line1":"1 Beispielstraße","postal_code":"10115","city":"Berlin","country_code":"DE"}';
  p_gel uuid; p_prem uuid; p_pince uuid; p_gc uuid; r_fr uuid; r_eu uuid;
  a1 public.orders; a2 public.orders; b1 public.orders; gc public.orders; oc public.orders; od public.orders;
  s jsonb; k jsonb; v_num numeric; v_txt text; v_state text;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (vwr,   'authenticated', 'authenticated', 'vwr8.test@example.invalid',   '{"first_name":"Val"}',   now(), now()),
    (alice, 'authenticated', 'authenticated', 'alice8.test@example.invalid', '{"first_name":"Alice"}', now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob8.test@example.invalid',   '{"first_name":"Bob"}',   now(), now());
  update public.profiles set role = 'viewer' where id = vwr;
  select id into p_gel   from public.products where slug = 'gel-de-suivi';
  select id into p_prem  from public.products where slug = 'kit-application-premium';
  select id into p_pince from public.products where slug = 'pince-de-depose';
  select id into p_gc    from public.products where slug = 'carte-cadeau';
  select r.id into r_fr from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  select r.id into r_eu from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'Union européenne' and r.kind = 'standard';

  a1 := public.create_order(alice, 'alice8.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_fr);
  a1 := public.mark_order_paid(a1.id, a1.amount_due, 'EUR', 'cs_it8_a1');
  a2 := public.create_order(alice, 'alice8.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_prem, 'quantity', 1),
                            jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_fr);
  a2 := public.mark_order_paid(a2.id, a2.amount_due, 'EUR', 'cs_it8_a2');
  b1 := public.create_order(bob, 'bob8.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_pince, 'quantity', 1)), de, de, r_eu);
  b1 := public.mark_order_paid(b1.id, b1.amount_due, 'EUR', 'cs_it8_b1');
  gc := public.create_order(alice, 'alice8.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gc, 'quantity', 1, 'amount', 50,
            'gift_card', jsonb_build_object('recipient_name', 'Bob', 'recipient_email', 'bob8.test@example.invalid',
                                            'sender_name', 'Alice', 'message', 'Hello'))), fr);
  gc := public.mark_order_paid(gc.id, gc.amount_due, 'EUR', 'cs_it8_gc');
  oc := public.create_order(alice, 'alice8.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_fr);
  od := public.create_order(bob, 'bob8.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), de, de, r_eu);
  perform public.cancel_order(od.id, 'test');

  update public.orders set created_at = '2020-03-09 11:00 Europe/Paris', paid_at = '2020-03-09 12:00 Europe/Paris' where id = a1.id;
  update public.orders set created_at = '2020-03-10 11:00 Europe/Paris', paid_at = '2020-03-10 12:00 Europe/Paris' where id = a2.id;
  update public.orders set created_at = '2020-03-11 11:00 Europe/Paris', paid_at = '2020-03-11 12:00 Europe/Paris' where id = b1.id;
  update public.orders set created_at = '2020-03-10 13:00 Europe/Paris', paid_at = '2020-03-10 14:00 Europe/Paris' where id = gc.id;
  update public.orders set created_at = '2020-03-10 15:00 Europe/Paris' where id = oc.id;
  update public.orders set created_at = '2020-03-11 15:00 Europe/Paris' where id = od.id;
  insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at)
  values (a2.id, 'shipped', 'Colissimo', '6A80000000001', '2020-03-10 18:00 Europe/Paris');
  select * into a2 from public.orders where id = a2.id;
  select * into b1 from public.orders where id = b1.id;

  -- ===========================================================================
  -- S1 who may read statistics
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.analytics_snapshot('2020-03-10', '2020-03-11');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S1: customer read statistics (%)', v_state; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.analytics_snapshot('2020-03-10', '2020-03-11');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S1: visitor read statistics (%)', v_state; end if;
  passed := array_append(passed, 'S1 view_statistics required (customers and visitors refused)');

  -- ===========================================================================
  -- S2 the snapshot, read by a read-only team member
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  s := public.analytics_snapshot('2020-03-10', '2020-03-11');

  if s ->> 'step' <> 'day' or (s ->> 'previousStart') <> '2020-03-08' or (s ->> 'previousEnd') <> '2020-03-09'
     or not (s ->> 'hasData')::boolean then
    raise exception 'FAIL S2: meta %', s - 'kpis' - 'series' - 'products' - 'customers' - 'orders' - 'geo';
  end if;

  select value into k from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'revenue';
  if (k ->> 'value')::numeric <> 346 or (k ->> 'previous')::numeric <> 19 or (k ->> 'change')::numeric <> 1721.1
     or k ->> 'trend' <> 'up' or not (k ->> 'lead')::boolean
     or k -> 'spark' <> '[0, 0, 0, 268.00, 0, 0, 0, 0, 0, 78.00, 0, 0]'::jsonb then
    raise exception 'FAIL S2: revenue %', k;
  end if;
  select value into k from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'orders';
  if (k ->> 'value')::numeric <> 2 or (k ->> 'previous')::numeric <> 1 then raise exception 'FAIL S2: orders %', k; end if;
  select value into k from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'aov';
  if (k ->> 'value')::numeric <> 173 or (k ->> 'previous')::numeric <> 19 then raise exception 'FAIL S2: aov %', k; end if;
  select value into k from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'units';
  if (k ->> 'value')::numeric <> 3 then raise exception 'FAIL S2: units %', k; end if;
  select value into k from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'newCustomers';
  if (k ->> 'value')::numeric <> 1 or (k ->> 'previous')::numeric <> 1 or k ->> 'trend' <> 'flat' then
    raise exception 'FAIL S2: new customers %', k;
  end if;
  select value into k from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'returningCustomers';
  if (k ->> 'value')::numeric <> 1 then raise exception 'FAIL S2: returning customers %', k; end if;
  passed := array_append(passed, 'S2 KPIs: merchandise revenue (gift cards, shipping excluded), orders, AOV, units, new/returning, change vs previous period, sparkline');

  if s -> 'series' <> '[{"key": "2020-03-10T00:00:00", "orders": 1, "revenue": 268.00, "previousOrders": 0, "previousRevenue": 0},
                        {"key": "2020-03-11T00:00:00", "orders": 1, "revenue": 78.00, "previousOrders": 1, "previousRevenue": 19.00}]'::jsonb then
    raise exception 'FAIL S3: series %', s -> 'series';
  end if;
  if s -> 'breakdown' <> '[{"id": "jewelry", "share": 0, "orders": 0, "revenue": 0},
                           {"id": "aftercare", "share": 5.5, "orders": 1, "revenue": 19.00},
                           {"id": "kits", "share": 94.5, "orders": 2, "revenue": 327.00},
                           {"id": "training", "share": 0, "orders": 0, "revenue": 0},
                           {"id": "other", "share": 0, "orders": 0, "revenue": 0}]'::jsonb then
    raise exception 'FAIL S3: breakdown %', s -> 'breakdown';
  end if;
  select string_agg((value ->> 'slug') || ':' || (value ->> 'revenue') || ':' || coalesce(value ->> 'change', 'null'), ', ')
    into v_txt from jsonb_array_elements(s -> 'products');
  if v_txt <> 'kit-application-premium:249.00:null, pince-de-depose:78.00:null, gel-de-suivi:19.00:0.0' then
    raise exception 'FAIL S3: products %', v_txt;
  end if;
  passed := array_append(passed, 'S3 series with the previous period aligned, breakdown summing to revenue (fixed order), best sellers with change');

  if (s #>> '{customers,total}')::int <> 2 or (s #>> '{customers,new}')::int <> 1 or (s #>> '{customers,returning}')::int <> 1
     or (s #>> '{customers,repeatRate}')::numeric <> 50 or (s #>> '{customers,lifetimeValue}')::numeric <> 182.5
     or (s #>> '{customers,lifetimeOrders}')::numeric <> 1.5
     or s #> '{customers,growth}' <> '[{"key": "2020-03-10T00:00:00", "added": 0, "total": 1},
                                        {"key": "2020-03-11T00:00:00", "added": 1, "total": 2}]'::jsonb then
    raise exception 'FAIL S4: customers %', s -> 'customers';
  end if;
  if (s #>> '{orders,total}')::int <> 5 or (s #>> '{orders,cancellationRate}')::numeric <> 20
     or (s #>> '{orders,refundRate}')::numeric <> 0 or (s #>> '{orders,processingHours}')::numeric <> 6
     or s #> '{orders,statuses}' <> '[{"id": "completed", "share": 60.0, "orders": 3}, {"id": "pending", "share": 20.0, "orders": 1},
                                       {"id": "cancelled", "share": 20.0, "orders": 1}, {"id": "refunded", "share": 0, "orders": 0}]'::jsonb then
    raise exception 'FAIL S4: orders %', s -> 'orders';
  end if;
  if s -> 'geo' <> '[{"id": "FR", "share": 77.5, "orders": 1, "revenue": 268.00, "customers": 1},
                     {"id": "DE", "share": 22.5, "orders": 1, "revenue": 78.00, "customers": 1}]'::jsonb then
    raise exception 'FAIL S4: geo %', s -> 'geo';
  end if;
  if (s #>> '{extras,giftCardsSold}')::numeric <> 50
     or (s #>> '{extras,shippingRevenue}')::numeric <> a2.shipping_amount + b1.shipping_amount
     or (s #>> '{extras,refunds}')::numeric <> 0 then
    raise exception 'FAIL S4: extras %', s -> 'extras';
  end if;
  passed := array_append(passed, 'S4 customers (base, repeat rate, lifetime value, growth), orders placed (statuses, rates, processing time), geography, extras');

  -- ===========================================================================
  -- S5 filters and periods
  -- ===========================================================================
  foreach v_txt in array array['{"country": "DE"}|78', '{"customerType": "new"}|78', '{"customerType": "returning"}|268',
                               '{"category": "aftercare"}|19'] loop
    s := public.analytics_snapshot('2020-03-10', '2020-03-11', split_part(v_txt, '|', 1)::jsonb);
    select (value ->> 'value')::numeric into v_num from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'revenue';
    if v_num <> split_part(v_txt, '|', 2)::numeric then raise exception 'FAIL S5: % gives %', v_txt, v_num; end if;
  end loop;
  s := public.analytics_snapshot('2020-03-10', '2020-03-11', jsonb_build_object('product', p_pince));
  select (value ->> 'value')::numeric into v_num from jsonb_array_elements(s -> 'kpis') where value ->> 'id' = 'revenue';
  if v_num <> 78 then raise exception 'FAIL S5: product filter %', v_num; end if;
  s := public.analytics_snapshot('2020-03-10', '2020-03-11', '{"orderStatus": "pending"}');
  if (s #>> '{orders,total}')::int <> 1 then raise exception 'FAIL S5: order status filter %', s -> 'orders'; end if;

  s := public.analytics_snapshot('2020-03-10', '2020-03-10');
  if s ->> 'step' <> 'hour' or jsonb_array_length(s -> 'series') <> 24 then
    raise exception 'FAIL S5: one day = 24 hourly buckets (%, %)', s ->> 'step', jsonb_array_length(s -> 'series');
  end if;
  select sum((value ->> 'revenue')::numeric) into v_num from jsonb_array_elements(s -> 'series');
  if v_num <> 268 then raise exception 'FAIL S5: hourly series sums to %', v_num; end if;
  s := public.analytics_snapshot('2020-01-01', '2020-06-30');
  if s ->> 'step' <> 'month' then raise exception 'FAIL S5: long period step %', s ->> 'step'; end if;
  s := public.analytics_snapshot('2019-01-01', '2019-01-31');
  if (s ->> 'hasData')::boolean then raise exception 'FAIL S5: empty period has data'; end if;

  foreach v_txt in array array[
    'select public.analytics_snapshot(''2020-03-11'', ''2020-03-10'')',
    'select public.analytics_snapshot(''2020-01-01'', ''2021-03-01'')',
    'select public.analytics_snapshot(''2020-03-10'', ''2020-03-11'', ''{}'', ''EUR'', ''Mars/Olympus'')',
    'select public.analytics_snapshot(''2020-03-10'', ''2020-03-11'', ''{"foo": 1}'')',
    'select public.analytics_snapshot(''2020-03-10'', ''2020-03-11'', ''{"category": "toys"}'')'] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL S5: accepted % (%)', v_txt, v_state; end if;
  end loop;
  passed := array_append(passed, 'S5 filters (country, customer type, category, product, order status), hour/day/month steps, empty periods, validation');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 8 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
