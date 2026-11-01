-- Website publisher distinct from the seller — decision 121.
--
-- The owner (2026-11-01): the goods, courses and subscriptions are sold by
-- the individual entrepreneur trading as "Pimp ton smile" (the seller:
-- invoices, terms of sale — the existing store_settings identity columns),
-- but the website is held and published by another business, the owner's
-- micro-entreprise "DoDigital". The legal notice must name the publisher
-- (LCEN art. 6 III) and, for an online shop, the seller too (LCEN art. 19).
--
--   * `store_settings.publisher_*`: the publisher's identity (trading name,
--     legal name, legal form, registration, address on one line, e-mail).
--     Public, like the rest of the row (legal notice, terms of use).
--   * `admin_save_store_details()` takes them as optional strings (absent =
--     unchanged, empty = cleared), like `trading_name`.
--   * Invoices are unchanged: they name the seller, not the publisher.

alter table public.store_settings
  add column publisher_name                text check (char_length(btrim(publisher_name)) between 1 and 120),
  add column publisher_legal_name          text check (char_length(btrim(publisher_legal_name)) between 1 and 200),
  add column publisher_legal_form          text check (char_length(btrim(publisher_legal_form)) between 1 and 120),
  add column publisher_registration_number text check (char_length(btrim(publisher_registration_number)) between 1 and 120),
  add column publisher_address             text check (char_length(btrim(publisher_address)) between 1 and 300),
  add column publisher_email               text check (publisher_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
                                                       and char_length(publisher_email) <= 254);

comment on column public.store_settings.publisher_name is
  'Website publisher (éditeur du site) when it is not the seller: trading name. The publisher_* columns are public (legal notice, terms of use).';

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
    'publisher_registration_number', 'publisher_address', 'publisher_email'];
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
