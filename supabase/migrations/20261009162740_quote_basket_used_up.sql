-- quote_basket(): knows a guest by the e-mail typed in the checkout form (`p_email`, ignored when signed in), as
-- create_order() does, and lists the automatic promotions the customer has already used up (`used_up`), so the
-- checkout can say why the shop window's promotion price no longer applies.
--
-- promotion_email_lookups: the throttle on those guest look-ups (5 new addresses per caller per 10 minutes).

create table public.promotion_email_lookups (
  id         bigint generated always as identity primary key,
  actor      text not null,                       -- the caller's address, as for promotion_code_attempts
  email_hash text not null,                       -- sha-256 of the lower-cased address: never the address itself
  created_at timestamptz not null default now()
);
alter table public.promotion_email_lookups enable row level security;
revoke all on table public.promotion_email_lookups from anon, authenticated;
create index promotion_email_lookups_actor_idx on public.promotion_email_lookups (actor, created_at desc);
comment on table public.promotion_email_lookups is
  'Guest e-mails looked up by quote_basket() for per-customer promotion limits, hashed, per caller: the throttle against probing addresses. Kept one day. Never readable through the API.';

drop function public.quote_basket(jsonb, text[], uuid, boolean, text, text);

create function public.quote_basket(
  p_items              jsonb,
  p_promotion_codes    text[] default null,
  p_shipping_rate_id   uuid default null,
  p_use_loyalty_reward boolean default false,
  p_currency           text default 'EUR',
  p_locale             text default 'fr',
  p_email              text default null
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
  v_hash     text;
  v_rich     jsonb;
  v_used_up  jsonb := '[]'::jsonb;
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
  -- A guest's e-mail, once typed in the checkout form: the per-customer limits of create_order() are checked on it,
  -- so the preview matches the order. Looking up a new address is throttled per caller (5 a 10 minutes); past
  -- that, the guest is quoted as unknown, as before, and create_order() stays the authority.
  if v_user is null and p_email is not null then
    v_email := lower(btrim(p_email));
    if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
      v_email := null;
    else
      v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
      if not exists (select 1 from public.promotion_email_lookups l
                      where l.actor = v_actor and l.email_hash = v_hash and l.created_at > now() - interval '10 minutes') then
        if (select count(distinct l.email_hash) from public.promotion_email_lookups l
             where l.actor = v_actor and l.created_at > now() - interval '10 minutes') >= 5 then
          v_email := null;
        else
          insert into public.promotion_email_lookups (actor, email_hash) values (v_actor, v_hash);
          delete from public.promotion_email_lookups where created_at < now() - interval '1 day';
        end if;
      end if;
    end if;
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
                              'discounts', '[]'::jsonb, 'gift_lines', '[]'::jsonb, 'used_up', '[]'::jsonb);
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

  -- Automatic promotions this basket would get but this customer (account, else the guest's e-mail) has already had
  -- as often as allowed, on orders paid for: said at the checkout, so the shop window's price is not a surprise. A
  -- use held by an order still waiting for its payment is not reported (it is released if that payment is left).
  if v_user is not null or v_email is not null then
    select coalesce(jsonb_agg(l || jsonb_build_object(
             'idx', n,
             'category_id', pr.category_id,
             'on_sale', coalesce(v.compare_at_price, pr.compare_at_price) is not null,
             'is_gift_card', l ->> 'tax_category' = 'gift_card') order by n), '[]'::jsonb)
      into v_rich
      from jsonb_array_elements(v_lines) with ordinality as t(l, n)
      join public.products pr on pr.id = (l ->> 'product_id')::uuid
      left join public.product_variants v on v.id = nullif(l ->> 'variant_id', '')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
             'label', coalesce((select t.title from public.promotion_translations t
                                 where t.promotion_id = p.id and t.locale = p_locale and t.status = 'published'), p.title),
             'max_uses', p.max_uses_per_customer) order by p.created_at, p.id), '[]'::jsonb)
      into v_used_up
      from public.promotions p
     where p.activation = 'automatic' and p.lifecycle = 'live' and p.currency = p_currency
       and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())
       and p.max_uses_per_customer is not null
       and not exists (select 1 from jsonb_array_elements(v_result -> 'discounts') d
                        where d ->> 'promotion_id' = p.id::text)
       and (select count(*) from public.order_discounts d join public.orders o on o.id = d.order_id
             where d.promotion_id = p.id and o.status <> 'cancelled'
               and o.payment_status in ('paid', 'partially_refunded', 'refunded')
               and ((v_user is not null and d.user_id = v_user) or lower(d.customer_email) = v_email)) >= p.max_uses_per_customer
       and private.promotion_applies(p, v_rich, null, null, p_currency);
  end if;

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
                   where coalesce((l ->> 'is_promo_gift')::boolean, false)), '[]'::jsonb),
    'used_up', v_used_up);
end;
$$;

comment on function public.quote_basket(jsonb, text[], uuid, boolean, text, text, text) is
  'Checkout preview: discounts a shop basket would get (promotions or loyalty reward) in total and per line, by the engine of create_order(), and the automatic promotions the customer has used up (account, else the guest e-mail given). Writes nothing but its throttles (refused codes, guest e-mails looked up).';

revoke all on function public.quote_basket(jsonb, text[], uuid, boolean, text, text, text) from public;
grant execute on function public.quote_basket(jsonb, text[], uuid, boolean, text, text, text) to anon, authenticated, service_role;
