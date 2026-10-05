-- =============================================================================
-- E-mail sending — delivery events and pending-event queries validation suite.
-- =============================================================================
-- Requires all migrations (including 20261005121753_email_log_apply_event and
-- 20261005122328_email_pending_events). ONE transaction, ALWAYS rolled back by
-- raising `ALL EMAIL TESTS PASSED` (or `FAIL: ...`). Creates its own order,
-- payment, parcels, refund and (when a profile and a course exist) entitlement.
--
--   EM1 email_log_apply_event moves a log row forward only (opened is not undone by a
--       replayed delivered, bounced is not undone, a complaint follows a bounce),
--       answers matched = false for an unknown provider id, refuses other statuses
--   EM2 a bounce / complaint of a newsletter e-mail marks the subscriber (found through
--       the hash of the address); an opened e-mail and a non-newsletter template do not
--   EM3 pending_shipping_emails: only `shipped` parcels of a paid order from the last 7
--       days, minus finished log rows; failed ones come back until the attempt cap
--   EM4 pending_refund_emails: succeeded refunds not yet logged
--   EM5 pending_course_enrolment_emails: purchase entitlements of a paid order, not revoked,
--       optionally for one order
--   EM6 none of these functions is executable by anon or authenticated
-- =============================================================================

do $$
declare
  h text := encode(extensions.digest('hb@example.com', 'sha256'), 'hex');
  billing jsonb := '{"first_name":"Léa","last_name":"T","address_line1":"1 rue X","city":"Paris","country_code":"FR"}';
  passed text[] := '{}';
  v_order uuid; v_pay uuid; v_ship uuid; v_ship2 uuid; v_ref uuid;
  v_user uuid; v_course uuid; v_ent uuid;
  n int; r record; k text; st text; v_state text;
