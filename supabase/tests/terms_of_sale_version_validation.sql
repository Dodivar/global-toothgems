-- =============================================================================
-- Terms of sale version validation suite
-- (migration 20261109194750_terms_of_sale_version, decision 130)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   T1  the service role (create-checkout-session) records the version on a new order;
--   T2  once recorded it never changes, not even for the service role (42501);
--   T3  a malformed version is refused (23514);
--   T4  a member cannot write a version on their own order (nothing changes);
--   T5  the service role records the version on a Studio immediate-access consent;
--   T6  a member's own consent insert cannot claim a version (42501), but still
--       records a consent without one.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL TERMS OF SALE VERSION TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000430001';
  o1      uuid;
  addr    jsonb := '{"first_name":"Ada","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  v_state text;
  v_ver   text;
  v_cnt   int;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'terms-version-1.test@example.invalid', now(), now());

  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount,
                             tax_country_code, locale)
  values (m1, 'terms-version-1.test@example.invalid', addr, addr, 'EUR', 0, 0, 0, 0, 0, 'FR', 'fr')
  returning id into o1;

  -- T1 ----------------------------------------------------------------------------
  perform set_config('role', 'service_role', true);
  update public.orders set terms_version = '2026-11-09' where id = o1 and terms_version is null;
  select terms_version into v_ver from public.orders where id = o1;
  if v_ver is distinct from '2026-11-09' then raise exception 'FAIL T1: version not recorded (%)', v_ver; end if;
  passed := passed || 'T1'::text;

  -- T2 ----------------------------------------------------------------------------
  v_state := null;
  begin
    update public.orders set terms_version = '2026-12-01' where id = o1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T2: a recorded version changed (%)', v_state; end if;
  v_state := null;
  begin
    update public.orders set terms_version = null where id = o1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T2: a recorded version was cleared (%)', v_state; end if;
  passed := passed || 'T2'::text;

  -- T3 ----------------------------------------------------------------------------
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source, terms_version)
    values (m1, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout', 'v1');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL T3: malformed version accepted (%)', v_state; end if;
  passed := passed || 'T3'::text;

  -- T5 ----------------------------------------------------------------------------
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, terms_version)
  values (m1, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout', '2026-11-09');
  select count(*) into v_cnt from public.consent_records
   where user_id = m1 and purpose = 'studio_immediate_access' and terms_version = '2026-11-09';
  if v_cnt <> 1 then raise exception 'FAIL T5: Studio consent version recorded % time(s)', v_cnt; end if;
  passed := passed || 'T5'::text;

  -- T4: the member, on their own order (the order's update policy and the guard both stand in the way).
  perform set_config('role', 'service_role', true);
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount,
                             tax_country_code, locale)
  values (m1, 'terms-version-1.test@example.invalid', addr, addr, 'EUR', 0, 0, 0, 0, 0, 'FR', 'fr')
  returning id into o1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m1, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    update public.orders set terms_version = '2026-11-09' where id = o1;
  exception when others then v_state := sqlstate;
  end;
  perform set_config('role', 'service_role', true);
  select terms_version into v_ver from public.orders where id = o1;
  if v_ver is not null then raise exception 'FAIL T4: a member wrote the version of their order (%)', v_state; end if;
  passed := passed || 'T4'::text;

  -- T6 ----------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source, terms_version)
    values (m1, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout', '2026-11-09');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T6: a member claimed a terms version (%)', v_state; end if;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (m1, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout');
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.consent_records where user_id = m1 and purpose = 'studio_immediate_access';
  if v_cnt <> 2 then raise exception 'FAIL T6: member consent without a version not recorded (% rows)', v_cnt; end if;
  passed := passed || 'T6'::text;

  raise exception 'ALL TERMS OF SALE VERSION TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
