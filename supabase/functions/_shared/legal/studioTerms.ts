// Generated from webapp/src/data/legal/studioTerms.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import { LEGAL_PATHS } from "./routes.ts";
import { l, type LegalDocument } from "./types.ts";

/**
 * The version of these terms: the date they took effect (ISO). A Studio
 * subscription keeps the version in force when the member paid
 * (`consent_records.terms_version` on its `studio_immediate_access` row), and
 * the subscription confirmation e-mail carries this text as a PDF in this
 * version (decision 130). **Change it with any change to the text below**:
 * `termsDocument.test.ts` fails while the text's fingerprint and this version
 * disagree.
 */
export const STUDIO_TERMS_VERSION = "2026-11-11";

/**
 * Terms of the 3D Studio subscription ("conditions générales d'abonnement au
 * Studio 3D"), decision 133.
 *
 * The Studio is not sold by the shop's seller: it is sold, invoiced and
 * collected by the website publisher (DoDigital), on its own Stripe account and
 * with its own invoice series (FS-/AS-). The shop, the Academy and gift cards
 * stay under the terms of sale (`terms.ts`, the seller).
 *
 * The publisher's details are filled in by `storeFill.ts` from Settings › Store
 * through markers of their own (`[[!Vendeur du Studio…]]`), never the seller's,
 * so these terms can never name the wrong business. What stays to supply is the
 * publisher's consumer mediator.
 */

const PART = {
  general: l("Généralités", "General"),
  offer: l("L’offre", "The offer"),
  subscription: l("Abonnement et paiement", "Subscription and payment"),
  withdrawal: l("Rétractation", "Withdrawal"),
  use: l("Utilisation et responsabilité", "Use and liability"),
  disputes: l("Réclamations et litiges", "Complaints and disputes"),
};

