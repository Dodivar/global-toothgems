-- =============================================================================
-- Migration 014 — Shipments and tracking (iteration 3)
-- =============================================================================
-- One order can ship in several parcels (partial fulfilment): a shipment lists
-- which order lines — and how many units — it contains.
--
-- Rules enforced in the database:
--   * only paid, non-cancelled orders can be shipped;
--   * a line can never be shipped beyond the quantity ordered;
--   * shipments of digital products are refused;
--   * orders.fulfillment_status and orders.status are RECOMPUTED from the
--     shipments (unfulfilled → preparing → partially_fulfilled → fulfilled;
--     confirmed → processing → shipped → delivered), whatever path changed
--     them — so the storefront tracking, the admin list and the review rule
--     ("shipped or delivered") always agree;
--   * a shipment can only be deleted while it is still being prepared.
-- Carrier webhooks / tracking events are a later addition (tracking_events).
-- =============================================================================

create table public.shipments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  status             text not null default 'preparing'
                     check (status in ('preparing', 'shipped', 'delivered', 'returned', 'lost', 'cancelled')),
  carrier            text check (char_length(btrim(carrier)) between 1 and 60),
  service            text check (char_length(service) <= 60),                  -- e.g. "Colissimo Expert"
  tracking_number    text check (char_length(btrim(tracking_number)) between 3 and 60),
  tracking_url       text check (tracking_url ~ '^https://'),
  estimated_delivery date,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.profiles (id) on delete set null,
  updated_by         uuid references public.profiles (id) on delete set null,
  constraint shipments_shipped_has_carrier
    check (status in ('preparing', 'cancelled') or (carrier is not null and tracking_number is not null)),
  constraint shipments_dates_order check (delivered_at is null or shipped_at is null or delivered_at >= shipped_at)
);

comment on table public.shipments is
  'Parcels of an order. Their status drives orders.fulfillment_status and orders.status.';

create index shipments_order_idx on public.shipments (order_id);
create index shipments_status_idx on public.shipments (status, created_at desc);
create unique index shipments_tracking_unique_idx on public.shipments (carrier, tracking_number)
  where tracking_number is not null;

