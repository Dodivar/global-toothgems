-- =============================================================================
-- Migration 004 — Orders, order items, payments
-- =============================================================================
-- Principles:
--   * An order is a historical record. Customer, address, product and price
--     data are SNAPSHOTTED at purchase time; nothing is reconstructed from the
--     current catalogue or address book.
--   * Orders are created by trusted server code (service role) after prices
--     are recomputed server-side. Browsers can never insert orders.
--   * Three independent state fields, matching the admin prototype:
--       status              — commercial lifecycle of the order
--       payment_status      — money (driven by Stripe webhooks)
--       fulfillment_status  — physical preparation / shipping
--   * No card data is ever stored: only provider references (Stripe ids) and
--     display-safe metadata (brand, last 4 digits).
-- =============================================================================

create sequence public.order_number_seq start with 100001;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique
                      default ('GT-' || nextval('public.order_number_seq')::text),
  -- SET NULL: deleting an account (GDPR) must not delete accounting records.
  user_id             uuid references public.profiles (id) on delete set null,
  customer_email      text not null check (position('@' in customer_email) > 1),
  billing_address     jsonb not null,
  shipping_address    jsonb,                                  -- null for digital-only orders
  currency            char(3) not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_amount     numeric(12, 2) not null check (subtotal_amount >= 0),
  discount_amount     numeric(12, 2) not null default 0 check (discount_amount >= 0),
  shipping_amount     numeric(12, 2) not null default 0 check (shipping_amount >= 0),
  tax_amount          numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total_amount        numeric(12, 2) not null check (total_amount >= 0),
  -- EU B2C prices are VAT-inclusive: tax_amount is then informational
  -- (the VAT contained in the total) and is not added again.
  prices_include_tax  boolean not null default true,
  status              text not null default 'pending'
                      check (status in ('pending', 'confirmed', 'processing', 'shipped',
                                        'delivered', 'cancelled', 'refunded')),
  payment_status      text not null default 'pending'
                      check (payment_status in ('pending', 'paid', 'failed',
                                                'refunded', 'partially_refunded')),
  fulfillment_status  text not null default 'unfulfilled'
                      check (fulfillment_status in ('unfulfilled', 'preparing',
                                                    'partially_fulfilled', 'fulfilled')),
  customer_note       text check (char_length(customer_note) <= 1000),
  admin_note          text check (char_length(admin_note) <= 4000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id) on delete set null,

  constraint orders_discount_le_subtotal check (discount_amount <= subtotal_amount),
  constraint orders_total_matches check (
    total_amount = subtotal_amount - discount_amount + shipping_amount
                   + case when prices_include_tax then 0 else tax_amount end
  ),
  constraint orders_billing_address_shape check (
    jsonb_typeof(billing_address) = 'object'
    and billing_address ?& array['first_name', 'last_name', 'address_line1', 'city', 'country_code']
  ),
  constraint orders_shipping_address_shape check (
    shipping_address is null or (
      jsonb_typeof(shipping_address) = 'object'
      and shipping_address ?& array['first_name', 'last_name', 'address_line1', 'city', 'country_code']
    )
  )
);

comment on column public.orders.order_number is 'Human-readable reference shown to customers, e.g. GT-100001.';
comment on column public.orders.billing_address is 'Immutable snapshot: first_name, last_name, company, address_line1, address_line2, postal_code, city, region, country_code, phone.';
comment on column public.orders.shipping_address is 'Immutable snapshot, same shape as billing_address. NULL for digital-only orders.';
comment on column public.orders.customer_email is 'Snapshot of the contact email at purchase time (also supports future guest checkout).';

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_payment_status_idx on public.orders (payment_status);
create index orders_fulfillment_status_idx on public.orders (fulfillment_status);

alter table public.orders enable row level security;

