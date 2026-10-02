-- =============================================================================
-- Settings workspace: shipping positions count from 1
-- =============================================================================
-- admin_save_shipping() numbered zones and rates from 0 while every existing
-- row (seed, earlier migrations) counts from 1, so saving an unchanged
-- configuration rewrote every position and filled the audit log. Same
-- function, positions = array order starting at 1.
-- =============================================================================

create or replace function public.admin_save_shipping(p_zones jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_zone       jsonb;
  v_rate       jsonb;
  v_country    jsonb;
  v_zone_ids   uuid[] := '{}';
  v_rate_ids   uuid[] := '{}';
  v_names      text[] := '{}';
  v_countries  text[] := '{}';
  v_row_zone   uuid;
  v_id         uuid;
  v_name       text;
  v_amount     text;
begin
  if not private.has_permission('manage_settings') then
    raise exception 'admin_save_shipping: not allowed' using errcode = '42501';
  end if;
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' or jsonb_array_length(p_zones) > 100 then
    raise exception 'admin_save_shipping: zones must be an array (max 100)' using errcode = '22023';
  end if;

  -- Validation ------------------------------------------------------------------
  for v_zone in select value from jsonb_array_elements(p_zones)
  loop
    if jsonb_typeof(v_zone) <> 'object' or coalesce(v_zone ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'admin_save_shipping: every zone needs a uuid id' using errcode = '22023';
    end if;
    v_id := (v_zone ->> 'id')::uuid;
    if v_id = any (v_zone_ids) then
      raise exception 'admin_save_shipping: duplicate zone id' using errcode = '22023';
    end if;
    v_zone_ids := v_zone_ids || v_id;

    v_name := lower(btrim(coalesce(v_zone ->> 'name', '')));
    if v_name = '' or char_length(v_name) > 120 then
      raise exception 'admin_save_shipping: a zone name is required (max 120)' using errcode = '22023';
    end if;
    if v_name = any (v_names) then
      raise exception 'admin_save_shipping: two zones are named %', v_zone ->> 'name' using errcode = '22023';
    end if;
    v_names := v_names || v_name;

    if jsonb_typeof(v_zone -> 'is_rest_of_world') is distinct from 'boolean'
       or jsonb_typeof(v_zone -> 'is_active') is distinct from 'boolean'
       or jsonb_typeof(v_zone -> 'countries') is distinct from 'array'
       or jsonb_typeof(v_zone -> 'rates') is distinct from 'array' then
      raise exception 'admin_save_shipping: malformed zone %', v_zone ->> 'name' using errcode = '22023';
    end if;
    if (v_zone ->> 'is_rest_of_world')::boolean then
      if v_row_zone is not null then
        raise exception 'admin_save_shipping: only one rest-of-world zone' using errcode = '22023';
      end if;
      if jsonb_array_length(v_zone -> 'countries') > 0 then
        raise exception 'admin_save_shipping: the rest-of-world zone lists no country' using errcode = '22023';
      end if;
      v_row_zone := v_id;
    end if;

    for v_country in select value from jsonb_array_elements(v_zone -> 'countries')
    loop
      if jsonb_typeof(v_country) <> 'string' or (v_country #>> '{}') !~ '^[A-Z]{2}$' then
        raise exception 'admin_save_shipping: invalid country code in zone %', v_zone ->> 'name' using errcode = '22023';
      end if;
      if (v_country #>> '{}') = any (v_countries) then
        raise exception 'admin_save_shipping: % is listed in two zones', v_country #>> '{}' using errcode = '22023';
      end if;
      v_countries := v_countries || (v_country #>> '{}');
    end loop;

    if jsonb_array_length(v_zone -> 'rates') > 50 then
      raise exception 'admin_save_shipping: at most 50 rates per zone' using errcode = '22023';
    end if;
    for v_rate in select value from jsonb_array_elements(v_zone -> 'rates')
    loop
      if jsonb_typeof(v_rate) <> 'object' or coalesce(v_rate ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'admin_save_shipping: every rate needs a uuid id' using errcode = '22023';
      end if;
      v_id := (v_rate ->> 'id')::uuid;
      if v_id = any (v_rate_ids) then
        raise exception 'admin_save_shipping: duplicate rate id' using errcode = '22023';
      end if;
      v_rate_ids := v_rate_ids || v_id;
      if coalesce(v_rate ->> 'kind', '') not in ('standard', 'express', 'free', 'pickup')
         or char_length(btrim(coalesce(v_rate ->> 'name', ''))) not between 1 and 120
         or jsonb_typeof(v_rate -> 'is_active') is distinct from 'boolean'
         or jsonb_typeof(v_rate -> 'min_days') is distinct from 'number'
         or jsonb_typeof(v_rate -> 'max_days') is distinct from 'number'
         or (v_rate ->> 'min_days') !~ '^\d{1,3}$' or (v_rate ->> 'max_days') !~ '^\d{1,3}$'
         or (v_rate ->> 'max_days')::integer < (v_rate ->> 'min_days')::integer then
        raise exception 'admin_save_shipping: malformed rate % (kind, name, delivery days)', v_rate ->> 'name'
          using errcode = '22023';
      end if;
      -- Amounts: non-negative, at most two decimals, below 100 000.
      foreach v_amount in array array[v_rate ->> 'price', v_rate ->> 'free_over_amount',
                                      v_rate ->> 'min_order_amount', v_rate ->> 'max_order_amount']
      loop
        if v_amount is not null and v_amount !~ '^\d{1,5}(\.\d{1,2})?$' then
          raise exception 'admin_save_shipping: invalid amount % in rate %', v_amount, v_rate ->> 'name'
            using errcode = '22023';
        end if;
      end loop;
      if v_rate ->> 'price' is null then
        raise exception 'admin_save_shipping: rate % has no price', v_rate ->> 'name' using errcode = '22023';
      end if;
      foreach v_amount in array array[v_rate ->> 'min_weight_grams', v_rate ->> 'max_weight_grams']
      loop
        if v_amount is not null and v_amount !~ '^\d{1,7}$' then
          raise exception 'admin_save_shipping: invalid weight in rate %', v_rate ->> 'name' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end loop;

  -- Writes ------------------------------------------------------------------------
  delete from public.shipping_zones where id <> all (v_zone_ids);

  -- The rest-of-world flag may move to another zone in the same save.
  update public.shipping_zones set is_rest_of_world = false
   where is_rest_of_world and id is distinct from v_row_zone;

  insert into public.shipping_zones (id, name, is_rest_of_world, is_active, position)
  select (z.value ->> 'id')::uuid, btrim(z.value ->> 'name'), (z.value ->> 'is_rest_of_world')::boolean,
         (z.value ->> 'is_active')::boolean, z.ordinality::integer
    from jsonb_array_elements(p_zones) with ordinality z
  on conflict (id) do update set
    name = excluded.name, is_rest_of_world = excluded.is_rest_of_world,
    is_active = excluded.is_active, position = excluded.position
  where (shipping_zones.name, shipping_zones.is_rest_of_world, shipping_zones.is_active, shipping_zones.position)
        is distinct from (excluded.name, excluded.is_rest_of_world, excluded.is_active, excluded.position);

  delete from public.shipping_zone_countries c
   where not exists (
     select 1
       from jsonb_array_elements(p_zones) z, jsonb_array_elements_text(z.value -> 'countries') k (code)
      where k.code = c.country_code and (z.value ->> 'id')::uuid = c.zone_id);

  insert into public.shipping_zone_countries (country_code, zone_id)
  select k.code, (z.value ->> 'id')::uuid
    from jsonb_array_elements(p_zones) z, jsonb_array_elements_text(z.value -> 'countries') k (code)
  on conflict (country_code) do update set zone_id = excluded.zone_id
  where shipping_zone_countries.zone_id <> excluded.zone_id;

  delete from public.shipping_rates where id <> all (v_rate_ids);

  insert into public.shipping_rates
    (id, zone_id, kind, name, min_days, max_days, price, free_over_amount, min_order_amount,
     max_order_amount, min_weight_grams, max_weight_grams, is_active, position)
  select (r.value ->> 'id')::uuid, (z.value ->> 'id')::uuid, r.value ->> 'kind', btrim(r.value ->> 'name'),
         (r.value ->> 'min_days')::integer, (r.value ->> 'max_days')::integer,
         (r.value ->> 'price')::numeric, (r.value ->> 'free_over_amount')::numeric,
         (r.value ->> 'min_order_amount')::numeric, (r.value ->> 'max_order_amount')::numeric,
         (r.value ->> 'min_weight_grams')::integer, (r.value ->> 'max_weight_grams')::integer,
         (r.value ->> 'is_active')::boolean, r.ordinality::integer
    from jsonb_array_elements(p_zones) z, jsonb_array_elements(z.value -> 'rates') with ordinality r
  on conflict (id) do update set
    zone_id = excluded.zone_id, kind = excluded.kind, name = excluded.name,
    min_days = excluded.min_days, max_days = excluded.max_days, price = excluded.price,
    free_over_amount = excluded.free_over_amount, min_order_amount = excluded.min_order_amount,
    max_order_amount = excluded.max_order_amount, min_weight_grams = excluded.min_weight_grams,
    max_weight_grams = excluded.max_weight_grams, is_active = excluded.is_active, position = excluded.position
  where (shipping_rates.zone_id, shipping_rates.kind, shipping_rates.name, shipping_rates.min_days,
         shipping_rates.max_days, shipping_rates.price, shipping_rates.free_over_amount,
         shipping_rates.min_order_amount, shipping_rates.max_order_amount, shipping_rates.min_weight_grams,
         shipping_rates.max_weight_grams, shipping_rates.is_active, shipping_rates.position)
        is distinct from
        (excluded.zone_id, excluded.kind, excluded.name, excluded.min_days, excluded.max_days, excluded.price,
         excluded.free_over_amount, excluded.min_order_amount, excluded.max_order_amount,
         excluded.min_weight_grams, excluded.max_weight_grams, excluded.is_active, excluded.position);
end;
$$;