export const STUDIO_TERMS: LegalDocument = {
  id: "studioTerms",
  path: LEGAL_PATHS.studioTerms,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Conditions générales d’abonnement au Studio 3D", "3D Studio subscription terms"),
  intro: l(
    "Les règles qui s’appliquent lorsque vous vous abonnez au Studio 3D de Global Toothgems : vendeur, formules, essai gratuit, paiement, renouvellement, résiliation, rétractation et factures.",
    "The rules that apply when you subscribe to the Global Toothgems 3D Studio: seller, plans, free trial, payment, renewal, cancellation, withdrawal and invoices.",
  ),
  updated: STUDIO_TERMS_VERSION,
  numbered: true,
  showKey: true,
  contactCategory: "technical",
  sections: [
    {
      id: "scope",
      part: PART.general,
      title: l("Champ d’application", "Scope"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les présentes conditions s’appliquent à tout abonnement au Studio 3D souscrit sur le site Global Toothgems. Elles sont acceptées au moment du paiement de l’abonnement. Les achats de produits, de formations de l’Academy et de cartes cadeaux sont régis par les <<conditions générales de vente|/conditions-generales>>, et l’utilisation du site par les <<conditions générales d’utilisation|/conditions-generales-utilisation>>.",
            "These terms apply to every 3D Studio subscription taken out on the Global Toothgems website. They are accepted when the subscription is paid. Purchases of products, Academy courses and gift cards are governed by the <<terms of sale|/conditions-generales>>, and use of the site by the <<terms of use|/conditions-generales-utilisation>>.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le Studio s’adresse aux particuliers comme aux professionnels (artistes, salons). Les règles propres aux consommateurs — droit de rétractation, médiation — bénéficient aux personnes qui s’abonnent à des fins non professionnelles.",
            "The Studio is for consumers and professionals (artists, salons) alike. The rules specific to consumers — right of withdrawal, mediation — benefit people who subscribe for non-professional purposes.",
          ),
        },
      ],
    },
    {
      id: "seller",
      part: PART.general,
      title: l("Identification du vendeur", "Seller identification"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le Studio 3D est vendu par l’éditeur du site, [[!Vendeur du Studio, dénomination et forme juridique]], dont le siège est situé [[!Adresse du vendeur du Studio]], immatriculé sous le numéro [[!Immatriculation du vendeur du Studio]]. C’est avec lui que le contrat d’abonnement est conclu : il encaisse les paiements et émet les factures de l’abonnement. Toutes les informations d’identification figurent dans les <<mentions légales|/mentions-legales>>.",
            "The 3D Studio is sold by the website publisher, [[!Studio seller legal name and entity type]], registered office at [[!Studio seller address]], registration number [[!Studio seller registration number]]. The subscription contract is concluded with it: it collects the payments and issues the subscription’s invoices. Full identification details are in the <<legal notice|/mentions-legales>>.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Les produits de la boutique, les formations et les cartes cadeaux sont vendus par une autre entreprise, nommée dans les conditions générales de vente : vos commandes et votre abonnement font donc l’objet de factures distinctes.",
            "Shop products, courses and gift cards are sold by another business, named in the terms of sale: your orders and your subscription are therefore invoiced separately.",
          ),
        },
      ],
    },
    {
      id: "service",
      part: PART.offer,
      title: l("Le Studio 3D", "The 3D Studio"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le Studio 3D est un outil en ligne qui permet de composer des créations de tooth gems en 3D, de les enregistrer, de les partager et, selon la formule, de les publier. Il est fourni en ligne, sans support matériel, depuis votre espace membre ; il nécessite un compte et un navigateur récent, et s’utilise de préférence sur tablette ou ordinateur.",
            "The 3D Studio is an online tool for composing tooth gem creations in 3D, saving them, sharing them and, depending on the plan, publishing them. It is provided online, without a tangible medium, from your member area; it requires an account and a recent browser, and is best used on a tablet or computer.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Les formules d’abonnement (Essential, Artist, Atelier), ce que chacune comprend (nombre de créations, fonctions, limites) et leur prix mensuel ou annuel sont présentés sur la <<page du Studio 3D|/studio-3d>> et rappelés avant le paiement.",
            "The subscription plans (Essential, Artist, Atelier), what each includes (number of creations, features, limits) and their monthly or yearly price are set out on the <<3D Studio page|/studio-3d>> and shown again before payment.",
          ),
        },
      ],
    },
    {
      id: "trial",
      part: PART.offer,
      title: l("Essai gratuit", "Free trial"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Chaque compte peut ouvrir une fois un essai gratuit de 48 heures, sans moyen de paiement. L’essai donne accès aux fonctions de la formule Essential. À sa fin, aucun abonnement n’est souscrit automatiquement : vos créations restent sur votre compte, et l’éditeur vous propose les formules.",
            "Each account can start a free 48-hour trial once, without a payment method. The trial gives access to the Essential plan’s features. When it ends, no subscription starts automatically: your creations stay on your account, and the editor offers you the plans.",
          ),
        },
      ],
    },
    {
      id: "prices",
      part: PART.offer,
      title: l("Prix et taxes", "Prices and taxes"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les prix sont indiqués en euros, pour la période choisie (mois ou année). La mention de TVA applicable est affichée à côté du prix : lorsque le vendeur relève de la franchise en base de TVA, elle est « TVA non applicable, art. 293 B du CGI » et le prix affiché est le prix à payer. Le prix applicable est celui affiché au moment du paiement.",
            "Prices are shown in euros, for the period chosen (month or year). The applicable VAT wording is shown next to the price: when the seller is under the VAT franchise scheme, it reads “TVA non applicable, art. 293 B du CGI” (VAT not applicable) and the price shown is the price to pay. The price that applies is the one displayed when you pay.",
          ),
        },
      ],
    },
    {
      id: "subscribing",
      part: PART.subscription,
      title: l("Souscription", "Subscribing"),
      blocks: [
        {
          kind: "list",
          ordered: true,
          items: [
            l("choix de la formule et de la période (mois ou année) ;", "choose the plan and the period (month or year);"),
            l("vérification du récapitulatif : formule, prix, renouvellement ;", "check the summary: plan, price, renewal;"),
            l(
              "demande d’accès immédiat et acceptation des présentes conditions, en cochant les cases prévues ;",
              "request immediate access and accept these terms, by ticking the boxes provided;",
            ),
            l("saisie de la carte et paiement.", "enter your card and pay."),
          ],
        },
        {
          kind: "p",
          text: l(
            "Après le paiement, le Studio s’ouvre et un e-mail de confirmation vous est envoyé : il reprend votre demande d’accès immédiat et joint les présentes conditions au format PDF, dans la version en vigueur au moment du paiement, avec la première facture.",
            "After payment, the Studio opens and a confirmation email is sent to you: it repeats your request for immediate access and attaches these terms as a PDF, in the version in force when you paid, with the first invoice.",
          ),
        },
      ],
    },
    {
      id: "payment",
      part: PART.subscription,
      title: l("Paiement", "Payment"),
      blocks: [
        {
          kind: "p",
          text: l(
            "L’abonnement se paie par carte bancaire, d’avance pour chaque période. Les cartes cadeaux, les codes de réduction et les récompenses du Club fidélité de la boutique ne s’appliquent pas au Studio.",
            "The subscription is paid by card, in advance for each period. The shop’s gift cards, discount codes and Loyalty Club rewards do not apply to the Studio.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le paiement est opéré par Stripe Payments Europe, Ltd. (Dublin, Irlande), établissement de paiement agréé. Vos données de carte sont saisies dans un formulaire sécurisé fourni par Stripe et intégré à notre page de paiement : elles sont transmises directement à Stripe et ne sont ni reçues ni conservées par le vendeur. La carte enregistrée est prélevée à chaque échéance ; vous pouvez la remplacer depuis <<Mon abonnement Studio|/compte/studio>>. Une authentification forte peut vous être demandée par votre banque.",
            "Payment is handled by Stripe Payments Europe, Ltd. (Dublin, Ireland), a licensed payment institution. Your card details are entered in a secure form provided by Stripe and embedded in our payment page: they go straight to Stripe and are neither received nor stored by the seller. The saved card is charged on each renewal date; you can replace it from <<My Studio subscription|/compte/studio>>. Your bank may ask for strong authentication.",
          ),
        },
      ],
    },
    {
      id: "renewal",
      part: PART.subscription,
      title: l("Renouvellement, changement de formule et résiliation", "Renewal, change of plan and cancellation"),
      blocks: [
        {
          kind: "list",
          items: [
            l(
              "L’abonnement se renouvelle automatiquement à la fin de chaque période (mois ou année), au prix en vigueur, jusqu’à sa résiliation.",
              "The subscription renews automatically at the end of each period (month or year), at the current price, until it is cancelled.",
            ),
            l(
              "Vous pouvez le résilier à tout moment depuis <<Mon abonnement Studio|/compte/studio>> : la résiliation prend effet à la fin de la période déjà payée, sans remboursement de celle-ci, et vous gardez l’accès jusque-là. Vous pouvez revenir sur votre résiliation tant que la période n’est pas terminée.",
              "You can cancel it at any time from <<My Studio subscription|/compte/studio>>: cancellation takes effect at the end of the period already paid, which is not refunded, and you keep access until then. You can undo the cancellation until the period ends.",
            ),
            l(
              "Un changement de formule prend effet immédiatement ; la différence de prix est calculée au prorata du temps restant et reportée sur la prochaine échéance.",
              "A change of plan takes effect immediately; the price difference is prorated over the time left and carried to the next payment.",
            ),
            l(
              "Si un paiement échoue, l’accès aux fonctions payantes peut être suspendu jusqu’à sa régularisation. Vos créations restent consultables.",
              "If a payment fails, access to paid features may be suspended until it is settled. Your creations remain viewable.",
            ),
          ],
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Une hausse de prix ou une modification des présentes conditions vous est annoncée par e-mail au moins 30 jours avant de s’appliquer à votre prochaine échéance ; vous pouvez résilier d’ici là.",
            "A price increase or a change to these terms is announced to you by email at least 30 days before it applies to your next renewal; you can cancel before then.",
          ),
        },
      ],
    },
    {
      id: "invoices",
      part: PART.subscription,
      title: l("Factures", "Invoices"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Chaque paiement donne lieu à une facture émise par le vendeur du Studio, dans sa propre numérotation ; un remboursement après rétractation donne lieu à un avoir. Ils sont envoyés par e-mail et téléchargeables à tout moment depuis <<Mon abonnement Studio|/compte/studio>>.",
            "Each payment gives rise to an invoice issued by the Studio’s seller, in its own numbering; a refund after withdrawal gives rise to a credit note. They are emailed to you and can be downloaded at any time from <<My Studio subscription|/compte/studio>>.",
          ),
        },
      ],
    },
    {
      id: "withdrawal",
      part: PART.withdrawal,
      title: l("Droit de rétractation", "Right of withdrawal"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Le consommateur dispose d’un délai de 14 jours à compter de la souscription pour se rétracter, sans avoir à se justifier ni à payer de pénalité (articles L221-18 et suivants du Code de la consommation).",
            "The consumer has 14 days from subscribing to withdraw, without giving a reason or paying a penalty (articles L221-18 et seq. of the French Consumer Code).",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Vous demandez expressément, au moment du paiement, que l’accès au Studio commence immédiatement, avant la fin du délai de rétractation. Si vous vous rétractez dans les 14 jours suivant la souscription, vous êtes remboursé du montant payé, diminué de la part correspondant aux jours d’accès déjà utilisés (article L221-25 du Code de la consommation), au plus tard 14 jours après votre décision, sur la carte utilisée.",
            "When paying, you expressly ask for access to the Studio to start immediately, before the withdrawal period ends. If you withdraw within 14 days of subscribing, you are refunded the amount paid, less the share corresponding to the days of access already used (article L221-25 of the French Consumer Code), no later than 14 days after your decision, to the card used.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Pour vous rétracter, utilisez le bouton prévu dans <<Mon abonnement Studio|/compte/studio>> : l’abonnement est arrêté, le remboursement calculé et un accusé de réception vous est envoyé par e-mail. Vous pouvez aussi nous adresser une déclaration claire via le <<formulaire de contact|/contact?sujet=technical>>, par e-mail à [[!E-mail du service client]], ou au moyen du modèle ci-dessous.",
            "To withdraw, use the button in <<My Studio subscription|/compte/studio>>: the subscription is stopped, the refund calculated and an acknowledgement emailed to you. You can also send us a clear statement through the <<contact form|/contact?sujet=technical>>, by email to [[!Customer service email]], or using the model below.",
          ),
        },
      ],
    },
    {
      id: "withdrawal-form",
      part: PART.withdrawal,
      title: l("Modèle de formulaire de rétractation", "Model withdrawal form"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat (annexe à l’article R221-1 du Code de la consommation).",
            "Please complete and return this form only if you wish to withdraw from the contract (annex to article R221-1 of the French Consumer Code).",
          ),
        },
        {
          kind: "list",
          items: [
            l(
              "À l’attention de [[!Vendeur du Studio, dénomination et forme juridique]], [[!Adresse du vendeur du Studio]], [[!E-mail du service client]] :",
              "To [[!Studio seller legal name and entity type]], [[!Studio seller address]], [[!Customer service email]]:",
            ),
            l(
              "Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la prestation de services ci-dessous : abonnement au Studio 3D",
              "I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service: 3D Studio subscription",
            ),
            l("Souscrit le :", "Subscribed on:"),
            l("Adresse e-mail du compte :", "Account email address:"),
            l("Nom du (des) consommateur(s) :", "Name of consumer(s):"),
            l("Adresse du (des) consommateur(s) :", "Address of consumer(s):"),
            l(
              "Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :",
              "Signature of consumer(s) (only if this form is notified on paper):",
            ),
            l("Date :", "Date:"),
          ],
        },
        { kind: "p", text: l("(*) Rayez la mention inutile.", "(*) Delete as appropriate.") },
      ],
    },
    {
      id: "use",
      part: PART.use,
      title: l("Utilisation du Studio et contenus", "Using the Studio and content"),
      blocks: [
        {
          kind: "p",
          text: l(
            "L’abonnement est personnel : il est rattaché à votre compte et ne peut être partagé. Les règles d’utilisation du Studio, des liens de partage et du Glowbook, ainsi que la modération des contenus publiés, sont décrites dans les <<conditions générales d’utilisation|/conditions-generales-utilisation>>. Vous restez titulaire des droits sur vos créations.",
            "The subscription is personal: it is tied to your account and cannot be shared. The rules for using the Studio, share links and the Glowbook, and the moderation of published content, are set out in the <<terms of use|/conditions-generales-utilisation>>. You keep the rights to your creations.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le Studio est un outil de visualisation : le rendu, y compris l’essai sur une photo de votre sourire, est indicatif et peut différer de la pose réelle (teinte, proportions, positionnement). Il ne remplace pas l’avis d’un professionnel.",
            "The Studio is a visualisation tool: its renders, including the try-on on a photo of your smile, are indicative and may differ from the real application (colour, proportions, placement). It does not replace a professional’s advice.",
          ),
        },
      ],
    },
    {
      id: "availability",
      part: PART.use,
      title: l("Disponibilité et évolution du service", "Availability and changes to the service"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le vendeur s’efforce de rendre le Studio accessible en permanence, sauf maintenance ou incident. Il peut faire évoluer ses fonctions ; une évolution qui réduit de façon importante ce que comprend votre formule vous est annoncée à l’avance et vous permet de résilier sans frais.",
            "The seller strives to keep the Studio available at all times, except for maintenance or incidents. It may change the Studio’s features; a change that significantly reduces what your plan includes is announced in advance and lets you cancel at no cost.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Le vendeur répond du défaut de conformité du service numérique dans les conditions des articles L224-25-12 et suivants du Code de la consommation : mise en conformité, ou, à défaut, réduction du prix ou résolution du contrat.",
            "The seller is liable for any lack of conformity of the digital service under articles L224-25-12 et seq. of the French Consumer Code: bringing it into conformity or, failing that, a price reduction or termination of the contract.",
          ),
        },
      ],
    },
    {
      id: "liability",
      part: PART.use,
      title: l("Responsabilité", "Liability"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le vendeur ne saurait être tenu responsable des dommages indirects, ni d’une perte de données due à une cause extérieure, sans préjudice des droits dont vous disposez en tant que consommateur. À l’égard d’un client professionnel, sa responsabilité est limitée aux sommes payées pour les douze derniers mois d’abonnement.",
            "The seller cannot be held liable for indirect damage, or for data loss due to an external cause, without prejudice to your rights as a consumer. Towards a professional customer, its liability is limited to the sums paid for the last twelve months of subscription.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Ces limites ne s’appliquent pas en cas de faute lourde ou intentionnelle, ni aux dommages corporels, et ne privent pas un consommateur des droits que la loi lui reconnaît.",
            "These limits do not apply to gross or intentional fault or to personal injury, and do not deprive a consumer of the rights the law gives them.",
          ),
        },
      ],
    },
    {
      id: "personal-data",
      part: PART.use,
      title: l("Données personnelles", "Personal data"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les données nécessaires à l’abonnement (compte, paiement, factures, créations) sont traitées par le vendeur du Studio. Leur utilisation et vos droits sont décrits dans la <<politique de confidentialité|/confidentialite>>.",
            "The data needed for the subscription (account, payment, invoices, creations) is processed by the Studio’s seller. How it is used and your rights are described in the <<privacy policy|/confidentialite>>.",
          ),
        },
      ],
    },
    {
      id: "complaints",
      part: PART.disputes,
      title: l("Service client et réclamations", "Customer service and complaints"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Pour toute question ou réclamation sur votre abonnement, contactez le service client via le <<formulaire de contact|/contact?sujet=technical>> ou à [[!E-mail du service client]].",
            "For any question or complaint about your subscription, contact customer service through the <<contact form|/contact?sujet=technical>> or at [[!Customer service email]].",
          ),
        },
      ],
    },
    {
      id: "mediation",
      part: PART.disputes,
      title: l("Médiation et règlement des litiges", "Mediation and dispute resolution"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Conformément aux articles L612-1 et suivants du Code de la consommation, le consommateur peut recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable d’un litige, après avoir adressé au service client une réclamation écrite restée sans réponse satisfaisante, et au plus tard un an après cette réclamation.",
            "In accordance with articles L612-1 et seq. of the French Consumer Code, the consumer can use a consumer mediator free of charge to resolve a dispute amicably, after sending customer service a written complaint that did not get a satisfactory answer, and no later than one year after that complaint.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Médiateur compétent : [[!Nom, adresse et site du médiateur de la consommation du vendeur du Studio]].",
            "Competent mediator: [[!Studio seller’s consumer mediator name, address and website]].",
          ),
        },
      ],
    },
    {
      id: "law",
      part: PART.disputes,
      title: l("Droit applicable et juridiction", "Applicable law and jurisdiction"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les présentes conditions sont soumises au droit français. À défaut de solution amiable, le litige sera porté devant les juridictions françaises compétentes ; entre professionnels, devant les tribunaux du ressort de Strasbourg.",
            "These terms are governed by French law. If no amicable solution is found, the dispute will be brought before the competent French courts; between professionals, before the courts of Strasbourg.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Ce choix ne peut priver un consommateur de la protection des règles impératives du pays où il réside habituellement, ni de la possibilité de saisir les juridictions de son lieu de domicile s’il réside dans l’Union européenne.",
            "This choice cannot deprive a consumer of the protection of the mandatory rules of the country where they habitually reside, nor of the possibility of bringing proceedings before the courts of the place where they live if they live in the European Union.",
          ),
        },
      ],
    },
    {
      id: "contact",
      part: PART.disputes,
      title: l("Coordonnées", "Contact information"),
      blocks: [
        {
          kind: "fields",
          fields: [
            { label: l("Vendeur", "Seller"), value: l("[[!Vendeur du Studio, dénomination et forme juridique]]", "[[!Studio seller legal name and entity type]]") },
            { label: l("Service client", "Customer service"), value: l("<<Formulaire de contact|/contact?sujet=technical>>", "<<Contact form|/contact?sujet=technical>>") },
            { label: l("E-mail", "Email"), value: l("[[!E-mail du service client]]", "[[!Customer service email]]") },
            { label: l("Adresse postale", "Postal address"), value: l("[[!Adresse du vendeur du Studio]]", "[[!Studio seller address]]") },
          ],
        },
      ],
    },
  ],
};
