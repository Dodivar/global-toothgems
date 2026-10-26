-- =============================================================================
-- 3D Studio subscriptions: our own legal invoices and credit notes (decision 115)
-- =============================================================================
-- Stripe stays the payment engine of the Studio subscriptions (recurring
-- charges, proration, retries, refunds), but the legal document is now ours,
-- like the shop's (decision 86): one series of numbers, one seller snapshot,
-- one VAT regime (decision 114), one PDF template.
--
--   * `studio_subscription_invoices` keeps what the verified webhook read of
--     the Stripe invoice: its `total` (before customer balance) and its `lines`
--     (amount, price, period, proration flag), written by record_studio_invoice().
--   * `invoices` holds a Studio document: `order_id` becomes nullable and
--     exactly one source is set — an order, or a Studio invoice
--     (`studio_invoice_id`). A Studio credit note credits a withdrawal
--     (`studio_withdrawal_id`) and keeps the credited invoice's Stripe id, so
--     ownership is read through one path.
--   * The FA- invoice is issued by a trigger the moment a Studio invoice is
--     recorded paid (same transaction, same `take_invoice_number`); the AV-
--     credit note the moment a withdrawal refund is confirmed (the verified
--     `refund.*` webhook, settle_studio_withdrawal_refund()).
--   * Lines: the plan, interval and period of each Stripe line, the plan read
--     from the line's price (inactive prices included: a proration credits the
--     former plan); prices are what Stripe charged (VAT included). VAT 0 under
--     the franchise, else the store country's configured standard rate.
--     When the lines cannot be trusted (missing, unknown price, not adding up
--     to the total) the invoice carries one line for the subscription's plan
--     and the total: the document is never refused (the webhook would retry
--     forever and the revenue row would be lost).
--   * A Stripe invoice whose total is zero or negative (a downgrade credited
--     to the customer balance) gets no document (decision to confirm).
--   * E-mails: the confirmation now names the first invoice
--     (pending_studio_subscription_emails returns its Stripe id); a renewal or a
--     plan change paid gets `studio_invoice` with its FA; a credit note issued
--     after the withdrawal acknowledgement went out gets `studio_credit_note`.
--   * Owners read their Studio documents, active staff all (same policy).
-- Paid Studio invoices recorded before this migration get no document (test
-- mode only; Stripe's own documents remain for those).
-- =============================================================================

-- 1. What the webhook read of the Stripe invoice -------------------------------
alter table public.studio_subscription_invoices
  add column total numeric(12,2),
  add column lines jsonb check (lines is null or jsonb_typeof(lines) = 'array');

comment on column public.studio_subscription_invoices.total is
  'Stripe invoice total (VAT included, before any customer balance); `amount` is what was paid or due.';
comment on column public.studio_subscription_invoices.lines is
  'The Stripe invoice lines as the webhook read them: [{amount, price_id, period_start, period_end, proration, quantity}]. Source of the legal invoice.';

-- 2. Invoices: an order or a Studio invoice --------------------------------------
alter table public.invoices
  alter column order_id drop not null,
  add column studio_invoice_id text references public.studio_subscription_invoices (stripe_invoice_id) on delete restrict,
  add column studio_withdrawal_id uuid unique references public.studio_withdrawals (id) on delete restrict;

alter table public.invoices drop constraint invoices_kind_links;
alter table public.invoices add constraint invoices_kind_links check (
  num_nonnulls(order_id, studio_invoice_id) = 1
  and (
    (kind = 'invoice' and refund_id is null and studio_withdrawal_id is null and credited_invoice_id is null
       and series like 'FA-%')
    or (kind = 'credit_note' and credited_invoice_id is not null and series like 'AV-%'
        and ((order_id is not null and refund_id is not null and studio_withdrawal_id is null)
             or (studio_invoice_id is not null and studio_withdrawal_id is not null and refund_id is null)))));

create unique index invoices_one_per_studio_invoice on public.invoices (studio_invoice_id) where kind = 'invoice';
create index invoices_studio_invoice_id_idx on public.invoices (studio_invoice_id) where studio_invoice_id is not null;

comment on table public.invoices is
  'Legal invoices (paid orders, paid 3D Studio invoices) and credit notes (confirmed refunds, Studio withdrawals): numbered, frozen snapshots. Insert-only, issued by triggers.';

drop policy "invoices: owners and staff read" on public.invoices;
create policy "invoices: owners and staff read" on public.invoices
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = invoices.order_id and o.user_id = (select auth.uid()))
    or exists (select 1 from public.studio_subscription_invoices si
                where si.stripe_invoice_id = invoices.studio_invoice_id and si.user_id = (select auth.uid()))
    or (select private.is_staff())
  );

