-- =============================================================================
-- GLOBAL™ PRO MASTER PACK: the professional kit + the Masterclass + 3 months of
-- the 3D Studio Artist plan (decision 127, owner's request 2026-11-08)
-- =============================================================================
-- Price: (kit 340.00 + course 590.00) − 10 % = 837.00 EUR, computed here from
-- the current prices. No compare-at price (a struck-through reference price on
-- a new product would claim a reduction it never had).
-- Stock: a kit (decision 117) of ONE GLOBAL™ PRO STUDIO KIT, so the pack is on
-- sale only while a professional kit is.
-- Created as a DRAFT: the owner publishes it from /admin/produits once the
-- storefront showing what it includes is deployed. The picture is the
-- professional kit's (same storage object) until a pack visual is uploaded.
-- Data rows only, found by slug: on a database without the kit or the course
-- (CI, a fresh stack) nothing is created.
-- =============================================================================

do $$
declare
  v_kit    public.products;
  v_course public.courses;
  v_price  numeric(12, 2);
  v_pack   uuid;
  v_fr     text;
  v_en     text;
begin
  select * into v_kit from public.products where slug = 'global-pro-studio-kit';
  select * into v_course from public.courses where slug = 'titre-de-la-formation';
  if v_kit.id is null or v_course.id is null or exists (select 1 from public.products where slug = 'global-pro-master-pack') then
    return;
  end if;
  select round((v_kit.price + cp.current_price) * 0.9, 2) into v_price
    from public.course_current_prices cp where cp.course_id = v_course.id;
  if v_price is null then
    return;
  end if;

  v_fr := $fr$Le pack complet pour te lancer comme artiste toothgems : le **GLOBAL™ PRO STUDIO KIT**, la formation **TOOTHGEMS MASTERCLASS** et **3 mois du Studio 3D en formule Artist**. Le matériel, la technique et l'outil pour présenter tes créations à tes clients — en une seule commande.

**Kit et formation achetés séparément : 930 €. Dans le pack : 837 €, soit 10 % de moins — et les 3 mois de Studio Artist sont offerts.**

### Ce que contient le pack

1. **GLOBAL™ PRO STUDIO KIT** — le kit professionnel complet, livré chez toi : matériel de précision, accessoires et consommables, dans une valise personnalisée Global Toothgems.
2. **TOOTHGEMS MASTERCLASS** — la formation en ligne de l'Academy : 11 modules, environ 4 heures de contenu, un certificat à la réussite. Accès ouvert dès le paiement confirmé, depuis ton compte.
3. **Studio 3D, formule Artist, pendant 3 mois** — ouvert dès le paiement confirmé, sur le même compte, sans abonnement ni carte enregistrée : rien ne se renouvelle tout seul.

### Inventaire du kit

- Contenu détaillé du GLOBAL™ PRO STUDIO KIT : [A COMPLÉTER]
- Valise personnalisée Global Toothgems

### Ce que la formation t'apporte

- Comprendre chaque étape du processus de pose et le rôle des différents produits utilisés.
- Sélectionner et positionner les bijoux selon la morphologie dentaire et le résultat recherché.
- Réaliser différents styles de compositions, des créations minimalistes aux designs plus élaborés.
- Identifier ce qui influence la tenue et la qualité finale d'une pose.
- Travailler avec précision pour un résultat propre, discret et esthétique.
- Créer des designs personnalisés adaptés à chaque client.
- Poser les bases d'une activité rentable : positionnement, tarifs, communication et expérience client.
- Gagner en assurance, en précision et en autonomie.

### Ce que le Studio 3D Artist t'apporte pendant 3 mois

- **Dessine tes poses en 3D** sur une dentition réaliste, avec les gemmes de la boutique à leur taille réelle.
- **Jusqu'à 150 créations et 30 Gem Groups** enregistrés, rangés dans des dossiers.
- **Les modèles Global Toothgems** : des créations prêtes à copier et à adapter.
- **Prépare tes rendez-vous** : vue de face, fiche de placement imprimable et estimation du coût des gemmes.
- **Publie tes créations** : images HD et vidéos à 360° signées de ton propre logo, export PNG sans fond.
- **Ta liste d'achats en un clic** : les gemmes d'une création ajoutées au panier.

Valeur de la formule Artist au tarif mensuel : 59,70 € pour 3 mois. Si tu as déjà un abonnement Studio, la formule la plus avantageuse s'applique pendant ces 3 mois. À la fin des 3 mois, tes créations restent dans ton compte et tu choisis librement de t'abonner ou non.

### Bon à savoir

- **Un compte est nécessaire** : la formation et le Studio s'ouvrent sur le compte qui passe la commande. Le pack n'est pas proposé en cadeau.
- **Un pack par commande.**
- Si tu suis déjà la Masterclass, ton accès reste tel quel ; le pack est proposé au même prix.
- Le pack est disponible tant que le kit professionnel est en stock.

**Ton savoir-faire, ton matériel, ta signature.** 🩵$fr$;

  v_en := $en$The complete pack to start out as a tooth gem artist: the **GLOBAL™ PRO STUDIO KIT**, the **TOOTHGEMS MASTERCLASS** course and **3 months of the 3D Studio on the Artist plan**. The tools, the technique and the app to present your designs to your clients — in a single order.

**Kit and course bought separately: €930. In the pack: €837, 10% less — and the 3 months of Studio Artist are included free.**

### What the pack contains

1. **GLOBAL™ PRO STUDIO KIT** — the complete professional kit, delivered to you: precision tools, accessories and consumables, in a custom Global Toothgems case.
2. **TOOTHGEMS MASTERCLASS** — the Academy's online course: 11 modules, about 4 hours of content, a certificate when you pass. Open as soon as the payment is confirmed, from your account.
3. **3D Studio, Artist plan, for 3 months** — open as soon as the payment is confirmed, on the same account, with no subscription and no saved card: nothing renews on its own.

### Kit inventory

- Detailed contents of the GLOBAL™ PRO STUDIO KIT: [A COMPLÉTER]
- Custom Global Toothgems case

### What the course gives you

- Understand each step of the application process and the role of the different products used.
- Select and position gems according to tooth morphology and the desired result.
- Create different styles of designs, from minimalist compositions to more elaborate ones.
- Identify what affects the durability and overall quality of an application.
- Work with precision for a clean, subtle and aesthetic finish.
- Create custom designs tailored to each client.
- Lay the foundations of a profitable business: positioning, pricing, communication and customer experience.
- Gain confidence, precision and independence.

### What the 3D Studio Artist plan gives you for 3 months

- **Design your applications in 3D** on a realistic set of teeth, with the shop's gems at their real size.
- **Up to 150 creations and 30 Gem Groups** saved, filed in folders.
- **The Global Toothgems templates**: ready-made designs to copy and adapt.
- **Prepare your appointments**: front view, printable placement sheet and an estimate of the gems' cost.
- **Post your designs**: HD images and 360° videos signed with your own logo, PNG export without a background.
- **Your shopping list in one click**: a design's gems added to the cart.

Value of the Artist plan at the monthly price: €59.70 for 3 months. If you already have a Studio subscription, the better plan applies during those 3 months. When the 3 months are over, your creations stay in your account and you decide freely whether to subscribe.

### Good to know

- **An account is required**: the course and the Studio open on the account that places the order. The pack is not offered as a gift.
- **One pack per order.**
- If you already follow the Masterclass, your access stays as it is; the pack is offered at the same price.
- The pack is available while the professional kit is in stock.

**Your know-how, your tools, your signature.** 🩵$en$;

  insert into public.products
    (category_id, family_id, product_type, name, slug, short_description, description, sku, price, currency,
     status, is_featured, metadata, meta_title, meta_description, weight_grams, tax_category)
  values
    (v_kit.category_id, v_kit.family_id, 'physical', 'GLOBAL™ PRO MASTER PACK', 'global-pro-master-pack',
     'Le kit professionnel, la Masterclass et 3 mois de Studio 3D Artist.', v_fr, 'GT-PRO-PACK-01', v_price, v_kit.currency,
     'draft', false,
     jsonb_build_object('tags', jsonb_build_array('KIT', 'PACK', 'FORMATION', 'STUDIO'), 'type', 'kit',
                        'color', null, 'shape', null, 'material', jsonb_build_object('fr', '', 'en', '')),
     'Pack pro toothgems : kit, formation et Studio 3D',
     'Le kit professionnel GLOBAL™, la formation TOOTHGEMS MASTERCLASS et 3 mois de Studio 3D Artist, 10 % moins cher que le kit et la formation séparés.',
     v_kit.weight_grams, v_kit.tax_category)
  returning id into v_pack;

  insert into public.product_translations
    (product_id, locale, name, slug, short_description, description, meta_title, meta_description, status)
  values
    (v_pack, 'en', 'GLOBAL™ PRO MASTER PACK', 'global-pro-master-pack',
     'The professional kit, the Masterclass and 3 months of 3D Studio Artist.', v_en,
     'Pro tooth gem pack: kit, course and 3D Studio',
     'The GLOBAL™ professional kit, the TOOTHGEMS MASTERCLASS course and 3 months of 3D Studio Artist, 10% less than the kit and the course bought separately.',
     'published');

  -- The kit's picture until a pack visual exists.
  insert into public.product_media (product_id, storage_path, media_type, alt_text, position, is_primary)
  select v_pack, m.storage_path, m.media_type, 'GLOBAL™ PRO MASTER PACK', 0, true
    from public.product_media m
   where m.product_id = v_kit.id and m.is_primary and m.variant_id is null
   limit 1;

  -- Stock: the professional kit's (decision 117).
  insert into public.inventory_items (product_id, quantity_on_hand) values (v_pack, 0);
  insert into public.product_bundle_items (bundle_product_id, component_product_id, quantity, position)
  values (v_pack, v_kit.id, 1, 0);
  perform private.refresh_bundle_stock(v_pack);

  -- What it grants (decision 127).
  insert into public.product_inclusions (product_id, kind, course_id, position)
  values (v_pack, 'course', v_course.id, 0);
  insert into public.product_inclusions (product_id, kind, studio_plan, studio_months, position)
  values (v_pack, 'studio', 'artist', 3, 1);
end;
$$;
