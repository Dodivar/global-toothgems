-- =============================================================================
-- Omnibus price reference (decision 129)
--
-- Directive 98/6/EC art. 6a (Omnibus directive 2019/2161), French Code de la
-- consommation art. L112-1-1: any announcement of a price reduction shows, as the
-- previous price, the LOWEST price applied during the 30 days before the reduction
-- was applied. Successive reductions keep the price before the first one.
--
-- Until now a struck-out price came from a free-typed "compare-at" price
-- (products/product_variants.compare_at_price) or from the price before a
-- promotion, and the database kept no price history. This migration:
--
--   1. price_history: every catalogue list price (product, each variant at its
--      effective price, each course) as dated segments, written ONLY by triggers
--      on products / product_variants / courses. Seeded with the current prices,
--      dated this migration (nothing is known before it).
--   2. price_cut_history: every period during which a unit price was cut for
--      everyone: an automatic shop-window promotion (the rule the storefront has
--      always used to cut a unit price: live, automatic, percentage, chosen
--      products, every customer, no minimum, no cap) and course promotions.
--      Written ONLY by triggers on promotions / promotion_products /
--      course_promotions. A change closes what already took effect (now) and
--      forgets what never did (future rows), then records the current state.
--   3. private.price_reference(): the reference price of one product, variant or
--      course at an instant — lowest price (cuts included) in the 30 days before
--      the start of the running series of cuts (cuts that follow each other with
--      no gap), since listing when the item is younger than 30 days, in the same
--      currency. A struck-out price is due only when the price now is strictly
--      below it.
--   4. public.storefront_price_references() (visitors) and
--      public.admin_price_references(product) (manage_products): the only way to
--      read the figures. The history tables have no API write path at all and
--      only staff read them.
--   5. compare_at_price is retired: the one value set on the project
--      (kit-application-premium, 279.00 over 249.00) and the seed's are cleared,
--      and a CHECK refuses any new value from any role. The column stays because
--      the discount engine still reads it (exclude_discounted_products: no line is
--      "already discounted" any more — decision 129 (e)).
--
-- Decisions to confirm: supabase/README.md decision 129.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.price_history (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references public.products (id) on delete cascade,
  variant_id  uuid references public.product_variants (id) on delete cascade,
  course_id   uuid references public.courses (id) on delete cascade,
  price       numeric(12, 2) not null check (price >= 0),
  currency    char(3) not null check (currency ~ '^[A-Z]{3}$'),
  valid_from  timestamptz not null,
  valid_to    timestamptz,
  created_at  timestamptz not null default now(),
  constraint price_history_subject check (
    (product_id is not null and course_id is null)
    or (product_id is null and variant_id is null and course_id is not null)),
  constraint price_history_period check (valid_to is null or valid_to > valid_from)
);

comment on table public.price_history is
  'Omnibus (decision 129): list price of a product (variant_id null), a variant (its effective price, inherited or its own) or a course, as dated segments [valid_from, valid_to). Written only by triggers; read by staff and through storefront_price_references().';

create unique index price_history_open_idx
  on public.price_history (product_id, variant_id, course_id) nulls not distinct
  where valid_to is null;
create index price_history_product_idx on public.price_history (product_id, variant_id, valid_from) where product_id is not null;
create index price_history_variant_idx on public.price_history (variant_id) where variant_id is not null;
create index price_history_course_idx on public.price_history (course_id, valid_from) where course_id is not null;

create table public.price_cut_history (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid references public.products (id) on delete cascade,
  course_id       uuid references public.courses (id) on delete cascade,
  -- No foreign key: the history outlives a deleted promotion.
  source          text not null check (source in ('promotion', 'course_promotion')),
  source_id       uuid not null,
  discount_type   text not null check (discount_type in ('percentage', 'amount')),
  discount_value  numeric(12, 2) not null check (discount_value > 0),
  currency        char(3) not null check (currency ~ '^[A-Z]{3}$'),
  valid_from      timestamptz not null,
  valid_to        timestamptz,
  created_at      timestamptz not null default now(),
  constraint price_cut_history_subject check (
    (source = 'promotion' and product_id is not null and course_id is null)
    or (source = 'course_promotion' and course_id is not null and product_id is null)),
  constraint price_cut_history_percentage check (discount_type <> 'percentage' or discount_value <= 100),
  constraint price_cut_history_period check (valid_to is null or valid_to > valid_from)
);

