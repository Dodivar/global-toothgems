-- =============================================================================
-- Retention purge jobs (decision 127)
-- =============================================================================
-- The privacy policy (webapp/src/data/legal/privacy.ts, "Data retention
-- periods") announces retention periods (decisions 125 (a) and 126 (i)). This
-- migration makes the database keep them, every night:
--
--   contact_requests        deleted 3 years after the last exchange: the latest of
--                           the ticket's creation, last change (status, reply,
--                           resolution) and its staff notes; whatever the status.
--                           Notes go with the ticket (cascade); attachments are
--                           queued for the Storage sweep below.
--   contact-attachments     files no ticket references, older than 1 day
--                           (uploads whose form was never sent): queued too.
--   consent_records         a proof is deleted once it has been REPLACED by a later
--                           record of the same account and purpose for more than
--                           5 years; the latest record of an account and purpose
--                           (the consent or refusal in force) is always kept. A
--                           per-purchase proof (`studio_immediate_access`) and a
--                           proof no longer linked to an account (erased account,
--                           decision 125) are deleted 5 years after they were made.
--   newsletter_subscriptions a `pending` sign-up never confirmed is deleted 30 days
--                           after its confirmation link expired (no consent was
--                           ever given). unsubscribed / bounced / complained rows
--                           are the opt-out list and are kept.
--   back_in_stock_requests  deleted 1 year after the alert was sent; a request never
--                           answered (the product never came back) 3 years after it
--                           was made.
--   throttle ledgers        promotion_code_attempts, gift_card_code_attempts,
--                           promotion_email_lookups (> 1 day), private.rate_limit_hits
--                           (> 7 days): already pruned as they are used; the job
--                           only removes what an unused ledger left behind.
--
-- NEVER purged here: orders, order lines, payments, refunds, invoices and credit
-- notes, Studio billing (10 years of accounting retention, decision 125 (a)), and
-- every other table (see decision 127 for the ones still to decide).
--
-- The audit trail must not keep what is purged: during the purge,
-- private.audit_changes() records a deletion as {"reason": "retention_purge"}
-- (like an account erasure, decision 125) should a table it purges ever audit
-- deletions; the earlier audit rows of a purged ticket or sign-up (status,
-- priority, assignee or account changes) are redacted to that reason; and one
-- summary row per run says what was purged.
--
-- Storage cannot be emptied from SQL (storage.protect_delete): the paths go to
-- private.storage_purge_queue and the Edge Function `purge-storage-objects`
-- (pg_cron, daily, shared secret) removes the files through the Storage API,
-- then clears the queue (pending_storage_purges / record_storage_purges,
-- service role only). A file is never forgotten: its path stays queued until
-- the removal succeeded.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The audit trail records a purge's deletions without copying the rows
-- -----------------------------------------------------------------------------
-- Same body as migration 20261106190000 (account erasure) plus the purge case.
create or replace function private.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_watch   text[] := tg_argv;
  v_row     jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new)
    loop
      continue when v_key in ('updated_at', 'updated_by');
      continue when cardinality(v_watch) > 0 and not (v_key = any (v_watch));
      if v_old -> v_key is distinct from v_new -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'DELETE' then
    -- An account erasure (erase_account) or a retention purge deletes personal
    -- rows: the audit says why, it does not keep a copy of them.
    v_changes := case when current_setting('gt.account_erasure', true) = 'on'
                      then jsonb_build_object('reason', 'account_erasure')
                      when current_setting('gt.retention_purge', true) = 'on'
                      then jsonb_build_object('reason', 'retention_purge')
                      else to_jsonb(old) end;
  else
    v_changes := to_jsonb(new);
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', session_user::text),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'country_code', v_row ->> 'user_id',
             (v_row ->> 'role_key') || '/' || (v_row ->> 'permission_key'),
             (v_row ->> 'promotion_id') || '/' || coalesce(v_row ->> 'product_id', v_row ->> 'category_id',
                                                           v_row ->> 'collection_id', v_row ->> 'segment_id'),
             case when tg_table_name = 'languages' then v_row ->> 'code' end,
             v_row ->> 'locale',
             '?'),
    v_changes
  );
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Files waiting to be removed from Storage
-- -----------------------------------------------------------------------------
create table private.storage_purge_queue (
  id         bigint generated always as identity primary key,
  bucket_id  text not null check (bucket_id in ('contact-attachments')),
  name       text not null check (char_length(name) between 1 and 1024),
  reason     text not null check (reason in ('contact_request_expired', 'contact_attachment_orphan')),
  queued_at  timestamptz not null default now(),
  attempts   integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 500),
  unique (bucket_id, name)
);

