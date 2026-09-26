-- =============================================================================
-- Migration 025 — Product recommendations (iteration 9)
-- =============================================================================
-- Feeds the product lists the storefront shows next to a product or a cart:
--   * product page, "Va avec — Compléter la trousse" (kind = complementary);
--   * cart, suggestions (the cart lines as input; empty cart = no input);
--   * home, best-sellers block (no input).
--
-- Design notes:
--   * product_recommendations holds the links chosen by the team, per source
--     product and kind, in display order. Kinds:
--       complementary — goes with the product (aftercare, tools, a kit);
--       similar       — an alternative to the product (another gem shape).
--   * public.recommended_products() is what screens call. It returns product
--     ids, never product data: the page then reads the products through the
--     normal RLS-protected tables. Picks, in order of priority:
--       1. manual          — the team's links, by position;
--       2. bought_together — complementary only: products paid in the same
--                            orders, at least MIN_SHARED_ORDERS orders so one
--                            customer's basket can never be inferred;
--          same_category   — similar only: active products of the same category;
--       3. popular         — featured first, then the most paid-for products.
--     So a product with no manual link still gets a full row, and a screen
--     never renders an empty recommendation block.
--   * Never recommended: the input products themselves, anything not active,
--     gift cards, and products that are entirely out of stock.
--   * Base catalogue data only (no prices here): prices are always read from
--     products / product_variants.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Manual links
-- -----------------------------------------------------------------------------
create table public.product_recommendations (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products (id) on delete cascade,
  recommended_product_id uuid not null references public.products (id) on delete cascade,
  kind                   text not null default 'complementary'
                         check (kind in ('complementary', 'similar')),
  position               integer not null default 0 check (position >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.profiles (id) on delete set null,
  updated_by             uuid references public.profiles (id) on delete set null,
  constraint product_recommendations_not_self check (product_id <> recommended_product_id),
  constraint product_recommendations_unique unique (product_id, kind, recommended_product_id)
);

comment on table public.product_recommendations is
  'Products the team recommends next to a product, per kind, in display order. Read through public.recommended_products().';
comment on column public.product_recommendations.kind is
  'complementary = goes with the product (cross-sell); similar = an alternative to it.';

create index product_recommendations_source_idx
  on public.product_recommendations (product_id, kind, position);
create index product_recommendations_target_idx
  on public.product_recommendations (recommended_product_id);

alter table public.product_recommendations enable row level security;

create trigger product_recommendations_audit
  before insert or update on public.product_recommendations
  for each row execute function private.set_audit_columns();

create trigger product_recommendations_audit_log
  after insert or update or delete on public.product_recommendations
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 2. What the screens call
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because the co-purchase signal reads order_items across
-- customers; only aggregated ids of ACTIVE products leave the function.
create or replace function public.recommended_products(
  p_product_ids uuid[] default '{}',
  p_kind        text default 'complementary',
  p_limit       integer default 4
)
returns table (product_id uuid, source text, rank integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  MAX_LIMIT         constant integer := 24;
  MAX_INPUT         constant integer := 50;   -- a cart never holds more distinct products
  MIN_SHARED_ORDERS constant integer := 2;
  v_input uuid[] := coalesce(p_product_ids, '{}');
begin
  if p_kind is null or p_kind not in ('complementary', 'similar') then
    raise exception 'recommended_products: unknown kind' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > MAX_LIMIT then
    raise exception 'recommended_products: limit must be between 1 and %', MAX_LIMIT using errcode = '22023';
  end if;
  if cardinality(v_input) > MAX_INPUT then
    raise exception 'recommended_products: at most % products', MAX_INPUT using errcode = '22023';
  end if;

  return query
  with
  -- Products that may be shown at all.
  eligible as (
    select p.id, p.category_id, p.is_featured, p.created_at
      from public.products p
     where p.status = 'active'
       and p.product_type <> 'gift_card'
       and p.id <> all (v_input)
       -- Sellable: no stock row (digital, untracked) or at least one unit in stock.
       and (not exists (select 1
                          from public.inventory_items i
                          left join public.product_variants v on v.id = i.variant_id
                         where coalesce(i.product_id, v.product_id) = p.id
                           and (i.variant_id is null or v.is_active))
            or exists (select 1
                         from public.inventory_items i
                         left join public.product_variants v on v.id = i.variant_id
                        where coalesce(i.product_id, v.product_id) = p.id
                          and (i.variant_id is null or v.is_active)
                          and i.stock_status <> 'out_of_stock'))
  ),
  paid_items as (
    select oi.order_id, oi.product_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.payment_status in ('paid', 'partially_refunded')
       and oi.product_id is not null
  ),
  manual as (
    select r.recommended_product_id as id,
           1 as priority,
           -- Several cart lines may point at the same product: best position,
           -- then the most shared, wins.
           (min(r.position) * 1000 - count(*))::bigint as score
      from public.product_recommendations r
     where r.product_id = any (v_input)
       and r.kind = p_kind
     group by r.recommended_product_id
  ),
  bought_together as (
    select other.product_id as id,
           2 as priority,
           -count(distinct other.order_id) as score
      from paid_items mine
      join paid_items other on other.order_id = mine.order_id and other.product_id <> mine.product_id
     where p_kind = 'complementary'
       and mine.product_id = any (v_input)
     group by other.product_id
    having count(distinct other.order_id) >= MIN_SHARED_ORDERS
  ),
  same_category as (
    select e.id, 2 as priority, -extract(epoch from e.created_at)::bigint as score
      from eligible e
     where p_kind = 'similar'
       and e.category_id in (select p.category_id from public.products p where p.id = any (v_input))
  ),
  popular as (
    select e.id,
           3 as priority,
           (case when e.is_featured then 0 else 1 end) * 1000000000::bigint
             - (select count(distinct pi.order_id) from paid_items pi where pi.product_id = e.id) as score
      from eligible e
  ),
  candidates as (
    select c.id, c.priority, c.score,
           case c.priority when 1 then 'manual'
                           when 2 then case p_kind when 'complementary' then 'bought_together' else 'same_category' end
                           else 'popular' end as source
      from (select * from manual
            union all select * from bought_together
            union all select * from same_category
            union all select * from popular) c
      join eligible e on e.id = c.id
  ),
  best as (
    select distinct on (c.id) c.id, c.priority, c.score, c.source
      from candidates c
     order by c.id, c.priority, c.score
  )
  select b.id,
         b.source,
         (row_number() over (order by b.priority, b.score, b.id))::integer
    from best b
   order by b.priority, b.score, b.id
   limit p_limit;
end;
$$;

comment on function public.recommended_products(uuid[], text, integer) is
  'Product ids to show next to the given products (product page: one id; cart: its lines; home: none). '
  'Manual links first, then bought together / same category, then popular. Active, sellable, non gift-card only.';

-- -----------------------------------------------------------------------------
-- 3. Privileges and RLS
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on public.product_recommendations from anon, authenticated;
revoke insert, update, delete on public.product_recommendations from anon;

-- Visitors see a link only when both ends are on sale.
create policy "product_recommendations: public reads links between active products, staff read all"
  on public.product_recommendations for select to anon, authenticated
  using ((exists (select 1 from public.products p
                   where p.id = product_recommendations.product_id and p.status = 'active')
          and exists (select 1 from public.products p
                       where p.id = product_recommendations.recommended_product_id and p.status = 'active'))
         or (select private.is_staff()));

create policy "product_recommendations: staff insert"
  on public.product_recommendations for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "product_recommendations: staff update"
  on public.product_recommendations for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "product_recommendations: staff delete"
  on public.product_recommendations for delete to authenticated
  using ((select private.has_permission('manage_products')));

revoke all on function public.recommended_products(uuid[], text, integer) from public;
grant execute on function public.recommended_products(uuid[], text, integer) to anon, authenticated, service_role;
