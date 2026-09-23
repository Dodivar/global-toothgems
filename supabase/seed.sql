-- =============================================================================
-- Seed data — MVP catalogue (fictional, for development/visual testing only)
-- =============================================================================
-- * No customers, orders or personal data are seeded.
-- * Content is in the default locale (fr), matching the storefront fallback.
-- * Product media rows point to object paths in the `product-media` bucket;
--   the image files themselves must be uploaded separately (they are not in
--   the database by design).
-- * Idempotent: safe to run more than once.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------
insert into public.categories (slug, name, description, position) values
  ('gems',        'Gems',               'Cristaux, charms, étoiles et pièces décoratives posées sur l’émail.', 1),
  ('kits',        'Kits d’application', 'Coffrets complets de pose, du mordançage à la photopolymérisation.', 2),
  ('outils',      'Outils',             'Instruments de pose et de dépose à usage professionnel.', 3),
  ('entretien',   'Suivi & entretien',  'Gels, brosses et produits de nettoyage pour la tenue dans la durée.', 4),
  ('accessoires', 'Accessoires',        'Rangement, présentation et consommables de studio.', 5)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
insert into public.products
  (category_id, name, slug, short_description, description, sku, price, compare_at_price,
   status, is_featured, metadata)
select c.id, v.name, v.slug, v.short_description, v.description, v.sku, v.price, v.compare_at_price,
       v.status, v.is_featured, v.metadata::jsonb
from (values
  ('gems', 'Étoile Cristal', 'etoile-cristal',
   'Étoile cinq branches en cristal taillé, 2,2 mm.',
   'Étoile cinq branches en cristal taillé à dos plat, calibrée 2,2 mm pour les incisives latérales. Bords polis, livrée en capsule stérile à usage unique.',
   'GEM-STAR-001', 32.00, 38.00, 'active', true,
   '{"material": "Cristal taillé", "tags": ["best-seller", "étoile"]}'),
  ('gems', 'Charm Étoile Or 18k', 'charm-etoile-or-18k',
   'Charm étoile en or jaune 18 carats.',
   'Charm étoile en or jaune 18 carats, dos plat micro-texturé pour une adhérence optimale. Poinçonné et livré avec certificat d’authenticité.',
   'GEM-GOLD-004', 89.00, null, 'active', true,
   '{"material": "Or jaune 18 carats", "tags": ["or", "premium"]}'),
  ('gems', 'Cœur Chrome', 'coeur-chrome',
   'Cœur chromé effet miroir, 2,5 mm.',
   'Cœur en alliage chromé hypoallergénique, finition miroir. Un classique au rendu lumineux.',
   'GEM-CHR-007', 41.00, null, 'active', false,
   '{"material": "Alliage chromé"}'),
  ('gems', 'Goutte Opale', 'goutte-opale',
   'Goutte en opale synthétique aux reflets irisés.',
   'Goutte en opale synthétique, reflets irisés bleu-vert. Taille unique 2 × 3 mm.',
   'GEM-OPL-015', 64.00, null, 'active', false,
   '{"material": "Opale synthétique"}'),
  ('kits', 'Kit d’Application Premium', 'kit-application-premium',
   'Le kit complet pour une pose professionnelle.',
   'Mordançage, adhésif, composite fluide, applicateurs, écarteurs et une sélection de 20 cristaux : tout le nécessaire pour une pose professionnelle en cabine.',
   'KIT-PRO-001', 249.00, 279.00, 'active', true,
   '{"tags": ["pro", "kit"]}'),
  ('kits', 'Kit Découverte', 'kit-decouverte',
   'Un kit d’initiation pour débuter en formation.',
   'Kit d’initiation pensé pour les stagiaires : consommables pour une dizaine de poses et un assortiment de cristaux.',
   'KIT-START-002', 129.00, null, 'draft', false,
   '{"tags": ["formation"]}'),
  ('outils', 'Pince de Dépose', 'pince-de-depose',
   'Pince inox pour une dépose sans dommage.',
   'Pince en acier inoxydable à mors protégés, conçue pour retirer une gem sans altérer l’émail. Autoclavable.',
   'TOOL-REM-002', 78.00, null, 'active', false,
   '{"material": "Acier inoxydable"}'),
  ('entretien', 'Gel de Suivi', 'gel-de-suivi',
   'Gel d’entretien post-pose, 15 ml.',
   'Gel doux au fluor pour les jours suivant la pose. Aide à préserver l’éclat de la gem et le confort de l’émail.',
   'CARE-GEL-003', 19.00, null, 'active', false,
   '{}'),
  ('accessoires', 'Capsules Stériles', 'capsules-steriles',
   'Capsules stériles à usage unique pour la présentation des gems.',
   'Capsules stériles transparentes à usage unique pour présenter et manipuler les gems en cabine.',
   'ACC-CAP-009', 24.00, null, 'active', false,
   '{}'),
  ('gems', 'Coffret Glitter 2025', 'coffret-glitter-2025',
   'Édition limitée 2025 — collection terminée.',
   'Coffret édition limitée 2025. Conservé pour l’historique des commandes.',
   'GEM-SET-004', 72.00, null, 'archived', false,
   '{"tags": ["édition limitée"]}')
) as v(category_slug, name, slug, short_description, description, sku, price, compare_at_price,
       status, is_featured, metadata)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Variants (only where a real option exists)