-- 3. Snapshots -------------------------------------------------------------------
create or replace function private.studio_plan_label(p_plan text, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when lower(coalesce(p_locale, 'fr')) like 'en%'
              then case p_plan when 'essential' then 'Essential' when 'artist' then 'Artist' when 'atelier' then 'Atelier' else p_plan end
              else case p_plan when 'essential' then 'Essentiel' when 'artist' then 'Artiste' when 'atelier' then 'Atelier' else p_plan end
         end;
$$;

/** The member as a buyer: e-mail, and the default billing (else shipping) address, else the name. */
create or replace function private.studio_invoice_buyer(p_user uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'email', coalesce(p.email, ''),
           'order_number', '',
           'address', coalesce(
             (select jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name, 'company', a.company,
                                        'address_line1', a.address_line1, 'address_line2', a.address_line2,
                                        'postal_code', a.postal_code, 'city', a.city, 'region', a.region,
                                        'country_code', a.country_code)
                from public.customer_addresses a
               where a.user_id = p.id and a.is_default
               order by (a.address_type = 'billing') desc
               limit 1),
             jsonb_build_object('first_name', coalesce(p.first_name, ''), 'last_name', coalesce(p.last_name, ''))))
    from public.profiles p
   where p.id = p_user;
$$;

revoke all on function private.studio_plan_label(text, text) from public, anon, authenticated;
revoke all on function private.studio_invoice_buyer(uuid) from public, anon, authenticated;

-- 4. Issuing the invoice of a paid Studio invoice ---------------------------------
create or replace function private.issue_studio_invoice(p_stripe_invoice_id text)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_si        public.studio_subscription_invoices;
  v_sub       public.studio_subscriptions;
  v_invoice   public.invoices;
  v_locale    text;
  v_total     numeric(12, 2);
  v_franchise boolean;
  v_rate      integer;
  v_raw       jsonb := '[]'::jsonb;
  v_lines     jsonb;
  v_trusted   boolean;
  v_number    record;
