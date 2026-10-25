-- =============================================================================
-- Product characteristics + FAQ groups validation suite
-- (migration 20261025090755_product_specs_faq)
-- =============================================================================
-- Proves, as the roles that really call it:
--
--   * admin_save_product() saves the five characteristics (French on the
--     product, English on its English row), clears an emptied one, leaves them
--     alone when `specs` is absent, refuses an unknown key or a text over 120
--     characters;
--   * a visitor, a customer and a `viewer` cannot save a FAQ group (42501),
--     nor write the FAQ tables directly;
--   * a manager saves a group with questions, English texts and assignments;
--     a resave replaces questions and assignments; a published group needs a
--     question; a question of another group is refused;
--   * product_faq(): a visitor sees a category's published group, in English
--     when translated (French otherwise); a product's own group replaces the
--     category's; a draft group is invisible to visitors (tables and
--     resolver) and does not replace the category's.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL PRODUCT SPECS FAQ TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  cust   uuid := '00000000-0000-4000-a000-000000350001';
  viewer uuid := '00000000-0000-4000-a000-000000350002';
  mgr    uuid := '00000000-0000-4000-a000-000000350003';
  cat    uuid;
  p_a    uuid := gen_random_uuid();
  p_b    uuid;
  g_cat  uuid := gen_random_uuid();
  g_own  uuid := gen_random_uuid();
  g_dft  uuid := gen_random_uuid();
  i1     uuid := gen_random_uuid();
  i2     uuid := gen_random_uuid();
  i3     uuid := gen_random_uuid();
  r      jsonb;
  v_cnt  int;
  v_txt  text;
  v_ok   boolean;
  passed text[] := '{}';
