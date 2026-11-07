-- =============================================================================
-- Newsletter: Resend opt-outs mirrored onto the list (migration 20261106190001_newsletter_resend_opt_out)
-- =============================================================================
-- Proves newsletter_resend_opt_out(email, reason):
--   * visitors and members cannot call it; a bad reason or address is refused;
--   * an unknown address answers 'unknown' and changes nothing;
--   * an unsubscribe moves a visitor and a member to unsubscribed, withdraws the member's
--     marketing consent (source 'newsletter'), queues the row for the sync, and is idempotent;
--   * a complaint wins over anything, a permanent bounce only over pending/subscribed, and
--     neither touches consents.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL NEWSLETTER RESEND OPT-OUT TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mia   uuid := '00000000-0000-4000-a000-0000005d0001';
  v_txt text;
  v_state text;
  v_sub public.newsletter_subscriptions;
  v_cnt int;
  v_bool boolean;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mia, 'authenticated', 'authenticated', 'mia.optout@example.invalid', '{"first_name":"Mia"}', now(), now());
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (mia, 'marketing_email', true, '2026-10-04', 'account');
  insert into public.newsletter_subscriptions (email, status, source, policy_version, confirmed_at) values
    ('visitor.optout@example.invalid', 'subscribed', 'home', '2026-10-04', now()),
    ('bounce.optout@example.invalid', 'subscribed', 'home', '2026-10-04', now()),
    ('gone.optout@example.invalid', 'unsubscribed', 'home', '2026-10-04', now());

  -- ===========================================================================
  -- RO1 server only, validated
  -- ===========================================================================
  foreach v_txt in array array['anon', 'authenticated'] loop
    perform set_config('role', v_txt, true);
    perform set_config('request.jwt.claims', json_build_object('role', v_txt, 'sub', mia)::text, true);
    v_state := null;
    begin
      perform public.newsletter_resend_opt_out('visitor.optout@example.invalid', 'unsubscribed');
    exception when others then v_state := sqlstate;
    end;
    execute 'reset role';
    if v_state is distinct from '42501' then raise exception 'FAIL RO1: % opted someone out (%)', v_txt, v_state; end if;
  end loop;
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  foreach v_txt in array array['deleted', 'not-an-email'] loop
    v_state := null;
    begin
      perform public.newsletter_resend_opt_out(case when v_txt = 'deleted' then 'visitor.optout@example.invalid' else v_txt end,
                                               case when v_txt = 'deleted' then v_txt else 'unsubscribed' end);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL RO1: % accepted (%)', v_txt, v_state; end if;
  end loop;
  if public.newsletter_resend_opt_out('nobody.optout@example.invalid', 'unsubscribed') <> 'unknown' then
    raise exception 'FAIL RO1: unknown address';
  end if;
  passed := array_append(passed, 'RO1 server only; bad reason or address refused; unknown address answered as such');

  -- ===========================================================================
  -- RO2 unsubscribed in Resend
  -- ===========================================================================
  if public.newsletter_resend_opt_out(' Visitor.OptOut@example.invalid ', 'unsubscribed') <> 'unsubscribed' then
    raise exception 'FAIL RO2: visitor not unsubscribed';
  end if;
  if public.newsletter_resend_opt_out('visitor.optout@example.invalid', 'unsubscribed') <> 'unchanged' then
    raise exception 'FAIL RO2: replay not idempotent';
  end if;
  if public.newsletter_resend_opt_out('mia.optout@example.invalid', 'unsubscribed') <> 'unsubscribed' then
    raise exception 'FAIL RO2: member not unsubscribed';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select * into v_sub from public.newsletter_subscriptions where email = 'visitor.optout@example.invalid';
  if v_sub.status <> 'unsubscribed' or v_sub.unsubscribed_at is null or v_sub.contact_sync_due_at is null then
    raise exception 'FAIL RO2: visitor row % / % / %', v_sub.status, v_sub.unsubscribed_at, v_sub.contact_sync_due_at;
  end if;
  select * into v_sub from public.newsletter_subscriptions where user_id = mia;
  select count(*) into v_cnt from public.consent_records
   where user_id = mia and purpose = 'marketing_email' and not granted and source = 'newsletter';
  select marketing_opt_in into v_bool from public.profiles where id = mia;
  if v_sub.status <> 'unsubscribed' or v_cnt <> 1 or v_bool then
    raise exception 'FAIL RO2: member (status %, withdrawals %, opt-in %)', v_sub.status, v_cnt, v_bool;
  end if;
  passed := array_append(passed, 'RO2 an unsubscribe in Resend unsubscribes, withdraws a member''s consent, queues the sync; idempotent');

  -- ===========================================================================
  -- RO3 bounces and complaints
  -- ===========================================================================
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  if public.newsletter_resend_opt_out('bounce.optout@example.invalid', 'bounced') <> 'bounced' then
    raise exception 'FAIL RO3: bounce';
  end if;
  if public.newsletter_resend_opt_out('gone.optout@example.invalid', 'bounced') <> 'unchanged' then
    raise exception 'FAIL RO3: bounce over unsubscribed';
  end if;
  if public.newsletter_resend_opt_out('bounce.optout@example.invalid', 'complained') <> 'complained' then
    raise exception 'FAIL RO3: complaint over a bounce';
  end if;
  if public.newsletter_resend_opt_out('bounce.optout@example.invalid', 'bounced') <> 'unchanged'
     or public.newsletter_resend_opt_out('bounce.optout@example.invalid', 'unsubscribed') <> 'unchanged' then
    raise exception 'FAIL RO3: a complaint was overwritten';
  end if;
  if public.newsletter_resend_opt_out('gone.optout@example.invalid', 'complained') <> 'complained' then
    raise exception 'FAIL RO3: complaint over unsubscribed';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_cnt from public.newsletter_subscriptions
   where email in ('bounce.optout@example.invalid', 'gone.optout@example.invalid') and status = 'complained';
  if v_cnt <> 2 then raise exception 'FAIL RO3: % complained rows', v_cnt; end if;
  passed := array_append(passed, 'RO3 a complaint wins over anything, a bounce only over pending/subscribed');

  raise exception 'ALL NEWSLETTER RESEND OPT-OUT TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
