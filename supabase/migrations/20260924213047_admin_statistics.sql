-- =============================================================================
-- Migration 024 — Back-office statistics (iteration 8)
-- =============================================================================
-- The Statistics screen (webapp/src/pages/admin/Statistics.tsx) reads one
-- object, `AnalyticsSnapshot` (webapp/src/data/adminAnalytics.ts, the "seam a
-- real reporting backend replaces"). public.analytics_snapshot() returns that
-- shape (camelCase JSON), computed from the orders on each call — nothing is
-- stored, so figures can never drift from the orders they summarise.
--
-- Definitions (all in one currency, dates in the shop's time zone):
--   * a SALE is an order whose payment went through (payment_status paid,
--     partially_refunded or refunded), dated by paid_at;
--   * REVENUE = merchandise actually charged: order lines after discounts,
--     VAT included, gift card lines excluded (a gift card is money held, not
--     a sale), shipping excluded (reported apart), refunds not deducted
--     (reported apart). Hence the category breakdown sums to revenue;
--   * a CUSTOMER is an account, or the e-mail of a guest; NEW in a period = first
--     sale in that period; a RETURNING ORDER = not the customer's first sale;
--   * the previous period is the same length, immediately before;
--   * the orders section counts orders PLACED in the period (created_at),
--     whatever became of them.
-- Training figures arrive with the training iteration (null until then);
-- product-page conversion needs web analytics (not stored here).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reporting group of a catalogue category (the screen's revenue buckets)
-- -----------------------------------------------------------------------------
alter table public.categories
  add column report_group text not null default 'other'
    check (report_group in ('jewelry', 'aftercare', 'kits', 'training', 'other'));

comment on column public.categories.report_group is
  'Revenue bucket on the Statistics screen: jewelry, aftercare, kits (tools and accessories fold in), training, other.';

update public.categories set report_group = case slug
    when 'gems' then 'jewelry'
    when 'entretien' then 'aftercare'
    when 'kits' then 'kits'
    when 'outils' then 'kits'
    when 'accessoires' then 'kits'
    else report_group end;

create trigger categories_report_group_audit_log
  after update of report_group on public.categories
  for each row execute function private.audit_changes('report_group');

create index orders_paid_at_idx on public.orders (paid_at) where paid_at is not null;

-- -----------------------------------------------------------------------------
-- 2. Building block: sold merchandise lines of a period (RLS applies: staff)
-- -----------------------------------------------------------------------------
create or replace function private.analytics_sale_lines(
  p_from     timestamptz,
  p_to       timestamptz,
  p_currency text,
  p_filters  jsonb
)
returns table (
  order_id          uuid,
  paid_at           timestamptz,
  customer_key      text,
  customer_is_new   boolean,     -- first sale ever falls in [p_from, p_to)
  is_first_order    boolean,     -- this order is the customer's first sale
  country           text,
  product_id        uuid,
  report_group      text,
  quantity          integer,
  amount            numeric
)
language sql
stable
set search_path = ''
as $$
  with firsts as (
    select coalesce(o.user_id::text, lower(o.customer_email)) as ck, min(o.paid_at) as first_paid
      from public.orders o
     where o.paid_at is not null and o.payment_status in ('paid', 'partially_refunded', 'refunded')
     group by 1
  ), sales as (
    select o.id, o.paid_at, coalesce(o.user_id::text, lower(o.customer_email)) as ck,
           upper(coalesce(o.shipping_address ->> 'country_code', o.billing_address ->> 'country_code')) as country
      from public.orders o
     where o.paid_at >= p_from and o.paid_at < p_to
       and o.currency = p_currency
       and o.payment_status in ('paid', 'partially_refunded', 'refunded')
  )
  select s.id, s.paid_at, s.ck, f.first_paid >= p_from, f.first_paid = s.paid_at, s.country,
         i.product_id, coalesce(c.report_group, 'other'), i.quantity, i.subtotal_amount - i.discount_amount
    from sales s
    join firsts f on f.ck = s.ck
    join public.order_items i on i.order_id = s.id
    join public.products p on p.id = i.product_id and p.product_type <> 'gift_card'
    left join public.categories c on c.id = p.category_id
   where (p_filters ->> 'country' is null or s.country = p_filters ->> 'country')
     and (p_filters ->> 'customerType' is null
          or (p_filters ->> 'customerType' = 'new') = (f.first_paid >= p_from))
     and (p_filters ->> 'category' is null or coalesce(c.report_group, 'other') = p_filters ->> 'category')
     and (p_filters ->> 'product' is null or i.product_id = (p_filters ->> 'product')::uuid);
$$;

-- One KPI card: value, previous, change (percent, or points for rates), trend, sparkline.
create or replace function private.analytics_kpi(
  p_id text, p_value numeric, p_previous numeric, p_format text, p_spark jsonb, p_lead boolean default false
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
           'id', p_id,
           'value', p_value,
           'previous', p_previous,
           'change', x.change,
           'changeUnit', case when p_format = 'percent' then 'points' else 'percent' end,
           'format', p_format,
           'trend', case when x.change is null or abs(x.change) < 0.5 then 'flat'
                         when x.change > 0 then 'up' else 'down' end,
           'spark', coalesce(p_spark, '[]'::jsonb))
         || case when p_lead then jsonb_build_object('lead', true) else '{}'::jsonb end
    from (select case when p_format = 'percent' then round(p_value - p_previous, 1)
                      when coalesce(p_previous, 0) = 0 then null
                      else round((p_value - p_previous) / p_previous * 100, 1) end as change) x;
$$;

-- -----------------------------------------------------------------------------
-- 3. The snapshot
-- -----------------------------------------------------------------------------
-- p_filters (all optional): {"category": "jewelry|aftercare|kits|training|other",
--   "product": "<uuid>", "customerType": "new|returning", "country": "FR",
--   "orderStatus": "completed|pending|cancelled|refunded"}
-- category/product/customerType/country narrow the sales (KPIs, series,
-- breakdown, products, geography); country and orderStatus narrow the orders
-- section. The customer base (total, lifetime value, growth) is the whole base.
create or replace function public.analytics_snapshot(
  p_from     date,
  p_to       date,
  p_filters  jsonb default '{}'::jsonb,
  p_currency text default 'EUR',
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  f          jsonb := coalesce(p_filters, '{}'::jsonb);
  tz         text := p_timezone;
  v_days     integer;
  v_step     text;
  v_start    timestamptz;
  v_end      timestamptz;
  v_pstart   timestamptz;
  v_len      interval;
  v_epoch    numeric;
  c          record;
  pv         record;
  v_spark    record;
  v_kpis     jsonb;
  v_series   jsonb;
  v_breakdown jsonb;
  v_products jsonb;
  v_customers jsonb;
  v_orders   jsonb;
  v_geo      jsonb;
  v_cross    jsonb;
  v_extras   jsonb;
  v_orders_total integer;
begin
  if not (private.has_permission('view_statistics') or private.caller_jwt_role() in ('service_role', '')) then
    raise exception 'analytics_snapshot: not allowed' using errcode = '42501';
  end if;

  -- Validation -------------------------------------------------------------------
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from + 1 > 400 then
    raise exception 'analytics_snapshot: choose a period of 1 to 400 days' using errcode = '22023';
  end if;
  if coalesce(p_currency, '') !~ '^[A-Z]{3}$' then
    raise exception 'analytics_snapshot: invalid currency' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = tz) then
    raise exception 'analytics_snapshot: unknown time zone %', tz using errcode = '22023';
  end if;
  if jsonb_typeof(f) <> 'object'
     or exists (select 1 from jsonb_object_keys(f) k
                 where k not in ('category', 'product', 'customerType', 'country', 'orderStatus'))
     or (f ? 'category' and f ->> 'category' not in ('jewelry', 'aftercare', 'kits', 'training', 'other'))
     or (f ? 'product' and coalesce(f ->> 'product', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or (f ? 'customerType' and f ->> 'customerType' not in ('new', 'returning'))
     or (f ? 'country' and coalesce(f ->> 'country', '') !~ '^[A-Z]{2}$')
     or (f ? 'orderStatus' and f ->> 'orderStatus' not in ('completed', 'pending', 'cancelled', 'refunded')) then
    raise exception 'analytics_snapshot: invalid filters %', f using errcode = '22023';
  end if;

  v_days   := p_to - p_from + 1;
  v_step   := case when v_days = 1 then 'hour' when v_days <= 31 then 'day' when v_days <= 120 then 'week' else 'month' end;
  v_start  := p_from::timestamp at time zone tz;
  v_end    := (p_to + 1)::timestamp at time zone tz;
  v_len    := v_end - v_start;
  v_pstart := v_start - v_len;
  v_epoch  := extract(epoch from v_len);

  -- KPIs -------------------------------------------------------------------------
  select coalesce(sum(l.amount), 0) as revenue, count(distinct l.order_id) as orders,
         coalesce(sum(l.quantity), 0) as units,
         count(distinct l.customer_key) filter (where l.customer_is_new) as new_customers,
         count(distinct l.customer_key) filter (where not l.customer_is_new) as returning_customers,
         count(distinct l.order_id) filter (where not l.is_first_order) as returning_orders
    into c
    from private.analytics_sale_lines(v_start, v_end, p_currency, f) l;
  select coalesce(sum(l.amount), 0) as revenue, count(distinct l.order_id) as orders,
         coalesce(sum(l.quantity), 0) as units,
         count(distinct l.customer_key) filter (where l.customer_is_new) as new_customers,
         count(distinct l.customer_key) filter (where not l.customer_is_new) as returning_customers
    into pv
    from private.analytics_sale_lines(v_pstart, v_start, p_currency, f) l;

  -- Sparklines: the period cut in 12 equal slices.
  with l as (
    select x.*, least(12, 1 + floor(extract(epoch from x.paid_at - v_start) / v_epoch * 12)::integer) as s
      from private.analytics_sale_lines(v_start, v_end, p_currency, f) x
  ), agg as (
    select s, sum(amount) as r, count(distinct order_id) as o, sum(quantity) as u,
           count(distinct customer_key) filter (where customer_is_new) as n,
           count(distinct customer_key) filter (where not customer_is_new) as rc
      from l group by s
  )
  select jsonb_agg(coalesce(a.r, 0) order by g) as revenue,
         jsonb_agg(coalesce(a.o, 0) order by g) as orders,
         jsonb_agg(coalesce(round(a.r / nullif(a.o, 0), 2), 0) order by g) as aov,
         jsonb_agg(coalesce(a.u, 0) order by g) as units,
         jsonb_agg(coalesce(a.n, 0) order by g) as new_customers,
         jsonb_agg(coalesce(a.rc, 0) order by g) as returning_customers
    into v_spark
    from generate_series(1, 12) g
    left join agg a on a.s = g;

  v_kpis := jsonb_build_array(
    private.analytics_kpi('revenue', c.revenue, pv.revenue, 'currency', v_spark.revenue, true),
    private.analytics_kpi('orders', c.orders, pv.orders, 'count', v_spark.orders, true),
    private.analytics_kpi('aov', coalesce(round(c.revenue / nullif(c.orders, 0), 2), 0),
                          coalesce(round(pv.revenue / nullif(pv.orders, 0), 2), 0), 'currency', v_spark.aov),
    private.analytics_kpi('units', c.units, pv.units, 'count', v_spark.units),
    private.analytics_kpi('newCustomers', c.new_customers, pv.new_customers, 'count', v_spark.new_customers),
    private.analytics_kpi('returningCustomers', c.returning_customers, pv.returning_customers, 'count',
                          v_spark.returning_customers));

  -- Time series (current and previous period on the same buckets) ------------------
  with b as (
    select g as bucket
      from generate_series(date_trunc(v_step, v_start at time zone tz),
                           date_trunc(v_step, (v_end - interval '1 microsecond') at time zone tz),
                           ('1 ' || v_step)::interval) g
  ), cur as (
    select date_trunc(v_step, l.paid_at at time zone tz) as bucket, sum(l.amount) as r, count(distinct l.order_id) as o
      from private.analytics_sale_lines(v_start, v_end, p_currency, f) l group by 1
  ), prev as (
    select date_trunc(v_step, (l.paid_at + v_len) at time zone tz) as bucket, sum(l.amount) as r,
           count(distinct l.order_id) as o
      from private.analytics_sale_lines(v_pstart, v_start, p_currency, f) l group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI:SS'),
           'revenue', coalesce(cur.r, 0), 'orders', coalesce(cur.o, 0),
           'previousRevenue', coalesce(prev.r, 0), 'previousOrders', coalesce(prev.o, 0)) order by b.bucket), '[]'::jsonb)
    into v_series
    from b left join cur on cur.bucket = b.bucket left join prev on prev.bucket = b.bucket;

  -- Revenue by reporting group (fixed order: the colour belongs to the group) ---------
  with g(id, pos) as (values ('jewelry', 1), ('aftercare', 2), ('kits', 3), ('training', 4), ('other', 5)),
  x as (
    select l.report_group as id, sum(l.amount) as r, count(distinct l.order_id) as o
      from private.analytics_sale_lines(v_start, v_end, p_currency, f) l group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'id', g.id, 'revenue', coalesce(x.r, 0), 'orders', coalesce(x.o, 0),
           'share', case when c.revenue > 0 then round(coalesce(x.r, 0) / c.revenue * 100, 1) else 0 end) order by g.pos)
    into v_breakdown
    from g left join x on x.id = g.id;

  -- Best sellers (10) ------------------------------------------------------------------
  with cur as (
    select l.product_id, sum(l.quantity) as u, sum(l.amount) as r, count(distinct l.order_id) as o
      from private.analytics_sale_lines(v_start, v_end, p_currency, f) l group by 1
  ), prev as (
    select l.product_id, sum(l.amount) as r
      from private.analytics_sale_lines(v_pstart, v_start, p_currency, f) l group by 1
  ), top as (
    select * from cur order by r desc, u desc, product_id limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'slug', p.slug, 'name', p.name, 'category', cat.slug,
           'bucket', coalesce(cat.report_group, 'other'),
           'thumbnail', (select m.storage_path from public.product_media m where m.product_id = p.id and m.is_primary),
           'alt', (select m.alt_text from public.product_media m where m.product_id = p.id and m.is_primary),
           'units', t.u, 'revenue', t.r, 'orders', t.o,
           'change', case when coalesce(pr.r, 0) = 0 then null else round((t.r - pr.r) / pr.r * 100, 1) end,
           'stock', coalesce(
              (select i.stock_status from public.inventory_items i where i.product_id = p.id),
              (select case when count(*) = 0 then null
                           when bool_and(i.stock_status = 'out_of_stock') then 'out_of_stock'
                           when bool_or(i.stock_status in ('low_stock', 'out_of_stock')) then 'low_stock'
                           when bool_and(i.stock_status = 'preorder') then 'preorder'
                           else 'in_stock' end
                 from public.inventory_items i
                 join public.product_variants v on v.id = i.variant_id
                where v.product_id = p.id and v.is_active))) order by t.r desc, t.u desc, p.id), '[]'::jsonb)
    into v_products
    from top t
    join public.products p on p.id = t.product_id
    left join public.categories cat on cat.id = p.category_id
    left join prev pr on pr.product_id = t.product_id;

  -- Customers (whole base up to the end of the period) -----------------------------------
  with firsts as (
    select coalesce(o.user_id::text, lower(o.customer_email)) as ck, min(o.paid_at) as first_paid
      from public.orders o
     where o.paid_at < v_end and o.payment_status in ('paid', 'partially_refunded', 'refunded')
     group by 1
  ), lifetime as (
    select l.customer_key, sum(l.amount) as r, count(distinct l.order_id) as o
      from private.analytics_sale_lines('-infinity', v_end, p_currency, '{}'::jsonb) l group by 1
  ), b as (
    select g as bucket, g + ('1 ' || v_step)::interval as bucket_end
      from generate_series(date_trunc(v_step, v_start at time zone tz),
                           date_trunc(v_step, (v_end - interval '1 microsecond') at time zone tz),
                           ('1 ' || v_step)::interval) g
  ), growth as (
    select b.bucket,
           (select count(*) from firsts fi where fi.first_paid >= greatest(b.bucket at time zone tz, v_start)
                                            and fi.first_paid < least(b.bucket_end at time zone tz, v_end)) as added,
           (select count(*) from firsts fi where fi.first_paid < least(b.bucket_end at time zone tz, v_end)) as total
      from b
  )
  select jsonb_build_object(
           'total', (select count(*) from firsts),
           'new', c.new_customers,
           'returning', c.returning_customers,
           'repeatRate', coalesce(round(c.returning_orders::numeric / nullif(c.orders, 0) * 100, 1), 0),
           'lifetimeValue', coalesce((select round(avg(r), 2) from lifetime), 0),
           'lifetimeOrders', coalesce((select round(avg(o), 1) from lifetime), 0),
           'growth', coalesce((select jsonb_agg(jsonb_build_object(
                        'key', to_char(g.bucket, 'YYYY-MM-DD"T"HH24:MI:SS'), 'total', g.total, 'added', g.added)
                        order by g.bucket) from growth g), '[]'::jsonb))
    into v_customers;

  -- Orders placed in the period ---------------------------------------------------------
  with o as (
    select x.*,
           case when x.payment_status = 'refunded' or x.status = 'refunded' then 'refunded'
                when x.status = 'cancelled' then 'cancelled'
                when x.payment_status in ('pending', 'failed') then 'pending'
                else 'completed' end as grp
      from public.orders x
     where x.created_at >= v_start and x.created_at < v_end and x.currency = p_currency
       and (f ->> 'country' is null
            or upper(coalesce(x.shipping_address ->> 'country_code', x.billing_address ->> 'country_code')) = f ->> 'country')
  ), o2 as (
    select * from o where f ->> 'orderStatus' is null or grp = f ->> 'orderStatus'
  ), g(id, pos) as (values ('completed', 1), ('pending', 2), ('cancelled', 3), ('refunded', 4)),
  counts as (select grp, count(*) as n from o2 group by grp),
  shipped as (
    select x.id, x.paid_at, min(s.shipped_at) as first_shipped
      from public.orders x join public.shipments s on s.order_id = x.id and s.shipped_at is not null
     where x.paid_at >= v_start and x.paid_at < v_end and x.currency = p_currency
     group by x.id, x.paid_at
  )
  select (select count(*) from o2),
         jsonb_build_object(
           'total', (select count(*) from o2),
           'statuses', (select jsonb_agg(jsonb_build_object(
                           'id', g.id, 'orders', coalesce(cn.n, 0),
                           'share', coalesce(round(cn.n::numeric / nullif((select count(*) from o2), 0) * 100, 1), 0))
                           order by g.pos)
                          from g left join counts cn on cn.grp = g.id),
           'processingHours', (select round(avg(extract(epoch from sh.first_shipped - sh.paid_at)) / 3600, 1) from shipped sh),
           'refundRate', coalesce(round((select count(*) from o2 where grp = 'refunded')::numeric
                                        / nullif((select count(*) from o2), 0) * 100, 1), 0),
           'cancellationRate', coalesce(round((select count(*) from o2 where grp = 'cancelled')::numeric
                                              / nullif((select count(*) from o2), 0) * 100, 1), 0))
    into v_orders_total, v_orders;

  -- Geography (country of delivery, else billing) ----------------------------------------
  with x as (
    select l.country, sum(l.amount) as r, count(distinct l.order_id) as o
      from private.analytics_sale_lines(v_start, v_end, p_currency, f) l group by 1
  ), base as (
    select upper(coalesce(o.shipping_address ->> 'country_code', o.billing_address ->> 'country_code')) as country,
           count(distinct coalesce(o.user_id::text, lower(o.customer_email))) as cu
      from public.orders o
     where o.paid_at < v_end and o.payment_status in ('paid', 'partially_refunded', 'refunded')
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.country, 'revenue', x.r, 'orders', x.o, 'customers', coalesce(base.cu, 0),
           'share', case when c.revenue > 0 then round(x.r / c.revenue * 100, 1) else 0 end) order by x.r desc, x.country),
           '[]'::jsonb)
    into v_geo
    from x left join base on base.country = x.country;

  -- Cross-selling: jewellery orders that also carry aftercare ------------------------------
  with per as (
    select l.order_id, bool_or(l.report_group = 'jewelry') as j, bool_or(l.report_group = 'aftercare') as a
      from private.analytics_sale_lines(v_start, v_end, p_currency, f) l group by 1
  )
  select jsonb_build_array(jsonb_build_object(
           'id', 'aftercareAttach',
           'value', coalesce(round(100.0 * count(*) filter (where j and a) / nullif(count(*) filter (where j), 0), 1), 0),
           'format', 'percent'))
    into v_cross
    from per;

  -- What revenue leaves out, reported apart (not narrowed by the sales filters) -------------
  select jsonb_build_object(
           'shippingRevenue', coalesce((select sum(o.shipping_amount) from public.orders o
                                          where o.paid_at >= v_start and o.paid_at < v_end and o.currency = p_currency
                                            and o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0),
           'discounts', coalesce((select sum(o.discount_amount) from public.orders o
                                    where o.paid_at >= v_start and o.paid_at < v_end and o.currency = p_currency
                                      and o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0),
           'refunds', coalesce((select sum(r.amount) from public.refunds r
                                  where r.status = 'succeeded' and r.processed_at >= v_start and r.processed_at < v_end
                                    and r.currency = p_currency), 0),
           'giftCardsSold', coalesce((select sum(i.subtotal_amount)
                                        from public.orders o
                                        join public.order_items i on i.order_id = o.id
                                        join public.products p on p.id = i.product_id and p.product_type = 'gift_card'
                                       where o.paid_at >= v_start and o.paid_at < v_end and o.currency = p_currency
                                         and o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0))
    into v_extras;

  return jsonb_build_object(
    'start', p_from, 'end', p_to, 'step', v_step, 'currency', p_currency, 'timezone', tz, 'filters', f,
    'previousStart', (v_pstart at time zone tz)::date, 'previousEnd', p_from - 1,
    'hasData', c.orders > 0 or v_orders_total > 0,
    'kpis', v_kpis,
    'series', v_series,
    'breakdown', v_breakdown,
    'products', v_products,
    'customers', v_customers,
    'training', null,
    'orders', v_orders,
    'geo', v_geo,
    'insights', '[]'::jsonb,
    'cross', v_cross,
    'extras', v_extras);
end;
$$;

comment on function public.analytics_snapshot(date, date, jsonb, text, text) is
  'Statistics screen (AnalyticsSnapshot shape). Needs view_statistics. Revenue = merchandise after discounts, VAT incl., excl. gift cards, shipping and refunds (see extras).';

revoke all on function private.analytics_sale_lines(timestamptz, timestamptz, text, jsonb),
                       private.analytics_kpi(text, numeric, numeric, text, jsonb, boolean)
  from public;
grant execute on function private.analytics_sale_lines(timestamptz, timestamptz, text, jsonb),
                          private.analytics_kpi(text, numeric, numeric, text, jsonb, boolean)
  to authenticated, service_role;
revoke all on function public.analytics_snapshot(date, date, jsonb, text, text) from public, anon;
grant execute on function public.analytics_snapshot(date, date, jsonb, text, text) to authenticated, service_role;
