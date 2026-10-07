-- =============================================================================
-- Migration — 3D Studio on the shop's gems (scene format 2)
-- =============================================================================
-- Decided by the owner (2026-10-07): the gems of the 3D Studio are the gems
-- the shop sells — every active product of the `gems` category, whatever its
-- stock — so a composition is a set of jewellery a customer can buy.
--
--   * studio_gem_appearances  how a shop gem is DRAWN in the 3D editor: its
--                      outline (shape), material (crystal / metal), tint and
--                      effect (iridescent coatings: AB, Shimmer, Vitrail).
--                      One row per product (shape + default look), plus one
--                      row per colour variant that looks different (yellow /
--                      white gold of the 18ct pieces). Presentation data only:
--                      no price, no stock, no availability. A gem without a
--                      row still appears in the Studio, drawn from its shop
--                      shape and colour (webapp lib/studio3d/gemCatalog.ts).
--                      Seeded from the product photos in `product-media`.
--
--   * Sizes are NOT stored here: a gem's Studio sizes are its active `ss`
--     variants (the pack × SS options of the back office); a gem without any
--     is offered in SS2, SS5 and SS7 until the team sets its real sizes.
--
--   * Scene / Gem Group format 2: a piece now names its product (and colour
--     variant), its stone size and a snapshot of its look, instead of a type
--     of the former built-in library. The test designs saved so far referred
--     to that library; the owner asked for them to be discarded (pre-launch),
--     so this migration deletes every creation, share link and Gem Group
--     BEFORE accepting only version 2. The renders they left in the private
--     `studio-thumbnails` bucket are removed through the Storage API, not here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Discard the format-1 test designs, then accept format 2 only.
-- -----------------------------------------------------------------------------
delete from public.creation_shares;
delete from public.creations;
delete from public.gem_groups;

alter table public.creations drop constraint creations_scene_data_check;
alter table public.creations add constraint creations_scene_data_check
  check (jsonb_typeof(scene_data) = 'object'
         and (scene_data ->> 'version') = '2'
         and jsonb_typeof(scene_data -> 'pieces') = 'array'
         and jsonb_array_length(scene_data -> 'pieces') <= 200
         and pg_column_size(scene_data) <= 262144);

alter table public.gem_groups drop constraint gem_groups_group_data_check;
alter table public.gem_groups add constraint gem_groups_group_data_check
  check (jsonb_typeof(group_data) = 'object'
         and (group_data ->> 'version') = '2'
         and jsonb_typeof(group_data -> 'pieces') = 'array'
         and jsonb_array_length(group_data -> 'pieces') between 2 and 24
         and pg_column_size(group_data) <= 65536);

comment on column public.creations.scene_data is
  'Full editor scene (webapp studioWorkspace/scene.ts, version 2): pieces (shop product, colour variant, stone size, look snapshot) with transforms; light; camera; Gem Group references.';
comment on table public.gem_groups is
  '3D Studio: reusable multi-gem arrangements, relative to an anchor tooth (webapp studioWorkspace/gemGroup.ts, version 2). Owner-only (RLS).';

