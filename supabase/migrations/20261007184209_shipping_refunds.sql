-- =============================================================================
-- Shipping and refunds, operated from the back office (decision 82)
-- =============================================================================
-- The parcel and refund tables, their guards and their RLS (manage_orders) have
-- existed since iteration 3. What was missing to operate a physical shop:
--
--   * create_shipment() / set_shipment_status(): a parcel and its lines written
--     in ONE transaction (the e-mail sweep picks any `shipped` parcel, so a
--     parcel must never be visible without its lines), with forward-only
--     transitions. Security invoker: RLS + manage_orders decide, the guard
--     triggers apply the data rules.
--   * Refunded units no longer count as "to ship" (sync_order_fulfillment) and
--     cannot be shipped (guard_shipment_item); a confirmed partial refund
--     recomputes the order's fulfilment.
--   * pending_refund_emails() only lists CARD refunds: refund_to_gift_cards()
--     writes `succeeded` rows too, and the template speaks of the bank.
--   * A refund (card or gift card) is refused while a gift card bought in the
--     same order is still active: it would give the money back and leave a
--     usable card. Staff cancel the card first. (Backend-recorded refunds, i.e.
--     money Stripe already returned, are never blocked.)
--   * record_external_refund(): a refund made directly in the Stripe dashboard
--     is recorded as the backend (pending, then succeeded so the effects
--     trigger fires), deduplicated on the Stripe refund id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Units of a line already refunded
-- -----------------------------------------------------------------------------
create or replace function private.refunded_units(p_order_item_id uuid, p_include_pending boolean default false)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(ri.quantity), 0)::integer
    from public.refund_items ri
    join public.refunds r on r.id = ri.refund_id
     and (r.status = 'succeeded' or (p_include_pending and r.status = 'pending'))
   where ri.order_item_id = p_order_item_id;
$$;

