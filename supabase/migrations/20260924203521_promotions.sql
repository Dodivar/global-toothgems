-- =============================================================================
-- Migration 022 — Promotions, codes, campaigns, collections, segments,
--                 discounts in create_order(), loyalty reward redemption
--                 (iteration 6)
-- =============================================================================
-- Mirrors the Promotions workspace (webapp/src/data/adminPromotions.ts,
-- lib/promotionRules.ts) and closes README decision 14 (loyalty reward).
--
-- Model
--   promotions            what the team sets: type, amounts, scope, customers,
--                         limits, schedule, automatic or code, lifecycle
--   promotion_products / _categories / _collections / _segments   scope links
--   promotion_codes       shared or unique single-use codes (never public)
--   campaigns (+ products) banners grouping promotions
--   collections (+ products) hand-picked product lists
--   customer_segments (+ members)  manual lists or rules (customer tag, newsletter)
--   order_discounts       what an order actually received (snapshots) = usage ledger
--   order_items.discount_amount  the discount carried by each line (VAT base)
--   *_translations        customer-facing texts per language (draft/published)
--
-- Money rules (all server-side, in create_order()):
--   * the discount never touches gift card lines (a discounted gift card would
--     sell money below value) and never goes below zero on any line;
--   * VAT per line is computed on (line total - line discount);
--   * free shipping sets shipping to 0 and records what was waived;
--   * a customer's code that does not apply is REJECTED (error), an applicable
--     one competes with automatic promotions: the best option wins — either one
--     non-combinable promotion, or all combinable ones applied in sequence
--     (bundle, buy X get Y, gift, fixed amount, percentage, free shipping);
--   * the loyalty reward is used only when the customer asks for it, replaces
--     promotions for that order (no stacking), and is reserved at order creation:
--     it comes back if the unpaid order is cancelled or expires;
--   * usage limits count orders that are not cancelled; rows are locked while
--     counting so two checkouts cannot both take the last use.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Collections
-- -----------------------------------------------------------------------------
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  is_active   boolean not null default true,
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null
);

comment on table public.collections is 'Hand-picked product lists (best-sellers, new in...). Base columns = default language.';

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  position      integer not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  primary key (collection_id, product_id)
);

create index collection_products_product_idx on public.collection_products (product_id);

create table public.collection_translations (
  collection_id uuid not null references public.collections (id) on delete cascade,
  locale        text not null references public.languages (code) on update cascade,
  name          text not null check (char_length(name) between 1 and 120),
  description   text check (char_length(description) <= 2000),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,
  primary key (collection_id, locale)
);

-- -----------------------------------------------------------------------------
-- 2. Customer segments
-- -----------------------------------------------------------------------------
create table public.customer_segments (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 120),   -- internal (back office)
  description  text check (char_length(description) <= 2000),
  rule         text not null default 'manual' check (rule in ('manual', 'customer_tag', 'marketing_opt_in')),
  customer_tag text check (customer_tag in
                 ('vip', 'repeat', 'training_student', 'training_completed', 'new_customer', 'high_value', 'follow_up')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  constraint customer_segments_tag_rule check ((rule = 'customer_tag') = (customer_tag is not null))
);

comment on table public.customer_segments is
  'Who a promotion targets. manual = listed members; customer_tag = members carrying a CRM tag; marketing_opt_in = newsletter subscribers.';

create table public.customer_segment_members (
  segment_id uuid not null references public.customer_segments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (segment_id, user_id)
);

create index customer_segment_members_user_idx on public.customer_segment_members (user_id);

create or replace function private.guard_segment_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.customer_segments s where s.id = new.segment_id and s.rule = 'manual') then
    raise exception 'customer_segment_members: members can only be listed on a manual segment' using errcode = '23514';
  end if;
  new.added_by := coalesce(auth.uid(), new.added_by);
  new.created_at := now();
  return new;
end;
$$;

create trigger customer_segment_members_guard
  before insert on public.customer_segment_members
  for each row execute function private.guard_segment_member();

create or replace function private.customer_in_segment(p_user_id uuid, p_segment_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case s.rule
             when 'manual' then exists (select 1 from public.customer_segment_members m
                                         where m.segment_id = s.id and m.user_id = p_user_id)
             when 'customer_tag' then exists (select 1 from public.customer_tags t
                                               where t.user_id = p_user_id and t.tag = s.customer_tag)
             when 'marketing_opt_in' then exists (select 1 from public.profiles pr
                                                   where pr.id = p_user_id and pr.marketing_opt_in)
           end
      from public.customer_segments s
     where s.id = p_segment_id and s.is_active and p_user_id is not null), false);
$$;

-- -----------------------------------------------------------------------------
-- 3. Campaigns
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 120),        -- internal
  internal_description text check (char_length(internal_description) <= 2000),           -- internal
  title                text not null check (char_length(title) between 1 and 160),       -- customer-facing, default language
  description          text check (char_length(description) <= 2000),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  timezone             text not null default 'Europe/Paris',
  theme                text not null default 'sparkle' check (theme in ('sparkle', 'noir', 'blush', 'mint', 'winter')),
  cover_path           text check (cover_path ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$'),         -- product-media bucket path
  lifecycle            text not null default 'draft' check (lifecycle in ('draft', 'live', 'paused', 'archived')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null,
  constraint campaigns_dates check (ends_at > starts_at)
);

comment on table public.campaigns is 'Storefront campaigns (banner + products) grouping promotions. Status derived in campaign_overview.';

create index campaigns_running_idx on public.campaigns (starts_at, ends_at) where lifecycle = 'live';

create table public.campaign_products (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  primary key (campaign_id, product_id)
);

create index campaign_products_product_idx on public.campaign_products (product_id);

create table public.campaign_translations (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  locale      text not null references public.languages (code) on update cascade,
  title       text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 2000),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  primary key (campaign_id, locale)
);

