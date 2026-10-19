-- =============================================================================
-- 3D Studio subscriptions: selling them through Stripe (decision 94)
-- =============================================================================
-- Migration 20261017103101_studio_trial_access created `studio_subscriptions`
-- and the access decision, but nothing wrote it. This migration adds what the
-- Edge Functions `create-studio-subscription`, `studio-billing-portal` and the
-- subscription branch of `stripe-webhook` need:
--
--   * stripe_customers: the Stripe customer of an account, created once and
--     reused (Checkout, the customer portal). Service role only.
--   * studio_plan_prices: which Stripe Price sells which plan and interval.
--     The browser names a plan and an interval, never a price id or an amount;
--     the webhook maps the subscription's price back to its plan (a plan change
--     made in the customer portal changes the price, not any metadata).
--     Readable by everyone (the plans are public), written by the service role.
--     Rows are per environment (test and live Prices differ): set by the
--     `studio-billing-setup` step, never by a migration.
--   * studio_subscriptions: billing interval and price of the current item.
--   * studio_subscription_invoices: every subscription invoice Stripe reports
--     paid or failed, with its billing reason — tells a new subscription
--     (`subscription_create`) from a renewal (`subscription_cycle`) for the
--     figures, and gives the revenue. Readable by the owner and statistics staff.
--   * apply_studio_subscription() / record_studio_invoice(): the webhook's only
--     writers, service role only, idempotent (upserts on the Stripe ids).
--   * A first payment that never completed (`incomplete`, `incomplete_expired`)
--     no longer counts as a former subscription: it neither forfeits the free
--     trial nor reads as `subscription_ended`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stripe customers
-- -----------------------------------------------------------------------------
create table public.stripe_customers (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id  text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,250}$'),
  livemode            boolean not null default false,
  created_at          timestamptz not null default now()
);

comment on table public.stripe_customers is
  'The Stripe customer of an account (Studio subscriptions, customer portal), created once by create-studio-subscription and reused. Service role only.';