begin
  select * into v_invoice from public.invoices where studio_invoice_id = p_stripe_invoice_id and kind = 'invoice';
  if found then
    return v_invoice;
  end if;
  select * into v_si from public.studio_subscription_invoices where stripe_invoice_id = p_stripe_invoice_id;
  if not found or v_si.status <> 'paid' then
    return null;
  end if;
  v_total := coalesce(v_si.total, v_si.amount);
  if v_total <= 0 then
    return null;   -- nothing sold (a credit to the customer balance): no document
  end if;
  select * into v_sub from public.studio_subscriptions where id = v_si.subscription_id;
  select coalesce(p.preferred_locale, 'fr') into v_locale from public.profiles p where p.id = v_si.user_id;

  v_franchise := coalesce((select s.vat_franchise from public.store_settings s where s.id), false);
  v_rate := case when v_franchise then 0
                 else coalesce(private.configured_vat_rate_bp(
                        coalesce(nullif((select s.country_code from public.store_settings s where s.id), ''), 'FR'), 'standard'), 0) end;

  -- The webhook's lines, each with the plan of its price; trusted only when every price is a Studio plan and they add up.
  if v_si.lines is not null and jsonb_array_length(v_si.lines) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'amount', case when (l ->> 'amount') ~ '^-?[0-9]+(\.[0-9]{1,2})?$' then (l ->> 'amount')::numeric end,
             'quantity', case when (l ->> 'quantity') ~ '^[1-9][0-9]{0,5}$' then (l ->> 'quantity')::integer else 1 end,
             'plan', pp.plan, 'interval', pp.billing_interval,
             'period_start', case when (l ->> 'period_start') ~ '^\d{4}-\d{2}-\d{2}' then l ->> 'period_start' end,
             'period_end', case when (l ->> 'period_end') ~ '^\d{4}-\d{2}-\d{2}' then l ->> 'period_end' end,
             'proration', coalesce(l -> 'proration' = 'true'::jsonb, false)) order by n), '[]'::jsonb),
           bool_and(pp.plan is not null and (l ->> 'amount') ~ '^-?[0-9]+(\.[0-9]{1,2})?$')
      into v_raw, v_trusted
      from jsonb_array_elements(v_si.lines) with ordinality as e(l, n)
      left join lateral (select x.plan, x.billing_interval from public.studio_plan_prices x
                          where x.stripe_price_id = l ->> 'price_id' limit 1) pp on true;
    v_trusted := coalesce(v_trusted, false)
                 and (select sum((r ->> 'amount')::numeric) from jsonb_array_elements(v_raw) r) = v_total;
  else
    v_trusted := false;
  end if;
  if not v_trusted then
    v_raw := jsonb_build_array(jsonb_build_object(
      'amount', v_total, 'quantity', 1, 'plan', v_sub.plan, 'interval', coalesce(v_sub.billing_interval, 'month'),
      'period_start', null, 'period_end', null, 'proration', false));
  end if;

  select jsonb_agg(jsonb_build_object(
           'order_item_id',   null,
           'kind',            'subscription',
           'description',     private.studio_plan_label(r ->> 'plan', v_locale),
           'detail',          null,
           'sku',             null,
           'plan',            r ->> 'plan',
           'interval',        r ->> 'interval',
           'period_start',    r ->> 'period_start',
           'period_end',      r ->> 'period_end',
           'proration',       (r ->> 'proration')::boolean,
           'quantity',        (r ->> 'quantity')::integer,
           'unit_price_incl', round((r ->> 'amount')::numeric / (r ->> 'quantity')::integer, 2),
           'unit_price_excl', round((r ->> 'amount')::numeric / (r ->> 'quantity')::integer * 10000 / (10000 + v_rate), 2),
           'discount_incl',   0,
           'vat_rate_bp',     v_rate,
           'total_incl',      (r ->> 'amount')::numeric,
           'vat_amount',      public.vat_included((r ->> 'amount')::numeric, v_rate),
           'total_excl',      (r ->> 'amount')::numeric - public.vat_included((r ->> 'amount')::numeric, v_rate))
           order by n)
    into v_lines
    from jsonb_array_elements(v_raw) with ordinality as e(r, n);

  select * into v_number from private.take_invoice_number('FA');
  insert into public.invoices
    (kind, series, sequence_number, invoice_number, studio_invoice_id, issued_at, sale_date, locale, currency,
     total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines, vat_breakdown, payment)
  select 'invoice', v_number.o_series, v_number.o_number,
         private.format_invoice_number(v_number.o_series, v_number.o_number),
         v_si.stripe_invoice_id, v_number.o_issued_at,
         (v_si.occurred_at at time zone 'Europe/Paris')::date,
         v_locale, v_si.currency, t.excl, t.vat, t.excl + t.vat,
         coalesce(private.invoice_seller(), '{}'::jsonb) || jsonb_build_object('vat_franchise', v_franchise),
         coalesce(private.studio_invoice_buyer(v_si.user_id), '{}'::jsonb),
         v_lines, private.invoice_vat_breakdown(v_lines),
         jsonb_build_object(
           'paid_at',          v_si.occurred_at,
           'gift_card_amount', 0,
           'charged_amount',   least(v_si.amount, t.excl + t.vat),
           'balance_amount',   greatest(t.excl + t.vat - v_si.amount, 0),
           'billing_reason',   v_si.billing_reason)
    from (select coalesce(sum((l ->> 'total_excl')::numeric), 0) as excl,
                 coalesce(sum((l ->> 'vat_amount')::numeric), 0) as vat
            from jsonb_array_elements(v_lines) l) t
  returning * into v_invoice;
  return v_invoice;
end;
$$;

