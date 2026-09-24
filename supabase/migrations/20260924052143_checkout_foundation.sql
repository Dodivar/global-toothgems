-- =============================================================================
-- Migration 009 — Checkout foundation (iteration 2)
-- =============================================================================
-- Adds what a real checkout needs, without the Stripe API code itself:
--   * inventory_movements: append-only stock ledger, written by trigger for
--     EVERY stock change (admin edits, reservations, sales, releases);
--   * stock reservation on orders (orders.stock_state + expires_at);
--   * stripe_webhook_events: idempotency / deduplication of webhook deliveries;
--   * server-only functions:
--       create_order()        prices, shipping and VAT computed from the database
--       mark_order_paid()     called by the verified Stripe webhook
--       cancel_order()        admin or backend
--       expire_stale_orders() scheduled job, releases abandoned reservations
--   * a trigger on orders that applies stock transitions whatever the path:
--       payment_status -> 'paid'       reserved stock becomes a sale
--       status -> 'cancelled' (unpaid) reservation is released
--
-- Flow (Stripe Checkout):
--   1. server: create_order(...)                -> order 'pending', stock reserved
--   2. server: create Stripe Checkout Session with the order's amounts
--   3. webhook checkout.session.completed      -> mark_order_paid(...)
--   4. webhook checkout.session.expired / cron -> cancel_order / expire_stale_orders
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Order and order item columns
-- -----------------------------------------------------------------------------
alter table public.orders
  add column locale               text not null default 'fr' references public.languages (code) on update cascade,
  add column shipping_rate_id     uuid references public.shipping_rates (id) on delete set null,
  add column shipping_method_name text,
  add column tax_country_code     char(2) check (tax_country_code ~ '^[A-Z]{2}$'),
  add column stock_state          text not null default 'none'
                                  check (stock_state in ('none', 'reserved', 'committed', 'released')),
  add column expires_at           timestamptz,
  add column paid_at              timestamptz,
  add column cancelled_at         timestamptz,
  add column cancellation_reason  text check (char_length(cancellation_reason) <= 500);

comment on column public.orders.locale is 'Language the customer ordered in (emails, invoices). Independent of currency, tax and shipping.';
comment on column public.orders.stock_state is 'none = nothing to reserve, reserved = held for payment, committed = sold, released = reservation returned.';
comment on column public.orders.expires_at is 'Unpaid orders past this time are cancelled by expire_stale_orders() and their stock released.';

create index orders_pending_expiry_idx on public.orders (expires_at)
  where status = 'pending' and payment_status in ('pending', 'failed');
create index orders_shipping_rate_idx on public.orders (shipping_rate_id) where shipping_rate_id is not null;

alter table public.order_items
  add column inventory_item_id uuid references public.inventory_items (id) on delete set null,
  add column tax_rate_bp       integer not null default 0 check (tax_rate_bp between 0 and 10000),
  add column tax_amount        numeric(12, 2) not null default 0 check (tax_amount >= 0);

comment on column public.order_items.tax_amount is 'VAT contained in subtotal_amount (prices include VAT), at tax_rate_bp.';

create index order_items_inventory_idx on public.order_items (inventory_item_id) where inventory_item_id is not null;

