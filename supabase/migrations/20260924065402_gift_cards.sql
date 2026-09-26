-- =============================================================================
-- Migration 016 — Gift cards (iteration 4)
-- =============================================================================
-- Mirrors the Promotions & Gift Cards workspace and the storefront gift card
-- page (webapp/src/data/adminPromotions.ts, lib/adminPromotions.tsx).
--
-- Purchase
--   * A gift card is a product of type 'gift_card' bought through the normal
--     checkout: create_order() accepts a gift card line with an amount and the
--     recipient details, validated against gift_card_settings.
--   * The card is created 'pending' with the order and becomes usable only when
--     the order is PAID (verified webhook). Cancelled/expired orders void it.
--   * Gift card lines carry no VAT: a multi-purpose voucher is taxed when it is
--     spent, not when it is sold (EU VAT directive — confirm with the accountant).
--
-- Balance
--   * The balance is the sum of an append-only ledger (gift_card_transactions);
--     gift_cards.balance is a cache maintained by the ledger trigger and can
--     never go negative (CHECK).
--
-- Redemption
--   * create_order(…, p_gift_card_codes) applies cards as a PAYMENT, not a
--     discount: order totals and VAT are unchanged; orders.gift_card_amount is
--     covered by cards and orders.amount_due is what Stripe must collect.
--   * Cards cannot pay for gift cards; cards must be active, delivered (not a
--     future scheduled delivery), unexpired and in the order currency.
--   * The debit happens at order creation (with a 'gift_card' payment row);
--     an unpaid order that is cancelled or expires is credited back.
--   * An order fully covered by cards is marked paid immediately.
--
-- Security
--   * Codes are bearer credentials: generated server-side (60 random bits),
--     never exposed through the API — not even to staff, who see the last 4
--     characters. Balance checks go through gift_card_balance(), service role
--     only, so the app can rate-limit guessing.
--   * All card and ledger writes go through functions; no direct API writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catalogue, payments and orders
-- -----------------------------------------------------------------------------
alter table public.products drop constraint products_product_type_check;
alter table public.products add constraint products_product_type_check
  check (product_type in ('physical', 'digital', 'gift_card'));

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('stripe', 'gift_card'));

alter table public.orders
  add column gift_card_amount numeric(12, 2) not null default 0 check (gift_card_amount >= 0),
  add column amount_due numeric(12, 2) generated always as (total_amount - gift_card_amount) stored;
alter table public.orders
  add constraint orders_gift_card_le_total check (gift_card_amount <= total_amount);

comment on column public.orders.gift_card_amount is 'Part of total_amount paid with gift cards (a payment, not a discount).';
comment on column public.orders.amount_due is 'What the card payment provider must collect: total_amount - gift_card_amount.';

-- -----------------------------------------------------------------------------
-- Settings (single row) — the storefront gift card product configuration
-- -----------------------------------------------------------------------------
create table public.gift_card_settings (
  id                        boolean primary key default true check (id),
  product_id                uuid references public.products (id) on delete set null,
  currency                  char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  preset_amounts            numeric(12, 2)[] not null default '{25,50,75,100,150,200}',
  allow_custom_amount       boolean not null default true,
  min_amount                numeric(12, 2) not null default 15 check (min_amount > 0),
  max_amount                numeric(12, 2) not null default 500,
  expiry_months             integer check (expiry_months between 1 and 120),   -- null = never expires
  allow_scheduled_delivery  boolean not null default true,
  recipient_name_mode       text not null default 'required' check (recipient_name_mode in ('required', 'optional', 'hidden')),
  sender_name_mode          text not null default 'required' check (sender_name_mode in ('required', 'optional', 'hidden')),
  message_mode              text not null default 'optional' check (message_mode in ('required', 'optional', 'hidden')),
  message_max_length        integer not null default 240 check (message_max_length between 0 and 1000),
  enabled_designs           text[] not null default '{sparkle,blush,noir,mint}',
  default_design            text not null default 'sparkle',
  is_published              boolean not null default false,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (id) on delete set null,
  constraint gift_card_settings_bounds check (max_amount >= min_amount),
  constraint gift_card_settings_designs check (
    enabled_designs <@ array['sparkle', 'blush', 'noir', 'mint', 'photo']
    and cardinality(enabled_designs) > 0
    and default_design = any (enabled_designs))
);

