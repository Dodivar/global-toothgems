-- =============================================================================
-- Product inclusions validation suite (migration 20261108170000_product_inclusions)
-- =============================================================================
-- Proves, as the roles that really call it (decision 139):
--
--   P1  a visitor, a customer and a `viewer` cannot set what a product grants
--       (42501); a manager can; invalid inclusions are refused;
--   P2  the public reads the inclusions of an active product, not of a draft;
--   P3  a pack line needs an account (account_required message), one unit per
--       line, and an unpublished included course makes it unavailable;
--   P4  an order snapshots the inclusions and reserves the kit's article; the
--       snapshot is readable by its owner only (and staff); no stock → P0001;
--   P5  unpaid: nothing granted; paid: a `bundle` course entitlement and an
--       Artist Studio grant of 3 months from the payment — Studio state
--       `granted`, tier artist, writes allowed (has_studio_access);
--   P6  a member who holds a grant opens no 48-hour trial;
--   P7  the better plan wins: Essential subscription + grant → artist,
--       Atelier subscription + grant → atelier (state `subscribed`);
--   P8  a member who already holds the course buys the pack: no second
--       entitlement, the Studio grant is still created; a second pack adds its
--       months after the first;
--   P9  a partial refund keeps the access, a full refund revokes both;
--   P10 a grant over → state `grant_ended`, no access, still no trial;
--   P11 grants are read by their owner only.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL PRODUCT INCLUSION TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

set constraints public.inventory_items_refresh_bundles immediate;

do $$
declare
  cust    uuid := '00000000-0000-4000-a000-000000480001';
  other   uuid := '00000000-0000-4000-a000-000000480002';
  viewer  uuid := '00000000-0000-4000-a000-000000480003';
  mgr     uuid := '00000000-0000-4000-a000-000000480004';
  holder  uuid := '00000000-0000-4000-a000-000000480005';
  subE    uuid := '00000000-0000-4000-a000-000000480006';
  subA    uuid := '00000000-0000-4000-a000-000000480007';
  c1      uuid := '00000000-0000-4000-a000-000000480101';
  m1      uuid := '00000000-0000-4000-a000-000000480102';
  s1      uuid := '00000000-0000-4000-a000-000000480103';
  addr    jsonb := '{"first_name":"Test","last_name":"Pack","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  v_rate  uuid;
  kitpro uuid; pack uuid; draft uuid;
  o1 public.orders; o2 public.orders; o3 public.orders;
  v_line  uuid;
  v_grant public.studio_access_grants;
  v_grant2 public.studio_access_grants;
  r       jsonb;
  v_ref   public.refunds;
  v_cnt   int;
  v_ok    boolean;
  v_txt   text;
  passed  text[] := '{}';

