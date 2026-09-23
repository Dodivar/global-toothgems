import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Terms of sale ("conditions générales de vente").
 *
 * Structure and wording for review, not a contract. Three kinds of statement
 * are kept apart on purpose:
 * - `legal` callouts summarise EU consumer-law minimums that apply whatever
 *   the shop decides (and still need checking against the countries served);
 * - `policy` callouts are the shop's own choices, left as placeholders;
 * - `[[...]]` marks every value nobody has confirmed yet.
 */

const PART = {
  general: l("Généralités", "General"),
  products: l("Produits et prix", "Products and prices"),
  ordering: l("Commande", "Ordering"),
  payment: l("Paiement", "Payment"),
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
    "Les règles qui s’appliquent lorsque vous achetez des produits ou des formations sur Global Toothgems : commande, paiement, livraison, rétractation, retours et garanties.",
    "The rules that apply when you buy products or training on Global Toothgems: ordering, payment, delivery, withdrawal, returns and guarantees.",
  ),
  updated: DRAFT_DATE,
  numbered: true,
  showKey: true,
  contactCategory: "order",
  lead: [
    {
      kind: "internal",
      text: l(
        "Projet de structure, pas un texte juridique validé. Les encadrés « Information légale » résument des minimums du droit européen de la consommation et doivent être confirmés pour chaque pays de vente ; toutes les règles commerciales (délais, frais, zones) sont à fixer par l’entreprise.",
        "Draft structure, not validated legal text. “Legal information” boxes summarise EU consumer-law minimums and must be confirmed for each country of sale; every commercial rule (periods, fees, zones) is for the business to set.",
      ),
    },
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
            "Les présentes conditions s’appliquent à toute commande passée sur le site Global Toothgems : produits physiques (gems, outils, kits, produits de suivi) et formations en ligne de l’Academy. Elles sont acceptées au moment de la validation de la commande.",
            "These terms apply to every order placed on the Global Toothgems website: physical products (gems, tools, kits, aftercare products) and Academy online training. They are accepted when the order is confirmed.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Préciser si le site vend aux consommateurs, aux professionnels, ou aux deux — certaines règles (rétractation, garanties) diffèrent selon le cas : [[Clientèle visée : particuliers, professionnels ou les deux]].",
            "State whether the site sells to consumers, professionals or both — some rules (withdrawal, guarantees) differ: [[Customers served: consumers, professionals or both]].",
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
            "Les ventes sont conclues avec [[!Dénomination sociale]], [[!Forme juridique]], dont le siège est situé [[!Adresse du siège]], immatriculée sous le numéro [[!Numéro d’immatriculation]]. Toutes les informations d’identification figurent dans les <<mentions légales|/mentions-legales>>.",
            "Sales are concluded with [[!Legal business name]], [[!Legal entity type]], registered office at [[!Registered office address]], registration number [[!Registration number]]. Full identification details are in the <<legal notice|/mentions-legales>>.",
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
            "Les pages de formation décrivent le programme, le format, la durée d’accès et les conditions de validation de chaque formation.",
            "Training pages describe each course’s programme, format, access duration and completion requirements.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Confirmer les mentions réglementaires éventuelles pour les produits destinés à un usage dentaire ou cosmétique : [[Réglementation applicable aux produits vendus]].",
            "Confirm any regulatory statements needed for products intended for dental or cosmetic use: [[Regulations applicable to the products sold]].",
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
            "Les produits sont proposés dans la limite des stocks disponibles, affichés sur chaque fiche. Si un produit commandé s’avère indisponible après votre commande, nous vous en informons sans délai et vous proposons [[Solution proposée : remboursement, remplacement ou attente]]. Tout montant payé pour un produit indisponible est remboursé.",
            "Products are offered while stocks last, as shown on each product page. If an ordered product turns out to be unavailable after you order, we will tell you promptly and offer [[Remedy offered: refund, replacement or waiting]]. Any amount paid for an unavailable product is refunded.",
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
          text: l(
            "Les prix sont indiqués en [[Devise(s) de vente]], [[TTC ou HT selon la clientèle]]. Les frais de livraison sont affichés séparément avant la validation de la commande. Le prix applicable est celui affiché au moment de la commande.",
            "Prices are shown in [[Sales currency(ies)]], [[including or excluding VAT depending on customers]]. Delivery costs are shown separately before the order is confirmed. The price that applies is the one displayed when you order.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Régime de TVA et règles pour les ventes hors UE à définir : [[Régime de TVA et traitement des taxes par pays]].",
            "VAT regime and rules for sales outside the EU to be defined: [[VAT regime and per-country tax handling]].",
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
            l("ajout des produits ou formations au panier ;", "add products or training to your cart;"),
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
            "Un compte est nécessaire pour accéder aux formations achetées, suivre vos commandes et retrouver vos attestations. [[Commande possible sans compte pour les produits physiques ?]] Vous êtes responsable de la confidentialité de vos identifiants.",
            "An account is needed to access purchased training, follow your orders and find your certificates. [[Guest checkout possible for physical products?]] You are responsible for keeping your login details confidential.",
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
            "Après le paiement, un récapitulatif s’affiche et un e-mail de confirmation vous est envoyé, reprenant le détail de la commande, les prix et ces conditions. La commande est considérée comme confirmée à réception de la confirmation de paiement par notre prestataire.",
            "After payment, a summary is shown and a confirmation email is sent to you, listing the order details, prices and these terms. The order is considered confirmed once our payment provider confirms the payment.",
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
          text: l(
            "Les moyens de paiement acceptés sont affichés sur la page de paiement : [[Moyens de paiement activés (cartes, portefeuilles, autres)]]. Le paiement est exigible immédiatement à la commande.",
            "Accepted payment methods are shown on the payment page: [[Payment methods enabled (cards, wallets, others)]]. Payment is due immediately on ordering.",
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
            "Le paiement est opéré par Stripe. Vos données de carte sont saisies sur une page de paiement de Stripe et ne sont pas conservées par Global Toothgems.",
            "Payment is handled by Stripe. Your card details are entered on a Stripe payment page and are not stored by Global Toothgems.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "À confirmer avec l’intégration finale : [[Entité Stripe contractante, type d’intégration (Checkout) et libellé sur le relevé bancaire]].",
            "To confirm against the final integration: [[Contracting Stripe entity, integration type (Checkout) and bank-statement descriptor]].",
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
          text: l(
            "Vous pouvez demander l’annulation d’une commande tant qu’elle n’a pas été expédiée : [[Délai ou étape jusqu’à laquelle l’annulation est possible]]. Une commande annulée est remboursée intégralement.",
            "You can ask to cancel an order as long as it has not shipped: [[Period or stage up to which cancellation is possible]]. A cancelled order is refunded in full.",
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
            "Pour un achat à distance, un consommateur résidant dans l’Union européenne dispose en règle générale d’un délai de rétractation d’au moins 14 jours, sans avoir à se justifier. Pour un produit, ce délai court à partir de la réception (du dernier article, en cas de livraison en plusieurs colis) ; pour une formation en ligne, à partir de la conclusion du contrat.",
            "For a distance purchase, a consumer resident in the European Union generally has a withdrawal period of at least 14 days, without giving any reason. For goods, it runs from receipt (of the last item, when delivered in several parcels); for online training, from the conclusion of the contract.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "Délai commercial offert par Global Toothgems : [[Délai de retour proposé, égal ou supérieur au minimum légal]].",
            "Commercial period offered by Global Toothgems: [[Return period offered, equal to or longer than the legal minimum]].",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Pour exercer ce droit, informez-nous de votre décision par une déclaration claire — via le <<formulaire de contact|/contact?sujet=returns>> ou le formulaire type de rétractation [[Formulaire type de rétractation à joindre]] — avant la fin du délai.",
            "To exercise this right, tell us of your decision with a clear statement — through the <<contact form|/contact?sujet=returns>> or the model withdrawal form [[Model withdrawal form to attach]] — before the period ends.",
          ),
        },
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
          text: l(
            "La loi prévoit des exceptions, notamment :",
            "The law provides for exceptions, including:",
          ),
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
          tone: "verify",
          text: l(
            "Lister précisément les produits concernés et le traitement des formations : [[Produits exclus (ex. gems ou adhésifs descellés) et qualification juridique des formations en ligne]].",
            "List exactly which products are concerned and how training is treated: [[Excluded products (e.g. unsealed gems or adhesives) and legal classification of online training]].",
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
          text: l(
            "Les produits doivent être renvoyés complets, dans leur emballage d’origine et dans un état permettant leur remise en vente, au plus tard [[Délai de renvoi après la demande]] après nous avoir informés de votre décision. La procédure détaillée figure sur la page <<Retours et remboursements|/retours-remboursements>>.",
            "Products must be returned complete, in their original packaging and in a resaleable condition, no later than [[Deadline to send the return after the request]] after telling us of your decision. The step-by-step procedure is on the <<Returns & refunds|/retours-remboursements>> page.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Votre responsabilité peut être engagée en cas de dépréciation du produit résultant de manipulations autres que celles nécessaires pour en établir la nature, les caractéristiques et le bon fonctionnement.",
            "You may be liable for any loss in value resulting from handling the product beyond what is needed to establish its nature, characteristics and functioning.",
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
          text: l(
            "Délai de traitement habituel constaté : [[Délai de traitement interne des remboursements]].",
            "Usual processing time: [[Internal refund processing time]].",
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
          text: l(
            "Choix de Global Toothgems : [[Frais de retour à la charge du client, offerts, ou étiquette prépayée]]. Pour un produit défectueux ou non conforme, les frais de retour sont à notre charge.",
            "Global Toothgems’ choice: [[Return costs paid by customer, free, or prepaid label]]. For a defective or non-conforming product, return costs are on us.",
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
          text: l(
            "Les modes de livraison disponibles, leurs tarifs et délais sont présentés avant le paiement et sur la page <<Livraison|/livraison>> : [[Transporteurs et modes de livraison proposés]].",
            "Available delivery methods, their prices and times are shown before payment and on the <<Shipping & delivery|/livraison>> page: [[Carriers and delivery methods offered]].",
          ),
        },
        {
          kind: "p",
          text: l(
            "Les formations en ligne ne sont pas expédiées : elles sont accessibles depuis votre espace membre dès confirmation du paiement.",
            "Online training is not shipped: it is available from your member area as soon as payment is confirmed.",
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
          text: l(
            "Le délai de livraison indiqué lors de la commande comprend le délai de préparation ([[Délai de préparation]]) et le délai d’acheminement du transporteur ([[Délais d’acheminement par zone]]).",
            "The delivery time shown when you order includes preparation time ([[Preparation time]]) and the carrier’s transit time ([[Transit times by zone]]).",
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
            "Nous livrons dans les pays suivants : [[Liste des pays et zones de livraison]]. Certains produits peuvent être soumis à des restrictions d’importation selon le pays de destination.",
            "We deliver to the following countries: [[List of delivery countries and zones]]. Some products may be subject to import restrictions depending on the destination country.",
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
            "Qui les paie : [[Droits et taxes réglés par le destinataire à la livraison, ou inclus au paiement]].",
            "Who pays them: [[Duties and taxes paid by the recipient on delivery, or included at checkout]].",
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
          text: l(
            "Les produits bénéficient de la garantie légale de conformité : dans l’Union européenne, le vendeur répond des défauts de conformité existant lors de la livraison et apparaissant dans un délai minimum de deux ans. Vous pouvez demander la réparation ou le remplacement du produit, puis, à défaut, une réduction du prix ou la résolution du contrat.",
            "Products are covered by the legal guarantee of conformity: in the European Union, the seller is liable for any lack of conformity existing at delivery and becoming apparent within a minimum of two years. You can ask for the product to be repaired or replaced and, failing that, a price reduction or termination of the contract.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Rédaction exacte selon le droit national applicable, et existence éventuelle d’une garantie commerciale : [[Garanties légales nationales et garantie commerciale éventuelle]].",
            "Exact wording under the applicable national law, and whether a commercial warranty is offered: [[National legal guarantees and any commercial warranty]].",
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
            "Les produits doivent être utilisés conformément à leur fiche et aux consignes de pose et de sécurité enseignées. Global Toothgems ne saurait être tenu responsable d’un dommage résultant d’un usage non conforme, sans préjudice des droits dont vous disposez en tant que consommateur.",
            "Products must be used according to their product page and the application and safety guidance taught. Global Toothgems cannot be held liable for damage resulting from improper use, without prejudice to your rights as a consumer.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Clause à valider par un juriste : [[Limites de responsabilité admises selon le pays et le type de client]].",
            "Clause to be validated by a lawyer: [[Permitted liability limits by country and customer type]].",
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
            "Aucune des parties n’est responsable d’un manquement causé par un événement échappant à son contrôle, imprévisible et irrésistible au sens du droit applicable. Nous vous informerons dans les meilleurs délais et vous proposerons une solution, y compris un remboursement si la commande ne peut être exécutée.",
            "Neither party is liable for a failure caused by an event beyond its control, unforeseeable and unavoidable within the meaning of the applicable law. We will inform you as soon as possible and offer a solution, including a refund if the order cannot be fulfilled.",
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
          text: l(
            "L’achat d’une formation vous donne un droit d’accès personnel, non transférable et limité à [[Durée d’accès aux formations]]. Les vidéos, supports et questionnaires ne peuvent être copiés, partagés ou revendus.",
            "Buying a course gives you a personal, non-transferable right of access limited to [[Training access duration]]. Videos, materials and quizzes may not be copied, shared or resold.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Plus de détails dans les <<mentions légales|/mentions-legales>>.",
            "More details in the <<legal notice|/mentions-legales>>.",
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
          text: l(
            "Pour toute question ou réclamation, contactez le service client via le <<formulaire de contact|/contact>> ou à [[!E-mail du service client]]. Nous nous efforçons de répondre sous [[Délai de réponse du service client]].",
            "For any question or complaint, contact customer service through the <<contact form|/contact>> or at [[!Customer service email]]. We aim to reply within [[Customer service response time]].",
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
            "Selon le pays d’établissement du vendeur, un consommateur peut avoir le droit de recourir gratuitement à un médiateur de la consommation, après une réclamation écrite restée sans solution.",
            "Depending on the seller’s country of establishment, a consumer may be entitled to use a consumer mediation service free of charge, after a written complaint that has not been resolved.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Médiateur compétent : [[!Nom, adresse et site du médiateur de la consommation]].",
            "Competent mediator: [[!Consumer mediator name, address and website]].",
          ),
        },
        {
          kind: "internal",
          text: l(
            "Ne pas ajouter de lien vers la plateforme européenne de règlement en ligne des litiges (RLL/ODR) sans vérifier son statut actuel : elle a été supprimée par le législateur européen.",
            "Do not add a link to the EU online dispute resolution (ODR) platform without checking its current status: it has been discontinued by the EU legislator.",
          ),
        },
      ],
    },
    {
      id: "law",
      part: PART.disputes,
      title: l("Droit applicable", "Applicable law"),
      blocks: [
        {
          kind: "p",
          text: l("Les présentes conditions sont soumises à [[Droit applicable]].", "These terms are governed by [[Applicable law]]."),
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
            "À défaut de solution amiable, le litige sera porté devant [[Juridiction compétente]].",
            "If no amicable solution is found, the dispute will be brought before [[Competent courts]].",
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
            { label: l("E-mail", "Email"), placeholder: l("E-mail du service client", "Customer service email") },
            { label: l("Adresse postale", "Postal address"), placeholder: l("Adresse postale", "Postal address") },
            { label: l("Téléphone", "Telephone"), placeholder: l("Téléphone, si proposé", "Telephone, if offered") },
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
          kind: "callout",
          tone: "verify",
          text: l(
            "Prévoir l’archivage des versions successives et leur lien avec chaque commande : [[Méthode d’archivage des versions des CGV]].",
            "Plan how successive versions are archived and linked to each order: [[Method for archiving terms versions]].",
          ),
        },
      ],
    },
  ],
};
