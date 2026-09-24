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

-- Revenue buckets of the Statistics screen (iteration 8).
update public.categories set report_group = case slug
    when 'gems' then 'jewelry' when 'entretien' then 'aftercare'
    when 'kits' then 'kits' when 'outils' then 'kits' when 'accessoires' then 'kits' else report_group end
 where slug in ('gems', 'entretien', 'kits', 'outils', 'accessoires');

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

-- =============================================================================
-- Iteration 2 — shipping, VAT, weights, English content
-- (values mirror webapp/src/data/adminSettings.ts and adminCatalog.ts)
-- VAT rates are illustrative and must be confirmed by the accountant.
-- =============================================================================

begin;

-- Weights (grams) and tax categories -----------------------------------------
update public.products p set weight_grams = v.grams
from (values
  ('etoile-cristal', 5), ('charm-etoile-or-18k', 5), ('coeur-chrome', 5), ('goutte-opale', 5),
  ('kit-application-premium', 850), ('kit-decouverte', 600), ('pince-de-depose', 120),
  ('gel-de-suivi', 40), ('capsules-steriles', 150), ('coffret-glitter-2025', 60)
) as v(slug, grams)
where p.slug = v.slug and p.weight_grams is null;

update public.products set tax_category = 'hygiene' where slug = 'gel-de-suivi' and tax_category = 'standard';
update public.product_variants set weight_grams = 280 where sku = 'ACC-CAP-009-100' and weight_grams is null;

-- VAT rates (basis points) ------------------------------------------------------
insert into public.tax_rates (country_code, tax_category, rate_bp, is_active) values
  ('FR', 'standard', 2000, true), ('DE', 'standard', 1900, true), ('IT', 'standard', 2200, true),
  ('ES', 'standard', 2100, true), ('BE', 'standard', 2100, true), ('NL', 'standard', 2100, true),
  ('PT', 'standard', 2300, true), ('IE', 'standard', 2300, false),
  ('FR', 'books', 550, true), ('DE', 'books', 700, true)
on conflict (country_code, tax_category) do nothing;

-- Shipping zones -----------------------------------------------------------------
insert into public.shipping_zones (name, is_rest_of_world, is_active, position)
select v.name, v.row, v.active, v.position
from (values
  ('France', false, true, 1), ('Union européenne', false, true, 2), ('Royaume-Uni', false, true, 3),
  ('Suisse', false, true, 4), ('États-Unis & Canada', false, true, 5), ('Reste du monde', true, false, 6)
) as v(name, row, active, position)
where not exists (select 1 from public.shipping_zones z where z.name = v.name);

insert into public.shipping_zone_countries (country_code, zone_id)
select c.code, z.id
from (values
  ('FR', 'France'), ('MC', 'France'),
  ('AT', 'Union européenne'), ('BE', 'Union européenne'), ('BG', 'Union européenne'), ('HR', 'Union européenne'),
  ('CY', 'Union européenne'), ('CZ', 'Union européenne'), ('DK', 'Union européenne'), ('EE', 'Union européenne'),
  ('FI', 'Union européenne'), ('DE', 'Union européenne'), ('GR', 'Union européenne'), ('HU', 'Union européenne'),
  ('IE', 'Union européenne'), ('IT', 'Union européenne'), ('LV', 'Union européenne'), ('LT', 'Union européenne'),
  ('LU', 'Union européenne'), ('MT', 'Union européenne'), ('NL', 'Union européenne'), ('PL', 'Union européenne'),
  ('PT', 'Union européenne'), ('RO', 'Union européenne'), ('SK', 'Union européenne'), ('SI', 'Union européenne'),
  ('ES', 'Union européenne'), ('SE', 'Union européenne'),
  ('GB', 'Royaume-Uni'), ('CH', 'Suisse'), ('LI', 'Suisse'),
  ('US', 'États-Unis & Canada'), ('CA', 'États-Unis & Canada')
) as c(code, zone_name)
join public.shipping_zones z on z.name = c.zone_name
on conflict (country_code) do nothing;

insert into public.shipping_rates
  (zone_id, kind, name, min_days, max_days, price, free_over_amount, min_order_amount,
   min_weight_grams, max_weight_grams, is_active, position)
select z.id, v.kind, v.name, v.min_days, v.max_days, v.price, v.free_over, v.min_order,
       v.min_w, v.max_w, v.active, v.position