begin
  select r.id into v_rate
    from public.shipping_rates r
    join public.shipping_zones z on z.id = r.zone_id and z.is_active
   where r.is_active and r.currency = 'EUR'
     and z.id = public.shipping_zone_for_country('FR')
     and r.min_order_amount is null and r.max_order_amount is null
     and r.min_weight_grams is null and r.max_weight_grams is null
   order by r.price limit 1;
  if v_rate is null then raise exception 'FAIL setup: no open shipping rate for FR'; end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (cust,   'authenticated', 'authenticated', 'pack-customer.test@example.invalid', now(), now()),
    (other,  'authenticated', 'authenticated', 'pack-other.test@example.invalid', now(), now()),
    (viewer, 'authenticated', 'authenticated', 'pack-viewer.test@example.invalid', now(), now()),
    (mgr,    'authenticated', 'authenticated', 'pack-manager.test@example.invalid', now(), now()),
    (holder, 'authenticated', 'authenticated', 'pack-holder.test@example.invalid', now(), now()),
    (subE,   'authenticated', 'authenticated', 'pack-sub-e.test@example.invalid', now(), now()),
    (subA,   'authenticated', 'authenticated', 'pack-sub-a.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer'  where id = viewer;
  update public.profiles set role = 'manager' where id = mgr;

  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Kit pro test', 'pack-test-kit-pro', 300, 'EUR', 'active', 'physical') returning id into kitpro;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Pack test', 'pack-test-pack', 800, 'EUR', 'active', 'physical') returning id into pack;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Pack brouillon', 'pack-test-draft', 800, 'EUR', 'draft', 'physical') returning id into draft;
  insert into public.inventory_items (product_id, quantity_on_hand) values (kitpro, 3), (pack, 0), (draft, 0);

  -- The course, as the manager; then the pack's kit and inclusions ---------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'pack-test-course', 'title', 'Masterclass test', 'category', 'technique', 'level', 'beginner',
    'price', '500.00', 'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Module', 'steps', jsonb_build_array(
        jsonb_build_object('id', s1, 'title', 'Étape', 'duration_minutes', 5))))));
  execute 'reset role';
  update public.courses set status = 'published' where id = c1;

  -- P1 ----------------------------------------------------------------------------------
  foreach v_cnt in array array[1, 2, 3] loop
    perform set_config('role', case v_cnt when 1 then 'anon' else 'authenticated' end, true);
    perform set_config('request.jwt.claims',
      case v_cnt when 1 then '{"role":"anon"}'
                 when 2 then json_build_object('sub', cust, 'role', 'authenticated')::text
                 else json_build_object('sub', viewer, 'role', 'authenticated')::text end, true);
    v_ok := false;
    begin
      perform public.admin_save_product_inclusions(pack, jsonb_build_array(jsonb_build_object('kind', 'course', 'course_id', c1)));
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'FAIL P1: caller % set inclusions', v_cnt; end if;
  end loop;
  execute 'reset role';
  if exists (select 1 from public.product_inclusions where product_id = pack) then
    raise exception 'FAIL P1: a refused call left inclusions';
  end if;

  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.admin_save_product_bundle(pack, jsonb_build_array(jsonb_build_object('product_id', kitpro, 'quantity', 1)));
  select count(*) into v_cnt from public.admin_save_product_inclusions(pack, jsonb_build_array(
    jsonb_build_object('kind', 'course', 'course_id', c1),
    jsonb_build_object('kind', 'studio', 'studio_plan', 'artist', 'studio_months', 3)));
  if v_cnt <> 2 then raise exception 'FAIL P1: % inclusions saved', v_cnt; end if;
  perform public.admin_save_product_inclusions(draft, jsonb_build_array(jsonb_build_object('kind', 'course', 'course_id', c1)));
  foreach v_cnt in array array[1, 2, 3, 4, 5, 6] loop
    v_ok := false;
    begin
      perform public.admin_save_product_inclusions(draft, case v_cnt
        when 1 then jsonb_build_array(jsonb_build_object('kind', 'course', 'course_id', c1),
                                      jsonb_build_object('kind', 'course', 'course_id', c1))
        when 2 then jsonb_build_array(jsonb_build_object('kind', 'studio', 'studio_plan', 'gold', 'studio_months', 3))
        when 3 then jsonb_build_array(jsonb_build_object('kind', 'studio', 'studio_plan', 'artist', 'studio_months', 0))
        when 4 then jsonb_build_array(jsonb_build_object('kind', 'studio', 'studio_plan', 'artist', 'studio_months', 3),
                                      jsonb_build_object('kind', 'studio', 'studio_plan', 'atelier', 'studio_months', 1))
        when 5 then jsonb_build_array(jsonb_build_object('kind', 'coupon'))
        else        jsonb_build_array(jsonb_build_object('kind', 'course', 'course_id', 'not-a-uuid')) end);
    exception when invalid_parameter_value then v_ok := true;
    end;
    if not v_ok then raise exception 'FAIL P1: invalid inclusions % accepted', v_cnt; end if;
  end loop;
  execute 'reset role';
  if (select count(*) from public.product_inclusions where product_id = draft) <> 1 then
    raise exception 'FAIL P1: a refused save changed the inclusions';
  end if;
  passed := passed || 'P1'::text;

  -- P2 ----------------------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_cnt from public.product_inclusions where product_id = pack;
  if v_cnt <> 2 then raise exception 'FAIL P2: anon reads % inclusions of the active pack', v_cnt; end if;
  select count(*) into v_cnt from public.product_inclusions where product_id = draft;
  if v_cnt <> 0 then raise exception 'FAIL P2: anon reads the draft''s inclusions'; end if;
  v_ok := false;
  begin
    insert into public.product_inclusions (product_id, kind, course_id) values (pack, 'course', c1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P2: anon wrote an inclusion'; end if;
  execute 'reset role';
  passed := passed || 'P2'::text;

  -- P3 ----------------------------------------------------------------------------------
  v_ok := false;
  begin
    perform public.create_order(null, 'pack-guest.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
    v_ok := v_txt like '%a course requires a customer account%';
  end;
  if not v_ok then raise exception 'FAIL P3: a guest bought the pack'; end if;
  v_ok := false;
  begin
    perform public.create_order(cust, 'pack-customer.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 2)), addr, addr, v_rate);
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: two packs on one line'; end if;
  update public.courses set status = 'unpublished' where id = c1;
  v_ok := false;
  begin
    perform public.create_order(cust, 'pack-customer.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: a pack with an unpublished course was sold'; end if;
  update public.courses set status = 'published' where id = c1;
  passed := passed || 'P3'::text;

  -- P4 ----------------------------------------------------------------------------------
  if (select quantity_on_hand from public.inventory_items where product_id = pack) <> 3 then
    raise exception 'FAIL P4: the pack''s stock is not the kit''s';
  end if;
  o1 := public.create_order(cust, 'pack-customer.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  select id into v_line from public.order_items where order_id = o1.id and product_id = pack;
  if (select count(*) from public.order_item_inclusions where order_item_id = v_line) <> 2 then
    raise exception 'FAIL P4: inclusions not snapshotted';
  end if;
  if (select quantity_reserved from public.inventory_items where product_id = kitpro) <> 1 then
    raise exception 'FAIL P4: the kit was not reserved';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_item_inclusions where order_item_id = v_line;
  if v_cnt <> 0 then raise exception 'FAIL P4: another customer read the snapshot'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.order_item_inclusions where order_item_id = v_line;
  if v_cnt <> 2 then raise exception 'FAIL P4: the owner reads % rows', v_cnt; end if;
  execute 'reset role';
  -- No stock: refused like any kit.
  update public.inventory_items set quantity_on_hand = 1 where product_id = kitpro;
  v_ok := false;
  begin
    perform public.create_order(other, 'pack-other.test@example.invalid',
      jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  exception when raise_exception then
    get stacked diagnostics v_txt = returned_sqlstate;
    v_ok := v_txt = 'P0001';
  end;
  if not v_ok then raise exception 'FAIL P4: a pack was sold without stock'; end if;
  update public.inventory_items set quantity_on_hand = 10 where product_id = kitpro;
  passed := passed || 'P4'::text;

  -- P5 ----------------------------------------------------------------------------------
  if exists (select 1 from public.course_entitlements where user_id = cust)
     or exists (select 1 from public.studio_access_grants where user_id = cust) then
    raise exception 'FAIL P5: an unpaid order granted access';
  end if;
  o1 := public.mark_order_paid(o1.id, o1.amount_due, 'EUR', 'cs_test_pack_1', 'pi_test_pack_1');
  if not exists (select 1 from public.course_entitlements
                  where user_id = cust and course_id = c1 and source = 'bundle' and order_id = o1.id and revoked_at is null) then
    raise exception 'FAIL P5: no course entitlement';
  end if;
  select * into v_grant from public.studio_access_grants where user_id = cust;
  if v_grant.id is null or v_grant.plan <> 'artist' or v_grant.order_id <> o1.id
     or v_grant.ends_at <> v_grant.starts_at + interval '3 months'
     or v_grant.starts_at > now() + interval '1 second' then
    raise exception 'FAIL P5: grant %', row_to_json(v_grant);
  end if;
  if private.studio_user_tier(cust) is distinct from 'artist' then raise exception 'FAIL P5: tier %', private.studio_user_tier(cust); end if;
  r := private.studio_access_json(cust);
  if r ->> 'state' <> 'granted' or r ->> 'grant_plan' <> 'artist' or (r ->> 'grant_active')::boolean is not true then
    raise exception 'FAIL P5: state %', r;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  if not private.has_studio_access() then raise exception 'FAIL P5: no Studio access'; end if;
  if jsonb_array_length(public.learner_courses()) <> 1 then raise exception 'FAIL P5: the course does not open'; end if;
  execute 'reset role';
  -- A replayed payment transition grants nothing more.
  update public.orders set payment_status = 'pending' where id = o1.id;
  update public.orders set payment_status = 'paid' where id = o1.id;
  if (select count(*) from public.studio_access_grants where user_id = cust) <> 1
     or (select count(*) from public.course_entitlements where user_id = cust) <> 1 then
    raise exception 'FAIL P5: a replay granted twice';
  end if;
  passed := passed || 'P5'::text;

  -- P6 ----------------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  r := public.start_studio_trial();
  execute 'reset role';
  if (r ->> 'started')::boolean or exists (select 1 from public.studio_trials where user_id = cust) then
    raise exception 'FAIL P6: a trial opened beside the grant';
  end if;
  passed := passed || 'P6'::text;

  -- P7 ----------------------------------------------------------------------------------
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end, billing_interval) values
    (subE, 'essential', 'active', 'sub_packTestE', now() + interval '20 days', 'month'),
    (subA, 'atelier',   'active', 'sub_packTestA', now() + interval '20 days', 'month');
  o2 := public.create_order(subE, 'pack-sub-e.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  perform public.mark_order_paid(o2.id, o2.amount_due, 'EUR', 'cs_test_pack_2', 'pi_test_pack_2');
  o3 := public.create_order(subA, 'pack-sub-a.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  perform public.mark_order_paid(o3.id, o3.amount_due, 'EUR', 'cs_test_pack_3', 'pi_test_pack_3');
  if private.studio_user_tier(subE) <> 'artist' or private.studio_user_tier(subA) <> 'atelier' then
    raise exception 'FAIL P7: tiers % / %', private.studio_user_tier(subE), private.studio_user_tier(subA);
  end if;
  if private.studio_access_json(subE) ->> 'state' <> 'subscribed' then raise exception 'FAIL P7: subscriber state'; end if;
  passed := passed || 'P7'::text;

  -- P8 ----------------------------------------------------------------------------------
  insert into public.course_entitlements (user_id, course_id, source, note) values (holder, c1, 'manual_grant', 'test');
  o2 := public.create_order(holder, 'pack-holder.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  o2 := public.mark_order_paid(o2.id, o2.amount_due, 'EUR', 'cs_test_pack_4', 'pi_test_pack_4');
  if (select count(*) from public.course_entitlements where user_id = holder) <> 1 then
    raise exception 'FAIL P8: a second entitlement for a held course';
  end if;
  if not exists (select 1 from public.studio_access_grants where user_id = holder and order_id = o2.id) then
    raise exception 'FAIL P8: no Studio grant for a course holder';
  end if;
  -- A second pack: its 3 months follow the first's.
  o3 := public.create_order(holder, 'pack-holder.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', pack, 'quantity', 1)), addr, addr, v_rate);
  o3 := public.mark_order_paid(o3.id, o3.amount_due, 'EUR', 'cs_test_pack_5', 'pi_test_pack_5');
  select * into v_grant from public.studio_access_grants where order_id = o2.id;
  select * into v_grant2 from public.studio_access_grants where order_id = o3.id;
  if v_grant2.starts_at <> v_grant.ends_at then raise exception 'FAIL P8: the second pack overlaps the first'; end if;
  passed := passed || 'P8'::text;

  -- P9 ----------------------------------------------------------------------------------
  select id into v_line from public.order_items where order_id = o1.id and product_id = pack;
  v_ref := public.request_refund(o1.id, 300.00, 'requested_by_customer',
             jsonb_build_array(jsonb_build_object('order_item_id', v_line, 'quantity', 1)), true);
  perform public.mark_refund_succeeded(v_ref.id, 're_test_pack_1');
  if not private.studio_user_has_access(cust)
     or not exists (select 1 from public.course_entitlements where user_id = cust and revoked_at is null) then
    raise exception 'FAIL P9: a partial refund revoked the access';
  end if;
  select amount_due - coalesce((select sum(amount) from public.refunds where order_id = o1.id and status = 'succeeded'), 0)
    into v_txt from public.orders where id = o1.id;
  v_ref := public.request_refund(o1.id, v_txt::numeric, 'requested_by_customer', '[]'::jsonb, false);
  perform public.mark_refund_succeeded(v_ref.id, 're_test_pack_2');
  if (select payment_status from public.orders where id = o1.id) <> 'refunded' then
    raise exception 'FAIL P9: order not refunded';
  end if;
  if private.studio_user_has_access(cust)
     or exists (select 1 from public.course_entitlements where user_id = cust and revoked_at is null)
     or exists (select 1 from public.studio_access_grants where user_id = cust and revoked_at is null) then
    raise exception 'FAIL P9: a full refund kept the access';
  end if;
  passed := passed || 'P9'::text;

  -- P10 ---------------------------------------------------------------------------------
  update public.studio_access_grants
     set starts_at = now() - interval '7 months', ends_at = now() - interval '1 day'
   where user_id = holder;
  r := private.studio_access_json(holder);
  if r ->> 'state' <> 'grant_ended' or private.studio_user_has_access(holder)
     or private.studio_user_tier(holder) is not null then
    raise exception 'FAIL P10: state %', r;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', holder, 'role', 'authenticated')::text, true);
  r := public.start_studio_trial();
  execute 'reset role';
  if (r ->> 'started')::boolean then raise exception 'FAIL P10: a trial opened after the grant'; end if;
  passed := passed || 'P10'::text;

  -- P11 ---------------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_access_grants;
  if v_cnt <> 0 then raise exception 'FAIL P11: another member reads % grants', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', holder, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_access_grants;
  if v_cnt <> 2 then raise exception 'FAIL P11: the owner reads % grants', v_cnt; end if;
  v_ok := false;
  begin
    update public.studio_access_grants set ends_at = now() + interval '5 years' where user_id = holder;
    get diagnostics v_cnt = row_count;
    v_ok := v_cnt = 0;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P11: the owner extended a grant'; end if;
  execute 'reset role';
  passed := passed || 'P11'::text;

  raise exception 'ALL PRODUCT INCLUSION TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
