-- =============================================================================
-- Migration — Promotions & campaigns on live data
-- =============================================================================
-- The schema (collections, segments, campaigns, promotions, codes, create_order
-- discounts) already exists since migration 022. This one adds what the back
-- office and the checkout need to use it for real:
--
--   1. admin_save_promotion(jsonb)  one promotion + its scope / segments / code
--                                   / translations, atomically
--   2. admin_save_campaign(jsonb)   one campaign + its products / translations
--   3. promotion_daily_usage        uses per day (paid orders), last 30 days
--   4. quote_basket(...)            what the basket would get: the checkout shows
--                                   the discounts before the payment step.
--                                   Same engine as create_order(), nothing is
--                                   written but the failed-code throttle.
--   5. promotion_code_attempts      throttle on refused codes (no guessing)
--
-- Writes stay under `manage_promotions` and row-level security (SECURITY
-- INVOKER); quote_basket is the only SECURITY DEFINER piece (it must read the
-- code table that visitors cannot see) and never reveals a code.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. admin_save_promotion
-- -----------------------------------------------------------------------------
-- p: { id?: uuid, name, internal_description, title: {fr, en}, description: {fr, en},
--      type, percent_off, max_discount_amount, amount_off, buy_quantity, get_quantity,
--      reward_percent, bundle_price, gift_product_id, gift_variant_id,
--      applies_to, product_ids[], excluded_product_ids[], bundle_product_ids[],
--      category_ids[], collection_ids[],
--      customer_eligibility, segment_ids[], min_subtotal_amount, min_quantity,
--      max_uses_total, max_uses_per_customer, combinable, exclude_discounted_products,
--      activation, code_kind, code, unique_code_count, unique_code_prefix,
--      starts_at, ends_at ('YYYY-MM-DDTHH:mm', local to `timezone`), timezone,
--      campaign_id, lifecycle }
-- Amounts are decimals in the promotion's currency (EUR). Returns the id.
--
-- The lifecycle is applied last: `private.validate_promotion()` only lets a
-- promotion go (or stay) live when its children exist. A live promotion being
-- edited goes through `draft` inside the transaction, so nobody sees it half
-- written and the trigger checks the finished promotion.
create or replace function public.admin_save_promotion(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id         uuid := nullif(p ->> 'id', '')::uuid;
  v_old        public.promotions;
  v_lifecycle  text := coalesce(p ->> 'lifecycle', 'draft');
  v_tz         text := coalesce(nullif(p ->> 'timezone', ''), 'Europe/Paris');
  v_activation text := coalesce(p ->> 'activation', 'automatic');
  v_kind       text := case when coalesce(p ->> 'activation', 'automatic') = 'code'
                            then coalesce(p ->> 'code_kind', 'shared') end;
  v_applies    text := coalesce(p ->> 'applies_to', 'all');
  v_customers  text := coalesce(p ->> 'customer_eligibility', 'all');
  v_type       text := p ->> 'type';
  v_starts     timestamptz;
  v_ends       timestamptz;
  v_code       text := upper(btrim(coalesce(p ->> 'code', '')));
  v_en_title   text := nullif(btrim(p #>> '{title,en}'), '');
  v_en_desc    text := nullif(btrim(p #>> '{description,en}'), '');
  v_want       integer := coalesce(nullif(p ->> 'unique_code_count', '')::integer, 0);
  v_have       integer;
  v_row        public.promotions;
begin
  if not private.has_permission('manage_promotions') then
    raise exception 'admin_save_promotion: not allowed' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'admin_save_promotion: promotion must be an object' using errcode = '22023';
  end if;
  if v_lifecycle not in ('draft', 'live', 'paused', 'archived') then
    raise exception 'admin_save_promotion: unknown lifecycle' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names n where n.name = v_tz) then
    raise exception 'admin_save_promotion: unknown time zone' using errcode = '22023';
  end if;
  -- Local date-times are read in the promotion's own time zone (summer time included).
  v_starts := (p ->> 'starts_at')::timestamp at time zone v_tz;
  v_ends   := nullif(p ->> 'ends_at', '')::timestamp at time zone v_tz;
  if v_activation = 'code' and v_kind = 'shared' and v_code !~ '^[A-Z0-9_-]{4,32}$' then
    raise exception 'admin_save_promotion: a code is 4 to 32 letters, digits, - or _' using errcode = '22023';
  end if;
  if v_en_title is null and v_en_desc is not null then
    raise exception 'admin_save_promotion: the English description needs an English title' using errcode = '22023';
  end if;

  if v_id is not null then
    select * into v_old from public.promotions where id = v_id for update;
    if not found then
      raise exception 'admin_save_promotion: promotion not found' using errcode = 'P0002';
    end if;
    -- Codes of another mode no longer apply: switched off before the type changes
    -- (a code row cannot be touched once the promotion has no code kind).
    if v_old.activation = 'code' and (v_activation <> 'code' or v_kind is distinct from v_old.code_kind) then
      update public.promotion_codes set is_active = false where promotion_id = v_id and is_active;
    end if;
  end if;

  if v_id is null then
    insert into public.promotions
      (name, internal_description, title, description, type, percent_off, max_discount_amount, amount_off,
       buy_quantity, get_quantity, reward_percent, bundle_price, gift_product_id, gift_variant_id,
       applies_to, customer_eligibility, min_subtotal_amount, min_quantity, max_uses_total, max_uses_per_customer,
       combinable, exclude_discounted_products, activation, code_kind, starts_at, ends_at, timezone, campaign_id,
       lifecycle)
    values
      (p ->> 'name', nullif(btrim(p ->> 'internal_description'), ''), p #>> '{title,fr}',
       nullif(btrim(p #>> '{description,fr}'), ''), v_type,
       (p ->> 'percent_off')::smallint, (p ->> 'max_discount_amount')::numeric, (p ->> 'amount_off')::numeric,
       (p ->> 'buy_quantity')::smallint, (p ->> 'get_quantity')::smallint, (p ->> 'reward_percent')::smallint,
       (p ->> 'bundle_price')::numeric, nullif(p ->> 'gift_product_id', '')::uuid, nullif(p ->> 'gift_variant_id', '')::uuid,
       v_applies, v_customers, (p ->> 'min_subtotal_amount')::numeric, (p ->> 'min_quantity')::smallint,
       (p ->> 'max_uses_total')::integer, (p ->> 'max_uses_per_customer')::integer,
       coalesce((p ->> 'combinable')::boolean, false), coalesce((p ->> 'exclude_discounted_products')::boolean, true),
       v_activation, v_kind, v_starts, v_ends, v_tz, nullif(p ->> 'campaign_id', '')::uuid,
       'draft')
    returning id into v_id;
  else
    -- Through `draft` while the children are replaced (see above).
    update public.promotions set
      name = p ->> 'name',
      internal_description = nullif(btrim(p ->> 'internal_description'), ''),
      title = p #>> '{title,fr}',
      description = nullif(btrim(p #>> '{description,fr}'), ''),
      type = v_type,
      percent_off = (p ->> 'percent_off')::smallint,
      max_discount_amount = (p ->> 'max_discount_amount')::numeric,
      amount_off = (p ->> 'amount_off')::numeric,
      buy_quantity = (p ->> 'buy_quantity')::smallint,
      get_quantity = (p ->> 'get_quantity')::smallint,
      reward_percent = (p ->> 'reward_percent')::smallint,
      bundle_price = (p ->> 'bundle_price')::numeric,
      gift_product_id = nullif(p ->> 'gift_product_id', '')::uuid,
      gift_variant_id = nullif(p ->> 'gift_variant_id', '')::uuid,
      applies_to = v_applies,
      customer_eligibility = v_customers,
      min_subtotal_amount = (p ->> 'min_subtotal_amount')::numeric,
      min_quantity = (p ->> 'min_quantity')::smallint,
      max_uses_total = (p ->> 'max_uses_total')::integer,
      max_uses_per_customer = (p ->> 'max_uses_per_customer')::integer,
      combinable = coalesce((p ->> 'combinable')::boolean, false),
      exclude_discounted_products = coalesce((p ->> 'exclude_discounted_products')::boolean, true),
      activation = v_activation,
      code_kind = v_kind,
      starts_at = v_starts,
      ends_at = v_ends,
      timezone = v_tz,
      campaign_id = nullif(p ->> 'campaign_id', '')::uuid,
      lifecycle = case when v_old.lifecycle = 'archived' then 'archived' else 'draft' end
    where id = v_id;
  end if;

  -- Scope, segments ---------------------------------------------------------------
  delete from public.promotion_products where promotion_id = v_id;
  delete from public.promotion_categories where promotion_id = v_id;
  delete from public.promotion_collections where promotion_id = v_id;
  delete from public.promotion_segments where promotion_id = v_id;

  if v_applies = 'products' then
    insert into public.promotion_products (promotion_id, product_id, role)
    select v_id, x::uuid, 'eligible' from jsonb_array_elements_text(coalesce(p -> 'product_ids', '[]'::jsonb)) x
    on conflict do nothing;
  elsif v_applies = 'categories' then
    insert into public.promotion_categories (promotion_id, category_id)
    select v_id, x::uuid from jsonb_array_elements_text(coalesce(p -> 'category_ids', '[]'::jsonb)) x
    on conflict do nothing;
  elsif v_applies = 'collections' then
    insert into public.promotion_collections (promotion_id, collection_id)
    select v_id, x::uuid from jsonb_array_elements_text(coalesce(p -> 'collection_ids', '[]'::jsonb)) x
    on conflict do nothing;
  end if;
  insert into public.promotion_products (promotion_id, product_id, role)
  select v_id, x::uuid, 'excluded' from jsonb_array_elements_text(coalesce(p -> 'excluded_product_ids', '[]'::jsonb)) x
  on conflict do nothing;
  if v_type = 'bundle' then
    insert into public.promotion_products (promotion_id, product_id, role)
    select v_id, x::uuid, 'bundle' from jsonb_array_elements_text(coalesce(p -> 'bundle_product_ids', '[]'::jsonb)) x
    on conflict do nothing;
  end if;
  if v_customers = 'segments' then
    insert into public.promotion_segments (promotion_id, segment_id)
    select v_id, x::uuid from jsonb_array_elements_text(coalesce(p -> 'segment_ids', '[]'::jsonb)) x
    on conflict do nothing;
  end if;

  -- Customer-facing words: French in the base columns, English as a translation.
  if v_en_title is null then
    delete from public.promotion_translations where promotion_id = v_id and locale = 'en';
  else
    insert into public.promotion_translations (promotion_id, locale, title, description, status)
    values (v_id, 'en', v_en_title, v_en_desc, 'published')
    on conflict (promotion_id, locale) do update
      set title = excluded.title, description = excluded.description, status = 'published', updated_at = now();
  end if;

  -- Codes -----------------------------------------------------------------------
  if v_activation = 'code' and v_kind = 'shared' then
    -- A code that was switched off comes back; a code of another promotion fails on the unique index (23505).
    update public.promotion_codes set is_active = true where promotion_id = v_id and code = v_code and not is_active;
    if not exists (select 1 from public.promotion_codes where promotion_id = v_id and code = v_code) then
      update public.promotion_codes set is_active = false where promotion_id = v_id and is_active;
      insert into public.promotion_codes (promotion_id, code) values (v_id, v_code);
    else
      update public.promotion_codes set is_active = false where promotion_id = v_id and is_active and code <> v_code;
    end if;
  elsif v_activation = 'code' and v_kind = 'unique' then
    select count(*) into v_have from public.promotion_codes where promotion_id = v_id and is_active;
    if v_want > v_have then
      perform count(*) from public.generate_promotion_codes(v_id, v_want - v_have, coalesce(p ->> 'unique_code_prefix', ''));
    end if;
  end if;

  -- The lifecycle last: validate_promotion() now sees the finished promotion.
  if v_lifecycle <> 'draft' or v_old.lifecycle = 'archived' then
    update public.promotions set lifecycle = v_lifecycle where id = v_id and lifecycle is distinct from v_lifecycle
    returning * into v_row;
  end if;
  return v_id;
end;
$$;

comment on function public.admin_save_promotion(jsonb) is
  'Back office: creates or updates a promotion with its scope, segments, code and English text in one transaction (manage_promotions, RLS applies).';

-- -----------------------------------------------------------------------------
-- 2. admin_save_campaign
-- -----------------------------------------------------------------------------
-- p: { id?: uuid, name, internal_description, title: {fr, en}, description: {fr, en},
--      starts_at, ends_at ('YYYY-MM-DDTHH:mm' local to `timezone`), timezone, theme,
--      cover_path, product_ids[] (ordered), lifecycle }
create or replace function public.admin_save_campaign(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id        uuid := nullif(p ->> 'id', '')::uuid;
  v_tz        text := coalesce(nullif(p ->> 'timezone', ''), 'Europe/Paris');
  v_starts    timestamptz;
  v_ends      timestamptz;
  v_en_title  text := nullif(btrim(p #>> '{title,en}'), '');
  v_en_desc   text := nullif(btrim(p #>> '{description,en}'), '');
begin
  if not private.has_permission('manage_promotions') then
    raise exception 'admin_save_campaign: not allowed' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'admin_save_campaign: campaign must be an object' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names n where n.name = v_tz) then
    raise exception 'admin_save_campaign: unknown time zone' using errcode = '22023';
  end if;
  if coalesce(p ->> 'lifecycle', 'draft') not in ('draft', 'live', 'paused', 'archived') then
    raise exception 'admin_save_campaign: unknown lifecycle' using errcode = '22023';
  end if;
  if v_en_title is null and v_en_desc is not null then
    raise exception 'admin_save_campaign: the English description needs an English title' using errcode = '22023';
  end if;
  v_starts := (p ->> 'starts_at')::timestamp at time zone v_tz;
  v_ends   := (p ->> 'ends_at')::timestamp at time zone v_tz;

  if v_id is null then
    insert into public.campaigns
      (name, internal_description, title, description, starts_at, ends_at, timezone, theme, cover_path, lifecycle)
    values
      (p ->> 'name', nullif(btrim(p ->> 'internal_description'), ''), p #>> '{title,fr}',
       nullif(btrim(p #>> '{description,fr}'), ''), v_starts, v_ends, v_tz,
       coalesce(p ->> 'theme', 'sparkle'), nullif(p ->> 'cover_path', ''), coalesce(p ->> 'lifecycle', 'draft'))
    returning id into v_id;
  else
    update public.campaigns set
      name = p ->> 'name',
      internal_description = nullif(btrim(p ->> 'internal_description'), ''),
      title = p #>> '{title,fr}',
      description = nullif(btrim(p #>> '{description,fr}'), ''),
      starts_at = v_starts,
      ends_at = v_ends,
      timezone = v_tz,
      theme = coalesce(p ->> 'theme', 'sparkle'),
      cover_path = nullif(p ->> 'cover_path', ''),
      lifecycle = coalesce(p ->> 'lifecycle', 'draft')
    where id = v_id;
    if not found then
      raise exception 'admin_save_campaign: campaign not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.campaign_products where campaign_id = v_id;
  insert into public.campaign_products (campaign_id, product_id, position)
  select v_id, x.value::uuid, (x.ordinality - 1)::integer
    from jsonb_array_elements_text(coalesce(p -> 'product_ids', '[]'::jsonb)) with ordinality as x(value, ordinality)
  on conflict do nothing;

  if v_en_title is null then
    delete from public.campaign_translations where campaign_id = v_id and locale = 'en';
  else
    insert into public.campaign_translations (campaign_id, locale, title, description, status)
    values (v_id, 'en', v_en_title, v_en_desc, 'published')
    on conflict (campaign_id, locale) do update
      set title = excluded.title, description = excluded.description, status = 'published', updated_at = now();
  end if;
  return v_id;
end;
$$;

comment on function public.admin_save_campaign(jsonb) is
  'Back office: creates or updates a campaign with its products and English text in one transaction (manage_promotions, RLS applies).';

-- -----------------------------------------------------------------------------
-- 3. promotion_daily_usage
-- -----------------------------------------------------------------------------
-- Orders that used a promotion, per day of payment (shop time), last 30 days.
create view public.promotion_daily_usage
with (security_invoker = true) as
select d.promotion_id,
       (o.paid_at at time zone 'Europe/Paris')::date as day,
       count(*)                                      as uses
  from public.order_discounts d
  join public.orders o on o.id = d.order_id
 where d.promotion_id is not null
   and o.payment_status in ('paid', 'partially_refunded', 'refunded')
   and o.paid_at >= now() - interval '30 days'
 group by d.promotion_id, (o.paid_at at time zone 'Europe/Paris')::date;

comment on view public.promotion_daily_usage is 'Uses of each promotion per day of payment, last 30 days (staff, RLS applies).';
revoke all on public.promotion_daily_usage from anon, authenticated;
grant select on public.promotion_daily_usage to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Refused codes are throttled
-- -----------------------------------------------------------------------------
create table public.promotion_code_attempts (
  id         bigint generated always as identity primary key,
  actor      text not null,                       -- the account, else the caller's address
  created_at timestamptz not null default now()
);

comment on table public.promotion_code_attempts is
  'Refused promotion codes typed through quote_basket(), per caller: the throttle against guessing. Never readable through the API.';
create index promotion_code_attempts_actor_idx on public.promotion_code_attempts (actor, created_at desc);
alter table public.promotion_code_attempts enable row level security;
revoke all on public.promotion_code_attempts from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. quote_basket
-- -----------------------------------------------------------------------------
-- What a shop basket would receive, computed by the same engine as create_order()
-- so the checkout can show it before the payment step.
--   p_items: [{product_id, variant_id, quantity}] — shop goods only (gift cards and
--            courses never take part in discounts)
--   p_shipping_rate_id: the delivery rate the customer chose (null: none yet)
-- Answer: {"ok": true, "goods_discount", "shipping_discount", "discounts": [{label, code,
--   type, goods_amount, shipping_amount}], "gift_lines": [{product_name, variant_name}]}
--   or {"ok": false, "error": "promotion_code_invalid" | "loyalty_reward_unavailable" |
--   "too_many_attempts" | "unavailable"}. Amounts are decimals in `p_currency`.
-- The account is the caller's (auth.uid()); a guest is quoted without e-mail, so
-- "new customer" and per-customer limits are only settled by create_order().
-- Nothing is reserved or consumed. Refusals of a typed code are counted: 10 within
-- 10 minutes per account (or address) lock the codes for a while.
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
    begin
      v_headers := current_setting('request.headers', true);
      v_actor := 'ip:' || coalesce(nullif(btrim(split_part(coalesce((v_headers::jsonb) ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
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

  return jsonb_build_object(
    'ok', true,
    'goods_discount', coalesce((select sum((l ->> 'discount_amount')::numeric) from jsonb_array_elements(v_result -> 'lines') l), 0),
    'shipping_discount', (v_result ->> 'shipping_discount')::numeric,
    'discounts', coalesce((select jsonb_agg(jsonb_build_object(
                    'label', d ->> 'label', 'code', d ->> 'code', 'type', coalesce(d ->> 'promotion_type', d ->> 'source'),
                    'goods_amount', (d ->> 'goods_amount')::numeric, 'shipping_amount', (d ->> 'shipping_amount')::numeric))
                    from jsonb_array_elements(v_result -> 'discounts') d), '[]'::jsonb),
    'gift_lines', coalesce((select jsonb_agg(jsonb_build_object(
                    'product_name', l ->> 'product_name', 'variant_name', l ->> 'variant_name'))
                    from jsonb_array_elements(v_result -> 'lines') l
                   where coalesce((l ->> 'is_promo_gift')::boolean, false)), '[]'::jsonb));
end;
$$;

comment on function public.quote_basket(jsonb, text[], uuid, boolean, text, text) is
  'Checkout preview: discounts a shop basket would get (promotions or loyalty reward), by the engine of create_order(). Writes nothing but the refused-code throttle.';

revoke all on function public.admin_save_promotion(jsonb), public.admin_save_campaign(jsonb) from public, anon;
grant execute on function public.admin_save_promotion(jsonb), public.admin_save_campaign(jsonb) to authenticated, service_role;
revoke all on function public.quote_basket(jsonb, text[], uuid, boolean, text, text) from public;
grant execute on function public.quote_basket(jsonb, text[], uuid, boolean, text, text) to anon, authenticated, service_role;
