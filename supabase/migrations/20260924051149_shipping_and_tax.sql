-- =============================================================================
-- Migration 008 — Shipping zones/rates and VAT rates (iteration 2)
-- =============================================================================
-- Mirrors the Settings workspace prototype (webapp/src/data/adminSettings.ts):
--   * shipping zones group destination countries; a country belongs to at most
--     one zone; one optional "rest of world" catch-all zone;
--   * each zone has rates (standard / express / free / pickup) with optional
--     basket-amount and parcel-weight bounds and a "free over" threshold;
--   * VAT rates per country, with optional reduced rates per tax category;
--     rates are integer BASIS POINTS (2000 = 20 %) — never floating point.
-- The checkout functions (next migration) read these tables; the browser never
-- supplies shipping or tax amounts.
--
-- VAT rates are illustrative and MUST be confirmed by the accountant before
-- launch (as the admin prototype states on screen).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Product fields needed by shipping and tax
-- -----------------------------------------------------------------------------
alter table public.products
  add column weight_grams integer check (weight_grams >= 0),
  add column tax_category text not null default 'standard'
    check (tax_category in ('standard', 'books', 'training', 'hygiene', 'digital'));

alter table public.product_variants
  add column weight_grams integer check (weight_grams >= 0);    -- null = inherit product weight

comment on column public.products.weight_grams is 'Shipping weight in grams (null = 0 for rate selection).';
comment on column public.products.tax_category is 'Selects a reduced VAT rate when one exists for the tax country; otherwise the standard rate applies.';

-- -----------------------------------------------------------------------------
-- Shipping zones
-- -----------------------------------------------------------------------------
create table public.shipping_zones (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 120),
  is_rest_of_world  boolean not null default false,
  is_active         boolean not null default true,
  position          integer not null default 0 check (position >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,
  updated_by        uuid references public.profiles (id) on delete set null
);

create unique index shipping_zones_one_rest_of_world_idx
  on public.shipping_zones (is_rest_of_world) where is_rest_of_world;

create table public.shipping_zone_countries (
  country_code char(2) primary key check (country_code ~ '^[A-Z]{2}$'),  -- PK: one zone per country
  zone_id      uuid not null references public.shipping_zones (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index shipping_zone_countries_zone_idx on public.shipping_zone_countries (zone_id);

create table public.shipping_rates (
  id                uuid primary key default gen_random_uuid(),
  zone_id           uuid not null references public.shipping_zones (id) on delete cascade,
  kind              text not null check (kind in ('standard', 'express', 'free', 'pickup')),
  name              text not null check (char_length(name) between 1 and 120),
  min_days          integer not null check (min_days >= 0),
  max_days          integer not null,
  price             numeric(12, 2) not null check (price >= 0),
  currency          char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  free_over_amount  numeric(12, 2) check (free_over_amount > 0),
  min_order_amount  numeric(12, 2) check (min_order_amount >= 0),
  max_order_amount  numeric(12, 2),
  min_weight_grams  integer check (min_weight_grams >= 0),
  max_weight_grams  integer,
  is_active         boolean not null default true,
  position          integer not null default 0 check (position >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,
  updated_by        uuid references public.profiles (id) on delete set null,
  constraint shipping_rates_days check (max_days >= min_days),
  constraint shipping_rates_order_bounds check (max_order_amount is null or max_order_amount >= coalesce(min_order_amount, 0)),
  constraint shipping_rates_weight_bounds check (max_weight_grams is null or max_weight_grams >= coalesce(min_weight_grams, 0)),
  constraint shipping_rates_free_is_free check (kind <> 'free' or price = 0)
);

comment on column public.shipping_rates.free_over_amount is 'Rate becomes free when the basket subtotal reaches this amount. Null = never.';

create index shipping_rates_zone_idx on public.shipping_rates (zone_id, position);

-- -----------------------------------------------------------------------------
-- VAT rates
-- -----------------------------------------------------------------------------
create table public.tax_rates (
  id            uuid primary key default gen_random_uuid(),
  country_code  char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  tax_category  text not null default 'standard'
                check (tax_category in ('standard', 'books', 'training', 'hygiene', 'digital')),
  rate_bp       integer not null check (rate_bp between 0 and 10000),   -- basis points: 2000 = 20 %
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  constraint tax_rates_country_category_unique unique (country_code, tax_category)
);

comment on table public.tax_rates is
  'VAT per destination country (+ optional reduced rate per tax category). Illustrative until confirmed by the accountant.';

-- -----------------------------------------------------------------------------
-- Triggers, RLS, privileges
-- -----------------------------------------------------------------------------
create trigger shipping_zones_audit before insert or update on public.shipping_zones
  for each row execute function private.set_audit_columns();
create trigger shipping_rates_audit before insert or update on public.shipping_rates
  for each row execute function private.set_audit_columns();
create trigger tax_rates_audit before insert or update on public.tax_rates
  for each row execute function private.set_audit_columns();

alter table public.shipping_zones enable row level security;
alter table public.shipping_zone_countries enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.tax_rates enable row level security;

revoke truncate, references, trigger on public.shipping_zones, public.shipping_zone_countries,
  public.shipping_rates, public.tax_rates from anon, authenticated;
revoke insert, update, delete on public.shipping_zones, public.shipping_zone_countries,
  public.shipping_rates, public.tax_rates from anon;

-- Shipping options and VAT rates are public information (shown before checkout).
create policy "shipping_zones: public reads active, admins read all"
  on public.shipping_zones for select to anon, authenticated
  using (is_active or (select private.is_admin()));

create policy "shipping_zone_countries: public reads countries of active zones, admins read all"
  on public.shipping_zone_countries for select to anon, authenticated
  using (
    exists (select 1 from public.shipping_zones z
            where z.id = shipping_zone_countries.zone_id and z.is_active)
    or (select private.is_admin())
  );

create policy "shipping_rates: public reads active rates of active zones, admins read all"
  on public.shipping_rates for select to anon, authenticated
  using (
    (is_active and exists (select 1 from public.shipping_zones z
                           where z.id = shipping_rates.zone_id and z.is_active))
    or (select private.is_admin())
  );

create policy "tax_rates: public reads active, admins read all"
  on public.tax_rates for select to anon, authenticated
  using (is_active or (select private.is_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['shipping_zones', 'shipping_zone_countries', 'shipping_rates', 'tax_rates']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      t || ': admins insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || ': admins update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
      t || ': admins delete', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resolution helpers (read-only, used by checkout and by the storefront to
-- preview shipping options). SECURITY INVOKER: they see what the caller sees.
-- -----------------------------------------------------------------------------

-- Zone serving a destination country: explicit zone first, else rest-of-world.
create or replace function public.shipping_zone_for_country(p_country_code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select c.zone_id from public.shipping_zone_countries c
       join public.shipping_zones z on z.id = c.zone_id and z.is_active
      where c.country_code = upper(p_country_code)),
    (select z.id from public.shipping_zones z
      where z.is_rest_of_world and z.is_active
        and not exists (select 1 from public.shipping_zone_countries c
                         where c.country_code = upper(p_country_code)))
  );
$$;

-- VAT rate (basis points) for a country and tax category; falls back to the
-- country's standard rate, then to 0 (destination without configured VAT).
create or replace function public.vat_rate_bp(p_country_code text, p_tax_category text default 'standard')
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
    0
  );
$$;

-- VAT contained in a tax-inclusive amount, rounded to the cent (half away from zero).
create or replace function public.vat_included(p_amount numeric, p_rate_bp integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(p_amount * p_rate_bp / (10000 + p_rate_bp), 2);
$$;