-- -----------------------------------------------------------------------------
-- 4. Promotions
-- -----------------------------------------------------------------------------
create table public.promotions (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (char_length(name) between 1 and 120),      -- internal, single language
  internal_description        text check (char_length(internal_description) <= 2000),         -- internal
  title                       text not null check (char_length(title) between 1 and 160),     -- customer-facing, default language
  description                 text check (char_length(description) <= 2000),
  type                        text not null check (type in
                                ('percentage', 'fixed_amount', 'buy_x_get_y', 'free_shipping', 'bundle', 'gift')),
  currency                    char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  percent_off                 smallint check (percent_off between 1 and 100),
  max_discount_amount         numeric(12, 2) check (max_discount_amount > 0),
  amount_off                  numeric(12, 2) check (amount_off > 0),
  buy_quantity                smallint check (buy_quantity between 1 and 100),
  get_quantity                smallint check (get_quantity between 1 and 100),
  reward_percent              smallint check (reward_percent between 1 and 100),
  bundle_price                numeric(12, 2) check (bundle_price >= 0),
  gift_product_id             uuid references public.products (id) on delete restrict,
  gift_variant_id             uuid references public.product_variants (id) on delete restrict,
  applies_to                  text not null default 'all' check (applies_to in ('all', 'products', 'categories', 'collections')),
  customer_eligibility        text not null default 'all' check (customer_eligibility in ('all', 'new', 'existing', 'segments')),
  min_subtotal_amount         numeric(12, 2) check (min_subtotal_amount > 0),
  min_quantity                smallint check (min_quantity >= 1),
  max_uses_total              integer check (max_uses_total >= 1),
  max_uses_per_customer       integer check (max_uses_per_customer >= 1),
  combinable                  boolean not null default false,
  exclude_discounted_products boolean not null default true,
  activation                  text not null default 'automatic' check (activation in ('automatic', 'code')),
  code_kind                   text check (code_kind in ('shared', 'unique')),
  starts_at                   timestamptz not null default now(),
  ends_at                     timestamptz,
  timezone                    text not null default 'Europe/Paris',
  lifecycle                   text not null default 'draft' check (lifecycle in ('draft', 'live', 'paused', 'archived')),
  campaign_id                 uuid references public.campaigns (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references public.profiles (id) on delete set null,
  updated_by                  uuid references public.profiles (id) on delete set null,

  constraint promotions_dates check (ends_at is null or ends_at > starts_at),
  constraint promotions_code_kind check ((activation = 'code') = (code_kind is not null)),
  constraint promotions_usage check (max_uses_per_customer is null or max_uses_total is null
                                     or max_uses_per_customer <= max_uses_total),
  -- Each type carries exactly its own parameters.
  constraint promotions_percentage check ((type = 'percentage') = (percent_off is not null)),
  constraint promotions_cap check (max_discount_amount is null or type = 'percentage'),
  constraint promotions_fixed check ((type = 'fixed_amount') = (amount_off is not null)),
  constraint promotions_bxgy check ((type = 'buy_x_get_y') = (buy_quantity is not null)
                                    and (type = 'buy_x_get_y') = (get_quantity is not null)
                                    and (type = 'buy_x_get_y') = (reward_percent is not null)),
  constraint promotions_bundle check ((type = 'bundle') = (bundle_price is not null)),
  constraint promotions_gift check ((type = 'gift') = (gift_product_id is not null)
                                    and (gift_variant_id is null or type = 'gift'))
);

comment on table public.promotions is
  'Discount rules. Status (active/scheduled/expired/...) is derived from lifecycle + dates in promotion_overview. Amounts are in `currency`.';
comment on column public.promotions.exclude_discounted_products is 'Lines whose product/variant has a compare_at_price (already on sale) are not discounted.';
comment on column public.promotions.min_subtotal_amount is 'Minimum goods amount of the basket (gift cards excluded, before discounts).';

create index promotions_running_idx on public.promotions (starts_at, ends_at)
  where lifecycle = 'live' and activation = 'automatic';
create index promotions_campaign_idx on public.promotions (campaign_id) where campaign_id is not null;
create index promotions_gift_product_idx on public.promotions (gift_product_id) where gift_product_id is not null;
create index promotions_gift_variant_idx on public.promotions (gift_variant_id) where gift_variant_id is not null;

create table public.promotion_translations (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  locale       text not null references public.languages (code) on update cascade,
  title        text not null check (char_length(title) between 1 and 160),
  description  text check (char_length(description) <= 2000),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null,
  primary key (promotion_id, locale)
);

create table public.promotion_products (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  role         text not null check (role in ('eligible', 'excluded', 'bundle')),
  created_at   timestamptz not null default now(),
  primary key (promotion_id, product_id, role)
);

create index promotion_products_product_idx on public.promotion_products (product_id);

create table public.promotion_categories (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (promotion_id, category_id)
);

create index promotion_categories_category_idx on public.promotion_categories (category_id);

create table public.promotion_collections (
  promotion_id  uuid not null references public.promotions (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (promotion_id, collection_id)
);

create index promotion_collections_collection_idx on public.promotion_collections (collection_id);

create table public.promotion_segments (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  segment_id   uuid not null references public.customer_segments (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (promotion_id, segment_id)
);

create index promotion_segments_segment_idx on public.promotion_segments (segment_id);

create table public.promotion_codes (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  code         text not null check (code ~ '^[A-Z0-9_-]{4,32}$'),     -- stored upper case; matched case-insensitively
  max_uses     integer check (max_uses >= 1),                         -- unique codes: 1
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id) on delete set null
);

comment on table public.promotion_codes is
  'Promotion codes. Unique across all promotions, archived ones included (history stays unambiguous). Staff only.';

create unique index promotion_codes_code_idx on public.promotion_codes (code);
create index promotion_codes_promotion_idx on public.promotion_codes (promotion_id);

-- -----------------------------------------------------------------------------
-- 5. What orders received
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0);
alter table public.order_items
  add constraint order_items_discount_le_subtotal check (discount_amount <= unit_price * quantity);

comment on column public.order_items.discount_amount is 'Discount carried by this line (promotions, loyalty reward). VAT is computed on subtotal_amount - discount_amount.';
comment on column public.order_items.tax_amount is 'VAT contained in (subtotal_amount - discount_amount) (prices include VAT), at tax_rate_bp.';

create table public.order_discounts (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  source            text not null check (source in ('promotion', 'loyalty')),
  promotion_id      uuid references public.promotions (id) on delete restrict,
  promotion_code_id uuid references public.promotion_codes (id) on delete restrict,
  loyalty_card_id   uuid references public.loyalty_cards (id) on delete set null,
  user_id           uuid references public.profiles (id) on delete set null,
  customer_email    text not null,
  label             text not null check (char_length(label) <= 200),   -- snapshot, order language
  code              text,                                              -- snapshot
  promotion_type    text,                                              -- snapshot
  goods_amount      numeric(12, 2) not null default 0 check (goods_amount >= 0),
  shipping_amount   numeric(12, 2) not null default 0 check (shipping_amount >= 0),
  created_at        timestamptz not null default now(),
  constraint order_discounts_promotion check (source <> 'promotion' or promotion_id is not null),
  constraint order_discounts_code check (promotion_code_id is null or source = 'promotion')
);

comment on table public.order_discounts is
  'Discounts an order received (snapshots) — also the usage ledger of promotions and codes. Written by create_order() only.';

create unique index order_discounts_one_promotion_idx on public.order_discounts (order_id, promotion_id)
  where promotion_id is not null;
create index order_discounts_order_idx on public.order_discounts (order_id);
create index order_discounts_promotion_idx on public.order_discounts (promotion_id) where promotion_id is not null;
create index order_discounts_code_idx on public.order_discounts (promotion_code_id) where promotion_code_id is not null;
create index order_discounts_card_idx on public.order_discounts (loyalty_card_id) where loyalty_card_id is not null;
create index order_discounts_user_idx on public.order_discounts (user_id) where user_id is not null;
create index order_discounts_email_idx on public.order_discounts (lower(customer_email));

-- orders.discount_amount = sum of line discounts = sum of goods discounts (checked at commit).
create or replace function private.check_order_discounts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_expected numeric(12, 2);
  v_items    numeric(12, 2);
  v_ledger   numeric(12, 2);
begin
  if tg_table_name = 'orders' then
    v_order_id := new.id;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select o.discount_amount into v_expected from public.orders o where o.id = v_order_id;
  if not found then
    return null;
  end if;
  select coalesce(sum(i.discount_amount), 0) into v_items from public.order_items i where i.order_id = v_order_id;
  select coalesce(sum(d.goods_amount), 0) into v_ledger from public.order_discounts d where d.order_id = v_order_id;
  if v_items <> v_expected or v_ledger <> v_expected then
    raise exception 'orders: discount % does not match line discounts % / discount records % for order %',
      v_expected, v_items, v_ledger, v_order_id using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger orders_discount_matches
  after insert or update of discount_amount on public.orders
  deferrable initially deferred
  for each row execute function private.check_order_discounts();
create constraint trigger order_items_discount_matches
  after insert or update or delete on public.order_items
  deferrable initially deferred
  for each row execute function private.check_order_discounts();
create constraint trigger order_discounts_matches
  after insert or update or delete on public.order_discounts
  deferrable initially deferred
  for each row execute function private.check_order_discounts();

-- -----------------------------------------------------------------------------
-- 6. Guards and triggers
-- -----------------------------------------------------------------------------
create or replace function private.check_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = new.timezone) then
    raise exception '%: unknown time zone %', tg_table_name, new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

-- A promotion can only go (or stay) live when it is complete.
create or replace function private.validate_promotion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name  := btrim(new.name);
  new.title := btrim(new.title);

  if new.type = 'gift' then
    if not exists (select 1 from public.products p where p.id = new.gift_product_id and p.product_type <> 'gift_card') then
      raise exception 'promotions: the gift must be a catalogue product' using errcode = '23514';
    end if;
    if new.gift_variant_id is not null
       and not exists (select 1 from public.product_variants v
                        where v.id = new.gift_variant_id and v.product_id = new.gift_product_id) then
      raise exception 'promotions: the gift variant does not belong to the gift product' using errcode = '23514';
    end if;
    if new.gift_variant_id is null
       and exists (select 1 from public.product_variants v where v.product_id = new.gift_product_id and v.is_active) then
      raise exception 'promotions: choose which variant of the gift product is offered' using errcode = '23514';
    end if;
  end if;

  if new.lifecycle = 'live' then
    if tg_op = 'INSERT' and (new.applies_to <> 'all' or new.customer_eligibility = 'segments'
                             or new.type = 'bundle' or new.activation = 'code') then
      raise exception 'promotions: create it as a draft, add its products/segments/codes, then publish it'
        using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' then
      if (new.applies_to = 'products' and not exists (
            select 1 from public.promotion_products x where x.promotion_id = new.id and x.role = 'eligible'))
         or (new.applies_to = 'categories' and not exists (
            select 1 from public.promotion_categories x where x.promotion_id = new.id))
         or (new.applies_to = 'collections' and not exists (
            select 1 from public.promotion_collections x where x.promotion_id = new.id)) then
        raise exception 'promotions: choose at least one product, category or collection' using errcode = '23514';
      end if;
      if new.customer_eligibility = 'segments'
         and not exists (select 1 from public.promotion_segments x where x.promotion_id = new.id) then
        raise exception 'promotions: choose at least one customer segment' using errcode = '23514';
      end if;
      if new.type = 'bundle'
         and (select count(*) from public.promotion_products x where x.promotion_id = new.id and x.role = 'bundle') < 2 then
        raise exception 'promotions: a bundle needs at least two products' using errcode = '23514';
      end if;
      if new.activation = 'code'
         and not exists (select 1 from public.promotion_codes c where c.promotion_id = new.id and c.is_active) then
        raise exception 'promotions: add a code before publishing' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.prepare_promotion_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.code is distinct from old.code or new.promotion_id is distinct from old.promotion_id then
      raise exception 'promotion_codes: a code cannot be rewritten; deactivate it and add another' using errcode = '42501';
    end if;
  else
    new.code := upper(btrim(new.code));
  end if;
  select p.code_kind into v_kind from public.promotions p where p.id = new.promotion_id;
  if v_kind is null then
    raise exception 'promotion_codes: this promotion is automatic, it has no codes' using errcode = '23514';
  end if;
  if v_kind = 'unique' then
    new.max_uses := 1;
  end if;
  return new;
end;
$$;

-- The loyalty reward comes back when its unpaid order is cancelled / expires.
create or replace function private.release_loyalty_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and new.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    update public.loyalty_cards
       set status = 'completed', redeemed_at = null, redeemed_order_id = null
     where redeemed_order_id = new.id and status = 'redeemed';
  end if;
  return new;
end;
$$;

create trigger orders_release_loyalty_reward
  after update of status on public.orders
  for each row execute function private.release_loyalty_reward();

do $$
declare
  t text;
