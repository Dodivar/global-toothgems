-- =============================================================================
-- Settings workspace (/admin/parametres) on the database
-- =============================================================================
-- The back office Settings page edits four things; this migration gives each
-- one a single, atomic, permission-checked write path and the columns it was
-- missing:
--
--   * Store details -> new columns on the single-row `store_settings` (business
--     identity, legal mentions, contact, address, opening hours, what the
--     contact page shows) + `store_settings_translations` for the one
--     customer-facing sentence (support message; base column = French).
--     Read publicly (legal notice and contact pages): only public information
--     lives there. Saved by admin_save_store_details(jsonb).
--   * Shipping -> admin_save_shipping(jsonb): the whole configuration (zones,
--     their countries, their rates) replaced in one transaction, so moving a
--     country between zones never trips the one-zone-per-country key halfway.
--   * VAT -> admin_save_tax_rates(jsonb): standard and reduced rates per
--     country, replaced as a set. The rules applied by create_order() (prices
--     include VAT, destination country, rounding per line, shipping at the
--     standard rate) are unchanged and not configurable.
--   * Languages -> admin_save_languages(jsonb): enable / disable content
--     languages. The default language (French: the base columns) cannot
--     change, and the two languages the storefront is published in (fr, en)
--     cannot be switched off — checkout and member preferences rely on them.
--
-- Every function is SECURITY INVOKER: RLS (manage_settings) still applies,
-- and the explicit permission check only turns a silent no-op into 42501.
--
-- Data: standard VAT rates for the countries the active shipping zones serve
-- and that had none (vat_rate_bp() fell back to 0 %), and Ireland's existing
-- rate switched on. Rates as published by the European Commission in 2025;
-- like every rate in tax_rates, to be confirmed by the accountant (OSS
-- registration, thresholds) before launch.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Audit trigger: identify rows keyed by a language code or a locale too
--    (languages, store_settings_translations). Body otherwise identical to the
--    live definition (staff_roles_permissions).
-- -----------------------------------------------------------------------------
create or replace function private.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_watch   text[] := tg_argv;
  v_row     jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new)
    loop
      continue when v_key in ('updated_at', 'updated_by');
      continue when cardinality(v_watch) > 0 and not (v_key = any (v_watch));
      if v_old -> v_key is distinct from v_new -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'DELETE' then
    v_changes := to_jsonb(old);
  else
    v_changes := to_jsonb(new);
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', session_user::text),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'country_code', v_row ->> 'user_id',
             (v_row ->> 'role_key') || '/' || (v_row ->> 'permission_key'),
             (v_row ->> 'promotion_id') || '/' || coalesce(v_row ->> 'product_id', v_row ->> 'category_id',
                                                           v_row ->> 'collection_id', v_row ->> 'segment_id'),
             case when tg_table_name = 'languages' then v_row ->> 'code' end,
             v_row ->> 'locale',
             '?'),
    v_changes
  );
  return null;
end;
$$;

revoke all on function private.audit_changes() from public;

-- -----------------------------------------------------------------------------
-- 1. VAT rates for the countries shipped to without one
-- -----------------------------------------------------------------------------
insert into public.tax_rates (country_code, tax_category, rate_bp, is_active) values
  ('AT', 'standard', 2000, true),
  ('BG', 'standard', 2000, true),
  ('CY', 'standard', 1900, true),
  ('CZ', 'standard', 2100, true),
  ('DK', 'standard', 2500, true),
  ('EE', 'standard', 2400, true),
  ('FI', 'standard', 2550, true),
  ('GR', 'standard', 2400, true),
  ('HR', 'standard', 2500, true),
  ('HU', 'standard', 2700, true),
  ('LT', 'standard', 2100, true),
  ('LU', 'standard', 1700, true),
  ('LV', 'standard', 2100, true),
  ('MT', 'standard', 1800, true),
  ('PL', 'standard', 2300, true),
  ('RO', 'standard', 2100, true),
  ('SE', 'standard', 2500, true),
  ('SI', 'standard', 2200, true),
  ('SK', 'standard', 2300, true),
  ('MC', 'standard', 2000, true)   -- Monaco: French VAT territory