comment on table public.gift_card_settings is 'Single-row configuration of the storefront gift card.';

alter table public.gift_card_settings enable row level security;

create trigger gift_card_settings_updated
  before update on public.gift_card_settings
  for each row execute function private.set_inventory_audit();   -- updated_at + updated_by

-- -----------------------------------------------------------------------------
-- Gift cards
-- -----------------------------------------------------------------------------
create table public.gift_cards (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^GT-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  code_last4          text generated always as (right(code, 4)) stored,
  state               text not null default 'pending'
                      check (state in ('pending', 'active', 'void', 'cancelled')),
  source              text not null default 'purchase' check (source in ('purchase', 'manual')),
  currency            char(3) not null check (currency ~ '^[A-Z]{3}$'),
  initial_amount      numeric(12, 2) not null check (initial_amount > 0),
  balance             numeric(12, 2) not null default 0 check (balance >= 0),
  order_id            uuid references public.orders (id) on delete restrict,
  order_item_id       uuid references public.order_items (id) on delete restrict,
  purchaser_user_id   uuid references public.profiles (id) on delete set null,
  purchaser_email     text check (position('@' in purchaser_email) > 1),
  recipient_name      text check (char_length(recipient_name) <= 100),
  recipient_email     text not null check (position('@' in recipient_email) > 1),
  sender_name         text check (char_length(sender_name) <= 100),
  message             text check (char_length(message) <= 1000),
  design              text not null default 'sparkle' check (design in ('sparkle', 'blush', 'noir', 'mint', 'photo')),
  deliver_at          timestamptz,                                  -- null = as soon as issued
  delivery_status     text not null default 'pending'
                      check (delivery_status in ('pending', 'scheduled', 'sent', 'delivered', 'opened', 'bounced')),
  delivered_at        timestamptz,
  issued_at           timestamptz,
  expires_at          timestamptz,                                  -- null = never expires
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint gift_cards_balance_le_credits check (balance >= 0),
  constraint gift_cards_purchase_has_order check (source <> 'purchase' or order_item_id is not null)
);

comment on table public.gift_cards is
  'Gift cards. The code is a bearer credential: never granted to API roles (staff see code_last4).';
comment on column public.gift_cards.balance is 'Cache of sum(gift_card_transactions.amount), maintained by trigger.';
comment on column public.gift_cards.state is 'pending = awaiting payment, active = usable (subject to delivery/expiry), void = order never paid, cancelled = cancelled by staff.';

create index gift_cards_order_idx on public.gift_cards (order_id) where order_id is not null;
create index gift_cards_order_item_idx on public.gift_cards (order_item_id) where order_item_id is not null;
create index gift_cards_purchaser_idx on public.gift_cards (purchaser_user_id) where purchaser_user_id is not null;
create index gift_cards_recipient_idx on public.gift_cards (lower(recipient_email));
create index gift_cards_delivery_due_idx on public.gift_cards (deliver_at)
  where state = 'active' and delivery_status in ('pending', 'scheduled');

alter table public.gift_cards enable row level security;

create trigger gift_cards_set_updated_at
  before update on public.gift_cards
  for each row execute function private.set_updated_at();

alter table public.payments
  add column gift_card_id uuid references public.gift_cards (id) on delete restrict;
alter table public.payments
  add constraint payments_gift_card_provider check ((provider = 'gift_card') = (gift_card_id is not null));
create index payments_gift_card_idx on public.payments (gift_card_id) where gift_card_id is not null;

-- -----------------------------------------------------------------------------
-- Ledger (append-only). The trigger keeps gift_cards.balance in step and
-- refuses anything that would take it below zero.
-- -----------------------------------------------------------------------------
create table public.gift_card_transactions (
  id             bigint generated always as identity primary key,
  gift_card_id   uuid not null references public.gift_cards (id) on delete restrict,
  kind           text not null check (kind in
                   ('purchase', 'issue', 'redemption', 'reversal', 'refund', 'adjustment',
                    'extension', 'cancellation', 'resend')),
  amount         numeric(12, 2) not null,             -- signed: + credits, − debits
  balance_after  numeric(12, 2) not null check (balance_after >= 0),
  order_id       uuid references public.orders (id) on delete set null,
  note           text check (char_length(note) <= 500),
  actor_id       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint gift_card_transactions_sign check (
    case kind
      when 'purchase'     then amount > 0
      when 'issue'        then amount > 0
      when 'redemption'   then amount < 0
      when 'reversal'     then amount > 0
      when 'refund'       then amount > 0
      when 'adjustment'   then amount <> 0
      when 'cancellation' then amount <= 0
      else amount = 0                                   -- extension, resend: history only
    end)
);