begin
  foreach t in array array['collections', 'customer_segments', 'campaigns', 'promotions', 'promotion_codes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.set_audit_columns()', t || '_audit_columns', t);
  end loop;

  foreach t in array array['collection_products', 'collection_translations', 'customer_segment_members',
                           'campaign_products', 'campaign_translations', 'promotion_translations',
                           'promotion_products', 'promotion_categories', 'promotion_collections',
                           'promotion_segments', 'order_discounts']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array['collection_translations', 'campaign_translations', 'promotion_translations']
  loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.reject_default_locale_translation()',
      t || '_not_default_locale', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.set_translation_audit()',
      t || '_audit', t);
  end loop;
end;
$$;

create trigger promotions_timezone
  before insert or update of timezone on public.promotions
  for each row execute function private.check_timezone();
create trigger campaigns_timezone
  before insert or update of timezone on public.campaigns
  for each row execute function private.check_timezone();
create trigger promotions_validate
  before insert or update on public.promotions
  for each row execute function private.validate_promotion();
create trigger promotion_codes_prepare
  before insert or update on public.promotion_codes
  for each row execute function private.prepare_promotion_code();

-- Audit: what changes money or who gets it.
create trigger promotions_audit_log
  after insert or delete on public.promotions
  for each row execute function private.audit_changes();
create trigger promotions_audit_log_update
  after update on public.promotions
  for each row execute function private.audit_changes(
    'lifecycle', 'type', 'currency', 'percent_off', 'max_discount_amount', 'amount_off', 'buy_quantity',
    'get_quantity', 'reward_percent', 'bundle_price', 'gift_product_id', 'gift_variant_id', 'applies_to',
    'customer_eligibility', 'min_subtotal_amount', 'min_quantity', 'max_uses_total', 'max_uses_per_customer',
    'combinable', 'exclude_discounted_products', 'activation', 'code_kind', 'starts_at', 'ends_at');
create trigger promotion_codes_audit_log
  after update or delete on public.promotion_codes
  for each row execute function private.audit_changes('is_active', 'max_uses');
create trigger promotion_products_audit_log
  after insert or delete on public.promotion_products
  for each row execute function private.audit_changes();
create trigger promotion_categories_audit_log
  after insert or delete on public.promotion_categories
  for each row execute function private.audit_changes();
create trigger promotion_collections_audit_log
  after insert or delete on public.promotion_collections
  for each row execute function private.audit_changes();
create trigger promotion_segments_audit_log
  after insert or delete on public.promotion_segments
  for each row execute function private.audit_changes();
create trigger campaigns_audit_log
  after update on public.campaigns
  for each row execute function private.audit_changes('lifecycle', 'starts_at', 'ends_at');
create trigger customer_segments_audit_log
  after insert or update or delete on public.customer_segments
  for each row execute function private.audit_changes('rule', 'customer_tag', 'is_active');
create trigger customer_segment_members_audit_log
  after insert or delete on public.customer_segment_members
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 7. Discount engine (called by create_order; service role)
-- -----------------------------------------------------------------------------

