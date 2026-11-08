-- =============================================================================
-- Academy course withdrawal waiver validation suite
-- (migration 20261108150000_course_withdrawal_waiver, decision 128)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   CW1 `course_immediate_access` is an accepted consent purpose: a member
--       records only their own (42501 for another account);
--   CW2 the enrolment sweep returns the buyer's latest waiver given before the
--       order (its version and time), and none when the only waiver came after
--       the order or belongs to someone else; members cannot call it (42501);
--   CW3 erasing the account keeps the waiver, without the account's id.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL COURSE WITHDRAWAL WAIVER TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000127001';
  m2      uuid := '00000000-0000-4000-a000-000000127002';
  v_course uuid;
  v_order1 uuid;
  v_order2 uuid;
  v_waiver uuid;
  r        record;
  v_cnt    int;
  v_state  text;
  passed   text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'waiver-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'waiver-2.test@example.invalid', now(), now());

  -- CW1: a member records their own waiver, not someone else's.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'course_immediate_access', true, 'course-withdrawal-2026-11', 'checkout', now() - interval '2 minutes')
  returning id into v_waiver;
  v_state := null;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (m2, 'course_immediate_access', true, 'course-withdrawal-2026-11', 'checkout');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL CW1: recorded for another account (%)', v_state; end if;

  v_state := null;
  begin
    perform public.pending_course_enrolment_emails(null, 25);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL CW2: a member listed the sweep (%)', v_state; end if;
  passed := passed || 'CW1'::text;

  -- CW2: two paid course orders. m1 waived before ordering; m2 waived only after.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.courses (slug, title, status, published_at) values ('cw-test-course', 'Cours CW', 'draft', null)
    returning id into v_course;
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount, payment_status, status, locale, created_at)
    values (m1, 'waiver-1.test@example.invalid', '{"first_name": "Léa"}', 'EUR', 90, 90, 'paid', 'processing', 'fr', now() - interval '1 minute')
    returning id into v_order1;
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount, payment_status, status, locale, created_at)
    values (m2, 'waiver-2.test@example.invalid', '{"first_name": "Sam"}', 'EUR', 90, 90, 'paid', 'processing', 'en', now() - interval '1 minute')
    returning id into v_order2;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (m2, 'course_immediate_access', true, 'course-withdrawal-2026-11', 'checkout');
  insert into public.course_entitlements (user_id, course_id, source, order_id) values
    (m1, v_course, 'purchase', v_order1),
    (m2, v_course, 'purchase', v_order2);

  select * into r from public.pending_course_enrolment_emails(v_order1, 10);
  if r.consent_version is distinct from 'course-withdrawal-2026-11' or r.consented_at is null then
    raise exception 'FAIL CW2: the waiver given before the order is missing (%)', r;
  end if;
  select * into r from public.pending_course_enrolment_emails(v_order2, 10);
  if r.entitlement_id is null then raise exception 'FAIL CW2: the second enrolment is not listed'; end if;
  if r.consent_version is not null then raise exception 'FAIL CW2: a waiver given after the order is quoted'; end if;
  passed := passed || 'CW2'::text;

  -- CW3: erasing m2's account keeps their waiver without the account; other consents go.
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (m2, 'terms', true, 'terms-v1', 'signup');
  delete from public.course_entitlements where user_id = m2;
  r := null;
  select public.erase_account(m2) ->> 'status' as status into r;
  if r.status is distinct from 'erased' then raise exception 'FAIL CW3: erase_account answered %', r.status; end if;
  select count(*) into v_cnt from public.consent_records
   where purpose = 'course_immediate_access' and user_id is null and created_at >= now() - interval '1 minute';
  if v_cnt <> 1 then raise exception 'FAIL CW3: % waiver(s) kept without the account', v_cnt; end if;
  select count(*) into v_cnt from public.consent_records where user_id = m2;
  if v_cnt <> 0 then raise exception 'FAIL CW3: % consent(s) still on the erased account', v_cnt; end if;
  passed := passed || 'CW3'::text;

  raise exception 'ALL COURSE WITHDRAWAL WAIVER TESTS PASSED (%)', array_to_string(passed, ', ');
end $$;