begin
  insert into public.categories (name, slug, is_active, position)
  values ('FAQ test', 'faq-test-cat', true, 99) returning id into cat;
  insert into public.products (name, slug, price, currency, status, product_type, category_id)
  values ('FAQ B', 'faq-test-b', 10, 'EUR', 'active', 'physical', cat) returning id into p_b;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (cust, 'authenticated', 'authenticated', 'faq-customer.test@example.invalid', now(), now()),
         (viewer, 'authenticated', 'authenticated', 'faq-viewer.test@example.invalid', now(), now()),
         (mgr, 'authenticated', 'authenticated', 'faq-manager.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer' where id = viewer;
  update public.profiles set role = 'manager' where id = mgr;

  -- S1: characteristics through admin_save_product()
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  r := public.admin_save_product(jsonb_build_object(
    'id', p_a, 'category_id', cat, 'sku', 'FAQ-TEST-A', 'slug', 'faq-test-a', 'name', 'FAQ A',
    'price', '12.00', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'FAQ A en', 'slug', 'faq-test-a-en')),
    'specs', jsonb_build_object(
      'material', jsonb_build_object('fr', ' Cristal ', 'en', 'Crystal'),
      'center', jsonb_build_object('fr', 'Opale', 'en', ''),
      'back', jsonb_build_object('fr', 'Plat, poli', 'en', 'Flat, polished'),
      'wear', null)));
  if (r ->> 'specs')::boolean is not true then raise exception 'FAIL S1: specs flag %', r; end if;
  select spec_material || '|' || spec_center || '|' || spec_back || '|' || coalesce(spec_packaging, '-') || '|' || coalesce(spec_wear, '-')
    into v_txt from public.products where id = p_a;
  if v_txt <> 'Cristal|Opale|Plat, poli|-|-' then raise exception 'FAIL S1: French specs %', v_txt; end if;
  select spec_material || '|' || coalesce(spec_center, '-') || '|' || spec_back
    into v_txt from public.product_translations where product_id = p_a and locale = 'en';
  if v_txt <> 'Crystal|-|Flat, polished' then raise exception 'FAIL S1: English specs %', v_txt; end if;
  -- absent = unchanged
  r := public.admin_save_product(jsonb_build_object(
    'id', p_a, 'category_id', cat, 'sku', 'FAQ-TEST-A', 'name', 'FAQ A', 'price', '12.00', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'FAQ A en'))));
  if r ? 'specs' or (select spec_back from public.products where id = p_a) is distinct from 'Plat, poli' then
    raise exception 'FAIL S1: specs changed without the key';
  end if;
  -- emptied = cleared
  perform public.admin_save_product(jsonb_build_object(
    'id', p_a, 'category_id', cat, 'sku', 'FAQ-TEST-A', 'name', 'FAQ A', 'price', '12.00', 'status', 'active',
    'translations', jsonb_build_object('en', jsonb_build_object('name', 'FAQ A en')),
    'specs', jsonb_build_object('material', jsonb_build_object('fr', 'Cristal', 'en', 'Crystal'),
                                'back', jsonb_build_object('fr', '', 'en', ''))));
  if (select spec_back from public.products where id = p_a) is not null
     or (select spec_back from public.product_translations where product_id = p_a and locale = 'en') is not null
     or (select spec_center from public.products where id = p_a) is not null then
    raise exception 'FAIL S1: emptied specs kept';
  end if;
  v_ok := false;
  begin
    perform public.admin_save_product(jsonb_build_object(
      'id', p_a, 'category_id', cat, 'sku', 'FAQ-TEST-A', 'name', 'FAQ A', 'price', '12.00', 'status', 'active',
      'specs', jsonb_build_object('colour', jsonb_build_object('fr', 'Rouge'))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: unknown characteristic accepted'; end if;
  v_ok := false;
  begin
    perform public.admin_save_product(jsonb_build_object(
      'id', p_a, 'category_id', cat, 'sku', 'FAQ-TEST-A', 'name', 'FAQ A', 'price', '12.00', 'status', 'active',
      'specs', jsonb_build_object('wear', jsonb_build_object('fr', repeat('x', 121)))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: 121 characters accepted'; end if;
  passed := passed || 'S1'::text;

  -- S2: visitor, customer and viewer cannot write the FAQ
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform public.admin_save_faq_group(jsonb_build_object('id', g_cat, 'name', 'X'));
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: a visitor saved a group'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.admin_save_faq_group(jsonb_build_object('id', g_cat, 'name', 'X'));
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: a customer saved a group'; end if;
  v_ok := false;
  begin
    insert into public.faq_groups (name, status) values ('Direct', 'published');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: a customer inserted a group'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.admin_save_faq_group(jsonb_build_object('id', g_cat, 'name', 'X'));
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: a viewer saved a group'; end if;
  passed := passed || 'S2'::text;

  -- S3: a manager saves, resaves, and is refused bad payloads
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  r := public.admin_save_faq_group(jsonb_build_object(
    'id', g_cat, 'name', 'Catégorie test', 'status', 'published',
    'items', jsonb_build_array(
      jsonb_build_object('id', i1, 'question', 'Q1 fr', 'answer', 'A1 fr', 'question_en', 'Q1 en', 'answer_en', 'A1 en'),
      jsonb_build_object('id', i2, 'question', 'Q2 fr', 'answer', 'A2 fr', 'question_en', 'Q2 en', 'answer_en', '')),
    'category_ids', jsonb_build_array(cat)));
  select count(*) into v_cnt from public.faq_items where group_id = g_cat;
  if v_cnt <> 2 then raise exception 'FAIL S3: % questions', v_cnt; end if;
  select count(*) into v_cnt from public.faq_item_translations where item_id in (i1, i2);
  if v_cnt <> 1 then raise exception 'FAIL S3: half-translated question published (% rows)', v_cnt; end if;
  -- resave: i1 dropped, i3 added first, assignment kept
  perform public.admin_save_faq_group(jsonb_build_object(
    'id', g_cat, 'name', 'Catégorie test', 'status', 'published',
    'items', jsonb_build_array(
      jsonb_build_object('id', i3, 'question', 'Q3 fr', 'answer', 'A3 fr'),
      jsonb_build_object('id', i2, 'question', 'Q2 fr', 'answer', 'A2 fr', 'question_en', 'Q2 en', 'answer_en', 'A2 en')),
    'category_ids', jsonb_build_array(cat)));
  if exists (select 1 from public.faq_items where id = i1)
     or (select position from public.faq_items where id = i3) <> 0
     or not exists (select 1 from public.faq_item_translations where item_id = i2) then
    raise exception 'FAIL S3: resave did not replace the questions';
  end if;
  v_ok := false;
  begin
    perform public.admin_save_faq_group(jsonb_build_object('id', g_own, 'name', 'Vide', 'status', 'published'));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S3: empty published group accepted'; end if;
  v_ok := false;
  begin
    perform public.admin_save_faq_group(jsonb_build_object('id', g_own, 'name', 'Vol', 'status', 'draft',
      'items', jsonb_build_array(jsonb_build_object('id', i3, 'question', 'Q', 'answer', 'A'))));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S3: another group''s question taken'; end if;
  v_ok := false;
  begin
    perform public.admin_save_faq_group(jsonb_build_object('id', g_own, 'name', 'Inconnu', 'status', 'draft',
      'product_ids', jsonb_build_array(gen_random_uuid())));
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S3: unknown product accepted'; end if;
  -- a draft group of its own on product B
  perform public.admin_save_faq_group(jsonb_build_object(
    'id', g_dft, 'name', 'Brouillon', 'status', 'draft',
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'question', 'Brouillon ?', 'answer', 'Oui')),
    'product_ids', jsonb_build_array(p_b)));
  passed := passed || 'S3'::text;

  -- S4: what a visitor reads
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select string_agg(question || '=' || answer, ';') into v_txt from public.product_faq(p_b, 'en');
  if v_txt is distinct from 'Q3 fr=A3 fr;Q2 en=A2 en' then
    raise exception 'FAIL S4: category FAQ in English %', v_txt;
  end if;
  select string_agg(question, ';') into v_txt from public.product_faq(p_b, 'fr');
  if v_txt is distinct from 'Q3 fr;Q2 fr' then raise exception 'FAIL S4: category FAQ in French %', v_txt; end if;
  if exists (select 1 from public.faq_groups where id = g_dft)
     or exists (select 1 from public.faq_items where group_id = g_dft)
     or exists (select 1 from public.product_faq_groups where group_id = g_dft) then
    raise exception 'FAIL S4: a visitor reads a draft group';
  end if;
  passed := passed || 'S4'::text;

  -- S5: a product's own published group replaces the category's
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_faq_group(jsonb_build_object(
    'id', g_own, 'name', 'Produit B', 'status', 'published',
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'question', 'Propre ?', 'answer', 'Oui')),
    'product_ids', jsonb_build_array(p_b)));
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select string_agg(question, ';') into v_txt from public.product_faq(p_b, 'fr');
  if v_txt is distinct from 'Propre ?' then raise exception 'FAIL S5: own group %', v_txt; end if;
  select count(*) into v_cnt from public.product_faq(p_a, 'fr');
  if v_cnt <> 2 then raise exception 'FAIL S5: product A lost its category FAQ (%)', v_cnt; end if;
  passed := passed || 'S5'::text;

  execute 'reset role';
  raise exception 'ALL PRODUCT SPECS FAQ TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
