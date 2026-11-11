// Generated from webapp/src/data/legal/terms.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import { lp } from "./policies.ts";
import { LEGAL_PATHS } from "./routes.ts";
import { l, type LegalDocument } from "./types.ts";

/**
 * The version of these terms: the date they took effect (ISO). Every order
 * keeps the version in force when it was placed (`orders.terms_version`), a
 * and each order confirmation e-mail carries this text as a PDF in this
 * version (decision 130). The 3D Studio has terms of its own, sold by the
 * publisher (`studioTerms.ts`, decision 135). **Change it with
 * any change to the text below**: `termsDocument.test.ts` fails while the
 * text's fingerprint and this version disagree.
 */
export const TERMS_OF_SALE_VERSION = "2026-11-11";

/**
 * Terms of sale ("conditions générales de vente").
 *
 * Three kinds of statement are kept apart on purpose:
 * - `legal` callouts summarise the French and EU consumer-law rules that apply
 *   whatever the shop decides;
 * - `policy` callouts are the shop's own choices (`policies.ts`), set on
 *   2026-11-08 with the owner's go-ahead, to validate (decision 126);
 * - `[[!...]]` marks business information to supply: the store's details are
 *   filled in by `storeFill.ts`; what stays is the consumer mediator.
 */

const PART = {
  general: l("Généralités", "General"),
  products: l("Produits et prix", "Products and prices"),
  ordering: l("Commande", "Ordering"),
  payment: l("Paiement", "Payment"),
  offers: l("Cartes cadeaux", "Gift cards"),
  withdrawal: l("Annulation, rétractation et retours", "Cancellation, withdrawal and returns"),
  delivery: l("Livraison", "Delivery"),
  guarantees: l("Garanties et responsabilité", "Guarantees and liability"),
  rights: l("Droits et données", "Rights and data"),
  disputes: l("Réclamations et litiges", "Complaints and disputes"),
};