on conflict (country_code, tax_category) do nothing;

update public.tax_rates set is_active = true
 where country_code = 'IE' and tax_category = 'standard' and not is_active;

-- -----------------------------------------------------------------------------
-- 2. Languages: the default never changes, the storefront languages stay on
-- -----------------------------------------------------------------------------
-- Languages are a reference list maintained by migrations: staff switch them
-- on and off (and order them), nothing else. is_default is not writable from
-- the API at all (it says which language the base columns are written in).
revoke insert, delete, update on public.languages from authenticated;
grant update (is_enabled, position) on public.languages to authenticated;
drop policy "languages: staff insert" on public.languages;

create or replace function private.guard_language_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The storefront is published in French and English (webapp localeRoutes):
  -- an order or a member preference in either must stay valid.
  if new.code in ('fr', 'en') and not new.is_enabled then
    raise exception 'languages: % is a storefront language and cannot be disabled', new.code
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_language_update() from public;

create trigger languages_guard_update
  before update on public.languages
  for each row execute function private.guard_language_update();

create trigger languages_audit_log
  after update on public.languages
  for each row execute function private.audit_changes('is_enabled', 'is_default', 'position');

-- -----------------------------------------------------------------------------
-- 3. Store details on store_settings
-- -----------------------------------------------------------------------------
-- Opening hours: one entry per weekday, {"open": bool, "from": "HH:MM", "to": "HH:MM"},
-- "from" before "to" on open days.
create or replace function private.valid_opening_hours(p_hours jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_hours) = 'object'
     and (select count(*) from jsonb_object_keys(p_hours)) = 7
     and not exists (
       select 1
         from unnest(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) as d (day)
        where not (p_hours ? d.day)
           or jsonb_typeof(p_hours -> d.day) <> 'object'
           or jsonb_typeof(p_hours -> d.day -> 'open') is distinct from 'boolean'
           or coalesce(p_hours -> d.day ->> 'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or coalesce(p_hours -> d.day ->> 'to', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or (p_hours -> d.day -> 'open' = 'true'::jsonb and (p_hours -> d.day ->> 'from') >= (p_hours -> d.day ->> 'to')));
$$;

-- Evaluated by the store_settings CHECK under the writer's role.
grant execute on function private.valid_opening_hours(jsonb) to authenticated, service_role;

alter table public.store_settings
  add column store_name                text not null default 'Global Toothgems'
                                       check (char_length(btrim(store_name)) between 1 and 120),
  add column legal_name                text check (char_length(legal_name) between 1 and 200),
  add column legal_form                text check (char_length(legal_form) between 1 and 120),
  add column share_capital             text check (char_length(share_capital) between 1 and 60),
  add column registration_number       text check (char_length(registration_number) between 1 and 120),
  add column vat_number                text check (vat_number ~ '^[A-Z]{2}[0-9A-Z+*.]{2,13}$'),
  add column business_email            text check (business_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
                                                   and char_length(business_email) <= 254),
  add column support_email             text check (support_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
                                                   and char_length(support_email) <= 254),
  add column phone                     text check (phone ~ '^\+?[0-9 ().-]{6,20}$'),
  add column address_line1             text check (char_length(address_line1) between 1 and 200),
  add column address_line2             text check (char_length(address_line2) between 1 and 200),
  add column postal_code               text check (char_length(postal_code) between 1 and 20),
  add column city                      text check (char_length(city) between 1 and 120),
  add column region                    text check (char_length(region) between 1 and 120),
  add column country_code              char(2) not null default 'FR' check (country_code ~ '^[A-Z]{2}$'),
  add column publication_director      text check (char_length(publication_director) between 1 and 120),
  add column publication_director_role text check (char_length(publication_director_role) between 1 and 120),
  add column host_name                 text check (char_length(host_name) between 1 and 200),
  add column host_address              text check (char_length(host_address) between 1 and 300),
  add column host_contact              text check (char_length(host_contact) between 1 and 200),
  add column show_email                boolean not null default true,
  add column show_phone                boolean not null default false,
  add column show_address              boolean not null default false,
  add column opening_hours             jsonb not null default
    '{"mon": {"open": false, "from": "09:00", "to": "18:00"}, "tue": {"open": false, "from": "09:00", "to": "18:00"},
      "wed": {"open": false, "from": "09:00", "to": "18:00"}, "thu": {"open": false, "from": "09:00", "to": "18:00"},
      "fri": {"open": false, "from": "09:00", "to": "18:00"}, "sat": {"open": false, "from": "09:00", "to": "18:00"},
      "sun": {"open": false, "from": "09:00", "to": "18:00"}}'::jsonb,
  add column support_message           text check (char_length(support_message) between 1 and 280),
  add constraint store_settings_opening_hours check (private.valid_opening_hours(opening_hours));

comment on table public.store_settings is
  'Shop-wide settings (single row). Public read: business identity and legal mentions (legal notice page), contact details and opening hours (contact page), maintenance switch. Only public information belongs here. Written by admin_save_store_details() (identity) and directly (maintenance), both under manage_settings.';
comment on column public.store_settings.show_email is 'Contact page shows support_email. The legal notice always shows the legally required details.';
comment on column public.store_settings.support_message is 'Contact page response-time line, in French; other languages in store_settings_translations.';

-- The customer-facing sentence in the other languages (base column = French).
create table public.store_settings_translations (
  locale          text primary key references public.languages (code) on update cascade,
  support_message text check (char_length(support_message) between 1 and 280),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null
);

comment on table public.store_settings_translations is
  'store_settings texts in languages other than the default. No draft/published status: the texts are edited side by side and go live on save.';

alter table public.store_settings_translations enable row level security;

create trigger store_settings_translations_default_locale
  before insert or update on public.store_settings_translations
  for each row execute function private.reject_default_locale_translation();
create trigger store_settings_translations_audit_columns
  before insert or update on public.store_settings_translations
  for each row execute function private.set_audit_columns();
create trigger store_settings_translations_audit_log
  after insert or update or delete on public.store_settings_translations
  for each row execute function private.audit_changes();

revoke truncate, references, trigger on public.store_settings_translations from anon, authenticated;
revoke insert, update, delete on public.store_settings_translations from anon;

create policy "store_settings_translations: everyone reads"
  on public.store_settings_translations for select to anon, authenticated using (true);
create policy "store_settings_translations: settings managers insert"
  on public.store_settings_translations for insert to authenticated
  with check ((select private.has_permission('manage_settings')));
create policy "store_settings_translations: settings managers update"
  on public.store_settings_translations for update to authenticated
  using ((select private.has_permission('manage_settings')))
  with check ((select private.has_permission('manage_settings')));
create policy "store_settings_translations: settings managers delete"
  on public.store_settings_translations for delete to authenticated
  using ((select private.has_permission('manage_settings')));

-- -----------------------------------------------------------------------------
-- 4. admin_save_store_details(details)
-- -----------------------------------------------------------------------------
-- details: { store_name, legal_name, legal_form, share_capital,
--   registration_number, vat_number, business_email, support_email, phone,
--   address_line1, address_line2, postal_code, city, region, country_code,
--   publication_director, publication_director_role, host_name, host_address,
--   host_contact, show_email, show_phone, show_address, opening_hours,
--   support_message, translations: { <locale>: { support_message } } }
-- Every key is required (the whole section is saved at once); empty strings
-- clear a value.
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

-- -----------------------------------------------------------------------------
-- 5. admin_save_shipping(zones)
-- -----------------------------------------------------------------------------
-- zones: ordered array of { id uuid, name, is_rest_of_world, is_active,
--   countries: [ISO alpha-2], rates: ordered array of { id uuid, kind, name,
--   min_days, max_days, price, free_over_amount, min_order_amount,
--   max_order_amount, min_weight_grams, max_weight_grams, is_active } }.
-- The array is the whole configuration: zones and rates left out are deleted
-- (orders keep their snapshotted method name; shipping_rate_id is set null).
-- Ids are generated by the browser for new rows. Amounts in the shop currency.
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
         (z.value ->> 'is_active')::boolean, (z.ordinality - 1)::integer
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
         (r.value ->> 'is_active')::boolean, (r.ordinality - 1)::integer
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

-- -----------------------------------------------------------------------------
-- 6. admin_save_tax_rates(rates)
-- -----------------------------------------------------------------------------
-- rates: array of { country_code, tax_category, rate_bp, is_active } — the whole
-- table (standard and reduced rates). Rows left out are deleted: the country
-- (or category) then falls back as vat_rate_bp() says.
create or replace function public.admin_save_tax_rates(p_rates jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_rate jsonb;
  v_keys text[] := '{}';
  v_key  text;
begin
  if not private.has_permission('manage_settings') then
    raise exception 'admin_save_tax_rates: not allowed' using errcode = '42501';
  end if;
  if p_rates is null or jsonb_typeof(p_rates) <> 'array' or jsonb_array_length(p_rates) > 500 then
    raise exception 'admin_save_tax_rates: rates must be an array (max 500)' using errcode = '22023';
  end if;
  for v_rate in select value from jsonb_array_elements(p_rates)
  loop
    if jsonb_typeof(v_rate) <> 'object'
       or coalesce(v_rate ->> 'country_code', '') !~ '^[A-Z]{2}$'
       or coalesce(v_rate ->> 'tax_category', '') not in ('standard', 'books', 'training', 'hygiene', 'digital')
       or jsonb_typeof(v_rate -> 'rate_bp') is distinct from 'number'
       or (v_rate ->> 'rate_bp') !~ '^\d{1,5}$' or (v_rate ->> 'rate_bp')::integer > 10000
       or jsonb_typeof(v_rate -> 'is_active') is distinct from 'boolean' then
      raise exception 'admin_save_tax_rates: malformed rate %', v_rate using errcode = '22023';
    end if;
    v_key := (v_rate ->> 'country_code') || '/' || (v_rate ->> 'tax_category');
    if v_key = any (v_keys) then
      raise exception 'admin_save_tax_rates: two rates for %', v_key using errcode = '22023';
    end if;
    v_keys := v_keys || v_key;
  end loop;

  delete from public.tax_rates where (country_code || '/' || tax_category) <> all (v_keys);

  insert into public.tax_rates (country_code, tax_category, rate_bp, is_active)
  select r.value ->> 'country_code', r.value ->> 'tax_category', (r.value ->> 'rate_bp')::integer,
         (r.value ->> 'is_active')::boolean
    from jsonb_array_elements(p_rates) r
  on conflict (country_code, tax_category) do update set rate_bp = excluded.rate_bp, is_active = excluded.is_active
  where (tax_rates.rate_bp, tax_rates.is_active) is distinct from (excluded.rate_bp, excluded.is_active);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. admin_save_languages(languages)
-- -----------------------------------------------------------------------------
-- languages: array of { code, is_enabled }. Languages left out are unchanged.
create or replace function public.admin_save_languages(p_languages jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lang jsonb;
begin
  if not private.has_permission('manage_settings') then
    raise exception 'admin_save_languages: not allowed' using errcode = '42501';
  end if;
  if p_languages is null or jsonb_typeof(p_languages) <> 'array' or jsonb_array_length(p_languages) > 50 then
    raise exception 'admin_save_languages: languages must be an array' using errcode = '22023';
  end if;
  for v_lang in select value from jsonb_array_elements(p_languages)
  loop
    if jsonb_typeof(v_lang) <> 'object' or jsonb_typeof(v_lang -> 'is_enabled') is distinct from 'boolean'
       or not exists (select 1 from public.languages l where l.code = v_lang ->> 'code') then
      raise exception 'admin_save_languages: malformed or unknown language %', v_lang ->> 'code' using errcode = '22023';
    end if;
    update public.languages set is_enabled = (v_lang ->> 'is_enabled')::boolean
     where code = v_lang ->> 'code' and is_enabled is distinct from (v_lang ->> 'is_enabled')::boolean;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.admin_save_store_details(jsonb), public.admin_save_shipping(jsonb),
  public.admin_save_tax_rates(jsonb), public.admin_save_languages(jsonb) from public, anon;
grant execute on function public.admin_save_store_details(jsonb), public.admin_save_shipping(jsonb),
  public.admin_save_tax_rates(jsonb), public.admin_save_languages(jsonb) to authenticated, service_role;
