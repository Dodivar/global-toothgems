-- =============================================================================
-- Loyalty reward and promotions: the best for the customer, or both when allowed
-- =============================================================================
-- Until now spending the loyalty reward switched every promotion off (decision 14) and refused a typed code.
-- Now compute_order_discounts() compares, for a basket where the reward is requested:
--   * promotions alone (automatic ones and typed codes, as before) — the reward is NOT consumed;
--   * the reward alone;
--   * promotions flagged `combinable_with_loyalty` (one alone, or the combinable ones together) + the reward on
--     what they leave;
-- and applies whatever gives the customer the most (a tie goes to promotions, then to the mixed option, so the
-- reward is kept whenever it adds nothing). `promotions.combinable_with_loyalty` (default false) is set per
-- promotion in the back office. A typed code no longer conflicts with the reward: it simply may not be the
-- best option. The reward is reserved only when its row is among the discounts (create_order() already
-- does that per row).

alter table public.promotions add column combinable_with_loyalty boolean not null default false;
comment on column public.promotions.combinable_with_loyalty is
  'The loyalty reward may be added on top of this promotion (on what it leaves). Default: the reward and the promotion exclude each other, the better one wins.';

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
  -- A draft may wait for its code; publishing it without one is refused by validate_promotion().
  if v_activation = 'code' and v_kind = 'shared' and v_code <> '' and v_code !~ '^[A-Z0-9_-]{4,32}$' then
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
       combinable, combinable_with_loyalty, exclude_discounted_products, activation, code_kind, starts_at, ends_at, timezone,
       campaign_id, lifecycle)
    values
      (p ->> 'name', nullif(btrim(p ->> 'internal_description'), ''), p #>> '{title,fr}',
       nullif(btrim(p #>> '{description,fr}'), ''), v_type,
       (p ->> 'percent_off')::smallint, (p ->> 'max_discount_amount')::numeric, (p ->> 'amount_off')::numeric,
       (p ->> 'buy_quantity')::smallint, (p ->> 'get_quantity')::smallint, (p ->> 'reward_percent')::smallint,
       (p ->> 'bundle_price')::numeric, nullif(p ->> 'gift_product_id', '')::uuid, nullif(p ->> 'gift_variant_id', '')::uuid,
       v_applies, v_customers, (p ->> 'min_subtotal_amount')::numeric, (p ->> 'min_quantity')::smallint,
       (p ->> 'max_uses_total')::integer, (p ->> 'max_uses_per_customer')::integer,
       coalesce((p ->> 'combinable')::boolean, false), coalesce((p ->> 'combinable_with_loyalty')::boolean, false),
       coalesce((p ->> 'exclude_discounted_products')::boolean, true),
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
      combinable_with_loyalty = coalesce((p ->> 'combinable_with_loyalty')::boolean, false),
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
  if v_activation = 'code' and v_kind = 'shared' and v_code = '' then
    update public.promotion_codes set is_active = false where promotion_id = v_id and is_active;
  elsif v_activation = 'code' and v_kind = 'shared' then
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

-- The reward applied on what the discounts so far leave (gift card lines and free gift lines excluded).
-- Returns {"disc": merged per-line discounts, "amount": n, "row": order_discounts row | null}.
create or replace function private.loyalty_on_top(
  p_lines   jsonb,
  p_disc    jsonb,
  p_percent numeric,
  p_card    uuid,
  p_locale  text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_weights jsonb;
  v_total   numeric;
  v_extra   jsonb;
  v_amount  numeric;
  v_merged  jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'idx', l ->> 'idx',
           'weight', (l ->> 'line_total')::numeric - coalesce((p_disc ->> (l ->> 'idx'))::numeric, 0))), '[]'::jsonb),
         coalesce(sum((l ->> 'line_total')::numeric - coalesce((p_disc ->> (l ->> 'idx'))::numeric, 0)), 0)
    into v_weights, v_total
    from jsonb_array_elements(p_lines) l
   where not coalesce((l ->> 'is_gift_card')::boolean, false)
     and not coalesce((l ->> 'is_promo_gift')::boolean, false);
  v_extra := private.allocate_discount(round(v_total * p_percent / 100, 2), v_weights);
  select coalesce(sum(value::numeric), 0) into v_amount from jsonb_each_text(v_extra);
  select p_disc || coalesce(jsonb_object_agg(k, coalesce((p_disc ->> k)::numeric, 0) + v::numeric), '{}'::jsonb)
    into v_merged
    from jsonb_each_text(v_extra) as t(k, v);
  return jsonb_build_object(
    'disc', coalesce(v_merged, p_disc),
    'amount', v_amount,
    'row', case when v_amount > 0 then jsonb_build_object(
             'source', 'loyalty', 'loyalty_card_id', p_card, 'promotion_type', null,
             'label', case when p_locale = 'fr' then 'Récompense fidélité -' else 'Loyalty reward -' end || p_percent || ' %',
             'goods_amount', v_amount, 'shipping_amount', 0) end);
end;
$$;

revoke all on function private.loyalty_on_top(jsonb, jsonb, numeric, uuid, text) from public;
grant execute on function private.loyalty_on_top(jsonb, jsonb, numeric, uuid, text) to service_role;

create or replace function private.compute_order_discounts(
  p_lines        jsonb,
  p_user_id      uuid,
  p_email        text,
  p_currency     text,
  p_shipping     numeric,
  p_codes        text[],
  p_use_loyalty  boolean,
  p_locale       text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lines      jsonb;
  v_codes      text[];
  v_code       text;
  v_code_row   public.promotion_codes;
  v_promo      public.promotions;
  v_used       integer;
  v_cands      jsonb := '[]'::jsonb;   -- [{promotion_id, promotion_code_id, code, combinable, with_loyalty, type, created_at}]
  c            jsonb;
  v_option     jsonb;
  v_best       jsonb;                  -- promotions alone
  v_settings   public.loyalty_settings;
  v_card       public.loyalty_cards;
  v_top        jsonb;
  v_mixed      jsonb;                  -- best "promotions + reward" option: {run, top, benefit}
  v_mixed_b    numeric;
  v_loyal      jsonb;                  -- the reward alone
  v_disc       jsonb;
  v_discounts  jsonb;
  v_ship_disc  numeric := 0;
  v_choice     text := 'none';
  v_benefit    numeric;
  v_b          numeric := 0;
begin
  -- Enrich lines: position, category, already on sale, gift card.
  select coalesce(jsonb_agg(l || jsonb_build_object(
           'idx', n,
           'category_id', pr.category_id,
           'on_sale', coalesce(v.compare_at_price, pr.compare_at_price) is not null,
           'is_gift_card', l ->> 'tax_category' = 'gift_card') order by n), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(p_lines) with ordinality as t(l, n)
    join public.products pr on pr.id = (l ->> 'product_id')::uuid
    left join public.product_variants v on v.id = nullif(l ->> 'variant_id', '')::uuid;

  v_codes := array(select distinct upper(btrim(x)) from unnest(coalesce(p_codes, '{}'::text[])) as x
                    where btrim(x) <> '');
  if cardinality(v_codes) > 3 then
    raise exception 'create_order: at most 3 promotion codes' using errcode = '22023';
  end if;

  -- The reward, when requested: the account's oldest completed card (locked) and the programme's currency.
  if coalesce(p_use_loyalty, false) then
    if p_user_id is null then
      raise exception 'create_order: the loyalty reward requires an account' using errcode = '42501';
    end if;
    select * into v_settings from public.loyalty_settings where id;
    if not found or v_settings.currency <> p_currency then
      raise exception 'create_order: the loyalty reward is not available in %', p_currency using errcode = '22023';
    end if;
    select * into v_card from public.loyalty_cards
     where user_id = p_user_id and status = 'completed'
     order by completed_at, created_at
     limit 1
     for update;
    if not found then
      raise exception 'create_order: no loyalty reward available' using errcode = 'P0002';
    end if;
  end if;

  -- Promotions -------------------------------------------------------------------
  -- Codes the customer typed: each must exist, be active, have uses left and apply.
  foreach v_code in array v_codes
  loop
    v_code_row := null;
    select * into v_code_row from public.promotion_codes where code = v_code and is_active for update;
    if v_code_row.id is null then
      raise exception 'create_order: promotion code % is not valid for this order', v_code using errcode = 'P0002';
    end if;
    select * into v_promo from public.promotions where id = v_code_row.promotion_id;
    if not private.promotion_applies(v_promo, v_lines, p_user_id, p_email, p_currency) then
      raise exception 'create_order: promotion code % is not valid for this order', v_code using errcode = 'P0002';
    end if;
    if v_code_row.max_uses is not null then
      select count(*) into v_used
        from public.order_discounts d join public.orders o on o.id = d.order_id
       where d.promotion_code_id = v_code_row.id and o.status <> 'cancelled';
      if v_used >= v_code_row.max_uses then
        raise exception 'create_order: promotion code % is not valid for this order', v_code using errcode = 'P0002';
      end if;
    end if;
    if not v_cands @> jsonb_build_array(jsonb_build_object('promotion_id', v_promo.id)) then
      v_cands := v_cands || jsonb_build_array(jsonb_build_object(
        'promotion_id', v_promo.id, 'promotion_code_id', v_code_row.id, 'code', v_code_row.code,
        'combinable', v_promo.combinable, 'with_loyalty', v_promo.combinable_with_loyalty,
        'type', v_promo.type, 'created_at', v_promo.created_at));
    end if;
  end loop;

  -- Automatic promotions running now.
  for v_promo in
    select * from public.promotions
     where activation = 'automatic' and lifecycle = 'live' and currency = p_currency
       and starts_at <= now() and (ends_at is null or ends_at > now())
     order by created_at, id
  loop
    if private.promotion_applies(v_promo, v_lines, p_user_id, p_email, p_currency) then
      v_cands := v_cands || jsonb_build_array(jsonb_build_object(
        'promotion_id', v_promo.id, 'promotion_code_id', null, 'code', null,
        'combinable', v_promo.combinable, 'with_loyalty', v_promo.combinable_with_loyalty,
        'type', v_promo.type, 'created_at', v_promo.created_at));
    end if;
  end loop;

  -- Promotions alone: each non-combinable one alone, or all combinable ones together.
  -- Best benefit wins; on a tie, the option honouring a typed code, then the first.
  for c in select value from jsonb_array_elements(v_cands) where not (value ->> 'combinable')::boolean
  loop
    v_option := private.run_promotions(jsonb_build_array(c), v_lines, p_shipping, p_locale);
    if v_best is null
       or (v_option ->> 'benefit')::numeric > (v_best ->> 'benefit')::numeric
       or ((v_option ->> 'benefit')::numeric = (v_best ->> 'benefit')::numeric
           and (v_option ->> 'has_code')::boolean and not (v_best ->> 'has_code')::boolean) then
      v_best := v_option;
    end if;
  end loop;

  select private.run_promotions(
           jsonb_agg(value order by array_position(
             array['bundle', 'buy_x_get_y', 'gift', 'fixed_amount', 'percentage', 'free_shipping'], value ->> 'type'),
             value ->> 'created_at', value ->> 'promotion_id'),
           v_lines, p_shipping, p_locale)
    into v_option
    from jsonb_array_elements(v_cands)
   where (value ->> 'combinable')::boolean;
  if v_option is not null
     and (v_best is null
          or (v_option ->> 'benefit')::numeric > (v_best ->> 'benefit')::numeric
          or ((v_option ->> 'benefit')::numeric = (v_best ->> 'benefit')::numeric
              and (v_option ->> 'has_code')::boolean and not (v_best ->> 'has_code')::boolean)) then
    v_best := v_option;
  end if;
  if v_best is not null then
    v_b := (v_best ->> 'benefit')::numeric;
  end if;

  if v_best is not null and v_b > 0 then
    v_choice := 'promotions';
    v_benefit := v_b;
  else
    v_benefit := 0;
  end if;

  if coalesce(p_use_loyalty, false) then
    -- The reward alone.
    v_loyal := private.loyalty_on_top(v_lines, '{}'::jsonb, v_card.reward_percent, v_card.id, p_locale);
    if (v_loyal ->> 'amount')::numeric > v_benefit then
      v_choice := 'reward';
      v_benefit := (v_loyal ->> 'amount')::numeric;
    end if;

    -- Promotions that accept the reward on top: each alone, or the combinable ones together.
    for c in select value from jsonb_array_elements(v_cands) where (value ->> 'with_loyalty')::boolean
    loop
      v_option := private.run_promotions(jsonb_build_array(c), v_lines, p_shipping, p_locale);
      v_top := private.loyalty_on_top(v_option -> 'lines', v_option -> 'disc', v_card.reward_percent, v_card.id, p_locale);
      v_mixed_b := (v_option ->> 'benefit')::numeric + (v_top ->> 'amount')::numeric;
      if (v_top ->> 'amount')::numeric > 0 and v_mixed_b > v_benefit then
        v_choice := 'mixed';
        v_benefit := v_mixed_b;
        v_mixed := jsonb_build_object('run', v_option, 'top', v_top);
      end if;
    end loop;

    select private.run_promotions(
             jsonb_agg(value order by array_position(
               array['bundle', 'buy_x_get_y', 'gift', 'fixed_amount', 'percentage', 'free_shipping'], value ->> 'type'),
               value ->> 'created_at', value ->> 'promotion_id'),
             v_lines, p_shipping, p_locale)
      into v_option
      from jsonb_array_elements(v_cands)
     where (value ->> 'combinable')::boolean and (value ->> 'with_loyalty')::boolean;
    if v_option is not null then
      v_top := private.loyalty_on_top(v_option -> 'lines', v_option -> 'disc', v_card.reward_percent, v_card.id, p_locale);
      v_mixed_b := (v_option ->> 'benefit')::numeric + (v_top ->> 'amount')::numeric;
      if (v_top ->> 'amount')::numeric > 0 and v_mixed_b > v_benefit then
        v_choice := 'mixed';
        v_benefit := v_mixed_b;
        v_mixed := jsonb_build_object('run', v_option, 'top', v_top);
      end if;
    end if;
  end if;

  if v_choice = 'promotions' then
    v_lines     := v_best -> 'lines';
    v_disc      := v_best -> 'disc';
    v_discounts := v_best -> 'discounts';
    v_ship_disc := (v_best ->> 'shipping')::numeric;
  elsif v_choice = 'reward' then
    v_disc      := v_loyal -> 'disc';
    v_discounts := jsonb_build_array(v_loyal -> 'row');
  elsif v_choice = 'mixed' then
    v_lines     := v_mixed -> 'run' -> 'lines';
    v_disc      := v_mixed -> 'top' -> 'disc';
    v_discounts := (v_mixed -> 'run' -> 'discounts') || jsonb_build_array(v_mixed -> 'top' -> 'row');
    v_ship_disc := (v_mixed -> 'run' ->> 'shipping')::numeric;
  else
    v_disc      := '{}'::jsonb;
    v_discounts := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(l || jsonb_build_object(
                       'discount_amount', coalesce((v_disc ->> (l ->> 'idx'))::numeric, 0))
                     order by (l ->> 'idx')::integer), '[]'::jsonb)
                from jsonb_array_elements(v_lines) l),
    'shipping_discount', v_ship_disc,
    'discounts', v_discounts);
end;
$$;
