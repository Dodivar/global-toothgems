-- =============================================================================
-- Newsletter → Resend contacts sync validation suite (migration 20261106182531_newsletter_contact_sync)
-- =============================================================================
-- Proves:
--
--   * a subscribed row is queued, a pending one is not; leaving the list queues a row only when
--     it was subscribed or already sent to Resend;
--   * a member's CRM tag added or removed, or their first name changed, queues their row
--     (only while subscribed);
--   * pending_newsletter_contacts() hands the sweep the e-mail, the member's first name and tags,
--     and nothing personal for a row that is leaving;
--   * record_newsletter_contact_sync(): success closes the row, unless it changed during the sync
--     (compare-and-set on the due time); a failure counts and backs off;
--   * visitors and members can call neither function;
--   * the scheduled job exists and call_email_function() knows the new function.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL NEWSLETTER CONTACT SYNC TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  ana   uuid := '00000000-0000-4000-a000-0000005c0001';
  bob   uuid := '00000000-0000-4000-a000-0000005c0002';
  v_sub public.newsletter_subscriptions;
  v_row record;
  v_due timestamptz;
  v_ok  boolean;
  v_state text;
  v_txt text;
  v_cnt int;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (ana, 'authenticated', 'authenticated', 'ana.sync@example.invalid', '{"first_name":"Ana"}', now(), now()),
    (bob, 'authenticated', 'authenticated', 'bob.sync@example.invalid', '{"first_name":"Bob"}', now(), now());

  -- ===========================================================================
  -- CS1 what queues a row
  -- ===========================================================================
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (ana, 'marketing_email', true, '2026-10-04', 'account');
  select * into v_sub from public.newsletter_subscriptions where user_id = ana;
  if v_sub.status <> 'subscribed' or v_sub.contact_sync_due_at is null then
    raise exception 'FAIL CS1: subscribed member not queued (%, %)', v_sub.status, v_sub.contact_sync_due_at;
  end if;

  insert into public.newsletter_subscriptions (email, status, source, policy_version, confirm_token_hash, confirm_expires_at)
  values ('pending.sync@example.invalid', 'pending', 'home', '2026-10-04', repeat('a', 64), now() + interval '1 day');
  select * into v_sub from public.newsletter_subscriptions where email = 'pending.sync@example.invalid';
  if v_sub.contact_sync_due_at is not null then raise exception 'FAIL CS1: pending row queued'; end if;
  update public.newsletter_subscriptions set status = 'unsubscribed', unsubscribed_at = now() where id = v_sub.id;
  select * into v_sub from public.newsletter_subscriptions where id = v_sub.id;
  if v_sub.contact_sync_due_at is not null then raise exception 'FAIL CS1: never-sent row queued on leaving'; end if;
  passed := array_append(passed, 'CS1 subscribed rows queued, pending ones never, leaving only when sent before');

  -- ===========================================================================
  -- CS2 the sweep's view, and the record
  -- ===========================================================================
  insert into public.customer_tags (user_id, tag) values (ana, 'vip'), (ana, 'follow_up');
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select * into v_row from public.pending_newsletter_contacts(100) p where p.email = 'ana.sync@example.invalid';
  if v_row.id is null or not v_row.subscribed or v_row.first_name is distinct from 'Ana'
     or v_row.tags is distinct from array['follow_up', 'vip'] or v_row.locale is null then
    raise exception 'FAIL CS2: pending row %', row_to_json(v_row);
  end if;
  select count(*) into v_cnt from public.pending_newsletter_contacts(100) p where p.email = 'pending.sync@example.invalid';
  if v_cnt <> 0 then raise exception 'FAIL CS2: pending row listed'; end if;

  -- changed during the sync: the record does not close it
  v_ok := public.record_newsletter_contact_sync(v_row.id, v_row.due_at - interval '1 second', null);
  execute 'reset role';
  select * into v_sub from public.newsletter_subscriptions where id = v_row.id;
  if not v_ok or v_sub.contact_sync_due_at is null or v_sub.contact_synced_at is null then
    raise exception 'FAIL CS2: stale record closed the row (%)', v_sub.contact_sync_due_at;
  end if;

  perform set_config('role', 'service_role', true);
  v_ok := public.record_newsletter_contact_sync(v_row.id, v_row.due_at, 'HTTP 500');
  execute 'reset role';
  select * into v_sub from public.newsletter_subscriptions where id = v_row.id;
  if v_sub.contact_sync_attempts <> 1 or v_sub.contact_sync_error <> 'HTTP 500'
     or v_sub.contact_sync_due_at < now() + interval '9 minutes' then
    raise exception 'FAIL CS2: failure not backed off (%, %, %)', v_sub.contact_sync_attempts, v_sub.contact_sync_error, v_sub.contact_sync_due_at;
  end if;

  perform set_config('role', 'service_role', true);
  v_ok := public.record_newsletter_contact_sync(v_row.id, v_sub.contact_sync_due_at, null);
  execute 'reset role';
  select * into v_sub from public.newsletter_subscriptions where id = v_row.id;
  if v_sub.contact_sync_due_at is not null or v_sub.contact_sync_attempts <> 0 or v_sub.contact_sync_error is not null then
    raise exception 'FAIL CS2: success did not close the row';
  end if;
  passed := array_append(passed, 'CS2 the sweep reads e-mail, first name and tags; records close, back off, and never close a row changed meanwhile');

  -- ===========================================================================
  -- CS3 member changes queue the row again (while subscribed only)
  -- ===========================================================================
  delete from public.customer_tags where user_id = ana and tag = 'vip';
  select contact_sync_due_at into v_due from public.newsletter_subscriptions where user_id = ana;
  if v_due is null then raise exception 'FAIL CS3: tag removal not queued'; end if;
  update public.newsletter_subscriptions set contact_sync_due_at = null where user_id = ana;

  update public.profiles set first_name = 'Anaïs' where id = ana;
  select contact_sync_due_at into v_due from public.newsletter_subscriptions where user_id = ana;
  if v_due is null then raise exception 'FAIL CS3: first name change not queued'; end if;
  update public.newsletter_subscriptions set contact_sync_due_at = null, contact_synced_at = now() where user_id = ana;

  insert into public.customer_tags (user_id, tag) values (bob, 'vip');
  select count(*) into v_cnt from public.newsletter_subscriptions where user_id = bob;
  if v_cnt <> 0 then raise exception 'FAIL CS3: a tag created a list row'; end if;

  -- unsubscribing a synced member queues the deletion, with nothing personal
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (ana, 'marketing_email', false, '2026-10-04', 'account');
  perform set_config('role', 'service_role', true);
  select * into v_row from public.pending_newsletter_contacts(100) p where p.email = 'ana.sync@example.invalid';
  execute 'reset role';
  if v_row.id is null or v_row.subscribed or v_row.first_name is not null or v_row.tags <> '{}' then
    raise exception 'FAIL CS3: leaving row %', row_to_json(v_row);
  end if;
  passed := array_append(passed, 'CS3 tags and first name queue a subscribed member; leaving queues the deletion with nothing personal');

  -- ===========================================================================
  -- CS4 server only, and scheduled
  -- ===========================================================================
  foreach v_txt in array array['anon', 'authenticated'] loop
    perform set_config('role', v_txt, true);
    perform set_config('request.jwt.claims', json_build_object('role', v_txt, 'sub', ana)::text, true);
    v_state := null;
    begin
      perform public.pending_newsletter_contacts(10);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then execute 'reset role'; raise exception 'FAIL CS4: % read the queue (%)', v_txt, v_state; end if;
    v_state := null;
    begin
      perform public.record_newsletter_contact_sync(gen_random_uuid(), now(), null);
    exception when others then v_state := sqlstate;
    end;
    execute 'reset role';
    if v_state is distinct from '42501' then raise exception 'FAIL CS4: % recorded a sync (%)', v_txt, v_state; end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_cnt from cron.job where jobname = 'sync-newsletter-contacts' and schedule = '*/5 * * * *';
  if v_cnt <> 1 then raise exception 'FAIL CS4: scheduled job missing'; end if;
  v_state := null;
  begin
    perform private.call_email_function('not-a-function');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL CS4: unknown function accepted (%)', v_state; end if;
  select count(*) into v_cnt from pg_proc where proname = 'call_email_function'
     and pg_get_functiondef(oid) like '%sync-newsletter-contacts%';
  if v_cnt <> 1 then raise exception 'FAIL CS4: call_email_function does not know the sweep'; end if;
  passed := array_append(passed, 'CS4 queue functions are the server''s only; the sweep is scheduled every 5 minutes');

  raise exception 'ALL NEWSLETTER CONTACT SYNC TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
