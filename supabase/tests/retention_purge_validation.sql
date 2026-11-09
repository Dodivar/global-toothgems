-- =============================================================================
-- Retention purge validation suite (migrations 20261108205151_retention_purge_jobs,
-- 20261108211113_retention_purge_course_waiver)
-- =============================================================================
-- Proves, decision 127:
--
--   R1  nobody but the table owner runs the purge; only the service role reads
--       and clears the Storage queue;
--   R2  a ticket whose last exchange is over 3 years old is deleted with its
--       notes, its attachments are queued and its audit trail is redacted;
--       a ticket with a recent note, change or creation stays;
--   R3  an unreferenced attachment older than a day is queued; a referenced one
--       or a fresh upload is not;
--   R4  consent proofs: one replaced more than 5 years ago goes, the one in force
--       stays however old, one replaced less than 5 years ago stays, a
--       per-purchase proof (Studio or course waiver) goes after 5 years (and an unlinked one, where the
--       column allows it);
--   R5  a newsletter sign-up never confirmed goes 30 days after its link
--       expired; the opt-out list and subscribers stay;
--   R6  back-in-stock alerts: 1 year after the e-mail, 3 years when never sent;
--   R7  orders and invoices are untouched; one summary audit row; the purge
--       setting does not leak; a second run purges nothing;
--   R8  record_storage_purges dequeues what was removed and counts failures;
--   R9  the two pg_cron jobs exist.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL RETENTION PURGE TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1        uuid := gen_random_uuid();
  t_old     uuid;
  t_note    uuid;
  t_touched uuid;
  t_recent  uuid;
  c_old_terms uuid;
  c_new_terms uuid;
  c_old_priv  uuid;
  c_cookie    uuid;
  c_sia_old   uuid;
  c_sia_new   uuid;
  c_unlinked  uuid;
  c_course    uuid;
  n_expired uuid;
  n_fresh   uuid;
  n_opt_out uuid;
  p_id      uuid;
  b_sent_old uuid;
  b_sent_new uuid;
  b_open_old uuid;
  b_open_new uuid;
  v_orders   bigint := (select count(*) from public.orders);
  v_invoices bigint := (select count(*) from public.invoices);
  v_nullable boolean := not (select attnotnull from pg_attribute
                              where attrelid = 'public.consent_records'::regclass and attname = 'user_id');
  r      jsonb;
  v_cnt  int;
  v_ok   boolean;
  v_ids  bigint[];
  passed text[] := '{}';