comment on table public.price_cut_history is
  'Omnibus (decision 129): periods during which a unit price was cut for every customer (automatic shop-window promotion on chosen products, course promotion). Written only by triggers; read by staff.';

create index price_cut_history_product_idx on public.price_cut_history (product_id, valid_from) where product_id is not null;
create index price_cut_history_course_idx on public.price_cut_history (course_id, valid_from) where course_id is not null;
create index price_cut_history_source_idx on public.price_cut_history (source, source_id);

alter table public.price_history enable row level security;
alter table public.price_cut_history enable row level security;

revoke all on public.price_history, public.price_cut_history from anon, authenticated;
grant select on public.price_history, public.price_cut_history to authenticated;

create policy "price_history: staff read"
  on public.price_history for select to authenticated
  using ((select private.is_staff()));
create policy "price_cut_history: staff read"
  on public.price_cut_history for select to authenticated
  using ((select private.is_staff()));
-- No insert / update / delete policy and no write grant: the API cannot write.

-- -----------------------------------------------------------------------------
-- 2. Writers (security definer, called by triggers only)
-- -----------------------------------------------------------------------------
create or replace function private.set_list_price(
  p_product uuid, p_variant uuid, p_course uuid, p_price numeric, p_currency char(3))
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.price_history%rowtype;
begin
  if p_price is null or p_currency is null then
    return;
  end if;
  select h.* into v_open
    from public.price_history h
   where h.product_id is not distinct from p_product
     and h.variant_id is not distinct from p_variant
     and h.course_id is not distinct from p_course
     and h.valid_to is null
   for update;
  if found and v_open.price = p_price and v_open.currency = p_currency then
    return;
  end if;
  if found and v_open.valid_from >= now() then
    -- Opened in this same transaction (or ahead of the clock): it never applied alone.
    update public.price_history set price = p_price, currency = p_currency where id = v_open.id;
    return;
  end if;
  if found then
    update public.price_history set valid_to = now() where id = v_open.id;
  end if;
  insert into public.price_history (product_id, variant_id, course_id, price, currency, valid_from)
  values (p_product, p_variant, p_course, p_price, p_currency, now());
end;
$$;

create or replace function private.record_product_list_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant record;
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price or new.currency is distinct from old.currency then
    perform private.set_list_price(new.id, null, null, new.price, new.currency);
    -- Variants without their own price follow the product; a currency change moves them all.
    for v_variant in
      select v.id, v.price from public.product_variants v
       where v.product_id = new.id and (v.price is null or new.currency is distinct from old.currency)
    loop
      perform private.set_list_price(new.id, v_variant.id, null, coalesce(v_variant.price, new.price), new.currency);
    end loop;
  end if;
  return null;
end;
$$;

create or replace function private.record_variant_list_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price numeric(12, 2);
  v_currency char(3);
begin
  if tg_op = 'UPDATE' and new.price is not distinct from old.price and new.product_id = old.product_id then
    return null;
  end if;
  select p.price, p.currency into v_price, v_currency from public.products p where p.id = new.product_id;
  perform private.set_list_price(new.product_id, new.id, null, coalesce(new.price, v_price), v_currency);
  return null;
end;
$$;

create or replace function private.record_course_list_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price or new.currency is distinct from old.currency then
    perform private.set_list_price(null, null, new.id, new.price, new.currency);
  end if;
  return null;
end;
$$;