-- Split p_total across lines in proportion to their weights (= what is left to
-- discount on each line), to the cent, never above a line's weight:
-- floor each share, then give the remaining cents to the largest remainders.
-- p_weights: [{"idx": 1, "weight": 12.50}, ...]  ->  {"1": 3.10, ...}
create or replace function private.allocate_discount(p_total numeric, p_weights jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sum numeric;
  v_out jsonb;
begin
  select coalesce(sum((e ->> 'weight')::numeric), 0) into v_sum
    from jsonb_array_elements(coalesce(p_weights, '[]'::jsonb)) e
   where (e ->> 'weight')::numeric > 0;
  if p_total is null or round(p_total, 2) <= 0 or v_sum <= 0 then
    return '{}'::jsonb;
  end if;
  p_total := least(round(p_total, 2), v_sum);

  with parts as (
    select e ->> 'idx' as idx, p_total * (e ->> 'weight')::numeric / v_sum as exact
      from jsonb_array_elements(p_weights) e
     where (e ->> 'weight')::numeric > 0
  ), floored as (
    select idx, floor(exact * 100) / 100 as fl, exact - floor(exact * 100) / 100 as rem from parts
  ), ranked as (
    select idx, fl, row_number() over (order by rem desc, idx) as rn from floored
  )
  select jsonb_object_agg(idx, fl + case when rn <= round((p_total - (select sum(fl) from floored)) * 100)
                                         then 0.01 else 0 end)
    into v_out
    from ranked;
  return coalesce(v_out, '{}'::jsonb);
end;
$$;

-- Can this basket line receive this promotion?
create or replace function private.promotion_line_eligible(p public.promotions, p_line jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not coalesce((p_line ->> 'is_gift_card')::boolean, false)
     and not coalesce((p_line ->> 'is_promo_gift')::boolean, false)
     and not (p.exclude_discounted_products and coalesce((p_line ->> 'on_sale')::boolean, false))
     and not exists (select 1 from public.promotion_products x
                      where x.promotion_id = p.id and x.role = 'excluded'
                        and x.product_id = (p_line ->> 'product_id')::uuid)
     and case
           when p.type = 'bundle' then exists (
             select 1 from public.promotion_products x
              where x.promotion_id = p.id and x.role = 'bundle' and x.product_id = (p_line ->> 'product_id')::uuid)
           when p.applies_to = 'all' then true
           when p.applies_to = 'products' then exists (
             select 1 from public.promotion_products x
              where x.promotion_id = p.id and x.role = 'eligible' and x.product_id = (p_line ->> 'product_id')::uuid)
           when p.applies_to = 'categories' then exists (
             select 1 from public.promotion_categories x
              where x.promotion_id = p.id and x.category_id = nullif(p_line ->> 'category_id', '')::uuid)
           when p.applies_to = 'collections' then exists (
             select 1 from public.promotion_collections x
               join public.collections c on c.id = x.collection_id and c.is_active
               join public.collection_products cp on cp.collection_id = x.collection_id
              where x.promotion_id = p.id and cp.product_id = (p_line ->> 'product_id')::uuid)
           else false
         end;
$$;

-- Does the promotion apply to this customer and basket right now (schedule,
-- currency, customers, thresholds, usage limits)? Locks the promotion row when
-- it has usage limits so concurrent checkouts count one after the other.
create or replace function private.promotion_applies(
  p          public.promotions,
  p_lines    jsonb,
  p_user_id  uuid,
  p_email    text,
  p_currency text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_goods    numeric;
  v_units    integer;
  v_eligible integer;
  v_used     integer;
begin
  if p.lifecycle <> 'live' or p.starts_at > now() or (p.ends_at is not null and p.ends_at <= now())
     or p.currency <> p_currency then
    return false;
  end if;

  if p.customer_eligibility in ('new', 'existing') then
    if exists (select 1 from public.orders o
                where o.payment_status in ('paid', 'partially_refunded', 'refunded')
                  and ((p_user_id is not null and o.user_id = p_user_id)
                       or lower(o.customer_email) = lower(p_email)))
       = (p.customer_eligibility = 'new') then
      return false;
    end if;
  elsif p.customer_eligibility = 'segments' then
    if not exists (select 1 from public.promotion_segments x
                    where x.promotion_id = p.id and private.customer_in_segment(p_user_id, x.segment_id)) then
      return false;
    end if;
  end if;

  select coalesce(sum((l ->> 'line_total')::numeric), 0) into v_goods
    from jsonb_array_elements(p_lines) l
   where not coalesce((l ->> 'is_gift_card')::boolean, false);
  if p.min_subtotal_amount is not null and v_goods < p.min_subtotal_amount then
    return false;
  end if;

  select count(*), coalesce(sum((l ->> 'quantity')::integer), 0) into v_eligible, v_units
    from jsonb_array_elements(p_lines) l
   where private.promotion_line_eligible(p, l);
  if v_eligible = 0 or (p.min_quantity is not null and v_units < p.min_quantity) then
    return false;
  end if;

  if p.max_uses_total is not null or p.max_uses_per_customer is not null then
    perform 1 from public.promotions where id = p.id for update;
    if p.max_uses_total is not null then
      select count(*) into v_used
        from public.order_discounts d join public.orders o on o.id = d.order_id
       where d.promotion_id = p.id and o.status <> 'cancelled';
      if v_used >= p.max_uses_total then
        return false;
      end if;
    end if;
    if p.max_uses_per_customer is not null then
      select count(*) into v_used
        from public.order_discounts d join public.orders o on o.id = d.order_id
       where d.promotion_id = p.id and o.status <> 'cancelled'
         and ((p_user_id is not null and d.user_id = p_user_id) or lower(d.customer_email) = lower(p_email));
      if v_used >= p.max_uses_per_customer then
        return false;
      end if;
    end if;
  end if;
  return true;
end;
$$;

-- What one promotion gives, on top of the discounts already applied (p_disc).
-- Returns {"goods": {"<idx>": amount}, "shipping": n, "gift_line": {...} | null}.
create or replace function private.evaluate_promotion(
  p_promotion_id uuid,
  p_lines        jsonb,
  p_disc         jsonb,
  p_shipping     numeric
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  p          public.promotions;
  v_weights  jsonb;
  v_net      numeric;
  v_total    numeric;
  v_goods    jsonb := '{}'::jsonb;
  v_shipping numeric := 0;
  v_gift     jsonb;
  v_n        integer;
  v_regular  numeric;
  v_line     jsonb;
  v_product  public.products;
  v_variant  public.product_variants;
  v_inv      public.inventory_items;
begin
  select * into p from public.promotions where id = p_promotion_id;

  -- Eligible lines and what is left to discount on each.
  select coalesce(jsonb_agg(jsonb_build_object(
           'idx', l ->> 'idx',
           'weight', (l ->> 'line_total')::numeric - coalesce((p_disc ->> (l ->> 'idx'))::numeric, 0))), '[]'::jsonb),
         coalesce(sum((l ->> 'line_total')::numeric - coalesce((p_disc ->> (l ->> 'idx'))::numeric, 0)), 0)
    into v_weights, v_net
    from jsonb_array_elements(p_lines) l
   where private.promotion_line_eligible(p, l);

  case p.type
  when 'percentage' then
    v_total := round(v_net * p.percent_off / 100, 2);
    if p.max_discount_amount is not null then
      v_total := least(v_total, p.max_discount_amount);
    end if;
    v_goods := private.allocate_discount(v_total, v_weights);

  when 'fixed_amount' then
    v_goods := private.allocate_discount(least(p.amount_off, v_net), v_weights);

  when 'free_shipping' then
    v_shipping := greatest(coalesce(p_shipping, 0), 0);

  when 'buy_x_get_y' then
    -- Every group of (buy + get) eligible units: the `get` cheapest are
    -- reward_percent off. Units are ranked cheapest first across the basket.
    with units as (
      select l ->> 'idx' as idx, (l ->> 'unit_price')::numeric as price
        from jsonb_array_elements(p_lines) l
        cross join lateral generate_series(1, (l ->> 'quantity')::integer)
       where private.promotion_line_eligible(p, l)
    ), ranked as (
      select idx, price, row_number() over (order by price, idx) as rn, count(*) over () as n from units
    ), rewarded as (
      select idx, sum(round(price * p.reward_percent / 100, 2)) as amount
        from ranked
       where rn <= floor(n::numeric / (p.buy_quantity + p.get_quantity)) * p.get_quantity
       group by idx
    )
    select coalesce(jsonb_object_agg(r.idx, least(r.amount, (w ->> 'weight')::numeric)), '{}'::jsonb)
      into v_goods
      from rewarded r
      join jsonb_array_elements(v_weights) w on w ->> 'idx' = r.idx
     where (w ->> 'weight')::numeric > 0;

  when 'bundle' then
    -- Complete bundles in the basket (at least one of each bundle product);
    -- saving = bundles x (cheapest unit of each product - bundle price).
    select min(q.qty), sum(q.cheapest), count(*)
      into v_n, v_regular, v_total
      from (select x.product_id,
                   coalesce(sum((l ->> 'quantity')::integer)
                              filter (where private.promotion_line_eligible(p, l)), 0) as qty,
                   min((l ->> 'unit_price')::numeric) filter (where private.promotion_line_eligible(p, l)) as cheapest
              from public.promotion_products x
              left join jsonb_array_elements(p_lines) l on (l ->> 'product_id')::uuid = x.product_id
             where x.promotion_id = p.id and x.role = 'bundle'
             group by x.product_id) q;
    if coalesce(v_n, 0) > 0 and v_regular > p.bundle_price then
      v_goods := private.allocate_discount(least(v_n * (v_regular - p.bundle_price), v_net), v_weights);
    end if;

  when 'gift' then
    -- Qualifying purchase = an eligible line other than the gift itself
    -- (buying only the gift product must not make it free).
    if exists (select 1 from jsonb_array_elements(p_lines) l
                where private.promotion_line_eligible(p, l)
                  and (l ->> 'product_id')::uuid <> p.gift_product_id) then
      -- Already in the basket: that unit becomes free.
      select l into v_line
        from jsonb_array_elements(p_lines) l
       where (l ->> 'product_id')::uuid = p.gift_product_id
         and nullif(l ->> 'variant_id', '')::uuid is not distinct from p.gift_variant_id
         and not coalesce((l ->> 'is_gift_card')::boolean, false)
       limit 1;
      if v_line is not null then
        v_net := (v_line ->> 'line_total')::numeric - coalesce((p_disc ->> (v_line ->> 'idx'))::numeric, 0);
        if v_net > 0 then
          v_goods := jsonb_build_object(v_line ->> 'idx', least((v_line ->> 'unit_price')::numeric, v_net));
        end if;
      else
        -- Added as a free line, only if it can actually be shipped.
        select * into v_product from public.products
         where id = p.gift_product_id and status = 'active' and currency = p.currency;
        if found then
          v_variant := null;
          if p.gift_variant_id is not null then
            select * into v_variant from public.product_variants
             where id = p.gift_variant_id and product_id = v_product.id and is_active;
          end if;
          if p.gift_variant_id is null or v_variant.id is not null then
            if v_variant.id is not null then
              select * into v_inv from public.inventory_items where variant_id = v_variant.id;
            else
              select * into v_inv from public.inventory_items where product_id = v_product.id;
            end if;
            if (v_inv.id is null and v_product.product_type <> 'physical')
               or (v_inv.id is not null and v_inv.track_inventory and v_inv.quantity_on_hand - v_inv.quantity_reserved >= 1)
               or (v_inv.id is not null and not v_inv.track_inventory and v_inv.availability <> 'out_of_stock') then
              select coalesce(max((l ->> 'idx')::integer), 0) + 1 into v_n from jsonb_array_elements(p_lines) l;
              v_gift := jsonb_build_object(
                'idx', v_n,
                'product_id', v_product.id, 'variant_id', v_variant.id,
                'product_name', v_product.name, 'variant_name', v_variant.name,
                'sku', coalesce(v_variant.sku, v_product.sku),
                'unit_price', coalesce(v_variant.price, v_product.price),
                'quantity', 1,
                'line_total', coalesce(v_variant.price, v_product.price),
                'tax_category', v_product.tax_category,
                'inventory_item_id', v_inv.id,
                'category_id', v_product.category_id,
                'on_sale', false, 'is_gift_card', false, 'is_promo_gift', true);
              if (v_gift ->> 'line_total')::numeric > 0 then
                v_goods := jsonb_build_object(v_n::text, (v_gift ->> 'line_total')::numeric);
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  end case;

  return jsonb_build_object('goods', coalesce(v_goods, '{}'::jsonb), 'shipping', v_shipping, 'gift_line', v_gift);
end;
$$;

-- Apply promotions in sequence (each on what the previous ones left).
-- p_candidates: [{"promotion_id", "promotion_code_id", "code"}] in application order.
create or replace function private.run_promotions(
  p_candidates jsonb,
  p_lines      jsonb,
  p_shipping   numeric,
  p_locale     text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c          jsonb;
  e          jsonb;
  v_lines    jsonb := p_lines;
  v_disc     jsonb := '{}'::jsonb;
  v_ship     numeric := coalesce(p_shipping, 0);
  v_goods    numeric;
  v_rows     jsonb := '[]'::jsonb;
  v_benefit  numeric := 0;
  p          public.promotions;
begin
  for c in select value from jsonb_array_elements(p_candidates)
  loop
    select * into p from public.promotions where id = (c ->> 'promotion_id')::uuid;
    e := private.evaluate_promotion(p.id, v_lines, v_disc, v_ship);
    select coalesce(sum(value::numeric), 0) into v_goods from jsonb_each_text(e -> 'goods');
    -- A gift line only joins the basket when it is actually given (price > 0).
    if jsonb_typeof(e -> 'gift_line') = 'object' and v_goods > 0 then
      v_lines := v_lines || jsonb_build_array(e -> 'gift_line');
    end if;
    if v_goods + (e ->> 'shipping')::numeric > 0 then
      select v_disc || coalesce(jsonb_object_agg(k, coalesce((v_disc ->> k)::numeric, 0) + v::numeric), '{}'::jsonb)
        into v_disc
        from jsonb_each_text(e -> 'goods') as t(k, v);
      v_ship := v_ship - (e ->> 'shipping')::numeric;
      v_benefit := v_benefit + v_goods + (e ->> 'shipping')::numeric;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'source', 'promotion',
        'promotion_id', p.id,
        'promotion_code_id', c -> 'promotion_code_id',
        'code', c -> 'code',
        'promotion_type', p.type,
        'label', coalesce((select t.title from public.promotion_translations t
                            where t.promotion_id = p.id and t.locale = p_locale and t.status = 'published'), p.title),
        'goods_amount', v_goods,
        'shipping_amount', (e ->> 'shipping')::numeric));
    end if;
  end loop;

  return jsonb_build_object('lines', v_lines, 'disc', v_disc, 'shipping', coalesce(p_shipping, 0) - v_ship,
                            'discounts', v_rows, 'benefit', v_benefit,
                            'has_code', exists (select 1 from jsonb_array_elements(v_rows) r
                                                 where r ->> 'promotion_code_id' is not null));
end;
$$;

-- The whole decision for one basket. p_lines as built by create_order.
-- Returns {"lines": [... + "discount_amount"], "shipping_discount": n, "discounts": [...]}.
create or replace function private.compute_order_discounts(
  p_lines        jsonb,
  p_user_id      uuid,
  p_email        text,
  p_currency     text,
  p_shipping     numeric,
  p_codes        text[],
  p_use_loyalty  boolean,
  p_locale       text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lines      jsonb;
  v_codes      text[];
  v_code       text;
  v_code_row   public.promotion_codes;
  v_promo      public.promotions;
  v_used       integer;
  v_cands      jsonb := '[]'::jsonb;      -- [{promotion_id, promotion_code_id, code, combinable, rank, created_at}]
  c            jsonb;
  v_option     jsonb;
  v_best       jsonb;
  v_settings   public.loyalty_settings;
  v_card       public.loyalty_cards;
  v_total      numeric;
  v_weights    jsonb;
  v_disc       jsonb;
  v_discounts  jsonb;
  v_ship_disc  numeric := 0;
begin
  -- Enrich lines: position, category, already on sale, gift card.
  select coalesce(jsonb_agg(l || jsonb_build_object(
           'idx', n,
           'category_id', pr.category_id,
           'on_sale', coalesce(v.compare_at_price, pr.compare_at_price) is not null,
           'is_gift_card', l ->> 'tax_category' = 'gift_card') order by n), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(p_lines) with ordinality as t(l, n)
    join public.products pr on pr.id = (l ->> 'product_id')::uuid
    left join public.product_variants v on v.id = nullif(l ->> 'variant_id', '')::uuid;

  v_codes := array(select distinct upper(btrim(x)) from unnest(coalesce(p_codes, '{}'::text[])) as x
                    where btrim(x) <> '');
  if cardinality(v_codes) > 3 then
    raise exception 'create_order: at most 3 promotion codes' using errcode = '22023';
  end if;

  -- Loyalty reward: explicit, alone. ------------------------------------------
  if coalesce(p_use_loyalty, false) then
    if cardinality(v_codes) > 0 then
      raise exception 'create_order: the loyalty reward cannot be combined with a promotion code' using errcode = '22023';
    end if;
    if p_user_id is null then
      raise exception 'create_order: the loyalty reward requires an account' using errcode = '42501';
    end if;
    select * into v_settings from public.loyalty_settings where id;
    if not found or v_settings.currency <> p_currency then
      raise exception 'create_order: the loyalty reward is not available in %', p_currency using errcode = '22023';
    end if;
    select * into v_card from public.loyalty_cards
     where user_id = p_user_id and status = 'completed'
     order by completed_at, created_at
     limit 1
     for update;
    if not found then
      raise exception 'create_order: no loyalty reward available' using errcode = 'P0002';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('idx', l ->> 'idx', 'weight', (l ->> 'line_total')::numeric)), '[]'::jsonb),
           coalesce(sum((l ->> 'line_total')::numeric), 0)
      into v_weights, v_total
      from jsonb_array_elements(v_lines) l
     where not (l ->> 'is_gift_card')::boolean;
    v_disc := private.allocate_discount(round(v_total * v_card.reward_percent / 100, 2), v_weights);
    select coalesce(sum(value::numeric), 0) into v_total from jsonb_each_text(v_disc);
    v_discounts := case when v_total > 0 then jsonb_build_array(jsonb_build_object(
                     'source', 'loyalty', 'loyalty_card_id', v_card.id, 'promotion_type', null,
                     'label', case when p_locale = 'fr' then 'Récompense fidélité -' else 'Loyalty reward -' end
                              || v_card.reward_percent || ' %',
                     'goods_amount', v_total, 'shipping_amount', 0))
                   else '[]'::jsonb end;
  else
    -- Promotions ----------------------------------------------------------------
    -- Codes the customer typed: each must exist, be active, have uses left and apply.
    foreach v_code in array v_codes
    loop
      v_code_row := null;
      select * into v_code_row from public.promotion_codes where code = v_code and is_active for update;
      if v_code_row.id is null then
        raise exception 'create_order: promotion code % is not valid for this order', v_code using errcode = 'P0002';
      end if;
      select * into v_promo from public.promotions where id = v_code_row.promotion_id;
      if not private.promotion_applies(v_promo, v_lines, p_user_id, p_email, p_currency) then
        raise exception 'create_order: promotion code % is not valid for this order', v_code using errcode = 'P0002';
      end if;
      if v_code_row.max_uses is not null then
        select count(*) into v_used
          from public.order_discounts d join public.orders o on o.id = d.order_id
         where d.promotion_code_id = v_code_row.id and o.status <> 'cancelled';
        if v_used >= v_code_row.max_uses then
          raise exception 'create_order: promotion code % is not valid for this order', v_code using errcode = 'P0002';
        end if;
      end if;
      if not v_cands @> jsonb_build_array(jsonb_build_object('promotion_id', v_promo.id)) then
        v_cands := v_cands || jsonb_build_array(jsonb_build_object(
          'promotion_id', v_promo.id, 'promotion_code_id', v_code_row.id, 'code', v_code_row.code,
          'combinable', v_promo.combinable, 'type', v_promo.type, 'created_at', v_promo.created_at));
      end if;
    end loop;

    -- Automatic promotions running now.
    for v_promo in
      select * from public.promotions
       where activation = 'automatic' and lifecycle = 'live' and currency = p_currency
         and starts_at <= now() and (ends_at is null or ends_at > now())
       order by created_at, id
    loop
      if private.promotion_applies(v_promo, v_lines, p_user_id, p_email, p_currency) then
        v_cands := v_cands || jsonb_build_array(jsonb_build_object(
          'promotion_id', v_promo.id, 'promotion_code_id', null, 'code', null,
          'combinable', v_promo.combinable, 'type', v_promo.type, 'created_at', v_promo.created_at));
      end if;
    end loop;

    -- Options: each non-combinable promotion alone; all combinable ones together.
    -- Best benefit wins; on a tie, the option honouring a typed code, then the first.
    for c in select value from jsonb_array_elements(v_cands) where not (value ->> 'combinable')::boolean
    loop
      v_option := private.run_promotions(jsonb_build_array(c), v_lines, p_shipping, p_locale);
      if v_best is null
         or (v_option ->> 'benefit')::numeric > (v_best ->> 'benefit')::numeric
         or ((v_option ->> 'benefit')::numeric = (v_best ->> 'benefit')::numeric
             and (v_option ->> 'has_code')::boolean and not (v_best ->> 'has_code')::boolean) then
        v_best := v_option;
      end if;
    end loop;

    select private.run_promotions(
             jsonb_agg(value order by array_position(
               array['bundle', 'buy_x_get_y', 'gift', 'fixed_amount', 'percentage', 'free_shipping'], value ->> 'type'),
               value ->> 'created_at', value ->> 'promotion_id'),
             v_lines, p_shipping, p_locale)
      into v_option
      from jsonb_array_elements(v_cands)
     where (value ->> 'combinable')::boolean;
    if v_option is not null
       and (v_best is null
            or (v_option ->> 'benefit')::numeric > (v_best ->> 'benefit')::numeric
            or ((v_option ->> 'benefit')::numeric = (v_best ->> 'benefit')::numeric
                and (v_option ->> 'has_code')::boolean and not (v_best ->> 'has_code')::boolean)) then
      v_best := v_option;
    end if;

    if v_best is not null and (v_best ->> 'benefit')::numeric > 0 then
      v_lines     := v_best -> 'lines';
      v_disc      := v_best -> 'disc';
      v_discounts := v_best -> 'discounts';
      v_ship_disc := (v_best ->> 'shipping')::numeric;
    else
      v_disc      := '{}'::jsonb;
      v_discounts := '[]'::jsonb;
    end if;
  end if;

  return jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(l || jsonb_build_object(
                       'discount_amount', coalesce((v_disc ->> (l ->> 'idx'))::numeric, 0))
                     order by (l ->> 'idx')::integer), '[]'::jsonb)
                from jsonb_array_elements(v_lines) l),
    'shipping_discount', v_ship_disc,
    'discounts', v_discounts);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. create_order (replaces migration 018): promotion codes, automatic
