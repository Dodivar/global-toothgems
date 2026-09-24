-- =============================================================================
-- Iteration 5 validation suite — member account data.
-- =============================================================================
-- Profiles from sign-up metadata, consent records, data export requests,
-- loyalty stamps, CRM tags/notes, review requests.
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 5 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  alice uuid := '00000000-0000-4000-a000-00000005a11c';
  bob   uuid := '00000000-0000-4000-a000-000000050b0b';
  admin uuid := '00000000-0000-4000-a000-00000005ad81';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gel uuid; p_kit uuid; r_std uuid;
  o public.orders; o_small public.orders; o_ref public.orders;
  i_kit uuid; v_ship uuid;
  rf public.refunds;
  prof public.profiles;
  lo record;
  v_cnt int; v_bool boolean; v_txt text; v_state text;
  passed text[] := '{}';
begin
  -- ===========================================================================
  -- M1 sign-up metadata → profile + consents; invalid values dropped
  -- ===========================================================================
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (alice, 'authenticated', 'authenticated', 'alice5.test@example.invalid',
     '{"first_name":"Alice","last_name":"Test","phone":"+33 6 00 00 00 00","country":"be","locale":"en",
       "persona":"artist","interest":"all","terms_accepted":"true","marketing":"true","policy_version":"2026-09",
       "role":"admin"}', now(), now()),
    (bob, 'authenticated', 'authenticated', 'bob5.test@example.invalid',
     '{"first_name":"Bob","phone":"call me","country":"France","locale":"xx","persona":"hacker"}', now(), now()),
    (admin, 'authenticated', 'authenticated', 'admin5.test@example.invalid', '{"first_name":"Ada"}', now(), now());
  update public.profiles set role = 'admin' where id = admin;

  select * into prof from public.profiles where id = alice;
  if prof.role <> 'customer' or prof.country_code <> 'BE' or prof.preferred_locale <> 'en'
     or prof.persona <> 'artist' or prof.interest <> 'all' or prof.phone is null or not prof.marketing_opt_in then
    raise exception 'FAIL M1: alice profile %', row_to_json(prof);
  end if;
  select count(*) into v_cnt from public.consent_records where user_id = alice and source = 'registration';
  if v_cnt <> 3 then raise exception 'FAIL M1: alice has % registration consents', v_cnt; end if;

  select * into prof from public.profiles where id = bob;
  if prof.phone is not null or prof.country_code is not null or prof.preferred_locale <> 'fr'
     or prof.persona is not null or prof.marketing_opt_in then
    raise exception 'FAIL M1: invalid metadata kept %', row_to_json(prof);
  end if;
  select count(*) into v_cnt from public.consent_records where user_id = bob;
  if v_cnt <> 0 then raise exception 'FAIL M1: consents recorded without policy version'; end if;
  passed := array_append(passed, 'M1 sign-up answers copied and validated, consents recorded, role never from metadata');

  -- ===========================================================================
  -- M2 profile: customer edits preferences, not the system columns
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.profiles set persona = 'student', preferred_locale = 'fr', birth_date = '1994-05-22',
                             country_code = 'FR' where id = alice;
  select persona into v_txt from public.profiles where id = alice;
  if v_txt <> 'student' then raise exception 'FAIL M2: own preferences not saved'; end if;

  v_state := null;
  begin
    update public.profiles set marketing_opt_in = false where id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M2: opt-in cache edited directly (%)', v_state; end if;
  v_state := null;
  begin
    update public.profiles set password_changed_at = now() where id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M2: password date edited (%)', v_state; end if;
  passed := array_append(passed, 'M2 members edit persona/locale/birth date/country; opt-in cache and password date are read-only');

  -- ===========================================================================
  -- M3 consents: append-only, own only, allowed sources, cache follows
  -- ===========================================================================
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (alice, 'marketing_email', false, '2026-09', 'account', '2000-01-01');
  select marketing_opt_in into v_bool from public.profiles where id = alice;
  if v_bool then raise exception 'FAIL M3: withdrawal did not update the cache'; end if;
  select count(*) into v_cnt from public.consent_records where user_id = alice and created_at < '2001-01-01';
  if v_cnt <> 0 then raise exception 'FAIL M3: client-chosen timestamp kept'; end if;
  select granted into v_bool from public.member_consents where user_id = alice and purpose = 'marketing_email';
  if v_bool then raise exception 'FAIL M3: member_consents not latest'; end if;

  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (alice, 'cookies_analytics', true, 'cookies-2026-09', 'cookie_banner');

  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (bob, 'marketing_email', true, '2026-09', 'account');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M3: consent for someone else (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (alice, 'marketing_email', true, '2026-09', 'admin');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M3: forged source (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (alice, 'terms', false, '2026-09', 'account');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL M3: terms refusal recorded (%)', v_state; end if;
  v_state := null;
  begin
    update public.consent_records set granted = true where user_id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M3: consent rewritten (%)', v_state; end if;
  v_state := null;
  begin
    delete from public.consent_records where user_id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M3: consent deleted (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.consent_records where user_id = alice;
  if v_cnt <> 0 then raise exception 'FAIL M3: bob reads alice consents'; end if;
  passed := array_append(passed, 'M3 consents append-only, own only, server timestamp, allowed sources, opt-in cache and latest view follow');

  -- ===========================================================================
  -- M4 data export requests
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  insert into public.data_export_requests (user_id, status, storage_path, ready_at, expires_at)
  values (alice, 'ready', alice::text || '/fake.zip', now(), now() + interval '1 year');
  select status into v_txt from public.data_export_requests where user_id = alice;
  if v_txt <> 'pending' then raise exception 'FAIL M4: client status kept (%)', v_txt; end if;
  v_state := null;
  begin
    insert into public.data_export_requests (user_id) values (alice);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL M4: two requests in flight (%)', v_state; end if;
  v_state := null;
  begin
    update public.data_export_requests set status = 'ready' where user_id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M4: customer moved the request (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.data_export_requests (user_id) values (bob);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M4: request for someone else (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.data_export_requests;
  if v_cnt <> 0 then raise exception 'FAIL M4: bob sees alice request'; end if;
  passed := array_append(passed, 'M4 data export: own request only, forced pending, one in flight, backend-only progress');

  -- ===========================================================================
  -- M5 loyalty: stamps from paid orders, threshold, void on refund, full card
  -- ===========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select id into p_gel from public.products where slug = 'gel-de-suivi';        -- 19.00 < 20
  select id into p_kit from public.products where slug = 'kit-application-premium';
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';

  o_small := public.create_order(alice, 'alice5.test@example.invalid',
               jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  o_small := public.mark_order_paid(o_small.id, o_small.total_amount, 'EUR', 'cs_it5_s', 'pi_it5_s', 'card', 'visa', '4242');
  select count(*) into v_cnt from public.loyalty_stamps where order_id = o_small.id;
  if v_cnt <> 0 then raise exception 'FAIL M5: stamp below threshold (shipping counted?)'; end if;

  o_ref := public.create_order(alice, 'alice5.test@example.invalid',
             jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std);
  select count(*) into v_cnt from public.loyalty_stamps where order_id = o_ref.id;
  if v_cnt <> 0 then raise exception 'FAIL M5: stamp before payment'; end if;
  o_ref := public.mark_order_paid(o_ref.id, o_ref.total_amount, 'EUR', 'cs_it5_r', 'pi_it5_r', 'card', 'visa', '4242');
  select current_stamps into v_cnt from public.loyalty_overview where user_id = alice;
  if v_cnt <> 1 then raise exception 'FAIL M5: first stamp missing (%)', v_cnt; end if;
  -- the same order paid event replayed never stamps twice
  update public.orders set payment_status = 'pending' where id = o_ref.id;
  update public.orders set payment_status = 'paid' where id = o_ref.id;
  select count(*) into v_cnt from public.loyalty_stamps where order_id = o_ref.id;
  if v_cnt <> 1 then raise exception 'FAIL M5: order stamped twice'; end if;

  rf := public.request_refund(o_ref.id, o_ref.total_amount, 'goodwill');
  rf := public.mark_refund_succeeded(rf.id, 're_it5');
  select voided_at is not null, void_reason into v_bool, v_txt from public.loyalty_stamps where order_id = o_ref.id;
  if not v_bool or v_txt <> 'order_refunded' then raise exception 'FAIL M5: refunded order kept its stamp'; end if;
  select current_stamps into v_cnt from public.loyalty_overview where user_id = alice;
  if v_cnt <> 0 then raise exception 'FAIL M5: card count not refreshed (%)', v_cnt; end if;

  for v_cnt in 1..5 loop
    o := public.create_order(alice, 'alice5.test@example.invalid',
           jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std);
    o := public.mark_order_paid(o.id, o.total_amount, 'EUR', 'cs_it5_' || v_cnt, 'pi_it5_' || v_cnt, 'card', 'visa', '4242');
  end loop;
  select * into lo from public.loyalty_overview where user_id = alice;
  if lo.rewards_available <> 1 or lo.current_stamps <> 0 then
    raise exception 'FAIL M5: full card not completed %', row_to_json(lo);
  end if;
  o := public.create_order(alice, 'alice5.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std);
  o := public.mark_order_paid(o.id, o.total_amount, 'EUR', 'cs_it5_6', 'pi_it5_6', 'card', 'visa', '4242');
  select * into lo from public.loyalty_overview where user_id = alice;
  if lo.rewards_available <> 1 or lo.current_stamps <> 1 or lo.stamps_lifetime <> 6 then
    raise exception 'FAIL M5: next card not started %', row_to_json(lo);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    insert into public.loyalty_stamps (card_id, user_id, order_id, order_amount, currency)
    select card_id, user_id, o_small.id, 999, 'EUR' from public.loyalty_stamps limit 1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M5: customer forged a stamp (%)', v_state; end if;
  v_state := null;
  begin
    update public.loyalty_settings set qualifying_amount = 0;
  exception when others then v_state := sqlstate;
  end;
  get diagnostics v_cnt = row_count;
  if v_state is null and v_cnt <> 0 then raise exception 'FAIL M5: customer changed the rules'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.loyalty_cards;
  if v_cnt <> 0 then raise exception 'FAIL M5: bob sees alice cards'; end if;
  select count(*) into v_cnt from public.loyalty_overview;
  if v_cnt <> 1 then raise exception 'FAIL M5: overview shows % rows to bob', v_cnt; end if;
  passed := array_append(passed, 'M5 loyalty: stamp per paid order >= threshold (goods only), once, voided on refund, full card completed then renewed, read-only for customers');

  -- ===========================================================================
  -- M6 CRM tags/notes: staff only
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  insert into public.customer_tags (user_id, tag) values (alice, 'vip');
  insert into public.customer_notes (user_id, body) values (alice, 'Studio partenaire, facturation société.');
  v_state := null;
  begin
    insert into public.customer_tags (user_id, tag) values (alice, 'best_friend');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL M6: unknown tag (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.customer_tags;
  select v_cnt + count(*) into v_cnt from public.customer_notes;
  if v_cnt <> 0 then raise exception 'FAIL M6: customer reads CRM data'; end if;
  v_state := null;
  begin
    insert into public.customer_notes (user_id, author_id, body) values (alice, alice, 'hello');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M6: customer wrote a note (%)', v_state; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.audit_logs where table_name = 'customer_tags';
  if v_cnt < 1 then raise exception 'FAIL M6: tag not audited'; end if;
  passed := array_append(passed, 'M6 CRM tags and notes: staff only, invisible to the customer, tags audited');

  -- ===========================================================================
  -- M7 review requests follow shipments and reviews
  -- ===========================================================================
  select id into i_kit from public.order_items where order_id = o.id;
  insert into public.shipments (order_id, status, carrier, tracking_number)
  values (o.id, 'preparing', 'Colissimo', '6A55555555555') returning id into v_ship;
  insert into public.shipment_items (shipment_id, order_item_id, quantity) values (v_ship, i_kit, 1);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cnt from public.review_requests where product_id = p_kit;
  if v_cnt <> 0 then raise exception 'FAIL M7: request before shipping'; end if;
  execute 'reset role';
  update public.shipments set status = 'shipped' where id = v_ship;
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cnt from public.review_requests where product_id = p_kit;
  if v_cnt <> 1 then raise exception 'FAIL M7: shipped product not requested (%)', v_cnt; end if;
  insert into public.reviews (product_id, user_id, rating, title, body, language)
  values (p_kit, alice, 5, 'Top', 'Un kit très complet, parfait pour débuter en cabine.', 'fr');
  select count(*) into v_cnt from public.review_requests where product_id = p_kit;
  if v_cnt <> 0 then raise exception 'FAIL M7: reviewed product still requested'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.review_requests;
  if v_cnt <> 0 then raise exception 'FAIL M7: bob sees alice requests'; end if;
  passed := array_append(passed, 'M7 review requests: shipped, not yet reviewed, own orders only');

  -- ===========================================================================
  -- M8 visitors see nothing of it
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'reset role';
  perform set_config('role', 'anon', true);
  v_state := null;
  begin
    select count(*) into v_cnt from public.consent_records;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M8: anon reads consents (%)', v_state; end if;
  v_state := null;
  begin
    select count(*) into v_cnt from public.loyalty_overview;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL M8: anon reads loyalty (%)', v_state; end if;
  select count(*) into v_cnt from public.loyalty_settings;
  if v_cnt <> 1 then raise exception 'FAIL M8: public loyalty rules not readable'; end if;
  passed := array_append(passed, 'M8 visitors: no member data, public loyalty rules readable');

  execute 'reset role';
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 5 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