-- Closes what already took effect, forgets what never did.
create or replace function private.close_price_cuts(p_source text, p_source_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.price_cut_history
   where source = p_source and source_id = p_source_id and valid_from >= now();
  update public.price_cut_history
     set valid_to = now()
   where source = p_source and source_id = p_source_id
     and (valid_to is null or valid_to > now());
$$;

create or replace function private.refresh_promotion_price_cuts(p_promotion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_promotion is null then
    return;
  end if;
  perform private.close_price_cuts('promotion', p_promotion);
  -- The shop-window rule (lib/storefrontOffers.ts): a unit price is cut only by a
  -- live automatic percentage promotion on chosen products, for every customer,
  -- with no minimum basket or quantity and no cap. Gift cards are never discounted.
  insert into public.price_cut_history
    (product_id, source, source_id, discount_type, discount_value, currency, valid_from, valid_to)
  select pp.product_id, 'promotion', p.id, 'percentage', p.percent_off, p.currency,
         greatest(p.starts_at, now()), p.ends_at
    from public.promotions p
    join public.promotion_products pp on pp.promotion_id = p.id and pp.role = 'eligible'
    join public.products pr on pr.id = pp.product_id and pr.product_type <> 'gift_card'
   where p.id = p_promotion
     and p.lifecycle = 'live'
     and p.activation = 'automatic'
     and p.type = 'percentage'
     and p.percent_off is not null and p.percent_off between 1 and 100
     and p.applies_to = 'products'
     and p.customer_eligibility = 'all'
     and p.min_subtotal_amount is null
     and p.min_quantity is null
     and p.max_discount_amount is null
     and (p.ends_at is null or p.ends_at > greatest(p.starts_at, now()))
     and not exists (
       select 1 from public.promotion_products x
        where x.promotion_id = p.id and x.product_id = pp.product_id and x.role = 'excluded')
   group by pp.product_id, p.id;
end;
$$;

create or replace function private.refresh_course_promotion_price_cut(p_course_promotion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_course_promotion is null then
    return;
  end if;
  perform private.close_price_cuts('course_promotion', p_course_promotion);
  insert into public.price_cut_history
    (course_id, source, source_id, discount_type, discount_value, currency, valid_from, valid_to)
  select cp.course_id, 'course_promotion', cp.id, cp.discount_type, cp.discount_value, c.currency,
         greatest(cp.starts_at, now()), cp.ends_at
    from public.course_promotions cp
    join public.courses c on c.id = cp.course_id
   where cp.id = p_course_promotion
     and cp.is_active
     and (cp.ends_at is null or cp.ends_at > greatest(cp.starts_at, now()));
end;
$$;

create or replace function private.on_promotion_price_cut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_promotion_price_cuts(old.id);
  else
    perform private.refresh_promotion_price_cuts(new.id);
  end if;
  return null;
end;
$$;

create or replace function private.on_promotion_product_price_cut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_promotion_price_cuts(old.promotion_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.promotion_id is distinct from old.promotion_id) then
    perform private.refresh_promotion_price_cuts(new.promotion_id);
  end if;
  return null;
end;
$$;

create or replace function private.on_course_promotion_price_cut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_course_promotion_price_cut(old.id);
  else
    perform private.refresh_course_promotion_price_cut(new.id);
  end if;
  return null;
end;
$$;

revoke all on function private.set_list_price(uuid, uuid, uuid, numeric, char) from public, anon, authenticated;
revoke all on function private.close_price_cuts(text, uuid) from public, anon, authenticated;
revoke all on function private.refresh_promotion_price_cuts(uuid) from public, anon, authenticated;
revoke all on function private.refresh_course_promotion_price_cut(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Retire compare_at_price (before the history starts: no price changes here)
-- -----------------------------------------------------------------------------
update public.products set compare_at_price = null where compare_at_price is not null;
update public.product_variants set compare_at_price = null where compare_at_price is not null;

alter table public.products
  add constraint products_compare_at_retired check (compare_at_price is null);
alter table public.product_variants
  add constraint product_variants_compare_at_retired check (compare_at_price is null);

comment on column public.products.compare_at_price is
  'RETIRED (decision 129, Omnibus): always null, refused by products_compare_at_retired. A struck-out price comes only from storefront_price_references().';
comment on column public.product_variants.compare_at_price is
  'RETIRED (decision 129, Omnibus): always null, refused by product_variants_compare_at_retired.';

-- -----------------------------------------------------------------------------
-- 4. Initial history: current prices, dated this migration
-- -----------------------------------------------------------------------------
insert into public.price_history (product_id, variant_id, price, currency, valid_from)
select p.id, null, p.price, p.currency, now() from public.products p;

insert into public.price_history (product_id, variant_id, price, currency, valid_from)
select v.product_id, v.id, coalesce(v.price, p.price), p.currency, now()
  from public.product_variants v
  join public.products p on p.id = v.product_id;

insert into public.price_history (course_id, price, currency, valid_from)
select c.id, c.price, c.currency, now() from public.courses c;

select private.refresh_promotion_price_cuts(p.id) from public.promotions p;
select private.refresh_course_promotion_price_cut(cp.id) from public.course_promotions cp;

-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------
create trigger products_price_history
  after insert or update of price, currency on public.products
  for each row execute function private.record_product_list_price();

create trigger product_variants_price_history
  after insert or update of price, product_id on public.product_variants
  for each row execute function private.record_variant_list_price();

create trigger courses_price_history
  after insert or update of price, currency on public.courses
  for each row execute function private.record_course_list_price();

create trigger promotions_price_cuts
  after insert or update or delete on public.promotions
  for each row execute function private.on_promotion_price_cut();

create trigger promotion_products_price_cuts
  after insert or update or delete on public.promotion_products
  for each row execute function private.on_promotion_product_price_cut();

create trigger course_promotions_price_cuts
  after insert or update or delete on public.course_promotions
  for each row execute function private.on_course_promotion_price_cut();

-- -----------------------------------------------------------------------------
-- 6. Reference price
-- -----------------------------------------------------------------------------
create or replace function private.cut_price(p_list numeric, p_type text, p_value numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  -- Same rounding as course_current_prices and the shop window (half away from zero, to the cent).
  select case p_type
           when 'percentage' then p_list - round(p_list * p_value / 100, 2)
           else greatest(p_list - p_value, 0)
         end::numeric(12, 2);
$$;

-- Lowest price applied in [p_from, p_to): list prices and cut prices over the
-- moments both applied, in one currency.
create or replace function private.lowest_price(
  p_product uuid, p_variant uuid, p_course uuid, p_currency char(3), p_from timestamptz, p_to timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select min(x) from (
    select h.price as x
      from public.price_history h
     where h.product_id is not distinct from p_product
       and h.variant_id is not distinct from p_variant
       and h.course_id is not distinct from p_course
       and h.currency = p_currency
       and h.valid_from < p_to
       and (h.valid_to is null or h.valid_to > p_from)
    union all
    select private.cut_price(h.price, c.discount_type, c.discount_value)
      from public.price_history h
      join public.price_cut_history c
        on (p_course is null and c.product_id = p_product)
        or (p_course is not null and c.course_id = p_course)
     where h.product_id is not distinct from p_product
       and h.variant_id is not distinct from p_variant
       and h.course_id is not distinct from p_course
       and h.currency = p_currency
       and c.currency = p_currency
       and greatest(h.valid_from, c.valid_from, p_from)
           < least(coalesce(h.valid_to, 'infinity'), coalesce(c.valid_to, 'infinity'), p_to)
  ) s;
$$;

-- state:
--   no_reduction  no cut running: price = list price; reference = what a cut starting now would strike
--   reduced       a cut is running and the price is strictly below the reference: strike the reference
--   not_lower     a cut is running but the price is not below the reference: nothing struck
--   no_history    a cut is running but no price is known before its series started: nothing struck
create or replace function private.price_reference(
  p_product uuid, p_variant uuid, p_course uuid, p_at timestamptz default now())
returns table (
  currency char(3), list_price numeric, price numeric, reference_price numeric,
  discount_percent integer, reduction_started_at timestamptz, state text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_list     numeric(12, 2);
  v_currency char(3);
  v_price    numeric(12, 2);
  v_start    timestamptz;
  v_earlier  timestamptz;
  v_first    timestamptz;
  v_from     timestamptz;
  v_ref      numeric(12, 2);
  v_guard    integer := 0;
begin
  select h.price, h.currency into v_list, v_currency
    from public.price_history h
   where h.product_id is not distinct from p_product
     and h.variant_id is not distinct from p_variant
     and h.course_id is not distinct from p_course
     and h.valid_from <= p_at
     and (h.valid_to is null or h.valid_to > p_at)
   order by h.valid_from desc
   limit 1;
  if v_list is null then
    return;
  end if;

  select min(h.valid_from) into v_first
    from public.price_history h
   where h.product_id is not distinct from p_product
     and h.variant_id is not distinct from p_variant
     and h.course_id is not distinct from p_course
     and h.currency = v_currency;

  -- The best cut running now.
  select min(private.cut_price(v_list, c.discount_type, c.discount_value)), min(c.valid_from)
    into v_price, v_start
    from public.price_cut_history c
   where ((p_course is null and c.product_id = p_product) or (p_course is not null and c.course_id = p_course))
     and c.currency = v_currency
     and c.valid_from <= p_at
     and (c.valid_to is null or c.valid_to > p_at);

  if v_price is null then
    v_from := greatest(p_at - interval '30 days', v_first);
    if v_from < p_at then
      v_ref := private.lowest_price(p_product, p_variant, p_course, v_currency, v_from, p_at);
    end if;
    return query select v_currency, v_list, v_list, v_ref, null::integer, null::timestamptz, 'no_reduction'::text;
    return;
  end if;

  -- Successive reductions: walk back through cuts that touch or overlap the series.
  loop
    select min(c.valid_from) into v_earlier
      from public.price_cut_history c
     where ((p_course is null and c.product_id = p_product) or (p_course is not null and c.course_id = p_course))
       and c.currency = v_currency
       and c.valid_from < v_start
       and (c.valid_to is null or c.valid_to >= v_start);
    exit when v_earlier is null;
    v_start := v_earlier;
    v_guard := v_guard + 1;
    exit when v_guard > 1000;
  end loop;

  v_from := greatest(v_start - interval '30 days', v_first);
  if v_from >= v_start then
    return query select v_currency, v_list, v_price, null::numeric, null::integer, v_start, 'no_history'::text;
    return;
  end if;

  v_ref := private.lowest_price(p_product, p_variant, p_course, v_currency, v_from, v_start);
  if v_ref is null or v_price >= v_ref then
    return query select v_currency, v_list, v_price, v_ref, null::integer, v_start, 'not_lower'::text;
    return;
  end if;
  return query select v_currency, v_list, v_price, v_ref,
                      floor((v_ref - v_price) * 100 / v_ref)::integer, v_start, 'reduced'::text;
end;
$$;

revoke all on function private.cut_price(numeric, text, numeric) from public, anon, authenticated;
revoke all on function private.lowest_price(uuid, uuid, uuid, char, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.price_reference(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Readers
-- -----------------------------------------------------------------------------
-- What the shop window needs: one row per active product, active variant and
-- published course with a cut running now. The price to show is `price`; a
-- struck-out price only when state = 'reduced' (then `reference_price`, and
-- `discount_percent` computed on it, rounded down).
create or replace function public.storefront_price_references()
returns table (
  product_id uuid, variant_id uuid, course_id uuid, currency char(3), list_price numeric, price numeric,
  reference_price numeric, discount_percent integer, reduction_started_at timestamptz, state text)
language sql
stable
security definer
set search_path = ''
as $$
  with cut_products as (
    select distinct c.product_id from public.price_cut_history c
     where c.product_id is not null and c.valid_from <= now() and (c.valid_to is null or c.valid_to > now())
  ), cut_courses as (
    select distinct c.course_id from public.price_cut_history c
     where c.course_id is not null and c.valid_from <= now() and (c.valid_to is null or c.valid_to > now())
  )
  select p.id, null::uuid, null::uuid, r.*
    from public.products p
    join cut_products cp on cp.product_id = p.id
    cross join lateral private.price_reference(p.id, null, null, now()) r
   where p.status = 'active'
  union all
  select v.product_id, v.id, null::uuid, r.*
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.status = 'active'
    join cut_products cp on cp.product_id = p.id
    cross join lateral private.price_reference(v.product_id, v.id, null, now()) r
   where v.is_active
  union all
  select null::uuid, null::uuid, c.id, r.*
    from public.courses c
    join cut_courses cc on cc.course_id = c.id
    cross join lateral private.price_reference(null, null, c.id, now()) r
   where c.status = 'published';
$$;

comment on function public.storefront_price_references() is
  'Omnibus (decision 129): price now and reference price of every active product/variant and published course with a cut running. Strike reference_price only when state = ''reduced''.';

revoke all on function public.storefront_price_references() from public;
grant execute on function public.storefront_price_references() to anon, authenticated;

-- The back office's view of one product (any status): the product row
-- (variant_id null) and each active variant, with the reason in `state`.
create or replace function public.admin_price_references(p_product_id uuid)
returns table (
  variant_id uuid, currency char(3), list_price numeric, price numeric,
  reference_price numeric, discount_percent integer, reduction_started_at timestamptz, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_price_references: permission denied' using errcode = '42501';
  end if;
  return query
    select null::uuid, r.* from private.price_reference(p_product_id, null, null, now()) r
    union all
    select v.id, r.*
      from public.product_variants v
      cross join lateral private.price_reference(v.product_id, v.id, null, now()) r
     where v.product_id = p_product_id and v.is_active;
end;
$$;

comment on function public.admin_price_references(uuid) is
  'Omnibus (decision 129): reference price and reason (state) of a product and its active variants, for manage_products staff.';

revoke all on function public.admin_price_references(uuid) from public, anon;
grant execute on function public.admin_price_references(uuid) to authenticated;