-- Staff may move an order through its lifecycle and write notes, but the
-- commercial facts of the order are immutable outside trusted backend code.
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

  if new.order_number       is distinct from old.order_number
  or new.user_id            is distinct from old.user_id
  or new.customer_email     is distinct from old.customer_email
  or new.billing_address    is distinct from old.billing_address
  or new.shipping_address   is distinct from old.shipping_address
  or new.currency           is distinct from old.currency
  or new.subtotal_amount    is distinct from old.subtotal_amount
  or new.discount_amount    is distinct from old.discount_amount
  or new.shipping_amount    is distinct from old.shipping_amount
  or new.tax_amount         is distinct from old.tax_amount
  or new.total_amount       is distinct from old.total_amount
  or new.prices_include_tax is distinct from old.prices_include_tax
  or new.customer_note      is distinct from old.customer_note
  or new.created_at         is distinct from old.created_at then
    raise exception 'orders: amounts, snapshots and identity are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger orders_guard_update
  before update on public.orders
  for each row execute function private.guard_order_update();

-- -----------------------------------------------------------------------------
-- Order items: frozen copy of what was bought
-- -----------------------------------------------------------------------------
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  -- RESTRICT: an ordered product/variant can be archived, never hard-deleted.
  product_id       uuid references public.products (id) on delete restrict,
  variant_id       uuid references public.product_variants (id) on delete restrict,
  product_name     text not null check (char_length(product_name) between 1 and 200),
  variant_name     text,
  sku              text,
  unit_price       numeric(12, 2) not null check (unit_price >= 0),
  quantity         integer not null check (quantity > 0 and quantity <= 1000),
  subtotal_amount  numeric(12, 2) generated always as (unit_price * quantity) stored,
  created_at       timestamptz not null default now()
);

comment on table public.order_items is
  'Snapshot of each purchased line. Names, SKU and prices are copied, never joined from the live catalogue.';

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index order_items_variant_idx on public.order_items (variant_id) where variant_id is not null;

alter table public.order_items enable row level security;

-- -----------------------------------------------------------------------------
-- Integrity: orders.subtotal_amount must equal the sum of its items.
-- Deferred to commit time so an order and its items are written in one
-- transaction; an order with zero items is only valid while subtotal = 0.
-- -----------------------------------------------------------------------------
create or replace function private.check_order_subtotal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_expected numeric(12, 2);
  v_actual   numeric(12, 2);
begin
  if tg_table_name = 'orders' then
    v_order_id := new.id;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select o.subtotal_amount into v_expected from public.orders o where o.id = v_order_id;
  if not found then
    return null;   -- order deleted in the same transaction
  end if;

  select coalesce(sum(i.subtotal_amount), 0) into v_actual
    from public.order_items i where i.order_id = v_order_id;

  if v_actual <> v_expected then
    raise exception 'orders: subtotal % does not match sum of items % for order %',
      v_expected, v_actual, v_order_id using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger orders_subtotal_matches_items
  after insert or update of subtotal_amount on public.orders
  deferrable initially deferred
  for each row execute function private.check_order_subtotal();

create constraint trigger order_items_subtotal_matches_order
  after insert or update or delete on public.order_items
  deferrable initially deferred
  for each row execute function private.check_order_subtotal();

-- -----------------------------------------------------------------------------
-- Payments: one row per provider payment attempt / session. Safe references
-- only. Designed for Stripe Checkout + webhooks (written by service role).
-- -----------------------------------------------------------------------------
create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders (id) on delete restrict,
  provider                 text not null default 'stripe' check (provider in ('stripe')),
  provider_checkout_id     text unique,     -- e.g. Stripe Checkout Session id (cs_...)
  provider_payment_id      text unique,     -- e.g. Stripe PaymentIntent id (pi_...)
  status                   text not null default 'pending'
                           check (status in ('pending', 'succeeded', 'failed', 'cancelled',
                                             'refunded', 'partially_refunded')),
  amount                   numeric(12, 2) not null check (amount >= 0),
  amount_refunded          numeric(12, 2) not null default 0 check (amount_refunded >= 0),
  currency                 char(3) not null check (currency ~ '^[A-Z]{3}$'),
  payment_method_type      text check (char_length(payment_method_type) <= 40),  -- card, paypal, ...
  card_brand               text check (char_length(card_brand) <= 20),           -- display only
  card_last4               char(4) check (card_last4 ~ '^[0-9]{4}$'),             -- display only
  failure_reason           text check (char_length(failure_reason) <= 500),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint payments_refund_le_amount check (amount_refunded <= amount)
);

comment on table public.payments is
  'Provider payment references. NEVER store card numbers, CVV or credentials — only ids and display-safe metadata.';

create index payments_order_idx on public.payments (order_id);

alter table public.payments enable row level security;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();
