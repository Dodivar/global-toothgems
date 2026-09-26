-- =============================================================================
-- Migration 021 — Back-office roles and permissions (iteration 6)
-- =============================================================================
-- Replaces the single `admin` gate with explicit RBAC, matching the Users
-- workspace prototype (webapp/src/data/adminUsers.ts):
--
--   role (prototype)        key        rank   permissions
--   ---------------------   --------   ----   -----------------------------------
--   (storefront customer)   customer      0   none
--   Read only               viewer       10   view_dashboard, view_users, view_statistics
--   Manager                 manager      20   + manage_users, manage_products, manage_training,
--                                               manage_orders, manage_customers,
--                                               manage_promotions, moderate_reviews
--   Administrator           admin        30   + manage_settings (everything)
--
-- The prototype lists seven permissions. It has no permission for orders,
-- customers, promotions or reviews although managers obviously work on them
-- (customer care, logistics, e-commerce leads are managers in the seed), so
-- four permissions are ADDED: manage_orders, manage_customers,
-- manage_promotions, moderate_reviews — granted to managers and admins.
-- Grants live in `role_permissions` (data, changed by migration only).
--
-- Rules:
--   * every ACTIVE staff member (roles.is_staff) reads the back office
--     (orders, customers, catalogue drafts, reviews, gift cards...): that is
--     what "read only" means. Audit log and webhook log: manage_settings.
--   * every write needs the matching permission, in RLS and in functions;
--   * role / status changes: manage_users, only on accounts whose role rank
--     is <= the caller's, only towards a role rank <= the caller's (a manager
--     can invite managers but never touch or create an administrator);
--     nobody changes their own role or status; a customer's status alone is
--     manage_customers;
--   * a suspended staff member loses every access at once (status checked
--     on every call).
--
-- Also: staff_profiles (job title, team, who invited whom) and
-- staff_directory() (the Users table: invited / active / suspended,
-- last sign-in, two-factor), both behind view_users.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Audit trigger: identify rows keyed by user_id or by a (role, permission)
--    pair too (staff_profiles, role_permissions, promotion link tables).
--    Body otherwise identical to migration 010.
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
             '?'),
    v_changes
  );
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Roles, permissions, grants
-- -----------------------------------------------------------------------------
alter table public.roles
  add column rank smallint not null default 0 check (rank between 0 and 100);

comment on column public.roles.rank is
  'Seniority used for role management: a user may only manage accounts and assign roles of rank <= their own.';

update public.roles set rank = 0 where key = 'customer';
update public.roles set rank = 30, name = 'Administrator',
       description = 'Everything, including settings (shipping, VAT, languages) and the audit log.'
 where key = 'admin';
insert into public.roles (key, name, description, is_staff, rank) values
  ('viewer',  'Read only', 'Reads the back office: dashboard, statistics, orders, customers, users. Changes nothing.', true, 10),
  ('manager', 'Manager',   'Runs the shop day to day: catalogue, orders, customers, promotions, reviews, training, team members up to manager.', true, 20);

alter table public.roles add constraint roles_staff_rank check (is_staff = (rank > 0));

create table public.permissions (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

comment on table public.permissions is 'Back-office permissions. Checked by private.has_permission() in RLS and functions.';

insert into public.permissions (key, name, description) values
  ('view_dashboard',    'View dashboard',     'Back-office home and its figures.'),
  ('view_users',        'View users',         'The team list: roles, status, last sign-in.'),
  ('view_statistics',   'View statistics',    'Sales, customer and training statistics.'),
  ('manage_users',      'Manage users',       'Invite, edit, suspend team members and change roles (up to the caller''s own rank).'),
  ('manage_products',   'Manage products',    'Catalogue, categories, variants, media, stock, catalogue translations.'),
  ('manage_training',   'Manage training',    'Courses, lessons, quizzes (training iteration).'),
  ('manage_settings',   'Manage settings',    'Shipping, VAT, languages; read the audit and webhook logs.'),
  ('manage_orders',     'Manage orders',      'Order states and notes, cancellations, shipments, refunds.'),
  ('manage_customers',  'Manage customers',   'Customer status, CRM tags and notes, customer profile corrections.'),
  ('manage_promotions', 'Manage promotions',  'Promotions, codes, campaigns, collections, segments, gift cards, loyalty rules.'),
  ('moderate_reviews',  'Moderate reviews',   'Publish, reject, hide and answer reviews; resolve reports.');

create table public.role_permissions (
  role_key       text not null references public.roles (key) on update cascade on delete cascade,
  permission_key text not null references public.permissions (key) on update cascade on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_key, permission_key)
);

