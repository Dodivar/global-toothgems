-- =============================================================================
-- Iteration 6 validation suite — back-office roles/permissions and promotions.
-- =============================================================================
-- R*: roles, permissions, rank rules, staff directory, rewritten policies.
-- P*: promotions, codes, limits, combinations, loyalty reward, VAT, RLS.
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 6 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  adm   uuid := '00000000-0000-4000-a000-00000006ad81';
  mgr   uuid := '00000000-0000-4000-a000-000000060001';
  mgr2  uuid := '00000000-0000-4000-a000-000000060002';
  vwr   uuid := '00000000-0000-4000-a000-000000060003';
  alice uuid := '00000000-0000-4000-a000-00000006a11c';
  bob   uuid := '00000000-0000-4000-a000-000000060b0b';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gel uuid; p_kit uuid; p_prem uuid; p_pince uuid; p_gc uuid; c_kits uuid; c_outils uuid; r_std uuid; inv_gel uuid;
  pr_kits uuid; pr_code uuid; pr_uni uuid; pr_ship uuid; pr_pct uuid; pr_bxgy uuid; pr_bundle uuid; pr_gift uuid;
  o public.orders; o2 public.orders; o_code public.orders;
  it record; d record; codes text[];
  v_cnt int; v_num numeric; v_bool boolean; v_txt text; v_state text; v_avail int;
  passed text[] := '{}';
