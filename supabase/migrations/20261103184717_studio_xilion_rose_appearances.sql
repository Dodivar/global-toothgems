-- =============================================================================
-- Migration — 3D Studio: drawing rows of the Swarovski 2058 (Xilion Rose) gems
-- =============================================================================
-- Owner's request (2026-11-03): "the round gems just added to the stock — create
-- them in the 3D Studio with the sizes available".
--
-- The 17 round "SWAROVSKI® 2058 - …" products added in the back office on
-- 2026-11-03 (shop shape `xilion-rose`) were already offered by the Studio,
-- drawn from their shop colour family only (decision 81): Emeraude and Black
-- Diamond have no colour family and came out clear, Iris and Crystal Vitrail
-- Light fell on the amethyst family's purple, Crystal Vitrail Light and the
-- other coated crystals had no iridescence. This migration gives each one its
-- `studio_gem_appearances` row: a round outline, crystal, the tint measured on
-- its own product photo (`product-media`) and kept close to the rows of the
-- same Swarovski colour in other cuts, iridescent for the coated crystals
-- (AB, Shimmer, Vitrail Light), as the 2026-10-07 rows.
--
-- Presentation data only: no price, stock, size or availability. The Studio's
-- sizes stay the products' active pack × SS options (SS5 / SS7 where the back
-- office set them; SS2 / SS5 / SS7 until it does — decision 107).
--
-- Matched by slug and skipped when a product is missing or already has a row,
-- so the migration is a no-op on a database without these products (CI: empty
-- database + seed) and never overwrites a row changed since.
-- =============================================================================

with seeded (slug, color, effect) as (
  values
    ('swarovski-2058-crystal',               '#ffffff', 'none'),
    ('swarovski-2058-crystal-ab',            '#f1f3ff', 'iridescent'),
    ('swarovski-2058-crystal-shimmer',       '#fff6e6', 'iridescent'),
    ('swarovski-2058-crystal-vitrail-light', '#c9b6f2', 'iridescent'),
    ('swarovski-2058-aquamarine',            '#7fbfdc', 'none'),
    ('swarovski-2058-black-diamond',         '#5c5d62', 'none'),
    ('swarovski-2058-dark-joncquil',         '#dcbb52', 'none'),
    ('swarovski-2058-emeraude',              '#2a9478', 'none'),
    ('swarovski-2058-fuchsia',               '#cc5a99', 'none'),
    ('swarovski-2058-golden-shadow',         '#d8b07a', 'none'),
    ('swarovski-2058-heliotrope',            '#5551dc', 'none'),
    ('swarovski-2058-iris',                  '#cfa6c8', 'none'),
    ('swarovski-2058-light-siam',            '#d01f25', 'none'),
    ('swarovski-2058-peridot',               '#aec78a', 'none'),
    ('swarovski-2058-rose',                  '#dc8aa8', 'none'),
    ('swarovski-2058-rose-clair',            '#e2b0c2', 'none'),
    ('swarovski-2058-saphir',                '#5a80d6', 'none')
)
insert into public.studio_gem_appearances (product_id, shape, material, color, effect)
select p.id, 'round', 'crystal', s.color, s.effect
from seeded s
join public.products p on p.slug = s.slug
where not exists (
  select 1 from public.studio_gem_appearances a where a.product_id = p.id and a.variant_id is null
);
