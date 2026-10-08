-- quote_basket(): also answers the discount carried by each basket line (`lines`: product, variant, amount), so
-- the checkout can show a promotion on the very lines it applies to. Free gift lines are not part of the basket.

create or replace function public.quote_basket(
  p_items              jsonb,
  p_promotion_codes    text[] default null,
  p_shipping_rate_id   uuid default null,
  p_use_loyalty_reward boolean default false,
  p_currency           text default 'EUR',
  p_locale             text default 'fr'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_email    text;
  v_actor    text;
  v_item     jsonb;
  v_qty      integer;
  v_product  public.products;
  v_variant  public.product_variants;
  v_lines    jsonb := '[]'::jsonb;
  v_subtotal numeric(12, 2) := 0;
  v_price    numeric(12, 2);
  v_rate     public.shipping_rates;
  v_shipping numeric(12, 2) := 0;
  v_result   jsonb;
  v_codes    text[] := coalesce(p_promotion_codes, '{}'::text[]);
  v_recent   integer;
  v_headers  text;
begin
  p_currency := upper(coalesce(p_currency, 'EUR'));
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  if cardinality(v_codes) > 3 then
    return jsonb_build_object('ok', false, 'error', 'promotion_code_invalid');
  end if;
  if not exists (select 1 from public.languages l where l.code = coalesce(p_locale, 'fr') and l.is_enabled) then
    p_locale := 'fr';
  end if;

  -- Who is asking, for the throttle: the account, else the caller's address.
  if v_user is not null then
    v_actor := 'user:' || v_user;
    select lower(pr.email) into v_email from public.profiles pr where pr.id = v_user and pr.status = 'active';
  else
    -- The address the platform saw: `sb-forwarded-for` (set by Supabase's edge) or `cf-connecting-ip` (Cloudflare).
    -- The first entry of `x-forwarded-for` is whatever the caller sent, so it is never used.
    begin
      v_headers := current_setting('request.headers', true);
      v_actor := 'ip:' || coalesce(nullif(btrim((v_headers::jsonb) ->> 'sb-forwarded-for'), ''),
                                   nullif(btrim((v_headers::jsonb) ->> 'cf-connecting-ip'), ''), 'unknown');
    exception when others then
      v_actor := 'ip:unknown';
    end;
  end if;
  if cardinality(v_codes) > 0 then
    select count(*) into v_recent from public.promotion_code_attempts a
     where a.actor = v_actor and a.created_at > now() - interval '10 minutes';
    if v_recent >= 10 then
      return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then
      return jsonb_build_object('ok', false, 'error', 'unavailable');
    end if;
    select * into v_product from public.products
     where id = (v_item ->> 'product_id')::uuid and status = 'active' and product_type <> 'gift_card'
       and currency = p_currency;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'unavailable');
    end if;
    v_variant := null;
    if nullif(v_item ->> 'variant_id', '') is not null then
      select * into v_variant from public.product_variants
       where id = (v_item ->> 'variant_id')::uuid and product_id = v_product.id and is_active;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'unavailable');
      end if;
    end if;
    v_price := coalesce(v_variant.price, v_product.price);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id, 'variant_id', v_variant.id,
      'product_name', v_product.name, 'variant_name', v_variant.name,
      'sku', coalesce(v_variant.sku, v_product.sku),
      'unit_price', v_price, 'quantity', v_qty, 'line_total', v_price * v_qty,
      'tax_category', v_product.tax_category, 'inventory_item_id', null);
  end loop;
  if jsonb_array_length(v_lines) = 0 then
    return jsonb_build_object('ok', true, 'goods_discount', 0, 'shipping_discount', 0,
                              'discounts', '[]'::jsonb, 'gift_lines', '[]'::jsonb);
  end if;

  -- The delivery the customer picked (price and free-shipping threshold, as create_order()).
  if p_shipping_rate_id is not null then
    select r.* into v_rate from public.shipping_rates r
      join public.shipping_zones z on z.id = r.zone_id and z.is_active
     where r.id = p_shipping_rate_id and r.is_active and r.currency = p_currency;
    if found then
      v_shipping := case when v_rate.free_over_amount is not null and v_subtotal >= v_rate.free_over_amount
                         then 0 else v_rate.price end;
    end if;
  end if;

  begin
    v_result := private.compute_order_discounts(v_lines, v_user, v_email, p_currency, v_shipping,
                                                p_promotion_codes, coalesce(p_use_loyalty_reward, false), p_locale);
  exception
    when sqlstate 'P0002' or sqlstate '22023' or sqlstate '42501' then
      -- A refused code, an unavailable reward, a guest asking for the reward.
      if cardinality(v_codes) > 0 and sqlerrm like '%is not valid for this order%' then
        insert into public.promotion_code_attempts (actor) values (v_actor);
        delete from public.promotion_code_attempts where created_at < now() - interval '1 day';
        return jsonb_build_object('ok', false, 'error', 'promotion_code_invalid');
      end if;
      return jsonb_build_object('ok', false, 'error',
        case when coalesce(p_use_loyalty_reward, false) then 'loyalty_reward_unavailable' else 'unavailable' end);
  end;

  -- A "gift with purchase" adds a free line that is not in the customer's basket: its price and its discount
  -- cancel out, so they are left out of the amounts below (the line is listed in `gift_lines`).
  return jsonb_build_object(
    'ok', true,
    'goods_discount', coalesce((select sum((l ->> 'discount_amount')::numeric) from jsonb_array_elements(v_result -> 'lines') l
                                 where not coalesce((l ->> 'is_promo_gift')::boolean, false)), 0),
    'shipping_discount', (v_result ->> 'shipping_discount')::numeric,
    'discounts', coalesce((select jsonb_agg(jsonb_build_object(
                    'label', d ->> 'label', 'code', d ->> 'code', 'type', coalesce(d ->> 'promotion_type', d ->> 'source'),
                    'goods_amount', greatest((d ->> 'goods_amount')::numeric - case when d ->> 'promotion_type' = 'gift' then
                        coalesce((select sum((g ->> 'line_total')::numeric) from jsonb_array_elements(v_result -> 'lines') g
                                   where coalesce((g ->> 'is_promo_gift')::boolean, false)
                                     and (g ->> 'product_id')::uuid = (select pr.gift_product_id from public.promotions pr
                                                                         where pr.id = (d ->> 'promotion_id')::uuid)), 0)
                        else 0 end, 0),
                    'shipping_amount', (d ->> 'shipping_amount')::numeric))
                    from jsonb_array_elements(v_result -> 'discounts') d), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                    'product_id', l ->> 'product_id', 'variant_id', l ->> 'variant_id',
                    'discount_amount', (l ->> 'discount_amount')::numeric))
                    from jsonb_array_elements(v_result -> 'lines') l
                   where not coalesce((l ->> 'is_promo_gift')::boolean, false)
                     and (l ->> 'discount_amount')::numeric > 0), '[]'::jsonb),
    'gift_lines', coalesce((select jsonb_agg(jsonb_build_object(
                    'product_name', l ->> 'product_name', 'variant_name', l ->> 'variant_name'))
                    from jsonb_array_elements(v_result -> 'lines') l
                   where coalesce((l ->> 'is_promo_gift')::boolean, false)), '[]'::jsonb));
end;
$$;

comment on function public.quote_basket(jsonb, text[], uuid, boolean, text, text) is
  'Checkout preview: discounts a shop basket would get (promotions or loyalty reward) in total and per line, by the engine of create_order(). Writes nothing but the refused-code throttle (per account, else per platform-seen address).';
