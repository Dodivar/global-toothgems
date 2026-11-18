-- 3D Studio: lighter, clearer tints for the pale Swarovski colours (decision 155).
--
-- The Studio's crystal material uses a gem's tint twice (body colour and the
-- absorption colour of the light crossing the stone), so a pale stone renders
-- much darker than its hex. Several pale tints were also darker than the
-- product photo. Each row below takes the median colour of its product photo,
-- lifted a little in linear light (exponent 1/1.15) to make up for that
-- double tint: aquamarine, peridot, rose / rose clair / light rose, the
-- jonquil kite and the heliotrope navette. Every other colour is unchanged.
--
-- Data only. A row changes only while it still holds the old tint (a tint set
-- by staff since is kept), so the migration is idempotent and a no-op in CI.
-- Designs already saved keep the look they were saved with.

update public.studio_gem_appearances a
set color = v.new_color
from (values
    ('baguette-aquamarine-swarovski', '#48719d', '#93b5d5'),
    ('swarovski-2058-aquamarine', '#7fbfdc', '#b8d4ed'),
    ('swarovski-coeur-aquamarine', '#7894bb', '#9bbadb'),
    ('swarovski-diamond-shape-aquamarine', '#7aa9d3', '#a9c5df'),
    ('swarovski-navette-aquamarine', '#6d9cc3', '#a6cce8'),
    ('swarovski-raindrop-aquamarine', '#56a1cb', '#9bbad6'),
    ('swarovski-square-aquamarine', '#568bc0', '#a4c0da'),
    ('swarovski-starflower-aquamarine', '#75a9cb', '#aec9e3'),
    ('swarovski-navette-heliotrope', '#6988f3', '#7791f2'),
    ('swarovski-2058-peridot', '#aec78a', '#bbd293'),
    ('swarovski-baguette-peridot', '#a9cc66', '#b9d87c'),
    ('swarovski-coeur-peridot', '#a9bd86', '#b2c594'),
    ('swarovski-navette-peridot', '#9fb36a', '#d3dfb3'),
    ('swarovski-2058-rose', '#dc8aa8', '#e284a6'),
    ('swarovski-2058-rose-clair', '#e2b0c2', '#e9bccd'),
    ('swarovski-baguette-rose', '#c9567a', '#c66e8a'),
    ('swarovski-coeur-light-rose', '#d39cad', '#cfa1b2'),
    ('swarovski-diamond-shape-light-rose', '#cd99a4', '#dfb8c1'),
    ('swarovski-navette-rose-clair', '#b97a84', '#e1a7b1'),
    ('swarovski-raindrop-rose-clair', '#d194a9', '#eebcce'),
    ('swarovski-square-rose-clair', '#dbadb8', '#e0b8c2'),
    ('swarovski-starflower-light-rose', '#bf8fa1', '#dcb5c5'),
    ('swarovski-diamond-shape-jonquil', '#dac88b', '#eadfbc')
) as v(slug, old_color, new_color)
join public.products p on p.slug = v.slug
where a.product_id = p.id
  and a.variant_id is null
  and a.material = 'crystal'
  and a.effect = 'none'
  and lower(a.color) = v.old_color;
