-- =============================================================================
-- Omnibus price reference validation suite (migration 20261109190153_omnibus_price_reference)
-- =============================================================================
-- Proves:
--
--   OM1 triggers write the list price history: a product, a variant inheriting
--       its price, a variant with its own, a course; a price change closes the
--       open segment, an unchanged save writes nothing;
--   OM2 nobody writes the history through the API (visitor, customer, manager:
--       42501), customers and visitors read nothing, staff read it;
--   OM3 no struck-out price can be imposed: compare_at_price is refused for
--       every role (direct write and admin_save_product);
--   OM4 the reference price: plain reduction, a lower price (cut included) in the
--       30 days before, successive reductions (series start), an item listed
--       less than 30 days ago, no history before the series, currency, a price
--       raised just before a cut, no cut at all;
--   OM5 promotion triggers: only an unconditional automatic percentage promotion
--       on chosen products records a cut; pausing it forgets a cut that never
--       took effect; course promotions record theirs;
--   OM6 readers: storefront_price_references() for visitors (active items with a
--       running cut only), admin_price_references() for manage_products only.
--
-- Fabricated past segments are inserted as the database owner (the API cannot)
-- and read with an explicit instant, so the suite needs no clock travel and holds
-- on any catalogue (it creates its own products and course).
--
-- ONE transaction, ALWAYS rolled back by raising `ALL OMNIBUS PRICE REFERENCE TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  cust   uuid := '00000000-0000-4000-a000-000000412901';
  viewer uuid := '00000000-0000-4000-a000-000000412902';
  mgr    uuid := '00000000-0000-4000-a000-000000412903';
  t      timestamptz := now();
  p_a    uuid;
  p_b    uuid;
  v_own  uuid;
  v_inh  uuid;
  c_one  uuid;
  promo  uuid;
  r      record;
  v_cnt  int;
  v_num  numeric;
  v_state text;
  v_cat  uuid;
  passed text[] := '{}';
begin
  select id into v_cat from public.categories order by position, slug limit 1;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (cust, 'authenticated', 'authenticated', 'om-customer.test@example.invalid', now(), now()),
         (viewer, 'authenticated', 'authenticated', 'om-viewer.test@example.invalid', now(), now()),
         (mgr, 'authenticated', 'authenticated', 'om-manager.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer' where id = viewer;
  update public.profiles set role = 'manager' where id = mgr;

  -- OM1: triggers ----------------------------------------------------------------
  insert into public.products (category_id, name, slug, price, currency, status, product_type)
  values (v_cat, 'Omnibus A', 'om-test-a', 20, 'EUR', 'active', 'physical') returning id into p_a;
  insert into public.product_variants (product_id, name, price) values (p_a, 'Hérité', null) returning id into v_inh;
  insert into public.product_variants (product_id, name, price) values (p_a, 'Propre', 25) returning id into v_own;

  select count(*) into v_cnt from public.price_history where product_id = p_a and variant_id is null and valid_to is null and price = 20;
  if v_cnt <> 1 then raise exception 'FAIL OM1: product row missing'; end if;
  select price into v_num from public.price_history where variant_id = v_inh and valid_to is null;
  if v_num is distinct from 20.00 then raise exception 'FAIL OM1: inheriting variant recorded %', v_num; end if;
  select price into v_num from public.price_history where variant_id = v_own and valid_to is null;
  if v_num is distinct from 25.00 then raise exception 'FAIL OM1: own-price variant recorded %', v_num; end if;

  -- Same transaction: the open row is corrected in place (it never applied alone).
  update public.products set price = 22 where id = p_a;
  select count(*) into v_cnt from public.price_history where product_id = p_a and variant_id is null;
  if v_cnt <> 1 then raise exception 'FAIL OM1: same-transaction change left % rows', v_cnt; end if;
  select price into v_num from public.price_history where variant_id = v_inh and valid_to is null;
  if v_num is distinct from 22.00 then raise exception 'FAIL OM1: inheriting variant did not follow (%)', v_num; end if;
  select price into v_num from public.price_history where variant_id = v_own and valid_to is null;
  if v_num is distinct from 25.00 then raise exception 'FAIL OM1: own-price variant moved (%)', v_num; end if;

  -- A segment opened earlier is closed now and a new one opened.
  update public.price_history set valid_from = t - interval '5 days' where product_id = p_a and variant_id is null;
  update public.products set price = 19 where id = p_a;
  select count(*) into v_cnt from public.price_history where product_id = p_a and variant_id is null;
  if v_cnt <> 2 then raise exception 'FAIL OM1: price change gave % rows', v_cnt; end if;
  select count(*) into v_cnt from public.price_history
   where product_id = p_a and variant_id is null and price = 22 and valid_to = t;
  if v_cnt <> 1 then raise exception 'FAIL OM1: previous segment not closed now'; end if;
  update public.products set price = 19, name = 'Omnibus A bis' where id = p_a;
  select count(*) into v_cnt from public.price_history where product_id = p_a and variant_id is null;
  if v_cnt <> 2 then raise exception 'FAIL OM1: unchanged price wrote a row'; end if;

  insert into public.courses (slug, title, price, currency) values ('om-test-course', 'Cours OM', 100, 'EUR') returning id into c_one;
  select count(*) into v_cnt from public.price_history where course_id = c_one and price = 100 and valid_to is null;
  if v_cnt <> 1 then raise exception 'FAIL OM1: course row missing'; end if;
  passed := passed || 'OM1'::text;

  -- OM2: no API write, no public read -------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_state := null;
  begin
    insert into public.price_history (product_id, price, currency, valid_from) values (p_a, 1, 'EUR', t - interval '90 days');
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '42501' then raise exception 'FAIL OM2: a visitor wrote the history (%)', v_state; end if;
  v_state := null;
  begin
    select count(*) into v_cnt from public.price_history;
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '42501' then raise exception 'FAIL OM2: a visitor read the history (%)', v_state; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', cust, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.price_history;
  if v_cnt <> 0 then raise exception 'FAIL OM2: a customer read % history rows', v_cnt; end if;
  select count(*) into v_cnt from public.price_cut_history;
  if v_cnt <> 0 then raise exception 'FAIL OM2: a customer read % cut rows', v_cnt; end if;
  v_state := null;
  begin
    insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
    values (p_a, 'promotion', gen_random_uuid(), 'percentage', 50, 'EUR', t);
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '42501' then raise exception 'FAIL OM2: a customer wrote a cut (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.price_history where product_id = p_a;
  if v_cnt = 0 then raise exception 'FAIL OM2: staff cannot read the history'; end if;
  foreach v_state in array array['insert', 'update', 'delete'] loop
    begin
      if v_state = 'insert' then
        insert into public.price_history (product_id, price, currency, valid_from) values (p_a, 99, 'EUR', t - interval '90 days');
      elsif v_state = 'update' then
        update public.price_history set price = 99 where product_id = p_a;
      else
        delete from public.price_history where product_id = p_a;
      end if;
      raise exception 'FAIL OM2: a manager could % the history', v_state;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    update public.price_cut_history set discount_value = 99;
    raise exception 'FAIL OM2: a manager could update the cuts';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  passed := passed || 'OM2'::text;

  -- OM3: no compare-at price, from anyone ----------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    update public.products set compare_at_price = 99 where id = p_a;
  exception when others then v_state := sqlstate; end;
  if v_state not in ('23514', '42501') or v_state is null then
    raise exception 'FAIL OM3: a manager set a compare-at price (%)', v_state;
  end if;
  v_state := null;
  begin
    perform public.admin_save_product(jsonb_build_object(
      'id', gen_random_uuid(), 'category_id', v_cat, 'sku', 'OM-TEST-CMP', 'slug', 'om-test-compare', 'name', 'Comparé',
      'short_description', 'Court', 'description', 'Long', 'price', '10.00', 'compare_at_price', '30.00',
      'status', 'draft',
      'metadata', jsonb_build_object('type', 'single', 'material', jsonb_build_object('fr', 'Cristal', 'en', 'Crystal'), 'tags', jsonb_build_array('test')),
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Compared', 'slug', 'om-test-compared', 'short_description', 'Short', 'description', 'Long')),
      'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 4, 'low_stock_threshold', 1, 'availability', 'in_stock')));
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '23514' then raise exception 'FAIL OM3: admin_save_product took a compare-at price (%)', v_state; end if;
  execute 'reset role';
  v_state := null;
  begin
    update public.product_variants set compare_at_price = 99 where id = v_own;
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '23514' then raise exception 'FAIL OM3: the owner set a variant compare-at price (%)', v_state; end if;
  select count(*) into v_cnt from public.products where compare_at_price is not null;
  if v_cnt <> 0 then raise exception 'FAIL OM3: % products keep a compare-at price', v_cnt; end if;
  passed := passed || 'OM3'::text;

  -- OM4: the reference price -----------------------------------------------------
  -- Helper product B, history rewritten as the owner for each scenario.
  insert into public.products (category_id, name, slug, price, currency, status, product_type)
  values (v_cat, 'Omnibus B', 'om-test-b', 20, 'EUR', 'active', 'physical') returning id into p_b;

  -- (a) 20 for 60 days, 25 % off for 2 days: strike 20, -25 %.
  delete from public.price_history where product_id = p_b;
  insert into public.price_history (product_id, price, currency, valid_from) values (p_b, 20, 'EUR', t - interval '60 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '2 days');
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'reduced' or r.price <> 15 or r.reference_price <> 20 or r.discount_percent <> 25
     or r.reduction_started_at <> t - interval '2 days' or r.list_price <> 20 then
    raise exception 'FAIL OM4a: %', row_to_json(r);
  end if;

  -- (b) + a 50 % cut from day -20 to day -15 (a gap before the current one): the
  --     lowest price of the 30 days before is 10 → 15 is not a reduction.
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from, valid_to)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 50, 'EUR', t - interval '20 days', t - interval '15 days');
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'not_lower' or r.reference_price <> 10 or r.price <> 15 or r.discount_percent is not null then
    raise exception 'FAIL OM4b: %', row_to_json(r);
  end if;

  -- (c) successive reductions: 10 % from day -20 to day -10, then 30 % with no gap:
  --     the series starts on day -20, the reference is the 20 before it.
  delete from public.price_cut_history where product_id = p_b;
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from, valid_to)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 10, 'EUR', t - interval '20 days', t - interval '10 days'),
         (p_b, 'promotion', gen_random_uuid(), 'percentage', 30, 'EUR', t - interval '10 days', null);
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'reduced' or r.reference_price <> 20 or r.price <> 14 or r.discount_percent <> 30
     or r.reduction_started_at <> t - interval '20 days' then
    raise exception 'FAIL OM4c: %', row_to_json(r);
  end if;

  -- (d) listed 5 days ago at 32, 30 since day -3, 10 % off since day -1: lowest since listing = 30.
  delete from public.price_history where product_id = p_b;
  delete from public.price_cut_history where product_id = p_b;
  insert into public.price_history (product_id, price, currency, valid_from, valid_to)
  values (p_b, 32, 'EUR', t - interval '5 days', t - interval '3 days');
  insert into public.price_history (product_id, price, currency, valid_from) values (p_b, 30, 'EUR', t - interval '3 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 10, 'EUR', t - interval '1 day');
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'reduced' or r.reference_price <> 30 or r.price <> 27 or r.discount_percent <> 10 then
    raise exception 'FAIL OM4d: %', row_to_json(r);
  end if;

  -- (e) on sale from the day it was listed: no price before the series → nothing struck.
  delete from public.price_history where product_id = p_b;
  delete from public.price_cut_history where product_id = p_b;
  insert into public.price_history (product_id, price, currency, valid_from) values (p_b, 30, 'EUR', t - interval '1 day');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 10, 'EUR', t - interval '1 day');
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'no_history' or r.reference_price is not null or r.price <> 27 then
    raise exception 'FAIL OM4e: %', row_to_json(r);
  end if;

  -- (f) currency: 10 USD for 60 days, then 25 EUR since day -5, 20 % off (EUR) since day -1:
  --     the USD price is ignored, the reference is 25.
  delete from public.price_history where product_id = p_b;
  delete from public.price_cut_history where product_id = p_b;
  insert into public.price_history (product_id, price, currency, valid_from, valid_to)
  values (p_b, 10, 'USD', t - interval '60 days', t - interval '5 days');
  insert into public.price_history (product_id, price, currency, valid_from) values (p_b, 25, 'EUR', t - interval '5 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 20, 'EUR', t - interval '1 day'),
         (p_b, 'promotion', gen_random_uuid(), 'percentage', 90, 'USD', t - interval '1 day');
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'reduced' or r.currency <> 'EUR' or r.reference_price <> 25 or r.price <> 20 or r.discount_percent <> 20 then
    raise exception 'FAIL OM4f: %', row_to_json(r);
  end if;

  -- (g) raised from 10 to 20 three days ago, then 25 % off: 15 is above the 10 of the window.
  delete from public.price_history where product_id = p_b;
  delete from public.price_cut_history where product_id = p_b;
  insert into public.price_history (product_id, price, currency, valid_from, valid_to)
  values (p_b, 10, 'EUR', t - interval '60 days', t - interval '3 days');
  insert into public.price_history (product_id, price, currency, valid_from) values (p_b, 20, 'EUR', t - interval '3 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '1 day');
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'not_lower' or r.reference_price <> 10 then
    raise exception 'FAIL OM4g: %', row_to_json(r);
  end if;

  -- (h) no cut: the list price, and what a cut starting now would strike (lowest of 30 days = 10).
  delete from public.price_cut_history where product_id = p_b;
  select * into r from private.price_reference(p_b, null, null, t);
  if r.state is distinct from 'no_reduction' or r.price <> 20 or r.reference_price <> 10 or r.discount_percent is not null then
    raise exception 'FAIL OM4h: %', row_to_json(r);
  end if;

  -- (i) a variant is priced on its own history; product cuts apply to it.
  delete from public.price_history where variant_id = v_own;
  insert into public.price_history (product_id, variant_id, price, currency, valid_from) values (p_a, v_own, 40, 'EUR', t - interval '60 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_a, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '2 days');
  select * into r from private.price_reference(p_a, v_own, null, t);
  if r.state is distinct from 'reduced' or r.reference_price <> 40 or r.price <> 30 then
    raise exception 'FAIL OM4i: %', row_to_json(r);
  end if;

  -- (j) a course: 100 for 40 days, 30 off (amount) since yesterday.
  delete from public.price_history where course_id = c_one;
  insert into public.price_history (course_id, price, currency, valid_from) values (c_one, 100, 'EUR', t - interval '40 days');
  insert into public.price_cut_history (course_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (c_one, 'course_promotion', gen_random_uuid(), 'amount', 30, 'EUR', t - interval '1 day');
  select * into r from private.price_reference(null, null, c_one, t);
  if r.state is distinct from 'reduced' or r.reference_price <> 100 or r.price <> 70 or r.discount_percent <> 30 then
    raise exception 'FAIL OM4j: %', row_to_json(r);
  end if;
  passed := passed || 'OM4'::text;

  -- OM5: promotion triggers ------------------------------------------------------
  delete from public.price_cut_history where product_id = p_b;
  insert into public.promotions (name, title, type, percent_off, applies_to, customer_eligibility, activation,
                                 starts_at, ends_at, lifecycle, currency)
  values ('OM test', 'OM test', 'percentage', 20, 'products', 'all', 'automatic',
          t - interval '1 day', t + interval '7 days', 'draft', 'EUR')
  returning id into promo;
  insert into public.promotion_products (promotion_id, product_id, role) values (promo, p_b, 'eligible');
  select count(*) into v_cnt from public.price_cut_history where source_id = promo;
  if v_cnt <> 0 then raise exception 'FAIL OM5: a draft promotion recorded a cut'; end if;
  update public.promotions set lifecycle = 'live' where id = promo;
  select count(*) into v_cnt from public.price_cut_history
   where source_id = promo and product_id = p_b and valid_from = t and valid_to = t + interval '7 days'
     and discount_type = 'percentage' and discount_value = 20;
  if v_cnt <> 1 then raise exception 'FAIL OM5: the live promotion recorded % cuts', v_cnt; end if;
  -- Paused in the same transaction: the cut never took effect and is forgotten.
  update public.promotions set lifecycle = 'paused' where id = promo;
  select count(*) into v_cnt from public.price_cut_history where source_id = promo;
  if v_cnt <> 0 then raise exception 'FAIL OM5: a paused promotion kept % cuts', v_cnt; end if;
  -- A cut that took effect before is closed, not forgotten.
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from, valid_to)
  values (p_b, 'promotion', promo, 'percentage', 20, 'EUR', t - interval '1 day', t + interval '7 days');
  update public.promotions set title = 'OM test bis' where id = promo;
  select count(*) into v_cnt from public.price_cut_history where source_id = promo and valid_to = t;
  if v_cnt <> 1 then raise exception 'FAIL OM5: an applied cut was not closed now'; end if;
  -- A minimum basket: no unit price cut.
  update public.promotions set lifecycle = 'live', min_subtotal_amount = 50 where id = promo;
  select count(*) into v_cnt from public.price_cut_history where source_id = promo and valid_to is distinct from t;
  if v_cnt <> 0 then raise exception 'FAIL OM5: a conditional promotion recorded a cut'; end if;
  -- Course promotion.
  insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at, ends_at)
  values (c_one, 'OM', 'percentage', 15, t - interval '1 hour', null);
  select count(*) into v_cnt from public.price_cut_history
   where course_id = c_one and source = 'course_promotion' and discount_value = 15 and valid_from = t;
  if v_cnt <> 1 then raise exception 'FAIL OM5: the course promotion recorded % cuts', v_cnt; end if;
  passed := passed || 'OM5'::text;

  -- OM6: readers -------------------------------------------------------------------
  -- Product B again with a clean, reduced history (scenario a).
  delete from public.price_history where product_id = p_b;
  delete from public.price_cut_history where product_id = p_b;
  insert into public.price_history (product_id, price, currency, valid_from) values (p_b, 20, 'EUR', t - interval '60 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (p_b, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '2 days');

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select * into r from public.storefront_price_references() s where s.product_id = p_b and s.variant_id is null;
  if r.state is distinct from 'reduced' or r.reference_price <> 20 or r.price <> 15 then
    raise exception 'FAIL OM6: storefront row %', row_to_json(r);
  end if;
  v_state := null;
  begin
    perform * from public.admin_price_references(p_b);
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '42501' then raise exception 'FAIL OM6: a visitor read the admin figures (%)', v_state; end if;
  execute 'reset role';

  update public.products set status = 'draft' where id = p_b;
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.storefront_price_references() s where s.product_id = p_b;
  if v_cnt <> 0 then raise exception 'FAIL OM6: a draft product reached the storefront'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', viewer, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform * from public.admin_price_references(p_b);
  exception when others then v_state := sqlstate; end;
  if v_state is distinct from '42501' then raise exception 'FAIL OM6: a viewer read the admin figures (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.admin_price_references(p_b) a where a.variant_id is null and a.state = 'reduced';
  if v_cnt <> 1 then raise exception 'FAIL OM6: the manager did not get the draft product''s figures'; end if;
  execute 'reset role';
  passed := passed || 'OM6'::text;

  raise exception 'ALL OMNIBUS PRICE REFERENCE TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
