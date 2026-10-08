-- =============================================================================
-- Promotions live — a draft may wait for its shared code
-- =============================================================================
-- admin_save_promotion(): a draft promotion in "code" mode can be saved before
-- its shared code is typed (publishing without one is still refused by
-- validate_promotion()). Saving with an empty code switches the old one off.

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