begin
  -- ===========================================================================
  -- Fixtures
  -- ===========================================================================
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at, last_sign_in_at) values
    (adm,   'authenticated', 'authenticated', 'adm6.test@example.invalid',   '{"first_name":"Ada"}',   now(), now(), now()),
    (mgr,   'authenticated', 'authenticated', 'mgr6.test@example.invalid',   '{"first_name":"Mia"}',   now(), now(), now()),
    (mgr2,  'authenticated', 'authenticated', 'mgr26.test@example.invalid',  '{"first_name":"Max"}',   now(), now(), now()),
    (vwr,   'authenticated', 'authenticated', 'vwr6.test@example.invalid',   '{"first_name":"Val"}',   now(), now(), null),
    (alice, 'authenticated', 'authenticated', 'alice6.test@example.invalid', '{"first_name":"Alice"}', now(), now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob6.test@example.invalid',   '{"first_name":"Bob"}',   now(), now(), now());
  update public.profiles set role = 'admin'   where id = adm;
  update public.profiles set role = 'manager' where id in (mgr, mgr2);
  update public.profiles set role = 'viewer'  where id = vwr;

  select id into p_gel   from public.products where slug = 'gel-de-suivi';            -- 19.00, hygiene
  select id into p_kit   from public.products where slug = 'kit-decouverte';          -- 129.00, kits (draft in the seed)
  update public.products set status = 'active' where id = p_kit;
  select id into p_prem  from public.products where slug = 'kit-application-premium'; -- 249.00, on sale (279)
  select id into p_pince from public.products where slug = 'pince-de-depose';         -- 78.00, outils
  select id into p_gc    from public.products where slug = 'carte-cadeau';
  select id into c_kits  from public.categories where slug = 'kits';
  select id into c_outils from public.categories where slug = 'outils';
  select id into inv_gel from public.inventory_items where product_id = p_gel;
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';                                    -- 4.90

  -- ===========================================================================
  -- R1 permission matrix
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.my_permissions();
  if v_cnt <> 3 or not private.has_permission('view_users') or private.has_permission('manage_products') then
    raise exception 'FAIL R1: viewer permissions (%)', v_cnt;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.my_permissions();
  if v_cnt <> 10 or not private.has_permission('manage_promotions') or private.has_permission('manage_settings') then
    raise exception 'FAIL R1: manager permissions (%)', v_cnt;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.my_permissions();
  if v_cnt <> 11 then raise exception 'FAIL R1: admin permissions (%)', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.my_permissions();
  if v_cnt <> 0 or private.is_staff() then raise exception 'FAIL R1: customer has permissions'; end if;
  select count(*) into v_cnt from public.role_permissions;
  if v_cnt <> 0 then raise exception 'FAIL R1: customer reads the permission matrix'; end if;
  passed := array_append(passed, 'R1 viewer 3 / manager 10 / admin 11 permissions, customers none');

  -- ===========================================================================
  -- R2 read-only staff read the back office and change nothing
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.profiles where id in (alice, bob);
  if v_cnt <> 2 then raise exception 'FAIL R2: viewer cannot read customers'; end if;
  update public.products set price = 1 where id = p_gel;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL R2: viewer changed a price'; end if;
  select count(*) into v_cnt from public.audit_logs;
  if v_cnt <> 0 then raise exception 'FAIL R2: viewer reads the audit log'; end if;
  v_state := null;
  begin
    insert into public.customer_tags (user_id, tag) values (alice, 'vip');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R2: viewer tagged a customer (%)', v_state; end if;
  passed := array_append(passed, 'R2 read-only: reads customers, cannot change prices, tags or read the audit log');

  -- ===========================================================================
  -- R3 manager vs administrator areas
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.products set price = price where id = p_gel;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL R3: manager cannot edit the catalogue'; end if;
  update public.tax_rates set rate_bp = rate_bp;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL R3: manager changed VAT settings'; end if;
  select count(*) into v_cnt from public.audit_logs;
  if v_cnt <> 0 then raise exception 'FAIL R3: manager reads the audit log'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  update public.tax_rates set rate_bp = rate_bp where country_code = 'FR';
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then raise exception 'FAIL R3: admin cannot manage settings'; end if;
  select count(*) into v_cnt from public.audit_logs;
  if v_cnt = 0 then raise exception 'FAIL R3: admin cannot read the audit log'; end if;
  passed := array_append(passed, 'R3 managers run catalogue, not settings/audit; admins do both');

  -- ===========================================================================
  -- R4 role management within rank
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.profiles set role = 'viewer' where id = bob;              -- customer -> read only: ok
  select role into v_txt from public.profiles where id = bob;
  if v_txt <> 'viewer' then raise exception 'FAIL R4: manager could not invite a viewer'; end if;
  update public.profiles set role = 'customer' where id = bob;
  foreach v_txt in array array[
    format('update public.profiles set role = %L where id = %L', 'admin', bob),     -- above own rank
    format('update public.profiles set status = %L where id = %L', 'suspended', adm), -- touch an admin
    format('update public.profiles set role = %L where id = %L', 'admin', mgr),     -- self-promotion
    format('update public.profiles set status = %L where id = %L', 'suspended', mgr)] -- own status
  loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL R4: allowed: % (%)', v_txt, v_state; end if;
  end loop;
  update public.profiles set status = 'suspended' where id = alice;       -- customer status: manage_customers
  update public.profiles set status = 'active' where id = alice;

  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  update public.profiles set role = 'viewer' where id = bob;              -- RLS: the row is not writable
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL R4: viewer managed roles'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  update public.profiles set role = 'admin' where id = bob;
  update public.profiles set role = 'customer' where id = bob;
  execute 'reset role';
  select count(*) into v_cnt from public.audit_logs where table_name = 'profiles' and record_id = bob::text and actor_id = adm;
  if v_cnt <> 2 then raise exception 'FAIL R4: role changes not audited (%)', v_cnt; end if;
  passed := array_append(passed, 'R4 roles: managers up to manager, never admins or themselves; admins anything; audited');

  -- ===========================================================================
  -- R5 a suspended team member loses access at once
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.profiles set status = 'suspended' where id = mgr2;         -- same rank: allowed
  perform set_config('request.jwt.claims', json_build_object('sub', mgr2, 'role', 'authenticated')::text, true);
  update public.products set price = price where id = p_gel;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 or private.is_staff() then raise exception 'FAIL R5: suspended manager still works'; end if;
  select count(*) into v_cnt from public.profiles where id <> mgr2;
  if v_cnt <> 0 then raise exception 'FAIL R5: suspended manager still reads customers'; end if;
  passed := array_append(passed, 'R5 suspended manager: no permission, no back-office read');

  -- ===========================================================================
  -- R6 staff profiles and directory
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  insert into public.staff_profiles (user_id, job_title, team, invited_by) values (vwr, 'Data analyst', 'finance', adm);
  select invited_by into v_txt from public.staff_profiles where user_id = vwr;
  if v_txt <> mgr::text then raise exception 'FAIL R6: inviter forged'; end if;
  v_state := null;
  begin
    insert into public.staff_profiles (user_id, team) values (adm, 'leadership');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R6: manager edited an admin file (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select status into v_txt from public.staff_directory() where user_id = vwr;
  if v_txt <> 'invited' then raise exception 'FAIL R6: never signed in should be invited (%)', v_txt; end if;
  select status into v_txt from public.staff_directory() where user_id = mgr2;
  if v_txt <> 'suspended' then raise exception 'FAIL R6: suspended not shown (%)', v_txt; end if;
  select count(*) into v_cnt from public.staff_directory() where user_id in (alice, bob);
  if v_cnt <> 0 then raise exception 'FAIL R6: customers listed as team'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.staff_directory();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R6: customer read the team (%)', v_state; end if;
  passed := array_append(passed, 'R6 staff profiles: inviter stamped, rank enforced; directory = team only, invited/suspended derived');

  -- ===========================================================================
  -- R7 functions check permissions
  -- ===========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  o := public.create_order(alice, 'alice6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  foreach v_txt in array array[
    format('select public.cancel_order(%L)', o.id),
    'select public.issue_gift_card(20, ''x@example.invalid'')'] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL R7: viewer ran % (%)', v_txt, v_state; end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.cancel_order(o.id, 'test');
  execute 'reset role';
  select status into v_txt from public.orders where id = o.id;
  if v_txt <> 'cancelled' then raise exception 'FAIL R7: manager could not cancel'; end if;
  passed := array_append(passed, 'R7 cancel_order / gift card staff functions: permission checked');

  -- ===========================================================================
  -- P1 automatic percentage on a category; on-sale product excluded; VAT on net
  -- ===========================================================================
  perform set_config('request.jwt.claims', '', true);
  insert into public.promotions (name, title, type, percent_off, applies_to, lifecycle, starts_at)
  values ('Kits -10', 'Kits -10 %', 'percentage', 10, 'categories', 'draft', now() - interval '1 day')
  returning id into pr_kits;
  insert into public.promotion_categories (promotion_id, category_id) values (pr_kits, c_kits);
  update public.promotions set lifecycle = 'live' where id = pr_kits;

  o := public.create_order(alice, 'alice6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1),
                           jsonb_build_object('product_id', p_gel, 'quantity', 1),
                           jsonb_build_object('product_id', p_prem, 'quantity', 1)), fr, fr, r_std);
  if o.discount_amount <> 12.90 or o.subtotal_amount <> 397 or o.total_amount <> 397 - 12.90 + 4.90 then
    raise exception 'FAIL P1: order %', row_to_json(o);
  end if;
  for it in select * from public.order_items where order_id = o.id loop
    v_num := case when it.product_id = p_kit then 12.90 else 0 end;
    if it.discount_amount <> v_num
       or it.tax_amount <> public.vat_included(it.unit_price * it.quantity - it.discount_amount, it.tax_rate_bp) then
      raise exception 'FAIL P1: line %', row_to_json(it);
    end if;
  end loop;
  select * into d from public.order_discounts where order_id = o.id;
  if d.promotion_id <> pr_kits or d.goods_amount <> 12.90 or d.label <> 'Kits -10 %' or d.user_id <> alice then
    raise exception 'FAIL P1: discount record %', row_to_json(d);
  end if;
  passed := array_append(passed, 'P1 automatic -10 % on kits: on-sale kit excluded, per-line discount, VAT on discounted line, ledger row');

  -- ===========================================================================
  -- P2 codes: best offer wins, case-insensitive, invalid codes rejected
  -- ===========================================================================
  insert into public.promotions (name, title, type, amount_off, min_subtotal_amount, activation, code_kind,
                                 max_uses_per_customer, lifecycle, starts_at)
  values ('Welcome 15', 'Bienvenue -15 €', 'fixed_amount', 15, 100, 'code', 'shared', 1, 'draft', now() - interval '1 day')
  returning id into pr_code;
  insert into public.promotion_codes (promotion_id, code) values (pr_code, 'welcome15');
  update public.promotions set lifecycle = 'live' where id = pr_code;

  o_code := public.create_order(alice, 'alice6.test@example.invalid',
              jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
              p_promotion_codes => array[' Welcome15 ']);
  select count(*), max(code), max(goods_amount) into v_cnt, v_txt, v_num from public.order_discounts where order_id = o_code.id;
  if v_cnt <> 1 or v_txt <> 'WELCOME15' or v_num <> 15 or o_code.total_amount <> 129 - 15 + 4.90 then
    raise exception 'FAIL P2: code should beat -10 %% (%, %, %, total %)', v_cnt, v_txt, v_num, o_code.total_amount;
  end if;
  foreach v_txt in array array['NOPE1234', 'WELCOME15'] loop
    v_state := null;
    begin
      perform public.create_order(bob, 'bob6.test@example.invalid',
                jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std,
                p_promotion_codes => array[v_txt]);             -- unknown / basket below 100
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from 'P0002' then raise exception 'FAIL P2: code % accepted (%)', v_txt, v_state; end if;
  end loop;
  passed := array_append(passed, 'P2 code vs automatic: best benefit applied, code case-insensitive, unknown/unmet codes rejected');

  -- ===========================================================================
  -- P3 usage limit per customer, freed by cancellation
  -- ===========================================================================
  v_state := null;
  begin
    perform public.create_order(alice, 'ALICE6.test@example.invalid',
              jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
              p_promotion_codes => array['WELCOME15']);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL P3: second use allowed (%)', v_state; end if;
  perform public.cancel_order(o_code.id, 'test');
  o2 := public.create_order(alice, 'alice6.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
          p_promotion_codes => array['WELCOME15']);
  if o2.discount_amount <> 15 then raise exception 'FAIL P3: cancelled use not released'; end if;
  o_code := public.mark_order_paid(o2.id, o2.amount_due, 'EUR', 'cs_it6_c', 'pi_it6_c', 'card', 'visa', '4242');
  select orders, discount_amount, status into v_cnt, v_num, v_txt from public.promotion_overview where id = pr_code;
  if v_cnt <> 1 or v_num <> 15 or v_txt <> 'active' then raise exception 'FAIL P3: overview % % %', v_cnt, v_num, v_txt; end if;
  passed := array_append(passed, 'P3 one use per customer (email case-insensitive), freed when the order is cancelled; overview counts paid orders');

  -- ===========================================================================
  -- P4 unique single-use codes
  -- ===========================================================================
  update public.promotions set lifecycle = 'paused' where id in (pr_kits, pr_code);
  insert into public.promotions (name, title, type, percent_off, activation, code_kind, lifecycle, starts_at)
  values ('Influencer', 'Code influenceur -20 %', 'percentage', 20, 'code', 'unique', 'draft', now() - interval '1 day')
  returning id into pr_uni;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select array_agg(code) into codes from public.generate_promotion_codes(pr_uni, 3, 'gt');
  perform set_config('request.jwt.claims', '', true);
  if cardinality(codes) <> 3 or codes[1] !~ '^GT-[A-Z2-9]{10}$'
     or (select count(*) from public.promotion_codes where promotion_id = pr_uni and max_uses = 1) <> 3 then
    raise exception 'FAIL P4: codes %', codes;
  end if;
  update public.promotions set lifecycle = 'live' where id = pr_uni;
  o := public.create_order(bob, 'bob6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_std,
         p_promotion_codes => array[lower(codes[1])]);
  if o.discount_amount <> 15.60 then raise exception 'FAIL P4: -20 %% of 78 = 15.60, got %', o.discount_amount; end if;
  v_state := null;
  begin
    perform public.create_order(alice, 'alice6.test@example.invalid',
              jsonb_build_array(jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_std,
              p_promotion_codes => array[codes[1]]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL P4: single-use code reused (%)', v_state; end if;
  v_state := null;
  begin
    update public.promotion_codes set code = 'HACKED99' where code = codes[2];
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P4: code rewritten (%)', v_state; end if;
  update public.promotions set lifecycle = 'paused' where id = pr_uni;
  passed := array_append(passed, 'P4 unique codes: generated, single use, never rewritten');

  -- ===========================================================================
  -- P5 combinable promotions stack: -5 % everything + free shipping
  -- ===========================================================================
  insert into public.promotions (name, title, type, percent_off, combinable, lifecycle, starts_at)
  values ('All -5', 'Tout -5 %', 'percentage', 5, true, 'live', now() - interval '1 day') returning id into pr_pct;
  insert into public.promotions (name, title, type, min_subtotal_amount, combinable, lifecycle, starts_at)
  values ('Free ship 50', 'Livraison offerte', 'free_shipping', 50, true, 'live', now() - interval '1 day') returning id into pr_ship;
  o := public.create_order(bob, 'bob6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_std);
  select count(*), sum(shipping_amount) into v_cnt, v_num from public.order_discounts where order_id = o.id;
  if o.discount_amount <> 3.90 or o.shipping_amount <> 0 or o.total_amount <> 74.10 or v_cnt <> 2 or v_num <> 4.90 then
    raise exception 'FAIL P5: order % (% rows, shipping waived %)', row_to_json(o), v_cnt, v_num;
  end if;
  o := public.create_order(bob, 'bob6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  if o.discount_amount <> 0.95 or o.shipping_amount <> 4.90 then
    raise exception 'FAIL P5: free shipping below its minimum %', row_to_json(o);
  end if;
  update public.promotions set lifecycle = 'paused' where id in (pr_pct, pr_ship);
  passed := array_append(passed, 'P5 combinable promotions stack (-5 % + free shipping), thresholds respected');

  -- ===========================================================================
  -- P6 buy 2 get 1 free; P7 bundle; P8 gift with purchase
  -- ===========================================================================
  insert into public.promotions (name, title, type, buy_quantity, get_quantity, reward_percent, applies_to, lifecycle, starts_at)
  values ('Tools 3 for 2', '3 pour 2', 'buy_x_get_y', 2, 1, 100, 'categories', 'draft', now() - interval '1 day')
  returning id into pr_bxgy;
  insert into public.promotion_categories values (pr_bxgy, c_outils);
  update public.promotions set lifecycle = 'live' where id = pr_bxgy;
  o := public.create_order(bob, 'bob6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_pince, 'quantity', 3)), fr, fr, r_std);
  if o.discount_amount <> 78 or o.total_amount <> 234 - 78 + 4.90 then raise exception 'FAIL P6: %', row_to_json(o); end if;
  perform public.cancel_order(o.id, 'test');
  update public.promotions set lifecycle = 'paused' where id = pr_bxgy;

  insert into public.promotions (name, title, type, bundle_price, lifecycle, starts_at)
  values ('Care duo', 'Duo soin', 'bundle', 80, 'draft', now() - interval '1 day') returning id into pr_bundle;
  insert into public.promotion_products (promotion_id, product_id, role) values (pr_bundle, p_gel, 'bundle'), (pr_bundle, p_pince, 'bundle');
  update public.promotions set lifecycle = 'live' where id = pr_bundle;
  o := public.create_order(bob, 'bob6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 2),
                           jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_std);
  if o.discount_amount <> 17 then raise exception 'FAIL P7: one bundle 19 + 78 -> 80 saves 17, got %', o.discount_amount; end if;
  o := public.create_order(bob, 'bob6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  if o.discount_amount <> 0 then raise exception 'FAIL P7: incomplete bundle discounted'; end if;
  update public.promotions set lifecycle = 'paused' where id = pr_bundle;

  insert into public.promotions (name, title, type, gift_product_id, applies_to, lifecycle, starts_at)
  values ('Gel offert', 'Gel de suivi offert', 'gift', p_gel, 'all', 'live', now() - interval '1 day') returning id into pr_gift;
  select quantity_on_hand - quantity_reserved into v_avail from public.inventory_items where id = inv_gel;
  o := public.create_order(alice, 'alice6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std);
  select * into it from public.order_items where order_id = o.id and product_id = p_gel;
  if it.quantity <> 1 or it.unit_price <> 19 or it.discount_amount <> 19 or it.tax_amount <> 0
     or o.subtotal_amount <> 148 or o.discount_amount <> 19 or o.total_amount <> 133.90 then
    raise exception 'FAIL P8: gift line % order %', row_to_json(it), row_to_json(o);
  end if;
  if (select quantity_on_hand - quantity_reserved from public.inventory_items where id = inv_gel) <> v_avail - 1 then
    raise exception 'FAIL P8: gift not reserved';
  end if;
  o := public.create_order(alice, 'alice6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  if o.discount_amount <> 0 then raise exception 'FAIL P8: buying only the gift made it free'; end if;
  update public.promotions set lifecycle = 'paused' where id = pr_gift;
  passed := array_append(passed, 'P6 3-for-2, P7 bundle price, P8 free gift line (reserved, no VAT, not when it is the only item)');

  -- ===========================================================================
  -- P9 gift cards are never discounted
  -- ===========================================================================
  update public.promotions set lifecycle = 'live' where id = pr_pct;
  o := public.create_order(alice, 'alice6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gc, 'quantity', 1, 'amount', 50,
                             'gift_card', jsonb_build_object('recipient_name', 'Bob', 'recipient_email', 'bob6.test@example.invalid',
                                                             'sender_name', 'Alice', 'message', 'Hello')),
                           jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  select discount_amount into v_num from public.order_items where order_id = o.id and product_id = p_gc;
  if v_num <> 0 or o.discount_amount <> 0.95 then raise exception 'FAIL P9: gift card discounted (%, %)', v_num, o.discount_amount; end if;
  update public.promotions set lifecycle = 'paused' where id = pr_pct;
  passed := array_append(passed, 'P9 gift card lines never discounted');

  -- ===========================================================================
  -- P10 loyalty reward: explicit, alone, reserved, released on cancellation
  -- ===========================================================================
  v_state := null;
  begin
    perform public.create_order(alice, 'alice6.test@example.invalid',
              jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
              p_use_loyalty_reward => true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL P10: reward without a full card (%)', v_state; end if;
  insert into public.loyalty_cards (user_id, status, stamps_required, reward_percent, stamps_count, completed_at)
  values (alice, 'completed', 5, 10, 5, now());
  update public.promotions set lifecycle = 'live' where id = pr_code;
  v_state := null;
  begin
    perform public.create_order(alice, 'alice6.test@example.invalid',
              jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
              p_promotion_codes => array['WELCOME15'], p_use_loyalty_reward => true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL P10: reward + code accepted (%)', v_state; end if;
  update public.promotions set lifecycle = 'live' where id = pr_pct;       -- an automatic promo is running too
  o := public.create_order(alice, 'alice6.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
         p_use_loyalty_reward => true);
  select count(*), max(source) into v_cnt, v_txt from public.order_discounts where order_id = o.id;
  if o.discount_amount <> 12.90 or v_cnt <> 1 or v_txt <> 'loyalty' then
    raise exception 'FAIL P10: reward order % (% rows, %)', row_to_json(o), v_cnt, v_txt;
  end if;
  select count(*) into v_cnt from public.loyalty_cards where user_id = alice and status = 'redeemed' and redeemed_order_id = o.id;
  if v_cnt <> 1 then raise exception 'FAIL P10: card not reserved'; end if;
  v_state := null;
  begin
    perform public.create_order(alice, 'alice6.test@example.invalid',
              jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std,
              p_use_loyalty_reward => true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL P10: reward used twice (%)', v_state; end if;
  perform public.cancel_order(o.id, 'test');
  select count(*) into v_cnt from public.loyalty_cards where user_id = alice and status = 'completed' and redeemed_order_id is null;
  if v_cnt <> 1 then raise exception 'FAIL P10: reward not given back after cancellation'; end if;
  update public.promotions set lifecycle = 'paused' where id in (pr_pct, pr_code);
  passed := array_append(passed, 'P10 loyalty reward: only on request, alone, reserved on the order, back when cancelled');

  -- ===========================================================================
  -- P11 publication rules and code rules
  -- ===========================================================================
  foreach v_txt in array array[
    'insert into public.promotions (name, title, type, percent_off, applies_to, lifecycle) values (''x'', ''x'', ''percentage'', 5, ''products'', ''live'')',
    format('insert into public.promotions (name, title, type, gift_product_id) values (''x'', ''x'', ''gift'', %L)', p_gc),
    format('insert into public.promotion_codes (promotion_id, code) values (%L, ''AUTO1234'')', pr_pct),
    format('update public.promotions set lifecycle = ''live'', applies_to = ''products'' where id = %L', pr_pct)] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '23514' then raise exception 'FAIL P11: accepted % (%)', v_txt, v_state; end if;
  end loop;
  passed := array_append(passed, 'P11 incomplete promotions cannot go live; gift cards cannot be gifts; automatic promotions have no codes');

  -- ===========================================================================
  -- P12 who sees what
  -- ===========================================================================
  update public.promotions set lifecycle = 'live' where id in (pr_pct, pr_code);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from (select id, title from public.promotions) x;
  if v_cnt <> 1 then raise exception 'FAIL P12: visitors see % promotions (running automatic only)', v_cnt; end if;
  v_state := null;
  begin
    select count(name) into v_cnt from public.promotions;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P12: visitors read internal names (%)', v_state; end if;
  v_state := null;
  begin
    select count(*) into v_cnt from public.promotion_codes;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P12: visitors read codes (%)', v_state; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.promotion_codes;
  if v_cnt <> 0 then raise exception 'FAIL P12: customers read codes'; end if;
  select count(*) into v_cnt from public.order_discounts;
  if v_cnt = 0 then raise exception 'FAIL P12: alice cannot read her discounts'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_discounts od join public.orders o3 on o3.id = od.order_id where o3.user_id = alice;
  if v_cnt <> 0 then raise exception 'FAIL P12: bob reads alice discounts'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.promotion_codes;
  if v_cnt = 0 then raise exception 'FAIL P12: read-only staff cannot see codes'; end if;
  v_state := null;
  begin
    insert into public.promotions (name, title, type, percent_off) values ('v', 'v', 'percentage', 5);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P12: viewer created a promotion (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  insert into public.promotions (name, title, type, percent_off) values ('m', 'm', 'percentage', 5);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  passed := array_append(passed, 'P12 visitors: running automatic promotions, public columns, no codes; customers: own discounts only; promotions managed with manage_promotions');

  -- ===========================================================================
  -- Integrity: every order written above satisfies the deferred checks
  -- (subtotal = items, discount = line discounts = discount records).
  -- ===========================================================================
  execute 'set constraints all immediate';
  passed := array_append(passed, 'I1 deferred order checks hold for every order of the suite');

  raise exception 'ALL ITERATION 6 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