alter table private.storage_purge_queue enable row level security;
revoke all on table private.storage_purge_queue from public, anon, authenticated;

comment on table private.storage_purge_queue is
  'Storage objects the retention purge removes (decision 127). Drained by the Edge Function purge-storage-objects.';

-- -----------------------------------------------------------------------------
-- 3. The purge
-- -----------------------------------------------------------------------------
create or replace function private.purge_expired_personal_data(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tickets      uuid[];
  v_signups      uuid[];
  v_files        integer := 0;
  v_orphans      integer := 0;
  v_consents     integer := 0;
  v_back_in_stock integer := 0;
  v_throttles    integer := 0;
  v_count        integer;
  v_report       jsonb;
begin
  if p_now is null or p_now > now() + interval '1 day' then
    raise exception 'purge_expired_personal_data: invalid date' using errcode = '22023';
  end if;

  perform set_config('gt.retention_purge', 'on', true);

  -- Customer-service requests: 3 years after the last exchange.
  select coalesce(array_agg(r.id), '{}') into v_tickets
    from public.contact_requests r
   where greatest(r.created_at, r.updated_at,
                  coalesce(r.first_response_at, r.created_at),
                  coalesce(r.resolved_at, r.created_at),
                  coalesce((select max(greatest(n.created_at, n.updated_at))
                              from public.contact_request_notes n
                             where n.request_id = r.id), r.created_at))
         < p_now - interval '3 years';

  if cardinality(v_tickets) > 0 then
    insert into private.storage_purge_queue (bucket_id, name, reason)
    select distinct 'contact-attachments', p, 'contact_request_expired'
      from public.contact_requests r, unnest(r.attachment_paths) p
     where r.id = any (v_tickets)
    on conflict (bucket_id, name) do nothing;
    get diagnostics v_files = row_count;

    delete from public.contact_requests r where r.id = any (v_tickets);

    update public.audit_logs a
       set changes = jsonb_build_object('reason', 'retention_purge')
     where a.table_name = 'contact_requests'
       and a.record_id = any (select t::text from unnest(v_tickets) t);
  end if;

  -- Attachments no ticket references (the form was never sent).
  insert into private.storage_purge_queue (bucket_id, name, reason)
  select o.bucket_id, o.name, 'contact_attachment_orphan'
    from storage.objects o
   where o.bucket_id = 'contact-attachments'
     and o.created_at < p_now - interval '1 day'
     and not exists (select 1 from public.contact_requests r where o.name = any (r.attachment_paths))
  on conflict (bucket_id, name) do nothing;
  get diagnostics v_orphans = row_count;

  -- Consent proofs: 5 years after the consent ended or was replaced; the one in
  -- force is kept.
  delete from public.consent_records c
   where c.created_at < p_now - interval '5 years'
     and (c.user_id is null
          or c.purpose = 'studio_immediate_access'
          or exists (select 1
                       from public.consent_records l
                      where l.user_id = c.user_id
                        and l.purpose = c.purpose
                        and (l.created_at, l.id) > (c.created_at, c.id)
                        and l.created_at < p_now - interval '5 years'));
  get diagnostics v_consents = row_count;

  -- Newsletter sign-ups never confirmed (never sent to Resend).
  with gone as (
    delete from public.newsletter_subscriptions n
     where n.status = 'pending'
       and n.contact_synced_at is null
       and coalesce(n.confirm_expires_at, n.created_at) < p_now - interval '30 days'
    returning n.id
  )
  select coalesce(array_agg(id), '{}') into v_signups from gone;

  if cardinality(v_signups) > 0 then
    update public.audit_logs a
       set changes = jsonb_build_object('reason', 'retention_purge')
     where a.table_name = 'newsletter_subscriptions'
       and a.record_id = any (select s::text from unnest(v_signups) s);
  end if;

  -- Back-in-stock alerts.
  delete from public.back_in_stock_requests b
   where (b.notified_at is not null and b.notified_at < p_now - interval '1 year')
      or (b.notified_at is null and b.created_at < p_now - interval '3 years');
  get diagnostics v_back_in_stock = row_count;

  -- Throttle ledgers left behind.
  delete from public.promotion_code_attempts where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;
  delete from public.gift_card_code_attempts where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;
  delete from public.promotion_email_lookups where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;
  delete from private.rate_limit_hits where created_at < p_now - interval '7 days';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;

  perform set_config('gt.retention_purge', '', true);

  v_report := jsonb_build_object(
    'contact_requests',       cardinality(v_tickets),
    'attachments_queued',     v_files,
    'orphan_files_queued',    v_orphans,
    'consent_records',        v_consents,
    'newsletter_pending',     cardinality(v_signups),
    'back_in_stock_requests', v_back_in_stock,
    'throttle_rows',          v_throttles);

  if cardinality(v_tickets) + v_files + v_orphans + v_consents + cardinality(v_signups) + v_back_in_stock > 0 then
    insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
    values (null, 'retention_purge', 'delete', 'retention_purge', p_now::date::text,
            jsonb_build_object('reason', 'retention_purge') || v_report);
  end if;

  return v_report;
end;
$$;

revoke all on function private.purge_expired_personal_data(timestamptz) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. The Storage sweep's two functions (service role only)
-- -----------------------------------------------------------------------------
create or replace function public.pending_storage_purges(p_limit integer default 100)
returns table (id bigint, bucket_id text, name text)
language sql
security definer
set search_path = ''
as $$
  select q.id, q.bucket_id, q.name
    from private.storage_purge_queue q
   order by q.attempts, q.queued_at, q.id
   limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

-- p_done: removed (or already gone) -> dequeued. p_failed: kept, attempt counted.
create or replace function public.record_storage_purges(p_done bigint[], p_failed bigint[] default '{}', p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.storage_purge_queue q where q.id = any (coalesce(p_done, '{}'));
  update private.storage_purge_queue q
     set attempts = q.attempts + 1,
         last_error = left(coalesce(p_error, 'unknown error'), 500)
   where q.id = any (coalesce(p_failed, '{}'));
end;
$$;

revoke all on function public.pending_storage_purges(integer) from public, anon, authenticated;
revoke all on function public.record_storage_purges(bigint[], bigint[], text) from public, anon, authenticated;
grant execute on function public.pending_storage_purges(integer) to service_role;
grant execute on function public.record_storage_purges(bigint[], bigint[], text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Schedules (daily, at night UTC)
-- -----------------------------------------------------------------------------
-- The internal-call helper learns the new function (same shared secret).
create or replace function private.call_email_function(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in ('deliver-gift-cards', 'send-pending-emails', 'sync-newsletter-contacts', 'purge-storage-objects') then
    raise exception 'call_email_function: unknown function %', p_name using errcode = '22023';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_internal_secret';
  if v_secret is null then
    return null;                              -- internal calls not set up yet: nothing to call
  end if;
  return net.http_post(
    url     := 'https://abvuyvryerpzlvibttxp.supabase.co/functions/v1/' || p_name,
    headers := jsonb_build_object('content-type', 'application/json', 'x-internal-secret', v_secret),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function private.call_email_function(text) from public, anon, authenticated;

select cron.schedule('purge-expired-personal-data', '15 2 * * *',
  $job$select private.purge_expired_personal_data()$job$);
select cron.schedule('purge-storage-objects', '45 2 * * *',
  $job$select private.call_email_function('purge-storage-objects')$job$);