comment on table public.role_permissions is 'Which role holds which permission. Changed by migration only (audited).';

insert into public.role_permissions (role_key, permission_key)
select 'viewer', key from public.permissions
 where key in ('view_dashboard', 'view_users', 'view_statistics');
insert into public.role_permissions (role_key, permission_key)
select 'manager', key from public.permissions
 where key <> 'manage_settings';
insert into public.role_permissions (role_key, permission_key)
select 'admin', key from public.permissions;

-- Only staff roles can hold permissions.
create or replace function private.guard_role_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.roles r where r.key = new.role_key and r.is_staff) then
    raise exception 'role_permissions: % is not a staff role', new.role_key using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger role_permissions_staff_only
  before insert or update on public.role_permissions
  for each row execute function private.guard_role_permission();

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create trigger role_permissions_audit_log
  after insert or update or delete on public.role_permissions
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 2. Authorization helpers (SECURITY DEFINER: read profiles without RLS recursion)
-- -----------------------------------------------------------------------------
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join public.roles r on r.key = p.role
     where p.id = (select auth.uid())
       and p.status = 'active'
       and r.is_staff
  );
$$;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join public.roles r on r.key = p.role and r.is_staff
      join public.role_permissions rp on rp.role_key = p.role
     where p.id = (select auth.uid())
       and p.status = 'active'
       and rp.permission_key = p_permission
  );
$$;

-- Rank of the caller's role (0 when not signed in / not staff / not active).
create or replace function private.caller_rank()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.rank
      from public.profiles p
      join public.roles r on r.key = p.role
     where p.id = (select auth.uid()) and p.status = 'active'), 0)::smallint;
$$;

create or replace function private.role_rank(p_role text)
returns smallint
language sql
stable
set search_path = ''
as $$
  select coalesce((select r.rank from public.roles r where r.key = p_role), 0)::smallint;
$$;

create or replace function private.role_is_staff(p_role text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select r.is_staff from public.roles r where r.key = p_role), false);
$$;

revoke all on function private.is_staff(), private.has_permission(text), private.caller_rank(),
                       private.role_rank(text), private.role_is_staff(text),
                       private.guard_role_permission()
  from public;
-- Policies that anon evaluates reference these; they return false for anon.
grant execute on function private.is_staff(), private.has_permission(text) to anon, authenticated, service_role;
grant execute on function private.caller_rank(), private.role_rank(text), private.role_is_staff(text)
  to authenticated, service_role;

-- What the signed-in user may do (drives the back-office navigation; the
-- database still checks every call).
create or replace function public.my_permissions()
returns setof text
language sql
stable
set search_path = ''
as $$
  select rp.permission_key
    from public.role_permissions rp
   where private.has_permission(rp.permission_key)
     and rp.role_key = (select p.role from public.profiles p where p.id = (select auth.uid()))
   order by 1;
