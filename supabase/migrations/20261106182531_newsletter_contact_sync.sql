-- =============================================================================
-- Newsletter: mirror the confirmed subscribers into Resend contacts
-- =============================================================================
-- Campaigns are written and sent with Resend Broadcasts (owner's choice,
-- 2026-11-06). Resend only knows what we send it, so the database keeps a small
-- sync queue on newsletter_subscriptions and the Edge Function
-- `sync-newsletter-contacts` (pg_cron, every 5 minutes) applies it:
--
--   subscribed      -> a Resend contact (e-mail, members' first name) in the
--                      segments our code manages: all subscribers, the language,
--                      and one per marketing CRM tag of the member (VIP...)
--   anything else   -> the contact is deleted in Resend (it was there before)
--
-- The database stays the source of truth for consent: nothing here re-subscribes
-- anyone. Only the e-mail, the first name of a member and segment memberships
-- leave; no order, no address, no history.
--
--   contact_sync_due_at    set by triggers when what Resend should hold changes:
--                          status / locale / e-mail / account of the row, a CRM tag
--                          of the member added or removed, the member's first name;
--                          null = Resend is up to date
--   contact_synced_at      last successful sync
--   contact_sync_attempts  failures in a row (backoff 10 min x 2^n, capped)
--   contact_sync_error     last failure, short text for the team
--
-- pending_newsletter_contacts(limit) and record_newsletter_contact_sync(id, due, error)
-- are service role only. A change made while a sync is running moves the due time,
-- so the record keeps the row queued (compare-and-set on the due time read).
-- =============================================================================

alter table public.newsletter_subscriptions
  add column contact_sync_due_at   timestamptz,
  add column contact_synced_at     timestamptz,
  add column contact_sync_attempts integer not null default 0 check (contact_sync_attempts >= 0),
  add column contact_sync_error    text check (char_length(contact_sync_error) <= 500);

comment on column public.newsletter_subscriptions.contact_sync_due_at is
  'When the Resend contact must be (re)synced (Edge Function sync-newsletter-contacts); null = up to date.';

create index newsletter_subscriptions_contact_sync_due_idx
  on public.newsletter_subscriptions (contact_sync_due_at)
  where contact_sync_due_at is not null;

-- -----------------------------------------------------------------------------
-- 1. What queues a row
-- -----------------------------------------------------------------------------
-- A subscribed row always needs Resend in step; another status only when the
-- address was sent to Resend before (it must leave). Pending rows never go.
create or replace function private.newsletter_contact_sync_due()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'subscribed' then
      new.contact_sync_due_at := now();
    end if;
    return new;
  end if;
  if (new.status, new.locale, lower(new.email), new.user_id)
     is distinct from (old.status, old.locale, lower(old.email), old.user_id)
     and (new.status = 'subscribed' or old.contact_synced_at is not null or old.status = 'subscribed') then
    new.contact_sync_due_at := now();
    new.contact_sync_attempts := 0;
  end if;
  return new;
end;
$$;

create trigger newsletter_subscriptions_contact_sync_due
  before insert or update on public.newsletter_subscriptions
  for each row execute function private.newsletter_contact_sync_due();

-- A member's CRM tag decides a segment; their first name is on the contact.
create or replace function private.newsletter_contact_sync_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  -- One branch per table: PL/pgSQL resolves every `new.<column>` of an expression,
  -- and profiles has no user_id (see migration 20261102173016).
  if tg_table_name = 'profiles' then
    v_user := new.id;
  elsif tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;
  update public.newsletter_subscriptions
     set contact_sync_due_at = now(), contact_sync_attempts = 0
   where user_id = v_user and status = 'subscribed';
  return null;
end;
$$;

create trigger customer_tags_newsletter_contact_sync
  after insert or delete on public.customer_tags
  for each row execute function private.newsletter_contact_sync_member();

create trigger profiles_newsletter_contact_sync
  after update of first_name on public.profiles
  for each row
  when (old.first_name is distinct from new.first_name)
  execute function private.newsletter_contact_sync_member();

revoke all on function private.newsletter_contact_sync_due() from public;
revoke all on function private.newsletter_contact_sync_member() from public;

-- -----------------------------------------------------------------------------
-- 2. The sweep's two functions (service role only)
-- -----------------------------------------------------------------------------
create or replace function public.pending_newsletter_contacts(p_limit integer default 25)
returns table (
  id          uuid,
  email       text,
  subscribed  boolean,
  locale      text,
  first_name  text,
  tags        text[],
  due_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         lower(s.email),
         s.status = 'subscribed',
         s.locale,
         case when s.status = 'subscribed' then nullif(btrim(p.first_name), '') end,
         case when s.status = 'subscribed' and s.user_id is not null
              then coalesce((select array_agg(t.tag order by t.tag) from public.customer_tags t where t.user_id = s.user_id), '{}')
              else '{}' end,
         s.contact_sync_due_at
    from public.newsletter_subscriptions s
    left join public.profiles p on p.id = s.user_id
   where s.contact_sync_due_at <= now()
   order by s.contact_sync_due_at, s.id
   limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

create or replace function public.record_newsletter_contact_sync(
  p_id     uuid,
  p_due_at timestamptz,
  p_error  text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  if nullif(btrim(p_error), '') is null then
    update public.newsletter_subscriptions
       set contact_synced_at = now(),
           contact_sync_attempts = 0,
           contact_sync_error = null,
           contact_sync_due_at = case when contact_sync_due_at = p_due_at then null else contact_sync_due_at end
     where id = p_id;
  else
    update public.newsletter_subscriptions
       set contact_sync_attempts = contact_sync_attempts + 1,
           contact_sync_error = left(btrim(p_error), 500),
           contact_sync_due_at = case when contact_sync_due_at = p_due_at
                                      then now() + interval '10 minutes' * power(2, least(contact_sync_attempts, 6))
                                      else contact_sync_due_at end
     where id = p_id;
  end if;
  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

revoke all on function public.pending_newsletter_contacts(integer) from public, anon, authenticated;
grant execute on function public.pending_newsletter_contacts(integer) to service_role;
revoke all on function public.record_newsletter_contact_sync(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_newsletter_contact_sync(uuid, timestamptz, text) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Everyone already subscribed goes to Resend once
-- -----------------------------------------------------------------------------
update public.newsletter_subscriptions
   set contact_sync_due_at = now()
 where status = 'subscribed';

-- -----------------------------------------------------------------------------
-- 4. The scheduled sweep (same mechanism as the e-mail jobs, migration email_cron_jobs)
-- -----------------------------------------------------------------------------
create or replace function private.call_email_function(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_name not in ('deliver-gift-cards', 'send-pending-emails', 'sync-newsletter-contacts') then
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

select cron.schedule('sync-newsletter-contacts', '*/5 * * * *', $job$select private.call_email_function('sync-newsletter-contacts')$job$);