--    promotions, loyalty reward, VAT on discounted lines.
--    New parameters: p_promotion_codes (max 3), p_use_loyalty_reward.
-- -----------------------------------------------------------------------------
drop function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[]);

create function public.create_order(
  p_user_id              uuid,
  p_customer_email       text,
  p_items                jsonb,
  p_billing_address      jsonb,
  p_shipping_address     jsonb default null,
  p_shipping_rate_id     uuid default null,
  p_currency             text default 'EUR',
  p_locale               text default 'fr',
  p_customer_note        text default null,
  p_reservation_minutes  integer default 60,
  p_gift_card_codes      text[] default null,
  p_promotion_codes      text[] default null,
  p_use_loyalty_reward   boolean default false
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_item           jsonb;
  v_gc             jsonb;
  v_qty            integer;
  v_amount         numeric;          -- unconstrained on purpose: sub-cent input must be rejected, not rounded
  v_product        public.products;
  v_variant        public.product_variants;
  v_inventory      public.inventory_items;
  v_settings       public.gift_card_settings;
  v_lines          jsonb := '[]'::jsonb;
  v_line           jsonb;
  v_subtotal       numeric(12, 2) := 0;
  v_gift_lines     numeric(12, 2) := 0;
  v_weight         integer := 0;
  v_needs_shipping boolean := false;
  v_rate           public.shipping_rates;
  v_shipping       numeric(12, 2) := 0;
  v_tax_country    text;
  v_rate_bp        integer;
  v_line_total     numeric(12, 2);
  v_tax_total      numeric(12, 2) := 0;
  v_has_reservation boolean := false;
  v_order          public.orders;
  v_order_item_id  uuid;
  v_code           text;
  v_card           public.gift_cards;
  v_redeemable     numeric(12, 2);
  v_take           numeric(12, 2);
  v_gift_total     numeric(12, 2) := 0;
  v_deliver_at     timestamptz;
  v_discount       jsonb;
  v_discount_total numeric(12, 2) := 0;
  v_row            jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'create_order: items must be a non-empty array (max 100)' using errcode = '22023';
  end if;
  if p_reservation_minutes is null or p_reservation_minutes not between 5 and 1440 then
    raise exception 'create_order: reservation must last 5 to 1440 minutes' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_gift_card_codes), 0) > 5 then
    raise exception 'create_order: at most 5 gift cards per order' using errcode = '22023';
  end if;
  p_currency := upper(p_currency);
  if not exists (select 1 from public.languages l where l.code = p_locale and l.is_enabled) then
    raise exception 'create_order: unsupported locale %', p_locale using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (
       select 1 from public.profiles pr where pr.id = p_user_id and pr.status = 'active') then
    raise exception 'create_order: customer account is not active' using errcode = '42501';
  end if;
  select * into v_settings from public.gift_card_settings where id;

  -- Lines ---------------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then
      raise exception 'create_order: invalid quantity' using errcode = '22023';
    end if;

    select * into v_product from public.products
     where id = (v_item ->> 'product_id')::uuid and status = 'active';
    if not found then
      raise exception 'create_order: product % is not available', v_item ->> 'product_id' using errcode = 'P0002';
    end if;

    -- Gift card line ------------------------------------------------------------
    if v_product.product_type = 'gift_card' then
      v_gc := v_item -> 'gift_card';
      v_amount := (v_item ->> 'amount')::numeric;
      if v_settings.id is null or not v_settings.is_published or v_settings.product_id is distinct from v_product.id then
        raise exception 'create_order: gift cards are not on sale' using errcode = 'P0002';
      end if;
      if v_qty <> 1 then
        raise exception 'create_order: one gift card per line' using errcode = '22023';
      end if;
      if v_settings.currency <> p_currency then
        raise exception 'create_order: gift cards are sold in %', v_settings.currency using errcode = '22023';
      end if;
      if v_amount is null or v_amount <> round(v_amount, 2)
         or not (v_amount = any (v_settings.preset_amounts)
                 or (v_settings.allow_custom_amount and v_amount between v_settings.min_amount and v_settings.max_amount)) then
        raise exception 'create_order: gift card amount not allowed' using errcode = '22023';
      end if;
      if v_gc is null or jsonb_typeof(v_gc) <> 'object'
         or position('@' in coalesce(v_gc ->> 'recipient_email', '')) <= 1
         or (v_settings.recipient_name_mode = 'required' and nullif(btrim(v_gc ->> 'recipient_name'), '') is null)
         or (v_settings.sender_name_mode = 'required' and nullif(btrim(v_gc ->> 'sender_name'), '') is null)
         or (v_settings.message_mode = 'required' and nullif(btrim(v_gc ->> 'message'), '') is null)
         or (v_settings.message_mode = 'hidden' and nullif(btrim(v_gc ->> 'message'), '') is not null)
         or char_length(coalesce(v_gc ->> 'message', '')) > v_settings.message_max_length
         or not (coalesce(v_gc ->> 'design', v_settings.default_design) = any (v_settings.enabled_designs)) then
        raise exception 'create_order: gift card details are incomplete or invalid' using errcode = '22023';
      end if;
      v_deliver_at := nullif(v_gc ->> 'deliver_at', '')::timestamptz;
      if v_deliver_at is not null
         and (not v_settings.allow_scheduled_delivery or v_deliver_at > now() + interval '1 year') then
        raise exception 'create_order: delivery date not allowed' using errcode = '22023';
      end if;

      v_subtotal := v_subtotal + v_amount;
      v_gift_lines := v_gift_lines + v_amount;
      v_lines := v_lines || jsonb_build_object(
        'product_id', v_product.id, 'variant_id', null,
        'product_name', v_product.name,
        'variant_name', to_char(v_amount, 'FM999999990.00') || ' ' || p_currency,
        'sku', v_product.sku, 'unit_price', v_amount, 'quantity', 1, 'line_total', v_amount,
        'tax_category', 'gift_card', 'inventory_item_id', null,
        'gift_card', v_gc || jsonb_build_object('deliver_at', v_deliver_at));
      continue;
    end if;

    -- Catalogue line --------------------------------------------------------------
    if v_product.currency <> p_currency then
      raise exception 'create_order: product % is not sold in %', v_product.slug, p_currency using errcode = '22023';
    end if;

    v_variant := null;
    if nullif(v_item ->> 'variant_id', '') is not null then
      select * into v_variant from public.product_variants
       where id = (v_item ->> 'variant_id')::uuid and product_id = v_product.id and is_active;
      if not found then
        raise exception 'create_order: variant % is not available', v_item ->> 'variant_id' using errcode = 'P0002';
      end if;
    elsif exists (select 1 from public.product_variants pv where pv.product_id = v_product.id and pv.is_active) then
      raise exception 'create_order: product % requires a variant', v_product.slug using errcode = '22023';
    end if;

    if v_lines @> jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'variant_id', v_variant.id)) then
      raise exception 'create_order: duplicate line for %', v_product.slug using errcode = '22023';
    end if;

    if v_variant.id is not null then
      select * into v_inventory from public.inventory_items where variant_id = v_variant.id;
    else
      select * into v_inventory from public.inventory_items where product_id = v_product.id;
    end if;
    if v_inventory.id is null and v_product.product_type = 'physical' then
      raise exception 'create_order: % has no inventory record', v_product.slug using errcode = 'P0002';
    end if;

    v_line_total := coalesce(v_variant.price, v_product.price) * v_qty;
    v_subtotal := v_subtotal + v_line_total;
    v_weight := v_weight + coalesce(v_variant.weight_grams, v_product.weight_grams, 0) * v_qty;
    v_needs_shipping := v_needs_shipping or v_product.product_type = 'physical';

    v_lines := v_lines || jsonb_build_object(
      'product_id',        v_product.id,
      'variant_id',        v_variant.id,
      'product_name',      v_product.name,
      'variant_name',      v_variant.name,
      'sku',               coalesce(v_variant.sku, v_product.sku),
      'unit_price',        coalesce(v_variant.price, v_product.price),
      'quantity',          v_qty,
      'line_total',        v_line_total,
      'tax_category',      v_product.tax_category,
      'inventory_item_id', v_inventory.id);
  end loop;

  -- Shipping (thresholds on the goods before discounts, as in iteration 2) --------
  if v_needs_shipping then
    if p_shipping_address is null or p_shipping_rate_id is null then
      raise exception 'create_order: shipping address and rate are required' using errcode = '22023';
    end if;
    select r.* into v_rate
      from public.shipping_rates r
      join public.shipping_zones z on z.id = r.zone_id and z.is_active
     where r.id = p_shipping_rate_id
       and r.is_active
       and z.id = public.shipping_zone_for_country(p_shipping_address ->> 'country_code');
    if not found then
      raise exception 'create_order: shipping rate not available for this destination' using errcode = 'P0002';
    end if;
    if v_rate.currency <> p_currency
       or (v_rate.min_order_amount is not null and v_subtotal - v_gift_lines < v_rate.min_order_amount)
       or (v_rate.max_order_amount is not null and v_subtotal - v_gift_lines > v_rate.max_order_amount)
       or (v_rate.min_weight_grams is not null and v_weight < v_rate.min_weight_grams)
       or (v_rate.max_weight_grams is not null and v_weight > v_rate.max_weight_grams) then
      raise exception 'create_order: shipping rate not applicable to this basket' using errcode = '22023';
    end if;
    v_shipping := case when v_rate.free_over_amount is not null and v_subtotal - v_gift_lines >= v_rate.free_over_amount
                       then 0 else v_rate.price end;
    v_tax_country := upper(p_shipping_address ->> 'country_code');
  else
    p_shipping_address := null;
    p_shipping_rate_id := null;
    v_tax_country := upper(p_billing_address ->> 'country_code');
  end if;

  -- Discounts (promotions or loyalty reward) ------------------------------------------
  v_discount := private.compute_order_discounts(v_lines, p_user_id, lower(trim(p_customer_email)), p_currency,
                                                v_shipping, p_promotion_codes, p_use_loyalty_reward, p_locale);
  v_lines := v_discount -> 'lines';
  -- A free gift line added by a promotion is part of the subtotal (fully discounted).
  select coalesce(sum((l ->> 'line_total')::numeric), 0), coalesce(sum((l ->> 'discount_amount')::numeric), 0)
    into v_subtotal, v_discount_total
    from jsonb_array_elements(v_lines) l;
  v_shipping := v_shipping - (v_discount ->> 'shipping_discount')::numeric;

  -- VAT on what is actually paid per line (gift card lines: none — taxed on redemption)
  select coalesce(jsonb_agg(l || jsonb_build_object(
           'tax_rate_bp', case when l ->> 'tax_category' = 'gift_card' then 0
                               else public.vat_rate_bp(v_tax_country, l ->> 'tax_category') end,
           'tax_amount',  case when l ->> 'tax_category' = 'gift_card' then 0
                               else public.vat_included((l ->> 'line_total')::numeric - (l ->> 'discount_amount')::numeric,
                                      public.vat_rate_bp(v_tax_country, l ->> 'tax_category')) end)
                   order by (l ->> 'idx')::integer), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(v_lines) l;

  select coalesce(sum((l ->> 'tax_amount')::numeric), 0) into v_tax_total from jsonb_array_elements(v_lines) l;
  v_rate_bp := public.vat_rate_bp(v_tax_country, 'standard');
  v_tax_total := v_tax_total + public.vat_included(v_shipping, v_rate_bp);

  -- Persist ---------------------------------------------------------------------
  insert into public.orders
    (user_id, customer_email, billing_address, shipping_address, currency,
     subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, prices_include_tax,
     locale, shipping_rate_id, shipping_method_name, tax_country_code,
     customer_note, expires_at)
  values
    (p_user_id, lower(trim(p_customer_email)), p_billing_address, p_shipping_address, p_currency,
     v_subtotal, v_discount_total, v_shipping, v_tax_total, v_subtotal - v_discount_total + v_shipping, true,
     p_locale, p_shipping_rate_id, v_rate.name, v_tax_country,
     nullif(trim(p_customer_note), ''), now() + make_interval(mins => p_reservation_minutes))
  returning * into v_order;

  perform private.set_inventory_context('reservation', v_order.id);

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items
      (order_id, product_id, variant_id, product_name, variant_name, sku,
       unit_price, quantity, inventory_item_id, tax_rate_bp, tax_amount, discount_amount)
    values
      (v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid,
       v_line ->> 'product_name', v_line ->> 'variant_name', v_line ->> 'sku',
       (v_line ->> 'unit_price')::numeric, (v_line ->> 'quantity')::integer,
       (v_line ->> 'inventory_item_id')::uuid, (v_line ->> 'tax_rate_bp')::integer,
       (v_line ->> 'tax_amount')::numeric, (v_line ->> 'discount_amount')::numeric)
    returning id into v_order_item_id;

    if v_line ? 'gift_card' then
      v_gc := v_line -> 'gift_card';
      insert into public.gift_cards
        (code, source, currency, initial_amount, order_id, order_item_id, purchaser_user_id, purchaser_email,
         recipient_name, recipient_email, sender_name, message, design, deliver_at)
      values
        (private.generate_gift_card_code(), 'purchase', p_currency, (v_line ->> 'unit_price')::numeric,
         v_order.id, v_order_item_id, p_user_id, lower(trim(p_customer_email)),
         nullif(btrim(v_gc ->> 'recipient_name'), ''), lower(btrim(v_gc ->> 'recipient_email')),
         nullif(btrim(v_gc ->> 'sender_name'), ''), nullif(btrim(v_gc ->> 'message'), ''),
         coalesce(v_gc ->> 'design', v_settings.default_design),
         nullif(v_gc ->> 'deliver_at', '')::timestamptz);
    end if;

    if v_line ->> 'inventory_item_id' is not null then
      select * into v_inventory from public.inventory_items
       where id = (v_line ->> 'inventory_item_id')::uuid;

      if v_inventory.track_inventory then
        update public.inventory_items
           set quantity_reserved = quantity_reserved + (v_line ->> 'quantity')::integer
         where id = v_inventory.id
           and quantity_on_hand - quantity_reserved >= (v_line ->> 'quantity')::integer;
        if not found then
          raise exception 'create_order: insufficient stock for %', v_line ->> 'product_name'
            using errcode = 'P0001';
        end if;
        v_has_reservation := true;
      elsif v_inventory.availability = 'out_of_stock' then
        raise exception 'create_order: % is out of stock', v_line ->> 'product_name' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  perform private.set_inventory_context(null, null);

  -- What the order received (usage ledger) + loyalty reward reserved --------------------
  for v_row in select value from jsonb_array_elements(v_discount -> 'discounts')
  loop
    insert into public.order_discounts
      (order_id, source, promotion_id, promotion_code_id, loyalty_card_id, user_id, customer_email,
       label, code, promotion_type, goods_amount, shipping_amount)
    values
      (v_order.id, v_row ->> 'source', (v_row ->> 'promotion_id')::uuid, (v_row ->> 'promotion_code_id')::uuid,
       (v_row ->> 'loyalty_card_id')::uuid, p_user_id, lower(trim(p_customer_email)),
       left(v_row ->> 'label', 200), v_row ->> 'code', v_row ->> 'promotion_type',
       (v_row ->> 'goods_amount')::numeric, (v_row ->> 'shipping_amount')::numeric);
    if v_row ->> 'source' = 'loyalty' then
      update public.loyalty_cards
         set status = 'redeemed', redeemed_at = now(), redeemed_order_id = v_order.id
       where id = (v_row ->> 'loyalty_card_id')::uuid and status = 'completed';
    end if;
  end loop;

  -- Gift cards as payment (never on gift card lines) --------------------------------
  v_redeemable := v_order.total_amount - v_gift_lines;
  if p_gift_card_codes is not null then
    for v_code in select distinct upper(btrim(c)) from unnest(p_gift_card_codes) as c
    loop
      exit when v_redeemable - v_gift_total <= 0;
      select * into v_card from public.gift_cards
       where code = upper(btrim(v_code)) for update;
      if not found or not private.gift_card_is_redeemable(v_card) or v_card.currency <> p_currency then
        raise exception 'create_order: gift card not usable' using errcode = 'P0002';
      end if;
      v_take := least(v_card.balance, v_redeemable - v_gift_total);
      insert into public.gift_card_transactions (gift_card_id, kind, amount, order_id, note)
      values (v_card.id, 'redemption', -v_take, v_order.id, 'Commande ' || v_order.order_number);
      insert into public.payments (order_id, provider, gift_card_id, status, amount, currency, payment_method_type)
      values (v_order.id, 'gift_card', v_card.id, 'succeeded', v_take, p_currency, 'gift_card');
      v_gift_total := v_gift_total + v_take;
    end loop;
  end if;

  update public.orders
     set stock_state = case when v_has_reservation then 'reserved' else stock_state end,
         gift_card_amount = v_gift_total
   where id = v_order.id
  returning * into v_order;

  -- Fully covered by gift cards: paid now (stock committed, cards issued by triggers).
  if v_order.amount_due = 0 and v_gift_total > 0 then
    update public.orders set payment_status = 'paid' where id = v_order.id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

comment on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[], text[], boolean) is
  'Server-only checkout. Prices, shipping, promotions / loyalty reward, VAT and gift card payments are computed here, never trusted from the client.';

