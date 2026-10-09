-- =============================================================================
-- Invoices and credit notes (legal numbering)
-- =============================================================================
-- An order becomes a legal invoice the moment it is paid, and every confirmed
-- refund of an invoiced order becomes a credit note against it. Both are
-- issued by the database, in the transaction that marks the order paid or the
-- refund succeeded, so no paid order lacks its invoice and no number is lost.
--
-- Numbering (French VAT rules: unique, chronological, continuous):
--   * two series per calendar year (Europe/Paris): `FA-YYYY-NNNNNN` for
--     invoices, `AV-YYYY-NNNNNN` for credit notes;
--   * `invoice_sequences` holds the last number of each series; the issuing
--     transaction locks its row, so numbers follow the commit order, and a
--     transaction that rolls back gives its number back (no gap) — unlike a
--     Postgres sequence;
--   * `issued_at` is read (clock_timestamp) after the lock, so a later number
--     never carries an earlier date.
--
-- Content: an invoice is a frozen snapshot, never recomputed — the seller's
-- identity and legal mentions as Settings held them at issue time, the buyer
-- (billing address + e-mail), the lines with their VAT rate, excluding- and
-- including-VAT amounts, the shipping, the VAT breakdown per rate and the
-- payment. Amounts come from what `create_order()` stored (VAT per line,
-- prices including VAT); the shipping VAT is the order's VAT less the lines'.
-- Gift card lines carry no VAT (multi-purpose vouchers, taxed on redemption).
--
-- A credit note is issued for the refunded amount. Its VAT follows what was
-- refunded: the refunded units at their line's rate (scaled to the amount),
-- any surplus at the shipping's rate; a refund without items is spread over
-- the invoice's rates pro rata. Rounding residue goes to the largest line.
--
-- Rules: invoices are insert-only (a trigger refuses UPDATE and DELETE, for
-- every role); nothing is writable through the API; the owner of the order
-- and active staff read them. Orders paid before this migration have no
-- invoice (no backfill: development data only).
-- =============================================================================

-- Series counters --------------------------------------------------------------
create table public.invoice_sequences (
  series      text primary key check (series ~ '^(FA|AV)-[0-9]{4}$'),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at  timestamptz not null default now()
);
alter table public.invoice_sequences enable row level security;
revoke all on public.invoice_sequences from anon, authenticated;
comment on table public.invoice_sequences is
  'Last number issued per invoice series (FA-YYYY invoices, AV-YYYY credit notes). Backend only.';

-- Invoices and credit notes ------------------------------------------------------
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('invoice', 'credit_note')),
  series              text not null references public.invoice_sequences (series),
  sequence_number     integer not null check (sequence_number > 0),
  invoice_number      text not null unique,
  order_id            uuid not null references public.orders (id) on delete restrict,
  refund_id           uuid unique references public.refunds (id) on delete restrict,
  credited_invoice_id uuid references public.invoices (id) on delete restrict,
  issued_at           timestamptz not null,
  sale_date           date not null,
  locale              text not null,
  currency            char(3) not null,
  total_excl_tax      numeric(12, 2) not null,
  total_tax           numeric(12, 2) not null check (total_tax >= 0),
  total_incl_tax      numeric(12, 2) not null check (total_incl_tax >= 0),
  seller              jsonb not null check (jsonb_typeof(seller) = 'object'),
  buyer               jsonb not null check (jsonb_typeof(buyer) = 'object'),
  lines               jsonb not null check (jsonb_typeof(lines) = 'array'),
  vat_breakdown       jsonb not null check (jsonb_typeof(vat_breakdown) = 'array'),
  payment             jsonb not null default '{}'::jsonb check (jsonb_typeof(payment) = 'object'),
  created_at          timestamptz not null default now(),
  constraint invoices_series_number_unique unique (series, sequence_number),
  constraint invoices_totals_add_up check (total_incl_tax = total_excl_tax + total_tax),
  constraint invoices_kind_links check (
    (kind = 'invoice' and refund_id is null and credited_invoice_id is null and series like 'FA-%')
    or (kind = 'credit_note' and refund_id is not null and credited_invoice_id is not null and series like 'AV-%'))
);
create unique index invoices_one_per_order on public.invoices (order_id) where kind = 'invoice';
create index invoices_order_id_idx on public.invoices (order_id);
create index invoices_credited_invoice_id_idx on public.invoices (credited_invoice_id);
alter table public.invoices enable row level security;
comment on table public.invoices is
  'Legal invoices (paid orders) and credit notes (confirmed refunds): numbered, frozen snapshots. Insert-only, issued by triggers.';

revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;

create policy "invoices: owners and staff read" on public.invoices
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = invoices.order_id and o.user_id = (select auth.uid()))
    or (select private.is_staff())
  );

-- Immutability -------------------------------------------------------------------
create or replace function private.guard_invoice_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'invoices are immutable: issue a credit note instead' using errcode = '42501';
end;
$$;

