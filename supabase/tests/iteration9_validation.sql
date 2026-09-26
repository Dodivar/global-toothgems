-- =============================================================================
-- Iteration 9 validation suite — product recommendations.
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 9 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000090002';
  vwr   uuid := '00000000-0000-4000-a000-000000090003';
  alice uuid := '00000000-0000-4000-a000-00000009a11c';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_star uuid; p_gold uuid; p_heart uuid; p_opal uuid; p_kit uuid; p_draft uuid; p_pince uuid;
  p_gel uuid; p_caps uuid; p_gc uuid; p_archived uuid; r_fr uuid;
  o public.orders;
  v_link uuid; v_cnt int; v_ids uuid[]; v_src text[]; v_txt text; v_state text;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr,   'authenticated', 'authenticated', 'mgr9.test@example.invalid',   '{"first_name":"Mia"}',   now(), now()),
    (vwr,   'authenticated', 'authenticated', 'vwr9.test@example.invalid',   '{"first_name":"Val"}',   now(), now()),
    (alice, 'authenticated', 'authenticated', 'alice9.test@example.invalid', '{"first_name":"Alice"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer'  where id = vwr;
  select id into p_star     from public.products where slug = 'etoile-cristal';
  select id into p_gold     from public.products where slug = 'charm-etoile-or-18k';
  select id into p_heart    from public.products where slug = 'coeur-chrome';
  select id into p_opal     from public.products where slug = 'goutte-opale';
  select id into p_kit      from public.products where slug = 'kit-application-premium';
  select id into p_draft    from public.products where slug = 'kit-decouverte';
  select id into p_pince    from public.products where slug = 'pince-de-depose';
  select id into p_gel      from public.products where slug = 'gel-de-suivi';
  select id into p_caps     from public.products where slug = 'capsules-steriles';
  select id into p_gc       from public.products where slug = 'carte-cadeau';
  select id into p_archived from public.products where slug = 'coffret-glitter-2025';
  select r.id into r_fr from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';

  -- Known starting point: the seed links of the heart only.
  delete from public.product_recommendations where product_id <> p_heart;
  if (select array_agg(recommended_product_id order by position) from public.product_recommendations
       where product_id = p_heart and kind = 'complementary') is distinct from array[p_gel, p_caps] then
    raise exception 'FAIL R0: seed links of coeur-chrome missing';
  end if;

  -- ===========================================================================
  -- R1 integrity
  -- ===========================================================================
  foreach v_txt in array array[
    format('insert into public.product_recommendations (product_id, recommended_product_id) values (%L, %L)', p_heart, p_heart),
    format('insert into public.product_recommendations (product_id, recommended_product_id, kind) values (%L, %L, ''upsell'')', p_heart, p_kit),
    format('insert into public.product_recommendations (product_id, recommended_product_id, position) values (%L, %L, -1)', p_heart, p_kit),
    format('insert into public.product_recommendations (product_id, recommended_product_id) values (%L, %L)', p_heart, p_gel)] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state not in ('23514', '23505') or v_state is null then
      raise exception 'FAIL R1: accepted % (%)', v_txt, v_state;
    end if;
  end loop;
  -- The same pair may exist once per kind.
  insert into public.product_recommendations (product_id, recommended_product_id, kind) values (p_heart, p_gel, 'similar');
  delete from public.product_recommendations where product_id = p_heart and recommended_product_id = p_gel and kind = 'similar';
  passed := array_append(passed, 'R1 no self link, known kinds, positive position, one link per pair and kind');

  -- Links to products that are not on sale (seeded as staff/service).
  insert into public.product_recommendations (product_id, recommended_product_id, position)
  values (p_heart, p_draft, 5), (p_heart, p_archived, 6), (p_heart, p_gc, 7);

  -- ===========================================================================
  -- R2 who reads and writes the links
  -- ===========================================================================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.product_recommendations where product_id = p_heart and kind = 'complementary';
  -- gift card is active, so its link is visible; the draft and archived ones are not.
  if v_cnt <> 3 then raise exception 'FAIL R2: visitors see % complementary links of the heart, expected 3', v_cnt; end if;
  v_state := null;
  begin
    insert into public.product_recommendations (product_id, recommended_product_id) values (p_heart, p_kit);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R2: visitor wrote a link (%)', v_state; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.product_recommendations (product_id, recommended_product_id) values (p_heart, p_kit);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R2: customer wrote a link (%)', v_state; end if;
  update public.product_recommendations set position = 9 where product_id = p_heart;
  delete from public.product_recommendations where product_id = p_heart;
  execute 'reset role';
  if (select count(*) from public.product_recommendations where product_id = p_heart and position = 9) > 0
     or (select count(*) from public.product_recommendations where product_id = p_heart) <> 6 then
    raise exception 'FAIL R2: customer changed links';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.product_recommendations where product_id = p_heart;
  if v_cnt <> 6 then raise exception 'FAIL R2: read-only staff see % links, expected 6', v_cnt; end if;
  v_state := null;
  begin
    insert into public.product_recommendations (product_id, recommended_product_id) values (p_heart, p_kit);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R2: read-only staff wrote a link (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  insert into public.product_recommendations (product_id, recommended_product_id, position)
  values (p_heart, p_kit, 2) returning id into v_link;
  update public.product_recommendations set position = 3 where id = v_link;
  execute 'reset role';
  if (select created_by from public.product_recommendations where id = v_link) is distinct from mgr then
    raise exception 'FAIL R2: creator not recorded';
  end if;
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'product_recommendations' and record_id = v_link::text and actor_id = mgr;
  if v_cnt <> 2 then raise exception 'FAIL R2: % audit rows for the manager''s link, expected 2', v_cnt; end if;
  passed := array_append(passed, 'R2 visitors read links between products on sale; only manage_products writes; audited');

  -- ===========================================================================
  -- R3 recommended_products(): manual links first, never unsellable products
  -- ===========================================================================
  -- Opal sold out (whatever its seeded stock mode), heart in stock for R4 orders.
  update public.inventory_items set track_inventory = false, availability = 'out_of_stock' where product_id = p_opal;
  update public.inventory_items set track_inventory = true, quantity_on_hand = 50, quantity_reserved = 0
   where product_id = p_heart;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select array_agg(product_id order by rank), array_agg(source order by rank) into v_ids, v_src
    from public.recommended_products(array[p_heart], 'complementary', 4);
  if v_ids[1:3] is distinct from array[p_gel, p_caps, p_kit] or v_src[1:3] is distinct from array['manual', 'manual', 'manual']
     or cardinality(v_ids) <> 4 or v_src[4] <> 'popular' then
    raise exception 'FAIL R3: heart complementary = % / %', v_ids, v_src;
  end if;

  select array_agg(product_id) into v_ids from public.recommended_products('{}', 'complementary', 24);
  if v_ids && array[p_draft, p_archived, p_gc, p_opal] then
    raise exception 'FAIL R3: draft, archived, gift card or out-of-stock product recommended';
  end if;
  if exists (select 1 from public.recommended_products('{}') x where x.source <> 'popular') then
    raise exception 'FAIL R3: no input should only give popular products';
  end if;
  -- Featured products lead the popular list.
  if exists (select 1 from public.recommended_products('{}', 'complementary', 3) x
               join public.products p on p.id = x.product_id where not p.is_featured) then
    raise exception 'FAIL R3: popular list does not start with featured products';
  end if;

  -- A cart: its own lines are never suggested; a link shared by two lines wins.
  select array_agg(product_id order by rank) into v_ids
    from public.recommended_products(array[p_heart, p_gold], 'complementary', 6);
  if v_ids && array[p_heart, p_gold] then raise exception 'FAIL R3: cart lines suggested back'; end if;
  execute 'reset role';
  insert into public.product_recommendations (product_id, recommended_product_id, position) values (p_gold, p_caps, 0);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select array_agg(product_id order by rank) into v_ids
    from public.recommended_products(array[p_heart, p_gold], 'complementary', 2);
  if v_ids is distinct from array[p_caps, p_gel] then
    raise exception 'FAIL R3: cart order %, expected capsules (shared) then gel', v_ids;
  end if;

  -- Similar: the out-of-stock opal link is skipped, same-category gems fill in.
  select array_agg(product_id order by rank), array_agg(source order by rank) into v_ids, v_src
    from public.recommended_products(array[p_heart], 'similar', 2);
  if v_ids && array[p_opal] or not (v_ids <@ array[p_star, p_gold])
     or v_src is distinct from array['same_category', 'same_category'] then
    raise exception 'FAIL R3: similar = % / %', v_ids, v_src;
  end if;

  foreach v_txt in array array[
    'select * from public.recommended_products(''{}'', ''upsell'')',
    'select * from public.recommended_products(''{}'', null)',
    'select * from public.recommended_products(''{}'', ''similar'', 0)',
    'select * from public.recommended_products(''{}'', ''similar'', 25)',
    format('select * from public.recommended_products(%L)',
           (select array_agg(gen_random_uuid()) from generate_series(1, 51)))] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL R3: accepted % (%)', left(v_txt, 80), v_state; end if;
  end loop;
  execute 'reset role';
  passed := array_append(passed, 'R3 manual first by position, cart lines merged, similar by category, popular fallback, unsellable skipped, validation');

  -- ===========================================================================
  -- R4 bought together: from paid orders only, never below two orders
  -- ===========================================================================
  delete from public.product_recommendations where product_id = p_heart and kind = 'complementary';

  o := public.create_order(alice, 'alice9.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_heart, 'quantity', 1),
                           jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_fr);
  o := public.mark_order_paid(o.id, o.amount_due, 'EUR', 'cs_it9_1');
  -- An unpaid order does not count.
  o := public.create_order(alice, 'alice9.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_heart, 'quantity', 1),
                           jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_fr);
  if exists (select 1 from public.recommended_products(array[p_heart]) x where x.source = 'bought_together') then
    raise exception 'FAIL R4: one paid order is enough to be bought together';
  end if;
  o := public.create_order(alice, 'alice9.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_heart, 'quantity', 1),
                           jsonb_build_object('product_id', p_pince, 'quantity', 1)), fr, fr, r_fr);
  o := public.mark_order_paid(o.id, o.amount_due, 'EUR', 'cs_it9_2');

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select array_agg(product_id order by rank), array_agg(source order by rank) into v_ids, v_src
    from public.recommended_products(array[p_heart]);
  if v_ids[1] is distinct from p_pince or v_src[1] <> 'bought_together' then
    raise exception 'FAIL R4: bought together = % / %', v_ids, v_src;
  end if;
  -- Only for complementary.
  if exists (select 1 from public.recommended_products(array[p_heart], 'similar') x where x.source = 'bought_together') then
    raise exception 'FAIL R4: bought together used for similar';
  end if;
  execute 'reset role';
  passed := array_append(passed, 'R4 bought together from at least two paid orders, complementary only');

  perform set_config('request.jwt.claims', '', true);
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 9 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