alter table public.stripe_customers enable row level security;
revoke all on public.stripe_customers from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Which Stripe Price sells which plan
-- -----------------------------------------------------------------------------
create table public.studio_plan_prices (
  id                uuid primary key default gen_random_uuid(),
  plan              text not null check (plan in ('essential', 'artist', 'atelier')),
  billing_interval  text not null check (billing_interval in ('month', 'year')),
  -- What Stripe charges, VAT included (copied from the Stripe Price, display and figures).
  amount            numeric(12,2) not null check (amount > 0),
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  stripe_price_id   text not null unique check (stripe_price_id ~ '^price_[A-Za-z0-9]{6,250}$'),
  livemode          boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.studio_plan_prices is
  'Stripe Prices of the 3D Studio plans, one active per plan and interval. Set per environment by the studio-billing-setup step (service role); read by everyone.';

create unique index studio_plan_prices_one_active on public.studio_plan_prices (plan, billing_interval) where active;
alter table public.studio_plan_prices enable row level security;

create trigger studio_plan_prices_touch_updated_at
  before update on public.studio_plan_prices
  for each row execute function private.studio_touch_updated_at();

revoke all on public.studio_plan_prices from anon, authenticated;
grant select on public.studio_plan_prices to anon, authenticated;
create policy "studio_plan_prices: everyone reads the active prices"
  on public.studio_plan_prices for select to anon, authenticated
  using (active);

create trigger studio_plan_prices_audit
  after insert or update or delete on public.studio_plan_prices
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 3. Subscriptions: interval and price of the current item
-- -----------------------------------------------------------------------------
alter table public.studio_subscriptions
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column stripe_price_id  text,
  add column canceled_at      timestamptz;

comment on table public.studio_subscriptions is
  '3D Studio subscriptions, mirrored from verified Stripe webhooks by apply_studio_subscription() (service role). Grants access while status is active/trialing/past_due and current_period_end is in the future.';

-- -----------------------------------------------------------------------------
-- 4. Subscription invoices (new subscription vs renewal, revenue)
-- -----------------------------------------------------------------------------
create table public.studio_subscription_invoices (
  stripe_invoice_id  text primary key check (stripe_invoice_id ~ '^in_[A-Za-z0-9]{6,250}$'),
  subscription_id    uuid not null references public.studio_subscriptions (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  -- Stripe's billing_reason: subscription_create (first payment), subscription_cycle (renewal),
  -- subscription_update (plan change), manual, ...
  billing_reason     text not null check (billing_reason ~ '^[a-z_]{1,40}$'),
  status             text not null check (status in ('paid', 'payment_failed')),
  amount             numeric(12,2) not null check (amount >= 0),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at        timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.studio_subscription_invoices is
  'Paid and failed 3D Studio subscription invoices, from verified Stripe webhooks (record_studio_invoice). Stripe holds the invoice document itself.';

create index studio_subscription_invoices_subscription_idx on public.studio_subscription_invoices (subscription_id, occurred_at desc);
create index studio_subscription_invoices_user_idx on public.studio_subscription_invoices (user_id);
alter table public.studio_subscription_invoices enable row level security;

create trigger studio_subscription_invoices_touch_updated_at
  before update on public.studio_subscription_invoices
  for each row execute function private.studio_touch_updated_at();

revoke all on public.studio_subscription_invoices from anon, authenticated;
grant select on public.studio_subscription_invoices to authenticated;
create policy "studio_subscription_invoices: owners and statistics staff read"
  on public.studio_subscription_invoices for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('view_statistics')));

-- -----------------------------------------------------------------------------
-- 5. The webhook's writers (service role only)
-- -----------------------------------------------------------------------------
-- Mirrors one Stripe subscription as Stripe reports it now (the webhook reads
-- it back from Stripe on every event, so the order of deliveries does not
-- matter). The account is the one the Stripe customer belongs to, else the
-- `user_id` the Checkout put in the subscription's metadata; a subscription
-- never moves to another account. The plan comes from the price.
create or replace function public.apply_studio_subscription(
  p_stripe_subscription_id text,
  p_stripe_customer_id     text,
  p_metadata_user_id       uuid,
  p_stripe_price_id        text,
  p_status                 text,
  p_current_period_end     timestamptz,
  p_cancel_at_period_end   boolean,
  p_canceled_at            timestamptz,
  p_livemode               boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user     uuid;
  v_price    public.studio_plan_prices;
  v_existing public.studio_subscriptions;
  v_row      public.studio_subscriptions;
begin
  if p_stripe_subscription_id is null or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]{6,250}$' then
    raise exception 'apply_studio_subscription: invalid subscription id' using errcode = '22023';
  end if;
  if p_stripe_customer_id is null or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]{6,250}$' then
    raise exception 'apply_studio_subscription: invalid customer id' using errcode = '22023';
  end if;
  if p_current_period_end is null then
    raise exception 'apply_studio_subscription: period end required' using errcode = '22023';
  end if;

  select c.user_id into v_user from public.stripe_customers c where c.stripe_customer_id = p_stripe_customer_id;
  if v_user is null then
    select p.id into v_user from public.profiles p where p.id = p_metadata_user_id;
    if v_user is null then
      raise exception 'apply_studio_subscription: unknown account' using errcode = 'P0002';
    end if;
    insert into public.stripe_customers (user_id, stripe_customer_id, livemode)
    values (v_user, p_stripe_customer_id, coalesce(p_livemode, false))
    on conflict do nothing;
  end if;

  select * into v_price from public.studio_plan_prices pp where pp.stripe_price_id = p_stripe_price_id;
  if v_price.id is null then
    raise exception 'apply_studio_subscription: price is not a Studio plan' using errcode = '22023';
  end if;

  select * into v_existing from public.studio_subscriptions s where s.stripe_subscription_id = p_stripe_subscription_id;
  if v_existing.id is not null and v_existing.user_id <> v_user then
    raise exception 'apply_studio_subscription: subscription belongs to another account' using errcode = '42501';
  end if;

  insert into public.studio_subscriptions as s
    (user_id, plan, billing_interval, stripe_price_id, status, stripe_subscription_id, stripe_customer_id,
     current_period_end, cancel_at_period_end, canceled_at)
  values
    (v_user, v_price.plan, v_price.billing_interval, v_price.stripe_price_id, p_status, p_stripe_subscription_id,
     p_stripe_customer_id, p_current_period_end, coalesce(p_cancel_at_period_end, false), p_canceled_at)
  on conflict (stripe_subscription_id) do update
     set plan                 = excluded.plan,
         billing_interval     = excluded.billing_interval,
         stripe_price_id      = excluded.stripe_price_id,
         status               = excluded.status,
         stripe_customer_id   = excluded.stripe_customer_id,
         current_period_end   = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         canceled_at          = excluded.canceled_at
  returning * into v_row;

  return jsonb_build_object(
    'subscription_id', v_row.id,
    'user_id', v_row.user_id,
    'plan', v_row.plan,
    'status', v_row.status,
    'created', v_existing.id is null,
    -- Another live subscription on the same account (a double checkout): reported, not cancelled.
    'other_live_subscriptions', (
      select count(*) from public.studio_subscriptions o
       where o.user_id = v_row.user_id and o.id <> v_row.id
         and o.status in ('active', 'trialing', 'past_due') and o.current_period_end > now()
    )
  );
