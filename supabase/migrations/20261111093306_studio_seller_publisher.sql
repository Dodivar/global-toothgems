-- =============================================================================
-- The 3D Studio is sold and invoiced by the website publisher — decision 131
-- =============================================================================
-- Owner's decision (2026-11-11): the shop and the Academy are sold by the
-- seller (PIMP TON SMILE), the 3D Studio subscriptions by the website
-- publisher (DoDigital, decision 121), which collects them on its own Stripe
-- account. Each business issues its own documents:
--
--   * `store_settings.publisher_vat_number` and `publisher_vat_franchise`
--     complete the publisher's identity for invoicing (its own VAT regime,
--     franchise on by default like the seller's; never the seller's VAT
--     number). Public like the other publisher_* columns (the Studio's price
--     notes read the franchise). Saved by admin_save_store_details().
--   * `private.studio_invoice_seller()`: the publisher as the seller snapshot
--     of Studio documents, same shape as private.invoice_seller(); the one-line
--     `publisher_address` goes in `address_line1`.
--   * Two series of its own, gapless per year like the shop's: `FS-YYYY-NNNNNN`
--     (Studio invoices) and `AS-YYYY-NNNNNN` (Studio credit notes).
--     Orders keep FA/AV only; a Studio document is FS/AS — or the legacy FA/AV
--     of the test-mode Studio invoices issued before this migration.
--   * A Studio credit note follows the invoice it credits: same frozen seller
--     and regime, AS for an FS invoice (AV for a legacy FA one).
-- =============================================================================

-- 1. The publisher's invoicing details -----------------------------------------
alter table public.store_settings
  add column publisher_vat_number    text check (publisher_vat_number ~ '^[A-Z]{2}[0-9A-Z+*.]{2,13}$'),
  add column publisher_vat_franchise boolean not null default true;

comment on column public.store_settings.publisher_vat_number is
  'Intra-EU VAT number of the website publisher, which sells the 3D Studio (decision 131); printed on Studio invoices when set. Public.';
comment on column public.store_settings.publisher_vat_franchise is
  'The website publisher sells the 3D Studio under the VAT franchise (art. 293 B du CGI, decision 131). Public.';

-- 2. Numbering: two more series ----------------------------------------------------
alter table public.invoice_sequences drop constraint invoice_sequences_series_check;
alter table public.invoice_sequences add constraint invoice_sequences_series_check
  check (series ~ '^(FA|AV|FS|AS)-[0-9]{4}$');

comment on table public.invoice_sequences is
  'Last number issued per invoice series: FA-YYYY / AV-YYYY (seller: shop, Academy), FS-YYYY / AS-YYYY (publisher: 3D Studio, decision 131). Backend only.';

create or replace function private.take_invoice_number(p_prefix text, out o_series text, out o_number integer, out o_issued_at timestamptz)
language plpgsql
set search_path = ''
as $$
begin
  if p_prefix not in ('FA', 'AV', 'FS', 'AS') then
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

revoke all on function private.take_invoice_number(text) from public, anon, authenticated;

alter table public.invoices drop constraint invoices_kind_links;
alter table public.invoices add constraint invoices_kind_links check (
  num_nonnulls(order_id, studio_invoice_id) = 1
  and (
    (kind = 'invoice' and refund_id is null and studio_withdrawal_id is null and credited_invoice_id is null
       and (series like 'FA-%' or (studio_invoice_id is not null and series like 'FS-%')))
    or (kind = 'credit_note' and credited_invoice_id is not null
        and ((order_id is not null and refund_id is not null and studio_withdrawal_id is null and series like 'AV-%')
             or (studio_invoice_id is not null and studio_withdrawal_id is not null and refund_id is null
                 and (series like 'AS-%' or series like 'AV-%'))))));

-- 3. The Studio's seller snapshot -------------------------------------------------
create or replace function private.studio_invoice_seller()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'store_name',          s.store_name,
           'trading_name',        coalesce(s.publisher_name, ''),
           'legal_name',          coalesce(s.publisher_legal_name, ''),
           'legal_form',          coalesce(s.publisher_legal_form, ''),
           'share_capital',       '',
           'registration_number', coalesce(s.publisher_registration_number, ''),
           'vat_number',          coalesce(s.publisher_vat_number, ''),
           'vat_franchise',       s.publisher_vat_franchise,
           'email',               coalesce(s.publisher_email, ''),
           'address_line1',       coalesce(s.publisher_address, ''),
           'address_line2',       '',
           'postal_code',         '',
           'city',                '',
           'region',              '',
           'country_code',        '',
           'studio_seller',       true)
    from public.store_settings s
   where s.id;
