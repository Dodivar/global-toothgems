-- =============================================================================
-- 3D Studio trial and access validation suite
-- (migration 20261017103101_studio_trial_access)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * a visitor neither reads its access nor starts a trial;
--   * a member without a trial cannot save a design; starting the trial is
--     explicit, lasts exactly 48 hours on the database clock, and a second
--     (or concurrent) call returns the same trial with `started = false`;
--   * during the trial the member saves designs; the first one is recorded;
--   * nobody writes a trial through the API, and another member cannot read it;
--   * once expired: state `trial_expired`, saving, editing a design, writing a
--     Gem Group are refused (42501), the designs are still read and kept, and
--     starting again does not reopen the trial;
--   * an active subscription gives access without a trial and no trial is
--     created for a subscriber; a cancelled one gives nothing and no trial;
--     an incomplete one reads as `subscription_pending`;
--   * active staff have access; a `viewer` reads every trial for the figures.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO TRIAL TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1     uuid := '00000000-0000-4000-a000-000000340001';
  m2     uuid := '00000000-0000-4000-a000-000000340002';
  m3     uuid := '00000000-0000-4000-a000-000000340003';
  m4     uuid := '00000000-0000-4000-a000-000000340004';
  m5     uuid := '00000000-0000-4000-a000-000000340005';
  viewer uuid := '00000000-0000-4000-a000-000000340006';
  v_scene jsonb := '{"version": 2, "pieces": []}';
  v_piece jsonb := '{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}';
  v_group jsonb;
  r       jsonb;
  r2      jsonb;
  v_id    uuid;
  v_cnt   int;
  v_state text;
  v_ok    boolean;
  passed  text[] := '{}';
