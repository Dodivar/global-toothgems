-- =============================================================================
-- 3D Studio: withdrawal within 14 days, refunded automatically (decision 95)
--
-- The member asked for immediate access before paying (decision 94 (a),
-- L221-25), so a withdrawal costs the share of the period already used. From
-- /compte/studio the member withdraws in one step; the database decides whether
-- they may and how much comes back, `studio-withdraw` (Edge Function) cancels the
-- Stripe subscription at once and refunds the rest, and the verified
-- `refund.*` webhook confirms the refund.
--
--   studio_withdrawals            one per subscription (unique), service role
--                                 writes, owner and statistics staff read
--   studio_withdrawal_quote()     the signed-in member's own: may they withdraw,
--                                 until when, and the refund if they did now
--   request_studio_withdrawal()   service role: the decision and the amounts,
--                                 idempotent (a second call returns the row)
--   record_studio_withdrawal_step()  service role: subscription cancelled,
--                                 refund sent (Stripe refund id) or none due
--   settle_studio_withdrawal_refund()  service role (webhook): refunded / failed
--   pending_studio_withdrawal_emails() + template `studio_withdrawal_confirmation`:
--                                 the acknowledgement on a durable medium (L221-21)
--
-- Who may withdraw: a subscription still running whose FIRST invoice
-- (`subscription_create`) is its only paid invoice — a renewal carries no
-- withdrawal right, and a plan change (a second paid invoice) goes to the team
-- (`manual_review`) — until the end of the 14th day after that payment (Paris
-- time). Amounts: days started since the period's start, over the period's days
-- (both from Stripe, checked here); the share used is rounded DOWN to the cent,
-- in the member's favour; the refund is the rest of the first payment.
-- =============================================================================

create table public.studio_withdrawals (
  id                 uuid primary key default gen_random_uuid(),
  subscription_id    uuid not null unique references public.studio_subscriptions (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  stripe_invoice_id  text not null check (stripe_invoice_id ~ '^in_[A-Za-z0-9]{6,250}$'),
  requested_at       timestamptz not null default now(),
  period_start       timestamptz not null,
  period_end         timestamptz not null,
  used_days          integer not null check (used_days >= 1),
  period_days        integer not null check (period_days >= used_days),
  paid_amount        numeric(12,2) not null check (paid_amount >= 0),
  used_amount        numeric(12,2) not null check (used_amount >= 0),
  refund_amount      numeric(12,2) not null check (refund_amount >= 0),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  -- requested → (subscription cancelled at Stripe) → refund_pending → refunded | refund_failed;
  -- no_refund when nothing is left to give back.
  status             text not null default 'requested'
                       check (status in ('requested', 'refund_pending', 'refunded', 'refund_failed', 'no_refund')),
  canceled_at        timestamptz,
  stripe_refund_id   text unique check (stripe_refund_id ~ '^re_[A-Za-z0-9]{6,250}$'),
  refunded_at        timestamptz,
  failure_reason     text check (char_length(failure_reason) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint studio_withdrawals_amounts check (used_amount + refund_amount = paid_amount),
  constraint studio_withdrawals_period check (period_end > period_start)
);

comment on table public.studio_withdrawals is
  '3D Studio withdrawals within 14 days (decision 95): amounts decided by request_studio_withdrawal(), refund confirmed by the verified webhook. Service role writes; owner and view_statistics staff read.';

create index studio_withdrawals_user_idx on public.studio_withdrawals (user_id);
alter table public.studio_withdrawals enable row level security;
revoke all on public.studio_withdrawals from anon, authenticated;
grant select on public.studio_withdrawals to authenticated;

create policy "studio_withdrawals: owners and statistics staff read"
  on public.studio_withdrawals for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('view_statistics')));

create trigger studio_withdrawals_touch_updated_at
  before update on public.studio_withdrawals
  for each row execute function private.studio_touch_updated_at();

create trigger studio_withdrawals_audit
  after insert or update or delete on public.studio_withdrawals
  for each row execute function private.audit_changes();