-- -----------------------------------------------------------------------------
-- 9. Staff helpers and read models
-- -----------------------------------------------------------------------------

-- Unique single-use codes for a "unique codes" promotion.
create or replace function public.generate_promotion_codes(p_promotion_id uuid, p_count integer, p_prefix text default '')
returns setof public.promotion_codes
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_bytes  bytea;
  v_code   text;
  v_row    public.promotion_codes;
  v_made   integer := 0;
begin
  if not private.caller_has_permission_or_backend('manage_promotions') then
    raise exception 'generate_promotion_codes: not allowed' using errcode = '42501';
  end if;
  if p_count is null or p_count not between 1 and 10000 then
    raise exception 'generate_promotion_codes: 1 to 10000 codes at a time' using errcode = '22023';
  end if;
  if v_prefix !~ '^[A-Z0-9]{0,12}$' then
    raise exception 'generate_promotion_codes: prefix = up to 12 letters or digits' using errcode = '22023';
  end if;
  if not exists (select 1 from public.promotions where id = p_promotion_id and code_kind = 'unique') then
    raise exception 'generate_promotion_codes: not a unique-code promotion' using errcode = '22023';
  end if;

  while v_made < p_count loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := case when v_prefix <> '' then v_prefix || '-' else '' end;
    for j in 0..9 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, j) % 32) + 1, 1);
    end loop;
    v_row := null;
    insert into public.promotion_codes (promotion_id, code, max_uses)
    values (p_promotion_id, v_code, 1)
    on conflict (code) do nothing
    returning * into v_row;
    if v_row.id is not null then
      v_made := v_made + 1;
      return next v_row;
    end if;
  end loop;
