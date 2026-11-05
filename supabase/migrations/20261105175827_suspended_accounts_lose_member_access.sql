-- =============================================================================
-- A suspended or deactivated customer loses what they hold, in the database.
--
-- Audit (2026-11-05): only staff (`is_staff`, `has_permission`) and the Members'
-- Lounge tested `profiles.status = 'active'`. For a customer, a suspension was
-- applied by the browser alone (`auth.tsx` drops the session after sign-in): a
-- suspended member calling the API directly with their own token kept
--   * their Academy courses (`holds_course`, `lock_learner_course`,
--     `learner_courses`, the private media of those courses),
--   * their 3D Studio access: running trial and paid subscription
--     (`has_studio_access`, `studio_user_has_access`, `studio_user_tier`,
--     `studio_subscription_active`), so creations, Glowbook, templates...
--   * the ability to open a new Studio trial.
-- Route guards and the browser are navigation; the database is the authority
-- (AGENTS.md section 7). One helper, `private.account_active(user)`, is now
-- part of every one of those checks. Rows, subscriptions and entitlements are
-- untouched: reactivating the account gives everything back at once.
-- A suspended member still reads their own orders, invoices and withdrawal
-- (legal rights); billing code reads the subscription rows directly.
-- =============================================================================

create or replace function private.account_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and exists (select 1 from public.profiles p where p.id = p_user and p.status = 'active');
$$;

-- Academy ---------------------------------------------------------------------

create or replace function private.holds_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_active((select auth.uid()))
     and exists (
    select 1
      from public.course_entitlements e
     where e.user_id = (select auth.uid())
       and e.course_id = p_course_id
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.expires_at is null or e.expires_at > now()));
$$;

create or replace function private.lock_learner_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'learning: sign in' using errcode = '42501';
  end if;
  if not private.account_active(auth.uid()) then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  perform 1
     from public.course_entitlements e
    where e.user_id = auth.uid()
      and e.course_id = p_course_id
      and e.revoked_at is null
      and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now())
      for update;
  if not found then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  select c.status into v_status from public.courses c where c.id = p_course_id;
  if v_status is distinct from 'published' then
    raise exception 'learning: unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.learner_courses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'learning: sign in' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(
             private.learner_course_json(e.course_id)
             || jsonb_build_object(
                  'entitlement', jsonb_build_object('source', e.source, 'starts_at', e.starts_at,
                                                    'expires_at', e.expires_at),
                  'progress', private.learner_progress_json(v_uid, e.course_id))
             order by e.starts_at desc)
      from public.course_entitlements e
      join public.courses c on c.id = e.course_id
     where e.user_id = v_uid
       and private.account_active(v_uid)
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.expires_at is null or e.expires_at > now())
       and c.status in ('published', 'unpublished')), '[]'::jsonb);
end;
$$;

-- 3D Studio ---------------------------------------------------------------------

create or replace function private.studio_subscription_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_active(p_user)
     and exists (
    select 1 from public.studio_subscriptions s
     where s.user_id = p_user
       and s.status in ('active', 'trialing', 'past_due')
       and s.current_period_end > now()
  );
$$;

create or replace function private.has_studio_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (
       (private.account_active((select auth.uid()))
         and exists (select 1 from public.studio_trials t
                      where t.user_id = (select auth.uid()) and now() < t.trial_expires_at))
       or private.studio_subscription_active((select auth.uid()))
       or private.is_staff()
     );
$$;

create or replace function private.studio_user_has_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and (
       (private.account_active(p_user)
         and exists (select 1 from public.studio_trials t
                      where t.user_id = p_user and now() < t.trial_expires_at))
       or private.studio_subscription_active(p_user)
       or exists (select 1 from public.profiles p
                    join public.roles r on r.key = p.role and r.is_staff
                   where p.id = p_user and p.status = 'active')
     );
$$;

create or replace function private.studio_user_tier(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with tiers(tier, rank) as (
    select s.plan, case s.plan when 'atelier' then 3 when 'artist' then 2 else 1 end
      from public.studio_subscriptions s
     where s.user_id = p_user
       and private.account_active(p_user)
       and s.status in ('active', 'trialing', 'past_due')
       and s.current_period_end > now()
    union all
    select 'essential', 1
      from public.studio_trials t
     where t.user_id = p_user and private.account_active(p_user) and now() < t.trial_expires_at
    union all
    select 'atelier', 3
      from public.profiles p
      join public.roles r on r.key = p.role and r.is_staff
     where p.id = p_user and p.status = 'active'
  )
  select tier from tiers where p_user is not null order by rank desc limit 1;
$$;

-- The state the editor reads: a suspended member's running trial no longer reads as active.
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
  v_tier  text := private.studio_user_tier(p_user);
begin
  select * into v_trial from public.studio_trials t where t.user_id = p_user;
  select * into v_sub from public.studio_subscriptions s
   where s.user_id = p_user
     and s.status <> 'incomplete_expired'
   order by (s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()) desc,
            s.current_period_end desc
   limit 1;

  v_state := case
    when private.studio_subscription_active(p_user) then 'subscribed'
    when private.is_staff() then 'staff'
    when v_trial.user_id is not null and now() < v_trial.trial_expires_at
         and private.account_active(p_user) then 'trial_active'
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
    'subscription_period_end', v_sub.current_period_end,
    'subscription_interval', v_sub.billing_interval,
    'subscription_cancel_at_period_end', v_sub.cancel_at_period_end,
    'tier', v_tier,
    'glowbook', coalesce(v_tier = 'atelier', false),
    'limits', jsonb_build_object(
      'creations', private.studio_plan_limit(v_tier, 'creations'),
      'gem_groups', private.studio_plan_limit(v_tier, 'gem_groups')),
    'usage', jsonb_build_object(
      'creations', (select count(*) from public.creations c where c.user_id = p_user),
      'gem_groups', (select count(*) from public.gem_groups g where g.user_id = p_user))
  );
end;
$$;

-- A suspended member cannot open a Studio trial either.
create or replace function public.start_studio_trial()
returns jsonb
language plpgsql
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
  if not private.account_active(v_user) then
    raise exception 'start_studio_trial: account not active' using errcode = '42501';
  end if;

  if not private.studio_subscription_active(v_user)
     and not private.is_staff()
     and not exists (select 1 from public.studio_subscriptions s
                      where s.user_id = v_user and s.status not in ('incomplete', 'incomplete_expired')) then
    insert into public.studio_trials (user_id) values (v_user)
    on conflict (user_id) do nothing;
    v_started := found;
  end if;

  return private.studio_access_json(v_user) || jsonb_build_object('started', v_started);
end;
$$;
