-- Terms of sale on a durable medium (decision 130, art. L221-13 of the French
-- Consumer Code): every contract confirmation e-mail carries the terms of sale
-- as a PDF in the version in force when the contract was made, and the contract
-- keeps that version.
--
--   orders.terms_version            the version (the ISO day it took effect,
--                                   `TERMS_OF_SALE_VERSION` in webapp/src/data/legal/terms.ts)
--                                   in force when the order was placed, written by
--                                   create-checkout-session right after create_order();
--                                   covers goods, courses and gift cards bought.
--   consent_records.terms_version   the version in force when a member paid a 3D Studio
--                                   subscription, on the immediate-access request
--                                   (`studio_immediate_access`) create-studio-subscription
--                                   records at that moment.
--
-- Rules: written only by the trusted backend (service role); an order's version,
-- once set, never changes (a later version of the terms does not apply to it).
-- Orders placed before this migration keep null: their version was not recorded.
-- No new grant: members read the column with the rest of their order / consent rows.

alter table public.orders
  add column terms_version text
  constraint orders_terms_version_format check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

comment on column public.orders.terms_version is
  'Version (ISO day it took effect) of the terms of sale in force when the order was placed; the confirmation e-mail carries that text (decision 130). Set once by the checkout, never changed.';

alter table public.consent_records
  add column terms_version text
  constraint consent_records_terms_version_format check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

comment on column public.consent_records.terms_version is
  'On a purchase consent recorded by the backend (studio_immediate_access): the version of the terms of sale in force at that moment (decision 130).';

-- ---------------------------------------------------------------------------
-- orders: the version is the backend's to write, once.
-- ---------------------------------------------------------------------------
create function private.guard_order_terms_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.terms_version is distinct from old.terms_version then
    if old.terms_version is not null then
      raise exception 'orders: the terms of sale version of an order cannot change'
        using errcode = '42501';
    end if;
    if not private.is_trusted_backend() then
      raise exception 'orders: the terms of sale version is recorded by the checkout only'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_guard_terms_version
  before update of terms_version on public.orders
  for each row execute function private.guard_order_terms_version();

-- An order created with a version (a future create_order() could pass it) must come from the backend too.
create function private.guard_order_terms_version_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.terms_version is not null and not private.is_trusted_backend() then
    raise exception 'orders: the terms of sale version is recorded by the checkout only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger orders_guard_terms_version_insert
  before insert on public.orders
  for each row execute function private.guard_order_terms_version_insert();

-- ---------------------------------------------------------------------------
-- consent_records: a member's own inserts (cookie, newsletter, terms of use…)
-- cannot claim a terms of sale version; only the backend records one.
-- ---------------------------------------------------------------------------
create function private.guard_consent_terms_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.terms_version is not null and not private.is_trusted_backend() then
    raise exception 'consent_records: the terms of sale version is recorded by the backend only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger consent_records_guard_terms_version
  before insert or update of terms_version on public.consent_records
  for each row execute function private.guard_consent_terms_version();

revoke all on function private.guard_order_terms_version() from public, anon, authenticated;
revoke all on function private.guard_order_terms_version_insert() from public, anon, authenticated;
revoke all on function private.guard_consent_terms_version() from public, anon, authenticated;
