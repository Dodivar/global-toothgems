-- =============================================================================
-- 3D Studio subscription billing validation suite
-- (migrations 20261018102741_studio_subscription_billing, 20261018110209_studio_billing_updated_at)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * everyone reads the active plan prices, nobody writes them through the API;
--   * members neither read the Stripe customers nor call the webhook's writers;
--   * the service role mirrors a subscription (account from the metadata the
--     first time, then from the stored customer), idempotently: a replay
--     updates the same row; the plan follows the price (a portal plan change);
--   * a subscription unlocks saving; cancelling at period end keeps access
--     until then; a period end in the past or a cancelled status locks it;
--   * unknown price (22023), unknown account (P0002), a subscription moving
--     to another account (42501) are refused;
--   * invoices: a paid invoice never goes back to failed; owners read theirs,
--     other members do not;
--   * a first payment that never completed (`incomplete_expired`) neither
--     forfeits the free trial nor reads as a former subscription.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO BILLING TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000350001';
  m2      uuid := '00000000-0000-4000-a000-000000350002';
  m3      uuid := '00000000-0000-4000-a000-000000350003';
  v_scene jsonb := '{"version": 2, "pieces": []}';
  r       jsonb;
  v_cnt   int;
  v_state text;
  v_ok    boolean;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'billing-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'billing-2.test@example.invalid', now(), now()),
    (m3, 'authenticated', 'authenticated', 'billing-3.test@example.invalid', now(), now());

  -- The environment's own prices are set aside for the test (rolled back).
  update public.studio_plan_prices set active = false where active;
  insert into public.studio_plan_prices (plan, billing_interval, amount, currency, stripe_price_id) values
    ('artist', 'month', 19.90, 'EUR', 'price_testArtistMonth'),
    ('artist', 'year', 199.00, 'EUR', 'price_testArtistYear'),
    ('atelier', 'month', 39.90, 'EUR', 'price_testAtelierMonth');

  -- B1: everyone reads the active prices; nobody writes them.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_cnt from public.studio_plan_prices;
  if v_cnt <> 3 then raise exception 'FAIL B1: a visitor reads % prices', v_cnt; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    update public.studio_plan_prices set amount = 0.01;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B1: a member changed a price'; end if;
  passed := passed || 'B1'::text;

  -- B2: members neither read the Stripe customers nor call the writers.
  v_ok := false;
  begin
    perform 1 from public.stripe_customers;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B2: a member read the Stripe customers'; end if;
  v_ok := false;
  begin
    perform public.apply_studio_subscription('sub_memberForged1', 'cus_memberForged1', m1, 'price_testArtistMonth',
                                             'active', now() + interval '1 year', false, null, false);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B2: a member granted itself a subscription'; end if;
  v_ok := false;
  begin
    perform public.record_studio_invoice('in_memberForged1', 'sub_memberForged1', 'subscription_create', 'paid', 1, 'EUR', now());
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B2: a member recorded an invoice'; end if;
  passed := passed || 'B2'::text;

  -- B3: the webhook mirrors a subscription; replays update the same row.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.apply_studio_subscription('sub_testBilling01', 'cus_testBilling01', m1, 'price_testArtistMonth',
                                        'active', now() + interval '30 days', false, null, false);
  if (r ->> 'created')::boolean is not true or r ->> 'plan' <> 'artist' or (r ->> 'user_id')::uuid <> m1 then
    raise exception 'FAIL B3: first apply %', r;
  end if;
  select count(*) into v_cnt from public.stripe_customers where user_id = m1 and stripe_customer_id = 'cus_testBilling01';
  if v_cnt <> 1 then raise exception 'FAIL B3: customer not stored'; end if;
  -- Plan change in the portal: same subscription, another price; no metadata needed any more.
  r := public.apply_studio_subscription('sub_testBilling01', 'cus_testBilling01', null, 'price_testAtelierMonth',
                                        'active', now() + interval '30 days', false, null, false);
  if (r ->> 'created')::boolean is not false or r ->> 'plan' <> 'atelier' then raise exception 'FAIL B3: replay %', r; end if;
  select count(*) into v_cnt from public.studio_subscriptions where user_id = m1;
  if v_cnt <> 1 then raise exception 'FAIL B3: % rows after replay', v_cnt; end if;
  passed := passed || 'B3'::text;

  -- B4: the subscriber saves; cancelling at period end keeps access until then.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'subscribed' or r ->> 'subscription_plan' <> 'atelier' or r ->> 'subscription_interval' <> 'month' then
    raise exception 'FAIL B4: state %', r;
  end if;
  insert into public.creations (name, scene_data) values ('Abonnée', v_scene);
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.apply_studio_subscription('sub_testBilling01', 'cus_testBilling01', null, 'price_testAtelierMonth',
                                           'active', now() + interval '30 days', true, null, false);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'subscribed' or (r ->> 'subscription_cancel_at_period_end')::boolean is not true then
    raise exception 'FAIL B4: cancellation scheduled %', r;
  end if;
  passed := passed || 'B4'::text;

  -- B5: the period ends (or Stripe cancels): the Studio locks, the designs stay.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.apply_studio_subscription('sub_testBilling01', 'cus_testBilling01', null, 'price_testAtelierMonth',
                                           'active', now() - interval '1 minute', true, null, false);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'subscription_ended' then raise exception 'FAIL B5: after period end %', r; end if;
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('Après la fin', v_scene);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B5: saved after the period (%)', v_state; end if;
  select count(*) into v_cnt from public.creations where user_id = m1;
  if v_cnt <> 1 then raise exception 'FAIL B5: designs not kept (%)', v_cnt; end if;
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.apply_studio_subscription('sub_testBilling01', 'cus_testBilling01', null, 'price_testAtelierMonth',
                                           'canceled', now() + interval '30 days', false, now(), false);
  if private.studio_subscription_active(m1) then raise exception 'FAIL B5: a cancelled subscription is active'; end if;
  passed := passed || 'B5'::text;

  -- B6: refused writes.
  v_state := null;
  begin
    perform public.apply_studio_subscription('sub_testBilling02', 'cus_testBilling02', m2, 'price_notAStudioPlan',
                                             'active', now() + interval '30 days', false, null, false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B6: unknown price (%)', v_state; end if;
  v_state := null;
  begin
    perform public.apply_studio_subscription('sub_testBilling02', 'cus_testBilling02', null, 'price_testArtistMonth',
                                             'active', now() + interval '30 days', false, null, false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B6: unknown account (%)', v_state; end if;
  -- The stored customer wins over the metadata: m1's customer stays m1's.
  r := public.apply_studio_subscription('sub_testBilling03', 'cus_testBilling01', m2, 'price_testArtistYear',
                                        'active', now() + interval '1 year', false, null, false);
  if (r ->> 'user_id')::uuid <> m1 then raise exception 'FAIL B6: metadata overrode the customer %', r; end if;
  -- A subscription never moves to another account.
  perform public.apply_studio_subscription('sub_testBilling04', 'cus_testBilling04', m2, 'price_testArtistMonth',
                                           'active', now() + interval '30 days', false, null, false);
  v_state := null;
  begin
    perform public.apply_studio_subscription('sub_testBilling04', 'cus_testBilling01', null, 'price_testArtistMonth',
                                             'active', now() + interval '30 days', false, null, false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B6: subscription moved account (%)', v_state; end if;
  passed := passed || 'B6'::text;

  -- B7: invoices — a paid invoice stays paid; owners read theirs only.
  perform public.record_studio_invoice('in_testBilling01', 'sub_testBilling04', 'subscription_create', 'payment_failed', 19.90, 'eur', now());
  perform public.record_studio_invoice('in_testBilling01', 'sub_testBilling04', 'subscription_create', 'paid', 19.90, 'EUR', now());
  perform public.record_studio_invoice('in_testBilling01', 'sub_testBilling04', 'subscription_create', 'payment_failed', 19.90, 'EUR', now());
  perform public.record_studio_invoice('in_testBilling02', 'sub_testBilling04', 'subscription_cycle', 'paid', 19.90, 'EUR', now());
  select count(*) into v_cnt from public.studio_subscription_invoices
   where user_id = m2 and ((stripe_invoice_id = 'in_testBilling01' and status = 'paid' and currency = 'EUR')
                           or (stripe_invoice_id = 'in_testBilling02' and billing_reason = 'subscription_cycle'));
  if v_cnt <> 2 then raise exception 'FAIL B7: invoices recorded % of 2', v_cnt; end if;
  v_state := null;
  begin
    perform public.record_studio_invoice('in_testBilling03', 'sub_unknownBilling', 'subscription_cycle', 'paid', 1, 'EUR', now());
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B7: invoice of an unknown subscription (%)', v_state; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_subscription_invoices;
  if v_cnt <> 0 then raise exception 'FAIL B7: another member reads % invoice(s)', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_subscription_invoices;
  if v_cnt <> 2 then raise exception 'FAIL B7: owner reads % invoice(s)', v_cnt; end if;
  passed := passed || 'B7'::text;

  -- B8: a first payment that never completed keeps the trial open.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.apply_studio_subscription('sub_testBilling05', 'cus_testBilling05', m3, 'price_testArtistMonth',
                                           'incomplete_expired', now() + interval '30 days', false, null, false);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  r := public.studio_access_state();
  if r ->> 'state' <> 'not_started' then raise exception 'FAIL B8: abandoned first payment reads %', r; end if;
  r := public.start_studio_trial();
  if (r ->> 'started')::boolean is not true then raise exception 'FAIL B8: trial refused %', r; end if;
  passed := passed || 'B8'::text;

  raise exception 'ALL STUDIO BILLING TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