comment on table public.gift_card_transactions is 'Append-only gift card ledger; the balance is the sum of amount.';

create index gift_card_transactions_card_idx on public.gift_card_transactions (gift_card_id, created_at);
create index gift_card_transactions_order_idx on public.gift_card_transactions (order_id) where order_id is not null;

alter table public.gift_card_transactions enable row level security;

create or replace function private.apply_gift_card_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  select * into v_card from public.gift_cards where id = new.gift_card_id for update;
  if new.kind = 'redemption' and v_card.state <> 'active' then
    raise exception 'gift card is not usable' using errcode = 'P0001';
  end if;
  if v_card.balance + new.amount < 0 then
    raise exception 'gift card balance insufficient' using errcode = 'P0001';
  end if;
  new.balance_after := v_card.balance + new.amount;
  new.created_at := now();
  update public.gift_cards set balance = new.balance_after where id = new.gift_card_id;
  return new;
end;
$$;

create trigger gift_card_transactions_apply
  before insert on public.gift_card_transactions
  for each row execute function private.apply_gift_card_transaction();

create or replace function private.reject_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'gift_card_transactions is append-only' using errcode = '42501';
end;
$$;

create trigger gift_card_transactions_append_only
  before update or delete on public.gift_card_transactions
  for each row execute function private.reject_ledger_change();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- GT-XXXX-XXXX-XXXX from a 32-character alphabet without 0/O/1/I (60 bits).
create or replace function private.generate_gift_card_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code  text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(12);
    v_code := 'GT-';
    for i in 0..11 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
      if i in (3, 7) then v_code := v_code || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.gift_cards where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Staff or backend, evaluated from inside SECURITY DEFINER functions (where
-- current_user is the owner, so is_trusted_backend() cannot be used):
--   * a signed-in API user must be an active admin;
--   * otherwise the JWT role must be service_role;
--   * no JWT at all = SQL editor / migrations (database owner session).
create or replace function private.caller_jwt_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
$$;

create or replace function private.caller_is_staff_or_backend()
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when auth.uid() is not null then private.is_admin()
    when private.caller_jwt_role() = 'service_role' then true
    when private.caller_jwt_role() = '' then session_user in ('postgres', 'supabase_admin')
    else false
  end;
$$;

revoke all on function private.generate_gift_card_code() from public;
revoke all on function private.caller_is_staff_or_backend() from public;
revoke all on function private.caller_jwt_role() from public;
revoke all on function private.apply_gift_card_transaction() from public;

-- A card is redeemable now?
create or replace function private.gift_card_is_redeemable(p_card public.gift_cards)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_card.state = 'active'
     and p_card.balance > 0
     and (p_card.expires_at is null or p_card.expires_at > now())
     and (p_card.deliver_at is null or p_card.deliver_at <= now());
$$;

-- -----------------------------------------------------------------------------
-- Order transitions for gift cards (issue on payment, void/credit back on cancel)
-- Runs after the stock-transition trigger.
-- -----------------------------------------------------------------------------
create or replace function private.apply_order_gift_card_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card     public.gift_cards;
  v_payment  public.payments;
  v_settings public.gift_card_settings;