-- ---------------------------------------------------------------------------
-- The member's subscription as far as withdrawal goes. `reason` when it is not
-- open: no_subscription, not_paid, renewal (the running period is not the
-- first), manual_review (a plan change was paid), deadline_passed, withdrawn.
-- ---------------------------------------------------------------------------
create or replace function private.studio_withdrawal_terms(p_user uuid)
returns table (
  subscription_id        uuid,
  stripe_subscription_id text,
  stripe_invoice_id      text,
  paid_amount            numeric,
  currency               text,
  paid_at                timestamptz,
  deadline               timestamptz,
  current_period_end     timestamptz,
  withdrawal_id          uuid,
  reason                 text
)
language sql
stable
security definer
set search_path = ''
as $$
  with sub as (
    select s.*
      from public.studio_subscriptions s
     where s.user_id = p_user
       and s.status in ('active', 'trialing', 'past_due')
     order by s.created_at desc
     limit 1
  ), first_invoice as (
    select i.stripe_invoice_id, i.amount, i.currency, i.occurred_at
      from public.studio_subscription_invoices i
      join sub on sub.id = i.subscription_id
     where i.status = 'paid' and i.billing_reason = 'subscription_create'
     order by i.occurred_at
     limit 1
  )
  select sub.id, sub.stripe_subscription_id, f.stripe_invoice_id, f.amount, f.currency, f.occurred_at,
         -- End of the 14th day after the payment, Paris time.
         (((f.occurred_at at time zone 'Europe/Paris')::date + 15)::timestamp at time zone 'Europe/Paris'),
         sub.current_period_end,
         w.id,
         case
           when sub.id is null then 'no_subscription'
           when w.id is not null then 'withdrawn'
           when f.stripe_invoice_id is null then 'not_paid'
           when now() >= (((f.occurred_at at time zone 'Europe/Paris')::date + 15)::timestamp at time zone 'Europe/Paris') then 'deadline_passed'
           when exists (select 1 from public.studio_subscription_invoices i
                         where i.subscription_id = sub.id and i.status = 'paid'
                           and i.stripe_invoice_id <> f.stripe_invoice_id
                           and i.billing_reason = 'subscription_cycle') then 'renewal'
           when exists (select 1 from public.studio_subscription_invoices i
                         where i.subscription_id = sub.id and i.status = 'paid'
                           and i.stripe_invoice_id <> f.stripe_invoice_id) then 'manual_review'
           else null
         end
    from (select 1) one
    left join sub on true
    left join first_invoice f on true
    left join public.studio_withdrawals w on w.subscription_id = sub.id;
$$;

revoke all on function private.studio_withdrawal_terms(uuid) from public, anon, authenticated;

-- Share used and refund, in exact numeric: days started over the period's days,
-- the used share rounded down to the cent.
create or replace function private.studio_withdrawal_amounts(
  p_paid numeric, p_period_start timestamptz, p_period_end timestamptz, p_at timestamptz
)
returns table (used_days integer, period_days integer, used_amount numeric, refund_amount numeric)
language sql
immutable
set search_path = ''
as $$
  with d as (
    select greatest(1, ceil(extract(epoch from (p_at - p_period_start)) / 86400))::integer as used,
           greatest(1, round(extract(epoch from (p_period_end - p_period_start)) / 86400))::integer as total
  ), c as (
    select least(d.used, d.total) as used, d.total from d
  )
  select c.used, c.total,
         floor(p_paid * c.used / c.total * 100) / 100,
         p_paid - floor(p_paid * c.used / c.total * 100) / 100
    from c;
$$;