-- -----------------------------------------------------------------------------
insert into public.product_variants (product_id, name, sku, attributes, price, position)
select p.id, v.name, v.sku, v.attributes::jsonb, v.price, v.position
from (values
  ('etoile-cristal', 'Cristal',          'GEM-STAR-001-CRY', '{"colour": "cristal"}',          null::numeric, 1),
  ('etoile-cristal', 'Aurore boréale',   'GEM-STAR-001-AB',  '{"colour": "aurore-boreale"}',   34.00,         2),
  ('etoile-cristal', 'Saphir',           'GEM-STAR-001-SAP', '{"colour": "saphir"}',           null::numeric, 3),
  ('charm-etoile-or-18k', '2 mm',        'GEM-GOLD-004-2MM', '{"size": "2mm"}',                null::numeric, 1),
  ('charm-etoile-or-18k', '3 mm',        'GEM-GOLD-004-3MM', '{"size": "3mm"}',                109.00,        2),
  ('capsules-steriles', 'Boîte de 50',   'ACC-CAP-009-50',   '{"quantity": 50}',               null::numeric, 1),
  ('capsules-steriles', 'Boîte de 100',  'ACC-CAP-009-100',  '{"quantity": 100}',              42.00,         2)
) as v(product_slug, name, sku, attributes, price, position)
join public.products p on p.slug = v.product_slug
on conflict (sku) do nothing;

-- -----------------------------------------------------------------------------
-- Inventory: variant-level for products with variants, product-level otherwise
-- -----------------------------------------------------------------------------
insert into public.inventory_items (variant_id, quantity_on_hand, low_stock_threshold)
select pv.id, v.qty, v.threshold
from (values
  ('GEM-STAR-001-CRY', 148, 20),
  ('GEM-STAR-001-AB',   36, 10),
  ('GEM-STAR-001-SAP',   4, 10),
  ('GEM-GOLD-004-2MM',   7,  3),
  ('GEM-GOLD-004-3MM',   0,  3),
  ('ACC-CAP-009-50',    60, 15),
  ('ACC-CAP-009-100',    3, 10)
) as v(sku, qty, threshold)
join public.product_variants pv on pv.sku = v.sku
on conflict do nothing;

insert into public.inventory_items (product_id, track_inventory, quantity_on_hand, low_stock_threshold, availability)
select p.id, v.track, v.qty, v.threshold, v.availability
from (values
  ('coeur-chrome',             true,   0,  5, 'in_stock'),
  ('goutte-opale',             false,  0,  0, 'preorder'),   -- made to order
  ('kit-application-premium',  true,  31,  5, 'in_stock'),
  ('kit-decouverte',           true,  62, 10, 'in_stock'),
  ('pince-de-depose',          true,   9,  3, 'in_stock'),
  ('gel-de-suivi',             true,  11, 15, 'in_stock'),
  ('coffret-glitter-2025',     true,   2,  0, 'in_stock')
) as v(slug, track, qty, threshold, availability)
join public.products p on p.slug = v.slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Media references (files to upload to the `product-media` bucket)
-- -----------------------------------------------------------------------------
insert into public.product_media (product_id, variant_id, storage_path, alt_text, position, is_primary)
select p.id, pv.id, v.path, v.alt, v.position, v.is_primary
from (values
  ('etoile-cristal', null,               'products/etoile-cristal/01.jpg', 'Étoile cristal posée sur une incisive', 0, true),
  ('etoile-cristal', 'GEM-STAR-001-AB',  'products/etoile-cristal/aurore-boreale.jpg', 'Étoile aurore boréale en gros plan', 1, false),
  ('etoile-cristal', null,               'products/etoile-cristal/02.jpg', 'Étoile cristal de profil', 2, false),
  ('charm-etoile-or-18k', null,          'products/charm-etoile-or-18k/01.jpg', 'Charm étoile en or jaune', 0, true),
  ('coeur-chrome', null,                 'products/coeur-chrome/01.jpg', 'Cœur chromé effet miroir', 0, true),
  ('goutte-opale', null,                 'products/goutte-opale/01.jpg', 'Goutte en opale aux reflets irisés', 0, true),
  ('kit-application-premium', null,      'products/kit-application-premium/01.jpg', 'Kit d’application ouvert', 0, true),
  ('kit-application-premium', null,      'products/kit-application-premium/02.jpg', 'Contenu du kit d’application', 1, false),
  ('pince-de-depose', null,              'products/pince-de-depose/01.jpg', 'Pince de dépose en acier inoxydable', 0, true),
  ('gel-de-suivi', null,                 'products/gel-de-suivi/01.jpg', 'Flacon de gel de suivi', 0, true),
  ('capsules-steriles', null,            'products/capsules-steriles/01.jpg', 'Gems présentées en capsule stérile', 0, true)
) as v(product_slug, variant_sku, path, alt, position, is_primary)
join public.products p on p.slug = v.product_slug
left join public.product_variants pv on pv.sku = v.variant_sku
where not exists (
  select 1 from public.product_media m where m.storage_path = v.path
);

commit;
