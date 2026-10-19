-- =============================================================================
-- 3D Studio preferences validation suite (migration 20261019062619_studio_preferences)
-- =============================================================================
--   P1  a visitor reads and writes nothing;
--   P2  a member has no row by default, creates it with an upsert (as the
--       webapp does) and changes it; only 'grid' / 'explorer' are accepted;
--   P3  the owner and timestamps are not writable;
--   P4  another member reads none of it and changes nothing;
--   P5  no Studio access needed: a member whose trial ended changes their view.
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO PREFERENCES TESTS PASSED`.
-- =============================================================================

do $$
declare
  m1 uuid := '00000000-0000-4000-a000-000000370001';
  m2 uuid := '00000000-0000-4000-a000-000000370002';
  v_cnt int;
  v_view text;
  v_state text;
  v_ok boolean;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'prefs-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'prefs-2.test@example.invalid', now(), now());
  -- m1's trial is over (P5): access must not matter.
  insert into public.studio_trials (user_id, trial_started_at, trial_expires_at)
  values (m1, now() - interval '48 hours', now());

  -- P1
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform 1 from public.studio_preferences;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P1: a visitor read preferences'; end if;
  v_ok := false;
  begin
    insert into public.studio_preferences (library_view) values ('explorer');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P1: a visitor wrote preferences'; end if;
  passed := passed || 'P1'::text;

  -- P2 (+ P5: m1 has no Studio access)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_preferences;
  if v_cnt <> 0 then raise exception 'FAIL P2: a row exists by default'; end if;
  insert into public.studio_preferences (library_view) values ('explorer')
    on conflict (user_id) do update set library_view = excluded.library_view;
  insert into public.studio_preferences (library_view) values ('grid')
    on conflict (user_id) do update set library_view = excluded.library_view;
  select library_view into v_view from public.studio_preferences where user_id = m1;
  if v_view is distinct from 'grid' then raise exception 'FAIL P2: upsert gave %', v_view; end if;
  update public.studio_preferences set library_view = 'explorer' where user_id = m1;
  v_state := null;
  begin
    update public.studio_preferences set library_view = 'list' where user_id = m1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL P2: unknown view accepted (%)', v_state; end if;
  passed := passed || 'P2'::text || 'P5'::text;

  -- P3
  v_ok := false;
  begin
    update public.studio_preferences set user_id = m2 where user_id = m1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: owner rewritten'; end if;
  v_ok := false;
  begin
    insert into public.studio_preferences (user_id, library_view) values (m2, 'explorer');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P3: row forged for another member'; end if;
  passed := passed || 'P3'::text;

  -- P4
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_preferences where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL P4: another member reads the preference'; end if;
  update public.studio_preferences set library_view = 'grid' where user_id = m1;
  delete from public.studio_preferences where user_id = m1;
  execute 'reset role';
  select library_view into v_view from public.studio_preferences where user_id = m1;
  if v_view is distinct from 'explorer' then raise exception 'FAIL P4: another member changed it (%)', v_view; end if;
  passed := passed || 'P4'::text;

  raise exception 'ALL STUDIO PREFERENCES TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
