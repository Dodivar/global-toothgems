-- =============================================================================
-- Cron → Edge Function calls wait 60 s for the answer instead of 5 s.
--
-- private.call_email_function() is how pg_cron reaches the sweeps
-- (send-pending-emails, deliver-gift-cards, sync-newsletter-contacts,
-- purge-storage-objects). net.http_post() gave up after its default
-- 5 000 ms: on 2026-11-12, 5 calls were logged as timed out in
-- net._http_response while the sweep was still drawing PDFs and sending
-- through Resend. A run that outlasts the wait is logged as a failure, so the
-- log could not tell a slow run from a broken one.
--
-- 60 s stays well under the Edge Functions request idle timeout (150 s) and
-- the 5-minute schedule, so two runs of a job still never overlap on our side
-- (each e-mail is claimed in email_log anyway). Nothing else changes: same
-- functions, same secret, same schedule. Billing is per invocation, not per
-- second waited, and pg_net handles requests asynchronously, so the longer
-- wait costs nothing and blocks nothing.
-- =============================================================================

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
    url                  := 'https://abvuyvryerpzlvibttxp.supabase.co/functions/v1/' || p_name,
    headers              := jsonb_build_object('content-type', 'application/json', 'x-internal-secret', v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.call_email_function(text) from public, anon, authenticated;