from (values
  ('France', 'standard', 'Livraison standard', 2, 4,  4.90, null::numeric, null::numeric, null::int, null::int, true, 1),
  ('France', 'express',  'Livraison express',  1, 2,  9.90, null, null, null, null, true, 2),
  ('France', 'free',     'Livraison offerte',  2, 4,  0.00, null, 75.00, null, null, true, 3),
  ('France', 'pickup',   'Retrait au studio — Paris 4e', 1, 1, 0.00, null, null, null, null, true, 4),
  ('Union européenne', 'standard', 'Livraison standard', 3, 6,  8.90, 120.00, null, null, null, true, 1),
  ('Union européenne', 'express',  'Livraison express',  2, 3, 16.90, null, null, null, 2000, true, 2),
  ('Royaume-Uni', 'standard', 'Livraison standard', 4, 7, 12.90, null, null, null, 2000, true, 1),
  ('Royaume-Uni', 'express',  'Livraison express',  2, 3, 24.90, null, null, null, null, true, 2),
  ('Royaume-Uni', 'free',     'Livraison offerte',  4, 7,  0.00, null, 150.00, null, null, false, 3),
  ('Suisse', 'standard', 'Livraison standard', 4, 8, 14.90, null, null, null, null, true, 1),
  ('Suisse', 'express',  'Livraison express',  2, 4, 29.90, null, null, null, null, true, 2),
  ('États-Unis & Canada', 'standard', 'Livraison standard', 6, 10, 19.90, null, null, null, 2000, true, 1),
  ('États-Unis & Canada', 'standard', 'Colis lourd',        6, 10, 34.90, null, null, 2000, null, true, 2),
  ('États-Unis & Canada', 'express',  'Livraison express',  3, 5,  39.90, null, null, null, null, true, 3),
  ('Reste du monde', 'standard', 'International suivi', 8, 15, 24.90, null, null, null, null, true, 1)
) as v(zone_name, kind, name, min_days, max_days, price, free_over, min_order, min_w, max_w, active, position)
join public.shipping_zones z on z.name = v.zone_name
where not exists (
  select 1 from public.shipping_rates r where r.zone_id = z.id and r.name = v.name
);

-- English translations (published) ----------------------------------------------
insert into public.category_translations (category_id, locale, name, slug, description, status)
select c.id, 'en', v.name, v.slug, v.description, 'published'
from (values
  ('gems',        'Gems',             'gems',             'Crystals, charms, stars and decorative pieces set on enamel.'),
  ('kits',        'Application kits', 'application-kits', 'Complete application sets, from etching to light curing.'),
  ('outils',      'Tools',            'tools',            'Professional application and removal instruments.'),
  ('entretien',   'Aftercare',        'aftercare',        'Gels, brushes and cleaning products for long-term wear.'),
  ('accessoires', 'Accessories',      'accessories',      'Storage, display and studio consumables.')
) as v(base_slug, name, slug, description)
join public.categories c on c.slug = v.base_slug
on conflict (category_id, locale) do nothing;

insert into public.product_translations (product_id, locale, name, slug, short_description, description, status)
select p.id, 'en', v.name, v.slug, v.short_description, v.description, 'published'
from (values
  ('etoile-cristal', 'Crystal Star Tooth Gem', 'crystal-star-tooth-gem',
   'Five-point cut-crystal star, 2.2mm.',
   'Five-point cut-crystal star with a flat back, calibrated at 2.2mm for lateral incisors. Polished edges, delivered in a single-use sterile capsule.'),
  ('charm-etoile-or-18k', '18K Gold Star Charm', '18k-gold-star-charm',
   'Star charm in 18-carat yellow gold.',
   'Star charm in 18-carat yellow gold with a micro-textured flat back for optimal adhesion. Hallmarked and delivered with a certificate of authenticity.'),
  ('coeur-chrome', 'Chrome Heart Tooth Gem', 'chrome-heart-tooth-gem',
   'Mirror-finish chrome heart, 2.5mm.',
   'Heart in hypoallergenic chrome alloy with a mirror finish. A bright classic.'),
  ('goutte-opale', 'Opal Drop Gem', 'opal-drop-gem',
   'Synthetic opal drop with iridescent reflections.',
   'Synthetic opal drop with blue-green iridescent reflections. One size, 2 × 3mm.'),
  ('kit-application-premium', 'Premium Application Kit', 'premium-application-kit',
   'The complete kit for professional application.',
   'Etchant, adhesive, flowable composite, applicators, retractors and a selection of 20 crystals: everything needed for a professional in-studio application.'),
  ('kit-decouverte', 'Starter Application Kit', 'starter-application-kit',
   'An introductory kit for trainees.',
   'Introductory kit designed for trainees: consumables for about ten applications and an assortment of crystals.'),
  ('pince-de-depose', 'Gem Removal Pliers', 'gem-removal-pliers',
   'Stainless steel pliers for damage-free removal.',
   'Stainless steel pliers with protected jaws, designed to remove a gem without harming the enamel. Autoclavable.'),
  ('gel-de-suivi', 'Tooth Gem Aftercare Gel', 'tooth-gem-aftercare-gel',
   'Post-application care gel, 15ml.',
   'Gentle fluoride gel for the days after application. Helps preserve the gem''s shine and enamel comfort.'),
  ('capsules-steriles', 'Sterile Capsules', 'sterile-capsules',
   'Single-use sterile capsules for presenting gems.',
   'Transparent single-use sterile capsules to present and handle gems in the studio.'),
  ('coffret-glitter-2025', 'Glitter Set 2025', 'glitter-set-2025',
   '2025 limited edition — collection ended.',
   '2025 limited edition set. Kept for order history.')
) as v(base_slug, name, slug, short_description, description)
join public.products p on p.slug = v.base_slug
on conflict (product_id, locale) do nothing;

insert into public.product_variant_translations (variant_id, locale, name, status)
select pv.id, 'en', v.name, 'published'
from (values
  ('GEM-STAR-001-CRY', 'Crystal'), ('GEM-STAR-001-AB', 'Aurora borealis'), ('GEM-STAR-001-SAP', 'Sapphire'),
  ('GEM-GOLD-004-2MM', '2mm'), ('GEM-GOLD-004-3MM', '3mm'),
  ('ACC-CAP-009-50', 'Box of 50'), ('ACC-CAP-009-100', 'Box of 100')
) as v(sku, name)
join public.product_variants pv on pv.sku = v.sku
on conflict (variant_id, locale) do nothing;

commit;