export const TERMS: LegalDocument = {
  id: "terms",
  path: LEGAL_PATHS.terms,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Conditions générales de vente", "Terms of sale"),
  intro: l(
    "Les règles qui s’appliquent lorsque vous achetez des produits, des formations ou des cartes cadeaux sur Global Toothgems : commande, paiement, livraison, rétractation, retours et garanties.",
    "The rules that apply when you buy products, courses or gift cards on Global Toothgems: ordering, payment, delivery, withdrawal, returns and guarantees.",
  ),
  updated: TERMS_OF_SALE_VERSION,
  numbered: true,
  showKey: true,
  contactCategory: "order",
  lead: [
    // Editor's note, never published: Completed on 8 November 2026 with workable rules, to be validated by the business (decision 126). Still to supply: the consumer mediator. Courses are sold with the express waiver of the right of withdrawal ticked at the checkout (decision 128). To have a lawyer review before launch: the products’ regulatory status.
  ],
  sections: [
    {
      id: "scope",
      part: PART.general,
      title: l("Champ d’application", "Scope"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les présentes conditions s’appliquent à toute commande passée sur le site Global Toothgems : produits physiques (gems, outils, kits, produits de suivi), formations en ligne de l’Academy et cartes cadeaux. Elles sont acceptées au moment de la validation de la commande.",
            "These terms apply to every order placed on the Global Toothgems website: physical products (gems, tools, kits, aftercare products), Academy online courses and gift cards. They are accepted when the order is confirmed.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Les abonnements au Studio 3D ne sont pas régis par les présentes conditions : ils sont vendus par l’éditeur du site, [[!Vendeur du Studio, dénomination et forme juridique]], selon les <<conditions générales d’abonnement au Studio 3D|/conditions-abonnement-studio>>.",
            "3D Studio subscriptions are not governed by these terms: they are sold by the website publisher, [[!Studio seller legal name and entity type]], under the <<3D Studio subscription terms|/conditions-abonnement-studio>>.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le site vend aux particuliers comme aux professionnels (artistes, salons). Les règles propres aux consommateurs — droit de rétractation, garanties légales du Code de la consommation, médiation — bénéficient aux personnes qui achètent à des fins non professionnelles. Un professionnel qui achète pour son activité ne bénéficie pas du droit de rétractation ; les garanties du Code civil s’appliquent à ses achats.",
            "The site sells to consumers and to professionals (artists, salons) alike. The rules specific to consumers — right of withdrawal, the Consumer Code’s legal guarantees, mediation — benefit people buying for non-professional purposes. A professional buying for their business has no right of withdrawal; the Civil Code’s guarantees apply to their purchases.",
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
            "Les ventes sont conclues avec [[!Dénomination et forme juridique]], dont le siège est situé [[!Adresse du siège]], immatriculée sous le numéro [[!Numéro d’immatriculation]]. Toutes les informations d’identification figurent dans les <<mentions légales|/mentions-legales>>.",
            "Sales are concluded with [[!Legal name and entity type]], registered office at [[!Registered office address]], registration number [[!Registration number]]. Full identification details are in the <<legal notice|/mentions-legales>>.",
          ),
        },
      ],
    },
    {
      id: "products",
      part: PART.products,
      title: l("Produits et descriptions", "Products and product descriptions"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Chaque fiche produit présente les caractéristiques essentielles du produit : matière, forme, dimensions, couleur, contenu du lot et, le cas échéant, précautions d’usage. Les photos sont aussi fidèles que possible ; de légères variations de teinte peuvent exister selon l’écran.",
            "Each product page sets out the product’s essential characteristics: material, shape, size, colour, pack contents and, where relevant, precautions for use. Photos are as faithful as possible; slight colour differences can occur between screens.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Certains produits (adhésifs, composites, outils de pose) sont destinés à des personnes formées à la pose ; leur fiche le précise. Il vous appartient de respecter les précautions d’emploi indiquées sur chaque fiche.",
            "Some products (adhesives, composites, application tools) are intended for people trained in application; their page says so. It is up to you to follow the precautions for use given on each product page.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Les pages de formation décrivent le programme, le format, la durée d’accès et les conditions de validation de chaque formation.",
            "Course pages describe each course’s programme, format, access duration and completion requirements.",
          ),
        },
      ],
    },
    {
      id: "availability",
      part: PART.products,
      title: l("Disponibilité", "Product availability"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les produits sont proposés dans la limite des stocks disponibles, affichés sur chaque fiche ; ils sont réservés pendant le paiement. Si un produit commandé s’avère malgré tout indisponible, nous vous en informons sans délai et vous proposons, à votre choix, d’attendre son réassort ou d’être remboursé. Tout montant payé pour un produit indisponible est remboursé au plus tard 14 jours après le paiement.",
            "Products are offered while stocks last, as shown on each product page; they are reserved during payment. If an ordered product nevertheless turns out to be unavailable, we will tell you promptly and offer, as you prefer, to wait for it to be restocked or to be refunded. Any amount paid for an unavailable product is refunded no later than 14 days after payment.",
          ),
        },
      ],
    },
    {
      id: "prices",
      part: PART.products,
      title: l("Prix et taxes", "Prices and taxes"),
      blocks: [
        {
          kind: "p",
          text: lp(
            (p) =>
              `Les prix sont indiqués en ${p.currency}. TVA non applicable, art. 293 B du CGI : le vendeur relève de la franchise en base de TVA, aucune TVA n’est facturée et les prix affichés sont les prix à payer. Les frais de livraison sont affichés séparément avant la validation de la commande. Le prix applicable est celui affiché au moment de la commande.`,
            (p) =>
              `Prices are shown in ${p.currency}. VAT not applicable, article 293 B of the French General Tax Code (“TVA non applicable, art. 293 B du CGI”): the seller is under the VAT franchise scheme, no VAT is charged and the prices shown are the prices to pay. Delivery costs are shown separately before the order is confirmed. The price that applies is the one displayed when you order.`,
          ),
        },
        {
          kind: "p",
          text: l(
            "Pour une livraison hors de l’Union européenne, les droits de douane et taxes à l’importation éventuels ne sont pas compris dans le prix (voir « Droits de douane et taxes à l’importation »).",
            "For deliveries outside the European Union, any customs duties and import taxes are not included in the price (see “Customs duties and import taxes”).",
          ),
        },
      ],
    },
    {
      id: "ordering",
      part: PART.ordering,
      title: l("Processus de commande", "Ordering process"),
      blocks: [
        { kind: "p", text: l("Une commande se passe en quelques étapes :", "An order is placed in a few steps:") },
        {
          kind: "list",
          ordered: true,
          items: [
            l("ajout des produits ou formations au panier ;", "add products or courses to your cart;"),
            l("vérification du panier, des quantités et du total ;", "review your cart, quantities and total;"),
            l("saisie ou confirmation des informations de livraison et de facturation ;", "enter or confirm delivery and billing details;"),
            l("choix du mode de livraison et affichage des frais ;", "choose a delivery method and see its cost;"),
            l("acceptation des présentes conditions et paiement.", "accept these terms and pay."),
          ],
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Avant de payer, vous pouvez vérifier le détail de votre commande et corriger d’éventuelles erreurs. Le bouton de paiement indique clairement que la commande implique une obligation de payer.",
            "Before you pay, you can check the details of your order and correct any mistakes. The payment button states clearly that the order involves an obligation to pay.",
          ),
        },
      ],
    },
    {
      id: "account",
      part: PART.ordering,
      title: l("Création de compte", "Account creation"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les produits physiques et les cartes cadeaux peuvent être commandés sans compte, avec votre seule adresse e-mail. Un compte est nécessaire pour acheter une formation, et pour retrouver vos commandes, vos formations et vos attestations. Vous êtes responsable de la confidentialité de vos identifiants.",
            "Physical products and gift cards can be ordered without an account, with just your email address. An account is needed to buy a course, and to find your orders, courses and certificates. You are responsible for keeping your login details confidential.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Créez votre compte depuis la page <<Inscription|/inscription>>. En cas d’usage non autorisé de votre compte, changez votre mot de passe depuis <<Sécurité et confidentialité|/compte/securite>> et contactez-nous.",
            "Create your account from the <<Sign up|/inscription>> page. If your account is used without your permission, change your password in <<Security & privacy|/compte/securite>> and contact us.",
          ),
        },
      ],
    },
    {
      id: "confirmation",
      part: PART.ordering,
      title: l("Confirmation de commande", "Order confirmation"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Après le paiement, un récapitulatif s’affiche et un e-mail de confirmation vous est envoyé, avec le détail de la commande et les prix. Les présentes conditions générales de vente y sont jointes au format PDF, dans la version en vigueur à la date de votre commande, pour que vous puissiez les conserver et les reproduire. La facture est disponible dans <<Mes commandes|/compte/commandes>> ou sur simple demande. La commande est considérée comme confirmée à réception de la confirmation de paiement par notre prestataire.",
            "After payment, a summary is shown and a confirmation email is sent to you, with the order details and prices. These terms of sale are attached to it as a PDF, in the version in force on the date of your order, so that you can keep and reproduce them. The invoice is available in <<My orders|/compte/commandes>> or on request. The order is considered confirmed once our payment provider confirms the payment.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Pas d’e-mail après quelques minutes ? Vérifiez vos courriers indésirables, puis consultez <<Mes commandes|/compte/commandes>>.",
            "No email after a few minutes? Check your spam folder, then look in <<My orders|/compte/commandes>>.",
          ),
        },
      ],
    },
    {
      id: "payment-methods",
      part: PART.payment,
      title: l("Moyens de paiement", "Payment methods"),
      blocks: [
        {
          kind: "p",
          text: lp(
            (p) =>
              `Les moyens de paiement acceptés sont affichés sur la page de paiement : ${p.paymentMethods}. Une carte cadeau Global Toothgems peut régler tout ou partie d’une commande. Le paiement est exigible immédiatement à la commande.`,
            (p) =>
              `Accepted payment methods are shown on the payment page: ${p.paymentMethods}. A Global Toothgems gift card can pay for all or part of an order. Payment is due immediately on ordering.`,
          ),
        },
      ],
    },
    {
      id: "payment-security",
      part: PART.payment,
      title: l("Sécurité des paiements", "Payment security"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les paiements sont chiffrés et traités par un prestataire de paiement spécialisé. Une authentification forte (par exemple une validation dans l’application de votre banque) peut vous être demandée par votre banque.",
            "Payments are encrypted and processed by a specialist payment provider. Your bank may ask for strong authentication (for example approval in your banking app).",
          ),
        },
      ],
    },
    {
      id: "stripe",
      part: PART.payment,
      title: l("Prestataire de paiement (Stripe)", "Payment processor (Stripe)"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le paiement est opéré par Stripe Payments Europe, Ltd. (Dublin, Irlande), établissement de paiement agréé. Vos données de carte sont saisies dans un formulaire sécurisé fourni par Stripe et intégré à notre page de paiement : elles sont transmises directement à Stripe et ne sont ni reçues ni conservées par Global Toothgems.",
            "Payment is handled by Stripe Payments Europe, Ltd. (Dublin, Ireland), a licensed payment institution. Your card details are entered in a secure form provided by Stripe and embedded in our payment page: they go straight to Stripe and are neither received nor stored by Global Toothgems.",
          ),
        },
      ],
    },
    {
      id: "gift-cards",
      part: PART.offers,
      title: l("Cartes cadeaux", "Gift cards"),
      blocks: [
        {
          kind: "p",
          text: l(
            "La carte cadeau est envoyée par e-mail à la personne choisie, à la date choisie. Elle est valable 12 mois à compter de son émission, s’utilise en une ou plusieurs fois sur la boutique et l’Academy, et son solde restant est indiqué dans le panier. Elle ne peut être échangée contre de l’argent ni remboursée une fois utilisée ; un solde non utilisé à la date d’expiration est perdu.",
            "The gift card is emailed to the person chosen, on the date chosen. It is valid for 12 months from issue, can be used in one or several goes on the shop and the Academy, and its remaining balance is shown in the cart. It cannot be exchanged for cash or refunded once used; any balance left unused on the expiry date is lost.",
          ),
        },
      ],
    },
    {
      id: "cancellation",
      part: PART.withdrawal,
      title: l("Annulation de commande", "Order cancellation"),
      blocks: [
        {
          kind: "callout",
          tone: "policy",
          text: lp(
            (p) =>
              `Vous pouvez demander l’annulation d’une commande de produits tant qu’elle n’a pas été expédiée, c’est-à-dire ${p.cancellationStage}. Une commande annulée est remboursée intégralement, frais de livraison compris.`,
            (p) =>
              `You can ask to cancel an order of products as long as it has not shipped, that is ${p.cancellationStage}. A cancelled order is refunded in full, delivery costs included.`,
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Contactez-nous au plus vite via le <<formulaire de contact|/contact?sujet=order>> en indiquant votre numéro de commande.",
            "Contact us as soon as possible through the <<contact form|/contact?sujet=order>>, quoting your order number.",
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
            "Pour un achat à distance, le consommateur dispose d’un délai de 14 jours pour se rétracter, sans avoir à se justifier ni à payer de pénalité (articles L221-18 et suivants du Code de la consommation). Pour un produit, ce délai court à partir de la réception (du dernier article, en cas de livraison en plusieurs colis) ; pour une formation ou une carte cadeau, à partir de la conclusion du contrat.",
            "For a distance purchase, the consumer has 14 days to withdraw, without giving a reason or paying a penalty (articles L221-18 et seq. of the French Consumer Code). For goods, the period runs from receipt (of the last item, when delivered in several parcels); for a course or a gift card, from the conclusion of the contract.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: lp(
            (p) =>
              `Délai appliqué par Global Toothgems pour les produits : ${p.returnPeriod}. Pour une formation ou une carte cadeau non utilisée : 14 jours à compter de l’achat.`,
            (p) => `Period applied by Global Toothgems for products: ${p.returnPeriod}. For a course or an unused gift card: 14 days from purchase.`,
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Pour exercer ce droit, informez-nous de votre décision par une déclaration claire avant la fin du délai : via le <<formulaire de contact|/contact?sujet=returns>>, par e-mail à [[!E-mail du service client]], ou en nous envoyant le modèle de formulaire de rétractation ci-dessous.",
            "To exercise this right, tell us of your decision with a clear statement before the period ends: through the <<contact form|/contact?sujet=returns>>, by email to [[!Customer service email]], or by sending us the model withdrawal form below.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          title: l("Fonction de rétractation en ligne", "Online withdrawal function"),
          text: l(
            "Pour les produits, une fonction de rétractation en ligne gratuite est disponible pendant tout le délai (article L221-21 du Code de la consommation) : sur la page de la commande dans <<Mes commandes|/compte/commandes>> (« Se rétracter du contrat ici ») ou, pour une commande passée sans compte, sur la page <<Se rétracter d’une commande|/retours-remboursements/retractation>>, après réception d’un lien envoyé à l’adresse e-mail de la commande. Vous indiquez votre nom, la commande et les articles concernés (rétractation totale ou partielle), puis confirmez par « Confirmer la rétractation ». Nous accusons réception sans délai, par e-mail, du contenu de votre déclaration ainsi que de sa date et de son heure.",
            "For products, a free online withdrawal function is available throughout the period (article L221-21 of the French Consumer Code): on the order’s page in <<My orders|/compte/commandes>> (“Withdraw from the contract here”) or, for an order placed without an account, on the <<Withdraw from an order|/retours-remboursements/retractation>> page, after receiving a link sent to the order’s e-mail address. You give your name, the order and the items concerned (full or partial withdrawal), then confirm with “Confirm withdrawal”. We acknowledge receipt without delay, by e-mail, with the content of your declaration and its date and time.",
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
              "À l’attention de [[!Dénomination et forme juridique]], [[!Adresse du siège]], [[!E-mail du service client]] :",
              "To [[!Legal name and entity type]], [[!Registered office address]], [[!Customer service email]]:",
            ),
            l(
              "Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la vente du bien (*)/pour la prestation de services (*) ci-dessous :",
              "I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract of sale of the following goods (*)/for the provision of the following service (*):",
            ),
            l("Commandé le (*)/reçu le (*) :", "Ordered on (*)/received on (*):"),
            l("Numéro de commande :", "Order number:"),
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
      id: "withdrawal-exceptions",
      part: PART.withdrawal,
      title: l("Exceptions au droit de rétractation", "Exceptions to the right of withdrawal"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l("La loi prévoit des exceptions (article L221-28 du Code de la consommation), notamment :", "The law provides for exceptions (article L221-28 of the French Consumer Code), including:"),
          items: [
            l(
              "les biens scellés qui ne peuvent être renvoyés pour des raisons d’hygiène ou de protection de la santé, s’ils ont été descellés après la livraison ;",
              "sealed goods that cannot be returned for health-protection or hygiene reasons, if unsealed after delivery;",
            ),
            l("les biens confectionnés selon les spécifications du client ou nettement personnalisés ;", "goods made to the customer’s specifications or clearly personalised;"),
            l(
              "les contenus numériques fournis sans support matériel dont l’exécution a commencé avec votre accord exprès et votre reconnaissance de la perte du droit de rétractation.",
              "digital content not supplied on a tangible medium, once performance has begun with your express consent and your acknowledgement that you lose the right of withdrawal.",
            ),
          ],
        },
        {
          kind: "callout",
          tone: "policy",
          text: lp(
            (p) =>
              `Produits concernés chez Global Toothgems, pour des raisons d’hygiène : ${p.excludedGoods}. Les produits personnalisés à votre demande sont également exclus. Une formation en ligne est un contenu numérique : au paiement, vous demandez l’accès immédiat et renoncez expressément à votre droit de rétractation, que vous perdez dès que vous ouvrez une première leçon. Tant qu’aucune leçon n’est ouverte, vous pouvez vous rétracter pendant 14 jours à compter de l’achat.`,
            (p) =>
              `Products concerned at Global Toothgems, for hygiene reasons: ${p.excludedGoods}. Products personalised at your request are also excluded. An online course is digital content: when paying, you ask for immediate access and expressly waive your right of withdrawal, which you lose as soon as you open a first lesson. As long as no lesson has been opened, you can withdraw for 14 days from purchase.`,
          ),
        },
      ],
    },
    {
      id: "returns",
      part: PART.withdrawal,
      title: l("Retours", "Returns"),
      blocks: [
        {
          kind: "p",
          text: lp(
            (p) =>
              `Les produits doivent être renvoyés complets, dans leur emballage d’origine et dans un état permettant leur remise en vente, au plus tard ${p.returnShipDeadline} après nous avoir informés de votre décision. La procédure détaillée figure sur la page <<Retours et remboursements|/retours-remboursements>>.`,
            (p) =>
              `Products must be returned complete, in their original packaging and in a resaleable condition, no later than ${p.returnShipDeadline} after telling us of your decision. The step-by-step procedure is on the <<Returns & refunds|/retours-remboursements>> page.`,
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Votre responsabilité peut être engagée en cas de dépréciation du produit résultant de manipulations autres que celles nécessaires pour en établir la nature, les caractéristiques et le bon fonctionnement : le remboursement est alors diminué de cette dépréciation.",
            "You may be liable for any loss in value resulting from handling the product beyond what is needed to establish its nature, characteristics and functioning: the refund is then reduced by that loss in value.",
          ),
        },
      ],
    },
    {
      id: "refunds",
      part: PART.withdrawal,
      title: l("Remboursements", "Refunds"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "En cas de rétractation, le remboursement de toutes les sommes versées, y compris les frais de livraison standard initiaux, intervient au plus tard 14 jours après que nous avons été informés de votre décision. Il peut être différé jusqu’à la réception des produits ou de la preuve de leur expédition. Il est effectué avec le moyen de paiement utilisé lors de la commande, sauf accord contraire.",
            "If you withdraw, all sums paid, including the initial standard delivery cost, are refunded no later than 14 days after we are informed of your decision. The refund may be withheld until we receive the products or proof they were sent. It is made using the payment method used for the order, unless agreed otherwise.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: lp(
            (p) =>
              `Délai de traitement habituel : ${p.refundProcessing}, dans la limite légale de 14 jours. Seuls les articles renvoyés sont remboursés ; les frais de livraison initiaux le sont lorsque toute la commande est retournée, à hauteur du tarif de livraison standard (le supplément d’une livraison express n’est pas remboursé).`,
            (p) =>
              `Usual processing time: ${p.refundProcessing}, within the legal limit of 14 days. Only the items sent back are refunded; the initial delivery cost is refunded when the whole order is returned, up to the standard delivery rate (the extra cost of express delivery is not refunded).`,
          ),
        },
      ],
    },
    {
      id: "return-costs",
      part: PART.withdrawal,
      title: l("Frais de retour", "Return shipping costs"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Sauf si le vendeur accepte de les prendre en charge, ou s’il n’a pas informé le client qu’ils sont à sa charge, les frais directs de renvoi dans le cadre d’une rétractation sont à la charge du consommateur.",
            "Unless the seller agrees to cover them, or failed to tell the customer they would bear them, the direct cost of returning goods after withdrawal is borne by the consumer.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: lp(
            (p) => `Choix de Global Toothgems : en cas de rétractation, ${p.returnCosts}. Pour un produit défectueux, endommagé ou non conforme, les frais de retour sont à notre charge.`,
            (p) => `Global Toothgems’ choice: if you withdraw, ${p.returnCosts}. For a defective, damaged or non-conforming product, return costs are on us.`,
          ),
        },
      ],
    },
    {
      id: "delivery-methods",
      part: PART.delivery,
      title: l("Modes de livraison", "Delivery methods"),
      blocks: [
        {
          kind: "p",
          text: lp(
            (p) =>
              `Les modes de livraison disponibles (standard, express, livraison offerte selon le montant), leurs tarifs et délais sont présentés avant le paiement et sur la page <<Livraison|/livraison>>. Les colis sont confiés à ${p.carriers}, avec un numéro de suivi.`,
            (p) =>
              `The delivery methods available (standard, express, free delivery depending on the amount), their prices and times are shown before payment and on the <<Shipping & delivery|/livraison>> page. Parcels are handed to ${p.carriers}, with a tracking number.`,
          ),
        },
        {
          kind: "p",
          text: l(
            "Les formations en ligne ne sont pas expédiées : elles sont accessibles depuis votre espace membre dès confirmation du paiement. Les cartes cadeaux sont envoyées par e-mail.",
            "Online courses are not shipped: they are available from your member area as soon as payment is confirmed. Gift cards are sent by email.",
          ),
        },
      ],
    },
    {
      id: "delivery-times",
      part: PART.delivery,
      title: l("Délais de livraison", "Delivery times"),
      blocks: [
        {
          kind: "p",
          text: lp(
            (p) =>
              `Le délai de livraison indiqué lors de la commande comprend le délai de préparation (${p.preparationTime}) et le délai d’acheminement du transporteur, qui dépend de la zone et du mode choisi (voir la page <<Livraison|/livraison#methods>>).`,
            (p) =>
              `The delivery time shown when you order includes preparation time (${p.preparationTime}) and the carrier’s transit time, which depends on the zone and the method chosen (see the <<Shipping & delivery|/livraison#methods>> page).`,
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "À défaut de date convenue, le vendeur doit livrer sans retard injustifié et au plus tard 30 jours après la conclusion du contrat.",
            "Where no date has been agreed, the seller must deliver without undue delay and no later than 30 days after the contract is concluded.",
          ),
        },
      ],
    },
    {
      id: "delivery-delays",
      part: PART.delivery,
      title: l("Retards de livraison", "Delivery delays"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Si la livraison n’a pas lieu dans le délai convenu, vous pouvez nous demander de livrer dans un délai supplémentaire raisonnable ; à défaut, vous pouvez résoudre le contrat et être remboursé.",
            "If delivery does not happen within the agreed time, you can ask us to deliver within a reasonable additional period; failing that, you can terminate the contract and be refunded.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Colis en retard ? Consultez d’abord le suivi, puis signalez-le-nous via le <<formulaire de contact|/contact?sujet=delivery>>.",
            "Parcel running late? Check tracking first, then report it through the <<contact form|/contact?sujet=delivery>>.",
          ),
        },
      ],
    },
    {
      id: "international",
      part: PART.delivery,
      title: l("Livraison internationale", "International shipping"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous livrons en France et à Monaco, dans l’Union européenne, en Suisse et au Liechtenstein, au Royaume-Uni, aux États-Unis et au Canada. La liste à jour figure sur la page <<Livraison|/livraison#destinations>>. Certains produits peuvent être soumis à des restrictions d’importation selon le pays de destination.",
            "We deliver to France and Monaco, the European Union, Switzerland and Liechtenstein, the United Kingdom, the United States and Canada. The up-to-date list is on the <<Shipping & delivery|/livraison#destinations>> page. Some products may be subject to import restrictions depending on the destination country.",
          ),
        },
      ],
    },
    {
      id: "customs",
      part: PART.delivery,
      title: l("Droits de douane et taxes à l’importation", "Customs duties and import taxes"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Pour une livraison hors de l’Union européenne, des droits de douane, une TVA locale et des frais de dédouanement peuvent être exigés par les autorités du pays de destination.",
            "For deliveries outside the European Union, customs duties, local VAT and clearance fees may be charged by the destination country’s authorities.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "Qui les paie : le destinataire, à la livraison ; ils ne sont pas inclus dans le prix payé sur le site. Un colis refusé pour ce motif nous revient : nous remboursons alors les produits, sans les frais de livraison ni les frais de retour facturés par le transporteur.",
            "Who pays them: the recipient, on delivery; they are not included in the price paid on the site. A parcel refused for this reason comes back to us: we then refund the products, without the delivery cost or the return charges billed by the carrier.",
          ),
        },
      ],
    },
    {
      id: "risk",
      part: PART.delivery,
      title: l("Transfert des risques", "Transfer of risk"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Pour un consommateur, le risque de perte ou d’endommagement des produits est transféré au moment où il (ou un tiers qu’il a désigné, autre que le transporteur) prend physiquement possession des produits.",
            "For a consumer, the risk of loss or damage to the goods passes when they (or a third party they designated, other than the carrier) take physical possession of the goods.",
          ),
        },
      ],
    },
    {
      id: "conformity",
      part: PART.guarantees,
      title: l("Conformité et garanties légales", "Product conformity and legal guarantees"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          title: l("Garantie légale de conformité", "Legal guarantee of conformity"),
          text: l(
            "Le consommateur dispose d’un délai de deux ans à compter de la délivrance du bien pour obtenir la mise en œuvre de la garantie légale de conformité en cas d’apparition d’un défaut de conformité (articles L217-3 et suivants du Code de la consommation). Durant ce délai, il n’est tenu d’établir que l’existence du défaut, non la date de son apparition. Il a droit à la réparation ou au remplacement du bien dans un délai de trente jours suivant sa demande, sans frais et sans inconvénient majeur ; à défaut, à une réduction du prix ou à la résolution du contrat. Le bien réparé dans le cadre de cette garantie bénéficie d’une extension de garantie de six mois.",
            "The consumer has two years from delivery of the goods to obtain the legal guarantee of conformity when a lack of conformity appears (articles L217-3 et seq. of the French Consumer Code). During that period, they need only show that the defect exists, not when it appeared. They are entitled to repair or replacement within thirty days of their request, free of charge and without major inconvenience; failing that, to a price reduction or termination of the contract. Goods repaired under this guarantee get a six-month extension of it.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          title: l("Garantie des vices cachés", "Guarantee against hidden defects"),
          text: l(
            "Le consommateur bénéficie également de la garantie des vices cachés (articles 1641 à 1649 du Code civil), pendant deux ans à compter de la découverte du vice : il peut alors choisir entre la résolution de la vente et une réduction du prix.",
            "The consumer also benefits from the guarantee against hidden defects (articles 1641 to 1649 of the French Civil Code), for two years from discovery of the defect: they can then choose between cancelling the sale and a price reduction.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Global Toothgems ne propose pas de garantie commerciale en plus de ces garanties légales. Pour les mettre en œuvre, <<contactez-nous|/contact?sujet=returns>> avec votre numéro de commande et une photo du défaut.",
            "Global Toothgems offers no commercial warranty on top of these legal guarantees. To use them, <<contact us|/contact?sujet=returns>> with your order number and a photo of the defect.",
          ),
        },
      ],
    },
    {
      id: "liability",
      part: PART.guarantees,
      title: l("Responsabilité", "Liability"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les produits doivent être utilisés conformément à leur fiche et aux consignes de pose et de sécurité enseignées. Global Toothgems ne saurait être tenu responsable d’un dommage résultant d’un usage non conforme, ni des dommages indirects, sans préjudice des droits dont vous disposez en tant que consommateur. À l’égard d’un client professionnel, notre responsabilité est limitée au montant de la commande concernée.",
            "Products must be used according to their product page and the application and safety guidance taught. Global Toothgems cannot be held liable for damage resulting from improper use, or for indirect damage, without prejudice to your rights as a consumer. Towards a professional customer, our liability is limited to the amount of the order concerned.",
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
      id: "force-majeure",
      part: PART.guarantees,
      title: l("Force majeure", "Force majeure"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Aucune des parties n’est responsable d’un manquement causé par un événement échappant à son contrôle, imprévisible et irrésistible au sens de l’article 1218 du Code civil. Nous vous informerons dans les meilleurs délais et vous proposerons une solution, y compris un remboursement si la commande ne peut être exécutée.",
            "Neither party is liable for a failure caused by an event beyond its control, unforeseeable and unavoidable within the meaning of article 1218 of the French Civil Code. We will inform you as soon as possible and offer a solution, including a refund if the order cannot be fulfilled.",
          ),
        },
      ],
    },
    {
      id: "ip",
      part: PART.rights,
      title: l("Propriété intellectuelle", "Intellectual property"),
      blocks: [
        {
          kind: "p",
          text: lp(
            (p) =>
              `L’achat d’une formation vous donne un droit d’accès personnel et non transférable, pendant ${p.courseAccess}. Les vidéos, supports et questionnaires ne peuvent être copiés, partagés ou revendus. L’attestation délivrée à la fin d’une formation atteste que vous l’avez suivie et validée ; ce n’est ni un diplôme ni une certification professionnelle reconnue par l’État.`,
            (p) =>
              `Buying a course gives you a personal, non-transferable right of access, for ${p.courseAccess}. Videos, materials and quizzes may not be copied, shared or resold. The certificate issued at the end of a course attests that you followed and passed it; it is neither a diploma nor a state-recognised professional certification.`,
          ),
        },
        {
          kind: "p",
          text: l(
            "Plus de détails dans les <<mentions légales|/mentions-legales>> et les <<conditions générales d’utilisation|/conditions-generales-utilisation>>.",
            "More details in the <<legal notice|/mentions-legales>> and the <<terms of use|/conditions-generales-utilisation>>.",
          ),
        },
      ],
    },
    {
      id: "personal-data",
      part: PART.rights,
      title: l("Données personnelles", "Personal data"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les données collectées lors d’une commande sont nécessaires à son traitement. Leur utilisation et vos droits sont décrits dans la <<politique de confidentialité|/confidentialite>>.",
            "The data collected with an order is needed to process it. How it is used and your rights are described in the <<privacy policy|/confidentialite>>.",
          ),
        },
      ],
    },
    {
      id: "cookies",
      part: PART.rights,
      title: l("Cookies", "Cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "L’usage des cookies et la manière de modifier vos choix sont expliqués dans la <<politique cookies|/cookies>>.",
            "How cookies are used and how to change your choices is explained in the <<cookie policy|/cookies>>.",
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
          text: lp(
            (p) =>
              `Pour toute question ou réclamation, contactez le service client via le <<formulaire de contact|/contact>> ou à [[!E-mail du service client]]. Nous nous efforçons de répondre sous ${p.responseTime}.`,
            (p) =>
              `For any question or complaint, contact customer service through the <<contact form|/contact>> or at [[!Customer service email]]. We aim to reply within ${p.responseTime}.`,
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
            "Médiateur compétent : [[!Nom, adresse et site du médiateur de la consommation]].",
            "Competent mediator: [[!Consumer mediator name, address and website]].",
          ),
        },
        // Editor's note, never published: Do not add a link to the EU online dispute resolution (ODR) platform: it has been discontinued by the EU legislator.
      ],
    },
    {
      id: "law",
      part: PART.disputes,
      title: l("Droit applicable", "Applicable law"),
      blocks: [
        {
          kind: "p",
          text: l("Les présentes conditions sont soumises au droit français.", "These terms are governed by French law."),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Ce choix ne peut priver un consommateur de la protection des règles impératives du pays où il réside habituellement.",
            "This choice cannot deprive a consumer of the protection of the mandatory rules of the country where they habitually reside.",
          ),
        },
      ],
    },
    {
      id: "jurisdiction",
      part: PART.disputes,
      title: l("Juridiction compétente", "Jurisdiction"),
      blocks: [
        {
          kind: "p",
          text: l(
            "À défaut de solution amiable, le litige sera porté devant les juridictions françaises compétentes ; entre professionnels, devant les tribunaux du ressort de Strasbourg.",
            "If no amicable solution is found, the dispute will be brought before the competent French courts; between professionals, before the courts of Strasbourg.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Un consommateur de l’Union européenne peut en tout état de cause saisir les juridictions de son lieu de domicile.",
            "A consumer in the European Union can in any case bring proceedings before the courts of the place where they live.",
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
            { label: l("Service client", "Customer service"), value: l("<<Formulaire de contact|/contact>>", "<<Contact form|/contact>>") },
            { label: l("E-mail", "Email"), value: l("[[!E-mail du service client]]", "[[!Customer service email]]") },
            { label: l("Adresse postale", "Postal address"), value: l("[[!Adresse du siège]]", "[[!Registered office address]]") },
            { label: l("Téléphone", "Telephone"), value: l("Voir les <<mentions légales|/mentions-legales#seller>>", "See the <<legal notice|/mentions-legales#seller>>") },
          ],
        },
      ],
    },
    {
      id: "updates",
      part: PART.disputes,
      title: l("Modification des conditions", "Updates to these terms"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous pouvons modifier ces conditions, par exemple pour tenir compte d’une évolution de la loi ou de nos services. Les conditions applicables à une commande sont celles en vigueur à la date de cette commande. La date de dernière mise à jour figure en haut de cette page.",
            "We may change these terms, for example to reflect a change in the law or in our services. The terms that apply to an order are those in force on the date of that order. The last-updated date is shown at the top of this page.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Chaque version de ces conditions est identifiée par sa date d’entrée en vigueur, que nous conservons avec chaque commande et chaque abonnement. La version applicable vous est remise avec l’e-mail de confirmation de votre commande ou de votre abonnement, et de nouveau sur simple demande.",
            "Each version of these terms is identified by the date it took effect, which we keep with every order and every subscription. The version that applies is given to you with the confirmation email of your order or subscription, and again on request.",
          ),
        },
      ],
    },
  ],
};