revoke all on function private.refunded_units(uuid, boolean) from public, anon;
grant execute on function private.refunded_units(uuid, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. A refunded unit is neither shipped nor waited for
-- -----------------------------------------------------------------------------
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
  v_refunded  integer;
begin
  select * into v_ship from public.shipments where id = new.shipment_id;
  select * into v_item from public.order_items where id = new.order_item_id for update;

  if v_item.order_id is distinct from v_ship.order_id then
    raise exception 'shipment_items: line belongs to another order' using errcode = '23514';
  end if;
  if v_item.course_id is not null then
    raise exception 'shipment_items: courses are not shipped' using errcode = '23514';
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
  -- Units being refunded (pending included: the refund may well succeed) are not for sale any more.
  v_refunded := private.refunded_units(new.order_item_id, true);
  if v_shipped + new.quantity > v_item.quantity - v_refunded then
    raise exception 'shipment_items: % of % units already allocated to parcels or refunded',
      v_shipped + v_refunded, v_item.quantity using errcode = '23514';
  end if;
  return new;
end;
$$;

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

  -- Per physical line: what is still to ship (ordered less refunded units) and how much of
  -- it left / arrived. Capped at the need, so a returned-and-refunded unit never counts twice.
  with lines as (
    select i.id, greatest(i.quantity - private.refunded_units(i.id), 0) as need
      from public.order_items i
      left join public.products p on p.id = i.product_id
     where i.order_id = p_order_id and i.course_id is null and coalesce(p.product_type, 'physical') = 'physical'
  ),
  per_line as (
    select l.need,
           coalesce(sum(si.quantity) filter (where s.status in ('shipped', 'delivered')), 0) as shipped,
           coalesce(sum(si.quantity) filter (where s.status = 'delivered'), 0) as delivered
      from lines l
      left join public.shipment_items si on si.order_item_id = l.id
      left join public.shipments s on s.id = si.shipment_id
     group by l.id, l.need
  )
  select coalesce(sum(need), 0), coalesce(sum(least(shipped, need)), 0), coalesce(sum(least(delivered, need)), 0)
    into v_to_ship, v_shipped, v_delivered
    from per_line;

  select coalesce(bool_or(s.status = 'preparing'), false) into v_preparing
    from public.shipments s where s.order_id = p_order_id;

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

-- Effects of a confirmed refund (unchanged from iteration 3) + the order's fulfilment
-- is recomputed, since refunded units are no longer to ship.
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

  perform private.sync_order_fulfillment(new.order_id);
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. The refund e-mail is for card refunds only
-- -----------------------------------------------------------------------------
create or replace function public.pending_refund_emails(p_limit integer default 25)
returns table (
  refund_id    uuid,
  order_id     uuid,
  order_number text,
  email        text,
  locale       text,
  first_name   text,
  amount       numeric,
  currency     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, o.id, o.order_number, o.customer_email, o.locale,
         coalesce(o.billing_address ->> 'first_name', ''), r.amount, r.currency::text
    from public.refunds r
    join public.payments p on p.id = r.payment_id and p.provider = 'stripe'
    join public.orders o on o.id = r.order_id
   where r.status = 'succeeded'
     and coalesce(r.processed_at, r.updated_at) >= now() - interval '7 days'
     and private.email_event_open('refund:' || r.id::text)
   order by coalesce(r.processed_at, r.updated_at)
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_refund_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_refund_emails(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 4. No refund while a gift card bought in the order is still usable
-- -----------------------------------------------------------------------------
create or replace function private.guard_refund_purchased_gift_cards()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_trusted_backend()
     and exists (select 1 from public.gift_cards g where g.order_id = new.order_id and g.state = 'active') then
    raise exception 'refunds: a gift card bought in this order is still active; cancel it first'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_refund_purchased_gift_cards() from public;

create trigger refunds_guard_zz_gift_cards
  before insert on public.refunds
  for each row execute function private.guard_refund_purchased_gift_cards();

-- -----------------------------------------------------------------------------
-- 5. Parcels, written atomically
-- -----------------------------------------------------------------------------
-- p_items: [{"order_item_id": uuid, "quantity": int}, ...] (at least one line).
-- p_status: 'preparing' (label being made) or 'shipped' (carrier + tracking number required).
create or replace function public.create_shipment(
  p_order_id           uuid,
  p_items              jsonb,
  p_carrier            text default null,
  p_service            text default null,
  p_tracking_number    text default null,
  p_tracking_url       text default null,
  p_estimated_delivery date default null,
  p_status             text default 'shipped'
)
returns public.shipments
language plpgsql
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_item     jsonb;
begin
  if not private.has_permission('manage_orders') then
    raise exception 'create_shipment: not allowed' using errcode = '42501';
  end if;
  if p_status not in ('preparing', 'shipped') then
    raise exception 'create_shipment: a parcel starts as preparing or shipped' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_shipment: at least one line is required' using errcode = '22023';
  end if;
  if p_status = 'shipped' and (nullif(btrim(p_carrier), '') is null or nullif(btrim(p_tracking_number), '') is null) then
    raise exception 'create_shipment: carrier and tracking number are required to ship' using errcode = '22023';
  end if;

  insert into public.shipments (order_id, status, carrier, service, tracking_number, tracking_url, estimated_delivery)
  values (p_order_id, 'preparing', p_carrier, nullif(btrim(p_service), ''), p_tracking_number,
          nullif(btrim(p_tracking_url), ''), p_estimated_delivery)
  returning * into v_shipment;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.shipment_items (shipment_id, order_item_id, quantity)
    values (v_shipment.id, (v_item ->> 'order_item_id')::uuid, (v_item ->> 'quantity')::integer);
  end loop;

  if p_status = 'shipped' then
    update public.shipments set status = 'shipped' where id = v_shipment.id returning * into v_shipment;
  end if;
  return v_shipment;
end;
$$;

-- Forward-only: preparing → shipped | cancelled; shipped → delivered | returned | lost; delivered → returned.
-- The same status again is allowed for preparing / shipped parcels and only corrects the details
-- (a typo in the tracking number): no second "on its way" e-mail, the sweep sends once per parcel.
create or replace function public.set_shipment_status(
  p_shipment_id        uuid,
  p_status             text,
  p_carrier            text default null,
  p_service            text default null,
  p_tracking_number    text default null,
  p_tracking_url       text default null,
  p_estimated_delivery date default null
)
returns public.shipments
language plpgsql
set search_path = ''
as $$
declare
  v_old public.shipments;
  v_new public.shipments;
  v_ok  boolean;
begin
  if not private.has_permission('manage_orders') then
    raise exception 'set_shipment_status: not allowed' using errcode = '42501';
  end if;

  select * into v_old from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'set_shipment_status: parcel not found' using errcode = 'P0002';
  end if;

  v_ok := case v_old.status
    when 'preparing' then p_status in ('preparing', 'shipped', 'cancelled')
    when 'shipped'   then p_status in ('shipped', 'delivered', 'returned', 'lost')
    when 'delivered' then p_status = 'returned'
    else false end;
  if not v_ok then
    raise exception 'set_shipment_status: % cannot become %', v_old.status, p_status using errcode = '23514';
  end if;
  if p_status in ('delivered', 'returned', 'lost') and (p_carrier is not null or p_tracking_number is not null
     or p_tracking_url is not null or p_service is not null or p_estimated_delivery is not null) then
    raise exception 'set_shipment_status: details can only change while the parcel is preparing or shipped'
      using errcode = '22023';
  end if;

  update public.shipments
     set status = p_status,
         carrier = coalesce(p_carrier, carrier),
         service = coalesce(nullif(btrim(p_service), ''), service),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         tracking_url = coalesce(nullif(btrim(p_tracking_url), ''), tracking_url),
         estimated_delivery = coalesce(p_estimated_delivery, estimated_delivery)
   where id = p_shipment_id
  returning * into v_new;
  return v_new;
end;
$$;

revoke all on function public.create_shipment(uuid, jsonb, text, text, text, text, date, text) from public, anon;
revoke all on function public.set_shipment_status(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.create_shipment(uuid, jsonb, text, text, text, text, date, text) to authenticated, service_role;
grant execute on function public.set_shipment_status(uuid, text, text, text, text, text, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. A refund made in the Stripe dashboard
-- -----------------------------------------------------------------------------
-- Backend only (stripe-webhook). Idempotent on the Stripe refund id. The row is
-- inserted pending and then updated: the effects trigger fires on UPDATE only.
create or replace function public.record_external_refund(
  p_provider_payment_id text,
  p_provider_refund_id  text,
  p_amount              numeric,
  p_currency            text
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_refund  public.refunds;
begin
  if not private.is_trusted_backend() then
    raise exception 'record_external_refund: not allowed' using errcode = '42501';
  end if;

  select * into v_refund from public.refunds where provider_refund_id = p_provider_refund_id;
  if not found then
    select * into v_payment from public.payments where provider_payment_id = p_provider_payment_id;
    if not found then
      raise exception 'record_external_refund: unknown payment' using errcode = 'P0002';
    end if;
    if upper(p_currency) <> v_payment.currency then
      raise exception 'record_external_refund: currency mismatch' using errcode = '23514';
    end if;
    begin
      insert into public.refunds (order_id, payment_id, amount, currency, reason, provider_refund_id)
      values (v_payment.order_id, v_payment.id, p_amount, v_payment.currency, 'other', p_provider_refund_id)
      returning * into v_refund;
    exception when unique_violation then
      select * into v_refund from public.refunds where provider_refund_id = p_provider_refund_id;
    end;
  end if;

  if v_refund.status = 'pending' then
    update public.refunds set status = 'succeeded' where id = v_refund.id returning * into v_refund;
  end if;
  return v_refund;
end;
$$;

revoke all on function public.record_external_refund(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.record_external_refund(text, text, numeric, text) to service_role;
