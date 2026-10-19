-- =============================================================================
-- 3D Studio immediate-access request validation suite
-- (migration 20261018155521_studio_withdrawal_consent)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * `studio_immediate_access` is an accepted consent purpose; a member records
--     only their own (42501 for another account); an unknown purpose is still
--     refused (23514);
--   * members cannot list the pending confirmations (42501);
--   * the service role's sweep lists a new subscription whose first invoice is
--     paid, with the version of the request accepted before it, once; a
--     subscription bought without a request is not listed; a sent e-mail
--     closes it.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL STUDIO WITHDRAWAL CONSENT TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000360001';
  m2      uuid := '00000000-0000-4000-a000-000000360002';
  s1      uuid;
  v_cnt   int;
  v_state text;
  v_ver   text;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'withdrawal-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'withdrawal-2.test@example.invalid', now(), now());

  update public.studio_plan_prices set active = false where active;
  insert into public.studio_plan_prices (plan, billing_interval, amount, currency, stripe_price_id) values
    ('artist', 'year', 199.00, 'EUR', 'price_testWithdrawalYear');

  -- W1: a member records their own request; not someone else's; unknown purposes stay refused.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (m1, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout');
  select count(*) into v_cnt from public.consent_records where user_id = m1 and purpose = 'studio_immediate_access';
  if v_cnt <> 1 then raise exception 'FAIL W1: own request recorded % time(s)', v_cnt; end if;
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (m2, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL W1: recorded for another account (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (m1, 'studio_waiver', true, 'v1', 'checkout');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL W1: unknown purpose (%)', v_state; end if;
  passed := passed || 'W1'::text;

  -- W2: members cannot list the pending confirmations.
  v_state := null;
  begin
    perform public.pending_studio_subscription_emails(25);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL W2: a member listed the sweep (%)', v_state; end if;
  passed := passed || 'W2'::text;

  -- W3: the sweep lists a subscription bought under a request (m1), not one bought without (m2).
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- What create-studio-subscription records, a moment before Stripe's webhook
  -- creates the subscription (inside this one transaction, W1's row is stamped
  -- by clock_timestamp(), after the subscription's now()).
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'studio_immediate_access', true, 'studio-withdrawal-2026-10', 'checkout', now() - interval '1 minute');
  perform public.apply_studio_subscription('sub_testWithdrawal1', 'cus_testWithdrawal1', m1, 'price_testWithdrawalYear',
                                           'active', now() + interval '1 year', false, null, false);
  perform public.apply_studio_subscription('sub_testWithdrawal2', 'cus_testWithdrawal2', m2, 'price_testWithdrawalYear',
                                           'active', now() + interval '1 year', false, null, false);
  select id into s1 from public.studio_subscriptions where stripe_subscription_id = 'sub_testWithdrawal1';

  select count(*) into v_cnt from public.pending_studio_subscription_emails(100) where subscription_id = s1;
  if v_cnt <> 0 then raise exception 'FAIL W3: listed before the first invoice is paid'; end if;

  perform public.record_studio_invoice('in_testWithdrawal1', 'sub_testWithdrawal1', 'subscription_create', 'paid', 199, 'EUR', now());
  perform public.record_studio_invoice('in_testWithdrawal2', 'sub_testWithdrawal2', 'subscription_create', 'paid', 199, 'EUR', now());

  select count(*), max(consent_version) into v_cnt, v_ver
    from public.pending_studio_subscription_emails(100) where subscription_id = s1;
  if v_cnt <> 1 or v_ver is distinct from 'studio-withdrawal-2026-10' then
    raise exception 'FAIL W3: listed % time(s), version %', v_cnt, v_ver;
  end if;
  select count(*) into v_cnt from public.pending_studio_subscription_emails(100) p
    join public.studio_subscriptions s on s.id = p.subscription_id
   where s.user_id = m2;
  if v_cnt <> 0 then raise exception 'FAIL W3: a subscription without a request is listed'; end if;
  passed := passed || 'W3'::text;

  -- W4: once its e-mail is sent, the subscription leaves the sweep.
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at)
  values ('studio_subscription:' || s1::text, 'studio_subscription_confirmation', 'fr', repeat('a', 64), 'sent', now());
  select count(*) into v_cnt from public.pending_studio_subscription_emails(100) where subscription_id = s1;
  if v_cnt <> 0 then raise exception 'FAIL W4: still listed after the e-mail was sent'; end if;
  select count(*) into v_cnt from public.email_templates where key = 'studio_subscription_confirmation';
  if v_cnt <> 1 then raise exception 'FAIL W4: template missing'; end if;
  passed := passed || 'W4'::text;

  raise exception 'ALL STUDIO WITHDRAWAL CONSENT TESTS PASSED (%)', array_to_string(passed, ', ');
end $$;
