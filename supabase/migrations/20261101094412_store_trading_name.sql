-- Trading name ("nom commercial") of the business — decision 120.
--
-- The shop is run by an individual entrepreneur (EI) whose legal name is
-- their own first and last name. The owner asked (2026-11-01) that this name
-- appear only where the law requires it, never put forward, and that the
-- business present itself under its trading name, "Pimp ton smile":
--
--   * `store_settings.trading_name`: the business's trading name, distinct
--     from `store_name` (the site's brand, Global Toothgems) and from
--     `legal_name` (the legal identity: for an EI, the entrepreneur's name).
--   * `private.invoice_seller()` freezes it in every new invoice / credit note
--     snapshot (`seller.trading_name`); the PDF heads the seller block with it
--     and prints the legal identity in the small legal mentions at the foot.
--     Snapshots issued before keep what they froze (no backfill).
--   * `admin_save_store_details()` takes an optional string `trading_name`
--     (absent = unchanged, empty = cleared).

alter table public.store_settings
  add column trading_name text check (char_length(btrim(trading_name)) between 1 and 120);

comment on column public.store_settings.trading_name is
  'Trading name of the business (nom commercial), shown before the legal name on invoices and the legal notice. Public.';

create or replace function private.invoice_seller()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'store_name',          s.store_name,
           'trading_name',        coalesce(s.trading_name, ''),
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
  if p_details ? 'trading_name' and jsonb_typeof(p_details -> 'trading_name') is distinct from 'string' then
    raise exception 'admin_save_store_details: trading_name must be a string' using errcode = '22023';
  end if;
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
    trading_name              = case when p_details ? 'trading_name'
                                     then nullif(btrim(p_details ->> 'trading_name'), '') else trading_name end,
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
