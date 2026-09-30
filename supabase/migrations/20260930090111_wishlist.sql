-- =============================================================================
-- Migration — Wishlist: products a member keeps as favourites
-- =============================================================================
-- A signed-in member can mark any product of the shop as a favourite (heart
-- on the product cards and the product page) and find them again in the shop's
-- "My favourites" view (/boutique?favoris=1, also behind the header's heart).
--
-- Model:
--   * wishlist_items: one row per (member, product). The composite primary
--     key makes adding twice impossible and keeps the list naturally bounded
--     by the size of the catalogue — no separate cap is needed.
--   * user_id defaults to auth.uid(): the browser sends only the product.
--   * product_id CASCADE: a product that is really deleted leaves no dangling
--     favourite. An archived or draft product keeps its rows but is no longer
--     readable by customers (products RLS), so it simply drops out of the view,
--     and comes back if the product is published again.
--   * user_id CASCADE: favourites are personal data; deleting the account
--     deletes them.
--   * No update: a favourite is added or removed, never edited.
--
-- Access (RLS): a member reads, adds and removes only their own favourites.
-- Adding requires an active account and a product the member can currently
-- see as active in the shop. Visitors have no access at all. Staff have no
-- read access either: no screen needs it, and a list of what a named customer
-- is considering is personal data. Aggregate statistics, if wanted later,
-- belong in a SECURITY DEFINER function that returns counts only.
--
-- Not audited: this is a customer preference, not a security-sensitive or
-- money-related change.
-- =============================================================================

create table public.wishlist_items (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

comment on table public.wishlist_items is
  'Products a member marked as favourite. Own rows only (RLS); no staff access.';

-- The primary key serves "my favourites"; this one serves the product side
-- (the cascade on product deletion, and future per-product counts).
create index wishlist_items_product_idx on public.wishlist_items (product_id);

alter table public.wishlist_items enable row level security;

-- =============================================================================
-- Privileges and RLS
-- =============================================================================
revoke all on public.wishlist_items from anon;
revoke truncate, references, trigger, update on public.wishlist_items from authenticated;
-- The member names the product; the owner and the date are the database's.
revoke insert on public.wishlist_items from authenticated;
grant insert (product_id) on public.wishlist_items to authenticated;

create policy "wishlist_items: owners read"
  on public.wishlist_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy "wishlist_items: active members add shop products"
  on public.wishlist_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles pr
                where pr.id = (select auth.uid()) and pr.status = 'active')
    and exists (select 1 from public.products p
                where p.id = wishlist_items.product_id and p.status = 'active')
  );

create policy "wishlist_items: owners remove"
  on public.wishlist_items for delete to authenticated
  using (user_id = (select auth.uid()));