$$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Rewrite every policy that used private.is_admin()
-- -----------------------------------------------------------------------------
-- SELECT policies            -> private.is_staff()  (read-only staff read the back office)
--                               except audit_logs / stripe_webhook_events -> manage_settings
-- INSERT / UPDATE / DELETE   -> private.has_permission(<table's permission>)
-- Policy names in public: "admins" becomes "staff". Any policy not covered by the map
-- below aborts the migration, and the end of this block asserts that no
-- policy references is_admin() any more.
do $$
declare
  map constant jsonb := jsonb_build_object(
    -- catalogue
    'public.categories', 'manage_products',
    'public.category_translations', 'manage_products',
    'public.products', 'manage_products',
    'public.product_translations', 'manage_products',
    'public.product_variants', 'manage_products',
    'public.product_variant_translations', 'manage_products',
    'public.product_media', 'manage_products',
    'public.product_media_translations', 'manage_products',
    'public.inventory_items', 'manage_products',
    'storage.product-media', 'manage_products',
    -- settings
    'public.languages', 'manage_settings',
    'public.shipping_zones', 'manage_settings',
    'public.shipping_zone_countries', 'manage_settings',
    'public.shipping_rates', 'manage_settings',
    'public.tax_rates', 'manage_settings',
    -- orders
    'public.orders', 'manage_orders',
    'public.shipments', 'manage_orders',
    'public.shipment_items', 'manage_orders',
    'public.refunds', 'manage_orders',
    'public.refund_items', 'manage_orders',
    -- customers
    'public.customer_tags', 'manage_customers',
    'public.customer_notes', 'manage_customers',
    'storage.avatars', 'manage_customers',
    -- reviews
    'public.reviews', 'moderate_reviews',
    'public.review_notes', 'moderate_reviews',
    'public.review_reports', 'moderate_reviews',
    'public.review_photos', 'moderate_reviews',
    'storage.review-photos', 'moderate_reviews',
    -- promotions workspace
    'public.gift_card_settings', 'manage_promotions',
    'public.loyalty_settings', 'manage_promotions');
  pol   record;
  v_key text;
  v_expr text;
  v_using text;
  v_check text;
  v_sql text;
begin
  for pol in
    select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
     where coalesce(qual, '') || coalesce(with_check, '') like '%private.is_admin()%'
  loop
    if pol.cmd = 'SELECT' then
      v_expr := case when pol.tablename in ('audit_logs', 'stripe_webhook_events')
                     then 'private.has_permission(''manage_settings'')'
                     else 'private.is_staff()' end;
    elsif pol.schemaname = 'public' and pol.tablename = 'profiles' then
      -- Which fields/roles may change is decided by private.guard_profile_update().
      v_expr := '(private.has_permission(''manage_customers'') or private.has_permission(''manage_users''))';
    else
      v_key := case when pol.schemaname = 'storage'
                    then 'storage.' || split_part(pol.policyname, ':', 1)
                    else pol.schemaname || '.' || pol.tablename end;
      if not map ? v_key then
        raise exception 'staff_roles_permissions: no permission mapped for policy "%" on %', pol.policyname, v_key;
      end if;
      v_expr := format('private.has_permission(%L)', map ->> v_key);
    end if;

    v_using := replace(pol.qual, 'private.is_admin()', v_expr);
    v_check := replace(pol.with_check, 'private.is_admin()', v_expr);

    v_sql := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;

    -- (storage.objects belongs to supabase_storage_admin: policies there can be altered, not renamed)
    if pol.policyname like '%admins%' and pol.schemaname = 'public' then
      execute format('alter policy %I on %I.%I rename to %I', pol.policyname, pol.schemaname, pol.tablename,
                     replace(pol.policyname, 'admins', 'staff'));
    end if;
  end loop;

  if exists (select 1 from pg_policies
              where coalesce(qual, '') || coalesce(with_check, '') like '%is_admin()%') then
    raise exception 'staff_roles_permissions: policies still reference is_admin()';
  end if;
end;
$$;

-- New tables of this migration
create policy "permissions: staff read"
  on public.permissions for select to authenticated using ((select private.is_staff()));
create policy "role_permissions: staff read"
  on public.role_permissions for select to authenticated using ((select private.is_staff()));
revoke all on public.permissions, public.role_permissions from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.permissions, public.role_permissions from authenticated;

-- -----------------------------------------------------------------------------
-- 4. Functions that checked is_admin() in their body
-- -----------------------------------------------------------------------------

-- Profiles: who may change what.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role_or_status boolean := new.role is distinct from old.role or new.status is distinct from old.status;
  v_caller_rank    smallint;
begin
  if private.is_trusted_backend() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at
     or new.marketing_opt_in is distinct from old.marketing_opt_in
     or new.password_changed_at is distinct from old.password_changed_at then
    raise exception 'profiles: id, email, created_at, marketing_opt_in and password_changed_at are read-only'
      using errcode = '42501';
  end if;

  if new.id = auth.uid() then
    -- Nobody can lock themselves out (or promote themselves).
    if v_role_or_status then
      raise exception 'profiles: you cannot change your own role or status' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Someone else's profile.
  if private.role_is_staff(old.role) or private.role_is_staff(new.role) or new.role is distinct from old.role then
    -- Team member (or becoming one): user management, within the caller's rank.
    v_caller_rank := private.caller_rank();
    if not private.has_permission('manage_users') then
      raise exception 'profiles: managing team members requires manage_users' using errcode = '42501';
    end if;
    if private.role_rank(old.role) > v_caller_rank or private.role_rank(new.role) > v_caller_rank then
      raise exception 'profiles: you cannot manage or assign a role above your own' using errcode = '42501';
    end if;
  elsif not private.has_permission('manage_customers') then
    raise exception 'profiles: managing customers requires manage_customers' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not (private.is_trusted_backend() or private.has_permission('manage_orders')) then
    raise exception 'cancel_order: not allowed' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'cancel_order: order not found' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    return v_order;
  end if;

  update public.orders
     set status = 'cancelled',
         cancellation_reason = left(coalesce(nullif(trim(p_reason), ''), cancellation_reason), 500)
   where id = p_order_id
  returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.request_refund(
  p_order_id uuid,
  p_amount   numeric,
  p_reason   text,
  p_items    jsonb default '[]'::jsonb,
  p_restock  boolean default false
)
returns public.refunds
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_refund  public.refunds;
  v_item    jsonb;
begin
  if not (private.is_trusted_backend() or private.has_permission('manage_orders')) then
    raise exception 'request_refund: not allowed' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'request_refund: items must be an array' using errcode = '22023';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.order_id = p_order_id
     and p.provider = 'stripe'
     and p.status in ('succeeded', 'partially_refunded')
     and p.amount > p.amount_refunded
   order by p.created_at desc
   limit 1;
  if not found then
    raise exception 'request_refund: no refundable card payment on this order' using errcode = 'P0002';
  end if;

  insert into public.refunds (order_id, payment_id, amount, currency, reason, restock)
  values (p_order_id, v_payment.id, p_amount, v_payment.currency, p_reason, coalesce(p_restock, false))
  returning * into v_refund;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.refund_items (refund_id, order_item_id, quantity)
    values (v_refund.id, (v_item ->> 'order_item_id')::uuid, (v_item ->> 'quantity')::integer);
  end loop;

  return v_refund;
end;
$$;

-- Staff or backend, evaluated from inside SECURITY DEFINER functions:
--   * a signed-in API user must hold the permission (and be active staff);
--   * otherwise the JWT role must be service_role;
--   * no JWT at all = SQL editor / migrations (database owner session).
create or replace function private.caller_has_permission_or_backend(p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when auth.uid() is not null then private.has_permission(p_permission)
    when private.caller_jwt_role() = 'service_role' then true
    when private.caller_jwt_role() = '' then session_user in ('postgres', 'supabase_admin')
    else false
  end;
$$;

revoke all on function private.caller_has_permission_or_backend(text) from public;
grant execute on function private.caller_has_permission_or_backend(text) to authenticated, service_role;

-- Gift card staff functions (issue, adjust, extend, cancel, delivery tracking)
-- belong to the Promotions workspace.
create or replace function private.caller_is_staff_or_backend()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.caller_has_permission_or_backend('manage_promotions');
$$;

-- Refunding onto gift cards is a refund: manage_orders.
create or replace function public.refund_to_gift_cards(p_order_id uuid, p_amount numeric, p_reason text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_left    numeric(12, 2) := p_amount;
  v_part    numeric(12, 2);
  v_refund  public.refunds;
begin
  if not private.caller_has_permission_or_backend('manage_orders') then
    raise exception 'refund_to_gift_cards: not allowed' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'refund_to_gift_cards: amount must be positive' using errcode = '22023';
  end if;

  for v_payment in
    select * from public.payments
     where order_id = p_order_id and provider = 'gift_card'
       and status in ('succeeded', 'partially_refunded') and amount > amount_refunded
     order by created_at desc
     for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, v_payment.amount - v_payment.amount_refunded);
    if not exists (select 1 from public.gift_cards where id = v_payment.gift_card_id and state = 'active') then
      raise exception 'refund_to_gift_cards: card ending % is no longer active; refund another way',
        (select code_last4 from public.gift_cards where id = v_payment.gift_card_id) using errcode = '23514';
    end if;
    insert into public.refunds (order_id, payment_id, amount, currency, reason)
    values (p_order_id, v_payment.id, v_part, v_payment.currency, p_reason)
    returning * into v_refund;
    update public.refunds set status = 'succeeded' where id = v_refund.id;   -- payment + order states
    insert into public.gift_card_transactions (gift_card_id, kind, amount, order_id, note)
    values (v_payment.gift_card_id, 'refund', v_part, p_order_id, 'Remboursement');
    v_left := v_left - v_part;
  end loop;

  if v_left > 0 then
    raise exception 'refund_to_gift_cards: % exceeds what was paid with gift cards', p_amount using errcode = '23514';
  end if;
  return p_amount;
end;
$$;

-- Reviews: moderation needs moderate_reviews.
create or replace function private.guard_review_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_changed boolean;
  v_system_changed  boolean;
begin
  new.updated_at := now();
  new.title := btrim(new.title);
  new.body  := btrim(new.body);

  v_content_changed := new.rating   is distinct from old.rating
                    or new.title    is distinct from old.title
                    or new.body     is distinct from old.body
                    or new.tags     is distinct from old.tags
                    or new.language is distinct from old.language;

  v_system_changed := new.id           is distinct from old.id
                   or new.product_id   is distinct from old.product_id
                   or new.user_id      is distinct from old.user_id
                   or new.order_id     is distinct from old.order_id
                   or new.author_name  is distinct from old.author_name
                   or new.submitted_at is distinct from old.submitted_at
                   or new.created_at   is distinct from old.created_at;

  if private.is_trusted_backend() then
    return new;
  end if;

  if v_system_changed or new.helpful_count is distinct from old.helpful_count then
    raise exception 'reviews: identity, verification and counters are read-only' using errcode = '42501';
  end if;

  if private.has_permission('moderate_reviews') and old.user_id is distinct from auth.uid() then
    -- Staff: moderation only, never the customer's words.
    if v_content_changed or new.edited_at is distinct from old.edited_at then
      raise exception 'reviews: staff cannot edit a customer''s review' using errcode = '42501';
    end if;
    if new.status = 'published' and old.status <> 'published' then
      new.published_at := now();
    end if;
    if new.status <> 'rejected' then
      new.rejection_reason := null;
    end if;
    if new.status <> 'needs_changes' then
      new.changes_request := null;
    end if;
    if new.response_body is distinct from old.response_body then
      new.response_at := case when new.response_body is null then null else now() end;
      new.response_by := case when new.response_body is null then null else auth.uid() end;
    elsif new.response_at is distinct from old.response_at or new.response_by is distinct from old.response_by then
      raise exception 'reviews: response metadata is set automatically' using errcode = '42501';
    end if;
    return new;
  end if;

  -- The author: content only, and any edit goes back to moderation.
  if old.user_id is distinct from auth.uid() then
    raise exception 'reviews: not your review' using errcode = '42501';
  end if;
  if new.status           is distinct from old.status
  or new.rejection_reason is distinct from old.rejection_reason
  or new.changes_request  is distinct from old.changes_request
  or new.is_flagged       is distinct from old.is_flagged
  or new.response_body    is distinct from old.response_body
  or new.response_at      is distinct from old.response_at
  or new.response_by      is distinct from old.response_by
  or new.published_at     is distinct from old.published_at
  or new.edited_at        is distinct from old.edited_at then
    raise exception 'reviews: moderation fields are managed by the team' using errcode = '42501';
  end if;
  if v_content_changed then
    new.status           := 'pending';
    new.edited_at        := now();
    new.rejection_reason := null;
    new.changes_request  := null;
  end if;
  return new;
end;
$$;

create or replace function private.handle_review_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then            -- API callers; backend (no JWT user) keeps its values
      new.reporter_id := auth.uid();
      new.source := case when private.has_permission('moderate_reviews') then 'team' else 'customer' end;
      new.resolved_at := null;
      new.resolved_by := null;
      new.resolution := null;
    end if;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE (moderators only by RLS). A report itself is never rewritten.
  if new.review_id is distinct from old.review_id or new.reporter_id is distinct from old.reporter_id
     or new.reason is distinct from old.reason or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at then
    raise exception 'review_reports: a report cannot be rewritten' using errcode = '42501';
  end if;
  -- Resolution stamps and effect on the review.
  if new.resolution is distinct from old.resolution then
    new.resolved_at := case when new.resolution is null then null else now() end;
    new.resolved_by := case when new.resolution is null then null else auth.uid() end;
    if new.resolution = 'hidden' then
      update public.reviews set status = 'hidden' where id = new.review_id;
    elsif new.resolution = 'removed' then
      update public.reviews set status = 'rejected', rejection_reason = 'guidelines' where id = new.review_id;
    end if;
  end if;
  return new;
end;
$$;

-- is_admin() is kept (role = admin, active) for backward compatibility of
-- application code; no policy or function depends on it any more.
comment on function private.is_admin() is
  'Deprecated for authorization: use private.has_permission(<permission>) / private.is_staff().';

-- -----------------------------------------------------------------------------
-- 5. Staff profiles (the Users workspace)
-- -----------------------------------------------------------------------------
create table public.staff_profiles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  job_title  text check (char_length(job_title) <= 120),   -- internal, single language (like a SKU)
  team       text not null check (team in ('leadership', 'operations', 'academy', 'customer_care', 'marketing', 'finance')),
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_profiles is
  'Team-member details shown in the Users workspace. Access itself comes from profiles.role / status.';

create index staff_profiles_invited_by_idx on public.staff_profiles (invited_by) where invited_by is not null;
alter table public.staff_profiles enable row level security;

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles
  for each row execute function private.set_updated_at();

-- Rank rule for staff_profiles writes too; inviter/invitation date are stamped.
create or replace function private.guard_staff_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if private.is_trusted_backend() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if private.role_rank((select p.role from public.profiles p where p.id = v_target)) > private.caller_rank() then
    raise exception 'staff_profiles: you cannot manage a member above your own role' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.invited_by := auth.uid();
    new.invited_at := coalesce(new.invited_at, now());
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.invited_by is distinct from old.invited_by
       or new.invited_at is distinct from old.invited_at or new.created_at is distinct from old.created_at then
      raise exception 'staff_profiles: member, inviter and dates are read-only' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger staff_profiles_guard
  before insert or update or delete on public.staff_profiles
  for each row execute function private.guard_staff_profile();

create trigger staff_profiles_audit_log
  after insert or update or delete on public.staff_profiles
  for each row execute function private.audit_changes();

revoke all on public.staff_profiles from anon;
revoke truncate, references, trigger on public.staff_profiles from authenticated;

create policy "staff_profiles: team readers"
  on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('view_users')));
