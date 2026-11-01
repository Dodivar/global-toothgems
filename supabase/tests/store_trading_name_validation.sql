-- =============================================================================
-- Trading name validation suite (migration 20261101094412_store_trading_name)
-- =============================================================================
-- Proves (decision 120):
--   T1  admin_save_store_details(): a manage_settings admin saves the trading
--       name, a missing key leaves it unchanged, an empty string clears it, a
--       non-string is refused (22023), a customer is refused (42501);
--   T2  everyone (anon) reads it, like the rest of the store row;
--   T3  private.invoice_seller() freezes it in the seller snapshot, next to
--       the legal name.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL TRADING NAME TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000250001';
  adm     uuid := '00000000-0000-4000-a000-000000250002';
  v_s     public.store_settings;
  v_det   jsonb;
  v_txt   text;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'trading-a.test@example.invalid', now(), now()),
    (adm, 'authenticated', 'authenticated', 'trading-adm.test@example.invalid', now(), now());
  update public.profiles set role = 'admin' where id = adm;

  select * into v_s from public.store_settings where id;
  v_det := jsonb_build_object(
    'store_name', v_s.store_name, 'legal_name', 'Ada Test', 'legal_form', 'Entrepreneur individuel (EI)',
    'share_capital', coalesce(v_s.share_capital, ''), 'registration_number', coalesce(v_s.registration_number, ''),
    'vat_number', coalesce(v_s.vat_number, ''), 'business_email', coalesce(v_s.business_email, ''),
    'support_email', coalesce(v_s.support_email, ''), 'phone', coalesce(v_s.phone, ''),
    'address_line1', coalesce(v_s.address_line1, ''), 'address_line2', coalesce(v_s.address_line2, ''),
    'postal_code', coalesce(v_s.postal_code, ''), 'city', coalesce(v_s.city, ''), 'region', coalesce(v_s.region, ''),
    'country_code', v_s.country_code, 'publication_director', coalesce(v_s.publication_director, ''),
    'publication_director_role', coalesce(v_s.publication_director_role, ''), 'host_name', coalesce(v_s.host_name, ''),
    'host_address', coalesce(v_s.host_address, ''), 'host_contact', coalesce(v_s.host_contact, ''),
    'show_email', v_s.show_email, 'show_phone', v_s.show_phone, 'show_address', v_s.show_address,
    'opening_hours', v_s.opening_hours, 'support_message', coalesce(v_s.support_message, ''));

  -- T1 -------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_save_store_details(v_det || '{"trading_name": "Hacked"}');
    raise exception 'FAIL T1: a customer saved the trading name';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_save_store_details(v_det || '{"trading_name": "  Test Trading  "}');
  if (select trading_name from public.store_settings where id) is distinct from 'Test Trading' then
    raise exception 'FAIL T1: trading name not saved (trimmed)';
  end if;
  perform public.admin_save_store_details(v_det);
  if (select trading_name from public.store_settings where id) is distinct from 'Test Trading' then
    raise exception 'FAIL T1: a missing key changed the trading name';
  end if;
  begin
    perform public.admin_save_store_details(v_det || '{"trading_name": 12}');
    raise exception 'FAIL T1: a non-string trading name was accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.admin_save_store_details(v_det || '{"trading_name": ""}');
  if (select trading_name from public.store_settings where id) is not null then
    raise exception 'FAIL T1: an empty trading name did not clear it';
  end if;
  perform public.admin_save_store_details(v_det || '{"trading_name": "Test Trading"}');
  execute 'reset role';
  passed := passed || 'T1'::text;

  -- T2 -------------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select trading_name into v_txt from public.store_settings where id;
  execute 'reset role';
  if v_txt is distinct from 'Test Trading' then raise exception 'FAIL T2: anon reads %', v_txt; end if;
  passed := passed || 'T2'::text;

  -- T3 -------------------------------------------------------------------------
  if private.invoice_seller() ->> 'trading_name' is distinct from 'Test Trading'
     or private.invoice_seller() ->> 'legal_name' is distinct from 'Ada Test' then
    raise exception 'FAIL T3: seller snapshot %', private.invoice_seller();
  end if;
  passed := passed || 'T3'::text;

  raise exception 'ALL TRADING NAME TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