begin
  -- Paid: issue the purchased cards.
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    select * into v_settings from public.gift_card_settings where id;
    for v_card in select * from public.gift_cards where order_id = new.id and state = 'pending' for update
    loop
      update public.gift_cards
         set state = 'active',
             issued_at = now(),
             expires_at = case when v_settings.expiry_months is null then null
                               else now() + make_interval(months => v_settings.expiry_months) end,
             delivery_status = case when deliver_at is not null and deliver_at > now() then 'scheduled' else 'pending' end
       where id = v_card.id;
      insert into public.gift_card_transactions (gift_card_id, kind, amount, order_id, note)
      values (v_card.id, 'purchase', v_card.initial_amount, new.id, 'Achat commande ' || new.order_number);
    end loop;
  end if;

  -- Cancelled before payment: void purchased cards, credit redeemed cards back.
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and new.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    update public.gift_cards set state = 'void' where order_id = new.id and state = 'pending';
    for v_payment in
      select * from public.payments
       where order_id = new.id and provider = 'gift_card' and status = 'succeeded'
       for update
    loop
      insert into public.gift_card_transactions (gift_card_id, kind, amount, order_id, note)
      values (v_payment.gift_card_id, 'reversal', v_payment.amount, new.id,
              'Commande ' || new.order_number || ' annulée');
      update public.payments set status = 'cancelled' where id = v_payment.id;
    end loop;
    new.gift_card_amount := 0;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_order_gift_card_transitions() from public;

create trigger orders_stock_transitions_z_gift_cards   -- name sorts after orders_stock_transitions
  before update of status, payment_status on public.orders
  for each row execute function private.apply_order_gift_card_transitions();

-- -----------------------------------------------------------------------------
-- Order guard: gift_card_amount is a commercial fact too.
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
  or new.gift_card_amount     is distinct from old.gift_card_amount
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
-- create_order (replaces iteration 2): gift card lines + gift card redemption.
-- p_items: [{"product_id", "variant_id"?, "quantity"},
--           {"product_id": <gift card product>, "quantity": 1, "amount": 50,
--            "gift_card": {"recipient_name", "recipient_email", "sender_name",
--                          "message", "design", "deliver_at"}}]
-- p_gift_card_codes: codes to apply as payment (max 5).
-- -----------------------------------------------------------------------------
drop function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer);

