-- VAT franchise, per order (decision 114, follow-up of 20261026185024_vat_franchise).
--
-- The regime an order is sold under is the one in force when it is created:
-- `create_order()` freezes its VAT then. The invoice is issued later, on
-- payment, and used to read the regime (seller flag, shipping rate) from the
-- settings of that moment — an order created under one regime and paid after
-- the switch changed would have got a mixed invoice. Now:
--
--   * `orders.vat_franchise` is set by a BEFORE INSERT trigger from
--     `store_settings` and never changes afterwards (an UPDATE keeps it);
--     orders created before the franchise keep false (all were sold with VAT);
--   * `private.configured_vat_rate_bp()` is the configured rate, whatever the
--     switch; `vat_rate_bp()` = 0 under the franchise, else that rate;
--   * `issue_order_invoice()` takes the seller's `vat_franchise` and the
--     shipping line's rate from the order.

alter table public.orders
  add column vat_franchise boolean not null default false;

comment on column public.orders.vat_franchise is
  'Sold under the VAT franchise (art. 293 B CGI): copied from store_settings when the order is created, never changed. Drives the invoice''s regime.';

create or replace function private.order_snapshot_vat_regime()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.vat_franchise := coalesce((select s.vat_franchise from public.store_settings s where s.id), false);
  else
    new.vat_franchise := old.vat_franchise;
  end if;
  return new;
end;
$$;

revoke all on function private.order_snapshot_vat_regime() from public, anon, authenticated;

create trigger orders_snapshot_vat_regime
  before insert or update of vat_franchise on public.orders
  for each row execute function private.order_snapshot_vat_regime();

create or replace function private.configured_vat_rate_bp(p_country_code text, p_tax_category text default 'standard')
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select r.rate_bp from public.tax_rates r
      where r.country_code = upper(p_country_code) and r.tax_category = p_tax_category and r.is_active),
    (select r.rate_bp from public.tax_rates r
      where r.country_code = upper(p_country_code) and r.tax_category = 'standard' and r.is_active),
    0);
$$;

create or replace function public.vat_rate_bp(p_country_code text, p_tax_category text default 'standard')
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce((select s.vat_franchise from public.store_settings s where s.id), false) then 0
    else private.configured_vat_rate_bp(p_country_code, p_tax_category)
  end;
$$;

create or replace function private.issue_order_invoice(p_order_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_invoice   public.invoices;
  v_lines     jsonb;
  v_items_vat numeric(12, 2);
  v_ship_vat  numeric(12, 2);
  v_ship_rate integer;
  v_address   jsonb;
  v_number    record;
begin
  select * into v_invoice from public.invoices where order_id = p_order_id and kind = 'invoice';
  if found then
    return v_invoice;
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'issue_order_invoice: order not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_item_id',   i.id,
           'kind',            case when i.course_id is not null then 'course'
                                   when exists (select 1 from public.gift_cards g where g.order_item_id = i.id) then 'gift_card'
                                   else 'product' end,
           'description',     i.product_name,
           'detail',          i.variant_name,
           'sku',             i.sku,
           'quantity',        i.quantity,
           'unit_price_incl', i.unit_price,
           'unit_price_excl', round(i.unit_price * 10000 / (10000 + coalesce(i.tax_rate_bp, 0)), 2),
           'discount_incl',   coalesce(i.discount_amount, 0),
           'vat_rate_bp',     coalesce(i.tax_rate_bp, 0),
           'total_incl',      i.subtotal_amount - coalesce(i.discount_amount, 0),
           'vat_amount',      coalesce(i.tax_amount, 0),
           'total_excl',      i.subtotal_amount - coalesce(i.discount_amount, 0) - coalesce(i.tax_amount, 0))
           order by i.created_at, i.id), '[]'::jsonb),
         coalesce(sum(coalesce(i.tax_amount, 0)), 0)
    into v_lines, v_items_vat
    from public.order_items i
   where i.order_id = v_order.id;

  if v_order.shipping_amount > 0 then
    v_ship_vat := least(greatest(v_order.tax_amount - v_items_vat, 0), v_order.shipping_amount);
    v_ship_rate := case when v_order.vat_franchise then 0
                        else coalesce(private.configured_vat_rate_bp(v_order.tax_country_code, 'standard'), 0) end;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'order_item_id', null, 'kind', 'shipping',
      'description', coalesce(v_order.shipping_method_name, ''), 'detail', null, 'sku', null,
      'quantity', 1, 'unit_price_incl', v_order.shipping_amount,
      'unit_price_excl', v_order.shipping_amount - v_ship_vat, 'discount_incl', 0,
      'vat_rate_bp', v_ship_rate, 'total_incl', v_order.shipping_amount,
      'vat_amount', v_ship_vat, 'total_excl', v_order.shipping_amount - v_ship_vat));
  end if;

  v_address := coalesce(v_order.billing_address, v_order.shipping_address, '{}'::jsonb);
  select * into v_number from private.take_invoice_number('FA');

  insert into public.invoices
    (kind, series, sequence_number, invoice_number, order_id, issued_at, sale_date, locale, currency,
     total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines, vat_breakdown, payment)
  select 'invoice', v_number.o_series, v_number.o_number,
         private.format_invoice_number(v_number.o_series, v_number.o_number),
         v_order.id, v_number.o_issued_at,
         (coalesce(v_order.paid_at, v_number.o_issued_at) at time zone 'Europe/Paris')::date,
         v_order.locale, v_order.currency,
         t.excl, t.vat, t.excl + t.vat,
         coalesce(private.invoice_seller(), '{}'::jsonb) || jsonb_build_object('vat_franchise', v_order.vat_franchise),
         jsonb_build_object('email', v_order.customer_email, 'address', v_address, 'order_number', v_order.order_number),
         v_lines, private.invoice_vat_breakdown(v_lines),
         jsonb_build_object(
           'paid_at',          coalesce(v_order.paid_at, v_number.o_issued_at),
           'gift_card_amount', v_order.gift_card_amount,
           'charged_amount',   (t.excl + t.vat) - least(v_order.gift_card_amount, t.excl + t.vat))
    from (select coalesce(sum((l ->> 'total_excl')::numeric), 0) as excl,
                 coalesce(sum((l ->> 'vat_amount')::numeric), 0) as vat
            from jsonb_array_elements(v_lines) l) t
  returning * into v_invoice;
  return v_invoice;
end;
$$;

revoke all on function private.issue_order_invoice(uuid) from public, anon, authenticated;