create table public.shipment_items (
  shipment_id   uuid not null references public.shipments (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  primary key (shipment_id, order_item_id)
);

create index shipment_items_order_item_idx on public.shipment_items (order_item_id);

alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;

create trigger shipments_audit
  before insert or update on public.shipments
  for each row execute function private.set_audit_columns();

-- -----------------------------------------------------------------------------
-- Shipment rules
-- -----------------------------------------------------------------------------
create or replace function private.guard_shipment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if tg_op = 'DELETE' then
    if old.status not in ('preparing', 'cancelled') and not private.is_trusted_backend() then
      raise exception 'shipments: a shipment that left the workshop cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  select * into v_order from public.orders where id = new.order_id;
  if tg_op = 'INSERT' or new.order_id is distinct from old.order_id then
    if v_order.payment_status not in ('paid', 'partially_refunded') or v_order.status in ('cancelled', 'refunded') then
      raise exception 'shipments: only paid, active orders can be shipped' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' then
      raise exception 'shipments: a shipment cannot move to another order' using errcode = '42501';
    end if;
  end if;

  new.carrier := nullif(btrim(new.carrier), '');
  new.tracking_number := nullif(btrim(new.tracking_number), '');
  if new.status in ('shipped', 'delivered') then
    new.shipped_at := coalesce(new.shipped_at, now());
  end if;
  if new.status = 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end;
$$;

create trigger shipments_guard
  before insert or update or delete on public.shipments
  for each row execute function private.guard_shipment();

create or replace function private.guard_shipment_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      public.order_items;
  v_ship      public.shipments;
  v_physical  boolean;
  v_shipped   integer;
begin
  select * into v_ship from public.shipments where id = new.shipment_id;
  select * into v_item from public.order_items where id = new.order_item_id for update;

  if v_item.order_id is distinct from v_ship.order_id then
    raise exception 'shipment_items: line belongs to another order' using errcode = '23514';
  end if;
  select coalesce(p.product_type = 'physical', true) into v_physical
    from (select 1) x left join public.products p on p.id = v_item.product_id;
  if not v_physical then
    raise exception 'shipment_items: digital products are not shipped' using errcode = '23514';
  end if;

  select coalesce(sum(si.quantity), 0) into v_shipped
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id and s.status not in ('cancelled', 'returned', 'lost')
   where si.order_item_id = new.order_item_id
     and not (si.shipment_id = new.shipment_id and tg_op = 'UPDATE');
  if v_shipped + new.quantity > v_item.quantity then
    raise exception 'shipment_items: % of % units already allocated to parcels', v_shipped, v_item.quantity
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger shipment_items_guard
  before insert or update on public.shipment_items
  for each row execute function private.guard_shipment_item();

-- -----------------------------------------------------------------------------
-- Recompute an order's fulfilment and lifecycle from its shipments.
-- -----------------------------------------------------------------------------
create or replace function private.sync_order_fulfillment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order        public.orders;
  v_to_ship      integer;
  v_shipped      integer;
  v_delivered    integer;
  v_preparing    boolean;
  v_fulfillment  text;
  v_status       text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status in ('cancelled', 'refunded') then
    return;
  end if;

  select coalesce(sum(i.quantity), 0) into v_to_ship
    from public.order_items i
    left join public.products p on p.id = i.product_id
   where i.order_id = p_order_id and coalesce(p.product_type, 'physical') = 'physical';

  select coalesce(sum(si.quantity) filter (where s.status in ('shipped', 'delivered')), 0),
         coalesce(sum(si.quantity) filter (where s.status = 'delivered'), 0),
         coalesce(bool_or(s.status = 'preparing'), false)
    into v_shipped, v_delivered, v_preparing
    from public.shipments s
    left join public.shipment_items si on si.shipment_id = s.id
   where s.order_id = p_order_id;

  v_fulfillment := case
    when v_to_ship > 0 and v_shipped >= v_to_ship then 'fulfilled'
    when v_shipped > 0 then 'partially_fulfilled'
    when v_preparing then 'preparing'
    else 'unfulfilled' end;

  v_status := case
    when v_to_ship > 0 and v_delivered >= v_to_ship then 'delivered'
    when v_fulfillment = 'fulfilled' then 'shipped'
    when v_fulfillment in ('partially_fulfilled', 'preparing') then 'processing'
    when v_order.status in ('shipped', 'delivered') then 'processing'   -- parcel cancelled/returned
    else v_order.status end;

  if v_fulfillment is distinct from v_order.fulfillment_status or v_status is distinct from v_order.status then
    update public.orders
       set fulfillment_status = v_fulfillment, status = v_status
     where id = p_order_id;
  end if;
end;
$$;

create or replace function private.on_shipment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'shipments' then
    perform private.sync_order_fulfillment(case when tg_op = 'DELETE' then old.order_id else new.order_id end);
  else
    perform private.sync_order_fulfillment(
      (select s.order_id from public.shipments s
        where s.id = case when tg_op = 'DELETE' then old.shipment_id else new.shipment_id end));
  end if;
  return null;
end;
$$;

create trigger shipments_sync_order
  after insert or update of status or delete on public.shipments
  for each row execute function private.on_shipment_change();
create trigger shipment_items_sync_order
  after insert or update or delete on public.shipment_items
  for each row execute function private.on_shipment_change();

revoke all on function private.guard_shipment_item() from public;
revoke all on function private.sync_order_fulfillment(uuid) from public;
revoke all on function private.on_shipment_change() from public;

create trigger shipments_audit_log
  after insert or update or delete on public.shipments
  for each row execute function private.audit_changes(
    'status', 'carrier', 'tracking_number', 'estimated_delivery');

-- -----------------------------------------------------------------------------
-- Privileges and RLS: customers read their own parcels, staff manage them.
-- -----------------------------------------------------------------------------
revoke all on public.shipments, public.shipment_items from anon;
revoke truncate, references, trigger on public.shipments, public.shipment_items from authenticated;

create policy "shipments: owners and admins read"
  on public.shipments for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = shipments.order_id and o.user_id = (select auth.uid()))
    or (select private.is_admin())
  );
create policy "shipments: admins insert"
  on public.shipments for insert to authenticated with check ((select private.is_admin()));
create policy "shipments: admins update"
  on public.shipments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "shipments: admins delete"
  on public.shipments for delete to authenticated using ((select private.is_admin()));

create policy "shipment_items: owners and admins read"
  on public.shipment_items for select to authenticated
  using (exists (select 1 from public.shipments s where s.id = shipment_items.shipment_id));
create policy "shipment_items: admins insert"
  on public.shipment_items for insert to authenticated with check ((select private.is_admin()));
create policy "shipment_items: admins update"
  on public.shipment_items for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "shipment_items: admins delete"
  on public.shipment_items for delete to authenticated using ((select private.is_admin()));
