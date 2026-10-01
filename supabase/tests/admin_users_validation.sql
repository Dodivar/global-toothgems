-- =============================================================================
-- Back-office team validation suite — what `/admin/utilisateurs` reads and
-- writes (webapp `lib/adminUsers.tsx`) and what the Edge Function
-- `invite-staff-member` does with the caller's JWT.
-- =============================================================================
-- No schema change: this proves the existing rules of iteration 6
-- (`staff_directory()`, `my_permissions()`, RLS on `profiles` /
-- `staff_profiles` / the permission matrix, `private.guard_profile_update()`,
-- `private.guard_staff_profile()`, audit):
--
--   * a read-only member (`viewer`) reads the team and the matrix and changes
--     nothing (role, status, names, staff details);
--   * a manager neither promotes anyone to administrator nor touches an
--     administrator (role, status, staff details, removal of staff details),
--     but manages ranks up to manager — the writes the screen and the
--     function make — and the change is audited with the manager as actor;
--   * nobody changes their own role or status, administrators included;
--   * a customer does not read the team directory, staff details or matrix;
--   * a suspended member loses every access at once;
--   * a visitor cannot call the directory.
--
-- Requires all migrations. Accounts are created as the table owner. ONE
-- transaction, ALWAYS rolled back by raising `ALL ADMIN USERS TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  admin1  uuid := '00000000-0000-4000-a000-000000220001';
  admin2  uuid := '00000000-0000-4000-a000-000000220002';
  mgr     uuid := '00000000-0000-4000-a000-000000220003';
  mgr2    uuid := '00000000-0000-4000-a000-000000220004';
  vw      uuid := '00000000-0000-4000-a000-000000220005';
  cust    uuid := '00000000-0000-4000-a000-000000220006';
  cust2   uuid := '00000000-0000-4000-a000-000000220007';
  susp    uuid := '00000000-0000-4000-a000-000000220008';
  v_cnt   int;
  v_txt   text;
  v_uuid  uuid;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at, last_sign_in_at) values
    (admin1, 'authenticated', 'authenticated', 'adminusers-a1.test@example.invalid', now(), now(), now()),
    (admin2, 'authenticated', 'authenticated', 'adminusers-a2.test@example.invalid', now(), now(), now()),
    (mgr,    'authenticated', 'authenticated', 'adminusers-m1.test@example.invalid', now(), now(), now()),
    (mgr2,   'authenticated', 'authenticated', 'adminusers-m2.test@example.invalid', now(), now(), now()),
    (vw,     'authenticated', 'authenticated', 'adminusers-v.test@example.invalid',  now(), now(), now()),
    (cust,   'authenticated', 'authenticated', 'adminusers-c1.test@example.invalid', now(), now(), now()),
    (cust2,  'authenticated', 'authenticated', 'adminusers-c2.test@example.invalid', now(), now(), now()),
    (susp,   'authenticated', 'authenticated', 'adminusers-s.test@example.invalid',  now(), now(), null);
  update public.profiles set role = 'admin'   where id in (admin1, admin2);
  update public.profiles set role = 'manager' where id in (mgr, mgr2, susp);
  update public.profiles set role = 'viewer'  where id = vw;
  insert into public.staff_profiles (user_id, team, job_title) values
    (admin1, 'leadership', 'Founder'),
    (mgr2,   'operations', 'Logistics'),
    (vw,     'finance',    'Accountant'),
    (susp,   'marketing',  null);

  -- Read-only member ------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated')::text, true);

  -- V1: reads the team (with statuses) and the matrix
  select count(*) into v_cnt from public.staff_directory() where user_id in (admin1, admin2, mgr, mgr2, vw, susp);
  if v_cnt <> 6 then raise exception 'FAIL V1: viewer reads % of 6 team members', v_cnt; end if;
  select status into v_txt from public.staff_directory() where user_id = susp;
  if v_txt <> 'invited' then raise exception 'FAIL V1: never signed in should read invited, got %', v_txt; end if;
  if (select count(*) from public.staff_directory() where user_id in (cust, cust2)) <> 0 then
    raise exception 'FAIL V1: the directory lists customers';
  end if;
  if (select count(*) from public.role_permissions) = 0 or (select count(*) from public.permissions) = 0 then
    raise exception 'FAIL V1: viewer cannot read the permission matrix';
  end if;
  if exists (select 1 from public.my_permissions() p where p = 'manage_users') then
    raise exception 'FAIL V1: viewer holds manage_users';
  end if;
  passed := passed || 'V1'::text;

  -- V2: changes nothing (RLS leaves no row to update; inserts are refused)
  update public.profiles set role = 'manager' where id = cust;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V2: viewer promoted a customer'; end if;
  update public.profiles set status = 'suspended' where id = mgr2;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V2: viewer suspended a member'; end if;
  update public.profiles set first_name = 'Renamed' where id = mgr2;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V2: viewer renamed a member'; end if;
  update public.staff_profiles set team = 'academy' where user_id = mgr2;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V2: viewer changed staff details'; end if;
  delete from public.staff_profiles where user_id = mgr2;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL V2: viewer removed staff details'; end if;
  begin
    insert into public.staff_profiles (user_id, team) values (cust, 'operations');
    raise exception 'FAIL V2: viewer inserted staff details';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.role_permissions (role_key, permission_key) values ('viewer', 'manage_users');
    raise exception 'FAIL V2: viewer granted a permission';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'V2'::text;

  -- Manager -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  -- M1: never promotes anyone to administrator
  begin
    update public.profiles set role = 'admin' where id = cust;
    raise exception 'FAIL M1: manager promoted a customer to admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'admin' where id = mgr2;
    raise exception 'FAIL M1: manager promoted a manager to admin';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'M1'::text;

  -- M2: never touches an administrator (role, status, names, staff details, removal)
  begin
    update public.profiles set role = 'viewer' where id = admin1;
    raise exception 'FAIL M2: manager demoted an admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set status = 'suspended' where id = admin1;
    raise exception 'FAIL M2: manager suspended an admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set first_name = 'Renamed' where id = admin1;
    raise exception 'FAIL M2: manager renamed an admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.staff_profiles set team = 'finance' where user_id = admin1;
    raise exception 'FAIL M2: manager changed an admin''s staff details';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.staff_profiles where user_id = admin1;
    raise exception 'FAIL M2: manager removed an admin''s staff details';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_profiles (user_id, team) values (admin2, 'leadership');
    raise exception 'FAIL M2: manager created an admin''s staff details';
  exception when insufficient_privilege then null;
  end;
  if (select role from public.profiles where id = admin1) <> 'admin' then raise exception 'FAIL M2: admin changed'; end if;
  passed := passed || 'M2'::text;

  -- M3: manages ranks up to manager — the screen's and the function's writes
  update public.profiles set role = 'manager', first_name = 'Nora', last_name = 'Martin' where id = cust;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL M3: manager could not promote a customer to manager'; end if;
  insert into public.staff_profiles (user_id, team, job_title) values (cust, 'customer_care', 'Care')
    on conflict (user_id) do update set team = excluded.team, job_title = excluded.job_title;
  select invited_by into v_uuid from public.staff_profiles where user_id = cust;
  if v_uuid is distinct from mgr then raise exception 'FAIL M3: inviter not stamped (%)', v_uuid; end if;
  update public.profiles set role = 'viewer' where id = mgr2;
  update public.profiles set status = 'suspended' where id = mgr2;
  update public.profiles set status = 'active' where id = mgr2;
  update public.staff_profiles set team = 'academy', job_title = 'Trainer' where user_id = vw;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL M3: manager could not edit staff details'; end if;
  begin
    update public.staff_profiles set invited_by = admin1 where user_id = cust;
    raise exception 'FAIL M3: the inviter was rewritten';
  exception when insufficient_privilege then null;
  end;
  -- Withdrawing an invitation (function, caller's JWT): staff details removed, role back to customer.
  delete from public.staff_profiles where user_id = cust;
  update public.profiles set role = 'customer' where id = cust;
  if (select role from public.profiles where id = cust) <> 'customer' then raise exception 'FAIL M3: revocation'; end if;
  passed := passed || 'M3'::text;

  -- S1: nobody changes their own role or status
  begin
    update public.profiles set role = 'viewer' where id = mgr;
    raise exception 'FAIL S1: manager changed their own role';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set status = 'suspended' where id = mgr;
    raise exception 'FAIL S1: manager changed their own status';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set first_name = 'Myself' where id = mgr;  -- own names stay editable
  perform set_config('request.jwt.claims', json_build_object('sub', admin1, 'role', 'authenticated')::text, true);
  begin
    update public.profiles set role = 'manager' where id = admin1;
    raise exception 'FAIL S1: admin changed their own role';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set status = 'suspended' where id = admin1;
    raise exception 'FAIL S1: admin changed their own status';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'S1'::text;

  -- U1: an administrator manages administrators; every change is audited with its actor
  update public.profiles set role = 'admin' where id = cust2;
  update public.profiles set role = 'manager' where id = cust2;
  if not exists (select 1 from public.audit_logs
                  where table_name = 'profiles' and record_id = cust::text and actor_id = mgr
                    and changes ? 'role') then
    raise exception 'FAIL U1: the manager''s role change is not audited';
  end if;
  if not exists (select 1 from public.audit_logs
                  where table_name = 'staff_profiles' and record_id = cust::text and actor_id = mgr) then
    raise exception 'FAIL U1: staff details changes are not audited';
  end if;
  passed := passed || 'U1'::text;

  -- Suspension: an administrator suspends a manager, who loses access at once
  update public.profiles set status = 'suspended' where id = susp;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL X1: admin could not suspend'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', susp, 'role', 'authenticated')::text, true);

  -- X1: no directory, no permission, no write, no staff read
  begin
    perform public.staff_directory();
    raise exception 'FAIL X1: a suspended member reads the directory';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.my_permissions()) then raise exception 'FAIL X1: a suspended member keeps permissions'; end if;
  if (select count(*) from public.profiles where id <> susp) <> 0 then
    raise exception 'FAIL X1: a suspended member reads other profiles';
  end if;
  if (select count(*) from public.role_permissions) <> 0 then raise exception 'FAIL X1: a suspended member reads the matrix'; end if;
  update public.profiles set role = 'viewer' where id = vw;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL X1: a suspended member changed a role'; end if;
  passed := passed || 'X1'::text;

  -- Customer --------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);

  -- C1: no directory, no staff details, no matrix, no permission, no promotion of themselves
  begin
    perform public.staff_directory();
    raise exception 'FAIL C1: a customer reads the directory';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.staff_profiles) <> 0 then raise exception 'FAIL C1: a customer reads staff details'; end if;
  if (select count(*) from public.role_permissions) <> 0 or (select count(*) from public.permissions) <> 0 then
    raise exception 'FAIL C1: a customer reads the matrix';
  end if;
  if exists (select 1 from public.my_permissions()) then raise exception 'FAIL C1: a customer holds permissions'; end if;
  begin
    update public.profiles set role = 'viewer' where id = cust;
    raise exception 'FAIL C1: a customer gave themselves a role';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'C1'::text;

  -- Anonymous visitor ---------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  -- A1: cannot call the directory nor read staff details
  begin
    perform public.staff_directory();
    raise exception 'FAIL A1: anon calls the directory';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_cnt from public.staff_profiles;
    if v_cnt <> 0 then raise exception 'FAIL A1: anon reads % staff rows', v_cnt; end if;
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'A1'::text;

  raise exception 'ALL ADMIN USERS TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