$$;

revoke all on function private.studio_invoice_seller() from public, anon, authenticated;

-- 4. Issuing Studio invoices and credit notes ------------------------------------
create or replace function private.issue_studio_invoice(p_stripe_invoice_id text)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_si        public.studio_subscription_invoices;
  v_sub       public.studio_subscriptions;
  v_invoice   public.invoices;
  v_locale    text;
  v_total     numeric(12, 2);
  v_franchise boolean;
  v_rate      integer;
  v_raw       jsonb := '[]'::jsonb;
  v_lines     jsonb;
  v_trusted   boolean;
  v_number    record;
begin
  select * into v_invoice from public.invoices where studio_invoice_id = p_stripe_invoice_id and kind = 'invoice';
  if found then
    return v_invoice;
  end if;
  select * into v_si from public.studio_subscription_invoices where stripe_invoice_id = p_stripe_invoice_id;
  if not found or v_si.status <> 'paid' then
    return null;
  end if;
  v_total := coalesce(v_si.total, v_si.amount);
  if v_total <= 0 then
    return null;   -- nothing sold (a credit to the customer balance): no document
  end if;
  select * into v_sub from public.studio_subscriptions where id = v_si.subscription_id;
  select coalesce(p.preferred_locale, 'fr') into v_locale from public.profiles p where p.id = v_si.user_id;

  -- The Studio's seller is the website publisher (DoDigital, decision 131), with its own VAT regime.
  v_franchise := coalesce((select s.publisher_vat_franchise from public.store_settings s where s.id), true);
  v_rate := case when v_franchise then 0
                 else coalesce(private.configured_vat_rate_bp(
                        coalesce(nullif((select s.country_code from public.store_settings s where s.id), ''), 'FR'), 'standard'), 0) end;

  -- The webhook's lines, each with the plan of its price; trusted only when every price is a Studio plan and they add up.
  if v_si.lines is not null and jsonb_array_length(v_si.lines) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'amount', case when (l ->> 'amount') ~ '^-?[0-9]+(\.[0-9]{1,2})?$' then (l ->> 'amount')::numeric end,
             'quantity', case when (l ->> 'quantity') ~ '^[1-9][0-9]{0,5}$' then (l ->> 'quantity')::integer else 1 end,
             'plan', pp.plan, 'interval', pp.billing_interval,
             'period_start', case when (l ->> 'period_start') ~ '^\d{4}-\d{2}-\d{2}' then l ->> 'period_start' end,
             'period_end', case when (l ->> 'period_end') ~ '^\d{4}-\d{2}-\d{2}' then l ->> 'period_end' end,
             'proration', coalesce(l -> 'proration' = 'true'::jsonb, false)) order by n), '[]'::jsonb),
           bool_and(pp.plan is not null and (l ->> 'amount') ~ '^-?[0-9]+(\.[0-9]{1,2})?$')
      into v_raw, v_trusted
      from jsonb_array_elements(v_si.lines) with ordinality as e(l, n)
      left join lateral (select x.plan, x.billing_interval from public.studio_plan_prices x
                          where x.stripe_price_id = l ->> 'price_id' limit 1) pp on true;
    v_trusted := coalesce(v_trusted, false)
                 and (select sum((r ->> 'amount')::numeric) from jsonb_array_elements(v_raw) r) = v_total;
  else
    v_trusted := false;
  end if;
  if not v_trusted then
    v_raw := jsonb_build_array(jsonb_build_object(
      'amount', v_total, 'quantity', 1, 'plan', v_sub.plan, 'interval', coalesce(v_sub.billing_interval, 'month'),
      'period_start', null, 'period_end', null, 'proration', false));
  end if;

  select jsonb_agg(jsonb_build_object(
           'order_item_id',   null,
           'kind',            'subscription',
           'description',     private.studio_plan_label(r ->> 'plan', v_locale),
           'detail',          null,
           'sku',             null,
           'plan',            r ->> 'plan',
           'interval',        r ->> 'interval',
           'period_start',    r ->> 'period_start',
           'period_end',      r ->> 'period_end',
           'proration',       (r ->> 'proration')::boolean,
           'quantity',        (r ->> 'quantity')::integer,
           'unit_price_incl', round((r ->> 'amount')::numeric / (r ->> 'quantity')::integer, 2),
           'unit_price_excl', round((r ->> 'amount')::numeric / (r ->> 'quantity')::integer * 10000 / (10000 + v_rate), 2),
           'discount_incl',   0,
           'vat_rate_bp',     v_rate,
           'total_incl',      (r ->> 'amount')::numeric,
           'vat_amount',      public.vat_included((r ->> 'amount')::numeric, v_rate),
           'total_excl',      (r ->> 'amount')::numeric - public.vat_included((r ->> 'amount')::numeric, v_rate))
           order by n)
    into v_lines
    from jsonb_array_elements(v_raw) with ordinality as e(r, n);

  select * into v_number from private.take_invoice_number('FS');
  insert into public.invoices
    (kind, series, sequence_number, invoice_number, studio_invoice_id, issued_at, sale_date, locale, currency,
     total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines, vat_breakdown, payment)
  select 'invoice', v_number.o_series, v_number.o_number,
         private.format_invoice_number(v_number.o_series, v_number.o_number),
         v_si.stripe_invoice_id, v_number.o_issued_at,
         (v_si.occurred_at at time zone 'Europe/Paris')::date,
         v_locale, v_si.currency, t.excl, t.vat, t.excl + t.vat,
         coalesce(private.studio_invoice_seller(), '{}'::jsonb) || jsonb_build_object('vat_franchise', v_franchise),
         coalesce(private.studio_invoice_buyer(v_si.user_id), '{}'::jsonb),
         v_lines, private.invoice_vat_breakdown(v_lines),
         jsonb_build_object(
           'paid_at',          v_si.occurred_at,
           'gift_card_amount', 0,
           'charged_amount',   least(v_si.amount, t.excl + t.vat),
           'balance_amount',   greatest(t.excl + t.vat - v_si.amount, 0),
           'billing_reason',   v_si.billing_reason)
    from (select coalesce(sum((l ->> 'total_excl')::numeric), 0) as excl,
                 coalesce(sum((l ->> 'vat_amount')::numeric), 0) as vat
            from jsonb_array_elements(v_lines) l) t
  returning * into v_invoice;
  return v_invoice;
