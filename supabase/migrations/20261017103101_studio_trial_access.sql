-- =============================================================================
-- 3D Studio access: the 48-hour free trial and the subscription entitlement
-- =============================================================================
-- Until now the Studio was in "preview": anyone could open the editor and any
-- member could save designs. From this migration on, using the Studio (saving
-- a design or a Gem Group, uploading its thumbnail) needs Studio access:
--
--   * an active free trial: 48 hours of continuous time from the moment the
--     member explicitly starts it (`start_studio_trial()`), once per account,
--     never restarted;
--   * or an active Studio subscription (`studio_subscriptions`, written only by
--     the service role: the Stripe subscription webhook that will fill it is
--     not built yet — no subscription can be bought today);
--   * or being active staff (support and testing; decision to confirm).
--
-- Reading and deleting one's own designs stays open whatever the access: the
-- work made during the trial is kept, never locked away or deleted.
--
-- The clock is the database's (`now()`): the browser's clock, storage or state
-- cannot extend a trial. Status is derived from the timestamps, never stored.
-- Decision 93 in supabase/README.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trials: one row per account, ever
-- -----------------------------------------------------------------------------
create table public.studio_trials (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  trial_started_at   timestamptz not null default now(),
  trial_expires_at   timestamptz not null default now() + interval '48 hours',
  -- First design saved after the trial started (set by the database), for the
  -- activation figures of the back office. Nothing else about the work is kept here.
  first_creation_at  timestamptz,
  created_at         timestamptz not null default now(),
  constraint studio_trials_48_hours check (trial_expires_at = trial_started_at + interval '48 hours'),
  constraint studio_trials_first_creation_after_start check (first_creation_at is null or first_creation_at >= trial_started_at)
);

comment on table public.studio_trials is
  '3D Studio free trial: one row per account, created once by start_studio_trial(), never reset. Active while now() < trial_expires_at.';

create index studio_trials_started_idx on public.studio_trials (trial_started_at desc);
alter table public.studio_trials enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Subscriptions: the paid entitlement, written by the service role only
-- -----------------------------------------------------------------------------
create table public.studio_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  plan                     text not null check (plan in ('essential', 'artist', 'atelier')),
  -- Stripe's subscription statuses, copied from verified webhook events.
  status                   text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active',
                                                           'past_due', 'canceled', 'unpaid', 'paused')),
  stripe_subscription_id   text not null unique,
  stripe_customer_id       text,
  current_period_end       timestamptz not null,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.studio_subscriptions is
  '3D Studio subscriptions, mirrored from verified Stripe webhooks by the service role. Grants access while status is active/trialing/past_due and current_period_end is in the future. No writer exists yet.';

create index studio_subscriptions_user_idx on public.studio_subscriptions (user_id, current_period_end desc);
alter table public.studio_subscriptions enable row level security;

create trigger studio_subscriptions_touch_updated_at
  before update on public.studio_subscriptions
  for each row execute function private.studio_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. The single access decision
-- -----------------------------------------------------------------------------
create or replace function private.studio_subscription_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.studio_subscriptions s
     where s.user_id = p_user
       and s.status in ('active', 'trialing', 'past_due')
       and s.current_period_end > now()
  );
$$;

-- True when the caller may use the Studio now: active trial, active
-- subscription or active staff. Used by the write policies below.
create or replace function private.has_studio_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (
       exists (select 1 from public.studio_trials t
                where t.user_id = (select auth.uid()) and now() < t.trial_expires_at)
       or private.studio_subscription_active((select auth.uid()))
       or private.is_staff()
     );
$$;

-- The caller's Studio access, as the browser shows it. `server_now` lets the
-- page count down on the database's clock instead of the device's.
--   not_started          no trial yet, may start one
--   trial_active         trial running
--   trial_expired        trial over, no subscription
--   subscribed           active subscription
--   subscription_pending a subscription is being set up (incomplete)
--   subscription_ended   no trial, a former subscription, nothing active (not eligible for a trial)
--   staff                active staff
create or replace function private.studio_access_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trial public.studio_trials;
  v_sub   public.studio_subscriptions;
  v_state text;
