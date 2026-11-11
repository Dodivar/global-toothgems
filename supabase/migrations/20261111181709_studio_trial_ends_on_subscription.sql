-- =============================================================================
-- Studio: a paid subscription ends the free trial
--
-- A member in the 48-hour trial can subscribe at once (the plans are offered on
-- /compte/studio). The paid access already outranks the trial; this migration
-- also *cancels* what is left of the trial, so that a subscription that later
-- ends does not hand the remaining hours back.
--
-- The trial row keeps being the single record of the trial (never reset, never
-- extended): its end may now be earlier than start + 48 h, never later.
-- =============================================================================

alter table public.studio_trials drop constraint studio_trials_48_hours;
alter table public.studio_trials
  add constraint studio_trials_at_most_48_hours
  check (trial_expires_at >= trial_started_at and trial_expires_at <= trial_started_at + interval '48 hours');

create or replace function private.studio_end_trial_on_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('active', 'trialing') then
    update public.studio_trials t
       set trial_expires_at = greatest(now(), t.trial_started_at)
     where t.user_id = new.user_id
       and t.trial_expires_at > now();
  end if;
  return new;
end;
$$;

revoke all on function private.studio_end_trial_on_subscription() from public, anon, authenticated;

create trigger studio_subscriptions_end_trial
  after insert or update of status on public.studio_subscriptions
  for each row execute function private.studio_end_trial_on_subscription();