end;
$$;

-- Status as the workspace shows it + performance (paid orders only).
create view public.promotion_overview
with (security_invoker = true) as
select p.id, p.name, p.title, p.type, p.activation, p.code_kind, p.lifecycle, p.campaign_id,
       p.currency, p.starts_at, p.ends_at, p.timezone, p.combinable,
       case when p.lifecycle = 'archived' then 'archived'
            when p.lifecycle = 'draft' then 'draft'
            when p.ends_at is not null and p.ends_at <= now() then 'expired'
            when p.lifecycle = 'paused' then 'paused'
            when p.starts_at > now() then 'scheduled'
            else 'active' end                                   as status,
       coalesce(s.orders, 0)                                    as orders,
       coalesce(s.revenue_amount, 0)                            as revenue_amount,
       coalesce(s.discount_amount, 0)                           as discount_amount,
       (select count(*) from public.promotion_codes c where c.promotion_id = p.id)                      as codes,
       p.created_at, p.created_by, p.updated_at, p.updated_by
  from public.promotions p
  left join lateral (
    select count(*) as orders, sum(o.total_amount) as revenue_amount,
           sum(d.goods_amount + d.shipping_amount) as discount_amount
      from public.order_discounts d
      join public.orders o on o.id = d.order_id
     where d.promotion_id = p.id and o.payment_status in ('paid', 'partially_refunded', 'refunded')
  ) s on true;

comment on view public.promotion_overview is 'Promotion list: derived status + paid-order performance. Staff (RLS applies).';