end;
$$;

comment on function public.apply_studio_subscription(text, text, uuid, text, text, timestamptz, boolean, timestamptz, boolean) is
  'stripe-webhook: mirrors a Stripe subscription (as read back from Stripe) into studio_subscriptions. Idempotent. Service role only.';

-- Records a subscription invoice once (a replay or a later status overwrites
-- the same row). The subscription must already be mirrored.
create or replace function public.record_studio_invoice(
  p_stripe_invoice_id      text,
  p_stripe_subscription_id text,
  p_billing_reason         text,
  p_status                 text,
  p_amount                 numeric,
  p_currency               text,
  p_occurred_at            timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.studio_subscriptions;
begin
  select * into v_sub from public.studio_subscriptions s where s.stripe_subscription_id = p_stripe_subscription_id;
  if v_sub.id is null then
    raise exception 'record_studio_invoice: unknown subscription' using errcode = 'P0002';
  end if;

  insert into public.studio_subscription_invoices as i
    (stripe_invoice_id, subscription_id, user_id, billing_reason, status, amount, currency, occurred_at)
  values
    (p_stripe_invoice_id, v_sub.id, v_sub.user_id, coalesce(p_billing_reason, 'manual'), p_status, p_amount,
     upper(p_currency), coalesce(p_occurred_at, now()))
  on conflict (stripe_invoice_id) do update
     -- A failed attempt later paid becomes paid; a paid invoice never goes back to failed.
     set status      = case when i.status = 'paid' then 'paid' else excluded.status end,
         amount      = excluded.amount,
         occurred_at = case when i.status = 'paid' then i.occurred_at else excluded.occurred_at end;
end;
$$;

comment on function public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz) is
  'stripe-webhook: records a paid or failed 3D Studio subscription invoice with its billing reason. Idempotent. Service role only.';

revoke all on function public.apply_studio_subscription(text, text, uuid, text, text, timestamptz, boolean, timestamptz, boolean),
                       public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_studio_subscription(text, text, uuid, text, text, timestamptz, boolean, timestamptz, boolean),
                          public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz)
  to service_role;

-- -----------------------------------------------------------------------------
-- 6. A first payment that never completed is not a former subscription
-- -----------------------------------------------------------------------------
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
     and s.status <> 'incomplete_expired'
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
    'subscription_period_end', v_sub.current_period_end,
    'subscription_interval', v_sub.billing_interval,
    'subscription_cancel_at_period_end', v_sub.cancel_at_period_end
  );
end;
$$;

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
     and not exists (select 1 from public.studio_subscriptions s
                      where s.user_id = v_user and s.status not in ('incomplete', 'incomplete_expired')) then
    insert into public.studio_trials (user_id) values (v_user)
    on conflict (user_id) do nothing;
    v_started := found;
  end if;

  return private.studio_access_json(v_user) || jsonb_build_object('started', v_started);
end;
$$;
