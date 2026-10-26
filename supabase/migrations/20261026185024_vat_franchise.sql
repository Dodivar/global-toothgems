-- VAT franchise ("franchise en base de TVA", article 293 B of the French CGI) — decision 114.
--
-- The shop is run, for now, by a micro-entreprise that does not charge VAT.
-- One switch on the store row, `store_settings.vat_franchise` (on by default),
-- decides it; the VAT rates stay configured for the day the business leaves
-- the franchise and the switch goes off.
--
--   * `vat_rate_bp()` returns 0 while the franchise is on, so every caller
--     (create_order: product, course and shipping lines; the invoice's
--     shipping line; credit notes through the invoiced rates) charges no VAT
--     without any other change. Prices are the same amounts: what was "VAT
--     included" is now the price, with no VAT in it.
--   * `private.invoice_seller()` freezes the regime in every invoice snapshot
--     (`seller.vat_franchise`), so a document keeps the layout and the legal
--     mention "TVA non applicable, art. 293 B du CGI" of the regime it was
--     issued under, whatever Settings says later.
--   * A credit note follows the regime of the invoice it credits.
--   * `admin_save_store_details()` takes an optional boolean `vat_franchise`
--     (absent = unchanged).

alter table public.store_settings
  add column vat_franchise boolean not null default true;

comment on column public.store_settings.vat_franchise is
  'Franchise en base de TVA (art. 293 B CGI): no VAT is charged (vat_rate_bp() = 0) and invoices carry the legal mention. Public (shown at checkout).';

create or replace function public.vat_rate_bp(p_country_code text, p_tax_category text default 'standard')
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce((select s.vat_franchise from public.store_settings s where s.id), false) then 0
    else coalesce(
      (select r.rate_bp from public.tax_rates r
        where r.country_code = upper(p_country_code) and r.tax_category = p_tax_category and r.is_active),
      (select r.rate_bp from public.tax_rates r
        where r.country_code = upper(p_country_code) and r.tax_category = 'standard' and r.is_active),
      0)
  end;
$$;

comment on function public.vat_rate_bp(text, text) is
  'VAT rate (basis points) for a destination and tax category: 0 under the VAT franchise (store_settings.vat_franchise), else the reduced rate, the standard rate, then 0.';

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
           'vat_franchise',       s.vat_franchise,
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

-- Credit notes: today's seller identity, but the VAT regime of the credited
-- invoice (an invoice issued before this migration has no key: standard).
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
         coalesce(private.invoice_seller(), v_invoice.seller)
           || jsonb_build_object('vat_franchise', coalesce((v_invoice.seller ->> 'vat_franchise')::boolean, false)),
         v_invoice.buyer, v_lines,
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

revoke all on function private.issue_refund_credit_note(uuid) from public, anon, authenticated;

