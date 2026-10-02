-- =============================================================================
-- Iteration 23 — Academy course sales (phase D): a course is bought through the
-- same cart, order and Stripe Checkout as the shop.
-- =============================================================================
-- A course is not a product (owner, 2026-10-01), so an order line now names
-- either a product (catalogue, gift card) or a course:
--   * `order_items.course_id` (RESTRICT: a sold course is never deleted — the
--     lifecycle already forbids deleting a course that was ever published);
--     a course line has no product, no variant, no stock.
--   * `create_order()` accepts `{"course_id": uuid, "quantity": 1}` lines:
--     published course only, one seat per line, the buyer's ACCOUNT required
--     (access is granted to an account; guest orders have none), refused when
--     the buyer already holds the course, priced from `course_current_prices`
--     (course promotion applied), VAT category `training` at the billing
--     country when nothing is shipped. Shop promotions, codes and the loyalty
--     reward never touch course lines; courses do not count for shipping
--     thresholds. Gift cards can pay for them like for anything but gift cards.
--   * Payment (`payment_status` → paid, whatever the path: verified Stripe
--     webhook through `mark_order_paid()`, gift cards covering everything, staff
--     marking a transfer paid) inserts a `purchase` entitlement per course line.
--     An expired, unrevoked entitlement is closed first; when the member already
--     holds the course (bought twice in parallel, or granted by hand meanwhile)
--     nothing is added and the order gets an [auto] note for the team (refund).
--   * A full refund (`payment_status` → refunded, or `status` → refunded)
--     revokes the purchase entitlements of that order. Cancellation needs
--     nothing: an unpaid order never granted anything.
--   * Shipments: a course line is never put in a parcel and does not count as
--     something to ship.
-- Analytics (`analytics_sale_lines`), review requests and loyalty stamps join
-- `products`, so course lines stay out of them: training figures remain null
-- (decision 33) and courses earn no stamp (decision 49, to confirm).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Course lines
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column course_id uuid references public.courses (id) on delete restrict,
  add constraint order_items_course_line check (course_id is null or (product_id is null and variant_id is null));

comment on column public.order_items.course_id is
  'Academy course sold on this line (phase D). Exclusive with product_id / variant_id; access granted on payment.';

create index order_items_course_idx on public.order_items (course_id) where course_id is not null;

-- -----------------------------------------------------------------------------
-- 2. create_order: course lines (same signature, grants unchanged)
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
  'Server-only checkout. Prices, shipping, promotions / loyalty reward, VAT and gift card payments are computed here, never trusted from the client. Lines: products, gift cards, courses (account required).';

-- -----------------------------------------------------------------------------
-- 3. Access from payment, revoked by a full refund
--    BEFORE trigger named to run after the stock and gift card transitions and
--    before orders_zz_move_admin_note (which files the [auto] note).
-- -----------------------------------------------------------------------------
create or replace function private.apply_order_course_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_open public.course_entitlements;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    for v_line in
      select distinct i.course_id, i.product_name
        from public.order_items i
       where i.order_id = new.id and i.course_id is not null
    loop
      if new.user_id is null then
        new.admin_note := concat_ws(E'\n', new.admin_note,
          '[auto] Formation payée sans compte client : accès non attribué (' || v_line.product_name || ').');
        continue;
      end if;
      -- Already bought for this order (a replayed transition): nothing to do.
      continue when exists (select 1 from public.course_entitlements e
                             where e.order_id = new.id and e.course_id = v_line.course_id and e.source = 'purchase');

      v_open := null;
      select e.* into v_open from public.course_entitlements e
       where e.user_id = new.user_id and e.course_id = v_line.course_id and e.revoked_at is null
       for update;
      if v_open.id is not null and (v_open.expires_at is null or v_open.expires_at > now()) then
        new.admin_note := concat_ws(E'\n', new.admin_note,
          '[auto] Formation déjà détenue par le client au paiement : aucun accès ajouté (' || v_line.product_name
          || '). Rembourser la ligne si nécessaire.');
        continue;
      end if;
      if v_open.id is not null then
        update public.course_entitlements set revoked_at = now(), revoked_by = null where id = v_open.id;
      end if;

      insert into public.course_entitlements (user_id, course_id, source, order_id)
      values (new.user_id, v_line.course_id, 'purchase', new.id);
    end loop;
  end if;

  if (new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded')
     or (new.status = 'refunded' and old.status is distinct from 'refunded') then
    update public.course_entitlements
       set revoked_at = now(), revoked_by = auth.uid()
     where order_id = new.id and source = 'purchase' and revoked_at is null;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_order_course_transitions() from public, anon, authenticated;

-- `orders_stock_transitions_zc_courses` sorts after `orders_stock_transitions_z_gift_cards`
-- and before `orders_zz_move_admin_note`.
create trigger orders_stock_transitions_zc_courses
  before update of status, payment_status on public.orders
  for each row execute function private.apply_order_course_transitions();

-- -----------------------------------------------------------------------------
-- 4. Shipments: course lines are not parcels
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
  if v_shipped + new.quantity > v_item.quantity then
    raise exception 'shipment_items: % of % units already allocated to parcels', v_shipped, v_item.quantity
      using errcode = '23514';
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

  select coalesce(sum(i.quantity), 0) into v_to_ship
    from public.order_items i
    left join public.products p on p.id = i.product_id
   where i.order_id = p_order_id and i.course_id is null and coalesce(p.product_type, 'physical') = 'physical';

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