create policy "staff_profiles: user managers insert"
  on public.staff_profiles for insert to authenticated
  with check ((select private.has_permission('manage_users')));
create policy "staff_profiles: user managers update"
  on public.staff_profiles for update to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));
create policy "staff_profiles: user managers delete"
  on public.staff_profiles for delete to authenticated
  using ((select private.has_permission('manage_users')));

-- The Users table. Reads auth.users (sign-in, invitation, MFA), hence
-- SECURITY DEFINER with an explicit view_users check; returns team members only.
--   status: suspended/deactivated from the profile; 'invited' until the first
--   sign-in; otherwise 'active'.
create or replace function public.staff_directory()
returns table (
  user_id        uuid,
  email          text,
  first_name     text,
  last_name      text,
  role           text,
  role_rank      smallint,
  status         text,
  job_title      text,
  team           text,
  invited_by     uuid,
  invited_at     timestamptz,
  created_at     timestamptz,
  last_sign_in_at timestamptz,
  two_factor     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.caller_has_permission_or_backend('view_users') then
    raise exception 'staff_directory: not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.email, p.first_name, p.last_name, p.role, r.rank,
         case when p.status <> 'active' then p.status
              when u.last_sign_in_at is null then 'invited'
              else 'active' end,
         s.job_title, s.team, s.invited_by, s.invited_at, p.created_at,
         u.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    from public.profiles p
    join public.roles r on r.key = p.role and r.is_staff
    join auth.users u on u.id = p.id
    left join public.staff_profiles s on s.user_id = p.id
   order by r.rank desc, p.last_name, p.first_name;
end;
$$;

revoke all on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated, service_role;
revoke all on function private.guard_staff_profile() from public;
