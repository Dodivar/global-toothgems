-- =============================================================================
-- Migration 015 — Refunds (iteration 3)
-- =============================================================================
-- A refund is money going back on a specific payment, optionally tied to the
-- order lines being returned (for restocking and reporting).
--
-- Flow (Stripe):
--   1. staff/backend: request_refund(order, amount, reason, items, restock)
--        → refund 'pending'; amount can never exceed what is still refundable
--          on the payment (row-locked, so concurrent requests cannot overshoot)
--   2. backend calls the Stripe Refunds API
--   3. webhook refund.updated / charge.refunded:
--        mark_refund_succeeded(refund, re_…)  or  mark_refund_failed(refund, reason)
--   4. on success (trigger): payments.amount_refunded / status, orders.payment_status
--      ('partially_refunded' | 'refunded'), orders.status → 'refunded' when
--      everything was refunded, and returned lines restocked ('return' movements)
--      when requested.
-- Staff can cancel a pending refund; only the backend (service role) can mark
-- a refund succeeded or failed — money state follows the provider.
-- =============================================================================

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  payment_id         uuid not null references public.payments (id) on delete restrict,
  amount             numeric(12, 2) not null check (amount > 0),
  currency           char(3) not null check (currency ~ '^[A-Z]{3}$'),
  reason             text not null check (reason in
                       ('requested_by_customer', 'return', 'defective', 'not_received', 'duplicate',
                        'fraudulent', 'goodwill', 'other')),
  status             text not null default 'pending'
                     check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  restock            boolean not null default false,
  provider_refund_id text unique check (provider_refund_id ~ '^[A-Za-z0-9_]+$'),   -- Stripe re_…
  failure_reason     text check (char_length(failure_reason) <= 500),
  requested_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  processed_at       timestamptz
);

comment on table public.refunds is
  'Money returned on a payment. Succeeded/failed only via the backend (provider confirmation).';

create index refunds_order_idx on public.refunds (order_id, created_at desc);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_pending_idx on public.refunds (created_at) where status = 'pending';

