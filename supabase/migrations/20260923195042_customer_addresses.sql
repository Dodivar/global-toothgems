-- =============================================================================
-- Migration 003 — Customer addresses (address book, many per user)
-- =============================================================================
-- Orders never reference this table: at checkout the address is copied into
-- the order as a snapshot, so editing/deleting an address never alters history.
-- =============================================================================

create table public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  address_type  text not null default 'shipping' check (address_type in ('shipping', 'billing')),
  is_default    boolean not null default false,
  label         text check (char_length(label) <= 60),     -- e.g. "Studio", "Home"
  first_name    text not null check (char_length(first_name) between 1 and 100),
  last_name     text not null check (char_length(last_name) between 1 and 100),
  company       text check (char_length(company) <= 150),
  address_line1 text not null check (char_length(address_line1) between 1 and 200),
  address_line2 text check (char_length(address_line2) <= 200),
  postal_code   text check (char_length(postal_code) <= 20),  -- nullable: not every country uses one
  city          text not null check (char_length(city) between 1 and 120),
  region        text check (char_length(region) <= 120),       -- state / province / region
  country_code  char(2) not null check (country_code ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alpha-2
  phone         text check (phone ~ '^\+?[0-9 ().-]{6,20}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index customer_addresses_user_idx on public.customer_addresses (user_id);
-- One default address per user and per type.
create unique index customer_addresses_one_default_idx
  on public.customer_addresses (user_id, address_type) where is_default;

alter table public.customer_addresses enable row level security;

create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function private.set_updated_at();

-- Setting a new default clears the previous default of the same type, so the
-- client does not need two coordinated writes.
create or replace function private.unset_other_default_addresses()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.customer_addresses
       set is_default = false
     where user_id = new.user_id
       and address_type = new.address_type
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

create trigger customer_addresses_single_default
  before insert or update of is_default, address_type on public.customer_addresses
  for each row when (new.is_default)
  execute function private.unset_other_default_addresses();