create function public.create_order(
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
  p_gift_card_codes      text[] default null
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_item           jsonb;
  v_gc             jsonb;
  v_qty            integer;
  v_amount         numeric(12, 2);
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
  v_order          public.orders;
  v_order_item_id  uuid;
  v_code           text;
  v_card           public.gift_cards;
  v_redeemable     numeric(12, 2);
  v_take           numeric(12, 2);
  v_gift_total     numeric(12, 2) := 0;
  v_deliver_at     timestamptz;
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

  -- Shipping --------------------------------------------------------------------
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

  -- VAT (gift card lines: none — taxed on redemption) -------------------------------
  select coalesce(jsonb_agg(l || jsonb_build_object(
           'tax_rate_bp', case when l ->> 'tax_category' = 'gift_card' then 0
                               else public.vat_rate_bp(v_tax_country, l ->> 'tax_category') end,
           'tax_amount',  case when l ->> 'tax_category' = 'gift_card' then 0
                               else public.vat_included((l ->> 'line_total')::numeric,
                                      public.vat_rate_bp(v_tax_country, l ->> 'tax_category')) end)
                   order by n), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(v_lines) with ordinality as t(l, n);

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
       (v_line ->> 'tax_amount')::numeric)
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

  -- Gift cards as payment (never on gift card lines) --------------------------------
  v_redeemable := v_subtotal + v_shipping - v_gift_lines;
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

-- -----------------------------------------------------------------------------
-- mark_order_paid (replaces iteration 2): Stripe collects amount_due.
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
    return v_order;
  end if;
  if p_amount <> v_order.amount_due or upper(p_currency) <> v_order.currency then
    raise exception 'mark_order_paid: paid % % does not match amount due % %',
      p_amount, upper(p_currency), v_order.amount_due, v_order.currency using errcode = '22023';
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
     and provider = 'stripe'
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
  returning * into v_order;
  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- request_refund (replaces iteration 3): card payments only. The part paid with
-- gift cards is refunded onto the cards with refund_to_gift_cards().
-- -----------------------------------------------------------------------------
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
     and p.provider = 'stripe'
     and p.status in ('succeeded', 'partially_refunded')
     and p.amount > p.amount_refunded
   order by p.created_at desc
   limit 1;
  if not found then
    raise exception 'request_refund: no refundable card payment on this order' using errcode = 'P0002';
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

-- -----------------------------------------------------------------------------
-- Staff / backend operations (SECURITY DEFINER with explicit authorization)
-- -----------------------------------------------------------------------------

-- Refund the part of an order paid with gift cards back onto the cards
-- (newest redemption first). Immediate: no external provider involved.
create or replace function public.refund_to_gift_cards(p_order_id uuid, p_amount numeric, p_reason text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_left    numeric(12, 2) := p_amount;
  v_part    numeric(12, 2);
  v_refund  public.refunds;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'refund_to_gift_cards: not allowed' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'refund_to_gift_cards: amount must be positive' using errcode = '22023';
  end if;

  for v_payment in
    select * from public.payments
     where order_id = p_order_id and provider = 'gift_card'
       and status in ('succeeded', 'partially_refunded') and amount > amount_refunded
     order by created_at desc
     for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, v_payment.amount - v_payment.amount_refunded);
    if not exists (select 1 from public.gift_cards where id = v_payment.gift_card_id and state = 'active') then
      raise exception 'refund_to_gift_cards: card ending % is no longer active; refund another way',
        (select code_last4 from public.gift_cards where id = v_payment.gift_card_id) using errcode = '23514';
    end if;
    insert into public.refunds (order_id, payment_id, amount, currency, reason)
    values (p_order_id, v_payment.id, v_part, v_payment.currency, p_reason)
    returning * into v_refund;
    update public.refunds set status = 'succeeded' where id = v_refund.id;   -- payment + order states
    insert into public.gift_card_transactions (gift_card_id, kind, amount, order_id, note)
    values (v_payment.gift_card_id, 'refund', v_part, p_order_id, 'Remboursement');
    v_left := v_left - v_part;
  end loop;

  if v_left > 0 then
    raise exception 'refund_to_gift_cards: % exceeds what was paid with gift cards', p_amount using errcode = '23514';
  end if;
  return p_amount;
end;
$$;

-- Goodwill / manual card (staff).
create or replace function public.issue_gift_card(
  p_amount          numeric,
  p_recipient_email text,
  p_recipient_name  text default null,
  p_message         text default null,
  p_expires_at      timestamptz default null,
  p_note            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.gift_card_settings;
  v_id       uuid;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'issue_gift_card: not allowed' using errcode = '42501';
  end if;
  select * into v_settings from public.gift_card_settings where id;
  insert into public.gift_cards
    (code, state, source, currency, initial_amount, recipient_name, recipient_email, message, design,
     issued_at, expires_at)
  values
    (private.generate_gift_card_code(), 'active', 'manual', coalesce(v_settings.currency, 'EUR'), p_amount,
     nullif(btrim(p_recipient_name), ''), lower(btrim(p_recipient_email)), nullif(btrim(p_message), ''),
     coalesce(v_settings.default_design, 'sparkle'), now(),
     coalesce(p_expires_at, case when v_settings.expiry_months is null then null
                                 else now() + make_interval(months => v_settings.expiry_months) end))
  returning id into v_id;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (v_id, 'issue', p_amount, left(p_note, 500));
  return v_id;
end;
$$;

create or replace function public.adjust_gift_card(p_gift_card_id uuid, p_delta numeric, p_note text)
returns public.gift_card_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.gift_card_transactions;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'adjust_gift_card: not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'adjust_gift_card: a note is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.gift_cards where id = p_gift_card_id and state = 'active') then
    raise exception 'adjust_gift_card: only active cards can be adjusted' using errcode = '23514';
  end if;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (p_gift_card_id, 'adjustment', p_delta, left(p_note, 500))
  returning * into v_tx;
  return v_tx;
end;
$$;

create or replace function public.extend_gift_card(p_gift_card_id uuid, p_expires_at timestamptz, p_note text default null)
returns public.gift_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'extend_gift_card: not allowed' using errcode = '42501';
  end if;
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if v_card.state <> 'active' then
    raise exception 'extend_gift_card: only active cards can be extended' using errcode = '23514';
  end if;
  if v_card.expires_at is null then
    raise exception 'extend_gift_card: this card never expires' using errcode = '23514';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at <= v_card.expires_at) then
    raise exception 'extend_gift_card: new expiry must be later than the current one' using errcode = '22023';
  end if;
  update public.gift_cards set expires_at = p_expires_at where id = p_gift_card_id returning * into v_card;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (p_gift_card_id, 'extension', 0,
          left(coalesce(p_note || ' — ', '') || coalesce('→ ' || to_char(p_expires_at, 'YYYY-MM-DD'), '→ sans expiration'), 500));
  return v_card;
