-- =============================================================================
-- Product content review (owner's validation, 2026-10-28): titles, descriptions
-- and search-engine tags of the active catalogue.
--
-- What it does (data only, no schema change):
--   * meta_title / meta_description in French (products) and English
--     (product_translations) for every active product;
--   * a description in both languages for the products that had none (Navette,
--     Raindrop, Rivoli Star, Square, 18k gold, a few tools, lip gloss), a
--     unified description for the Swarovski® gems (same structure, one sentence
--     per shape, one hygiene line), the English text of the tools, kits and lip
--     glosses that had none;
--   * fixes: Sapphire / Light Rose / Crystal AB colours, "untis", stray capitals,
--     the CLEO text that sat in the English column, "his tooth shape";
--   * names: "Coeur" -> "Cœur", accents on the 18k gold names, EN names of the
--     gold pieces, "Sapphire- Baguette" and similar; the French slug of CLEO
--     moves from global-lipgloss-nova to global-lipgloss-cleo (old address: 404,
--     decision 37; the shop is not launched).
--   * what is not known yet is written "[A COMPLÉTER]" in the text, to be found
--     with: select name from products where description like '%A COMPLÉTER%'.
--
-- Search-engine titles carry no brand: the site appends " · Global Toothgems".
-- Rows are matched by their current French slug; the migration can be re-run.
-- =============================================================================

create temp table _fiche (
  slug     text primary key,
  new_slug text,
  fr_name  text,
  en_name  text,
  fr_desc  text,
  en_desc  text,
  fr_mt    text,
  fr_md    text,
  en_mt    text,
  en_md    text
) on commit drop;

-- ---------------------------------------------------------------------------
-- 1. Swarovski® gems: names, descriptions and tags from the shape and colour.
-- ---------------------------------------------------------------------------
with shape(tok, fr_label, en_label, fr_title, en_title, size_fr, size_en, qty_fr, qty_en, s_fr, s_en) as (
  values
  ('Baguette', 'baguette', 'baguette', 'Baguette', 'Baguette', '3,7 × 1,9 mm', '3.7 × 1.9 mm', '10', '10',
    'Sa forme allongée et rectangulaire se pose à plat pour dessiner une ligne ou souligner une courbe.',
    'Its elongated rectangular shape sits flat to draw a line or follow a curve.'),
  ('Coeur', 'cœur', 'heart', 'Cœur', 'Heart', '3,6 mm', '3.6 mm', '10 ou 25', '10 or 25',
    'Une forme romantique et facile à porter, idéale pour un motif discret ou un premier tooth gem.',
    'A romantic, easy-to-wear shape, ideal for a discreet design or a first tooth gem.'),
  ('Diamond Shape', 'diamond shape', 'diamond shape', 'Diamond Shape', 'Diamond Shape', '3 × 5 mm', '3 × 5 mm', '10', '10',
    'Une taille en losange aux facettes marquées, pour un éclat net et graphique.',
    'A diamond cut with defined facets for a sharp, graphic sparkle.'),
  ('Navette', 'navette', 'navette', 'Navette', 'Navette', null, null, null, null,
    'Une forme ovale effilée aux deux extrémités, élégante pour allonger un motif.',
    'An oval shape tapered at both ends, elegant for lengthening a design.'),
  ('Raindrop', 'raindrop', 'raindrop', 'Raindrop', 'Raindrop', null, null, null, null,
    'Une forme en goutte, pour un effet délicat et fluide.',
    'A drop shape for a delicate, fluid effect.'),
  ('Rivoli Star', 'rivoli star', 'rivoli star', 'Rivoli Star', 'Rivoli Star', null, null, null, null,
    'Un cristal rond aux facettes en étoile. [A COMPLÉTER : description de la taille]',
    'A round crystal with star-shaped facets. [A COMPLÉTER: cut description]'),
  ('Square', 'square', 'square', 'Square', 'Square', null, null, null, null,
    'Une forme carrée, nette et moderne.',
    'A clean, modern square shape.'),
  ('StarFlower', 'starflower', 'starflower', 'StarFlower', 'StarFlower', '4 mm', '4 mm', '10 ou 25', '10 or 25',
    'Une fleur étoilée aux facettes raffinées, pour une touche délicate et lumineuse.',
    'A starflower with refined facets for a delicate, luminous touch.')
),
src as (
  select p.slug,
         (select count(*) from public.product_variants v where v.product_id = p.id) as nv,
         regexp_match(p.name, '^SWAROVSKI® (?:- )?(Baguette|Coeur|Diamond Shape|Navette|Raindrop|Rivoli Star|Square|StarFlower) - (.+)$') as fm,
         regexp_match(t.name, '^SWAROVSKI® (.+?) ?- (Baguette|Heart|Diamond Shape|Navette|Raindrop|Rivoli Star|Square|StarFlower)$', 'i') as em
    from public.products p
    join public.product_translations t on t.product_id = p.id and t.locale = 'en'
   where p.status = 'active' and p.name like 'SWAROVSKI®%'
),
calc as (
  select s.slug, s.nv, sh.*, s.fm[2] as fr_raw,
         replace(replace(replace(s.fm[2], 'Crystal shimmer', 'Crystal Shimmer'), 'Golden shadow', 'Golden Shadow'), 'Emeraude', 'Émeraude') as fr_col,
         replace(s.em[1], 'Golden shadow', 'Golden Shadow') as en_col
    from src s
    join shape sh on sh.tok = s.fm[1]
),
calc2 as (
  select c.*,
         replace(replace(replace(lower(c.fr_raw), 'crystal ab', 'crystal AB'), 'blackdiamond', 'black diamond'), 'emeraude', 'émeraude') as fr_c,
         replace(replace(lower(c.en_col), 'crystal ab', 'crystal AB'), 'blackdiamond', 'black diamond') as en_c,
         case when c.nv > 0 then '10 ou 25' else c.qty_fr end as q_fr,
         case when c.nv > 0 then '10 or 25' else c.qty_en end as q_en
    from calc c
)
insert into _fiche (slug, fr_name, en_name, fr_desc, en_desc, fr_mt, fr_md, en_mt, en_md)
select c.slug,
       'SWAROVSKI® ' || c.fr_title || ' - ' || c.fr_col,
       'SWAROVSKI® ' || c.en_col || ' - ' || c.en_title,
       'Cristal Swarovski® ' || c.fr_label || ' ' || c.fr_c || E', pour la pose de bijoux dentaires (tooth gems).\n\n'
         || c.s_fr
         || E'\n\nDétails du produit\nForme : ' || c.fr_label
         || E'\nCouleur : ' || c.fr_c
         || E'\nTaille : ' || coalesce(c.size_fr, '[A COMPLÉTER]')
         || E'\nQuantité : ' || coalesce(c.q_fr || ' pièces par lot', '[A COMPLÉTER]')
         || E'\nQualité : cristaux Swarovski® sans plomb\n\n'
         || 'Hygiène et sécurité : pour des raisons d’hygiène et de sécurité, aucun échange ni retour n’est accepté.',
       'Swarovski® ' || c.en_label || ' crystal in ' || c.en_c || E', for tooth gem application.\n\n'
         || c.s_en
         || E'\n\nProduct details\nShape: ' || c.en_label
         || E'\nColor: ' || c.en_c
         || E'\nSize: ' || coalesce(c.size_en, '[A COMPLÉTER]')
         || E'\nQuantity: ' || coalesce(c.q_en || ' pieces per pack', '[A COMPLÉTER]')
         || E'\nQuality: lead-free Swarovski® crystals\n\n'
         || 'Hygiene and safety: for hygiene and safety reasons, exchanges and returns are not accepted.',
       case when c.size_fr is not null and char_length('Strass dentaire Swarovski® ' || c.fr_title || ' ' || c.fr_col || ' – ' || c.size_fr) <= 70
            then 'Strass dentaire Swarovski® ' || c.fr_title || ' ' || c.fr_col || ' – ' || c.size_fr
            else 'Strass dentaire Swarovski® ' || c.fr_title || ' ' || c.fr_col end,
       'Strass dentaire Swarovski® ' || c.fr_label || ' ' || c.fr_c
         || case when c.size_fr is not null then ' (' || c.size_fr || ')' else '' end
         || case when c.q_fr is not null then ', lot de ' || c.q_fr else '' end
         || '. Cristal sans plomb pour bijou dentaire. Global Toothgems.',
       case when c.size_en is not null and char_length('Swarovski® ' || c.en_title || ' Tooth Gem – ' || c.en_col || ', ' || c.size_en) <= 70
            then 'Swarovski® ' || c.en_title || ' Tooth Gem – ' || c.en_col || ', ' || c.size_en
            else 'Swarovski® ' || c.en_title || ' Tooth Gem – ' || c.en_col end,
       'Swarovski® ' || c.en_label || ' tooth gem in ' || c.en_c
         || case when c.size_en is not null then ' (' || c.size_en || ')' else '' end
         || case when c.q_en is not null then ', pack of ' || c.q_en else '' end
         || '. Lead-free crystal for dental jewelry. Global Toothgems.'
  from calc2 c;

-- ---------------------------------------------------------------------------
-- 2. 18k gold pieces.
-- ---------------------------------------------------------------------------
with gold(slug, fr_name, en_name, fr_form, en_form, fr_of, fr_title, s_fr, s_en) as (
  values
  ('cerises-en-or-18ct', 'Cerises en or 18 carats', '18k Gold Cherry', 'cerises', 'cherry', 'de cerises', 'Cerises',
    'Un motif de cerises ludique et gourmand.', 'A playful, mouth-watering cherry motif.'),
  ('coeur-ouvert-en-or-18ct', 'Cœur ouvert en or 18 carats', '18k Gold Open Heart', 'cœur ouvert', 'open heart', 'de cœur ouvert', 'Cœur ouvert',
    'Un cœur évidé, léger et lumineux.', 'A hollow heart, light and bright.'),
  ('eclair-en-or-18ct', 'Éclair en or 18 carats', '18k Gold Lightning Bolt', 'éclair', 'lightning bolt', 'd’éclair', 'Éclair',
    'Un éclair graphique pour un look affirmé.', 'A graphic lightning bolt for a bold look.'),
  ('etoile-halo-or-18ct', 'Étoile halo en or 18 carats', '18k Gold Halo Star', 'étoile halo', 'halo star', 'd’étoile halo', 'Étoile halo',
    'Une étoile entourée d’un halo délicat.', 'A star surrounded by a delicate halo.'),
  ('serpent-en-or-18ct', 'Serpent en or 18 carats', '18k Gold Snake', 'serpent', 'snake', 'de serpent', 'Serpent',
    'Un serpent sinueux, pour une touche audacieuse.', 'A sinuous snake for a bold touch.'),
  ('teckel-en-or-18ct', 'Teckel en or 18 carats', '18k Gold Dachshund', 'teckel', 'dachshund', 'de teckel', 'Teckel',
    'Un teckel en or, pour les amoureux des chiens et des motifs originaux.', 'A gold dachshund, for dog lovers and original designs.')
)
insert into _fiche (slug, fr_name, en_name, fr_desc, en_desc, fr_mt, fr_md, en_mt, en_md)
select g.slug, g.fr_name, g.en_name,
       'Bijou dentaire ' || g.fr_form || E' en or 18 carats.\n\n' || g.s_fr
         || E' Disponible en or jaune ou en or blanc.\n\nDétails du produit\nMatière : or 18 carats\nTitre et poinçon : [A COMPLÉTER]'
         || E'\nFinition : or jaune ou or blanc\nTaille : [A COMPLÉTER]\nConditionnement : [A COMPLÉTER]\n\n'
         || 'Hygiène et sécurité : pour des raisons d’hygiène et de sécurité, aucun échange ni retour n’est accepté.',
       '18k gold ' || g.en_form || E' tooth gem.\n\n' || g.s_en
         || E' Available in yellow or white gold.\n\nProduct details\nMaterial: 18k gold\nFineness and hallmark: [A COMPLÉTER]'
         || E'\nFinish: yellow or white gold\nSize: [A COMPLÉTER]\nPackaging: [A COMPLÉTER]\n\n'
         || 'Hygiene and safety: for hygiene and safety reasons, exchanges and returns are not accepted.',
       'Bijou dentaire ' || g.fr_title || ' en or 18 carats',
       'Bijou dentaire en or 18 carats en forme ' || g.fr_of || ', en or jaune ou or blanc. À poser sur la dent. Global Toothgems.',
       '18k Gold ' || initcap(g.en_form) || ' Tooth Gem',
       '18k gold ' || g.en_form || ' tooth gem, in yellow or white gold. Dental jewelry by Global Toothgems.'
  from gold g;

-- ---------------------------------------------------------------------------
-- 3. Cœur Chrome, tools, lip glosses, kits, gift card (explicit texts).
-- ---------------------------------------------------------------------------
insert into _fiche (slug, fr_mt, fr_md, en_mt, en_md) values
('coeur-chrome',
 'Strass dentaire Cœur Chrome – finition miroir',
 'Strass dentaire en forme de cœur, alliage chromé hypoallergénique à la finition miroir. Un classique lumineux. Global Toothgems.',
 'Chrome Heart Tooth Gem – Mirror Finish',
 'Heart-shaped tooth gem in hypoallergenic chrome alloy with a mirror finish. A bright classic. Global Toothgems.'),
('carte-cadeau',
 'Carte cadeau Global Toothgems',
 'Offrez une carte cadeau livrée par e-mail, à dépenser en une ou plusieurs fois sur les gems, kits et formations éligibles.',
 'Global Toothgems Gift Card',
 'Give a gift card delivered by email, to spend in one go or several times on eligible gems, kits and trainings.');

insert into _fiche (slug, new_slug, fr_name, en_name, fr_desc, en_desc, fr_mt, fr_md, en_mt, en_md) values
('pince-de-precision', null, null, 'Precision Tweezers', null,
 $d$**Every detail counts. Precision leaves nothing to chance.**

At Global Toothgems, choosing your tools is an essential step. That is why we designed this tool for the specific demands of placing dental jewelry.

Its fine shape and comfortable grip allow meticulous work, suited to handling small crystals that demand delicacy, control and precision.

Made of stainless steel, these tweezers offer excellent durability and resistance to support your professional practice.

Because dental gems are real little jewels, every gesture counts. We paid particular attention to choosing this tool so you can achieve neat, harmonious placements.

**At Global Toothgems, nothing is left to chance.** Every tool is chosen with intention: to offer you equipment suited to your art and the precision it demands.

_GLOBAL TOOTHGEMS — Everything your art deserves._ 🩵$d$,
 'Pince de précision pour strass dentaires',
 'Pince fine en acier inoxydable pour manipuler et positionner les strass dentaires avec précision. Global Toothgems.',
 'Precision Tweezers for Tooth Gems',
 'Fine stainless steel tweezers to handle and place tooth gems with precision. Global Toothgems.'),
('godet', null, null, null, null,
 $d$Its faceted design and crystal-clear transparency make your workspace look good, while its small size keeps it ergonomic. Thick walls and a sturdy base give it a glossy, premium finish.$d$,
 'Godet dentaire facetté',
 'Godet transparent facetté, compact et robuste, pour un espace de travail ergonomique. Global Toothgems.',
 'Faceted Dappen Dish',
 'Clear faceted dappen dish, compact and sturdy, for an ergonomic workspace. Global Toothgems.'),
('lampe-dentaire-a-photopolymeriser', null, null, null, null,
 $d$**LED curing light – Global Toothgems**

Combine precision and convenience with our LED curing light, designed to support your dental jewelry application. ✨

Its ergonomic design, digital display and control buttons make it intuitive to use. Cordless and supplied with a charging stand, it fits easily into your workspace.

Available in silver or black, it carries the elegant, technical identity of Global Toothgems.

Specifications:

**_Certification_**: CE

**_Optical power_**: 1500 mW/cm² [A COMPLÉTER : valeur à confirmer]

**_Spectrum_**: 440-480 nm

**_Charger input_**: AC 100 ~ 240 V, 50/60 Hz

**_Colors_**: silver, black$d$,
 'Lampe LED de photopolymérisation sans fil',
 'Lampe LED sans fil avec socle de recharge, écran digital, certifiée CE, pour la pose de bijoux dentaires. Argenté ou noir.',
 'Cordless LED Curing Light',
 'Cordless LED curing light with charging stand, digital display and CE certification, for dental jewelry application. Silver or black.'),
('applicateurs-a-pointe-de-cire', null, null, null, null,
 $d$Our wax-tip applicators make it easier to handle and position rhinestones with delicacy.

Their adhesive tip picks up small crystals so you can move them around more easily while composing your designs, for smoother, more comfortable and more controlled work.

**A real comfort gain:** handling the rhinestones is easier, and the risk of dropping or losing small jewels while handling them can be reduced.$d$,
 'Applicateurs à pointe de cire pour strass dentaires',
 'Applicateurs à pointe adhésive pour saisir et placer facilement les petits cristaux lors de la composition de vos designs.',
 'Wax-Tip Applicators for Tooth Gems',
 'Adhesive-tip applicators to pick up and place small crystals easily when composing your designs. Global Toothgems.'),
('global-microbrosses-bond', null, null, null, null,
 $d$Designed to support every step of your work, Global Toothgems micro-applicators are essential comfort and precision accessories for your workspace.

Their tip allows targeted application of products, intended for bond and primer, and makes the amount deposited easier to control. Their practical format and single use help keep your equipment rigorously organized.

Supplied in a clear dispenser containing **100 blue micro-applicators**, they are easy to identify and to use every day.

**Features:**

- **Contents:** 100 micro-applicators
- **Color:** blue
- **Use:** targeted application of bond and primer
- **Single use**$d$,
 'Microbrosses bond – 100 pièces',
 '100 micro-applicateurs bleus à usage unique pour appliquer le bond et le primer avec précision. Global Toothgems.',
 'Bond Microbrushes – 100 Pieces',
 '100 single-use blue micro-applicators for precise bond and primer application. Global Toothgems.'),
('global-microbrosses-finitions', null, null, null, null,
 $d$Designed to support every step of your work, Global Toothgems micro-applicators are essential comfort and precision accessories for your workspace.

Their carefully selected ultra-fine tip allows a clean, polished finish. Their practical format and single use help keep your equipment rigorously organized.

Supplied in a clear dispenser containing **100 white micro-applicators**, they are easy to identify and to use every day.

**Features:**

- **Contents:** 100 micro-applicators
- **Color:** white
- **Use:** targeted application for a perfect finish
- **Single use**$d$,
 'Microbrosses finitions – 100 pièces',
 '100 micro-applicateurs blancs à embout ultra fin pour des finitions propres. Usage unique. Global Toothgems.',
 'Finishing Microbrushes – 100 Pieces',
 '100 single-use white micro-applicators with an ultra-fine tip for clean finishes. Global Toothgems.'),
('cotons-tiges-a-double-embout', null, null, null,
 $d$Cotons-tiges à double embout, pratiques pour nettoyer et préparer la zone de travail avant la pose. Un indispensable de ton espace de travail.

Contenu : [A COMPLÉTER]$d$,
 $d$Double-ended cotton swabs, handy for cleaning and preparing the work area before application. A workspace essential.

Contents: [A COMPLÉTER]$d$,
 'Cotons-tiges à double embout',
 'Cotons-tiges à double embout pour le nettoyage et la préparation en cabine. Global Toothgems.',
 'Double-Ended Cotton Swabs',
 'Double-ended cotton swabs for cleaning and preparation in the studio. Global Toothgems.'),
('lunettes-de-protection', null, null, null,
 $d$Lunettes de protection pour accompagner chaque pose et protéger les yeux de la lumière de la lampe de photopolymérisation.

Caractéristiques : [A COMPLÉTER]$d$,
 $d$Protective glasses to wear for every application, shielding the eyes from the light of the curing lamp.

Features: [A COMPLÉTER]$d$,
 'Lunettes de protection pour la pose de tooth gems',
 'Lunettes de protection pour accompagner chaque pose de bijoux dentaires. Global Toothgems.',
 'Protective Glasses for Tooth Gem Application',
 'Protective glasses to wear for every dental jewelry application. Global Toothgems.'),
('organisateur-de-bijoux', null, null, null,
 $d$Organisateur pour ranger et trier tes strass et bijoux dentaires, avec un accès rapide pendant la pose.

Dimensions et compartiments : [A COMPLÉTER]$d$,
 $d$Organizer to store and sort your gems and dental jewelry, with quick access during application.

Dimensions and compartments: [A COMPLÉTER]$d$,
 'Organisateur de bijoux dentaires',
 'Organisateur pour ranger et trier tes strass et bijoux dentaires, avec un accès rapide pendant la pose. Global Toothgems.',
 'Dental Jewelry Organizer',
 'Organizer to store and sort your gems and dental jewelry, with quick access during application. Global Toothgems.'),
('miroir-hot-people-have-tooth-gems', null, null, null,
 $d$*The mirror made for people who love to shine.* ✦

Un miroir compact au design iconique, pensé pour accompagner tous tes looks beauté et tes créations Toothgems. Son format pratique permet de vérifier facilement chaque détail de ton sourire, avec une touche Y2K & glam.

Avec son inscription « HOT PEOPLE HAVE TOOTH GEMS » et sa forme de dent, c’est bien plus qu’un simple miroir : un véritable accessoire de la culture Toothgems.

Disponible en rose et bleu glacé.$d$,
 $d$The mirror made for people who love to shine. ✦

A compact mirror with an iconic design, created to complement every beauty look and Toothgems creation. Its practical size makes it perfect for checking every detail of your smile, while adding a true Y2K & glam touch to your space.

Featuring the statement “HOT PEOPLE HAVE TOOTH GEMS” and its tooth shape, this is more than just a mirror — it’s a true accessory for the Toothgems culture.

Available in pink and ice blue.$d$,
 'Miroir compact HOT PEOPLE HAVE TOOTH GEMS™',
 'Miroir de poche en forme de dent, rose ou bleu glacé, pour vérifier chaque détail de ton sourire. Global Toothgems.',
 'HOT PEOPLE HAVE TOOTH GEMS™ Compact Mirror',
 'Tooth-shaped compact mirror in pink or ice blue, to check every detail of your smile. Global Toothgems.'),
('global-lipgloss-aurora', null, null, null, null,
 $d$**Silver glow. Endless shine.**

Meet _AURORA_, a clear gloss enhanced with fine silver glitter that catches the light for a bright, sophisticated shine.

Its sparkling finish dresses the lips in a glossy veil with silver reflections, between icy elegance and crystalline light. A touch of freshness to light up your smile and add a precious dimension to your look.

Wear it alone for a subtle, luminous effect, or layer it to intensify the shine.$d$,
 'Global Lipgloss™ AURORA – gloss pailleté argenté',
 'Gloss transparent à paillettes argentées, à porter seul ou en superposition pour un éclat lumineux. Global Toothgems.',
 'Global Lipgloss™ AURORA – Silver Glitter Gloss',
 'Clear lip gloss with silver glitter, to wear alone or layered for a luminous shine. Global Toothgems.'),
('global-lipgloss-bad-habit', null, null, null,
 $d$**[A COMPLÉTER : accroche]**

Découvre _BAD HABIT_, un gloss transparent parsemé de paillettes multicolores aux reflets irisés, pour un effet holographique captivant.

À porter seul ou en superposition, selon tes envies et ton mood du jour.

Contenance : [A COMPLÉTER]$d$,
 $d$**[A COMPLÉTER: tagline]**

Meet _BAD HABIT_, a clear gloss with multicolor glitter and iridescent reflections for a captivating holographic effect.

Wear it alone or layered, depending on your mood.

Volume: [A COMPLÉTER]$d$,
 'Global Lipgloss™ BAD HABIT – gloss multicolore',
 'Gloss transparent à paillettes multicolores aux reflets irisés, pour un effet holographique. Global Toothgems.',
 'Global Lipgloss™ BAD HABIT – Multicolor Gloss',
 'Clear lip gloss with multicolor glitter and iridescent reflections for a holographic effect. Global Toothgems.'),
('global-lipgloss-trio', null, null, null, null,
 $d$**Three shades. Three ways to shine. One signature glow.**

Meet the Global Lipgloss™ trio, a collection of three clear glosses with sparkling finishes, designed to enhance your lips and light up every look.

**AURORA** — silver, crystalline shine for an icy, luminous gloss.

**CLEO** — golden and champagne reflections for a warm, sunny touch.

**BAD HABIT** — multicolor glitter with iridescent reflections for a captivating holographic effect.

Three worlds, three ways to play with light. Wear them alone or layered, depending on your mood.

**Your glow, your rules, your signature.** 🩵$d$,
 'Global Lipgloss™ TRIO – 3 gloss pailletés',
 'Le trio Global Lipgloss™ : AURORA, CLEO et BAD HABIT, trois gloss transparents aux finis scintillants. Global Toothgems.',
 'Global Lipgloss™ TRIO – 3 Glitter Glosses',
 'The Global Lipgloss™ trio: AURORA, CLEO and BAD HABIT, three clear glosses with sparkling finishes. Global Toothgems.'),
('global-diy-home-kit', null, null, null, null,
 $d$The world of tooth gems, right at home.

Discover our DIY kit, designed to guide you step by step with a simple, accessible approach.

**A customizable kit, built around your wishes!**

Presented in a custom Global Toothgems case, this kit gathers a selection of quality tools and accessories to help you create your best smile.

Approximate duration: 1 month or more (duration varies with oral condition and other factors).

_The primer and adhesive are supplied in glass bottles; store them in a dark, cool, dry place (do not expose to artificial light or sunlight, as it may dry out the product)._

**Kit contents:** [A COMPLÉTER]

**FOR HOME USE, NOT PROFESSIONAL USE.**

**FOR HYGIENE AND SAFETY REASONS, NO EXCHANGES OR RETURNS ARE ACCEPTED.**$d$,
 'Kit DIY tooth gem à faire chez soi',
 'Kit pas à pas pour poser un strass dentaire à la maison, dans une valise Global Toothgems. Usage domestique.',
 'DIY Tooth Gem Kit for Home Use',
 'Step-by-step kit to apply a tooth gem at home, in a Global Toothgems case. For home use.'),
('global-pro-studio-kit', null, null, null, null,
 $d$Everything you need to go professional and bring your dental jewelry creations to life.

A complete professional kit, designed to support your practice and bring together the essentials for your applications: precision tools, accessories and consumables, all in a custom Global Toothgems case.

**Kit contents:** [A COMPLÉTER]

**Your know-how, your tools, your signature.** 🩵$d$,
 'Kit professionnel de pose de bijoux dentaires',
 'Kit complet pour te professionnaliser : matériel de précision, accessoires et consommables dans une valise Global Toothgems.',
 'Professional Dental Jewelry Kit',
 'Complete kit to go professional: precision tools, accessories and consumables in a Global Toothgems case.'),
('kit-application-premium', null, null, null, null, null,
 'Kit d’application premium pour pose en cabine',
 'Mordançage, adhésif, composite fluide, applicateurs, écarteurs et 20 cristaux pour une pose professionnelle en cabine.',
 'Premium Application Kit for Studio Use',
 'Etchant, adhesive, flowable composite, applicators, retractors and 20 crystals for a professional in-studio application.');

-- Lip gloss CLEO: the French text sat in the English column (the French column
-- was empty); the English is new, and the French address follows the name.
insert into _fiche (slug, new_slug, fr_desc, en_desc, fr_mt, fr_md, en_mt, en_md)
select p.slug, 'global-lipgloss-cleo',
       case when coalesce(p.description, '') = '' then t.description end,
       $d$**Golden glow. Effortless glamour.**

Meet CLEO, a clear gloss enhanced with golden glitter that catches the light for a warm, luminous, precious shine.

Its sparkling finish dresses the lips in a glossy veil with champagne and golden reflections, a touch of light evoking the sun and timeless elegance.

Wear it alone for a subtle luminous effect, or layer it to intensify the shine and add a glamorous touch to your look.$d$,
       'Global Lipgloss™ CLEO – gloss pailleté doré',
       'Gloss transparent à paillettes dorées aux reflets champagne, à porter seul ou en superposition. Global Toothgems.',
       'Global Lipgloss™ CLEO – Golden Glitter Gloss',
       'Clear lip gloss with golden glitter and champagne reflections, to wear alone or layered. Global Toothgems.'
  from public.products p
  join public.product_translations t on t.product_id = p.id and t.locale = 'en'
 where p.slug in ('global-lipgloss-nova', 'global-lipgloss-cleo');

-- ---------------------------------------------------------------------------
-- 4. Apply. NULL in _fiche = leave the column as it is.
-- ---------------------------------------------------------------------------
update public.products p
   set name             = coalesce(f.fr_name, p.name),
       description      = coalesce(f.fr_desc, p.description),
       meta_title       = coalesce(f.fr_mt, p.meta_title),
       meta_description = coalesce(f.fr_md, p.meta_description),
       slug             = coalesce(f.new_slug, p.slug)
  from _fiche f
 where p.slug = f.slug;

-- The lamp's French power line (a typing slip, "1500 mw / pc㎡").
update public.products
   set description = replace(description, '1500 mw / pc㎡', '1500 mW/cm² [A COMPLÉTER : valeur à confirmer]')
 where slug = 'lampe-dentaire-a-photopolymeriser' and description like '%1500 mw / pc㎡%';

-- The kits' French text lists no contents yet.
update public.products
   set description = replace(description, '**POUR USAGE DOMESTIQUE', E'**Contenu du kit :** [A COMPLÉTER]\n\n**POUR USAGE DOMESTIQUE')
 where slug = 'global-diy-home-kit' and description not like '%Contenu du kit%';
update public.products
   set description = description || E'\n\n**Contenu du kit :** [A COMPLÉTER]'
 where slug = 'global-pro-studio-kit' and description not like '%Contenu du kit%';

update public.product_translations t
   set name             = coalesce(f.en_name, t.name),
       description      = coalesce(f.en_desc, t.description),
       meta_title       = coalesce(f.en_mt, t.meta_title),
       meta_description = coalesce(f.en_md, t.meta_description)
  from _fiche f
  join public.products p on p.slug = coalesce(f.new_slug, f.slug)
 where t.product_id = p.id and t.locale = 'en';