-- -----------------------------------------------------------------------------
-- 2. How each shop gem is drawn in the Studio.
-- -----------------------------------------------------------------------------
create table public.studio_gem_appearances (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  -- Set: the look of that colour variant. Null: the product's shape and default look.
  variant_id  uuid references public.product_variants (id) on delete cascade,
  -- Outline of the piece; on the product row only (a variant changes the colour, not the cut).
  shape       text check (shape in (
                'round', 'baguette', 'square', 'heart', 'open-heart', 'kite', 'navette', 'raindrop',
                'triangle', 'rivoli-star', 'starflower', 'halo-star', 'bolt', 'cherries', 'snake', 'dachshund')),
  material    text not null check (material in ('crystal', 'metal')),
  color       text not null check (color ~ '^#[0-9a-f]{6}$'),
  effect      text not null default 'none' check (effect in ('none', 'iridescent')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null,
  constraint studio_gem_appearances_shape_on_product check ((variant_id is null) = (shape is not null))
);

comment on table public.studio_gem_appearances is
  '3D Studio: how a shop gem is drawn (shape, material, tint, effect), per product and per colour variant. Presentation only; public read for active products.';

create unique index studio_gem_appearances_product_idx on public.studio_gem_appearances (product_id) where variant_id is null;
create unique index studio_gem_appearances_variant_idx on public.studio_gem_appearances (variant_id) where variant_id is not null;
create index studio_gem_appearances_product_id_idx on public.studio_gem_appearances (product_id);

-- A variant row must describe a variant of its own product.
create or replace function private.studio_gem_appearance_variant_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.variant_id is not null and not exists (
    select 1 from public.product_variants v where v.id = new.variant_id and v.product_id = new.product_id
  ) then
    raise exception 'studio_gem_appearances: variant % is not a variant of product %', new.variant_id, new.product_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger studio_gem_appearances_variant_matches
  before insert or update on public.studio_gem_appearances
  for each row execute function private.studio_gem_appearance_variant_matches();

create trigger studio_gem_appearances_audit
  before insert or update on public.studio_gem_appearances
  for each row execute function private.set_audit_columns();
create trigger studio_gem_appearances_audit_log
  after update on public.studio_gem_appearances
  for each row execute function private.audit_changes('shape', 'material', 'color', 'effect');
create trigger studio_gem_appearances_audit_log_delete
  after delete on public.studio_gem_appearances
  for each row execute function private.audit_changes();

alter table public.studio_gem_appearances enable row level security;

revoke truncate, references, trigger on public.studio_gem_appearances from anon, authenticated;
revoke insert, update, delete on public.studio_gem_appearances from anon;

-- Visitors read the look of the products the shop shows (the share viewer is public).
create policy "studio_gem_appearances: public reads active products, staff read all"
  on public.studio_gem_appearances for select to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = studio_gem_appearances.product_id and p.status = 'active')
    or (select private.is_staff())
  );
create policy "studio_gem_appearances: staff insert"
  on public.studio_gem_appearances for insert to authenticated
  with check ((select private.has_permission('manage_products')));
create policy "studio_gem_appearances: staff update"
  on public.studio_gem_appearances for update to authenticated
  using ((select private.has_permission('manage_products')))
  with check ((select private.has_permission('manage_products')));
create policy "studio_gem_appearances: staff delete"
  on public.studio_gem_appearances for delete to authenticated
  using ((select private.has_permission('manage_products')));

