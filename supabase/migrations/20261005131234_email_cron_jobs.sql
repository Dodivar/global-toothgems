-- Scheduled e-mail jobs (decision 79): the two pg_cron jobs that call the e-mail
-- sweeps, kept in the repository so they are traced and changed by migration.
--
--   deliver-gift-cards   every 5 minutes  -> Edge Function deliver-gift-cards
--   send-pending-emails  every 5 minutes  -> Edge Function send-pending-emails
--
-- The shared secret is NOT in this file: private.call_email_function() reads it
-- at each run from the Supabase Vault (secret named `email_internal_secret`, same
-- value as the EMAIL_INTERNAL_SECRET function secret). While that secret does not
-- exist the jobs do nothing and fail nothing, so this migration is safe to apply
-- before the e-mail setup is finished.
--
-- To change a schedule: a new migration with
--   select cron.alter_job((select jobid from cron.job where jobname = '<name>'), schedule := '*/10 * * * *');
-- To pause / resume without a migration: cron.alter_job(<jobid>, active := false / true).
-- To see runs: select * from cron.job_run_details order by start_time desc limit 20;
-- and the HTTP answers: select * from net._http_response order by created desc limit 20;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.call_email_function(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in ('deliver-gift-cards', 'send-pending-emails') then
    raise exception 'call_email_function: unknown function %', p_name using errcode = '22023';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_internal_secret';
  if v_secret is null then
    return null;                              -- e-mail not set up yet: nothing to call
  end if;
  return net.http_post(
    url     := 'https://abvuyvryerpzlvibttxp.supabase.co/functions/v1/' || p_name,
    headers := jsonb_build_object('content-type', 'application/json', 'x-internal-secret', v_secret),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function private.call_email_function(text) from public, anon, authenticated;

-- Named jobs: re-running replaces them rather than adding a second one.
select cron.schedule('deliver-gift-cards', '*/5 * * * *', $job$select private.call_email_function('deliver-gift-cards')$job$);
select cron.schedule('send-pending-emails', '*/5 * * * *', $job$select private.call_email_function('send-pending-emails')$job$);