-- 5. Issuing the credit note of a confirmed withdrawal refund ------------------------
create or replace function private.issue_studio_withdrawal_credit_note(p_withdrawal_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  w         public.studio_withdrawals;
  v_invoice public.invoices;
  v_note    public.invoices;
  v_first   jsonb;
  v_rate    integer;
  v_lines   jsonb;
  v_number  record;
begin
  select * into v_note from public.invoices where studio_withdrawal_id = p_withdrawal_id;
  if found then
    return v_note;
  end if;
  select * into w from public.studio_withdrawals where id = p_withdrawal_id;
  if not found or w.status <> 'refunded' or w.refund_amount <= 0 then
    return null;
  end if;
  select * into v_invoice from public.invoices where studio_invoice_id = w.stripe_invoice_id and kind = 'invoice';
  if not found then
    return null;   -- first payment recorded before Studio invoicing: nothing to credit
  end if;

  select l into v_first from jsonb_array_elements(v_invoice.lines) l
   order by coalesce((l ->> 'proration')::boolean, false), (l ->> 'total_incl')::numeric desc limit 1;
  v_rate := coalesce((v_first ->> 'vat_rate_bp')::integer, 0);
  v_lines := jsonb_build_array(jsonb_build_object(
    'order_item_id', null, 'kind', 'subscription', 'withdrawal', true,
    'description', v_first ->> 'description', 'detail', null, 'sku', null,
    'plan', v_first ->> 'plan', 'interval', v_first ->> 'interval',
    'period_start', v_first ->> 'period_start', 'period_end', v_first ->> 'period_end',
    'used_days', w.used_days, 'period_days', w.period_days,
    'quantity', null, 'vat_rate_bp', v_rate,
    'total_incl', w.refund_amount,
    'vat_amount', public.vat_included(w.refund_amount, v_rate),
    'total_excl', w.refund_amount - public.vat_included(w.refund_amount, v_rate)));

  select * into v_number from private.take_invoice_number('AV');
  insert into public.invoices
    (kind, series, sequence_number, invoice_number, studio_invoice_id, studio_withdrawal_id, credited_invoice_id,
     issued_at, sale_date, locale, currency, total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines,
     vat_breakdown, payment)
  select 'credit_note', v_number.o_series, v_number.o_number,
         private.format_invoice_number(v_number.o_series, v_number.o_number),
         v_invoice.studio_invoice_id, w.id, v_invoice.id, v_number.o_issued_at, v_invoice.sale_date,
         v_invoice.locale, v_invoice.currency, t.excl, t.vat, t.excl + t.vat,
         coalesce(private.invoice_seller(), v_invoice.seller)
           || jsonb_build_object('vat_franchise', coalesce((v_invoice.seller ->> 'vat_franchise')::boolean, false)),
         v_invoice.buyer, v_lines, private.invoice_vat_breakdown(v_lines),
         jsonb_build_object(
           'refunded_at', coalesce(w.refunded_at, v_number.o_issued_at),
           'refund_method', 'card',
           'reason', 'withdrawal',
           'credited_invoice_number', v_invoice.invoice_number)
    from (select sum((l ->> 'total_excl')::numeric) as excl, sum((l ->> 'vat_amount')::numeric) as vat
            from jsonb_array_elements(v_lines) l) t
  returning * into v_note;
  return v_note;
end;
$$;

revoke all on function private.issue_studio_invoice(text) from public, anon, authenticated;
revoke all on function private.issue_studio_withdrawal_credit_note(uuid) from public, anon, authenticated;

-- 6. Triggers --------------------------------------------------------------------
create or replace function private.invoice_paid_studio_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    perform private.issue_studio_invoice(new.stripe_invoice_id);
  end if;
  return null;
end;
$$;

create trigger studio_subscription_invoices_zz_issue_invoice
  after insert or update of status on public.studio_subscription_invoices
  for each row execute function private.invoice_paid_studio_invoice();

create or replace function private.credit_note_for_studio_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'refunded' and old.status is distinct from 'refunded' then
    perform private.issue_studio_withdrawal_credit_note(new.id);
  end if;
  return null;
end;
$$;

create trigger studio_withdrawals_zz_issue_credit_note
  after update of status on public.studio_withdrawals
  for each row execute function private.credit_note_for_studio_withdrawal();

revoke all on function private.invoice_paid_studio_invoice() from public, anon, authenticated;
revoke all on function private.credit_note_for_studio_withdrawal() from public, anon, authenticated;

-- 7. The webhook's writer: total and lines ----------------------------------------
drop function public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz);

