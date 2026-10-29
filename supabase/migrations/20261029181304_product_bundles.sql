-- =============================================================================
-- Product bundles: kits and packs whose stock is their components' (decision 117)
-- =============================================================================
-- Owner's request (2026-10-28): "the lip gloss trio is sold beside the three
-- glosses; selling a trio must take one of each, and selling 5 of one gloss
-- must take 5 trios away. Later the same for the professional and DIY kits.
-- Stock is managed on the single products only; they drive the kits."
--
-- Model
--   * product_bundle_items: a product is a KIT as soon as it has rows here —
--     each row is a component (a product, or one option of it) and how many of
--     it one kit holds. No nesting (a kit is never a component), a kit has no
--     options, components are physical products of any status (a draft product
--     can hold the stock of a part that is never sold alone). Written only by
--     admin_save_product_bundle() (manage_products), read like the products.
--   * A kit keeps its inventory_items row, but the database owns it: on hand =
--     how many kits the components' sellable stock (on hand − reserved) can
--     make, reserved = 0, tracked when a component is. Every reader of a
--     product's stock (storefront badge, back-in-stock alerts, recommendations,
--     statistics, back office) therefore keeps working unchanged. Anything else
--     writing those columns of a kit row is refused (22023, hint 'bundle'), and
--     the ledger records no movement on it: the movements are on the components.
--   * The row is refreshed by a DEFERRED constraint trigger on the components'
--     stock rows, i.e. at commit, under one transaction-level advisory lock and
--     with a fresh snapshot: concurrent sales of a kit and of its components
--     cannot deadlock on the kit row nor leave it stale. It is a display value;
--     what protects against overselling is the conditional reservation of each
--     component in create_order().
--   * create_order() reserves a kit line's components (quantity × units per
--     kit) and snapshots the composition in order_item_components; payment,
--     expiry/cancellation and refunds with restock move the snapshot's units
--     (private.order_stock_lines / private.refund_stock_lines). A line of a
--     product that became a kit after the order (no snapshot) is expanded with
--     the kit's current composition.
--   * Turning a product into a kit is refused while unpaid orders hold units of
--     its own stock row; its own count is replaced by the derived one. Turning
--     a kit back into a product leaves it at 0 units, to restock.
--   * The daily stock digest lists the components, not the kits.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Composition
-- -----------------------------------------------------------------------------
create table public.product_bundle_items (
  id                   uuid primary key default gen_random_uuid(),
  bundle_product_id    uuid not null references public.products (id) on delete cascade,
  component_product_id uuid not null references public.products (id) on delete restrict,
  component_variant_id uuid references public.product_variants (id) on delete restrict,
  quantity             integer not null check (quantity between 1 and 1000),
  position             integer not null default 0 check (position >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null,
  constraint product_bundle_items_not_itself check (component_product_id <> bundle_product_id),
  constraint product_bundle_items_unique unique nulls not distinct
    (bundle_product_id, component_product_id, component_variant_id)
);

comment on table public.product_bundle_items is
  'Kit composition (decision 117): a product with rows here is a kit whose stock is derived from these components. Written only by admin_save_product_bundle().';
comment on column public.product_bundle_items.component_variant_id is
  'The option of the component product the kit holds; null = the product itself (a product without active options).';
comment on column public.product_bundle_items.quantity is 'Units of the component in ONE kit.';

create index product_bundle_items_bundle_idx on public.product_bundle_items (bundle_product_id, position);
create index product_bundle_items_component_idx on public.product_bundle_items (component_product_id);
create index product_bundle_items_variant_idx on public.product_bundle_items (component_variant_id)
  where component_variant_id is not null;

alter table public.product_bundle_items enable row level security;
revoke all on public.product_bundle_items from anon, authenticated;
grant select on public.product_bundle_items to anon, authenticated;

-- What a visitor may read: the contents of an active kit (the components'
-- own rows stay subject to the products policy).
create policy "product_bundle_items: public reads active kits, staff read all"
  on public.product_bundle_items for select to anon, authenticated
  using (
    exists (select 1 from public.products p
             where p.id = product_bundle_items.bundle_product_id and p.status = 'active')
    or (select private.is_staff())
  );

create trigger product_bundle_items_audit
  before insert or update on public.product_bundle_items
  for each row execute function private.set_audit_columns();
create trigger product_bundle_items_audit_log
  after insert or update or delete on public.product_bundle_items
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 2. What an order took for a kit line
-- -----------------------------------------------------------------------------
create table public.order_item_components (
  id                bigint generated always as identity primary key,
  order_item_id     uuid not null references public.order_items (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  product_id        uuid references public.products (id) on delete set null,
  variant_id        uuid references public.product_variants (id) on delete set null,
  product_name      text not null,
  variant_name      text,
  quantity          integer not null check (quantity > 0),
  created_at        timestamptz not null default now()
);

comment on table public.order_item_components is
  'Composition of a kit line at checkout (decision 117): the stock rows the line reserved, quantity per kit. Written only by create_order(); payment, expiry and refunds move these units.';

create index order_item_components_item_idx on public.order_item_components (order_item_id);
create index order_item_components_inventory_idx on public.order_item_components (inventory_item_id)
  where inventory_item_id is not null;
create index order_item_components_product_idx on public.order_item_components (product_id)
  where product_id is not null;
create index order_item_components_variant_idx on public.order_item_components (variant_id)
  where variant_id is not null;

alter table public.order_item_components enable row level security;
revoke all on public.order_item_components from anon, authenticated;
grant select on public.order_item_components to authenticated;

create policy "order_item_components: owners and staff read"
  on public.order_item_components for select to authenticated
  using (
    exists (select 1
              from public.order_items i
              join public.orders o on o.id = i.order_id
             where i.id = order_item_components.order_item_id
               and o.user_id = (select auth.uid()))
    or (select private.is_staff())
  );

-- -----------------------------------------------------------------------------
-- 3. Helpers
-- -----------------------------------------------------------------------------
create or replace function private.is_bundle(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_product_id is not null
     and exists (select 1 from public.product_bundle_items b where b.bundle_product_id = p_product_id);
$$;

-- One row per component, in the kit's order, with its stock row (null when
-- the component has none, which makes the kit unavailable).
create or replace function private.bundle_components(p_bundle_product_id uuid)
returns table (
  inventory_item_id uuid,
  product_id        uuid,
  variant_id        uuid,
  product_name      text,
  variant_name      text,
  quantity          integer,
  track_inventory   boolean,
  availability      text,
  available         integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, b.component_product_id, b.component_variant_id, p.name, v.name, b.quantity,
         i.track_inventory, i.availability, i.quantity_on_hand - i.quantity_reserved
    from public.product_bundle_items b
    join public.products p on p.id = b.component_product_id
    left join public.product_variants v on v.id = b.component_variant_id
    left join public.inventory_items i
      on (b.component_variant_id is not null and i.variant_id = b.component_variant_id)
      or (b.component_variant_id is null and i.product_id = b.component_product_id)
   where b.bundle_product_id = p_bundle_product_id
   order by b.position, p.name;
$$;

-- Recomputes a kit's derived stock row. Serialised by one advisory lock, then
-- read in a NEW statement, so the value includes every committed sale.
create or replace function private.refresh_bundle_stock(p_bundle_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count     integer;
  v_buildable integer;
  v_tracked   boolean;
  v_out       boolean;
begin
  perform pg_advisory_xact_lock(hashtext('product_bundle_stock'));

  select count(*),
         min(case when c.inventory_item_id is null then 0
                  when c.track_inventory then greatest(c.available, 0) / c.quantity
                  when c.availability = 'out_of_stock' then 0 end),
         coalesce(bool_or(c.track_inventory), false),
         coalesce(bool_or(c.inventory_item_id is null or (not c.track_inventory and c.availability = 'out_of_stock')), false)
    into v_count, v_buildable, v_tracked, v_out
    from private.bundle_components(p_bundle_product_id) c;

  if v_count = 0 then
    return;   -- not a kit (any more)
  end if;

  perform set_config('app.bundle_refresh', 'on', true);
  update public.inventory_items
     set quantity_on_hand  = case when v_tracked then coalesce(v_buildable, 0) else 0 end,
         quantity_reserved = 0,
         track_inventory   = v_tracked,
         availability      = case when v_out then 'out_of_stock' else 'in_stock' end
   where product_id = p_bundle_product_id
     and (quantity_on_hand, quantity_reserved, track_inventory, availability)
         is distinct from (case when v_tracked then coalesce(v_buildable, 0) else 0 end, 0, v_tracked,
                           case when v_out then 'out_of_stock' else 'in_stock' end);
  perform set_config('app.bundle_refresh', '', true);
end;
$$;

revoke all on function private.is_bundle(uuid) from public, anon, authenticated;
revoke all on function private.bundle_components(uuid) from public, anon, authenticated;
revoke all on function private.refresh_bundle_stock(uuid) from public, anon, authenticated;
grant execute on function private.is_bundle(uuid) to service_role;
grant execute on function private.bundle_components(uuid) to service_role;

-- Stock rows an order moves: a kit line's snapshot, else the line's own row
-- (a line of a product that became a kit later: its current composition).
-- Untracked rows are left out, as before.
create or replace function private.order_stock_lines(p_order_id uuid)
returns table (inventory_item_id uuid, quantity integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.inventory_item_id, sum(x.quantity)::integer
    from (
      select c.inventory_item_id, i.quantity * c.quantity as quantity
        from public.order_items i
        join public.order_item_components c on c.order_item_id = i.id
       where i.order_id = p_order_id
      union all
      select case when bc.product_id is null then i.inventory_item_id else bc.inventory_item_id end,
             i.quantity * coalesce(bc.quantity, 1)
        from public.order_items i
        join public.inventory_items own on own.id = i.inventory_item_id
        left join lateral private.bundle_components(own.product_id) bc on own.product_id is not null
       where i.order_id = p_order_id
         and not exists (select 1 from public.order_item_components c where c.order_item_id = i.id)
    ) x
    join public.inventory_items inv on inv.id = x.inventory_item_id and inv.track_inventory
   group by x.inventory_item_id;
$$;

create or replace function private.refund_stock_lines(p_refund_id uuid)
returns table (inventory_item_id uuid, quantity integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.inventory_item_id, sum(x.quantity)::integer
    from (
      select c.inventory_item_id, ri.quantity * c.quantity as quantity
        from public.refund_items ri
        join public.order_item_components c on c.order_item_id = ri.order_item_id
       where ri.refund_id = p_refund_id
      union all
      select case when bc.product_id is null then i.inventory_item_id else bc.inventory_item_id end,
             ri.quantity * coalesce(bc.quantity, 1)
        from public.refund_items ri
        join public.order_items i on i.id = ri.order_item_id
        join public.inventory_items own on own.id = i.inventory_item_id
        left join lateral private.bundle_components(own.product_id) bc on own.product_id is not null
       where ri.refund_id = p_refund_id
         and not exists (select 1 from public.order_item_components c where c.order_item_id = i.id)
    ) x
    join public.inventory_items inv on inv.id = x.inventory_item_id and inv.track_inventory
   group by x.inventory_item_id;
$$;

revoke all on function private.order_stock_lines(uuid) from public, anon, authenticated;
revoke all on function private.refund_stock_lines(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. A kit's stock row belongs to the database
-- -----------------------------------------------------------------------------
create or replace function private.guard_bundle_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is null
     or (new.quantity_on_hand, new.quantity_reserved, new.track_inventory, new.availability)
        is not distinct from (old.quantity_on_hand, old.quantity_reserved, old.track_inventory, old.availability)
     or current_setting('app.bundle_refresh', true) = 'on'
     or not private.is_bundle(new.product_id) then
    return new;
  end if;
  raise exception 'inventory_items: a kit''s stock is derived from its components'
    using errcode = '22023', hint = 'bundle';
end;
$$;

create trigger inventory_items_bundle_guard
  before update on public.inventory_items
  for each row execute function private.guard_bundle_inventory();

-- Components' stock moved: their kits are recomputed at commit.
create or replace function private.refresh_bundles_of_component()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bundle uuid;
begin
  for v_bundle in
    select distinct b.bundle_product_id
      from public.product_bundle_items b
     where (new.variant_id is not null and b.component_variant_id = new.variant_id)
        or (new.product_id is not null and b.component_variant_id is null and b.component_product_id = new.product_id)
     order by 1
  loop
    perform private.refresh_bundle_stock(v_bundle);
  end loop;
  return null;
end;
$$;

create constraint trigger inventory_items_refresh_bundles
  after insert or update of quantity_on_hand, quantity_reserved, track_inventory, availability
  on public.inventory_items
  deferrable initially deferred
  for each row execute function private.refresh_bundles_of_component();

revoke all on function private.guard_bundle_inventory() from public, anon, authenticated;
revoke all on function private.refresh_bundles_of_component() from public, anon, authenticated;

-- The ledger explains the components' movements; a kit's derived row has none.
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
  if current_setting('app.bundle_refresh', true) = 'on' then
    return null;
  end if;

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

-- A kit has no options, and a product held whole by a kit cannot start
-- selling options (the kit would keep reserving its product-level row).
create or replace function private.guard_bundle_variants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_active or (tg_op = 'UPDATE' and old.is_active) then
    return new;
  end if;
  if private.is_bundle(new.product_id) then
    raise exception 'product_variants: a kit has no options' using errcode = '22023', hint = 'bundle';
  end if;
  if exists (select 1 from public.product_bundle_items b
              where b.component_product_id = new.product_id and b.component_variant_id is null) then
    raise exception 'product_variants: this product is in a kit as a whole'
      using errcode = '22023', hint = 'bundle_component';
  end if;
  return new;
end;
$$;

create trigger product_variants_bundle_guard
  before insert or update of is_active on public.product_variants
  for each row execute function private.guard_bundle_variants();

revoke all on function private.guard_bundle_variants() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Order stock transitions and refunds read the stock lines
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
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());

    if old.stock_state = 'reserved' then
      perform private.set_inventory_context('sale', new.id);
      for v_item in select * from private.order_stock_lines(new.id)
      loop
        update public.inventory_items
           set quantity_on_hand  = quantity_on_hand - v_item.quantity,
               quantity_reserved = quantity_reserved - v_item.quantity
         where id = v_item.inventory_item_id;
      end loop;
      new.stock_state := 'committed';

    elsif old.stock_state = 'released' then
      -- Paid after the reservation expired: take the stock again if it is
      -- still there, otherwise flag the order for the team (never oversell).
      begin
        perform private.set_inventory_context('sale', new.id);
        for v_item in select * from private.order_stock_lines(new.id)
        loop
          update public.inventory_items
             set quantity_on_hand = quantity_on_hand - v_item.quantity
           where id = v_item.inventory_item_id
             and quantity_on_hand - quantity_reserved >= v_item.quantity;
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

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    if new.stock_state = 'reserved' then
      perform private.set_inventory_context('release', new.id);
      for v_item in select * from private.order_stock_lines(new.id)
      loop
        update public.inventory_items
           set quantity_reserved = quantity_reserved - v_item.quantity
         where id = v_item.inventory_item_id;
      end loop;
      new.stock_state := 'released';
    end if;
  end if;

  perform private.set_inventory_context(null, null);
  return new;
end;
$$;

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

  if new.restock and v_order.stock_state = 'committed' then
    perform private.set_inventory_context('return', new.order_id);
    for v_item in select * from private.refund_stock_lines(new.id)
    loop
      update public.inventory_items
         set quantity_on_hand = quantity_on_hand + v_item.quantity
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
-- 6. create_order(): a kit line reserves its components
--    (unchanged otherwise; see 20261002100000_course_checkout)
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
  p_reservation_minutes  integer default 60,
  p_gift_card_codes      text[] default null,
  p_promotion_codes      text[] default null,
  p_use_loyalty_reward   boolean default false
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_item           jsonb;
  v_gc             jsonb;
  v_qty            integer;
  v_amount         numeric;          -- unconstrained on purpose: sub-cent input must be rejected, not rounded
  v_product        public.products;
  v_variant        public.product_variants;
  v_inventory      public.inventory_items;
  v_settings       public.gift_card_settings;
  v_lines          jsonb := '[]'::jsonb;
  v_line           jsonb;
  v_subtotal       numeric(12, 2) := 0;
  v_gift_lines     numeric(12, 2) := 0;
  v_weight         integer := 0;
  v_needs_shipping boolean := false;
  v_rate           public.shipping_rates;
  v_shipping       numeric(12, 2) := 0;
  v_tax_country    text;
  v_rate_bp        integer;
  v_line_total     numeric(12, 2);
  v_tax_total      numeric(12, 2) := 0;
  v_has_reservation boolean := false;
  v_component      record;
  v_need           integer;
  v_order          public.orders;
  v_order_item_id  uuid;
  v_code           text;
  v_card           public.gift_cards;
  v_redeemable     numeric(12, 2);
  v_take           numeric(12, 2);
  v_gift_total     numeric(12, 2) := 0;
  v_deliver_at     timestamptz;
  v_discount       jsonb;
  v_discount_total numeric(12, 2) := 0;
  v_row            jsonb;
  v_course         public.courses;
  v_course_lines   jsonb := '[]'::jsonb;
  v_course_price   numeric(12, 2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'create_order: items must be a non-empty array (max 100)' using errcode = '22023';
  end if;
  if p_reservation_minutes is null or p_reservation_minutes not between 5 and 1440 then
    raise exception 'create_order: reservation must last 5 to 1440 minutes' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_gift_card_codes), 0) > 5 then
    raise exception 'create_order: at most 5 gift cards per order' using errcode = '22023';
  end if;
  p_currency := upper(p_currency);
  if not exists (select 1 from public.languages l where l.code = p_locale and l.is_enabled) then
    raise exception 'create_order: unsupported locale %', p_locale using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (
       select 1 from public.profiles pr where pr.id = p_user_id and pr.status = 'active') then
    raise exception 'create_order: customer account is not active' using errcode = '42501';
  end if;
  select * into v_settings from public.gift_card_settings where id;

  -- Lines ---------------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then
      raise exception 'create_order: invalid quantity' using errcode = '22023';
    end if;

    -- Course line (Academy, phase D): a seat in a published course for the
    -- buyer's own account, at its current price (course promotion applied),
    -- VAT category `training`. Kept out of the shop's discount engine and of
    -- the shipping thresholds; access is granted once the order is paid.
    if nullif(v_item ->> 'course_id', '') is not null then
      if v_item ? 'product_id' or v_item ? 'variant_id' then
        raise exception 'create_order: a course line names a course only' using errcode = '22023';
      end if;
      if v_qty <> 1 then
        raise exception 'create_order: one seat per course line' using errcode = '22023';
      end if;
      if p_user_id is null then
        raise exception 'create_order: a course requires a customer account' using errcode = '42501';
      end if;
      select * into v_course from public.courses
       where id = (v_item ->> 'course_id')::uuid and status = 'published';
      if not found then
        raise exception 'create_order: course % is not available', v_item ->> 'course_id' using errcode = 'P0002';
      end if;
      if v_course.currency <> p_currency then
        raise exception 'create_order: course % is not sold in %', v_course.slug, p_currency using errcode = '22023';
      end if;
      if v_course_lines @> jsonb_build_array(jsonb_build_object('course_id', v_course.id)) then
        raise exception 'create_order: duplicate line for course %', v_course.slug using errcode = '22023';
      end if;
      if exists (select 1 from public.course_entitlements e
                  where e.user_id = p_user_id and e.course_id = v_course.id and e.revoked_at is null
                    and (e.expires_at is null or e.expires_at > now())) then
        raise exception 'create_order: course % is already held', v_course.slug using errcode = '23505';
      end if;
      select cp.current_price into v_course_price from public.course_current_prices cp where cp.course_id = v_course.id;
      if v_course_price is null or v_course_price <= 0 then
        raise exception 'create_order: course % has no price', v_course.slug using errcode = 'P0002';
      end if;

      v_course_lines := v_course_lines || jsonb_build_object(
        'product_id', null, 'variant_id', null, 'course_id', v_course.id,
        'product_name', left(v_course.title, 200), 'variant_name', null, 'sku', null,
        'unit_price', v_course_price, 'quantity', 1, 'line_total', v_course_price,
        'tax_category', 'training', 'inventory_item_id', null, 'discount_amount', 0,
        'idx', 100000 + jsonb_array_length(v_course_lines));
      continue;
    end if;

    select * into v_product from public.products
     where id = (v_item ->> 'product_id')::uuid and status = 'active';
    if not found then
      raise exception 'create_order: product % is not available', v_item ->> 'product_id' using errcode = 'P0002';
    end if;

    -- Gift card line ------------------------------------------------------------
    if v_product.product_type = 'gift_card' then
      v_gc := v_item -> 'gift_card';
      v_amount := (v_item ->> 'amount')::numeric;
      if v_settings.id is null or not v_settings.is_published or v_settings.product_id is distinct from v_product.id then
        raise exception 'create_order: gift cards are not on sale' using errcode = 'P0002';
      end if;
      if v_qty <> 1 then
        raise exception 'create_order: one gift card per line' using errcode = '22023';
      end if;
      if v_settings.currency <> p_currency then
        raise exception 'create_order: gift cards are sold in %', v_settings.currency using errcode = '22023';
      end if;
      if v_amount is null or v_amount <> round(v_amount, 2)
         or not (v_amount = any (v_settings.preset_amounts)
                 or (v_settings.allow_custom_amount and v_amount between v_settings.min_amount and v_settings.max_amount)) then
        raise exception 'create_order: gift card amount not allowed' using errcode = '22023';
      end if;
      if v_gc is null or jsonb_typeof(v_gc) <> 'object'
         or position('@' in coalesce(v_gc ->> 'recipient_email', '')) <= 1
         or (v_settings.recipient_name_mode = 'required' and nullif(btrim(v_gc ->> 'recipient_name'), '') is null)
         or (v_settings.sender_name_mode = 'required' and nullif(btrim(v_gc ->> 'sender_name'), '') is null)
         or (v_settings.message_mode = 'required' and nullif(btrim(v_gc ->> 'message'), '') is null)
         or (v_settings.message_mode = 'hidden' and nullif(btrim(v_gc ->> 'message'), '') is not null)
         or char_length(coalesce(v_gc ->> 'message', '')) > v_settings.message_max_length
         or not (coalesce(v_gc ->> 'design', v_settings.default_design) = any (v_settings.enabled_designs)) then
        raise exception 'create_order: gift card details are incomplete or invalid' using errcode = '22023';
      end if;
      v_deliver_at := nullif(v_gc ->> 'deliver_at', '')::timestamptz;
      if v_deliver_at is not null
         and (not v_settings.allow_scheduled_delivery or v_deliver_at > now() + interval '1 year') then
        raise exception 'create_order: delivery date not allowed' using errcode = '22023';
      end if;

      v_subtotal := v_subtotal + v_amount;
      v_gift_lines := v_gift_lines + v_amount;
      v_lines := v_lines || jsonb_build_object(
        'product_id', v_product.id, 'variant_id', null,
        'product_name', v_product.name,
        'variant_name', to_char(v_amount, 'FM999999990.00') || ' ' || p_currency,
        'sku', v_product.sku, 'unit_price', v_amount, 'quantity', 1, 'line_total', v_amount,
        'tax_category', 'gift_card', 'inventory_item_id', null,
        'gift_card', v_gc || jsonb_build_object('deliver_at', v_deliver_at));
      continue;
    end if;

    -- Catalogue line --------------------------------------------------------------
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

  -- Shipping (thresholds on the goods before discounts, as in iteration 2) --------
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
       or (v_rate.min_order_amount is not null and v_subtotal - v_gift_lines < v_rate.min_order_amount)
       or (v_rate.max_order_amount is not null and v_subtotal - v_gift_lines > v_rate.max_order_amount)
       or (v_rate.min_weight_grams is not null and v_weight < v_rate.min_weight_grams)
       or (v_rate.max_weight_grams is not null and v_weight > v_rate.max_weight_grams) then
      raise exception 'create_order: shipping rate not applicable to this basket' using errcode = '22023';
    end if;
    v_shipping := case when v_rate.free_over_amount is not null and v_subtotal - v_gift_lines >= v_rate.free_over_amount
                       then 0 else v_rate.price end;
    v_tax_country := upper(p_shipping_address ->> 'country_code');
  else
    p_shipping_address := null;
    p_shipping_rate_id := null;
    v_tax_country := upper(p_billing_address ->> 'country_code');
  end if;

  -- Discounts (promotions or loyalty reward) ------------------------------------------
  -- Shop lines only: shop promotions and the loyalty reward never apply to
  -- courses (owner, 2026-10-01); course lines join after, undiscounted.
  v_discount := private.compute_order_discounts(v_lines, p_user_id, lower(trim(p_customer_email)), p_currency,
                                                v_shipping, p_promotion_codes, p_use_loyalty_reward, p_locale);
  v_lines := (v_discount -> 'lines') || v_course_lines;
  -- A free gift line added by a promotion is part of the subtotal (fully discounted).
  select coalesce(sum((l ->> 'line_total')::numeric), 0), coalesce(sum((l ->> 'discount_amount')::numeric), 0)
    into v_subtotal, v_discount_total
    from jsonb_array_elements(v_lines) l;
  v_shipping := v_shipping - (v_discount ->> 'shipping_discount')::numeric;

  -- VAT on what is actually paid per line (gift card lines: none — taxed on redemption)
  select coalesce(jsonb_agg(l || jsonb_build_object(
           'tax_rate_bp', case when l ->> 'tax_category' = 'gift_card' then 0
                               else public.vat_rate_bp(v_tax_country, l ->> 'tax_category') end,
           'tax_amount',  case when l ->> 'tax_category' = 'gift_card' then 0
                               else public.vat_included((l ->> 'line_total')::numeric - (l ->> 'discount_amount')::numeric,
                                      public.vat_rate_bp(v_tax_country, l ->> 'tax_category')) end)
                   order by (l ->> 'idx')::integer), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(v_lines) l;

  select coalesce(sum((l ->> 'tax_amount')::numeric), 0) into v_tax_total from jsonb_array_elements(v_lines) l;
  v_rate_bp := public.vat_rate_bp(v_tax_country, 'standard');
  v_tax_total := v_tax_total + public.vat_included(v_shipping, v_rate_bp);

  -- Persist ---------------------------------------------------------------------
  insert into public.orders
    (user_id, customer_email, billing_address, shipping_address, currency,
     subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, prices_include_tax,
     locale, shipping_rate_id, shipping_method_name, tax_country_code,
     customer_note, expires_at)
  values
    (p_user_id, lower(trim(p_customer_email)), p_billing_address, p_shipping_address, p_currency,
     v_subtotal, v_discount_total, v_shipping, v_tax_total, v_subtotal - v_discount_total + v_shipping, true,
     p_locale, p_shipping_rate_id, v_rate.name, v_tax_country,
     nullif(trim(p_customer_note), ''), now() + make_interval(mins => p_reservation_minutes))
  returning * into v_order;

  perform private.set_inventory_context('reservation', v_order.id);

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items
      (order_id, product_id, variant_id, course_id, product_name, variant_name, sku,
       unit_price, quantity, inventory_item_id, tax_rate_bp, tax_amount, discount_amount)
    values
      (v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, (v_line ->> 'course_id')::uuid,
       v_line ->> 'product_name', v_line ->> 'variant_name', v_line ->> 'sku',
       (v_line ->> 'unit_price')::numeric, (v_line ->> 'quantity')::integer,
       (v_line ->> 'inventory_item_id')::uuid, (v_line ->> 'tax_rate_bp')::integer,
       (v_line ->> 'tax_amount')::numeric, (v_line ->> 'discount_amount')::numeric)
    returning id into v_order_item_id;

    if v_line ? 'gift_card' then
      v_gc := v_line -> 'gift_card';
      insert into public.gift_cards
        (code, source, currency, initial_amount, order_id, order_item_id, purchaser_user_id, purchaser_email,
         recipient_name, recipient_email, sender_name, message, design, deliver_at)
      values
        (private.generate_gift_card_code(), 'purchase', p_currency, (v_line ->> 'unit_price')::numeric,
         v_order.id, v_order_item_id, p_user_id, lower(trim(p_customer_email)),
         nullif(btrim(v_gc ->> 'recipient_name'), ''), lower(btrim(v_gc ->> 'recipient_email')),
         nullif(btrim(v_gc ->> 'sender_name'), ''), nullif(btrim(v_gc ->> 'message'), ''),
         coalesce(v_gc ->> 'design', v_settings.default_design),
         nullif(v_gc ->> 'deliver_at', '')::timestamptz);
    end if;

    if v_line ->> 'inventory_item_id' is not null then
      select * into v_inventory from public.inventory_items
       where id = (v_line ->> 'inventory_item_id')::uuid;

      if private.is_bundle(v_inventory.product_id) then
        -- Kit (decision 117): its components are reserved, never the kit's own
        -- derived row, and the composition is kept with the line so payment,
        -- expiry and refunds move the units this order really took.
        for v_component in select * from private.bundle_components(v_inventory.product_id)
        loop
          if v_component.inventory_item_id is null then
            raise exception 'create_order: % is out of stock', v_line ->> 'product_name' using errcode = 'P0001';
          end if;
          insert into public.order_item_components
            (order_item_id, inventory_item_id, product_id, variant_id, product_name, variant_name, quantity)
          values
            (v_order_item_id, v_component.inventory_item_id, v_component.product_id, v_component.variant_id,
             v_component.product_name, v_component.variant_name, v_component.quantity);
          v_need := v_component.quantity * (v_line ->> 'quantity')::integer;
          if v_component.track_inventory then
            update public.inventory_items
               set quantity_reserved = quantity_reserved + v_need
             where id = v_component.inventory_item_id
               and quantity_on_hand - quantity_reserved >= v_need;
            if not found then
              raise exception 'create_order: insufficient stock for %', v_line ->> 'product_name'
                using errcode = 'P0001';
            end if;
            v_has_reservation := true;
          elsif v_component.availability = 'out_of_stock' then
            raise exception 'create_order: % is out of stock', v_line ->> 'product_name' using errcode = 'P0001';
          end if;
        end loop;
      elsif v_inventory.track_inventory then
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

  -- What the order received (usage ledger) + loyalty reward reserved --------------------
  for v_row in select value from jsonb_array_elements(v_discount -> 'discounts')
  loop
    insert into public.order_discounts
      (order_id, source, promotion_id, promotion_code_id, loyalty_card_id, user_id, customer_email,
       label, code, promotion_type, goods_amount, shipping_amount)
    values
      (v_order.id, v_row ->> 'source', (v_row ->> 'promotion_id')::uuid, (v_row ->> 'promotion_code_id')::uuid,
       (v_row ->> 'loyalty_card_id')::uuid, p_user_id, lower(trim(p_customer_email)),
       left(v_row ->> 'label', 200), v_row ->> 'code', v_row ->> 'promotion_type',
       (v_row ->> 'goods_amount')::numeric, (v_row ->> 'shipping_amount')::numeric);
    if v_row ->> 'source' = 'loyalty' then
      update public.loyalty_cards
         set status = 'redeemed', redeemed_at = now(), redeemed_order_id = v_order.id
       where id = (v_row ->> 'loyalty_card_id')::uuid and status = 'completed';
    end if;
  end loop;

  -- Gift cards as payment (never on gift card lines) --------------------------------
  v_redeemable := v_order.total_amount - v_gift_lines;
  if p_gift_card_codes is not null then
    for v_code in select distinct upper(btrim(c)) from unnest(p_gift_card_codes) as c
    loop
      exit when v_redeemable - v_gift_total <= 0;
      select * into v_card from public.gift_cards
       where code = upper(btrim(v_code)) for update;
      if not found or not private.gift_card_is_redeemable(v_card) or v_card.currency <> p_currency then
        raise exception 'create_order: gift card not usable' using errcode = 'P0002';
      end if;
      v_take := least(v_card.balance, v_redeemable - v_gift_total);
      insert into public.gift_card_transactions (gift_card_id, kind, amount, order_id, note)
      values (v_card.id, 'redemption', -v_take, v_order.id, 'Commande ' || v_order.order_number);
      insert into public.payments (order_id, provider, gift_card_id, status, amount, currency, payment_method_type)
      values (v_order.id, 'gift_card', v_card.id, 'succeeded', v_take, p_currency, 'gift_card');
      v_gift_total := v_gift_total + v_take;
    end loop;
  end if;

  update public.orders
     set stock_state = case when v_has_reservation then 'reserved' else stock_state end,
         gift_card_amount = v_gift_total
   where id = v_order.id
  returning * into v_order;

  -- Fully covered by gift cards: paid now (stock committed, cards issued by triggers).
  if v_order.amount_due = 0 and v_gift_total > 0 then
    update public.orders set payment_status = 'paid' where id = v_order.id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

comment on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[], text[], boolean) is
  'Server-only checkout. Prices, shipping, promotions / loyalty reward, VAT and gift card payments are computed here, never trusted from the client. Lines: products, gift cards, courses (account required). A kit line reserves its components and keeps its composition (order_item_components).';

-- -----------------------------------------------------------------------------
-- 7. Back office: a product's composition, in one call
--    p_components: [{product_id, variant_id|null, quantity}] in display order;
--    [] turns a kit back into an ordinary product (0 units, to restock).
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_product_bundle(p_product_id uuid, p_components jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product   public.products;
  v_item      jsonb;
  v_component public.products;
  v_variant   uuid;
  v_qty       integer;
  v_position  integer := 0;
  v_seen      text[] := '{}';
  v_was_kit   boolean;
  v_row       public.inventory_items;
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_save_product_bundle: permission denied' using errcode = '42501';
  end if;
  if p_components is null or jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) > 50 then
    raise exception 'admin_save_product_bundle: components must be an array (max 50)' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'admin_save_product_bundle: product not found' using errcode = 'P0002';
  end if;
  v_was_kit := private.is_bundle(p_product_id);

  -- Back to an ordinary product ----------------------------------------------
  if jsonb_array_length(p_components) = 0 then
    if v_was_kit then
      delete from public.product_bundle_items where bundle_product_id = p_product_id;
      update public.inventory_items
         set quantity_on_hand = 0, quantity_reserved = 0, track_inventory = true, availability = 'in_stock'
       where product_id = p_product_id;
    end if;
    return jsonb_build_object('components', 0);
  end if;

  -- A kit ----------------------------------------------------------------------
  if v_product.product_type <> 'physical' then
    raise exception 'admin_save_product_bundle: only a physical product can be a kit' using errcode = '22023';
  end if;
  if exists (select 1 from public.product_variants v where v.product_id = p_product_id and v.is_active) then
    raise exception 'admin_save_product_bundle: a kit has no options' using errcode = '22023', hint = 'bundle_variants';
  end if;
  if exists (select 1 from public.product_bundle_items b where b.component_product_id = p_product_id) then
    raise exception 'admin_save_product_bundle: this product is itself in a kit' using errcode = '22023', hint = 'bundle_nested';
  end if;
  if not v_was_kit and exists (select 1 from public.inventory_items i
                                where i.product_id = p_product_id and i.quantity_reserved > 0) then
    raise exception 'admin_save_product_bundle: unpaid orders hold units of this product'
      using errcode = '55006', hint = 'reserved';
  end if;

  delete from public.product_bundle_items where bundle_product_id = p_product_id;

  for v_item in select value from jsonb_array_elements(p_components)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item ->> 'variant_id', '') !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'
       or coalesce(v_item ->> 'quantity', '') !~ '^\d{1,4}$' then
      raise exception 'admin_save_product_bundle: invalid component' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity')::integer;
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    if v_qty not between 1 and 1000 then
      raise exception 'admin_save_product_bundle: a component quantity is 1 to 1000' using errcode = '22023';
    end if;

    select * into v_component from public.products where id = (v_item ->> 'product_id')::uuid;
    if not found then
      raise exception 'admin_save_product_bundle: component not found' using errcode = 'P0002';
    end if;
    if v_component.id = p_product_id then
      raise exception 'admin_save_product_bundle: a kit cannot hold itself' using errcode = '22023', hint = 'bundle_nested';
    end if;
    if v_component.product_type <> 'physical' then
      raise exception 'admin_save_product_bundle: a component is a physical product' using errcode = '22023';
    end if;
    if private.is_bundle(v_component.id) then
      raise exception 'admin_save_product_bundle: a kit cannot hold another kit' using errcode = '22023', hint = 'bundle_nested';
    end if;
    if v_variant is not null then
      if not exists (select 1 from public.product_variants v
                      where v.id = v_variant and v.product_id = v_component.id and v.is_active) then
        raise exception 'admin_save_product_bundle: option not available' using errcode = 'P0002';
      end if;
    elsif exists (select 1 from public.product_variants v where v.product_id = v_component.id and v.is_active) then
      raise exception 'admin_save_product_bundle: choose an option of %', v_component.name
        using errcode = '22023', hint = 'bundle_option';
    end if;
    if not exists (select 1 from public.inventory_items i
                    where (v_variant is not null and i.variant_id = v_variant)
                       or (v_variant is null and i.product_id = v_component.id)) then
      raise exception 'admin_save_product_bundle: % has no stock record', v_component.name using errcode = 'P0002';
    end if;
    if (v_component.id::text || '/' || coalesce(v_variant::text, '')) = any (v_seen) then
      raise exception 'admin_save_product_bundle: duplicate component' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_component.id::text || '/' || coalesce(v_variant::text, ''));

    insert into public.product_bundle_items
      (bundle_product_id, component_product_id, component_variant_id, quantity, position)
    values (p_product_id, v_component.id, v_variant, v_qty, v_position);
    v_position := v_position + 1;
  end loop;

  if not exists (select 1 from public.inventory_items where product_id = p_product_id) then
    insert into public.inventory_items (product_id, quantity_on_hand) values (p_product_id, 0);
  end if;
  perform private.refresh_bundle_stock(p_product_id);

  select * into v_row from public.inventory_items where product_id = p_product_id;
  return jsonb_build_object(
    'components', v_position,
    'quantity_on_hand', v_row.quantity_on_hand,
    'stock_status', v_row.stock_status
  );
end;
$$;

revoke all on function public.admin_save_product_bundle(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_product_bundle(uuid, jsonb) to authenticated;

comment on function public.admin_save_product_bundle(uuid, jsonb) is
  'Back office (manage_products): replaces a product''s kit composition ([{product_id, variant_id, quantity}]); [] makes it an ordinary product again at 0 units. The kit''s stock is then derived from its components (decision 117).';

-- -----------------------------------------------------------------------------
-- 8. Daily stock digest: the components, not the kits
--    (unchanged otherwise; see 20261022090133_low_stock_digest)
-- -----------------------------------------------------------------------------
create or replace function public.pending_stock_digest()
returns table (
  digest_date  date,
  product_id   uuid,
  product_name text,
  variant_name text,
  sku          text,
  stock_status text,
  available    integer,
  threshold    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (
    select (now() at time zone 'Europe/Paris')::date as d,
           extract(hour from now() at time zone 'Europe/Paris') >= 8 as after_eight
  ),
  due as (
    select t.d from today t
     where t.after_eight and private.email_event_open('stock_digest:' || t.d::text)
  )
  select due.d, p.id, p.name, v.name, coalesce(v.sku, p.sku), i.stock_status,
         greatest(i.quantity_on_hand - i.quantity_reserved, 0), i.low_stock_threshold
    from due
    cross join public.products p
    left join public.product_variants v on v.product_id = p.id and v.is_active
    join public.inventory_items i
      on (v.id is not null and i.variant_id = v.id)
      or (v.id is null and i.product_id = p.id)
   where p.status = 'active'
     and p.product_type = 'physical'
     and i.stock_status in ('low_stock', 'out_of_stock')
     and not exists (select 1 from public.product_bundle_items b where b.bundle_product_id = p.id)
   order by (i.stock_status = 'out_of_stock') desc, p.name, v.position, v.name
   limit 500;
$$;