begin
  -- EM1 / EM2 -----------------------------------------------------------------
  insert into public.newsletter_subscriptions (email, status, confirmed_at) values ('HB@example.com', 'subscribed', now());
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, provider_id)
    values ('t:1', 'newsletter_confirmation', 'fr', h, 'sent', 'prov-1'),
           ('t:2', 'contact_acknowledgement', 'fr', h, 'sent', 'prov-2');

  select * into r from public.email_log_apply_event('nope', 'delivered');
  if r.matched then raise exception 'FAIL EM1: an unknown provider id matched'; end if;
  select * into r from public.email_log_apply_event('prov-1', 'opened');
  if not (r.matched and r.applied and r.new_status = 'opened') then raise exception 'FAIL EM1: opened not applied (%)', r; end if;
  select * into r from public.email_log_apply_event('prov-1', 'delivered');
  if r.applied or r.new_status <> 'opened' then raise exception 'FAIL EM1: a replayed delivered regressed opened (%)', r; end if;
  select * into r from public.email_log_apply_event('prov-1', 'opened');
  if r.applied then raise exception 'FAIL EM1: a replay was applied twice'; end if;
  select status into st from public.newsletter_subscriptions where lower(email) = 'hb@example.com';
  if st <> 'subscribed' then raise exception 'FAIL EM2: an opened e-mail changed the subscriber (%)', st; end if;
  select * into r from public.email_log_apply_event('prov-1', 'bounced');
  if not r.applied then raise exception 'FAIL EM1: bounce not applied'; end if;
  select status into st from public.newsletter_subscriptions where lower(email) = 'hb@example.com';
  if st <> 'bounced' then raise exception 'FAIL EM2: the subscriber was not marked bounced (%)', st; end if;
  select * into r from public.email_log_apply_event('prov-1', 'delivered');
  if r.applied then raise exception 'FAIL EM1: moved back from bounced'; end if;
  select * into r from public.email_log_apply_event('prov-1', 'complained');
  if not r.applied then raise exception 'FAIL EM1: a complaint after a bounce was not applied'; end if;
  select status into st from public.newsletter_subscriptions where lower(email) = 'hb@example.com';
  if st <> 'complained' then raise exception 'FAIL EM2: the subscriber was not marked complained (%)', st; end if;
  update public.newsletter_subscriptions set status = 'subscribed' where lower(email) = 'hb@example.com';
  perform * from public.email_log_apply_event('prov-2', 'complained');
  select status into st from public.newsletter_subscriptions where lower(email) = 'hb@example.com';
  if st <> 'subscribed' then raise exception 'FAIL EM2: a contact e-mail touched the subscriber (%)', st; end if;
  begin
    perform * from public.email_log_apply_event('prov-2', 'sent');
    raise exception 'FAIL EM1: status sent accepted';
  exception when sqlstate '22023' then null;
  end;
  passed := array_append(passed, 'EM1 delivery events only move forward, unknown ids are not matched');
  passed := array_append(passed, 'EM2 newsletter bounce / complaint marks the subscriber, nothing else does');

  -- EM3 shipping ---------------------------------------------------------------
  insert into public.orders (customer_email, billing_address, currency, subtotal_amount, total_amount, payment_status, status, locale)
    values ('t@example.com', billing, 'EUR', 10, 10, 'paid', 'processing', 'en') returning id into v_order;
  insert into public.payments (order_id, status, amount, currency) values (v_order, 'succeeded', 10, 'EUR') returning id into v_pay;
  insert into public.shipments (order_id, status, carrier, tracking_number, tracking_url, shipped_at)
    values (v_order, 'shipped', 'Colissimo', 'TRK123', 'https://track.example/TRK123', now()) returning id into v_ship;
  insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at)
    values (v_order, 'delivered', 'Colissimo', 'TRK124', now()) returning id into v_ship2;

  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 1 then raise exception 'FAIL EM3: the shipped parcel is missing'; end if;
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship2;
  if n <> 0 then raise exception 'FAIL EM3: a delivered parcel is listed'; end if;
  select * into r from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if r.first_name <> 'Léa' or r.locale <> 'en' or r.email <> 't@example.com' or r.tracking_url <> 'https://track.example/TRK123' then
    raise exception 'FAIL EM3: wrong row (%)', r;
  end if;

  k := 'shipping:' || v_ship::text;
  perform * from public.email_log_claim(k, 'shipping_notification', 'en', repeat('a', 64), v_order, null);
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 0 then raise exception 'FAIL EM3: a parcel being sent is listed'; end if;
  perform public.email_log_finish(k, 'failed', null, 'x');
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 1 then raise exception 'FAIL EM3: a failed e-mail is not retried'; end if;
  update public.email_log set attempt = 5 where event_key = k;
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 0 then raise exception 'FAIL EM3: a capped e-mail is listed'; end if;
  update public.email_log set status = 'sent', attempt = 1 where event_key = k;
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 0 then raise exception 'FAIL EM3: a sent e-mail is listed'; end if;
  delete from public.email_log where event_key = k;
  update public.shipments set shipped_at = now() - interval '8 days' where id = v_ship;
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 0 then raise exception 'FAIL EM3: a parcel older than 7 days is listed'; end if;
  update public.shipments set shipped_at = now() where id = v_ship;
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 1 then raise exception 'FAIL EM3: the recent parcel is missing'; end if;
  update public.orders set payment_status = 'pending' where id = v_order;
  select count(*) into n from public.pending_shipping_emails(10) where shipment_id = v_ship;
  if n <> 0 then raise exception 'FAIL EM3: a parcel of an unpaid order is listed'; end if;
  update public.orders set payment_status = 'paid' where id = v_order;
  passed := array_append(passed, 'EM3 shipping: shipped parcels of paid orders, 7-day window, log-aware, attempt cap');

  -- EM4 refund -----------------------------------------------------------------
  insert into public.refunds (order_id, payment_id, amount, currency, reason, status, processed_at)
    values (v_order, v_pay, 4.5, 'EUR', 'goodwill', 'succeeded', now()) returning id into v_ref;
  select * into r from public.pending_refund_emails(10) where refund_id = v_ref;
  if r.refund_id is null or r.amount <> 4.5 or r.currency <> 'EUR' then raise exception 'FAIL EM4: wrong row (%)', r; end if;
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status)
    values ('refund:' || v_ref::text, 'order_refunded', 'en', repeat('b', 64), 'delivered');
  select count(*) into n from public.pending_refund_emails(10) where refund_id = v_ref;
  if n <> 0 then raise exception 'FAIL EM4: a mailed refund is listed'; end if;
  passed := array_append(passed, 'EM4 refund: succeeded refunds not yet logged');

  -- EM5 course enrolment ---------------------------------------------------------
  select id into v_user from public.profiles limit 1;
  select id into v_course from public.courses limit 1;
  if v_user is not null and v_course is not null then
    update public.orders set user_id = v_user where id = v_order;
    insert into public.course_entitlements (user_id, course_id, source, order_id) values (v_user, v_course, 'purchase', v_order)
      returning id into v_ent;
    select * into r from public.pending_course_enrolment_emails(v_order, 10);
    if r.entitlement_id <> v_ent or r.course_name is null or r.first_name <> 'Léa' then raise exception 'FAIL EM5: wrong row (%)', r; end if;
    select count(*) into n from public.pending_course_enrolment_emails(gen_random_uuid(), 10);
    if n <> 0 then raise exception 'FAIL EM5: another order''s entitlement is listed'; end if;
    update public.course_entitlements set revoked_at = now() where id = v_ent;
    select count(*) into n from public.pending_course_enrolment_emails(v_order, 10);
    if n <> 0 then raise exception 'FAIL EM5: a revoked entitlement is listed'; end if;
    passed := array_append(passed, 'EM5 enrolment: purchase entitlements of paid orders, not revoked');
  else
    passed := array_append(passed, 'EM5 skipped (no profile or course in the database)');
  end if;

  -- EM6 privileges -------------------------------------------------------------------
  select count(*) into n from information_schema.routine_privileges
   where routine_name in ('email_log_apply_event', 'pending_shipping_emails', 'pending_refund_emails', 'pending_course_enrolment_emails')
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'FAIL EM6: an e-mail function is executable by an API role'; end if;
  begin
    set local role authenticated;
    perform * from public.pending_refund_emails(1);
    reset role;
    raise exception 'FAIL EM6: authenticated could call pending_refund_emails';
  exception when sqlstate '42501' then
    reset role;
  end;
  passed := array_append(passed, 'EM6 service role only');

  raise exception 'ALL EMAIL TESTS PASSED (% checks): %', array_length(passed, 1), array_to_string(passed, ' | ');
end;
$$;