end;
$$;

create or replace function public.cancel_gift_card(p_gift_card_id uuid, p_note text)
returns public.gift_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'cancel_gift_card: not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'cancel_gift_card: a note is required' using errcode = '22023';
  end if;
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if v_card.state = 'cancelled' then
    return v_card;
  end if;
  if v_card.state <> 'active' then
    raise exception 'cancel_gift_card: only active cards can be cancelled' using errcode = '23514';
  end if;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (p_gift_card_id, 'cancellation', -v_card.balance, left(p_note, 500));
  update public.gift_cards set state = 'cancelled', cancelled_at = now()
   where id = p_gift_card_id returning * into v_card;
  return v_card;
end;
$$;

-- Backend: the delivery email was (re)sent; optionally to a corrected address.
create or replace function public.record_gift_card_delivery(
  p_gift_card_id  uuid,
  p_status        text,
  p_new_email     text default null
)
returns public.gift_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
  v_was_sent boolean;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'record_gift_card_delivery: not allowed' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'opened', 'bounced') then
    raise exception 'record_gift_card_delivery: invalid status' using errcode = '22023';
  end if;
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if v_card.state <> 'active' then
    raise exception 'record_gift_card_delivery: card not active' using errcode = '23514';
  end if;
  v_was_sent := v_card.delivery_status in ('sent', 'delivered', 'opened', 'bounced');
  update public.gift_cards
     set delivery_status = p_status,
         recipient_email = coalesce(lower(btrim(p_new_email)), recipient_email),
         delivered_at = case when p_status in ('delivered', 'opened') then coalesce(delivered_at, now()) else delivered_at end
   where id = p_gift_card_id
  returning * into v_card;
  if p_status = 'sent' and v_was_sent then
    insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
    values (p_gift_card_id, 'resend', 0, left(coalesce('→ ' || lower(btrim(p_new_email)), 'Renvoi'), 500));
  end if;
  return v_card;
end;
$$;

