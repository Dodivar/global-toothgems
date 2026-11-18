-- 3D Studio: the rose and aquamarine gems lighter still (decision 155, second pass).
--
-- After 20261118173122 the owner found every rose still too dark and wanted
-- the aquamarine lighter, sky blue. Both families now take the full
-- compensation of the crystal material's double tint (photo median raised to
-- the power 1/1.9 in linear light) with a little more chroma, so the roses
-- stay pink instead of mauve; aquamarine is also turned to a sky-blue hue
-- (OKLCH h = 232). Other colours unchanged. Guarded on the previous tint.

update public.studio_gem_appearances a
set color = v.new_color
from (values
    ('baguette-aquamarine-swarovski', '#93b5d5', '#aad3e9'),
    ('swarovski-2058-aquamarine', '#b8d4ed', '#c8e7f7'),
    ('swarovski-coeur-aquamarine', '#9bbadb', '#afd7ec'),
    ('swarovski-diamond-shape-aquamarine', '#a9c5df', '#bdddef'),
    ('swarovski-navette-aquamarine', '#a6cce8', '#bbe1f6'),
    ('swarovski-raindrop-aquamarine', '#9bbad6', '#b2d6e9'),
    ('swarovski-square-aquamarine', '#a4c0da', '#b9daec'),
    ('swarovski-starflower-aquamarine', '#aec9e3', '#c0e0f1'),
    ('swarovski-2058-rose', '#e284a6', '#f7a6c6'),
    ('swarovski-2058-rose-clair', '#e9bccd', '#f6d2e0'),
    ('swarovski-baguette-rose', '#c66e8a', '#e594b1'),
    ('swarovski-coeur-light-rose', '#cfa1b2', '#e6bfcd'),
    ('swarovski-diamond-shape-light-rose', '#dfb8c1', '#f0cfd7'),
    ('swarovski-navette-rose-clair', '#e1a7b1', '#f3c3cb'),
    ('swarovski-raindrop-rose-clair', '#eebcce', '#fad2e0'),
    ('swarovski-square-rose-clair', '#e0b8c2', '#f0cfd8'),
    ('swarovski-starflower-light-rose', '#dcb5c5', '#edcddb')
) as v(slug, old_color, new_color)
join public.products p on p.slug = v.slug
where a.product_id = p.id
  and a.variant_id is null
  and a.material = 'crystal'
  and a.effect = 'none'
  and lower(a.color) = v.old_color;
