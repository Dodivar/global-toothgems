-- =============================================================================
-- Members' privacy rights validation suite (migration 20261106190000_account_privacy_rights)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * visitors cannot export anything; a member's archive holds their own rows
--     (orders, guest orders placed with their confirmed address, creations,
--     reviews, consents, Studio billing) and none of another member's, and no
--     secret (gift card code, share-link token, newsletter token);
--   * a second export within 5 minutes answers too_soon;
--   * members cannot call the erasure or list someone's files;
--   * the blockers: staff account, running Studio subscription;
--   * a blocked erasure changes nothing; an allowed one deletes the auth user,
--     the profile and what cascades from it, keeps orders (user_id null), the
--     Studio subscription and its payments (user_id null) and the Studio
--     immediate-access consent, deletes the other consents, unsubscribes the
--     newsletter, records the erasure in the audit log and copies none of the
--     deleted rows there; another member's data is untouched.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL ACCOUNT PRIVACY TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000123001';
  m2      uuid := '00000000-0000-4000-a000-000000123002';
  staff   uuid := '00000000-0000-4000-a000-000000123003';
  addr    jsonb := '{"first_name":"Test","last_name":"Privacy","address_line1":"1 rue Test","postal_code":"75001","city":"Paris","country_code":"FR"}';
  v_scene jsonb := '{"version": 2, "pieces": []}';
  v_prod  uuid;
  o1      uuid;
  o_guest uuid;
  o2      uuid;
  v_sub   uuid;
  r       jsonb;
  v_arr   text[];
  v_cnt   int;
  v_ok    boolean;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'privacy-1.test@example.invalid', now(), now(), now()),
    (m2, 'authenticated', 'authenticated', 'privacy-2.test@example.invalid', now(), now(), now()),
    (staff, 'authenticated', 'authenticated', 'privacy-staff.test@example.invalid', now(), now(), now());
  update public.profiles set role = 'admin' where id = staff;

  select id into v_prod from public.products order by created_at limit 1;
  if v_prod is null then raise exception 'FAIL setup: no product in the database'; end if;

  -- m1: an order, a guest order with the same address, a review, a creation
  -- with a share link, consents, a newsletter subscription, a Studio subscription.
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount)
  values (m1, 'privacy-1.test@example.invalid', addr, 'EUR', 10, 10) returning id into o1;
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount)
  values (null, 'Privacy-1.Test@example.invalid', addr, 'EUR', 12, 12) returning id into o_guest;
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount)
  values (m2, 'privacy-2.test@example.invalid', addr, 'EUR', 20, 20) returning id into o2;

  insert into public.reviews (product_id, user_id, rating, title, body, language)
  values (v_prod, m1, 5, 'Privacy review', 'Texte personnel qui doit disparaître avec le compte.', 'fr');
  insert into public.creations (user_id, name, scene_data) values (m1, 'Privacy creation', v_scene);
  insert into public.creation_shares (creation_id, user_id, token)
  select c.id, m1, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' from public.creations c where c.user_id = m1;
  insert into public.creations (user_id, name, scene_data) values (m2, 'Other member creation', v_scene);

  insert into public.consent_records (user_id, purpose, granted, policy_version, source) values
    (m1, 'terms', true, '2026-09-26', 'registration'),
    (m1, 'studio_immediate_access', true, '2026-10-18', 'checkout');
  insert into public.newsletter_subscriptions (email, user_id, status, confirmed_at, source)
  values ('privacy-1.test@example.invalid', m1, 'subscribed', now(), 'account');

  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end, billing_interval)
  values (m1, 'artist', 'active', 'sub_privacyTest01', now() + interval '20 days', 'month') returning id into v_sub;
  insert into public.studio_subscription_invoices (stripe_invoice_id, subscription_id, user_id, billing_reason, status, amount, currency, occurred_at)
  values ('in_privacyTest01', v_sub, m1, 'subscription_create', 'paid', 19.90, 'EUR', now());

  -- P1: a visitor exports nothing.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform public.my_personal_data();
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P1: a visitor called my_personal_data()'; end if;
  passed := passed || 'P1'::text;

  -- P2: the member's archive holds their rows only, and no secret.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.my_personal_data();
  if r ->> 'status' <> 'ok' then raise exception 'FAIL P2: status %', r ->> 'status'; end if;
  r := r -> 'archive';
  if r -> 'account' ->> 'email' <> 'privacy-1.test@example.invalid' then raise exception 'FAIL P2: account %', r -> 'account'; end if;
  select array_agg(o ->> 'id') into v_arr from jsonb_array_elements(r -> 'shop' -> 'orders') o;
  if not (o1::text = any (v_arr) and o_guest::text = any (v_arr)) or o2::text = any (v_arr) or cardinality(v_arr) <> 2 then
    raise exception 'FAIL P2: orders %', v_arr;
  end if;
  if jsonb_array_length(r -> 'studio' -> 'creations') <> 1
     or r -> 'studio' -> 'creations' -> 0 ->> 'name' <> 'Privacy creation' then
    raise exception 'FAIL P2: creations %', r -> 'studio' -> 'creations';
  end if;
  if jsonb_array_length(r -> 'shop' -> 'reviews') <> 1 then raise exception 'FAIL P2: reviews'; end if;
  if jsonb_array_length(r -> 'consents') <> 2 then raise exception 'FAIL P2: consents'; end if;
  if jsonb_array_length(r -> 'studio' -> 'subscriptions') <> 1
     or jsonb_array_length(r -> 'studio' -> 'subscription_payments') <> 1 then
    raise exception 'FAIL P2: Studio billing';
  end if;
  if r::text like '%deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef%' then raise exception 'FAIL P2: the share-link token is in the archive'; end if;
  if r -> 'newsletter' -> 0 ? 'unsubscribe_token' then raise exception 'FAIL P2: the newsletter token is in the archive'; end if;
  if r::text like '%' || m2::text || '%' or r::text like '%privacy-2.test%' then
    raise exception 'FAIL P2: another member''s data is in the archive';
  end if;
  if r -> 'studio' -> 'subscriptions' -> 0 ? 'stripe_subscription_id' then raise exception 'FAIL P2: Stripe identifier exported'; end if;
  passed := passed || 'P2'::text;

  -- P3: a second export within 5 minutes is refused.
  r := public.my_personal_data();
  if r ->> 'status' <> 'too_soon' or r ->> 'retry_at' is null then raise exception 'FAIL P3: %', r; end if;
  passed := passed || 'P3'::text;

  -- P4: members cannot erase an account or list its files, even their own.
  v_ok := false;
  begin
    perform public.erase_account(m2);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P4: a member called erase_account()'; end if;
  v_ok := false;
  begin
    perform public.account_erasure_files(m1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL P4: a member called account_erasure_files()'; end if;
  passed := passed || 'P4'::text;

  -- P5: blockers as the member reads them.
  v_arr := public.my_account_erasure_blockers();
  if v_arr is distinct from array['studio_subscription'] then raise exception 'FAIL P5: m1 blockers %', v_arr; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  v_arr := public.my_account_erasure_blockers();
  if not ('staff' = any (v_arr)) then raise exception 'FAIL P5: staff blockers %', v_arr; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  v_arr := public.my_account_erasure_blockers();
  if cardinality(v_arr) <> 0 then raise exception 'FAIL P5: m2 blockers %', v_arr; end if;
  passed := passed || 'P5'::text;

  -- P6: a blocked erasure changes nothing.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.erase_account(m1);
  if r ->> 'status' <> 'blocked' or not (r -> 'blockers' ? 'studio_subscription') then raise exception 'FAIL P6: %', r; end if;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from auth.users where id = m1) then raise exception 'FAIL P6: the account went anyway'; end if;
  perform set_config('role', 'service_role', true);
  r := public.erase_account(staff);
  if r ->> 'status' <> 'blocked' then raise exception 'FAIL P6: staff erased %', r; end if;
  passed := passed || 'P6'::text;

  -- P7: once the subscription is over, the erasure goes through.
  perform set_config('role', 'postgres', true);
  update public.studio_subscriptions set status = 'canceled', canceled_at = now() where id = v_sub;
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.account_erasure_files(m1);  -- callable by the service role
  r := public.erase_account(m1);
  if r ->> 'status' <> 'erased' then raise exception 'FAIL P7: %', r; end if;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from auth.users where id = m1) or exists (select 1 from public.profiles where id = m1) then
    raise exception 'FAIL P7: the account is still there';
  end if;
  if exists (select 1 from public.creations where name = 'Privacy creation')
     or exists (select 1 from public.reviews where title = 'Privacy review')
     or exists (select 1 from public.creation_shares where token = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef') then
    raise exception 'FAIL P7: personal content survived';
  end if;
  if not exists (select 1 from public.orders where id = o1 and user_id is null) then raise exception 'FAIL P7: the order was not kept'; end if;
  if not exists (select 1 from public.studio_subscriptions where id = v_sub and user_id is null)
     or not exists (select 1 from public.studio_subscription_invoices where stripe_invoice_id = 'in_privacyTest01' and user_id is null) then
    raise exception 'FAIL P7: the Studio billing records were not kept';
  end if;
  if not exists (select 1 from public.consent_records where purpose = 'studio_immediate_access' and policy_version = '2026-10-18' and user_id is null)
     or exists (select 1 from public.consent_records where purpose = 'terms' and policy_version = '2026-09-26' and user_id is null
                  and created_at >= now() - interval '1 minute') then
    raise exception 'FAIL P7: consents (Studio kept, others deleted)';
  end if;
  if not exists (select 1 from public.newsletter_subscriptions
                  where email = 'privacy-1.test@example.invalid' and status = 'unsubscribed' and user_id is null) then
    raise exception 'FAIL P7: the newsletter was not unsubscribed';
  end if;
  if not exists (select 1 from public.audit_logs where table_name = 'profiles' and record_id = m1::text
                    and changes = '{"reason": "account_erasure"}'::jsonb) then
    raise exception 'FAIL P7: the erasure is not in the audit log';
  end if;
  if exists (select 1 from public.audit_logs where table_name = 'reviews' and action = 'delete'
                and changes::text like '%Texte personnel%') then
    raise exception 'FAIL P7: the audit log kept a copy of the deleted review';
  end if;
  passed := passed || 'P7'::text;

  -- P8: the other member is untouched.
  if not exists (select 1 from public.profiles where id = m2)
     or not exists (select 1 from public.creations where user_id = m2)
     or not exists (select 1 from public.orders where id = o2 and user_id = m2) then
    raise exception 'FAIL P8: another member lost data';
  end if;
  passed := passed || 'P8'::text;

  raise exception 'ALL ACCOUNT PRIVACY TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