begin
  select * into v_trial from public.studio_trials t where t.user_id = p_user;
  select * into v_sub from public.studio_subscriptions s
   where s.user_id = p_user
   order by (s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()) desc,
            s.current_period_end desc
   limit 1;

  v_state := case
    when private.studio_subscription_active(p_user) then 'subscribed'
    when private.is_staff() then 'staff'
    when v_trial.user_id is not null and now() < v_trial.trial_expires_at then 'trial_active'
    when v_sub.id is not null and v_sub.status = 'incomplete' then 'subscription_pending'
    when v_trial.user_id is not null then 'trial_expired'
    when v_sub.id is not null then 'subscription_ended'
    else 'not_started'
  end;

  return jsonb_build_object(
    'state', v_state,
    'server_now', now(),
    'trial_started_at', v_trial.trial_started_at,
    'trial_expires_at', v_trial.trial_expires_at,
    'first_creation_at', v_trial.first_creation_at,
    'subscription_plan', v_sub.plan,
    'subscription_status', v_sub.status,
    'subscription_period_end', v_sub.current_period_end
  );
end;
$$;

create or replace function public.studio_access_state()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'studio_access_state: sign-in required' using errcode = '42501';
  end if;
  return private.studio_access_json((select auth.uid()));
end;
$$;

-- Starts the caller's trial, once. Concurrent or repeated calls are answered
-- with the same trial (the primary key decides); `started` is true only for
-- the call that created it. A subscriber, staff, or a former subscriber is not
-- given a trial.
create or replace function public.start_studio_trial()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_started boolean := false;
begin
  if v_user is null then
    raise exception 'start_studio_trial: sign-in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'start_studio_trial: no profile' using errcode = '42501';
  end if;

  if not private.studio_subscription_active(v_user)
     and not private.is_staff()
     and not exists (select 1 from public.studio_subscriptions s where s.user_id = v_user) then
    insert into public.studio_trials (user_id) values (v_user)
    on conflict (user_id) do nothing;
    v_started := found;
  end if;

  return private.studio_access_json(v_user) || jsonb_build_object('started', v_started);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. First saved design of a trial (activation figure)
-- -----------------------------------------------------------------------------
create or replace function private.studio_trial_first_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.studio_trials t
     set first_creation_at = new.created_at
   where t.user_id = new.user_id
     and t.first_creation_at is null
     and new.created_at >= t.trial_started_at;
  return new;
end;
$$;

create trigger creations_studio_trial_first_creation
  after insert on public.creations
  for each row execute function private.studio_trial_first_creation();

-- -----------------------------------------------------------------------------
-- 5. Privileges and policies
-- -----------------------------------------------------------------------------
revoke all on function private.studio_subscription_active(uuid), private.has_studio_access(),
                       private.studio_access_json(uuid), private.studio_trial_first_creation() from public;
-- Policies evaluated by members reference the helper.
grant execute on function private.has_studio_access() to authenticated, service_role;
grant execute on function private.studio_subscription_active(uuid), private.studio_access_json(uuid) to authenticated, service_role;

revoke all on function public.studio_access_state(), public.start_studio_trial() from public, anon;
grant execute on function public.studio_access_state(), public.start_studio_trial() to authenticated, service_role;

-- Members read their own row; staff with `view_statistics` read all rows for
-- the back-office figures. Nobody writes through the API.
revoke all on public.studio_trials, public.studio_subscriptions from anon, authenticated;
grant select on public.studio_trials, public.studio_subscriptions to authenticated;

create policy "studio_trials: owners and statistics staff read"
  on public.studio_trials for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('view_statistics')));
create policy "studio_subscriptions: owners and statistics staff read"
  on public.studio_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('view_statistics')));

-- Writing designs needs Studio access; reading and deleting them does not.
drop policy "creations: owners insert" on public.creations;
drop policy "creations: owners update" on public.creations;
create policy "creations: owners with Studio access insert"
  on public.creations for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_studio_access()));
create policy "creations: owners with Studio access update"
  on public.creations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.has_studio_access()));

drop policy "gem_groups: owners insert" on public.gem_groups;
drop policy "gem_groups: owners update" on public.gem_groups;
create policy "gem_groups: owners with Studio access insert"
  on public.gem_groups for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_studio_access()));
create policy "gem_groups: owners with Studio access update"
  on public.gem_groups for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.has_studio_access()));

drop policy "studio-thumbnails: owners upload into own folder" on storage.objects;
drop policy "studio-thumbnails: owners replace own files" on storage.objects;
create policy "studio-thumbnails: owners with Studio access upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-thumbnails'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.has_studio_access()));
create policy "studio-thumbnails: owners with Studio access replace own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'studio-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'studio-thumbnails'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.has_studio_access()));

-- Sensitive: who holds paid access and who used their trial. Audited.
create trigger studio_trials_audit
  after insert or delete on public.studio_trials
  for each row execute function private.audit_changes();
create trigger studio_subscriptions_audit
  after insert or update or delete on public.studio_subscriptions
  for each row execute function private.audit_changes();