-- -----------------------------------------------------------------------------
-- 3. Seed: the shop's gems as their photos show them (2026-10-07). Matched by
-- slug, so a product missing on another environment is simply skipped.
-- -----------------------------------------------------------------------------
with seeded (slug, shape, material, color, effect) as (
  values
    ('baguette-aquamarine-swarovski', 'baguette', 'crystal', '#48719d', 'none'),
    ('baguette-crystal-ab-swarovski', 'baguette', 'crystal', '#f1f3ff', 'iridescent'),
    ('baguette-crystal-swarovski', 'baguette', 'crystal', '#ffffff', 'none'),
    ('cerises-en-or-18ct', 'cherries', 'metal', '#f2c25c', 'none'),
    ('coeur-chrome', 'heart', 'metal', '#dfe3e8', 'none'),
    ('coeur-ouvert-en-or-18ct', 'open-heart', 'metal', '#f2c25c', 'none'),
    ('eclair-en-or-18ct', 'bolt', 'metal', '#f2c25c', 'none'),
    ('etoile-halo-or-18ct', 'halo-star', 'metal', '#f2c25c', 'none'),
    ('serpent-en-or-18ct', 'snake', 'metal', '#f2c25c', 'none'),
    ('swarovski-baguette-crystal-shimmer', 'baguette', 'crystal', '#fff6e6', 'iridescent'),
    ('swarovski-baguette-crystal-vitrail-light', 'baguette', 'crystal', '#c9b6f2', 'iridescent'),
    ('swarovski-baguette-fuchsia', 'baguette', 'crystal', '#e15195', 'none'),
    ('swarovski-baguette-golden-shadow', 'baguette', 'crystal', '#d8b68a', 'none'),
    ('swarovski-baguette-heliotrope', 'baguette', 'crystal', '#495bfa', 'none'),
    ('swarovski-baguette-peridot', 'baguette', 'crystal', '#a9cc66', 'none'),
    ('swarovski-baguette-rose', 'baguette', 'crystal', '#c9567a', 'none'),
    ('swarovski-baguette-sapphire', 'baguette', 'crystal', '#415d9d', 'none'),
    ('swarovski-baguette-violet', 'baguette', 'crystal', '#8c6aba', 'none'),
    ('swarovski-coeur-aquamarine', 'heart', 'crystal', '#7894bb', 'none'),
    ('swarovski-coeur-crystal', 'heart', 'crystal', '#ffffff', 'none'),
    ('swarovski-coeur-crystal-ab', 'heart', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-coeur-fuchsia', 'heart', 'crystal', '#df90c1', 'none'),
    ('swarovski-coeur-golden-shadow', 'heart', 'crystal', '#ddbb88', 'none'),
    ('swarovski-coeur-light-rose', 'heart', 'crystal', '#d39cad', 'none'),
    ('swarovski-coeur-peridot', 'heart', 'crystal', '#a9bd86', 'none'),
    ('swarovski-coeur-rouge-royal', 'heart', 'crystal', '#e42633', 'none'),
    ('swarovski-coeur-siam', 'heart', 'crystal', '#e82224', 'none'),
    ('swarovski-coeur-violet', 'heart', 'crystal', '#a88cc2', 'none'),
    ('swarovski-diamond-shape-aquamarine', 'kite', 'crystal', '#7aa9d3', 'none'),
    ('swarovski-diamond-shape-blackdiamond', 'kite', 'crystal', '#5c5d62', 'none'),
    ('swarovski-diamond-shape-crystal', 'kite', 'crystal', '#ffffff', 'none'),
    ('swarovski-diamond-shape-crystal-ab', 'kite', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-diamond-shape-crystal-shimmer', 'kite', 'crystal', '#fff6e6', 'iridescent'),
    ('swarovski-diamond-shape-golden-shadow', 'kite', 'crystal', '#dab77d', 'none'),
    ('swarovski-diamond-shape-jonquil', 'kite', 'crystal', '#dac88b', 'none'),
    ('swarovski-diamond-shape-light-azore', 'kite', 'crystal', '#b3c9d0', 'none'),
    ('swarovski-diamond-shape-light-rose', 'kite', 'crystal', '#cd99a4', 'none'),
    ('swarovski-diamond-shape-light-siam', 'kite', 'crystal', '#e73b3f', 'none'),
    ('swarovski-diamond-shape-sunflower', 'kite', 'crystal', '#f0c852', 'none'),
    ('swarovski-diamond-shape-violet', 'kite', 'crystal', '#ad93bc', 'none'),
    ('swarovski-navette-aquamarine', 'navette', 'crystal', '#6d9cc3', 'none'),
    ('swarovski-navette-bermuda-blue', 'navette', 'crystal', '#308fe7', 'none'),
    ('swarovski-navette-blackdiamond', 'navette', 'crystal', '#5c5d62', 'none'),
    ('swarovski-navette-crystal', 'navette', 'crystal', '#ffffff', 'none'),
    ('swarovski-navette-crystal-ab', 'navette', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-navette-crystal-shimmer', 'navette', 'crystal', '#fff6e6', 'iridescent'),
    ('swarovski-navette-crystal-vitrail-light', 'navette', 'crystal', '#c9b6f2', 'iridescent'),
    ('swarovski-navette-dark-jonquil', 'navette', 'crystal', '#dec049', 'none'),
    ('swarovski-navette-emeraude', 'navette', 'crystal', '#57ab98', 'none'),
    ('swarovski-navette-golden-shadow', 'navette', 'crystal', '#d4a36a', 'none'),
    ('swarovski-navette-heliotrope', 'navette', 'crystal', '#6988f3', 'none'),
    ('swarovski-navette-peridot', 'navette', 'crystal', '#9fb36a', 'none'),
    ('swarovski-navette-rose-clair', 'navette', 'crystal', '#b97a84', 'none'),
    ('swarovski-navette-scarlet', 'navette', 'crystal', '#d5585a', 'none'),
    ('swarovski-raindrop-aquamarine', 'raindrop', 'crystal', '#56a1cb', 'none'),
    ('swarovski-raindrop-crystal', 'raindrop', 'crystal', '#ffffff', 'none'),
    ('swarovski-raindrop-crystal-ab', 'raindrop', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-raindrop-crystal-shimmer', 'raindrop', 'crystal', '#fff6e6', 'iridescent'),
    ('swarovski-raindrop-golden-shadow', 'raindrop', 'crystal', '#d7ad72', 'none'),
    ('swarovski-raindrop-heliotrope', 'raindrop', 'crystal', '#4538c4', 'none'),
    ('swarovski-raindrop-light-siam', 'raindrop', 'crystal', '#e50e1d', 'none'),
    ('swarovski-raindrop-rose-clair', 'raindrop', 'crystal', '#d194a9', 'none'),
    ('swarovski-rivoli-star-bermuda-blue', 'rivoli-star', 'crystal', '#067cfc', 'none'),
    ('swarovski-rivoli-star-crystal', 'rivoli-star', 'crystal', '#ffffff', 'none'),
    ('swarovski-rivoli-star-crystal-ab', 'rivoli-star', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-rivoli-star-crystal-shimmer', 'rivoli-star', 'crystal', '#fff6e6', 'iridescent'),
    ('swarovski-rivoli-star-crystal-vitrail-light', 'rivoli-star', 'crystal', '#c9b6f2', 'iridescent'),
    ('swarovski-square-aquamarine', 'square', 'crystal', '#568bc0', 'none'),
    ('swarovski-square-crystal', 'square', 'crystal', '#ffffff', 'none'),
    ('swarovski-square-crystal-2', 'square', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-square-golden-shadow', 'square', 'crystal', '#d7ae74', 'none'),
    ('swarovski-square-rose-clair', 'square', 'crystal', '#dbadb8', 'none'),
    ('swarovski-starflower-amethyste', 'starflower', 'crystal', '#884e96', 'none'),
    ('swarovski-starflower-aquamarine', 'starflower', 'crystal', '#75a9cb', 'none'),
    ('swarovski-starflower-crystal', 'starflower', 'crystal', '#ffffff', 'none'),
    ('swarovski-starflower-crystal-ab', 'starflower', 'crystal', '#f1f3ff', 'iridescent'),
    ('swarovski-starflower-crystal-shimmer', 'starflower', 'crystal', '#fff6e6', 'iridescent'),
    ('swarovski-starflower-golden-shadow', 'starflower', 'crystal', '#dbb280', 'none'),
    ('swarovski-starflower-iris', 'starflower', 'crystal', '#cdaac7', 'none'),
    ('swarovski-starflower-light-rose', 'starflower', 'crystal', '#bf8fa1', 'none'),
    ('swarovski-starflower-light-topaz', 'starflower', 'crystal', '#e7d174', 'none'),
    ('swarovski-starflower-peridot', 'starflower', 'crystal', '#c6cfb2', 'none'),
    ('swarovski-starflower-scarlet', 'starflower', 'crystal', '#d3525b', 'none'),
    ('teckel-en-or-18ct', 'dachshund', 'metal', '#f2c25c', 'none')
)
insert into public.studio_gem_appearances (product_id, shape, material, color, effect)
select p.id, s.shape, s.material, s.color, s.effect
from seeded s
join public.products p on p.slug = s.slug;

-- The 18ct pieces come in yellow and white gold: one look per colour variant,
-- told apart by the variant's swatch (the grey swatch is white gold).
insert into public.studio_gem_appearances (product_id, variant_id, material, color, effect)
select v.product_id, v.id, 'metal',
       case when lower(v.attributes ->> 'swatch') = '#d9d9d9' then '#e3e6ea' else '#f2c25c' end,
       'none'
from public.product_variants v
join public.products p on p.id = v.product_id
where p.slug in ('cerises-en-or-18ct', 'coeur-ouvert-en-or-18ct', 'eclair-en-or-18ct', 'etoile-halo-or-18ct',
                 'serpent-en-or-18ct', 'teckel-en-or-18ct')
  and v.attributes ? 'swatch';
