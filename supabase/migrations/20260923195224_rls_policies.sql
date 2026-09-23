-- =============================================================================
-- Migration 005 — Row Level Security policies and table privileges
-- =============================================================================
-- RLS was enabled on every table in its own migration (deny by default).
-- This migration grants the minimum access back.
--
-- Access model
--   anon (visitor)      : read the PUBLIC catalogue only (active rows).
--   authenticated user  : public catalogue + own profile, addresses, orders,
--                         order items and payments. Never writes catalogue,
--                         inventory, orders or payments.
--   admin (profiles.role = 'admin' AND status = 'active')
--                       : full catalogue/inventory management, read all
--                         customers/orders, update order states and notes.
--   service_role        : bypasses RLS. Used ONLY server-side (checkout,
--                         Stripe webhooks). Never shipped to browsers.
--
-- `(select ...)` wrappers let Postgres evaluate auth.uid()/is_admin() once per
-- statement instead of once per row.
-- One permissive policy per (table, role, command) keeps evaluation simple.
-- =============================================================================

-- is_admin() is also referenced by policies anon evaluates; it returns false
-- for anon because auth.uid() is null.
grant usage on schema private to anon;
grant execute on function private.is_admin() to anon;

-- -----------------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS)
-- Supabase grants ALL on public tables to anon/authenticated by default.
-- TRUNCATE is not governed by RLS, so it is revoked everywhere.
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Visitors never touch private or customer data, and never write anything.
revoke all on public.profiles, public.customer_addresses, public.orders,
              public.order_items, public.payments
  from anon;
revoke insert, update, delete on public.roles, public.categories, public.products,
              public.product_variants, public.product_media, public.inventory_items
  from anon;

-- Signed-in users: orders, items and payments are written only by the backend.
revoke insert, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items, public.payments, public.roles from authenticated;
-- Profiles are created by the auth trigger and deleted with the auth user.
revoke insert, delete on public.profiles from authenticated;

revoke all on sequence public.order_number_seq from anon, authenticated;

-- -----------------------------------------------------------------------------
-- roles — readable by signed-in users (role labels in the UI); managed by migrations.
-- -----------------------------------------------------------------------------
create policy "roles: signed-in users can read"
  on public.roles for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles: read own, admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

-- Column-level protection (role, status, email) is enforced by the
-- profiles_guard_update trigger.
create policy "profiles: update own, admins update all"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- categories — public reads active; admins manage.
-- -----------------------------------------------------------------------------
create policy "categories: public reads active, admins read all"
  on public.categories for select to anon, authenticated
  using (is_active or (select private.is_admin()));

create policy "categories: admins insert"
  on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy "categories: admins update"
  on public.categories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "categories: admins delete"
  on public.categories for delete to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- products — public reads active; drafts/archived are admin-only.
-- -----------------------------------------------------------------------------
create policy "products: public reads active, admins read all"
  on public.products for select to anon, authenticated
  using (status = 'active' or (select private.is_admin()));

create policy "products: admins insert"
  on public.products for insert to authenticated
  with check ((select private.is_admin()));
create policy "products: admins update"
  on public.products for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "products: admins delete"
  on public.products for delete to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- product_variants — visible when the variant AND its product are active.
-- -----------------------------------------------------------------------------
create policy "product_variants: public reads active, admins read all"
  on public.product_variants for select to anon, authenticated
  using (
    (is_active and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id and p.status = 'active'))
    or (select private.is_admin())
  );

create policy "product_variants: admins insert"
  on public.product_variants for insert to authenticated
  with check ((select private.is_admin()));
create policy "product_variants: admins update"
  on public.product_variants for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "product_variants: admins delete"
  on public.product_variants for delete to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- product_media — visible when the product is active.
-- -----------------------------------------------------------------------------
create policy "product_media: public reads media of active products, admins read all"
  on public.product_media for select to anon, authenticated
  using (
    exists (select 1 from public.products p
            where p.id = product_media.product_id and p.status = 'active')
    or (select private.is_admin())
  );

create policy "product_media: admins insert"
  on public.product_media for insert to authenticated
  with check ((select private.is_admin()));
create policy "product_media: admins update"
  on public.product_media for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "product_media: admins delete"
  on public.product_media for delete to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- inventory_items — stock of active products is public (enables "only 3 left"
-- and out-of-stock badges); writes are admin-only. Order fulfilment decrements
-- stock through public.consume_inventory() with the service role.
-- -----------------------------------------------------------------------------
create policy "inventory_items: public reads stock of active products, admins read all"
  on public.inventory_items for select to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      left join public.product_variants v on v.id = inventory_items.variant_id
      where p.id = coalesce(inventory_items.product_id, v.product_id)
        and p.status = 'active'
        and (inventory_items.variant_id is null or v.is_active)
    )
    or (select private.is_admin())
  );

create policy "inventory_items: admins insert"
  on public.inventory_items for insert to authenticated
  with check ((select private.is_admin()));
create policy "inventory_items: admins update"
  on public.inventory_items for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "inventory_items: admins delete"
  on public.inventory_items for delete to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- customer_addresses — owners manage their own; admins can read (support).
-- -----------------------------------------------------------------------------
create policy "customer_addresses: owners and admins read"
  on public.customer_addresses for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "customer_addresses: owners insert"
  on public.customer_addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "customer_addresses: owners update"
  on public.customer_addresses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "customer_addresses: owners delete"
  on public.customer_addresses for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- orders — customers read their own; admins read all and update states/notes
-- (amounts and snapshots are frozen by the orders_guard_update trigger).
-- Inserts happen only server-side with the service role.
-- -----------------------------------------------------------------------------
create policy "orders: owners and admins read"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "orders: admins update"
  on public.orders for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- order_items / payments — read through the parent order. Read-only for users.
-- -----------------------------------------------------------------------------
create policy "order_items: owners and admins read"
  on public.order_items for select to authenticated
  using (
    exists (select 1 from public.orders o
            where o.id = order_items.order_id and o.user_id = (select auth.uid()))
    or (select private.is_admin())
  );

create policy "payments: owners and admins read"
  on public.payments for select to authenticated
  using (
    exists (select 1 from public.orders o
            where o.id = payments.order_id and o.user_id = (select auth.uid()))
    or (select private.is_admin())
  );