create trigger invoices_immutable
  before update or delete on public.invoices
  for each row execute function private.guard_invoice_immutable();

-- Numbering ----------------------------------------------------------------------
-- Locks the series row: concurrent issuers wait, numbers follow commit order.
create or replace function private.take_invoice_number(p_prefix text, out o_series text, out o_number integer, out o_issued_at timestamptz)
language plpgsql
set search_path = ''
as $$
begin
  if p_prefix not in ('FA', 'AV') then
    raise exception 'take_invoice_number: unknown series %', p_prefix using errcode = '22023';
  end if;
  o_series := p_prefix || '-' || to_char(clock_timestamp() at time zone 'Europe/Paris', 'YYYY');
  insert into public.invoice_sequences (series) values (o_series) on conflict (series) do nothing;
  update public.invoice_sequences
     set last_number = last_number + 1, updated_at = clock_timestamp()
   where series = o_series
  returning last_number into o_number;
  o_issued_at := clock_timestamp();
end;
$$;

create or replace function private.format_invoice_number(p_series text, p_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_series || '-' || lpad(p_number::text, 6, '0');
$$;

-- Snapshots ----------------------------------------------------------------------
create or replace function private.invoice_seller()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'store_name',          s.store_name,
           'legal_name',          coalesce(s.legal_name, ''),
           'legal_form',          coalesce(s.legal_form, ''),
           'share_capital',       coalesce(s.share_capital, ''),
           'registration_number', coalesce(s.registration_number, ''),
           'vat_number',          coalesce(s.vat_number, ''),
           'email',               coalesce(nullif(s.support_email, ''), s.business_email, ''),
           'address_line1',       coalesce(s.address_line1, ''),
           'address_line2',       coalesce(s.address_line2, ''),
           'postal_code',         coalesce(s.postal_code, ''),
           'city',                coalesce(s.city, ''),
           'region',              coalesce(s.region, ''),
           'country_code',        coalesce(s.country_code, ''))
    from public.store_settings s
   where s.id;
$$;

/** The VAT breakdown of a set of invoice lines: one entry per rate. */
create or replace function private.invoice_vat_breakdown(p_lines jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'vat_rate_bp', rate, 'total_excl', excl, 'vat_amount', vat, 'total_incl', excl + vat) order by rate desc), '[]'::jsonb)
    from (select (l ->> 'vat_rate_bp')::integer as rate,
                 sum((l ->> 'total_excl')::numeric) as excl,
                 sum((l ->> 'vat_amount')::numeric) as vat
            from jsonb_array_elements(p_lines) l
           group by 1) t;
$$;

-- Issuing the invoice of a paid order ------------------------------------------------
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
    v_ship_rate := coalesce(public.vat_rate_bp(v_order.tax_country_code, 'standard'), 0);
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
         coalesce(private.invoice_seller(), '{}'::jsonb),
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