begin
  -- ---------------------------------------------------------------------------
  -- R1 privileges
  -- ---------------------------------------------------------------------------
  if has_function_privilege('anon', 'private.purge_expired_personal_data(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'private.purge_expired_personal_data(timestamptz)', 'execute')
     or has_function_privilege('service_role', 'private.purge_expired_personal_data(timestamptz)', 'execute') then
    raise exception 'FAIL R1: an API role may run the purge';
  end if;
  if has_function_privilege('anon', 'public.pending_storage_purges(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.pending_storage_purges(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.record_storage_purges(bigint[], bigint[], text)', 'execute') then
    raise exception 'FAIL R1: a browser role may read or clear the Storage queue';
  end if;
  if not has_function_privilege('service_role', 'public.pending_storage_purges(integer)', 'execute')
     or not has_function_privilege('service_role', 'public.record_storage_purges(bigint[], bigint[], text)', 'execute') then
    raise exception 'FAIL R1: the service role cannot run the Storage sweep';
  end if;
  if has_table_privilege('authenticated', 'private.storage_purge_queue', 'select') then
    raise exception 'FAIL R1: the queue is readable';
  end if;
  passed := passed || 'R1'::text;

  -- ---------------------------------------------------------------------------
  -- Fixtures (as the table owner)
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (m1, 'authenticated', 'authenticated', 'retention-1.test@example.invalid', now(), now(), now());

  -- Tickets
  insert into public.contact_requests (name, email, category, subject, message, created_at, updated_at, status,
                                       first_response_at, resolved_at, attachment_paths)
  values ('Old', 'old.test@example.invalid', 'order', 'Old ticket', 'RETENTION-SECRET-TEXT of the old ticket',
          now() - interval '4 years', now() - interval '4 years', 'closed',
          now() - interval '4 years', now() - interval '4 years',
          array['guest/retention-test-a.jpg', 'guest/retention-test-b.pdf'])
  returning id into t_old;
  -- A note's dates are set by its trigger: backdate one with the trigger off (rolled back with the rest).
  alter table public.contact_request_notes disable trigger contact_request_notes_prepare;
  insert into public.contact_request_notes (request_id, body, created_at, updated_at)
  values (t_old, 'old note', now() - interval '4 years', now() - interval '4 years');
  alter table public.contact_request_notes enable trigger contact_request_notes_prepare;
  -- Its audit trail (status changes are audited); the text stands in for what a row may hold.
  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes, occurred_at)
  values (null, 'postgres', 'update', 'contact_requests', t_old::text,
          '{"status": {"old": "new", "new": "closed"}, "probe": "RETENTION-SECRET-TEXT"}'::jsonb, now() - interval '4 years');
  if exists (select 1 from public.contact_request_notes where request_id = t_old and updated_at > now() - interval '3 years') then
    raise exception 'FAIL fixture: a note cannot be backdated (trigger)';
  end if;

  insert into public.contact_requests (name, email, category, subject, message, created_at, updated_at, attachment_paths)
  values ('Note', 'note.test@example.invalid', 'order', 'Recent note', 'A test message long enough for the checks.',
          now() - interval '4 years', now() - interval '4 years', array['guest/retention-test-kept.jpg'])
  returning id into t_note;
  insert into public.contact_request_notes (request_id, body) values (t_note, 'recent note');

  insert into public.contact_requests (name, email, category, subject, message, created_at, updated_at)
  values ('Touched', 'touched.test@example.invalid', 'order', 'Recent change', 'A test message long enough for the checks.',
          now() - interval '4 years', now() - interval '1 year')
  returning id into t_touched;

  insert into public.contact_requests (name, email, category, subject, message, created_at, updated_at)
  values ('Recent', 'recent.test@example.invalid', 'order', 'Recent', 'A test message long enough for the checks.',
          now() - interval '2 years', now() - interval '2 years')
  returning id into t_recent;

  -- Uploads
  insert into storage.objects (bucket_id, name, created_at) values
    ('contact-attachments', 'guest/retention-test-orphan.jpg', now() - interval '2 days'),
    ('contact-attachments', 'guest/retention-test-fresh.jpg', now() - interval '1 hour'),
    ('contact-attachments', 'guest/retention-test-kept.jpg', now() - interval '4 years');

  -- Consents
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'terms', true, 'v1', 'registration', now() - interval '7 years') returning id into c_old_terms;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'terms', true, 'v2', 'account', now() - interval '6 years') returning id into c_new_terms;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'privacy', true, 'v1', 'registration', now() - interval '7 years') returning id into c_old_priv;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'privacy', true, 'v2', 'account', now() - interval '1 year');
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'cookies_analytics', false, 'v1', 'cookie_banner', now() - interval '7 years') returning id into c_cookie;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'studio_immediate_access', true, 'v1', 'checkout', now() - interval '6 years') returning id into c_sia_old;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'studio_immediate_access', true, 'v1', 'checkout', now() - interval '1 year') returning id into c_sia_new;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'course_immediate_access', true, 'v1', 'checkout', now() - interval '6 years') returning id into c_course;
  if (select created_at from public.consent_records where id = c_old_terms) > now() - interval '6 years' then
    raise exception 'FAIL fixture: a consent record cannot be backdated';
  end if;
  if v_nullable then
    insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
    values (null, 'terms', true, 'v1', 'registration', now() - interval '6 years') returning id into c_unlinked;
  end if;

  -- Newsletter
  insert into public.newsletter_subscriptions (email, status, source, confirm_expires_at)
  values ('retention-expired.test@example.invalid', 'pending', 'footer', now() - interval '40 days')
  returning id into n_expired;
  insert into public.newsletter_subscriptions (email, status, source, confirm_expires_at)
  values ('retention-fresh.test@example.invalid', 'pending', 'footer', now() - interval '10 days')
  returning id into n_fresh;
  insert into public.newsletter_subscriptions (email, status, source, confirmed_at, unsubscribed_at, created_at)
  values ('retention-optout.test@example.invalid', 'unsubscribed', 'footer', now() - interval '7 years',
          now() - interval '6 years', now() - interval '7 years')
  returning id into n_opt_out;

  -- Back in stock
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Retention product', 'retention-test-product', 10, 'EUR', 'active', 'physical') returning id into p_id;
  insert into public.back_in_stock_requests (product_id, email, actor_hash, notified_at, created_at)
  values (p_id, 'bis-a.test@example.invalid', repeat('a', 64), now() - interval '2 years', now() - interval '2 years') returning id into b_sent_old;
  insert into public.back_in_stock_requests (product_id, email, actor_hash, notified_at, created_at)
  values (p_id, 'bis-b.test@example.invalid', repeat('a', 64), now() - interval '6 months', now() - interval '2 years') returning id into b_sent_new;
  insert into public.back_in_stock_requests (product_id, email, actor_hash, created_at)
  values (p_id, 'bis-c.test@example.invalid', repeat('a', 64), now() - interval '4 years') returning id into b_open_old;
  insert into public.back_in_stock_requests (product_id, email, actor_hash, created_at)
  values (p_id, 'bis-d.test@example.invalid', repeat('a', 64), now() - interval '2 years') returning id into b_open_new;

  -- ---------------------------------------------------------------------------
  -- The purge
  -- ---------------------------------------------------------------------------
  r := private.purge_expired_personal_data();

  -- R2 tickets
  if exists (select 1 from public.contact_requests where id = t_old) then
    raise exception 'FAIL R2: the 4-year-old ticket was kept';
  end if;
  if exists (select 1 from public.contact_request_notes where request_id = t_old) then
    raise exception 'FAIL R2: its notes were kept';
  end if;
  if (select count(*) from public.contact_requests where id in (t_note, t_touched, t_recent)) <> 3 then
    raise exception 'FAIL R2: a ticket with a recent exchange was deleted';
  end if;
  if (select count(*) from private.storage_purge_queue
       where bucket_id = 'contact-attachments' and reason = 'contact_request_expired'
         and name in ('guest/retention-test-a.jpg', 'guest/retention-test-b.pdf')) <> 2 then
    raise exception 'FAIL R2: the attachments were not queued';
  end if;
  if exists (select 1 from public.audit_logs
              where table_name = 'contact_requests' and record_id = t_old::text
                and changes::text like '%RETENTION-SECRET-TEXT%') then
    raise exception 'FAIL R2: the audit trail kept the ticket text';
  end if;
  if not exists (select 1 from public.audit_logs
                  where table_name = 'contact_requests' and record_id = t_old::text
                    and changes = '{"reason": "retention_purge"}'::jsonb) then
    raise exception 'FAIL R2: the ticket''s audit trail was not redacted';
  end if;
  if (r ->> 'contact_requests')::int < 1 then raise exception 'FAIL R2: report %', r; end if;
  passed := passed || 'R2'::text;

  -- R3 uploads
  if not exists (select 1 from private.storage_purge_queue
                  where name = 'guest/retention-test-orphan.jpg' and reason = 'contact_attachment_orphan') then
    raise exception 'FAIL R3: the orphan upload was not queued';
  end if;
  if exists (select 1 from private.storage_purge_queue
              where name in ('guest/retention-test-fresh.jpg', 'guest/retention-test-kept.jpg')) then
    raise exception 'FAIL R3: a fresh or referenced file was queued';
  end if;
  passed := passed || 'R3'::text;

  -- R4 consents
  if exists (select 1 from public.consent_records where id in (c_old_terms, c_sia_old, c_course)) then
    raise exception 'FAIL R4: a proof replaced, or a purchase proof, over 5 years ago was kept';
  end if;
  if (select count(*) from public.consent_records where id in (c_new_terms, c_old_priv, c_cookie, c_sia_new)) <> 4 then
    raise exception 'FAIL R4: a proof in force, or replaced less than 5 years ago, was deleted';
  end if;
  if v_nullable and exists (select 1 from public.consent_records where id = c_unlinked) then
    raise exception 'FAIL R4: an unlinked proof over 5 years old was kept';
  end if;
  passed := passed || 'R4'::text;

  -- R5 newsletter
  if exists (select 1 from public.newsletter_subscriptions where id = n_expired) then
    raise exception 'FAIL R5: the expired sign-up was kept';
  end if;
  if (select count(*) from public.newsletter_subscriptions where id in (n_fresh, n_opt_out)) <> 2 then
    raise exception 'FAIL R5: a recent sign-up or the opt-out list was deleted';
  end if;
  if exists (select 1 from public.audit_logs
              where table_name = 'newsletter_subscriptions' and record_id = n_expired::text
                and changes::text like '%retention-expired.test%') then
    raise exception 'FAIL R5: the audit trail kept the address';
  end if;
  passed := passed || 'R5'::text;

  -- R6 back in stock
  if exists (select 1 from public.back_in_stock_requests where id in (b_sent_old, b_open_old)) then
    raise exception 'FAIL R6: an expired alert was kept';
  end if;
  if (select count(*) from public.back_in_stock_requests where id in (b_sent_new, b_open_new)) <> 2 then
    raise exception 'FAIL R6: a live alert was deleted';
  end if;
  passed := passed || 'R6'::text;

  -- R7 accounting untouched, summary, setting reset, idempotent
  if (select count(*) from public.orders) <> v_orders or (select count(*) from public.invoices) <> v_invoices then
    raise exception 'FAIL R7: orders or invoices changed';
  end if;
  if not exists (select 1 from public.audit_logs where table_name = 'retention_purge' and actor_role = 'retention_purge'
                    and (changes ->> 'contact_requests')::int >= 1) then
    raise exception 'FAIL R7: no summary audit row';
  end if;
  if coalesce(current_setting('gt.retention_purge', true), '') <> '' then
    raise exception 'FAIL R7: the purge setting leaked';
  end if;
  r := private.purge_expired_personal_data();
  if (r ->> 'contact_requests')::int + (r ->> 'consent_records')::int + (r ->> 'newsletter_pending')::int
     + (r ->> 'back_in_stock_requests')::int + (r ->> 'attachments_queued')::int <> 0 then
    raise exception 'FAIL R7: a second run purged again %', r;
  end if;
  begin
    perform private.purge_expired_personal_data(now() + interval '10 years');
    raise exception 'FAIL R7: a future date was accepted';
  exception when sqlstate '22023' then null;
  end;
  passed := passed || 'R7'::text;

  -- R8 the Storage sweep's bookkeeping, as the service role
  perform set_config('role', 'service_role', true);
  select array_agg(id) into v_ids from public.pending_storage_purges(1000) where name like 'guest/retention-test-%';
  if cardinality(v_ids) <> 3 then raise exception 'FAIL R8: % queued test files listed', cardinality(v_ids); end if;
  perform public.record_storage_purges(v_ids[1:2], v_ids[3:3], 'storage down');
  perform set_config('role', 'postgres', true);
  if (select count(*) from private.storage_purge_queue where id = any (v_ids)) <> 1
     or (select attempts from private.storage_purge_queue where id = v_ids[3]) <> 1
     or (select last_error from private.storage_purge_queue where id = v_ids[3]) <> 'storage down' then
    raise exception 'FAIL R8: done not dequeued, or the failure not counted';
  end if;
  passed := passed || 'R8'::text;

  -- R9 schedules
  select count(*) into v_cnt from cron.job
   where jobname in ('purge-expired-personal-data', 'purge-storage-objects') and active;
  if v_cnt <> 2 then raise exception 'FAIL R9: % purge jobs scheduled', v_cnt; end if;
  passed := passed || 'R9'::text;

  raise exception 'ALL RETENTION PURGE TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