-- Balance check by code — backend only (the app rate-limits the public form).
create or replace function public.gift_card_balance(p_code text)
returns table (balance numeric, currency char(3), expires_at timestamptz, redeemable boolean, code_last4 text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'gift_card_balance: not allowed' using errcode = '42501';
  end if;
  select * into v_card from public.gift_cards where code = upper(btrim(p_code)) and state = 'active';
  if not found then
    return;
  end if;
  return query select v_card.balance, v_card.currency, v_card.expires_at,
                      private.gift_card_is_redeemable(v_card), v_card.code_last4;
end;
$$;

-- Backend only: the code, to put in the delivery email.
create or replace function public.gift_card_code_for_delivery(p_gift_card_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select code from public.gift_cards
   where id = p_gift_card_id and state = 'active'
     and private.caller_jwt_role() = 'service_role';
$$;

-- -----------------------------------------------------------------------------
-- Admin overview (derived status, as in the prototype; never stored)
-- -----------------------------------------------------------------------------
create view public.gift_card_overview
with (security_invoker = true)
as
select g.id, g.code_last4, g.source, g.currency, g.initial_amount, g.balance,
       g.order_id, g.purchaser_user_id, g.purchaser_email, g.recipient_name, g.recipient_email,
       g.sender_name, g.design, g.deliver_at, g.delivery_status, g.issued_at, g.expires_at,
       g.cancelled_at, g.created_at,
       case
         when g.state = 'cancelled' then 'cancelled'
         when g.state = 'void' then 'void'
         when g.state = 'pending' then 'pending_payment'
         when g.balance <= 0 then 'redeemed'
         when g.expires_at is not null and g.expires_at <= now() then 'expired'
         when g.deliver_at is not null and g.deliver_at > now() then 'scheduled'
         when g.balance < g.initial_amount then 'partially_redeemed'
         else 'active'
       end as display_status
  from public.gift_cards g;

-- -----------------------------------------------------------------------------
-- Privileges and RLS
--   * settings: public reads the published configuration, staff edit it;
--   * cards and ledger: staff read only (never the code); no API writes;
--   * customers see their purchase through their order lines.
-- -----------------------------------------------------------------------------
revoke all on public.gift_cards, public.gift_card_transactions from anon, authenticated;
revoke all on public.gift_card_settings from anon;
revoke insert, delete, truncate, references, trigger on public.gift_card_settings from authenticated;
grant select on public.gift_card_settings to anon;

grant select (id, code_last4, state, source, currency, initial_amount, balance, order_id, order_item_id,
              purchaser_user_id, purchaser_email, recipient_name, recipient_email, sender_name, message,
              design, deliver_at, delivery_status, delivered_at, issued_at, expires_at, cancelled_at,
              created_at, updated_at)
  on public.gift_cards to authenticated;
grant select on public.gift_card_transactions to authenticated;
grant select on public.gift_card_overview to authenticated;

create policy "gift_card_settings: public reads published, admins read all"
  on public.gift_card_settings for select to anon, authenticated
  using (is_published or (select private.is_admin()));
create policy "gift_card_settings: admins update"
  on public.gift_card_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "gift_cards: admins read"
  on public.gift_cards for select to authenticated using ((select private.is_admin()));
create policy "gift_card_transactions: admins read"
  on public.gift_card_transactions for select to authenticated using ((select private.is_admin()));

revoke all on function public.refund_to_gift_cards(uuid, numeric, text) from public, anon;
revoke all on function public.issue_gift_card(numeric, text, text, text, timestamptz, text) from public, anon;
revoke all on function public.adjust_gift_card(uuid, numeric, text) from public, anon;
revoke all on function public.extend_gift_card(uuid, timestamptz, text) from public, anon;
revoke all on function public.cancel_gift_card(uuid, text) from public, anon;
revoke all on function public.record_gift_card_delivery(uuid, text, text) from public, anon, authenticated;
revoke all on function public.gift_card_balance(text) from public, anon, authenticated;
revoke all on function public.gift_card_code_for_delivery(uuid) from public, anon, authenticated;
revoke all on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[]) from public, anon, authenticated;

grant execute on function public.refund_to_gift_cards(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.issue_gift_card(numeric, text, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.adjust_gift_card(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.extend_gift_card(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.cancel_gift_card(uuid, text) to authenticated, service_role;
grant execute on function public.record_gift_card_delivery(uuid, text, text) to service_role;
grant execute on function public.gift_card_balance(text) to service_role;
grant execute on function public.gift_card_code_for_delivery(uuid) to service_role;
grant execute on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[]) to service_role;
grant execute on function private.gift_card_is_redeemable(public.gift_cards) to authenticated, service_role;
grant execute on function private.caller_is_staff_or_backend() to authenticated, service_role;
grant execute on function private.caller_jwt_role() to authenticated, service_role;

-- Audit: card lifecycle and configuration changes.
create trigger gift_cards_audit_log
  after update on public.gift_cards
  for each row execute function private.audit_changes('state', 'expires_at', 'recipient_email');
create trigger gift_card_settings_audit_log
  after update on public.gift_card_settings
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- The gift card product and its configuration (mirrors SEED_GIFT_CARD_CONFIG)
-- -----------------------------------------------------------------------------
insert into public.products (name, slug, short_description, description, sku, price, product_type, status, tax_category)
values ('Carte cadeau Global Toothgems', 'carte-cadeau',
        'Une carte cadeau livrée par e-mail.',
        'Une carte cadeau livrée par e-mail, à dépenser en une ou plusieurs fois sur les gems, les kits et les formations éligibles.',
        'GIFT-CARD', 0, 'gift_card', 'active', 'standard')
on conflict (slug) do nothing;

insert into public.product_translations (product_id, locale, name, slug, short_description, description, status)
select id, 'en', 'Global Toothgems gift card', 'gift-card', 'A gift card delivered by email.',
       'A gift card delivered by email, to spend in one go or several on eligible gems, kits and trainings.',
       'published'
  from public.products where slug = 'carte-cadeau'
on conflict (product_id, locale) do nothing;

insert into public.gift_card_settings (id, product_id, expiry_months, is_published)
select true, id, 12, true from public.products where slug = 'carte-cadeau'
on conflict (id) do nothing;