-- -----------------------------------------------------------------------------
-- Inventory ledger
-- -----------------------------------------------------------------------------
create table public.inventory_movements (
  id                 bigint generated always as identity primary key,
  inventory_item_id  uuid not null references public.inventory_items (id) on delete cascade,
  order_id           uuid references public.orders (id) on delete set null,
  movement_type      text not null
                     check (movement_type in ('initial', 'adjustment', 'reservation', 'release', 'sale', 'return')),
  on_hand_delta      integer not null,
  reserved_delta     integer not null,
  on_hand_after      integer not null,
  reserved_after     integer not null,
  actor_id           uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

comment on table public.inventory_movements is
  'Append-only stock ledger, written only by trigger. Explains every change of quantity_on_hand / quantity_reserved.';

create index inventory_movements_item_idx on public.inventory_movements (inventory_item_id, created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id) where order_id is not null;

alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from anon;
revoke insert, update, delete, truncate, references, trigger on public.inventory_movements from authenticated;

create policy "inventory_movements: admins read"
  on public.inventory_movements for select to authenticated
  using ((select private.is_admin()));

-- Movement context is passed through transaction-local settings by the
-- checkout functions; anything else (admin edits) is an 'adjustment'.
create or replace function private.set_inventory_context(p_movement text, p_order_id uuid)
returns void
language sql
set search_path = ''
as $$
  select set_config('app.inventory_movement', coalesce(p_movement, ''), true),
         set_config('app.inventory_order_id', coalesce(p_order_id::text, ''), true);
$$;

create or replace function private.record_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type     text := nullif(current_setting('app.inventory_movement', true), '');
  v_order_id uuid := nullif(current_setting('app.inventory_order_id', true), '')::uuid;
  v_on_hand_delta  integer;
  v_reserved_delta integer;
begin
  if tg_op = 'INSERT' then
    v_on_hand_delta  := new.quantity_on_hand;
    v_reserved_delta := new.quantity_reserved;
    v_type := 'initial';
  else
    v_on_hand_delta  := new.quantity_on_hand - old.quantity_on_hand;
    v_reserved_delta := new.quantity_reserved - old.quantity_reserved;
    if v_on_hand_delta = 0 and v_reserved_delta = 0 then
      return null;
    end if;
    if v_type is null or v_type not in ('reservation', 'release', 'sale', 'return') then
      v_type := 'adjustment';
      v_order_id := null;
    end if;
  end if;

  insert into public.inventory_movements
    (inventory_item_id, order_id, movement_type, on_hand_delta, reserved_delta,
     on_hand_after, reserved_after, actor_id)
  values
    (new.id, v_order_id, v_type, v_on_hand_delta, v_reserved_delta,
     new.quantity_on_hand, new.quantity_reserved, auth.uid());
  return null;
end;
$$;

create trigger inventory_items_ledger
  after insert or update of quantity_on_hand, quantity_reserved on public.inventory_items
  for each row execute function private.record_inventory_movement();

-- Backfill: seeded stock gets its 'initial' movement.
insert into public.inventory_movements
  (inventory_item_id, movement_type, on_hand_delta, reserved_delta, on_hand_after, reserved_after)
select id, 'initial', quantity_on_hand, quantity_reserved, quantity_on_hand, quantity_reserved
from public.inventory_items;

-- consume_inventory (iteration 1) now records a 'sale' movement.
create or replace function public.consume_inventory(p_inventory_item_id uuid, p_quantity integer)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  result public.inventory_items;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'consume_inventory: quantity must be positive' using errcode = '22023';
  end if;

  perform private.set_inventory_context('sale', null);

  update public.inventory_items
     set quantity_on_hand = case when track_inventory
                                 then quantity_on_hand - p_quantity
                                 else quantity_on_hand end
   where id = p_inventory_item_id
     and case when track_inventory
              then quantity_on_hand - quantity_reserved >= p_quantity
              else availability <> 'out_of_stock' end
  returning * into result;

  perform private.set_inventory_context(null, null);

  if not found then
    if exists (select 1 from public.inventory_items where id = p_inventory_item_id) then
      raise exception 'consume_inventory: insufficient stock' using errcode = 'P0001';
    else
      raise exception 'consume_inventory: inventory item not found' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stripe webhook idempotency
-- -----------------------------------------------------------------------------
create table public.stripe_webhook_events (
  id           text primary key check (id ~ '^evt_[A-Za-z0-9_]+$'),   -- Stripe event id
  type         text not null check (char_length(type) <= 100),
  livemode     boolean not null default false,
  object_id    text check (char_length(object_id) <= 255),            -- cs_..., pi_..., ch_...
  order_id     uuid references public.orders (id) on delete set null,
  status       text not null default 'received'
               check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts     integer not null default 1 check (attempts > 0),
  error        text check (char_length(error) <= 2000),
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.stripe_webhook_events is
  'One row per Stripe event id. Handler: INSERT ... ON CONFLICT (id) DO UPDATE SET attempts = attempts + 1 RETURNING status; skip when already processed. No payload is stored (it may contain personal data).';

create index stripe_webhook_events_order_idx on public.stripe_webhook_events (order_id) where order_id is not null;
create index stripe_webhook_events_status_idx on public.stripe_webhook_events (status, received_at desc);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.stripe_webhook_events from authenticated;

create policy "stripe_webhook_events: admins read"
  on public.stripe_webhook_events for select to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Order guard (replaces iteration 1): new snapshot/lifecycle columns are
-- immutable for staff too, and a paid order cannot be cancelled without a
-- refund flow (trusted backend only).
-- -----------------------------------------------------------------------------
create or replace function private.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if private.is_trusted_backend() then
    return new;
  end if;

  if new.order_number         is distinct from old.order_number
  or new.user_id              is distinct from old.user_id
  or new.customer_email       is distinct from old.customer_email
  or new.billing_address      is distinct from old.billing_address
  or new.shipping_address     is distinct from old.shipping_address
  or new.currency             is distinct from old.currency
  or new.subtotal_amount      is distinct from old.subtotal_amount
  or new.discount_amount      is distinct from old.discount_amount
  or new.shipping_amount      is distinct from old.shipping_amount
  or new.tax_amount           is distinct from old.tax_amount
  or new.total_amount         is distinct from old.total_amount
  or new.prices_include_tax   is distinct from old.prices_include_tax
  or new.customer_note        is distinct from old.customer_note
  or new.locale               is distinct from old.locale
  or new.shipping_rate_id     is distinct from old.shipping_rate_id
  or new.shipping_method_name is distinct from old.shipping_method_name
  or new.tax_country_code     is distinct from old.tax_country_code
  or new.stock_state          is distinct from old.stock_state
  or new.expires_at           is distinct from old.expires_at
  or new.paid_at              is distinct from old.paid_at
  or new.cancelled_at         is distinct from old.cancelled_at
  or new.created_at           is distinct from old.created_at then
    raise exception 'orders: amounts, snapshots and lifecycle timestamps are immutable'
      using errcode = '42501';
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled'
     and old.payment_status in ('paid', 'partially_refunded') then
    raise exception 'orders: a paid order must be refunded before it can be cancelled'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stock transitions, applied whatever path changed the order.
-- Runs after orders_guard_update (triggers fire in name order).
-- -----------------------------------------------------------------------------
create or replace function private.apply_order_stock_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_short boolean := false;
begin
  -- Payment received -------------------------------------------------------
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());

    if old.stock_state = 'reserved' then
      perform private.set_inventory_context('sale', new.id);
      for v_item in
        select i.inventory_item_id, sum(i.quantity)::integer as qty
          from public.order_items i
          join public.inventory_items inv on inv.id = i.inventory_item_id and inv.track_inventory
         where i.order_id = new.id
         group by i.inventory_item_id
      loop
        update public.inventory_items
           set quantity_on_hand  = quantity_on_hand - v_item.qty,
               quantity_reserved = quantity_reserved - v_item.qty
         where id = v_item.inventory_item_id;
      end loop;
      new.stock_state := 'committed';

    elsif old.stock_state = 'released' then
      -- Paid after the reservation expired: take the stock again if it is
      -- still there, otherwise flag the order for the team (never oversell).
      begin
        perform private.set_inventory_context('sale', new.id);
        for v_item in
          select i.inventory_item_id, sum(i.quantity)::integer as qty
            from public.order_items i
            join public.inventory_items inv on inv.id = i.inventory_item_id and inv.track_inventory
           where i.order_id = new.id
           group by i.inventory_item_id
        loop
          update public.inventory_items
             set quantity_on_hand = quantity_on_hand - v_item.qty
           where id = v_item.inventory_item_id
             and quantity_on_hand - quantity_reserved >= v_item.qty;
          if not found then
            raise exception 'short' using errcode = 'P0001';
          end if;
        end loop;
        new.stock_state := 'committed';
      exception when raise_exception then
        v_short := true;   -- partial decrements rolled back with the sub-block
      end;

      if v_short then
        new.status := 'pending';
        new.admin_note := concat_ws(E'\n', new.admin_note,
          '[auto] Paiement reçu après expiration de la réservation : stock insuffisant. Réapprovisionner ou rembourser.');
      else
        new.status := case when new.status = 'cancelled' then 'confirmed' else new.status end;
        new.cancelled_at := null;
      end if;
    end if;

    if new.status = 'pending' and not v_short then
      new.status := 'confirmed';
    end if;
  end if;

  -- Cancellation of an unpaid order ----------------------------------------
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    if new.stock_state = 'reserved' then
      perform private.set_inventory_context('release', new.id);
      for v_item in
        select i.inventory_item_id, sum(i.quantity)::integer as qty
          from public.order_items i
          join public.inventory_items inv on inv.id = i.inventory_item_id and inv.track_inventory
         where i.order_id = new.id
         group by i.inventory_item_id
      loop
        update public.inventory_items
           set quantity_reserved = quantity_reserved - v_item.qty
         where id = v_item.inventory_item_id;
      end loop;
      new.stock_state := 'released';
    end if;
  end if;

  perform private.set_inventory_context(null, null);
  return new;
end;
$$;

create trigger orders_stock_transitions
  before update of status, payment_status on public.orders
  for each row execute function private.apply_order_stock_transitions();

-- -----------------------------------------------------------------------------
-- create_order: the ONLY way orders should be created.
-- p_items: [{"product_id": uuid, "variant_id": uuid|null, "quantity": int}, ...]
-- Prices, shipping and VAT come from the database, never from the client.
-- Service role only (called by the checkout server route before Stripe).
-- -----------------------------------------------------------------------------
create or replace function public.create_order(
  p_user_id              uuid,
  p_customer_email       text,
  p_items                jsonb,
  p_billing_address      jsonb,
  p_shipping_address     jsonb default null,
  p_shipping_rate_id     uuid default null,
  p_currency             text default 'EUR',
  p_locale               text default 'fr',
  p_customer_note        text default null,
  p_reservation_minutes  integer default 60
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_item           jsonb;
  v_qty            integer;
  v_product        public.products;
  v_variant        public.product_variants;
  v_inventory      public.inventory_items;
  v_lines          jsonb := '[]'::jsonb;
  v_line           jsonb;
  v_subtotal       numeric(12, 2) := 0;
  v_weight         integer := 0;
  v_needs_shipping boolean := false;
  v_rate           public.shipping_rates;
  v_shipping       numeric(12, 2) := 0;
  v_tax_country    text;
  v_rate_bp        integer;
  v_line_total     numeric(12, 2);
  v_tax_total      numeric(12, 2) := 0;
  v_has_reservation boolean := false;
  v_order          public.orders;
begin
  -- Input validation ---------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'create_order: items must be a non-empty array (max 100)' using errcode = '22023';
  end if;
  if p_reservation_minutes is null or p_reservation_minutes not between 5 and 1440 then
    raise exception 'create_order: reservation must last 5 to 1440 minutes' using errcode = '22023';
  end if;
  p_currency := upper(p_currency);
  if not exists (select 1 from public.languages l where l.code = p_locale and l.is_enabled) then
    raise exception 'create_order: unsupported locale %', p_locale using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (
       select 1 from public.profiles pr where pr.id = p_user_id and pr.status = 'active') then
    raise exception 'create_order: customer account is not active' using errcode = '42501';
  end if;

  -- Resolve every line from the catalogue ------------------------------------
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then
      raise exception 'create_order: invalid quantity' using errcode = '22023';
    end if;

    select * into v_product from public.products
     where id = (v_item ->> 'product_id')::uuid and status = 'active';
    if not found then
      raise exception 'create_order: product % is not available', v_item ->> 'product_id' using errcode = 'P0002';
    end if;
    if v_product.currency <> p_currency then
      raise exception 'create_order: product % is not sold in %', v_product.slug, p_currency using errcode = '22023';
    end if;

    v_variant := null;
    if nullif(v_item ->> 'variant_id', '') is not null then
      select * into v_variant from public.product_variants
       where id = (v_item ->> 'variant_id')::uuid and product_id = v_product.id and is_active;
      if not found then
        raise exception 'create_order: variant % is not available', v_item ->> 'variant_id' using errcode = 'P0002';
      end if;
    elsif exists (select 1 from public.product_variants pv where pv.product_id = v_product.id and pv.is_active) then
      raise exception 'create_order: product % requires a variant', v_product.slug using errcode = '22023';
    end if;

    if v_lines @> jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'variant_id', v_variant.id)) then
      raise exception 'create_order: duplicate line for %', v_product.slug using errcode = '22023';
    end if;

    if v_variant.id is not null then
      select * into v_inventory from public.inventory_items where variant_id = v_variant.id;
    else
      select * into v_inventory from public.inventory_items where product_id = v_product.id;
    end if;
    if v_inventory.id is null and v_product.product_type = 'physical' then
      raise exception 'create_order: % has no inventory record', v_product.slug using errcode = 'P0002';
    end if;

    v_line_total := coalesce(v_variant.price, v_product.price) * v_qty;
    v_subtotal := v_subtotal + v_line_total;
    v_weight := v_weight + coalesce(v_variant.weight_grams, v_product.weight_grams, 0) * v_qty;
    v_needs_shipping := v_needs_shipping or v_product.product_type = 'physical';

    v_lines := v_lines || jsonb_build_object(
      'product_id',        v_product.id,
      'variant_id',        v_variant.id,
      'product_name',      v_product.name,
      'variant_name',      v_variant.name,
      'sku',               coalesce(v_variant.sku, v_product.sku),
      'unit_price',        coalesce(v_variant.price, v_product.price),
      'quantity',          v_qty,
      'line_total',        v_line_total,
      'tax_category',      v_product.tax_category,
      'inventory_item_id', v_inventory.id);
  end loop;

  -- Shipping -----------------------------------------------------------------
  if v_needs_shipping then
    if p_shipping_address is null or p_shipping_rate_id is null then
      raise exception 'create_order: shipping address and rate are required' using errcode = '22023';
    end if;
    select r.* into v_rate
      from public.shipping_rates r
      join public.shipping_zones z on z.id = r.zone_id and z.is_active
     where r.id = p_shipping_rate_id
       and r.is_active
       and z.id = public.shipping_zone_for_country(p_shipping_address ->> 'country_code');
    if not found then
      raise exception 'create_order: shipping rate not available for this destination' using errcode = 'P0002';
    end if;
    if v_rate.currency <> p_currency
       or (v_rate.min_order_amount is not null and v_subtotal < v_rate.min_order_amount)
       or (v_rate.max_order_amount is not null and v_subtotal > v_rate.max_order_amount)
       or (v_rate.min_weight_grams is not null and v_weight < v_rate.min_weight_grams)
       or (v_rate.max_weight_grams is not null and v_weight > v_rate.max_weight_grams) then
      raise exception 'create_order: shipping rate not applicable to this basket' using errcode = '22023';
    end if;
    v_shipping := case when v_rate.free_over_amount is not null and v_subtotal >= v_rate.free_over_amount
                       then 0 else v_rate.price end;
    v_tax_country := upper(p_shipping_address ->> 'country_code');
  else
    p_shipping_address := null;      -- digital-only order: no delivery
    p_shipping_rate_id := null;
    v_tax_country := upper(p_billing_address ->> 'country_code');
  end if;

  -- VAT (prices include VAT; rounded per line, shipping taxed at the standard rate)
  select coalesce(jsonb_agg(l || jsonb_build_object(
           'tax_rate_bp', public.vat_rate_bp(v_tax_country, l ->> 'tax_category'),
           'tax_amount',  public.vat_included((l ->> 'line_total')::numeric,
                                              public.vat_rate_bp(v_tax_country, l ->> 'tax_category')))
                   order by n), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(v_lines) with ordinality as t(l, n);

  select coalesce(sum((l ->> 'tax_amount')::numeric), 0) into v_tax_total from jsonb_array_elements(v_lines) l;
  v_rate_bp := public.vat_rate_bp(v_tax_country, 'standard');
  v_tax_total := v_tax_total + public.vat_included(v_shipping, v_rate_bp);

  -- Persist ------------------------------------------------------------------
  insert into public.orders
    (user_id, customer_email, billing_address, shipping_address, currency,
     subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, prices_include_tax,
     locale, shipping_rate_id, shipping_method_name, tax_country_code,
     customer_note, expires_at)
  values
    (p_user_id, lower(trim(p_customer_email)), p_billing_address, p_shipping_address, p_currency,
     v_subtotal, 0, v_shipping, v_tax_total, v_subtotal + v_shipping, true,
     p_locale, p_shipping_rate_id, v_rate.name, v_tax_country,
     nullif(trim(p_customer_note), ''), now() + make_interval(mins => p_reservation_minutes))
  returning * into v_order;

  perform private.set_inventory_context('reservation', v_order.id);

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items
      (order_id, product_id, variant_id, product_name, variant_name, sku,
       unit_price, quantity, inventory_item_id, tax_rate_bp, tax_amount)
    values
      (v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid,
       v_line ->> 'product_name', v_line ->> 'variant_name', v_line ->> 'sku',
       (v_line ->> 'unit_price')::numeric, (v_line ->> 'quantity')::integer,
       (v_line ->> 'inventory_item_id')::uuid, (v_line ->> 'tax_rate_bp')::integer,
       (v_line ->> 'tax_amount')::numeric);

    if v_line ->> 'inventory_item_id' is not null then
      select * into v_inventory from public.inventory_items
       where id = (v_line ->> 'inventory_item_id')::uuid;

      if v_inventory.track_inventory then
        update public.inventory_items
           set quantity_reserved = quantity_reserved + (v_line ->> 'quantity')::integer
         where id = v_inventory.id
           and quantity_on_hand - quantity_reserved >= (v_line ->> 'quantity')::integer;
        if not found then
          raise exception 'create_order: insufficient stock for %', v_line ->> 'product_name'
            using errcode = 'P0001';
        end if;
        v_has_reservation := true;
      elsif v_inventory.availability = 'out_of_stock' then
        raise exception 'create_order: % is out of stock', v_line ->> 'product_name' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  perform private.set_inventory_context(null, null);

  if v_has_reservation then
    update public.orders set stock_state = 'reserved' where id = v_order.id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- mark_order_paid: called by the verified Stripe webhook. Idempotent.
-- -----------------------------------------------------------------------------
create or replace function public.mark_order_paid(
  p_order_id             uuid,
  p_amount               numeric,
  p_currency             text,
  p_provider_checkout_id text default null,
  p_provider_payment_id  text default null,
  p_payment_method_type  text default null,
  p_card_brand           text default null,
  p_card_last4           text default null
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_provider_checkout_id is null and p_provider_payment_id is null then
    raise exception 'mark_order_paid: a provider reference is required' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'mark_order_paid: order not found' using errcode = 'P0002';
  end if;
  if v_order.payment_status = 'paid' then
    return v_order;                                   -- duplicate webhook delivery
  end if;
  if p_amount <> v_order.total_amount or upper(p_currency) <> v_order.currency then
    raise exception 'mark_order_paid: paid % % does not match order total % %',
      p_amount, upper(p_currency), v_order.total_amount, v_order.currency using errcode = '22023';
  end if;

  update public.payments
     set status = 'succeeded',
         provider_checkout_id = coalesce(p_provider_checkout_id, provider_checkout_id),
         provider_payment_id  = coalesce(p_provider_payment_id, provider_payment_id),
         amount = p_amount, currency = upper(p_currency),
         payment_method_type = coalesce(p_payment_method_type, payment_method_type),
         card_brand = coalesce(p_card_brand, card_brand),
         card_last4 = coalesce(p_card_last4, card_last4),
         failure_reason = null
   where order_id = p_order_id
     and (provider_checkout_id = p_provider_checkout_id or provider_payment_id = p_provider_payment_id);
  if not found then
    insert into public.payments
      (order_id, provider_checkout_id, provider_payment_id, status, amount, currency,
       payment_method_type, card_brand, card_last4)
    values
      (p_order_id, p_provider_checkout_id, p_provider_payment_id, 'succeeded', p_amount, upper(p_currency),
       p_payment_method_type, p_card_brand, p_card_last4);
  end if;

  update public.orders set payment_status = 'paid' where id = p_order_id
  returning * into v_order;                           -- stock committed by trigger
  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_order: admins (via RPC) or the backend. Unpaid orders only; the
-- reservation is released by the stock-transition trigger. Idempotent.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not (private.is_trusted_backend() or private.is_admin()) then
    raise exception 'cancel_order: not allowed' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'cancel_order: order not found' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    return v_order;
  end if;

  update public.orders
     set status = 'cancelled',
         cancellation_reason = left(coalesce(nullif(trim(p_reason), ''), cancellation_reason), 500)
   where id = p_order_id
  returning * into v_order;
  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- expire_stale_orders: run every few minutes (pg_cron or a scheduled server
-- job). Cancels unpaid orders whose reservation expired.
-- -----------------------------------------------------------------------------
create or replace function public.expire_stale_orders()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.orders
     set status = 'cancelled', cancellation_reason = 'expired'
   where status = 'pending'
     and payment_status in ('pending', 'failed')
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execution rights
-- -----------------------------------------------------------------------------
revoke all on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, numeric, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function private.set_inventory_context(text, uuid) from public;

grant execute on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer) to service_role;
grant execute on function public.mark_order_paid(uuid, numeric, text, text, text, text, text, text) to service_role;
grant execute on function public.expire_stale_orders() to service_role;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;
grant execute on function private.set_inventory_context(text, uuid) to authenticated, service_role;
