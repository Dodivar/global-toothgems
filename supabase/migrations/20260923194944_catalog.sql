-- =============================================================================
-- Migration 002 — Catalogue: categories, products, variants, media, inventory
-- =============================================================================
-- Design notes:
--   * Money: numeric(12,2) + explicit ISO-4217 currency. Never floating point.
--   * Products are never hard-deleted once ordered (order_items FKs RESTRICT);
--     use status = 'archived' instead (soft deletion).
--   * Variants are OPTIONAL: Product -> 0..n Variants. Variant options live in
--     a JSONB object (`attributes`) so new option types need no new columns.
--   * Media binaries live in Supabase Storage (bucket `product-media`); only
--     object paths + metadata are stored here.
--   * Inventory is one row per stock-keeping unit: either a product without
--     variants, or a variant. Stock is decremented atomically (see
--     public.consume_inventory) to avoid overselling under concurrency.
--   * Base text columns hold default-locale (fr) content. Translations will be
--     added later as separate *_translations tables (no name_fr/name_en columns).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categories (flat for the MVP; a nullable parent_id can be added later
-- without restructuring if hierarchy becomes necessary)
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  image_path  text,                                  -- Storage object path
  is_active   boolean not null default true,
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null
);

create index categories_active_position_idx on public.categories (is_active, position);

alter table public.categories enable row level security;

create trigger categories_audit
  before insert or update on public.categories
  for each row execute function private.set_audit_columns();

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references public.categories (id) on delete restrict,
  product_type      text not null default 'physical'
                    check (product_type in ('physical', 'digital')),
  name              text not null check (char_length(name) between 1 and 200),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_description text check (char_length(short_description) <= 500),
  description       text,
  sku               text unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,63}$'),
  price             numeric(12, 2) not null check (price >= 0),
  compare_at_price  numeric(12, 2) check (compare_at_price > 0),
  currency          char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status            text not null default 'draft'
                    check (status in ('draft', 'active', 'archived')),
  is_featured       boolean not null default false,
  metadata          jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(metadata) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,
  updated_by        uuid references public.profiles (id) on delete set null,
  constraint products_compare_at_gt_price
    check (compare_at_price is null or compare_at_price > price)
);

comment on column public.products.status is
  'draft = not yet published, active = visible and purchasable, archived = soft-deleted (kept for order history).';
comment on column public.products.compare_at_price is
  'Optional "was" price shown struck through. Must be greater than price.';
comment on column public.products.metadata is
  'Non-critical presentation data only (e.g. material, tags). Never prices, stock or permissions.';

create index products_category_idx on public.products (category_id);
create index products_status_idx on public.products (status);
create index products_featured_idx on public.products (is_featured) where status = 'active' and is_featured;

alter table public.products enable row level security;

create trigger products_audit
  before insert or update on public.products
  for each row execute function private.set_audit_columns();

-- -----------------------------------------------------------------------------
-- Product variants (optional per product)
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 200),
  sku              text unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,63}$'),
  attributes       jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(attributes) = 'object'),
  price            numeric(12, 2) check (price >= 0),          -- null = inherit product price
  compare_at_price numeric(12, 2) check (compare_at_price > 0),
  is_active        boolean not null default true,
  position         integer not null default 0 check (position >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null,
  updated_by       uuid references public.profiles (id) on delete set null,
  constraint product_variants_name_unique unique (product_id, name)
);

comment on column public.product_variants.attributes is
  'Option values, e.g. {"size": "2.2mm", "colour": "crystal"}. Keys are free-form so new option types need no migration.';
comment on column public.product_variants.price is
  'Price override in the parent product currency. NULL means the product price applies.';

create index product_variants_product_idx on public.product_variants (product_id, position);

alter table public.product_variants enable row level security;

create trigger product_variants_audit
  before insert or update on public.product_variants
  for each row execute function private.set_audit_columns();