revoke all on function private.studio_withdrawal_amounts(numeric, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The member's own view: may they withdraw, until when, and roughly how much
-- would come back now (period end from the mirror; the real figure is decided
-- with Stripe's period at the moment of the request).
-- ---------------------------------------------------------------------------
create or replace function public.studio_withdrawal_quote()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  t      record;
  a      record;
  w      public.studio_withdrawals;
begin
  if v_user is null then
    raise exception 'studio_withdrawal_quote: sign in first' using errcode = '42501';
  end if;
  select * into t from private.studio_withdrawal_terms(v_user);
  if t.withdrawal_id is not null then
    select * into w from public.studio_withdrawals where id = t.withdrawal_id;
  end if;
  if t.reason is not null then
    return jsonb_build_object(
      'eligible', false, 'reason', t.reason, 'deadline', t.deadline,
      'withdrawal', case when w.id is null then null else jsonb_build_object(
        'status', w.status, 'requested_at', w.requested_at, 'refund_amount', w.refund_amount,
        'used_amount', w.used_amount, 'currency', w.currency) end);
  end if;
  select * into a from private.studio_withdrawal_amounts(t.paid_amount, t.paid_at, t.current_period_end, now());
  return jsonb_build_object(
    'eligible', true, 'reason', null, 'deadline', t.deadline,
    'paid_amount', t.paid_amount, 'currency', t.currency,
    'used_days', a.used_days, 'period_days', a.period_days,
    'used_amount', a.used_amount, 'refund_amount', a.refund_amount);
end;
$$;

revoke all on function public.studio_withdrawal_quote() from public, anon;
grant execute on function public.studio_withdrawal_quote() to authenticated;

-- ---------------------------------------------------------------------------
-- The decision (service role, `studio-withdraw`). The period comes from Stripe
-- (the subscription read back), checked against the mirror. A second call for
-- the same subscription returns the row already decided.
-- ---------------------------------------------------------------------------
create or replace function public.request_studio_withdrawal(
  p_user_id uuid, p_period_start timestamptz, p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t   record;
  a   record;
  w   public.studio_withdrawals;
begin
  if not private.is_trusted_backend() then
    raise exception 'request_studio_withdrawal: not allowed' using errcode = '42501';
  end if;

  -- One decision at a time per account.
  perform 1 from public.studio_subscriptions where user_id = p_user_id for update;
  select * into t from private.studio_withdrawal_terms(p_user_id);

  if t.withdrawal_id is not null then
    select * into w from public.studio_withdrawals where id = t.withdrawal_id;
    return to_jsonb(w) || jsonb_build_object('created', false, 'stripe_subscription_id', t.stripe_subscription_id);
  end if;
  if t.reason is not null then
    raise exception 'request_studio_withdrawal: %', t.reason using errcode = 'P0001', hint = t.reason;
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start
     or p_period_start > now() + interval '5 minutes'
     or p_period_end - p_period_start > interval '400 days'
     or abs(extract(epoch from (p_period_start - t.paid_at))) > 2 * 86400 then
    raise exception 'request_studio_withdrawal: period does not match the first payment' using errcode = '22023';
  end if;

  select * into a from private.studio_withdrawal_amounts(t.paid_amount, p_period_start, p_period_end, now());

  insert into public.studio_withdrawals (subscription_id, user_id, stripe_invoice_id, period_start, period_end,
                                         used_days, period_days, paid_amount, used_amount, refund_amount, currency)
  values (t.subscription_id, p_user_id, t.stripe_invoice_id, p_period_start, p_period_end,
          a.used_days, a.period_days, t.paid_amount, a.used_amount, a.refund_amount, t.currency)
  returning * into w;

  return to_jsonb(w) || jsonb_build_object('created', true, 'stripe_subscription_id', t.stripe_subscription_id);
end;
$$;

revoke all on function public.request_studio_withdrawal(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.request_studio_withdrawal(uuid, timestamptz, timestamptz) to service_role;

-- Steps done at Stripe: `canceled` (the subscription is cancelled), `refund_sent`
-- (refund created, its id), `no_refund` (nothing left to give back).
create or replace function public.record_studio_withdrawal_step(
  p_withdrawal_id uuid, p_step text, p_stripe_refund_id text default null
)
returns public.studio_withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.studio_withdrawals;
begin
  if not private.is_trusted_backend() then
    raise exception 'record_studio_withdrawal_step: not allowed' using errcode = '42501';
  end if;
  select * into w from public.studio_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'record_studio_withdrawal_step: unknown withdrawal' using errcode = 'P0002';
  end if;
  case p_step
    when 'canceled' then
      update public.studio_withdrawals set canceled_at = coalesce(canceled_at, now())
       where id = w.id returning * into w;
    when 'refund_sent' then
      if p_stripe_refund_id is null then
        raise exception 'record_studio_withdrawal_step: refund id required' using errcode = '22023';
      end if;
      update public.studio_withdrawals
         set stripe_refund_id = p_stripe_refund_id,
             status = case when status = 'requested' then 'refund_pending' else status end
       where id = w.id returning * into w;
    when 'no_refund' then
      if w.refund_amount <> 0 then
        raise exception 'record_studio_withdrawal_step: a refund is due' using errcode = '22023';
      end if;
      update public.studio_withdrawals set status = 'no_refund' where id = w.id and status = 'requested' returning * into w;
      if w.id is null then select * into w from public.studio_withdrawals where id = p_withdrawal_id; end if;
    else
      raise exception 'record_studio_withdrawal_step: unknown step' using errcode = '22023';
  end case;
  return w;
end;
$$;

revoke all on function public.record_studio_withdrawal_step(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_studio_withdrawal_step(uuid, text, text) to service_role;

-- The verified `refund.*` event (metadata kind = studio_withdrawal). A refund
-- that succeeded stays refunded; replays change nothing.
create or replace function public.settle_studio_withdrawal_refund(
  p_withdrawal_id uuid, p_stripe_refund_id text, p_status text, p_reason text default null
)
returns public.studio_withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.studio_withdrawals;
begin
  if not private.is_trusted_backend() then
    raise exception 'settle_studio_withdrawal_refund: not allowed' using errcode = '42501';
  end if;
  select * into w from public.studio_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'settle_studio_withdrawal_refund: unknown withdrawal' using errcode = 'P0002';
  end if;
  if w.stripe_refund_id is not null and w.stripe_refund_id <> p_stripe_refund_id then
    raise exception 'settle_studio_withdrawal_refund: another refund' using errcode = '23514';
  end if;
  if w.status = 'refunded' then
    return w;
  end if;
  case p_status
    when 'succeeded' then
      update public.studio_withdrawals
         set status = 'refunded', stripe_refund_id = p_stripe_refund_id, refunded_at = now(), failure_reason = null
       where id = w.id returning * into w;
    when 'failed', 'canceled' then
      update public.studio_withdrawals
         set status = 'refund_failed', stripe_refund_id = p_stripe_refund_id, failure_reason = left(coalesce(p_reason, p_status), 500)
       where id = w.id returning * into w;
    else
      update public.studio_withdrawals
         set stripe_refund_id = p_stripe_refund_id,
             status = case when status = 'requested' then 'refund_pending' else status end
       where id = w.id returning * into w;
  end case;
  return w;
end;
$$;

revoke all on function public.settle_studio_withdrawal_refund(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_studio_withdrawal_refund(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The acknowledgement: once Stripe has the request (refund sent, or none due),
-- one e-mail per withdrawal (studio_withdrawal:<id>).
-- ---------------------------------------------------------------------------
create or replace function public.pending_studio_withdrawal_emails(p_limit integer default 25)
returns table (
  withdrawal_id  uuid,
  email          text,
  locale         text,
  plan           text,
  requested_at   timestamptz,
  used_days      integer,
  period_days    integer,
  paid_amount    numeric,
  used_amount    numeric,
  refund_amount  numeric,
  currency       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, p.email, p.preferred_locale, s.plan, w.requested_at, w.used_days, w.period_days,
         w.paid_amount, w.used_amount, w.refund_amount, w.currency
    from public.studio_withdrawals w
    join public.studio_subscriptions s on s.id = w.subscription_id
    join public.profiles p on p.id = w.user_id
   where w.status in ('refund_pending', 'refunded', 'no_refund')
     and w.requested_at >= now() - interval '7 days'
     and p.email is not null
     and private.email_event_open('studio_withdrawal:' || w.id::text)
   order by w.requested_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_studio_withdrawal_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_studio_withdrawal_emails(integer) to service_role;

insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('studio_withdrawal_confirmation', '3D Studio withdrawal confirmed',
   'Sent once when a member withdraws from a 3D Studio subscription within 14 days; acknowledges the withdrawal and the refund',
   'Votre rétractation est enregistrée', 'Votre abonnement {{plan_name}} au Studio 3D est arrêté.',
   E'Bonjour,\n\nNous avons bien reçu votre rétractation : votre abonnement {{plan_name}} au Studio 3D est arrêté et ne sera plus facturé.\n\nVous trouverez ci-dessous le détail du remboursement. Il est fait sur le moyen de paiement utilisé à la souscription ; selon votre banque, il apparaît sous quelques jours ouvrés.\n\nVos créations restent dans votre compte : vous pouvez les consulter à tout moment.',
   array['plan_name'], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('studio_withdrawal_confirmation', 'Your withdrawal is recorded',
     'Your {{plan_name}} subscription to the 3D Studio has stopped.',
     E'Hello,\n\nWe have received your withdrawal: your {{plan_name}} subscription to the 3D Studio has stopped and will not be charged again.\n\nThe details of the refund are below. It goes back to the payment method used to subscribe; depending on your bank, it appears within a few business days.\n\nYour creations stay in your account: you can view them at any time.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- The subscription confirmation now points to the account page to withdraw.
update public.email_templates
   set body = replace(body, 'Pour exercer votre droit de rétractation dans les 14 jours suivant la souscription, contactez-nous.',
                      'Pendant les 14 jours qui suivent la souscription, vous pouvez aussi vous rétracter depuis votre compte (page Studio 3D) : nous vous remboursons alors la part de l''abonnement que vous n''avez pas utilisée.')
 where key = 'studio_subscription_confirmation';
update public.email_template_translations tt
   set body = replace(tt.body, 'To exercise your right of withdrawal within 14 days of subscribing, contact us.',
                      'Within 14 days of subscribing, you can also withdraw from your account (3D Studio page): we then refund the share of the subscription you have not used.')
  from public.email_templates t
 where t.id = tt.template_id and t.key = 'studio_subscription_confirmation' and tt.locale = 'en';
