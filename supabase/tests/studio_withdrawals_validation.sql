-- =============================================================================
-- 3D Studio withdrawal validation suite (migrations 20261018163051_studio_withdrawals, 20261018163229_studio_withdrawals_updated_at)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * members neither decide a withdrawal nor write the table (42501); they
--     read their own withdrawal only;
--   * the quote: days started over the period's days, the used share rounded
--     down to the cent (member's favour), the rest refunded;
--   * the decision: one per subscription (a second call returns the same row),
--     refused after the 14th day (deadline_passed), after a plan change paid
--     (manual_review), and for a period that does not match the first payment
--     (22023);
--   * the steps and the webhook: refund sent → refund_pending → refunded,
--     replays harmless, another refund id refused (23514);
--   * the acknowledgement e-mail is listed once, until sent.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL STUDIO WITHDRAWAL TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000370001';
  m2      uuid := '00000000-0000-4000-a000-000000370002';
  m3      uuid := '00000000-0000-4000-a000-000000370003';
  r       jsonb;
  w       public.studio_withdrawals;
  v_id    uuid;
  v_cnt   int;
  v_state text;
  v_hint  text;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'withdraw-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'withdraw-2.test@example.invalid', now(), now()),
    (m3, 'authenticated', 'authenticated', 'withdraw-3.test@example.invalid', now(), now());

  update public.studio_plan_prices set active = false where active;
  insert into public.studio_plan_prices (plan, billing_interval, amount, currency, stripe_price_id) values
    ('artist', 'month', 19.90, 'EUR', 'price_testWithdrawMonth'),
    ('artist', 'year', 199.00, 'EUR', 'price_testWithdrawYear');

  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- m1: monthly, paid 3 days ago. m2: paid 20 days ago. m3: yearly, plan change paid.
  perform public.apply_studio_subscription('sub_testWithdraw1', 'cus_testWithdraw1', m1, 'price_testWithdrawMonth',
                                           'active', now() + interval '27 days', false, null, false);
  perform public.record_studio_invoice('in_testWithdraw1', 'sub_testWithdraw1', 'subscription_create', 'paid', 19.90, 'EUR', now() - interval '3 days');
  perform public.apply_studio_subscription('sub_testWithdraw2', 'cus_testWithdraw2', m2, 'price_testWithdrawMonth',
                                           'active', now() + interval '10 days', false, null, false);
  perform public.record_studio_invoice('in_testWithdraw2', 'sub_testWithdraw2', 'subscription_create', 'paid', 19.90, 'EUR', now() - interval '20 days');
  perform public.apply_studio_subscription('sub_testWithdraw3', 'cus_testWithdraw3', m3, 'price_testWithdrawYear',
                                           'active', now() + interval '364 days', false, null, false);
  perform public.record_studio_invoice('in_testWithdraw3', 'sub_testWithdraw3', 'subscription_create', 'paid', 199, 'EUR', now() - interval '1 day');
  perform public.record_studio_invoice('in_testWithdraw4', 'sub_testWithdraw3', 'subscription_update', 'paid', 20, 'EUR', now());

  -- X1: members cannot decide or write.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.request_studio_withdrawal(m1, now() - interval '3 days', now() + interval '27 days');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL X1: a member decided a withdrawal (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_withdrawals (subscription_id, user_id, stripe_invoice_id, period_start, period_end,
                                           used_days, period_days, paid_amount, used_amount, refund_amount, currency)
    select id, m1, 'in_testWithdraw1', now(), now() + interval '1 day', 1, 1, 19.90, 0, 19.90, 'EUR'
      from public.studio_subscriptions where stripe_subscription_id = 'sub_testWithdraw1';
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL X1: a member wrote a withdrawal (%)', v_state; end if;
  passed := passed || 'X1'::text;

  -- X2: the quote — 3 days started of 30: 1.99 kept (rounded down), 17.91 back.
  r := public.studio_withdrawal_quote();
  if (r ->> 'eligible')::boolean is not true or (r ->> 'used_days')::int <> 3 or (r ->> 'period_days')::int <> 30
     or (r ->> 'used_amount')::numeric <> 1.99 or (r ->> 'refund_amount')::numeric <> 17.91 then
    raise exception 'FAIL X2: quote %', r;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  r := public.studio_withdrawal_quote();
  if (r ->> 'eligible')::boolean is not false or r ->> 'reason' <> 'deadline_passed' then raise exception 'FAIL X2: m2 quote %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  r := public.studio_withdrawal_quote();
  if r ->> 'reason' <> 'manual_review' then raise exception 'FAIL X2: m3 quote %', r; end if;
  passed := passed || 'X2'::text;

  -- X3: the decision, idempotent.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.request_studio_withdrawal(m1, now() - interval '3 days', now() + interval '27 days');
  v_id := (r ->> 'id')::uuid;
  if (r ->> 'created')::boolean is not true or (r ->> 'refund_amount')::numeric <> 17.91 or r ->> 'status' <> 'requested'
     or r ->> 'stripe_subscription_id' <> 'sub_testWithdraw1' then
    raise exception 'FAIL X3: first request %', r;
  end if;
  r := public.request_studio_withdrawal(m1, now() - interval '3 days', now() + interval '27 days');
  if (r ->> 'created')::boolean is not false or (r ->> 'id')::uuid <> v_id then raise exception 'FAIL X3: second request %', r; end if;
  select count(*) into v_cnt from public.studio_withdrawals where user_id = m1;
  if v_cnt <> 1 then raise exception 'FAIL X3: % rows', v_cnt; end if;
  passed := passed || 'X3'::text;

  -- X4: refusals — after the 14th day, after a plan change, a period that does not match.
  v_hint := null;
  begin
    perform public.request_studio_withdrawal(m2, now() - interval '20 days', now() + interval '10 days');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'deadline_passed' then raise exception 'FAIL X4: past deadline (%)', v_hint; end if;
  v_hint := null;
  begin
    perform public.request_studio_withdrawal(m3, now() - interval '1 day', now() + interval '364 days');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'manual_review' then raise exception 'FAIL X4: plan change (%)', v_hint; end if;
  -- The plan change set aside (its legal invoice keeps the row: it can no longer be deleted).
  update public.studio_subscription_invoices set status = 'payment_failed' where stripe_invoice_id = 'in_testWithdraw4';
  v_state := null;
  begin
    perform public.request_studio_withdrawal(m3, now() - interval '30 days', now() + interval '335 days');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL X4: mismatched period (%)', v_state; end if;
  -- Yearly, 1 day of 365: 199 × 1/365 = 0.545… → 0.54 kept, 198.46 back.
  r := public.request_studio_withdrawal(m3, now() - interval '1 day', now() + interval '364 days');
  if (r ->> 'used_amount')::numeric <> 0.54 or (r ->> 'refund_amount')::numeric <> 198.46 or (r ->> 'period_days')::int <> 365 then
    raise exception 'FAIL X4: yearly amounts %', r;
  end if;
  passed := passed || 'X4'::text;

  -- X5: steps and the webhook.
  w := public.record_studio_withdrawal_step(v_id, 'canceled');
  if w.canceled_at is null then raise exception 'FAIL X5: cancel step'; end if;
  w := public.record_studio_withdrawal_step(v_id, 'refund_sent', 're_testWithdraw1');
  if w.status <> 'refund_pending' then raise exception 'FAIL X5: refund sent %', w.status; end if;
  w := public.settle_studio_withdrawal_refund(v_id, 're_testWithdraw1', 'pending');
  if w.status <> 'refund_pending' then raise exception 'FAIL X5: pending event %', w.status; end if;
  w := public.settle_studio_withdrawal_refund(v_id, 're_testWithdraw1', 'succeeded');
  if w.status <> 'refunded' or w.refunded_at is null then raise exception 'FAIL X5: succeeded %', w.status; end if;
  w := public.settle_studio_withdrawal_refund(v_id, 're_testWithdraw1', 'failed', 'late');
  if w.status <> 'refunded' then raise exception 'FAIL X5: a refunded withdrawal went back to %', w.status; end if;
  v_state := null;
  begin
    perform public.settle_studio_withdrawal_refund(v_id, 're_otherRefund01', 'succeeded');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL X5: another refund id (%)', v_state; end if;
  v_state := null;
  begin
    perform public.record_studio_withdrawal_step(v_id, 'no_refund');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL X5: no_refund with money due (%)', v_state; end if;
  passed := passed || 'X5'::text;

  -- X6: the acknowledgement e-mail, once.
  select count(*) into v_cnt from public.pending_studio_withdrawal_emails(100) where withdrawal_id = v_id;
  if v_cnt <> 1 then raise exception 'FAIL X6: listed % time(s)', v_cnt; end if;
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at)
  values ('studio_withdrawal:' || v_id::text, 'studio_withdrawal_confirmation', 'fr', repeat('b', 64), 'sent', now());
  select count(*) into v_cnt from public.pending_studio_withdrawal_emails(100) where withdrawal_id = v_id;
  if v_cnt <> 0 then raise exception 'FAIL X6: still listed after sending'; end if;
  passed := passed || 'X6'::text;

  -- X7: owners read theirs; another member reads nothing; the quote reports the withdrawal.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_withdrawals;
  if v_cnt <> 0 then raise exception 'FAIL X7: another member reads % withdrawal(s)', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_withdrawals;
  if v_cnt <> 1 then raise exception 'FAIL X7: owner reads % withdrawal(s)', v_cnt; end if;
  r := public.studio_withdrawal_quote();
  if r ->> 'reason' <> 'withdrawn' or r -> 'withdrawal' ->> 'status' <> 'refunded' then raise exception 'FAIL X7: quote after %', r; end if;
  passed := passed || 'X7'::text;

  raise exception 'ALL STUDIO WITHDRAWAL TESTS PASSED (%)', array_to_string(passed, ', ');
end $$;