create table public.refund_items (
  refund_id     uuid not null references public.refunds (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  primary key (refund_id, order_item_id)
);

create index refund_items_order_item_idx on public.refund_items (order_item_id);

alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;

-- -----------------------------------------------------------------------------
-- Rules
-- -----------------------------------------------------------------------------
-- Row lock on the payment so concurrent refund requests are serialized.
-- SECURITY DEFINER: staff have no UPDATE right on payments (needed by FOR UPDATE).
create or replace function private.lock_payment(p_payment_id uuid)
returns public.payments
language sql
security definer
set search_path = ''
as $$
  select * from public.payments where id = p_payment_id for update;
$$;

revoke all on function private.lock_payment(uuid) from public;
grant execute on function private.lock_payment(uuid) to authenticated, service_role;

create or replace function private.guard_refund()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_payment   public.payments;
  v_committed numeric(12, 2);
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    select * into v_order from public.orders where id = new.order_id;
    v_payment := private.lock_payment(new.payment_id);                                   -- serialize refunds

    if v_payment.order_id is distinct from new.order_id then
      raise exception 'refunds: payment belongs to another order' using errcode = '23514';
    end if;
    if v_payment.status not in ('succeeded', 'partially_refunded')
       or v_order.payment_status not in ('paid', 'partially_refunded') then
      raise exception 'refunds: nothing has been paid on this order' using errcode = '23514';
    end if;
    new.currency := upper(coalesce(new.currency, v_order.currency));
    if new.currency <> v_payment.currency then
      raise exception 'refunds: currency must match the payment' using errcode = '23514';
    end if;

    select coalesce(sum(r.amount), 0) into v_committed
      from public.refunds r
     where r.payment_id = new.payment_id and r.status = 'pending';
    if new.amount > v_payment.amount - v_payment.amount_refunded - v_committed then
      raise exception 'refunds: % exceeds the refundable balance (% paid, % refunded, % pending)',
        new.amount, v_payment.amount, v_payment.amount_refunded, v_committed using errcode = '23514';
    end if;

    if not private.is_trusted_backend() then
      new.status := 'pending';
      new.provider_refund_id := null;
      new.failure_reason := null;
      new.processed_at := null;
      new.requested_by := auth.uid();
    end if;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE
  if new.order_id is distinct from old.order_id or new.payment_id is distinct from old.payment_id
     or new.amount is distinct from old.amount or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at or new.requested_by is distinct from old.requested_by then
    raise exception 'refunds: a refund cannot be rewritten; cancel it and create another' using errcode = '42501';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'refunds: % refunds are final', old.status using errcode = '42501';
  end if;
  if not private.is_trusted_backend() then
    if new.status not in ('pending', 'cancelled')
       or new.provider_refund_id is distinct from old.provider_refund_id
       or new.failure_reason is distinct from old.failure_reason
       or new.processed_at is distinct from old.processed_at then
      raise exception 'refunds: only the payment backend can confirm or fail a refund' using errcode = '42501';
    end if;
  end if;
  if new.status in ('succeeded', 'failed', 'cancelled') and old.status = 'pending' then
    new.processed_at := coalesce(new.processed_at, now());
  end if;
  return new;
end;
$$;

create trigger refunds_guard
  before insert or update on public.refunds
  for each row execute function private.guard_refund();

create or replace function private.guard_refund_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund   public.refunds;
  v_item     public.order_items;
  v_refunded integer;
begin
  select * into v_refund from public.refunds where id = new.refund_id;
  select * into v_item from public.order_items where id = new.order_item_id for update;
  if v_item.order_id is distinct from v_refund.order_id then
    raise exception 'refund_items: line belongs to another order' using errcode = '23514';
  end if;
  if v_refund.status <> 'pending' then
    raise exception 'refund_items: lines can only be added to a pending refund' using errcode = '23514';
  end if;
  select coalesce(sum(ri.quantity), 0) into v_refunded
    from public.refund_items ri
    join public.refunds r on r.id = ri.refund_id and r.status in ('pending', 'succeeded')
   where ri.order_item_id = new.order_item_id
     and not (ri.refund_id = new.refund_id and tg_op = 'UPDATE');
  if v_refunded + new.quantity > v_item.quantity then
    raise exception 'refund_items: % of % units already refunded', v_refunded, v_item.quantity
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger refund_items_guard
  before insert or update on public.refund_items
  for each row execute function private.guard_refund_item();

-- Effects of a confirmed refund: payment, order and stock.
create or replace function private.apply_refund_success()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_refunded numeric(12, 2);
  v_paid             numeric(12, 2);
  v_refunded         numeric(12, 2);
  v_order            public.orders;
  v_item             record;
begin
  if not (new.status = 'succeeded' and old.status is distinct from 'succeeded') then
    return null;
  end if;

  update public.payments
     set amount_refunded = amount_refunded + new.amount,
         status = case when amount_refunded + new.amount >= amount then 'refunded' else 'partially_refunded' end
   where id = new.payment_id
  returning amount_refunded into v_payment_refunded;

  select coalesce(sum(p.amount) filter (where p.status in ('succeeded', 'partially_refunded', 'refunded')), 0),
         coalesce(sum(p.amount_refunded), 0)
    into v_paid, v_refunded
    from public.payments p where p.order_id = new.order_id;

  select * into v_order from public.orders where id = new.order_id for update;

  -- Returned goods back on the shelf (only if the sale had taken the stock).
  if new.restock and v_order.stock_state = 'committed' then
    perform private.set_inventory_context('return', new.order_id);
    for v_item in
      select i.inventory_item_id, sum(ri.quantity)::integer as qty
        from public.refund_items ri
        join public.order_items i on i.id = ri.order_item_id
        join public.inventory_items inv on inv.id = i.inventory_item_id and inv.track_inventory
       where ri.refund_id = new.id
       group by i.inventory_item_id
    loop
      update public.inventory_items
         set quantity_on_hand = quantity_on_hand + v_item.qty
       where id = v_item.inventory_item_id;
    end loop;
    perform private.set_inventory_context(null, null);
  end if;

  update public.orders
     set payment_status = case when v_refunded >= v_paid then 'refunded' else 'partially_refunded' end,
         status = case when v_refunded >= v_paid and status <> 'cancelled' then 'refunded' else status end
   where id = new.order_id;

  return null;
end;
$$;

create trigger refunds_apply_success
  after update of status on public.refunds
  for each row execute function private.apply_refund_success();

revoke all on function private.guard_refund_item() from public;
revoke all on function private.apply_refund_success() from public;

create trigger refunds_audit_log
  after insert or update on public.refunds
  for each row execute function private.audit_changes('status', 'provider_refund_id', 'failure_reason');

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Staff or backend. p_items: [{"order_item_id": uuid, "quantity": int}, ...]
-- Refunds the order's latest payment that still has a refundable balance.
create or replace function public.request_refund(
  p_order_id uuid,
  p_amount   numeric,
  p_reason   text,
  p_items    jsonb default '[]'::jsonb,
  p_restock  boolean default false
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_refund  public.refunds;
  v_item    jsonb;
begin
  if not (private.is_trusted_backend() or private.is_admin()) then
    raise exception 'request_refund: not allowed' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'request_refund: items must be an array' using errcode = '22023';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.order_id = p_order_id
     and p.status in ('succeeded', 'partially_refunded')
     and p.amount > p.amount_refunded
   order by p.created_at desc
   limit 1;
  if not found then
    raise exception 'request_refund: no refundable payment on this order' using errcode = 'P0002';
  end if;

  insert into public.refunds (order_id, payment_id, amount, currency, reason, restock)
  values (p_order_id, v_payment.id, p_amount, v_payment.currency, p_reason, coalesce(p_restock, false))
  returning * into v_refund;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.refund_items (refund_id, order_item_id, quantity)
    values (v_refund.id, (v_item ->> 'order_item_id')::uuid, (v_item ->> 'quantity')::integer);
  end loop;

  return v_refund;
end;
$$;

-- Backend only (Stripe webhook). Idempotent.
create or replace function public.mark_refund_succeeded(p_refund_id uuid, p_provider_refund_id text default null)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'mark_refund_succeeded: refund not found' using errcode = 'P0002';
  end if;
  if v_refund.status = 'succeeded' then
    return v_refund;
  end if;
  update public.refunds
     set status = 'succeeded',
         provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id)
   where id = p_refund_id
  returning * into v_refund;
  return v_refund;
end;
$$;

create or replace function public.mark_refund_failed(p_refund_id uuid, p_reason text default null)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_refund public.refunds;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'mark_refund_failed: refund not found' using errcode = 'P0002';
  end if;
  if v_refund.status = 'failed' then
    return v_refund;
  end if;
  update public.refunds
     set status = 'failed', failure_reason = left(p_reason, 500)
   where id = p_refund_id
  returning * into v_refund;
  return v_refund;
end;
$$;

revoke all on function public.request_refund(uuid, numeric, text, jsonb, boolean) from public, anon;
revoke all on function public.mark_refund_succeeded(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_refund_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.request_refund(uuid, numeric, text, jsonb, boolean) to authenticated, service_role;
grant execute on function public.mark_refund_succeeded(uuid, text) to service_role;
grant execute on function public.mark_refund_failed(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Privileges and RLS: customers see refunds on their own orders; staff
-- request and cancel; confirmation is backend-only.
-- -----------------------------------------------------------------------------
revoke all on public.refunds, public.refund_items from anon;
revoke truncate, references, trigger, delete on public.refunds, public.refund_items from authenticated;

create policy "refunds: owners and admins read"
  on public.refunds for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = refunds.order_id and o.user_id = (select auth.uid()))
    or (select private.is_admin())
  );
create policy "refunds: admins request"
  on public.refunds for insert to authenticated with check ((select private.is_admin()));
create policy "refunds: admins cancel pending"
  on public.refunds for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "refund_items: owners and admins read"
  on public.refund_items for select to authenticated
  using (exists (select 1 from public.refunds r where r.id = refund_items.refund_id));
create policy "refund_items: admins add"
  on public.refund_items for insert to authenticated with check ((select private.is_admin()));
