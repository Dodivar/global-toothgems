-- =============================================================================
-- Newsletter direct sign-up validation suite (migration 20261108101636_newsletter_direct_signup)
-- =============================================================================
-- Proves newsletter_subscribe_direct(email, locale, source, policy_version, method):
--   * visitors and members cannot call it; bad method / source / address refused;
--   * a visitor (captcha) is subscribed at once, with confirmed_at and opt_in_method;
--     a pending double opt-in row is taken over (its token cleared); a replay is a no-op;
--   * a bounced or complaining address is never re-activated;
--   * a member's own address (member_session) records their marketing consent and
--     subscribes their linked entry;
--   * opt_in_method: 'account' for a member's own consent, 'double_opt_in' for a link;
--   * the per-e-mail throttle (3 / hour) applies.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL NEWSLETTER DIRECT SIGNUP TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mia    uuid := '00000000-0000-4000-a000-0000005e0001';
  leo    uuid := '00000000-0000-4000-a000-0000005e0002';
  v_res  jsonb;
  v_txt  text;
  v_state text;
  v_sub  public.newsletter_subscriptions;
  v_cnt  int;
  v_bool boolean;
  i      int;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mia, 'authenticated', 'authenticated', 'mia.direct@example.invalid', '{"first_name":"Mia"}', now(), now()),
    (leo, 'authenticated', 'authenticated', 'leo.direct@example.invalid', '{"first_name":"Leo"}', now(), now());
  insert into public.newsletter_subscriptions (email, status, source, policy_version, confirmed_at) values
    ('dead.direct@example.invalid', 'bounced', 'home', '2026-10-04', now());

  -- ===========================================================================
  -- ND1 server only, validated
  -- ===========================================================================
  foreach v_txt in array array['anon', 'authenticated'] loop
    perform set_config('role', v_txt, true);
    perform set_config('request.jwt.claims', json_build_object('role', v_txt, 'sub', mia)::text, true);
    v_state := null;
    begin
      perform public.newsletter_subscribe_direct('x.direct@example.invalid', 'fr', 'home', '2026-10-04', 'captcha');
    exception when others then v_state := sqlstate;
    end;
    execute 'reset role';
    if v_state is distinct from '42501' then raise exception 'FAIL ND1: % subscribed directly (%)', v_txt, v_state; end if;
  end loop;
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  foreach v_txt in array array['method', 'source', 'email', 'policy'] loop
    v_state := null;
    begin
      perform public.newsletter_subscribe_direct(
        case when v_txt = 'email' then 'nope' else 'y.direct@example.invalid' end, 'fr',
        case when v_txt = 'source' then 'account' else 'home' end,
        case when v_txt = 'policy' then ' ' else '2026-10-04' end,
        case when v_txt = 'method' then 'double_opt_in' else 'captcha' end);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL ND1: bad % accepted (%)', v_txt, v_state; end if;
  end loop;
  passed := array_append(passed, 'ND1 server only; method, source, address and policy version validated');

  -- ===========================================================================
  -- ND2 visitors through the captcha
  -- ===========================================================================
  v_res := public.newsletter_subscribe_direct(' Ana.Direct@example.invalid ', 'en', 'home', '2026-10-04', 'captcha');
  if v_res <> '{"status": "subscribed"}'::jsonb then raise exception 'FAIL ND2: %', v_res; end if;
  select * into v_sub from public.newsletter_subscriptions where email = 'ana.direct@example.invalid';
  if v_sub.status <> 'subscribed' or v_sub.confirmed_at is null or v_sub.opt_in_method <> 'captcha'
     or v_sub.locale <> 'en' or v_sub.contact_sync_due_at is null then
    raise exception 'FAIL ND2: row %', row_to_json(v_sub);
  end if;
  if public.newsletter_subscribe_direct('ana.direct@example.invalid', 'en', 'home', '2026-10-04', 'captcha') <> '{"status": "subscribed"}'::jsonb then
    raise exception 'FAIL ND2: replay';
  end if;

  v_res := public.newsletter_subscribe('pend.direct@example.invalid', 'fr', 'footer', '2026-10-04');
  if v_res ->> 'status' <> 'pending' then raise exception 'FAIL ND2: pending setup %', v_res; end if;
  perform public.newsletter_subscribe_direct('pend.direct@example.invalid', 'fr', 'home', '2026-10-04', 'captcha');
  select * into v_sub from public.newsletter_subscriptions where email = 'pend.direct@example.invalid';
  if v_sub.status <> 'subscribed' or v_sub.confirm_token_hash is not null or v_sub.opt_in_method <> 'captcha' then
    raise exception 'FAIL ND2: pending row %', row_to_json(v_sub);
  end if;

  if public.newsletter_subscribe_direct('dead.direct@example.invalid', 'fr', 'home', '2026-10-04', 'captcha') <> '{"status": "bounced"}'::jsonb
     or (select status from public.newsletter_subscriptions where email = 'dead.direct@example.invalid') <> 'bounced' then
    raise exception 'FAIL ND2: a bounced address came back';
  end if;
  passed := array_append(passed, 'ND2 a visitor with a captcha is subscribed at once; pending rows taken over; bounces never re-activated');

  -- ===========================================================================
  -- ND3 members
  -- ===========================================================================
  v_res := public.newsletter_subscribe_direct('MIA.direct@example.invalid', 'fr', 'home', '2026-10-04', 'member_session');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select * into v_sub from public.newsletter_subscriptions where user_id = mia;
  select count(*) into v_cnt from public.consent_records
   where user_id = mia and purpose = 'marketing_email' and granted and source = 'newsletter';
  select marketing_opt_in into v_bool from public.profiles where id = mia;
  if v_res <> '{"status": "subscribed"}'::jsonb or v_sub.status <> 'subscribed' or v_sub.opt_in_method <> 'member_session'
     or v_sub.source <> 'home' or v_cnt <> 1 or not v_bool then
    raise exception 'FAIL ND3: member (%, row %, consents %, opt-in %)', v_res, row_to_json(v_sub), v_cnt, v_bool;
  end if;

  -- A member's own choice in their profile is 'account'.
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (leo, 'marketing_email', true, '2026-10-04', 'account');
  if (select opt_in_method from public.newsletter_subscriptions where user_id = leo) is distinct from 'account' then
    raise exception 'FAIL ND3: profile consent method';
  end if;
  passed := array_append(passed, 'ND3 a member''s own address records their consent; profile choices are ''account''');

  -- ===========================================================================
  -- ND4 the confirmation link is 'double_opt_in'; the throttle applies
  -- ===========================================================================
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_txt := public.newsletter_subscribe('link.direct@example.invalid', 'fr', 'footer', '2026-10-04') ->> 'confirm_token';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  if not public.newsletter_confirm(v_txt) then raise exception 'FAIL ND4: link not confirmed'; end if;
  execute 'reset role';
  if (select opt_in_method from public.newsletter_subscriptions where email = 'link.direct@example.invalid') is distinct from 'double_opt_in' then
    raise exception 'FAIL ND4: link method';
  end if;

  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  for i in 1..3 loop
    perform public.newsletter_subscribe_direct('busy.direct@example.invalid', 'fr', 'home', '2026-10-04', 'captcha');
  end loop;
  v_state := null;
  begin
    perform public.newsletter_subscribe_direct('busy.direct@example.invalid', 'fr', 'home', '2026-10-04', 'captcha');
  exception when others then v_state := sqlstate;
  end;
  execute 'reset role';
  if v_state is distinct from 'PT429' then raise exception 'FAIL ND4: not throttled (%)', v_state; end if;
  passed := array_append(passed, 'ND4 links record double_opt_in; 3 attempts per address and hour');

  raise exception 'ALL NEWSLETTER DIRECT SIGNUP TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