create or replace function public.record_studio_invoice(
  p_stripe_invoice_id      text,
  p_stripe_subscription_id text,
  p_billing_reason         text,
  p_status                 text,
  p_amount                 numeric,
  p_currency               text,
  p_occurred_at            timestamptz,
  p_total                  numeric default null,
  p_lines                  jsonb default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sub   public.studio_subscriptions;
  v_lines jsonb := case when jsonb_typeof(p_lines) = 'array' then p_lines end;
begin
  select * into v_sub from public.studio_subscriptions s where s.stripe_subscription_id = p_stripe_subscription_id;
  if v_sub.id is null then
    raise exception 'record_studio_invoice: unknown subscription' using errcode = 'P0002';
  end if;

  insert into public.studio_subscription_invoices as i
    (stripe_invoice_id, subscription_id, user_id, billing_reason, status, amount, currency, occurred_at, total, lines)
  values
    (p_stripe_invoice_id, v_sub.id, v_sub.user_id, coalesce(p_billing_reason, 'manual'), p_status, p_amount,
     upper(p_currency), coalesce(p_occurred_at, now()), p_total, v_lines)
  on conflict (stripe_invoice_id) do update
     -- A failed attempt later paid becomes paid; a paid invoice never goes back to failed.
     set status      = case when i.status = 'paid' then 'paid' else excluded.status end,
         amount      = excluded.amount,
         occurred_at = case when i.status = 'paid' then i.occurred_at else excluded.occurred_at end,
         total       = coalesce(excluded.total, i.total),
         lines       = coalesce(excluded.lines, i.lines);
end;
$$;

comment on function public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz, numeric, jsonb) is
  'stripe-webhook: records a paid or failed 3D Studio subscription invoice with its billing reason, total and lines; paid issues the legal invoice. Idempotent. Service role only.';

revoke all on function public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_studio_invoice(text, text, text, text, numeric, text, timestamptz, numeric, jsonb)
  to service_role;