end;
$$;

create or replace function private.issue_studio_withdrawal_credit_note(p_withdrawal_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  w         public.studio_withdrawals;
  v_invoice public.invoices;
  v_note    public.invoices;
  v_first   jsonb;
  v_rate    integer;
  v_lines   jsonb;
  v_number  record;
begin
  select * into v_note from public.invoices where studio_withdrawal_id = p_withdrawal_id;
  if found then
    return v_note;
  end if;
  select * into w from public.studio_withdrawals where id = p_withdrawal_id;
  if not found or w.status <> 'refunded' or w.refund_amount <= 0 then
    return null;
  end if;
  select * into v_invoice from public.invoices where studio_invoice_id = w.stripe_invoice_id and kind = 'invoice';
  if not found then
    return null;   -- first payment recorded before Studio invoicing: nothing to credit
  end if;

  select l into v_first from jsonb_array_elements(v_invoice.lines) l
   order by coalesce((l ->> 'proration')::boolean, false), (l ->> 'total_incl')::numeric desc limit 1;
  v_rate := coalesce((v_first ->> 'vat_rate_bp')::integer, 0);
  v_lines := jsonb_build_array(jsonb_build_object(
    'order_item_id', null, 'kind', 'subscription', 'withdrawal', true,
    'description', v_first ->> 'description', 'detail', null, 'sku', null,
    'plan', v_first ->> 'plan', 'interval', v_first ->> 'interval',
    'period_start', v_first ->> 'period_start', 'period_end', v_first ->> 'period_end',
    'used_days', w.used_days, 'period_days', w.period_days,
    'quantity', null, 'vat_rate_bp', v_rate,
    'total_incl', w.refund_amount,
    'vat_amount', public.vat_included(w.refund_amount, v_rate),
    'total_excl', w.refund_amount - public.vat_included(w.refund_amount, v_rate)));

  -- A credit note follows the invoice it credits (decision 131): same business, same
  -- frozen seller, its own series (FS → AS for DoDigital; a legacy FA → AV).
  select * into v_number from private.take_invoice_number(case when v_invoice.series like 'FS-%' then 'AS' else 'AV' end);
  insert into public.invoices
    (kind, series, sequence_number, invoice_number, studio_invoice_id, studio_withdrawal_id, credited_invoice_id,
     issued_at, sale_date, locale, currency, total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines,
     vat_breakdown, payment)
  select 'credit_note', v_number.o_series, v_number.o_number,
         private.format_invoice_number(v_number.o_series, v_number.o_number),
         v_invoice.studio_invoice_id, w.id, v_invoice.id, v_number.o_issued_at, v_invoice.sale_date,
         v_invoice.locale, v_invoice.currency, t.excl, t.vat, t.excl + t.vat,
         v_invoice.seller,
         v_invoice.buyer, v_lines, private.invoice_vat_breakdown(v_lines),
         jsonb_build_object(
           'refunded_at', coalesce(w.refunded_at, v_number.o_issued_at),
           'refund_method', 'card',
           'reason', 'withdrawal',
           'credited_invoice_number', v_invoice.invoice_number)
    from (select sum((l ->> 'total_excl')::numeric) as excl, sum((l ->> 'vat_amount')::numeric) as vat
            from jsonb_array_elements(v_lines) l) t
  returning * into v_note;
  return v_note;
end;
$$;

revoke all on function private.issue_studio_invoice(text) from public, anon, authenticated;
revoke all on function private.issue_studio_withdrawal_credit_note(uuid) from public, anon, authenticated;

-- 5. Saving the publisher's invoicing details ---------------------------------------
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
  -- Optional keys: absent = unchanged, empty = cleared.
  v_optional_keys constant text[] := array[
    'trading_name', 'publisher_name', 'publisher_legal_name', 'publisher_legal_form',
    'publisher_registration_number', 'publisher_address', 'publisher_email', 'publisher_phone',
    'publisher_vat_number'];
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
  foreach v_key in array v_optional_keys loop
    if p_details ? v_key and jsonb_typeof(p_details -> v_key) is distinct from 'string' then
      raise exception 'admin_save_store_details: % must be a string', v_key using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array array['vat_franchise', 'publisher_vat_franchise'] loop
    if p_details ? v_key and jsonb_typeof(p_details -> v_key) is distinct from 'boolean' then
      raise exception 'admin_save_store_details: % must be a boolean', v_key using errcode = '22023';
    end if;
  end loop;
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
    trading_name                  = case when p_details ? 'trading_name'
                                     then nullif(btrim(p_details ->> 'trading_name'), '') else trading_name end,
    publisher_name                = case when p_details ? 'publisher_name'
                                     then nullif(btrim(p_details ->> 'publisher_name'), '') else publisher_name end,
    publisher_legal_name          = case when p_details ? 'publisher_legal_name'
                                     then nullif(btrim(p_details ->> 'publisher_legal_name'), '') else publisher_legal_name end,
    publisher_legal_form          = case when p_details ? 'publisher_legal_form'
                                     then nullif(btrim(p_details ->> 'publisher_legal_form'), '') else publisher_legal_form end,
    publisher_registration_number = case when p_details ? 'publisher_registration_number'
                                     then nullif(btrim(p_details ->> 'publisher_registration_number'), '') else publisher_registration_number end,
    publisher_address             = case when p_details ? 'publisher_address'
                                     then nullif(btrim(p_details ->> 'publisher_address'), '') else publisher_address end,
    publisher_email               = case when p_details ? 'publisher_email'
                                     then nullif(lower(btrim(p_details ->> 'publisher_email')), '') else publisher_email end,
    publisher_phone               = case when p_details ? 'publisher_phone'
                                     then nullif(btrim(p_details ->> 'publisher_phone'), '') else publisher_phone end,
    publisher_vat_number          = case when p_details ? 'publisher_vat_number'
                                     then nullif(upper(regexp_replace(p_details ->> 'publisher_vat_number', '\s', '', 'g')), '')
                                     else publisher_vat_number end,
    publisher_vat_franchise       = coalesce((p_details ->> 'publisher_vat_franchise')::boolean, publisher_vat_franchise),
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
