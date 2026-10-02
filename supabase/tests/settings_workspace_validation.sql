-- =============================================================================
-- Settings workspace validation suite (migration `…_settings_workspace`).
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL SETTINGS WORKSPACE TESTS PASSED` (or `FAIL: ...`).
-- Covers what /admin/parametres writes: visitors, customers and read-only staff
-- refused every save; store details (validation, translations, public read);
-- the shipping configuration saved as a whole (a no-op save writes nothing, a
-- country moves between zones, rates are deleted, malformed input is refused);
-- VAT rates replaced as a set; languages (storefront languages and the default
-- locked); every served EU country has a VAT rate.
-- =============================================================================

do $$
declare
  adm  uuid := '00000000-0000-4000-a000-0000000d0001';  -- admin: manage_settings
  vwr  uuid := '00000000-0000-4000-a000-0000000d0002';  -- viewer: reads only
  cst  uuid := '00000000-0000-4000-a000-0000000d0003';  -- customer
  v_details jsonb;
  v_zones   jsonb;
  v_bad     jsonb;
  v_rates   jsonb;
  v_cnt     int;
  v_txt     text;
  v_who     text;
  v_fn      text;
  v_state   text;
  v_fr      uuid;
  v_eu      uuid;
  v_audit   bigint;
  v_settings public.store_settings;
  passed    text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (adm, 'authenticated', 'authenticated', 'set.adm.test@example.invalid', '{"first_name":"Ada"}', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'set.vwr.test@example.invalid', '{"first_name":"Val"}', now(), now()),
    (cst, 'authenticated', 'authenticated', 'set.cst.test@example.invalid', '{"first_name":"Cleo"}', now(), now());
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set role = 'viewer' where id = vwr;

  select id into v_fr from public.shipping_zones where name = 'France';
  select id into v_eu from public.shipping_zones where name = 'Union européenne';

  -- The current shipping configuration, in the function's format.
  select jsonb_agg(jsonb_build_object(
           'id', z.id, 'name', z.name, 'is_rest_of_world', z.is_rest_of_world, 'is_active', z.is_active,
           'countries', coalesce((select jsonb_agg(c.country_code order by c.country_code)
                                    from public.shipping_zone_countries c where c.zone_id = z.id), '[]'::jsonb),
           'rates', coalesce((select jsonb_agg(jsonb_build_object(
                       'id', r.id, 'kind', r.kind, 'name', r.name, 'min_days', r.min_days, 'max_days', r.max_days,
                       'price', r.price::text, 'free_over_amount', r.free_over_amount::text,
                       'min_order_amount', r.min_order_amount::text, 'max_order_amount', r.max_order_amount::text,
                       'min_weight_grams', r.min_weight_grams, 'max_weight_grams', r.max_weight_grams,
                       'is_active', r.is_active) order by r.position, r.id)
                       from public.shipping_rates r where r.zone_id = z.id), '[]'::jsonb))
         order by z.position, z.id)
    into v_zones
    from public.shipping_zones z;
  select jsonb_agg(jsonb_build_object('country_code', t.country_code, 'tax_category', t.tax_category,
                                      'rate_bp', t.rate_bp, 'is_active', t.is_active))
    into v_rates from public.tax_rates t;

  v_details := jsonb_build_object(
    'store_name', 'Global Toothgems', 'legal_name', 'Global Toothgems SAS', 'legal_form', 'SAS',
    'share_capital', '10 000 €', 'registration_number', 'RCS Paris 123 456 789', 'vat_number', 'fr 12 345678901',
    'business_email', 'Hello@Example.com', 'support_email', 'support@example.com', 'phone', '+33 1 23 45 67 89',
    'address_line1', '1 rue Fictive', 'address_line2', '', 'postal_code', '75004', 'city', 'Paris', 'region', '',
    'country_code', 'fr', 'publication_director', 'Ada Test', 'publication_director_role', 'Présidente',
    'host_name', 'Hébergeur Test', 'host_address', '1 avenue Fictive, 75001 Paris',
    'host_contact', 'hebergeur.example', 'show_email', true, 'show_phone', true, 'show_address', false,
    'opening_hours', '{"mon": {"open": true, "from": "09:30", "to": "18:00"}, "tue": {"open": true, "from": "09:30", "to": "18:00"},
                      "wed": {"open": true, "from": "09:30", "to": "18:00"}, "thu": {"open": true, "from": "09:30", "to": "18:00"},
                      "fri": {"open": true, "from": "09:30", "to": "17:00"}, "sat": {"open": false, "from": "10:00", "to": "13:00"},
                      "sun": {"open": false, "from": "10:00", "to": "13:00"}}'::jsonb,
    'support_message', 'Réponse sous un jour ouvré.',
    'translations', jsonb_build_object('en', jsonb_build_object('support_message', 'We answer within one business day.')));

  -- ===========================================================================
  -- D1 every served EU country (and Monaco) has an active standard VAT rate
  -- ===========================================================================
  select count(*), string_agg(c.country_code, ',') into v_cnt, v_txt
    from public.shipping_zone_countries c
    join public.shipping_zones z on z.id = c.zone_id and z.is_active
   where c.country_code not in ('GB', 'CH', 'LI', 'US', 'CA')   -- outside the EU VAT area
     and not exists (select 1 from public.tax_rates t
                      where t.country_code = c.country_code and t.tax_category = 'standard' and t.is_active);
  if v_cnt <> 0 then raise exception 'FAIL D1: served EU countries without VAT: %', v_txt; end if;
  if public.vat_rate_bp('PL') <> 2300 or public.vat_rate_bp('MC') <> 2000 or public.vat_rate_bp('IE') <> 2300 then
    raise exception 'FAIL D1: PL/MC/IE rates';
  end if;
  passed := array_append(passed, 'D1 every served EU country and Monaco has a standard VAT rate');

  perform set_config('role', 'authenticated', true);

  -- ===========================================================================
  -- R1 visitors, customers and read-only staff are refused every save
  -- ===========================================================================
  foreach v_who in array array['anon', cst::text, vwr::text] loop
    if v_who = 'anon' then
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role": "anon"}', true);
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
    end if;
    foreach v_fn in array array['store', 'shipping', 'taxes', 'languages', 'direct_store', 'direct_lang', 'direct_tr'] loop
      v_state := null;
      begin
        case v_fn
          when 'store' then perform public.admin_save_store_details(v_details);
          when 'shipping' then perform public.admin_save_shipping(v_zones);
          when 'taxes' then perform public.admin_save_tax_rates(v_rates);
          when 'languages' then perform public.admin_save_languages('[{"code": "de", "is_enabled": false}]');
          when 'direct_store' then
            update public.store_settings set store_name = 'Hacked' where id;
            get diagnostics v_cnt = row_count;
            if v_cnt > 0 then v_state := 'WROTE'; end if;
          when 'direct_lang' then
            update public.languages set is_enabled = false where code = 'de';
            get diagnostics v_cnt = row_count;
            if v_cnt > 0 then v_state := 'WROTE'; end if;
          else
            insert into public.store_settings_translations (locale, support_message) values ('de', 'x');
            v_state := 'WROTE';
        end case;
      exception when others then v_state := sqlstate;
      end;
      if v_fn like 'direct%' then
        if v_state = 'WROTE' then raise exception 'FAIL R1: % wrote % directly', v_who, v_fn; end if;
      elsif v_state is distinct from '42501' then
        raise exception 'FAIL R1: % called % (%)', v_who, v_fn, v_state;
      end if;
    end loop;
  end loop;
  perform set_config('role', 'authenticated', true);
  passed := array_append(passed, 'R1 visitors, customers and viewers refused every save and direct write');

  -- ===========================================================================
  -- S1 store details: saved, normalised, translated, publicly readable
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_save_store_details(v_details);
  select * into v_settings from public.store_settings where id;
  if v_settings.vat_number <> 'FR12345678901' or v_settings.business_email <> 'hello@example.com'
     or v_settings.country_code <> 'FR' or v_settings.address_line2 is not null or v_settings.region is not null
     or v_settings.legal_name <> 'Global Toothgems SAS' or not v_settings.show_phone
     or v_settings.opening_hours -> 'fri' ->> 'to' <> '17:00' or v_settings.updated_by <> adm
     or v_settings.maintenance_enabled then
    raise exception 'FAIL S1: saved row %', row_to_json(v_settings);
  end if;
  select support_message into v_txt from public.store_settings_translations where locale = 'en';
  if v_txt is distinct from 'We answer within one business day.' then raise exception 'FAIL S1: en message %', v_txt; end if;
  -- An empty translation removes the row.
  perform public.admin_save_store_details(v_details || '{"translations": {"en": {"support_message": "  "}}}');
  select count(*) into v_cnt from public.store_settings_translations;
  if v_cnt <> 0 then raise exception 'FAIL S1: empty translation kept'; end if;
  -- Visitors read it (legal notice / contact page).
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  select legal_name into v_txt from public.store_settings where id;
  if v_txt is distinct from 'Global Toothgems SAS' then raise exception 'FAIL S1: anon cannot read the legal name'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  passed := array_append(passed, 'S1 store details saved (normalised VAT number and e-mail, empty = null), translations, public read');

  -- S2 malformed details refused, nothing half-written
  foreach v_txt in array array[
    '{"support_email": "not-an-email"}', '{"phone": "call me"}', '{"vat_number": "123"}',
    '{"store_name": "  "}', '{"show_email": "yes"}',
    '{"opening_hours": {"mon": {"open": true, "from": "18:00", "to": "09:00"}}}',
    '{"translations": {"fr": {"support_message": "x"}}}', '{"translations": {"xx": {"support_message": "x"}}}'] loop
    v_state := null;
    begin
      perform public.admin_save_store_details(v_details || (v_txt::jsonb) || '{"legal_name": "Partial"}');
    exception when others then v_state := sqlstate;
    end;
    if v_state not in ('22023', '23514') or v_state is null then
      raise exception 'FAIL S2: % accepted (%)', v_txt, v_state;
    end if;
  end loop;
  v_state := null;
  begin
    perform public.admin_save_store_details(v_details - 'host_name');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL S2: missing key accepted (%)', v_state; end if;
  if (select legal_name from public.store_settings where id) <> 'Global Toothgems SAS' then
    raise exception 'FAIL S2: a refused save wrote something';
  end if;
  passed := array_append(passed, 'S2 malformed e-mail, phone, VAT number, hours, name, language or missing key refused atomically');

  -- ===========================================================================
  -- H1 shipping: saving the configuration unchanged writes nothing
  -- ===========================================================================
  select count(*) into v_audit from public.audit_logs where table_name in ('shipping_zones', 'shipping_rates');
  perform public.admin_save_shipping(v_zones);
  select count(*) into v_cnt from public.audit_logs where table_name in ('shipping_zones', 'shipping_rates');
  if v_cnt <> v_audit then raise exception 'FAIL H1: a no-op save wrote % audit rows', v_cnt - v_audit; end if;
  passed := array_append(passed, 'H1 an unchanged shipping configuration saves without writing');

  -- H2 a country moves zone, a rate is deleted, a zone and a rate are added, in one save
  v_zones := (
    select jsonb_agg(
             case when (z ->> 'id')::uuid = v_fr then
                    jsonb_set(jsonb_set(z, '{countries}', '["FR"]'),
                              '{rates}', (select jsonb_agg(r) from jsonb_array_elements(z -> 'rates') r where r ->> 'kind' <> 'express'))
                  when (z ->> 'id')::uuid = v_eu then jsonb_set(z, '{countries}', (z -> 'countries') || '["MC"]')
                  else z end)
      from jsonb_array_elements(v_zones) z)
    || jsonb_build_array(jsonb_build_object(
         'id', '00000000-0000-4000-a000-0000000d00a1', 'name', 'Japon', 'is_rest_of_world', false, 'is_active', true,
         'countries', '["JP"]'::jsonb,
         'rates', jsonb_build_array(jsonb_build_object(
           'id', '00000000-0000-4000-a000-0000000d00b1', 'kind', 'standard', 'name', 'Japan Post', 'min_days', 7,
           'max_days', 14, 'price', '24.90', 'free_over_amount', null, 'min_order_amount', null,
           'max_order_amount', null, 'min_weight_grams', null, 'max_weight_grams', 2000, 'is_active', true))));
  perform public.admin_save_shipping(v_zones);
  if public.shipping_zone_for_country('MC') <> v_eu or public.shipping_zone_for_country('FR') <> v_fr
     or public.shipping_zone_for_country('JP') <> '00000000-0000-4000-a000-0000000d00a1' then
    raise exception 'FAIL H2: zone resolution after the move';
  end if;
  select count(*) into v_cnt from public.shipping_rates where zone_id = v_fr and kind = 'express';
  if v_cnt <> 0 then raise exception 'FAIL H2: deleted rate still there'; end if;
  select count(*) into v_cnt from public.shipping_rates
   where id = '00000000-0000-4000-a000-0000000d00b1' and price = 24.90 and max_weight_grams = 2000 and created_by = adm;
  if v_cnt <> 1 then raise exception 'FAIL H2: new rate not saved'; end if;
  passed := array_append(passed, 'H2 one save moves a country, deletes a rate, adds a zone and a rate');

  -- H3 malformed configurations refused
  foreach v_txt in array array['dup_country', 'two_row', 'bad_amount', 'free_not_free', 'dup_name', 'bad_id'] loop
    v_bad := case v_txt
      when 'dup_country' then v_zones || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'Doublon',
                                 'is_rest_of_world', false, 'is_active', true, 'countries', '["FR"]'::jsonb, 'rates', '[]'::jsonb))
      when 'two_row' then v_zones || jsonb_build_array(
                            jsonb_build_object('id', gen_random_uuid(), 'name', 'Monde 1', 'is_rest_of_world', true,
                                               'is_active', true, 'countries', '[]'::jsonb, 'rates', '[]'::jsonb),
                            jsonb_build_object('id', gen_random_uuid(), 'name', 'Monde 2', 'is_rest_of_world', true,
                                               'is_active', true, 'countries', '[]'::jsonb, 'rates', '[]'::jsonb))
      when 'bad_amount' then jsonb_set(v_zones, '{0,rates,0,price}', '"4.999"')
      when 'free_not_free' then jsonb_set(jsonb_set(v_zones, '{0,rates,0,kind}', '"free"'), '{0,rates,0,price}', '"5"')
      when 'dup_name' then jsonb_set(v_zones, '{1,name}', to_jsonb(v_zones -> 0 ->> 'name'))
      else jsonb_set(v_zones, '{0,id}', '"zone-fr"') end;
    v_state := null;
    begin
      perform public.admin_save_shipping(v_bad);
    exception when others then v_state := sqlstate;
    end;
    if v_state is null or v_state not in ('22023', '23514') then
      raise exception 'FAIL H3: % accepted (%)', v_txt, v_state;
    end if;
  end loop;
  passed := array_append(passed, 'H3 duplicate country or name, two rest-of-world zones, sub-cent or non-free free rate, bad id refused');

  -- ===========================================================================
  -- T1 VAT rates replaced as a set
  -- ===========================================================================
  v_rates := (select jsonb_agg(r) from jsonb_array_elements(v_rates) r where r ->> 'country_code' <> 'PL')
             || '[{"country_code": "FR", "tax_category": "training", "rate_bp": 0, "is_active": true}]';
  perform public.admin_save_tax_rates(v_rates);
  if public.vat_rate_bp('PL') <> 0 or public.vat_rate_bp('FR', 'training') <> 0 or public.vat_rate_bp('FR') <> 2000 then
    raise exception 'FAIL T1: rates after save';
  end if;
  foreach v_txt in array array[
    '[{"country_code": "FR", "tax_category": "standard", "rate_bp": 2000, "is_active": true}, {"country_code": "FR", "tax_category": "standard", "rate_bp": 550, "is_active": true}]',
    '[{"country_code": "FR", "tax_category": "standard", "rate_bp": 20.5, "is_active": true}]',
    '[{"country_code": "FR", "tax_category": "luxury", "rate_bp": 2000, "is_active": true}]',
    '[{"country_code": "fr", "tax_category": "standard", "rate_bp": 2000, "is_active": true}]'] loop
    v_state := null;
    begin
      perform public.admin_save_tax_rates(v_txt::jsonb);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL T1: % accepted (%)', v_txt, v_state; end if;
  end loop;
  passed := array_append(passed, 'T1 VAT rates replaced as a set (removed country falls back to 0); duplicates and fractions refused');

  -- ===========================================================================
  -- L1 languages: switch a content language, never a storefront one or the default
  -- ===========================================================================
  perform public.admin_save_languages('[{"code": "de", "is_enabled": false}, {"code": "it", "is_enabled": true}]');
  if (select is_enabled from public.languages where code = 'de') or not (select is_enabled from public.languages where code = 'it') then
    raise exception 'FAIL L1: de/it not switched';
  end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'languages' and record_id in ('de', 'it') and actor_id = adm;
  if v_cnt <> 2 then raise exception 'FAIL L1: language switches not audited (%)', v_cnt; end if;
  foreach v_txt in array array['[{"code": "en", "is_enabled": false}]', '[{"code": "fr", "is_enabled": false}]',
                               '[{"code": "xx", "is_enabled": true}]'] loop
    v_state := null;
    begin
      perform public.admin_save_languages(v_txt::jsonb);
    exception when others then v_state := sqlstate;
    end;
    if v_state is null or v_state not in ('22023', '23514') then raise exception 'FAIL L1: % accepted (%)', v_txt, v_state; end if;
  end loop;
  v_state := null;
  begin
    update public.languages set is_default = (code = 'en');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL L1: is_default writable (%)', v_state; end if;
  passed := array_append(passed, 'L1 content languages switched and audited; fr/en and the default locked');

  execute 'reset role';
  raise exception 'ALL SETTINGS WORKSPACE TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
