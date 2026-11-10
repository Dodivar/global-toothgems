# Checklist : ouverture de la boutique en ligne

Une phrase par point. Coche au fur et à mesure (`- [x]`).
⚠️ = à faire valider par le comptable ou un juriste.

## 1. Entreprise et compta

- [ ] Avoir un SIRET dont l'activité déclarée couvre la vente en ligne **et** la formation.
- [ ] Ouvrir un compte bancaire dédié à l'activité, obligatoire en micro-entreprise après 2 années de suite à plus de 10 000 € de chiffre d'affaires.
- [ ] Souscrire une assurance RC pro qui couvre la vente de produits **et** les formations.
- [ ] Tenir un livre des recettes et un registre des achats, et garder les factures 10 ans.
- [ ] Déclarer le chiffre d'affaires à l'URSSAF chaque mois ou chaque trimestre, et prévoir la CFE.
- [ ] Surveiller le plafond de la franchise de TVA (vers 85 000 € pour les ventes de marchandises ⚠️ à vérifier pour 2026), car au-delà la TVA française devient due.
- [ ] Se préparer à la facture électronique : depuis septembre 2026, il faut pouvoir **recevoir** des factures électroniques via une plateforme agréée, et l'émission sera obligatoire en septembre 2027.

## 2. TVA à l'international

- [ ] Au-delà de 10 000 € par an de ventes à des particuliers dans d'autres pays de l'UE, il faut facturer la TVA du pays du client et la déclarer via le guichet OSS (impots.gouv).
- [ ] Les abonnements Studio et les formations en ligne vendus à des particuliers de l'UE sont des « services électroniques » et comptent dans ces mêmes 10 000 €.
- [ ] Les ventes hors UE (Royaume-Uni, Suisse…) sont des exportations, avec une déclaration en douane (CN23) et d'éventuels droits payés par le client, à annoncer dans les CGV.

## 3. Obligations légales du site

- [ ] Adhérer à un **médiateur de la consommation** et afficher son nom et ses coordonnées dans les CGV et sur le site.
- [ ] Ne plus mettre de lien vers la plateforme européenne de règlement des litiges en ligne (RLL/ODR) : elle est supprimée depuis juillet 2025.
- [ ] Publier des mentions légales complètes : vendeur, éditeur, hébergeur (Vercel), SIRET.
- [ ] Faire relire par un juriste les CGV, les CGU et la politique de confidentialité.
- [ ] Afficher le droit de rétractation de 14 jours, avec le formulaire type, et les exceptions éventuelles (produits d'hygiène descellés ⚠️).
- [ ] Avoir une **fonction de rétractation en ligne** (un bouton clair), obligatoire pour les contrats conclus en ligne depuis le 19 juin 2026.
- [ ] Permettre de résilier l'abonnement Studio en quelques clics (« bouton résiliation »).
- [ ] Afficher la garantie légale de conformité (2 ans) et la garantie des vices cachés dans les CGV.
- [ ] Afficher les prix TTC et les frais de port avant la commande, et nommer le bouton final « Commande avec obligation de paiement » ou une formule équivalente.
- [ ] Pour toute promotion avec prix barré, prendre comme prix de référence le prix le plus bas des 30 derniers jours (directive Omnibus).
- [ ] Indiquer si les avis clients sont vérifiés et comment.
- [ ] Afficher les conditions des cartes cadeaux et du programme de fidélité (durée de validité, utilisation).

## 4. Données personnelles (RGPD)

- [ ] Avoir un bandeau cookies conforme CNIL, avec un bouton « Refuser » aussi visible que « Accepter », avant tout traceur PostHog.
- [ ] Tenir un registre des traitements (clients, élèves, abonnés Studio, photos de l'essai virtuel).
- [ ] Lister les sous-traitants et leurs transferts hors UE dans la politique de confidentialité : Supabase, Stripe, Resend, PostHog, Vercel, Google Gemini.
- [ ] Fixer et afficher la durée de conservation de chaque type de donnée ⚠️.
- [ ] Faire confirmer l'inscription à la newsletter, avec la désinscription en un clic.

## 5. Produits et emballages

- [ ] Respecter le règlement européen sur la sécurité des produits (GPSR) : fabricant ou importateur et avertissements sur chaque fiche produit.
- [ ] Vérifier le statut réglementaire des colles et composites (ils peuvent relever des dispositifs médicaux) ⚠️.
- [ ] S'inscrire à la filière REP emballages (Citeo ou Léko), afficher l'identifiant unique dans les CGV et l'info-tri sur les colis.

## 6. Formations (Academy)

- [ ] Vérifier s'il faut déclarer une activité d'organisme de formation (numéro de déclaration d'activité), obligatoire dès qu'on vend de la formation professionnelle à des pros ou des entreprises ⚠️.
- [ ] Ne pas présenter les certificats comme officiels ou reconnus par l'État : sans Qualiopi et sans RNCP, pas de financement CPF.

## 7. Technique

- [x] Paiement des commandes et des formations en mode test Stripe (migrations appliquées, commande de formation vérifiée le 10/11/2026).
- [ ] Passer Stripe en mode live : clés live, webhook live avec les événements `refund.*`, prix live des abonnements Studio.
- [ ] Désactiver les e-mails de factures et de reçus de Stripe, puisque c'est le site qui émet les factures.
- [ ] Faire valider par le comptable le format de numérotation des factures (`FA-`/`AV-`) et les mentions.
- [ ] Ajouter la modération (masquer, signaler, bloquer) avant d'ouvrir le salon des membres aux clients.
- [ ] Remplacer les champs `[A COMPLÉTER]` restants dans les fiches produits.
- [ ] Faire une commande test complète en mode live (produit, formation, carte cadeau) puis la rembourser.