begin
  v_group := jsonb_build_object('version', 2, 'anchorToothId', '11', 'pieces', jsonb_build_array(v_piece, v_piece));
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'trial-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'trial-2.test@example.invalid', now(), now()),
    (m3, 'authenticated', 'authenticated', 'trial-3.test@example.invalid', now(), now()),
    (m4, 'authenticated', 'authenticated', 'trial-4.test@example.invalid', now(), now()),
    (m5, 'authenticated', 'authenticated', 'trial-5.test@example.invalid', now(), now()),
    (viewer, 'authenticated', 'authenticated', 'trial-viewer.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer' where id = viewer;

  -- S1: a visitor reads no access and starts no trial.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform public.start_studio_trial();
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: a visitor started a trial'; end if;
  v_ok := false;
  begin
    perform public.studio_access_state();
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: a visitor read an access state'; end if;
  v_ok := false;
  begin
    perform 1 from public.studio_trials;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S1: a visitor read the trials'; end if;
  passed := passed || 'S1'::text;

  -- S2: no trial, no saving; the trial starts once, for exactly 48 hours.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'not_started' or r -> 'trial_expires_at' <> 'null'::jsonb then
    raise exception 'FAIL S2: initial state %', r;
  end if;
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('Avant essai', v_scene);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S2: saved without access (%)', v_state; end if;
  r := public.start_studio_trial();
  if (r ->> 'started')::boolean is not true or r ->> 'state' <> 'trial_active' then
    raise exception 'FAIL S2: start %', r;
  end if;
  if (r ->> 'trial_expires_at')::timestamptz - (r ->> 'trial_started_at')::timestamptz <> interval '48 hours'
     or (r ->> 'trial_started_at')::timestamptz <> now() then
    raise exception 'FAIL S2: trial window %', r;
  end if;
  r2 := public.start_studio_trial();
  if (r2 ->> 'started')::boolean is not false or r2 ->> 'trial_expires_at' <> r ->> 'trial_expires_at' then
    raise exception 'FAIL S2: second start %', r2;
  end if;
  passed := passed || 'S2'::text;

  -- S3: during the trial the member saves; the first saved design is recorded.
  insert into public.creations (name, scene_data) values ('Pendant essai', v_scene) returning id into v_id;
  insert into public.gem_groups (name, group_data) values ('Groupe essai', v_group);
  r := public.studio_access_state();
  if r -> 'first_creation_at' = 'null'::jsonb then raise exception 'FAIL S3: first creation not recorded %', r; end if;
  passed := passed || 'S3'::text;

  -- S4: nobody writes a trial through the API; another member reads none.
  v_ok := false;
  begin
    update public.studio_trials set trial_expires_at = trial_expires_at + interval '1 day' where user_id = m1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S4: member extended the trial'; end if;
  v_ok := false;
  begin
    delete from public.studio_trials where user_id = m1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S4: member deleted the trial'; end if;
  v_ok := false;
  begin
    insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end)
    values (m1, 'artist', 'active', 'sub_forged', now() + interval '1 month');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL S4: member wrote a subscription'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_trials where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL S4: another member reads the trial'; end if;
  select count(*) into v_cnt from public.creations where id = v_id;
  if v_cnt <> 0 then raise exception 'FAIL S4: another member reads the design'; end if;
  passed := passed || 'S4'::text;

  -- S5: once expired, nothing is written; the work is kept and read; no restart.
  execute 'reset role';
  update public.studio_trials
     set trial_started_at = now() - interval '48 hours', trial_expires_at = now()
   where user_id = m1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'trial_expired' then raise exception 'FAIL S5: state at expiry %', r; end if;
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('Après essai', v_scene);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S5: saved after expiry (%)', v_state; end if;
  v_state := null;
  begin
    update public.creations set name = 'Modifiée' where id = v_id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S5: edited after expiry (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.gem_groups (name, group_data) values ('Groupe après', v_group);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S5: group saved after expiry (%)', v_state; end if;
  select count(*) into v_cnt from public.creations where user_id = m1 and name = 'Pendant essai';
  if v_cnt <> 1 then raise exception 'FAIL S5: the trial design is not readable'; end if;
  r := public.start_studio_trial();
  if (r ->> 'started')::boolean is not false or r ->> 'state' <> 'trial_expired' then
    raise exception 'FAIL S5: trial restarted %', r;
  end if;
  passed := passed || 'S5'::text;

  -- S6: a subscriber needs no trial and gets none; access follows the subscription.
  execute 'reset role';
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end)
  values (m3, 'essential', 'active', 'sub_test_m3', now() + interval '1 month'),
         (m4, 'essential', 'canceled', 'sub_test_m4', now() - interval '1 day'),
         (m5, 'artist', 'incomplete', 'sub_test_m5', now() + interval '1 month');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  r := public.start_studio_trial();
  if (r ->> 'started')::boolean is not false or r ->> 'state' <> 'subscribed' or r ->> 'subscription_plan' <> 'essential' then
    raise exception 'FAIL S6: subscriber start %', r;
  end if;
  insert into public.creations (name, scene_data) values ('Abonnée', v_scene);
  perform set_config('request.jwt.claims', json_build_object('sub', m4, 'role', 'authenticated')::text, true);
  r := public.start_studio_trial();
  if (r ->> 'started')::boolean is not false or r ->> 'state' <> 'subscription_ended' then
    raise exception 'FAIL S6: former subscriber %', r;
  end if;
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('Ancienne abonnée', v_scene);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S6: former subscriber saved (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m5, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'subscription_pending' then raise exception 'FAIL S6: incomplete subscription %', r; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.studio_trials where user_id in (m3, m4, m5);
  if v_cnt <> 0 then raise exception 'FAIL S6: % trial(s) given to (former) subscribers', v_cnt; end if;
  passed := passed || 'S6'::text;

  -- S7: active staff have access; a viewer reads every trial, not as a writer.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'staff' then raise exception 'FAIL S7: staff state %', r; end if;
  insert into public.creations (name, scene_data) values ('Équipe', v_scene);
  select count(*) into v_cnt from public.studio_trials where user_id = m1;
  if v_cnt <> 1 then raise exception 'FAIL S7: viewer cannot read the trials'; end if;
  select count(*) into v_cnt from public.studio_subscriptions where user_id in (m3, m4, m5);
  if v_cnt <> 3 then raise exception 'FAIL S7: viewer cannot read the subscriptions'; end if;
  passed := passed || 'S7'::text;

  raise exception 'ALL STUDIO TRIAL TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
