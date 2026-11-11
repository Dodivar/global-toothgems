-- =============================================================================
-- Staff second factor validation suite — migration `staff_mfa_required`.
-- =============================================================================
-- Every staff right (private.is_staff(), private.has_permission(), and so
-- every back-office policy, staff RPC and my_permissions()) needs a session
-- at assurance level aal2 (Supabase Auth MFA):
--
--   M1  an active administrator at aal1 (password only) reads nothing of the
--       back office, holds no permission and writes nothing;
--   M2  a token without the `aal` claim counts as aal1, never as aal2;
--   M3  the same administrator at aal2 reads and writes;
--   M4  a customer at aal2 gets nothing more than before;
--   M5  the account's own profile stays readable at aal1 (the browser needs
--       it to recognise a staff session and show the second-factor screen).
--
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL STAFF MFA TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  adm    uuid := '00000000-0000-4000-a000-000000310001';
  cst    uuid := '00000000-0000-4000-a000-000000310002';
  v_cnt  int;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at, last_sign_in_at) values
    (adm, 'authenticated', 'authenticated', 'staffmfa-a.test@example.invalid', now(), now(), now()),
    (cst, 'authenticated', 'authenticated', 'staffmfa-c.test@example.invalid', now(), now(), now());
  update public.profiles set role = 'admin' where id = adm;

  perform set_config('role', 'authenticated', true);

  -- M1: administrator at aal1 ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', adm, 'role', 'authenticated')::text, true);
  if private.is_staff() then raise exception 'FAIL M1: is_staff() true at aal1'; end if;
  if private.has_permission('manage_users') then raise exception 'FAIL M1: has_permission() true at aal1'; end if;
  if exists (select 1 from public.my_permissions()) then raise exception 'FAIL M1: my_permissions() lists rights at aal1'; end if;
  select count(*) into v_cnt from public.profiles where id = cst;
  if v_cnt <> 0 then raise exception 'FAIL M1: reads a customer profile at aal1'; end if;
  select count(*) into v_cnt from public.role_permissions;
  if v_cnt <> 0 then raise exception 'FAIL M1: reads the permission matrix at aal1'; end if;
  update public.profiles set first_name = 'Changed' where id = cst;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL M1: updated a customer at aal1'; end if;
  passed := passed || 'M1'::text;

  -- M2: no aal claim ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  if private.is_staff() or private.has_permission('manage_users') then
    raise exception 'FAIL M2: a token without aal counts as aal2';
  end if;
  passed := passed || 'M2'::text;

  -- M5: own profile at aal1 -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt
    from public.profiles p join public.roles r on r.key = p.role
   where p.id = adm and p.status = 'active' and r.is_staff;
  if v_cnt <> 1 then raise exception 'FAIL M5: own staff profile unreadable at aal1'; end if;
  passed := passed || 'M5'::text;

  -- M3: administrator at aal2 ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', adm, 'role', 'authenticated')::text, true);
  if not private.is_staff() then raise exception 'FAIL M3: is_staff() false at aal2'; end if;
  if not exists (select 1 from public.my_permissions() p where p = 'manage_users') then
    raise exception 'FAIL M3: my_permissions() misses manage_users at aal2';
  end if;
  select count(*) into v_cnt from public.profiles where id = cst;
  if v_cnt <> 1 then raise exception 'FAIL M3: cannot read a customer profile at aal2'; end if;
  update public.profiles set first_name = 'Changed' where id = cst;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL M3: cannot update a customer at aal2'; end if;
  passed := passed || 'M3'::text;

  -- M4: customer at aal2 --------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', cst, 'role', 'authenticated')::text, true);
  if private.is_staff() or private.has_permission('manage_users') then
    raise exception 'FAIL M4: a customer at aal2 gets staff rights';
  end if;
  select count(*) into v_cnt from public.profiles where id = adm;
  if v_cnt <> 0 then raise exception 'FAIL M4: a customer reads another profile'; end if;
  passed := passed || 'M4'::text;

  raise exception 'ALL STAFF MFA TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
