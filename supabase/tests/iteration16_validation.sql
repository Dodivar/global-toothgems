-- =============================================================================
-- Iteration 16 validation suite — product families under categories
-- (migration `…_category_families`).
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 16 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr     uuid := '00000000-0000-4000-a000-000000160002';
  p_new   uuid := '00000000-0000-4000-a000-0000001600a1';
  c_gems uuid; c_mat uuid; c_kits uuid;
  f_swar uuid; f_ess uuid; f_acc uuid; f_hidden uuid;
  base jsonb; res jsonb; v_state text; v_txt text; v_cnt int;
  passed text[] := '{}';
begin
  select id into c_gems from public.categories where slug = 'gems';
  select id into c_mat  from public.categories where slug = 'materiel';
  select id into c_kits from public.categories where slug = 'kits';
  select id into f_swar from public.category_families where slug = 'swarovski';
  select id into f_ess  from public.category_families where slug = 'essentiels';
  select id into f_acc  from public.category_families where slug = 'accessoires';

  -- F1: the taxonomy and the seed's classification ---------------------------
  select string_agg(slug, ',' order by position) into v_txt from public.categories where is_active;
  if v_txt is distinct from 'gems,materiel,kits,lip-gloss' then raise exception 'FAIL F1: active categories %', v_txt; end if;
  select string_agg(c.slug || '/' || f.slug, ',' order by c.position, f.position) into v_txt
    from public.category_families f join public.categories c on c.id = f.category_id;
  if v_txt is distinct from 'gems/swarovski,gems/preciosa,gems/bijoux-or-18ct,gems/opales,gems/micro-gems,'
                         || 'materiel/essentiels,materiel/accessoires,kits/kit-professionnel,kits/kit-diy' then
    raise exception 'FAIL F1: families %', v_txt;
  end if;
  if (select count(*) from public.category_family_translations where locale = 'en' and status = 'published') <> 9 then
    raise exception 'FAIL F1: English family names';
  end if;
  select string_agg(p.slug || ':' || coalesce(f.slug, '-'), ',' order by p.slug) into v_txt
    from public.products p left join public.category_families f on f.id = p.family_id
   where p.slug in ('charm-etoile-or-18k', 'coeur-chrome', 'gel-de-suivi', 'kit-decouverte');
  if v_txt is distinct from 'charm-etoile-or-18k:bijoux-or-18ct,coeur-chrome:-,gel-de-suivi:essentiels,kit-decouverte:kit-professionnel' then
    raise exception 'FAIL F1: seed classification %', v_txt;
  end if;
  passed := array_append(passed, 'F1 four categories, nine families with English names, seed products classified');

  -- F2: a family of another category is refused -------------------------------
  v_state := null;
  begin
    update public.products set family_id = f_swar where slug = 'pince-de-depose';
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL F2: foreign family accepted (%)', v_state; end if;
  -- The foreign key alone holds too, trigger or not.
  if not exists (select 1 from pg_constraint where conname = 'products_family_fkey' and contype = 'f'
                   and array_length(conkey, 1) = 2) then
    raise exception 'FAIL F2: composite foreign key missing';
  end if;
  passed := array_append(passed, 'F2 a family outside the product''s category is refused');

  -- F3: moving a product to another category drops its old family --------------
  update public.products set category_id = c_kits where slug = 'pince-de-depose';
  if (select family_id from public.products where slug = 'pince-de-depose') is not null then
    raise exception 'FAIL F3: family kept across categories';
  end if;
  passed := array_append(passed, 'F3 a new category clears the family it does not have');

  -- F4: admin_save_product() saves, returns and validates the family ----------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'mgr16.test@example.invalid', '{"first_name":"Mia"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  base := jsonb_build_object(
    'id', p_new, 'category_id', c_mat, 'family_id', f_ess, 'sku', 'MAT-TEST-016', 'slug', 'materiel-test',
    'name', 'Matériel test', 'price', '9.90', 'status', 'active',
    'inventory', jsonb_build_object('track_inventory', true, 'quantity_on_hand', 3, 'low_stock_threshold', 1),
    'media', '[]'::jsonb);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  res := public.admin_save_product(base);
  if res ->> 'family_id' is distinct from f_ess::text then raise exception 'FAIL F4: create returned %', res; end if;
  res := public.admin_save_product(base || jsonb_build_object('family_id', f_acc));
  if (select family_id from public.products where id = p_new) is distinct from f_acc then
    raise exception 'FAIL F4: family not changed';
  end if;
  -- Absent key: the family is left as it is (an older admin never clears it).
  res := public.admin_save_product(base - 'family_id');
  if (select family_id from public.products where id = p_new) is distinct from f_acc or res ? 'family_id' then
    raise exception 'FAIL F4: family changed without the key (%)', res;
  end if;
  res := public.admin_save_product(base || jsonb_build_object('family_id', null));
  if (select family_id from public.products where id = p_new) is not null then raise exception 'FAIL F4: family not cleared'; end if;
  v_state := null;
  begin
    perform public.admin_save_product(base || jsonb_build_object('family_id', f_swar));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL F4: foreign family saved (%)', v_state; end if;
  -- New category, old family still in the payload's absence: cleared, not an error.
  perform public.admin_save_product(base);
  perform public.admin_save_product(base - 'family_id' || jsonb_build_object('category_id', c_kits));
  if (select family_id from public.products where id = p_new) is not null then
    raise exception 'FAIL F4: family kept after a category change';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  passed := array_append(passed, 'F4 admin_save_product: family saved, changed, kept when absent, cleared, refused across categories');

  -- F5: visitors see active families and published names only -----------------
  insert into public.category_families (category_id, slug, name, is_active, position)
  values (c_gems, 'famille-cachee', 'Famille cachée', false, 9) returning id into f_hidden;
  insert into public.category_family_translations (family_id, locale, name, status) values (f_hidden, 'en', 'Hidden', 'published');
  update public.category_family_translations set status = 'draft' where family_id = f_swar and locale = 'en';

  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.category_families where slug = 'famille-cachee';
  if v_cnt <> 0 then raise exception 'FAIL F5: hidden family visible'; end if;
  select count(*) into v_cnt from public.category_families;
  if v_cnt <> 9 then raise exception 'FAIL F5: % families visible', v_cnt; end if;
  select count(*) into v_cnt from public.category_family_translations where family_id in (f_swar, f_hidden);
  if v_cnt <> 0 then raise exception 'FAIL F5: draft or hidden translation visible'; end if;
  v_state := null;
  begin
    insert into public.category_families (category_id, slug, name) values (c_gems, 'intrus', 'Intrus');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F5: anonymous insert (%)', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'F5 visitors read active families and published names only, and cannot write');

  -- F6: the default language lives in the base columns ------------------------
  v_state := null;
  begin
    insert into public.category_family_translations (family_id, locale, name) values (f_ess, 'fr', 'Essentiels');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL F6: default-locale translation accepted (%)', v_state; end if;
  passed := array_append(passed, 'F6 no translation row in the default language');

  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 16 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
