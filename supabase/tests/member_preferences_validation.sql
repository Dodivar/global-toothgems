-- =============================================================================
-- Member preferences validation suite (migration 20261111181710_member_preferences)
-- =============================================================================
--   P1  a visitor reads and writes nothing;
--   P2  a member has no row by default, creates it with an upsert (as the
--       webapp does) and clears it again;
--   P3  the owner and timestamps are not writable, no row can be forged;
--   P4  another member reads none of it and changes nothing.
-- ONE transaction, ALWAYS rolled back by raising `ALL MEMBER PREFERENCES TESTS PASSED`.
-- =============================================================================

do $$
declare
  m1 uuid := '00000000-0000-4000-a000-000000380001';
  m2 uuid := '00000000-0000-4000-a000-000000380002';
  v_cnt int;
  v_at timestamptz;
  v_ok boolean;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'member-prefs-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'member-prefs-2.test@example.invalid', now(), now());

  -- P1
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform 1 from public.member_preferences;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P1: a visitor read preferences'; end if;
  v_ok := false;
  begin
    insert into public.member_preferences (welcome_dismissed_at) values (now());
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P1: a visitor wrote preferences'; end if;
  passed := passed || 'P1'::text;

  -- P2
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.member_preferences;
  if v_cnt <> 0 then raise exception 'FAIL P2: a row exists by default'; end if;
  insert into public.member_preferences (welcome_dismissed_at) values (now())
    on conflict (user_id) do update set welcome_dismissed_at = excluded.welcome_dismissed_at;
  select welcome_dismissed_at into v_at from public.member_preferences where user_id = m1;
  if v_at is null then raise exception 'FAIL P2: the dismissal was not saved'; end if;
  insert into public.member_preferences (welcome_dismissed_at) values (null)
    on conflict (user_id) do update set welcome_dismissed_at = excluded.welcome_dismissed_at;
  select welcome_dismissed_at into v_at from public.member_preferences where user_id = m1;
  if v_at is not null then raise exception 'FAIL P2: the dismissal was not cleared'; end if;
  passed := passed || 'P2'::text;

  -- P3
  v_ok := false;
  begin
    update public.member_preferences set user_id = m2 where user_id = m1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: owner rewritten'; end if;
  v_ok := false;
  begin
    update public.member_preferences set created_at = now() - interval '1 year' where user_id = m1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: timestamp rewritten'; end if;
  v_ok := false;
  begin
    insert into public.member_preferences (user_id, welcome_dismissed_at) values (m2, now());
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: row forged for another member'; end if;
  passed := passed || 'P3'::text;

  -- P4
  update public.member_preferences set welcome_dismissed_at = now() where user_id = m1;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.member_preferences where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL P4: another member reads the preference'; end if;
  update public.member_preferences set welcome_dismissed_at = null where user_id = m1;
  delete from public.member_preferences where user_id = m1;
  execute 'reset role';
  select welcome_dismissed_at into v_at from public.member_preferences where user_id = m1;
  if v_at is null then raise exception 'FAIL P4: another member changed or deleted it'; end if;
  passed := passed || 'P4'::text;

  raise exception 'ALL MEMBER PREFERENCES TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
