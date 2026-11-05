-- =============================================================================
-- Suspended accounts validation suite
-- (migration 20261105175827_suspended_accounts_lose_member_access)
-- =============================================================================
-- Proves, as the role that really calls them (`authenticated`, own token):
--
--   * an active member holding a published course reads it (`holds_course`,
--     `learner_courses`) and has Studio access with a running trial, and so
--     does one with an active subscription;
--   * once the profile is suspended (or deactivated) all of it is refused by the
--     database: the course, its progress, the Studio access, the tier, the
--     access state, and opening a new trial;
--   * nothing is deleted: reactivating the account gives everything back.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL SUSPENDED ACCOUNT TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1 uuid := '00000000-0000-4000-a000-000000350001';
  m2 uuid := '00000000-0000-4000-a000-000000350002';
  m3 uuid := '00000000-0000-4000-a000-000000350003';
  v_course uuid;
  r        jsonb;
  v_ok     boolean;
  passed   text[] := '{}';

  procedure_claims constant text := '{"role":"authenticated","sub":"%s"}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'susp-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'susp-2.test@example.invalid', now(), now()),
    (m3, 'authenticated', 'authenticated', 'susp-3.test@example.invalid', now(), now());

  insert into public.courses (slug, title, status, published_at)
  values ('suspended-test-course', 'Cours suspendu', 'draft', null)
  returning id into v_course;
  -- Publishing needs modules (guard_course); the suite only needs a published row.
  alter table public.courses disable trigger user;
  update public.courses set status = 'published', published_at = now() where id = v_course;
  alter table public.courses enable trigger user;
  insert into public.course_entitlements (user_id, course_id, source) values (m1, v_course, 'manual_grant');
  insert into public.studio_trials (user_id) values (m1);
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end)
  values (m2, 'atelier', 'active', 'sub_susp_test', now() + interval '10 days');

  -- S1: active members: course, trial and subscription all work.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', format(procedure_claims, m1), true);
  if not private.holds_course(v_course) then raise exception 'FAIL S1: active member does not hold the course'; end if;
  if jsonb_array_length(public.learner_courses()) <> 1 then raise exception 'FAIL S1: learner_courses empty'; end if;
  if not private.has_studio_access() then raise exception 'FAIL S1: trial gives no Studio access'; end if;
  if (public.studio_access_state() ->> 'tier') is distinct from 'essential' then raise exception 'FAIL S1: trial tier'; end if;
  perform set_config('request.jwt.claims', format(procedure_claims, m2), true);
  if not private.has_studio_access() or (public.studio_access_state() ->> 'tier') is distinct from 'atelier' then
    raise exception 'FAIL S1: subscription gives no access';
  end if;
  passed := passed || 'S1'::text;

  -- S2: suspended: everything is refused, in the database.
  perform set_config('role', 'postgres', true);
  update public.profiles set status = 'suspended' where id in (m1, m2, m3);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', format(procedure_claims, m1), true);
  if private.holds_course(v_course) then raise exception 'FAIL S2: suspended member still holds the course'; end if;
  if jsonb_array_length(public.learner_courses()) <> 0 then raise exception 'FAIL S2: learner_courses not empty'; end if;
  -- lock_learner_course is internal (called by the learner functions): run it as the owner, with the member's claims.
  perform set_config('role', 'postgres', true);
  v_ok := false;
  begin
    perform private.lock_learner_course(v_course);
  exception when insufficient_privilege then v_ok := sqlerrm like '%no_access%';
  end;
  perform set_config('role', 'authenticated', true);
  if not v_ok then raise exception 'FAIL S2: suspended member can lock (use) the course'; end if;
  if private.has_studio_access() then raise exception 'FAIL S2: suspended trial still gives Studio access'; end if;
  if (public.studio_access_state() ->> 'tier') is not null then raise exception 'FAIL S2: suspended trial has a tier'; end if;
  r := public.studio_access_state();
  if r ->> 'state' = 'trial_active' then raise exception 'FAIL S2: state reads trial_active'; end if;
  perform set_config('request.jwt.claims', format(procedure_claims, m2), true);
  if private.has_studio_access() or (public.studio_access_state() ->> 'tier') is not null then
    raise exception 'FAIL S2: suspended subscriber keeps Studio access';
  end if;
  perform set_config('request.jwt.claims', format(procedure_claims, m3), true);
  v_ok := false;
  begin
    perform public.start_studio_trial();
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S2: suspended member opened a trial'; end if;
  passed := passed || 'S2'::text;

  -- S3: deactivated reads the same as suspended.
  perform set_config('role', 'postgres', true);
  update public.profiles set status = 'deactivated' where id = m1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', format(procedure_claims, m1), true);
  if private.holds_course(v_course) or private.has_studio_access() then
    raise exception 'FAIL S3: deactivated member keeps access';
  end if;
  passed := passed || 'S3'::text;

  -- S4: reactivation gives everything back (nothing was deleted).
  perform set_config('role', 'postgres', true);
  update public.profiles set status = 'active' where id in (m1, m2, m3);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', format(procedure_claims, m1), true);
  if not private.holds_course(v_course) or not private.has_studio_access() then
    raise exception 'FAIL S4: reactivated member did not get access back';
  end if;
  perform set_config('request.jwt.claims', format(procedure_claims, m2), true);
  if (public.studio_access_state() ->> 'tier') is distinct from 'atelier' then raise exception 'FAIL S4: subscription not back'; end if;
  passed := passed || 'S4'::text;

  raise exception 'ALL SUSPENDED ACCOUNT TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
