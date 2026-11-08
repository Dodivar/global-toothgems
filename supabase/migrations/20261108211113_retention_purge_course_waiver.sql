-- =============================================================================
-- Retention purge: course waivers are purchase proofs (decision 127)
-- =============================================================================
-- Migration 20261108210525_course_withdrawal_waiver added the consent purpose
-- `course_immediate_access` (the express waiver of the withdrawal right taken at
-- the shop checkout, decision 128). Like `studio_immediate_access`, it is the
-- proof of one paid contract, not a standing consent: the purge now deletes it
-- 5 years after it was given, whatever later records say, instead of keeping
-- the latest one per account forever. Same function otherwise.
-- =============================================================================

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
  -- force is kept. Per-purchase waivers (Studio, courses): 5 years after the purchase.
  delete from public.consent_records c
   where c.created_at < p_now - interval '5 years'
     and (c.user_id is null
          or c.purpose in ('studio_immediate_access', 'course_immediate_access')
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