create view public.campaign_overview
with (security_invoker = true) as
select c.id, c.name, c.title, c.theme, c.lifecycle, c.starts_at, c.ends_at, c.timezone, c.cover_path,
       case when c.lifecycle = 'archived' then 'archived'
            when c.lifecycle = 'draft' then 'draft'
            when c.ends_at <= now() then 'completed'
            when c.lifecycle = 'paused' then 'paused'
            when c.starts_at > now() then 'scheduled'
            else 'active' end                                                      as status,
       (select count(*) from public.promotions p where p.campaign_id = c.id)       as promotions,
       (select count(*) from public.campaign_products cp where cp.campaign_id = c.id) as products,
       coalesce(s.orders, 0)          as orders,
       coalesce(s.revenue_amount, 0)  as revenue_amount,
       coalesce(s.discount_amount, 0) as discount_amount,
       c.created_at, c.updated_at
  from public.campaigns c
  left join lateral (
    -- one row per order (an order can use several promotions of the campaign)
    select count(*) as orders, sum(o.total_amount) as revenue_amount, sum(x.discount) as discount_amount
      from (select d.order_id, sum(d.goods_amount + d.shipping_amount) as discount
              from public.order_discounts d
              join public.promotions p on p.id = d.promotion_id and p.campaign_id = c.id
             group by d.order_id) x
      join public.orders o on o.id = x.order_id
     where o.payment_status in ('paid', 'partially_refunded', 'refunded')
  ) s on true;

comment on view public.campaign_overview is 'Campaign list: derived status + roll-up of its promotions (paid orders). Staff (RLS applies).';

create view public.customer_segment_overview
with (security_invoker = true) as
select s.id, s.slug, s.name, s.rule, s.customer_tag, s.is_active,
       case s.rule
         when 'manual' then (select count(*) from public.customer_segment_members m where m.segment_id = s.id)
         when 'customer_tag' then (select count(distinct t.user_id) from public.customer_tags t where t.tag = s.customer_tag)
         when 'marketing_opt_in' then (select count(*) from public.profiles p where p.marketing_opt_in)
       end as size
  from public.customer_segments s;

comment on view public.customer_segment_overview is 'Segments with their current size. Staff (RLS applies).';

-- -----------------------------------------------------------------------------
-- 10. Privileges and RLS
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on
  public.collections, public.collection_products, public.collection_translations,
  public.customer_segments, public.customer_segment_members,
  public.campaigns, public.campaign_products, public.campaign_translations,
  public.promotions, public.promotion_translations, public.promotion_products, public.promotion_categories,
  public.promotion_collections, public.promotion_segments, public.promotion_codes, public.order_discounts
  from anon, authenticated;
revoke insert, update, delete on
  public.collections, public.collection_products, public.collection_translations,
  public.campaigns, public.campaign_products, public.campaign_translations,
  public.promotions, public.promotion_translations, public.promotion_products, public.promotion_categories,
  public.promotion_collections
  from anon;
revoke all on public.customer_segments, public.customer_segment_members, public.promotion_segments,
              public.promotion_codes, public.order_discounts,
              public.promotion_overview, public.campaign_overview, public.customer_segment_overview
  from anon;
revoke insert, update, delete on public.order_discounts from authenticated;
revoke update on public.collection_products, public.campaign_products, public.promotion_products,
                 public.promotion_categories, public.promotion_collections, public.promotion_segments,
                 public.customer_segment_members
  from authenticated;
revoke all on public.promotion_overview, public.campaign_overview, public.customer_segment_overview from authenticated;
grant select on public.promotion_overview, public.campaign_overview, public.customer_segment_overview to authenticated;

-- Visitors see the customer-facing columns of running promotions/campaigns only.
revoke select on public.promotions, public.campaigns from anon;
grant select (id, title, description, type, currency, percent_off, max_discount_amount, amount_off,
              buy_quantity, get_quantity, reward_percent, bundle_price, gift_product_id, gift_variant_id,
              applies_to, customer_eligibility, min_subtotal_amount, min_quantity, combinable,
              exclude_discounted_products, activation, starts_at, ends_at, timezone, campaign_id)
  on public.promotions to anon;
grant select (id, title, description, starts_at, ends_at, timezone, theme, cover_path)
  on public.campaigns to anon;

-- Collections
create policy "collections: public reads active, staff read all"
  on public.collections for select to anon, authenticated
  using (is_active or (select private.is_staff()));
create policy "collection_products: public reads active collections, staff read all"
  on public.collection_products for select to anon, authenticated
  using (exists (select 1 from public.collections c where c.id = collection_products.collection_id and c.is_active)
         or (select private.is_staff()));
create policy "collection_translations: public reads published, staff read all"
  on public.collection_translations for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.collections c
                                            where c.id = collection_translations.collection_id and c.is_active))
         or (select private.is_staff()));

-- Campaigns (running = live and within dates)
create policy "campaigns: public reads running, staff read all"
  on public.campaigns for select to anon, authenticated
  using ((lifecycle = 'live' and starts_at <= now() and ends_at > now()) or (select private.is_staff()));
create policy "campaign_products: public reads running campaigns, staff read all"
  on public.campaign_products for select to anon, authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_products.campaign_id
                   and c.lifecycle = 'live' and c.starts_at <= now() and c.ends_at > now())
         or (select private.is_staff()));
create policy "campaign_translations: public reads published, staff read all"
  on public.campaign_translations for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.campaigns c
                                            where c.id = campaign_translations.campaign_id and c.lifecycle = 'live'
                                              and c.starts_at <= now() and c.ends_at > now()))
         or (select private.is_staff()));

-- Promotions: automatic ones that are running are public (badges, banners);
-- code promotions stay private until applied to an order.
create policy "promotions: public reads running automatic, staff read all"
  on public.promotions for select to anon, authenticated
  using ((lifecycle = 'live' and activation = 'automatic' and starts_at <= now()
          and (ends_at is null or ends_at > now()))
         or (select private.is_staff()));
create policy "promotion_translations: public reads published, staff read all"
  on public.promotion_translations for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.promotions p
                                            where p.id = promotion_translations.promotion_id and p.lifecycle = 'live'
                                              and p.activation = 'automatic' and p.starts_at <= now()
                                              and (p.ends_at is null or p.ends_at > now())))
         or (select private.is_staff()));

do $$
declare
  t text;
begin
  foreach t in array array['promotion_products', 'promotion_categories', 'promotion_collections']
  loop
    execute format($f$
      create policy "%1$s: public reads running automatic, staff read all"
        on public.%1$I for select to anon, authenticated
        using (exists (select 1 from public.promotions p
                        where p.id = %1$I.promotion_id and p.lifecycle = 'live' and p.activation = 'automatic'
                          and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now()))
               or (select private.is_staff()))$f$, t);
  end loop;
end;
$$;

create policy "promotion_segments: staff read"
  on public.promotion_segments for select to authenticated using ((select private.is_staff()));
create policy "promotion_codes: staff read"
  on public.promotion_codes for select to authenticated using ((select private.is_staff()));
create policy "customer_segments: staff read"
  on public.customer_segments for select to authenticated using ((select private.is_staff()));
create policy "customer_segment_members: staff read"
  on public.customer_segment_members for select to authenticated using ((select private.is_staff()));

create policy "order_discounts: owners and staff read"
  on public.order_discounts for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_discounts.order_id and o.user_id = (select auth.uid()))
         or (select private.is_staff()));

-- Writes: manage_promotions.
do $$
declare
  t   text;
  cmd text;
begin
  foreach t in array array['collections', 'collection_products', 'collection_translations',
                           'customer_segments', 'customer_segment_members',
                           'campaigns', 'campaign_products', 'campaign_translations',
                           'promotions', 'promotion_translations', 'promotion_products', 'promotion_categories',
                           'promotion_collections', 'promotion_segments', 'promotion_codes']
  loop
    foreach cmd in array array['insert', 'update', 'delete']
    loop
      continue when cmd = 'update' and t in ('collection_products', 'campaign_products', 'promotion_products',
                                             'promotion_categories', 'promotion_collections', 'promotion_segments',
                                             'customer_segment_members');
      execute format(
        'create policy %I on public.%I for %s to authenticated %s',
        t || ': staff ' || cmd, t, cmd,
        case cmd
          when 'insert' then 'with check ((select private.has_permission(''manage_promotions'')))'
          when 'update' then 'using ((select private.has_permission(''manage_promotions''))) '
                          || 'with check ((select private.has_permission(''manage_promotions'')))'
          else 'using ((select private.has_permission(''manage_promotions'')))'
        end);
    end loop;
  end loop;
end;
$$;

-- Functions
revoke all on function private.allocate_discount(numeric, jsonb), private.promotion_line_eligible(public.promotions, jsonb),
                       private.promotion_applies(public.promotions, jsonb, uuid, text, text),
                       private.evaluate_promotion(uuid, jsonb, jsonb, numeric),
                       private.run_promotions(jsonb, jsonb, numeric, text),
                       private.compute_order_discounts(jsonb, uuid, text, text, numeric, text[], boolean, text),
                       private.customer_in_segment(uuid, uuid), private.check_order_discounts(),
                       private.check_timezone(), private.validate_promotion(), private.prepare_promotion_code(),
                       private.release_loyalty_reward(), private.guard_segment_member()
  from public;
grant execute on function private.allocate_discount(numeric, jsonb), private.promotion_line_eligible(public.promotions, jsonb),
                          private.promotion_applies(public.promotions, jsonb, uuid, text, text),
                          private.evaluate_promotion(uuid, jsonb, jsonb, numeric),
                          private.run_promotions(jsonb, jsonb, numeric, text),
                          private.compute_order_discounts(jsonb, uuid, text, text, numeric, text[], boolean, text),
                          private.customer_in_segment(uuid, uuid)
  to service_role;

revoke all on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[], text[], boolean)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, jsonb, jsonb, jsonb, uuid, text, text, text, integer, text[], text[], boolean)
  to service_role;
revoke all on function public.generate_promotion_codes(uuid, integer, text) from public, anon;
grant execute on function public.generate_promotion_codes(uuid, integer, text) to authenticated, service_role;