-- Issuing the credit note of a confirmed refund -------------------------------------------
create or replace function private.issue_refund_credit_note(p_refund_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund   public.refunds;
  v_invoice  public.invoices;
  v_note     public.invoices;
  v_raw      jsonb := '[]'::jsonb;   -- [{line, weight}] before scaling to the refunded amount
  v_weight   numeric := 0;
  v_ship     jsonb;
  v_lines    jsonb := '[]'::jsonb;
  v_row      record;
  v_gross    numeric(12, 2);
  v_left     numeric(12, 2);
  v_largest  integer;
  v_number   record;
  v_idx      integer := 0;
begin
  select * into v_note from public.invoices where refund_id = p_refund_id;
  if found then
    return v_note;
  end if;
  select * into v_refund from public.refunds where id = p_refund_id;
  if not found or v_refund.status <> 'succeeded' then
    return null;
  end if;
  select * into v_invoice from public.invoices where order_id = v_refund.order_id and kind = 'invoice';
  if not found then
    return null;   -- order paid before invoicing existed: nothing to credit
  end if;

  -- What was refunded: the units of the refund's items, valued at their invoiced price.
  select coalesce(jsonb_agg(jsonb_build_object(
           'line', l || jsonb_build_object('quantity', ri.quantity),
           'weight', (l ->> 'total_incl')::numeric * ri.quantity / nullif((l ->> 'quantity')::numeric, 0))), '[]'::jsonb),
         coalesce(sum((l ->> 'total_incl')::numeric * ri.quantity / nullif((l ->> 'quantity')::numeric, 0)), 0)
    into v_raw, v_weight
    from public.refund_items ri
    join jsonb_array_elements(v_invoice.lines) l on (l ->> 'order_item_id')::uuid = ri.order_item_id
   where ri.refund_id = v_refund.id;

  select l into v_ship from jsonb_array_elements(v_invoice.lines) l where l ->> 'kind' = 'shipping' limit 1;

  if v_weight = 0 then
    -- No items: the amount is spread over the invoice's rates.
    select coalesce(jsonb_agg(jsonb_build_object(
             'line', jsonb_build_object('order_item_id', null, 'kind', 'adjustment', 'description', null, 'detail', null,
                                        'sku', null, 'quantity', null, 'vat_rate_bp', (b ->> 'vat_rate_bp')::integer),
             'weight', (b ->> 'total_incl')::numeric)), '[]'::jsonb),
           coalesce(sum((b ->> 'total_incl')::numeric), 0)
      into v_raw, v_weight
      from jsonb_array_elements(v_invoice.vat_breakdown) b
     where (b ->> 'total_incl')::numeric > 0;
  elsif v_refund.amount > v_weight and v_ship is not null then
    -- More than the items: the surplus is shipping.
    v_raw := v_raw || jsonb_build_array(jsonb_build_object(
      'line', v_ship || jsonb_build_object('quantity', 1),
      'weight', least(v_refund.amount - v_weight, (v_ship ->> 'total_incl')::numeric)));
    v_weight := v_weight + least(v_refund.amount - v_weight, (v_ship ->> 'total_incl')::numeric);
  end if;
  if v_weight <= 0 then
    raise exception 'issue_refund_credit_note: nothing to credit on %', v_invoice.invoice_number using errcode = '23514';
  end if;

  -- Scale to the refunded amount, cent-exact; the residue goes to the largest line.
  v_left := v_refund.amount;
  for v_row in select value as r, ordinality::integer as n from jsonb_array_elements(v_raw) with ordinality
  loop
    v_gross := round(v_refund.amount * (v_row.r ->> 'weight')::numeric / v_weight, 2);
    v_left := v_left - v_gross;
    v_lines := v_lines || jsonb_build_array((v_row.r -> 'line') || jsonb_build_object('total_incl', v_gross));
  end loop;
  select n - 1 into v_largest
    from (select ordinality::integer as n, (value ->> 'total_incl')::numeric as v
            from jsonb_array_elements(v_lines) with ordinality) t
   order by v desc, n limit 1;
  v_lines := jsonb_set(v_lines, array[v_largest::text, 'total_incl'],
                       to_jsonb((v_lines -> v_largest ->> 'total_incl')::numeric + v_left));

  -- VAT per line on the credited amount.
  select jsonb_agg(l - 'unit_price_incl' - 'unit_price_excl' - 'discount_incl' || jsonb_build_object(
           'vat_amount', public.vat_included((l ->> 'total_incl')::numeric, (l ->> 'vat_rate_bp')::integer),
           'total_excl', (l ->> 'total_incl')::numeric
                         - public.vat_included((l ->> 'total_incl')::numeric, (l ->> 'vat_rate_bp')::integer))
           order by n)
    into v_lines
    from jsonb_array_elements(v_lines) with ordinality as e(l, n);

  select * into v_number from private.take_invoice_number('AV');
  insert into public.invoices
    (kind, series, sequence_number, invoice_number, order_id, refund_id, credited_invoice_id, issued_at, sale_date,
     locale, currency, total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines, vat_breakdown, payment)
  select 'credit_note', v_number.o_series, v_number.o_number,
         private.format_invoice_number(v_number.o_series, v_number.o_number),
         v_invoice.order_id, v_refund.id, v_invoice.id, v_number.o_issued_at, v_invoice.sale_date,
         v_invoice.locale, v_invoice.currency, t.excl, t.vat, t.excl + t.vat,
         coalesce(private.invoice_seller(), v_invoice.seller), v_invoice.buyer, v_lines,
         private.invoice_vat_breakdown(v_lines),
         jsonb_build_object(
           'refunded_at', coalesce(v_refund.processed_at, v_number.o_issued_at),
           'refund_method', (select case when p.provider = 'gift_card' then 'gift_card' else 'card' end
                               from public.payments p where p.id = v_refund.payment_id),
           'reason', v_refund.reason,
           'credited_invoice_number', v_invoice.invoice_number)
    from (select sum((l ->> 'total_excl')::numeric) as excl, sum((l ->> 'vat_amount')::numeric) as vat
            from jsonb_array_elements(v_lines) l) t
  returning * into v_note;
  return v_note;
end;
$$;

revoke all on function private.issue_order_invoice(uuid) from public, anon, authenticated;
revoke all on function private.issue_refund_credit_note(uuid) from public, anon, authenticated;
revoke all on function private.take_invoice_number(text) from public, anon, authenticated;

-- Triggers -------------------------------------------------------------------------------
create or replace function private.invoice_paid_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'paid'
     and old.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    perform private.issue_order_invoice(new.id);
  end if;
  return null;
end;
$$;

create trigger orders_zz_issue_invoice
  after update of payment_status on public.orders
  for each row execute function private.invoice_paid_order();

create or replace function private.credit_note_for_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'succeeded' and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
    perform private.issue_refund_credit_note(new.id);
  end if;
  return null;
end;
$$;

-- Named to run after `refunds_apply_success` (payment and order states first).
create trigger refunds_zz_issue_credit_note
  after insert or update of status on public.refunds
  for each row execute function private.credit_note_for_refund();
