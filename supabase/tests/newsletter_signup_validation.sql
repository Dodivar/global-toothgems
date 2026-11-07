-- =============================================================================
-- Newsletter sign-up validation suite (migration 20261106181613_newsletter_ip_throttle)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * a visitor or a member cannot call newsletter_ip_allowed() (service role only);
--   * the service role gets 10 attempts per hour for one caller address, the 11th
--     is refused, and another address is not affected;
--   * the path the Edge Function takes still works end to end: subscribe as the
--     service role (pending + token), confirm as a visitor (anon) with that token.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL NEWSLETTER SIGNUP TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  v_state text;
  v_ok    boolean;
  v_res   jsonb;
  v_txt   text;
  i       int;
  passed  text[] := '{}';
begin
  -- ===========================================================================
  -- NS1 the throttle is the server's only
  -- ===========================================================================
  foreach v_txt in array array['anon', 'authenticated'] loop
    perform set_config('role', v_txt, true);
    perform set_config('request.jwt.claims', json_build_object('role', v_txt)::text, true);
    v_state := null;
    begin
      perform public.newsletter_ip_allowed('ns-ip-a');
    exception when others then v_state := sqlstate;
    end;
    execute 'reset role';
    if v_state is distinct from '42501' then raise exception 'FAIL NS1: % called the throttle (%)', v_txt, v_state; end if;
  end loop;
  passed := array_append(passed, 'NS1 visitors and members cannot call the throttle');

  -- ===========================================================================
  -- NS2 10 attempts per hour per address
  -- ===========================================================================
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  for i in 1..10 loop
    if not public.newsletter_ip_allowed('ns-ip-a') then raise exception 'FAIL NS2: attempt % refused', i; end if;
  end loop;
  if public.newsletter_ip_allowed('ns-ip-a') then raise exception 'FAIL NS2: 11th attempt allowed'; end if;
  if not public.newsletter_ip_allowed('ns-ip-b') then raise exception 'FAIL NS2: another address refused'; end if;
  passed := array_append(passed, 'NS2 throttle: 10 per hour per caller address, other addresses unaffected');

  -- ===========================================================================
  -- NS3 the Edge Function's path: subscribe (service role), confirm (anon)
  -- ===========================================================================
  v_res := public.newsletter_subscribe('ns.visitor@example.invalid', 'en', 'home', '2026-10-04');
  if v_res ->> 'status' <> 'pending' or (v_res ->> 'confirm_token') !~ '^[0-9a-f]{48}$' then
    raise exception 'FAIL NS3: subscribe answered %', v_res;
  end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_ok := public.newsletter_confirm(v_res ->> 'confirm_token');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if not v_ok then raise exception 'FAIL NS3: confirmation refused'; end if;
  select status into v_txt from public.newsletter_subscriptions where email = 'ns.visitor@example.invalid';
  if v_txt is distinct from 'subscribed' then raise exception 'FAIL NS3: status %', v_txt; end if;
  passed := array_append(passed, 'NS3 subscribe as the server, confirm as a visitor with the e-mailed token');

  raise exception 'ALL NEWSLETTER SIGNUP TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