-- -----------------------------------------------------------------------------
-- Product media (references to Supabase Storage objects)
-- -----------------------------------------------------------------------------
create table public.product_media (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  variant_id   uuid references public.product_variants (id) on delete set null,
  storage_path text not null check (storage_path !~ '^/' and storage_path !~ '\.\.'),
  media_type   text not null default 'image' check (media_type in ('image', 'video')),
  alt_text     text check (char_length(alt_text) <= 300),
  position     integer not null default 0 check (position >= 0),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.product_media.storage_path is
  'Object path inside the `product-media` Storage bucket, e.g. products/<slug>/01.jpg.';

create index product_media_product_idx on public.product_media (product_id, position);
create index product_media_variant_idx on public.product_media (variant_id) where variant_id is not null;
-- At most one primary media item per product.
create unique index product_media_one_primary_idx on public.product_media (product_id) where is_primary;

alter table public.product_media enable row level security;

create trigger product_media_set_updated_at
  before update on public.product_media
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Inventory: one row per stock-keeping unit (product OR variant)
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid references public.products (id) on delete cascade,
  variant_id          uuid references public.product_variants (id) on delete cascade,
  track_inventory     boolean not null default true,
  quantity_on_hand    integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved   integer not null default 0 check (quantity_reserved >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  -- Manual availability, used only when track_inventory = false (e.g. made to order).
  availability        text not null default 'in_stock'
                      check (availability in ('in_stock', 'out_of_stock', 'preorder')),
  stock_status        text generated always as (
                        case
                          when not track_inventory then availability
                          when quantity_on_hand - quantity_reserved <= 0 then 'out_of_stock'
                          when quantity_on_hand - quantity_reserved <= low_stock_threshold then 'low_stock'
                          else 'in_stock'
                        end
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id) on delete set null,
  constraint inventory_items_one_target check (num_nonnulls(product_id, variant_id) = 1),
  constraint inventory_items_reserved_le_on_hand check (quantity_reserved <= quantity_on_hand)
);

comment on table public.inventory_items is
  'Stock per sellable unit. Exactly one of product_id (product without variants) or variant_id is set.';
comment on column public.inventory_items.stock_status is
  'Derived: in_stock | low_stock | out_of_stock | preorder. Never written directly.';

create unique index inventory_items_product_uidx on public.inventory_items (product_id) where product_id is not null;
create unique index inventory_items_variant_uidx on public.inventory_items (variant_id) where variant_id is not null;

alter table public.inventory_items enable row level security;

create or replace function private.set_inventory_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger inventory_items_audit
  before update on public.inventory_items
  for each row execute function private.set_inventory_audit();

-- -----------------------------------------------------------------------------
-- Atomic stock decrement for order fulfilment.
-- A single conditional UPDATE: concurrent calls serialize on the row lock and
-- the WHERE clause re-checks availability, so stock can never go negative and
-- two checkouts can never both take the last unit.
-- Callable only by trusted backends (service role), never by browsers.
-- -----------------------------------------------------------------------------
create or replace function public.consume_inventory(p_inventory_item_id uuid, p_quantity integer)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  result public.inventory_items;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'consume_inventory: quantity must be positive' using errcode = '22023';
  end if;

  -- Untracked items (made to order) are accepted without touching the count,
  -- unless they are manually marked out of stock.
  update public.inventory_items
     set quantity_on_hand = case when track_inventory
                                 then quantity_on_hand - p_quantity
                                 else quantity_on_hand end
   where id = p_inventory_item_id
     and case when track_inventory
              then quantity_on_hand - quantity_reserved >= p_quantity
              else availability <> 'out_of_stock' end
  returning * into result;

  if not found then
    if exists (select 1 from public.inventory_items where id = p_inventory_item_id) then
      raise exception 'consume_inventory: insufficient stock' using errcode = 'P0001';
    else
      raise exception 'consume_inventory: inventory item not found' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.consume_inventory(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_inventory(uuid, integer) to service_role;