-- 8. E-mails ---------------------------------------------------------------------
-- The confirmation names the first invoice (its FA travels as a PDF).
drop function public.pending_studio_subscription_emails(integer);
create or replace function public.pending_studio_subscription_emails(p_limit integer default 25)
returns table (
  subscription_id   uuid,
  email             text,
  locale            text,
  plan              text,
  billing_interval  text,
  amount            numeric,
  currency          text,
  consent_version   text,
  consented_at      timestamptz,
  stripe_invoice_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, p.email, p.preferred_locale,
         s.plan, coalesce(s.billing_interval, 'month'), i.amount, i.currency,
         c.policy_version, c.created_at, i.stripe_invoice_id
    from public.studio_subscriptions s
    join public.profiles p on p.id = s.user_id
    join lateral (
      select inv.amount, inv.currency, inv.stripe_invoice_id
        from public.studio_subscription_invoices inv
       where inv.subscription_id = s.id
         and inv.status = 'paid'
         and inv.billing_reason = 'subscription_create'
       order by inv.occurred_at
       limit 1
    ) i on true
    join lateral (
      select cr.policy_version, cr.created_at
        from public.consent_records cr
       where cr.user_id = s.user_id
         and cr.purpose = 'studio_immediate_access'
         and cr.granted
         and cr.created_at <= s.created_at
       order by cr.created_at desc
       limit 1
    ) c on true
   where s.created_at >= now() - interval '7 days'
     and p.email is not null
     and private.email_event_open('studio_subscription:' || s.id::text)
   order by s.created_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_studio_subscription_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_studio_subscription_emails(integer) to service_role;

-- A renewal or a plan change paid: its invoice, by e-mail (Stripe's own e-mails are off).
create or replace function public.pending_studio_invoice_emails(p_limit integer default 25)
returns table (
  stripe_invoice_id text,
  email             text,
  locale            text,
  plan              text,
  billing_reason    text,
  invoice_number    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select si.stripe_invoice_id, p.email, p.preferred_locale, s.plan, si.billing_reason, d.invoice_number
    from public.studio_subscription_invoices si
    join public.invoices d on d.studio_invoice_id = si.stripe_invoice_id and d.kind = 'invoice'
    join public.studio_subscriptions s on s.id = si.subscription_id
    join public.profiles p on p.id = si.user_id
   where si.status = 'paid'
     and si.billing_reason <> 'subscription_create'
     and d.issued_at >= now() - interval '7 days'
     and p.email is not null
     and private.email_event_open('studio_invoice:' || si.stripe_invoice_id)
   order by d.issued_at
   limit least(greatest(p_limit, 1), 100);
$$;

-- A withdrawal's credit note issued after its acknowledgement went out (that e-mail could not carry it).
create or replace function public.pending_studio_credit_note_emails(p_limit integer default 25)
returns table (
  withdrawal_id  uuid,
  email          text,
  locale         text,
  plan           text,
  refund_amount  numeric,
  currency       text,
  invoice_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, p.email, p.preferred_locale, s.plan, w.refund_amount, w.currency, d.invoice_number
    from public.invoices d
    join public.studio_withdrawals w on w.id = d.studio_withdrawal_id
    join public.studio_subscriptions s on s.id = w.subscription_id
    join public.profiles p on p.id = w.user_id
   where d.kind = 'credit_note'
     and d.issued_at >= now() - interval '7 days'
     and p.email is not null
     and exists (select 1 from public.email_log e
                  where e.event_key = 'studio_withdrawal:' || w.id::text
                    and e.status in ('sent', 'delivered', 'opened', 'bounced', 'complained')
                    and e.created_at < d.issued_at)
     and private.email_event_open('studio_credit_note:' || w.id::text)
   order by d.issued_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_studio_invoice_emails(integer) from public, anon, authenticated;
revoke all on function public.pending_studio_credit_note_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_studio_invoice_emails(integer) to service_role;
grant execute on function public.pending_studio_credit_note_emails(integer) to service_role;

insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('studio_invoice', '3D Studio invoice',
   'Sent for every paid 3D Studio invoice after the first one (renewal, plan change), with the invoice as a PDF',
   'Votre facture Studio 3D {{invoice_number}}', 'Votre abonnement {{plan_name}} au Studio 3D est réglé.',
   E'Bonjour,\n\nLe paiement de votre abonnement {{plan_name}} au Studio 3D est bien reçu. Vous trouverez votre facture {{invoice_number}} en pièce jointe ; elle reste disponible dans votre compte (page Studio 3D).\n\nVous pouvez gérer ou résilier votre abonnement à tout moment depuis votre compte.',
   array['plan_name', 'invoice_number'], 'high'),
  ('studio_credit_note', '3D Studio credit note',
   'Sent once a 3D Studio withdrawal refund is confirmed, when the acknowledgement went out before it, with the credit note as a PDF',
   'Votre remboursement Studio 3D est effectué', 'Votre avoir {{invoice_number}} est joint.',
   E'Bonjour,\n\nLe remboursement de votre rétractation (abonnement {{plan_name}} au Studio 3D) est effectué. Vous trouverez l''avoir {{invoice_number}} en pièce jointe ; il reste disponible dans votre compte (page Studio 3D).\n\nSelon votre banque, le montant apparaît sous quelques jours ouvrés.',
   array['plan_name', 'invoice_number'], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('studio_invoice', 'Your 3D Studio invoice {{invoice_number}}',
     'Your {{plan_name}} subscription to the 3D Studio is paid.',
     E'Hello,\n\nWe have received the payment of your {{plan_name}} subscription to the 3D Studio. Your invoice {{invoice_number}} is attached; it stays available in your account (3D Studio page).\n\nYou can manage or cancel your subscription at any time from your account.'),
    ('studio_credit_note', 'Your 3D Studio refund is done',
     'Your credit note {{invoice_number}} is attached.',
     E'Hello,\n\nThe refund of your withdrawal ({{plan_name}} subscription to the 3D Studio) is done. The credit note {{invoice_number}} is attached; it stays available in your account (3D Studio page).\n\nDepending on your bank, the amount appears within a few business days.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;