create or replace function public.admin_save_store_details(p_details jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_text_keys constant text[] := array[
    'store_name', 'legal_name', 'legal_form', 'share_capital', 'registration_number', 'vat_number',
    'business_email', 'support_email', 'phone', 'address_line1', 'address_line2', 'postal_code', 'city',
    'region', 'country_code', 'publication_director', 'publication_director_role', 'host_name',
    'host_address', 'host_contact', 'support_message'];
  v_key    text;
  v_vat    text;
  v_tr     record;
  v_msg    text;
begin
  if not private.has_permission('manage_settings') then
    raise exception 'admin_save_store_details: not allowed' using errcode = '42501';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'admin_save_store_details: details must be an object' using errcode = '22023';
  end if;
  foreach v_key in array v_text_keys loop
    if jsonb_typeof(p_details -> v_key) is distinct from 'string' then
      raise exception 'admin_save_store_details: % must be a string', v_key using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array array['show_email', 'show_phone', 'show_address'] loop
    if jsonb_typeof(p_details -> v_key) is distinct from 'boolean' then
      raise exception 'admin_save_store_details: % must be a boolean', v_key using errcode = '22023';
    end if;
  end loop;
  if p_details ? 'vat_franchise' and jsonb_typeof(p_details -> 'vat_franchise') is distinct from 'boolean' then
    raise exception 'admin_save_store_details: vat_franchise must be a boolean' using errcode = '22023';
  end if;
  if nullif(btrim(p_details ->> 'store_name'), '') is null then
    raise exception 'admin_save_store_details: the store name is required' using errcode = '22023';
  end if;
  if not coalesce(private.valid_opening_hours(p_details -> 'opening_hours'), false) then
    raise exception 'admin_save_store_details: invalid opening hours' using errcode = '22023';
  end if;
  if p_details ? 'translations' and jsonb_typeof(p_details -> 'translations') <> 'object' then
    raise exception 'admin_save_store_details: translations must be an object' using errcode = '22023';
  end if;
  v_vat := nullif(upper(regexp_replace(p_details ->> 'vat_number', '\s', '', 'g')), '');

  -- Column CHECKs reject anything malformed (23514), atomically.
  update public.store_settings set
    store_name                = btrim(p_details ->> 'store_name'),
    legal_name                = nullif(btrim(p_details ->> 'legal_name'), ''),
    legal_form                = nullif(btrim(p_details ->> 'legal_form'), ''),
    share_capital             = nullif(btrim(p_details ->> 'share_capital'), ''),
    registration_number       = nullif(btrim(p_details ->> 'registration_number'), ''),
    vat_number                = v_vat,
    vat_franchise             = coalesce((p_details ->> 'vat_franchise')::boolean, vat_franchise),
    business_email            = nullif(lower(btrim(p_details ->> 'business_email')), ''),
    support_email             = nullif(lower(btrim(p_details ->> 'support_email')), ''),
    phone                     = nullif(btrim(p_details ->> 'phone'), ''),
    address_line1             = nullif(btrim(p_details ->> 'address_line1'), ''),
    address_line2             = nullif(btrim(p_details ->> 'address_line2'), ''),
    postal_code               = nullif(btrim(p_details ->> 'postal_code'), ''),
    city                      = nullif(btrim(p_details ->> 'city'), ''),
    region                    = nullif(btrim(p_details ->> 'region'), ''),
    country_code              = upper(btrim(p_details ->> 'country_code')),
    publication_director      = nullif(btrim(p_details ->> 'publication_director'), ''),
    publication_director_role = nullif(btrim(p_details ->> 'publication_director_role'), ''),
    host_name                 = nullif(btrim(p_details ->> 'host_name'), ''),
    host_address              = nullif(btrim(p_details ->> 'host_address'), ''),
    host_contact              = nullif(btrim(p_details ->> 'host_contact'), ''),
    show_email                = (p_details ->> 'show_email')::boolean,
    show_phone                = (p_details ->> 'show_phone')::boolean,
    show_address              = (p_details ->> 'show_address')::boolean,
    opening_hours             = p_details -> 'opening_hours',
    support_message           = nullif(btrim(p_details ->> 'support_message'), '')
  where id;

  for v_tr in select key, value from jsonb_each(coalesce(p_details -> 'translations', '{}'::jsonb))
  loop
    if not exists (select 1 from public.languages l where l.code = v_tr.key and not l.is_default) then
      raise exception 'admin_save_store_details: unknown translation language %', v_tr.key using errcode = '22023';
    end if;
    if jsonb_typeof(v_tr.value) <> 'object' or jsonb_typeof(v_tr.value -> 'support_message') is distinct from 'string' then
      raise exception 'admin_save_store_details: translation % must carry a support_message string', v_tr.key
        using errcode = '22023';
    end if;
    v_msg := nullif(btrim(v_tr.value ->> 'support_message'), '');
    if v_msg is null then
      delete from public.store_settings_translations where locale = v_tr.key;
    else
      insert into public.store_settings_translations (locale, support_message)
      values (v_tr.key, v_msg)
      on conflict (locale) do update set support_message = excluded.support_message
       where store_settings_translations.support_message is distinct from excluded.support_message;
    end if;
  end loop;
end;
$$;
