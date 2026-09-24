-- =============================================================================
-- Migration 018 — create_order(): reject sub-cent gift card amounts
-- =============================================================================
-- Migration 016 stored the requested gift card amount in a numeric(12,2)
-- variable, which ROUNDS on assignment: 33.333 became 33.33 and passed the
-- "at most two decimals" check. The amount is now held unconstrained so the
-- check sees what the client sent. Caught by the iteration 4 validation suite.
-- Only that declaration changes; the function body is otherwise identical.
-- =============================================================================

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
