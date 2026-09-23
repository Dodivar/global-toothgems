import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Shipping & delivery.
 *
 * No price, zone, carrier or delay is stated: the cart prototype uses sample
 * values to demonstrate its free-delivery bar, and those values are not a
 * shipping policy. The internal note says so, so the two get aligned.
 */
export const SHIPPING: LegalDocument = {
  id: "shipping",
  path: LEGAL_PATHS.shipping,
  eyebrow: l("Service client", "Customer service"),
  title: l("Livraison", "Shipping & delivery"),
  intro: l(
    "Où nous livrons, en combien de temps, à quel prix, et que faire si votre colis se fait attendre.",
    "Where we deliver, how long it takes, what it costs, and what to do if your parcel is late.",
  ),
  updated: DRAFT_DATE,
  contactCategory: "delivery",
  lead: [
    {
      kind: "steps",
      label: l("Les étapes d’une livraison", "The stages of a delivery"),
      items: [
        { icon: "cart", title: l("Commande passée", "Order placed"), text: l("Vous recevez un e-mail de confirmation.", "You receive a confirmation email.") },
        { icon: "package", title: l("Préparation", "Processing"), text: l("Nous préparons votre colis sous [[Délai de préparation]].", "We prepare your parcel within [[Preparation time]].") },
        { icon: "truck", title: l("Expédiée", "Shipped"), text: l("Votre colis est remis au transporteur.", "Your parcel is handed to the carrier.") },
        { icon: "search", title: l("Suivi", "Tracking"), text: l("Un lien de suivi vous est envoyé par e-mail.", "A tracking link is sent to you by email.") },
        { icon: "home", title: l("Livrée", "Delivered"), text: l("Votre commande arrive à l’adresse indiquée.", "Your order arrives at the address given.") },
      ],
    },
    {
      kind: "internal",
      text: l(
        "Le panier du prototype affiche des valeurs d’exemple (livraison offerte au-delà d’un seuil, forfait sinon). Ce ne sont pas des tarifs validés : aligner le panier et cette page sur la grille réelle avant lancement.",
        "The prototype cart shows sample values (free delivery above a threshold, a flat fee otherwise). These are not validated rates: align the cart and this page with the real rate card before launch.",
      ),
    },
  ],
  sections: [
    {
      id: "destinations",
      title: l("Destinations", "Shipping destinations"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous livrons dans les pays et zones suivants : [[Liste des pays et zones de livraison]]. Si votre pays n’apparaît pas lors du paiement, contactez-nous avant de commander.",
            "We deliver to the following countries and zones: [[List of delivery countries and zones]]. If your country does not appear at checkout, contact us before ordering.",
          ),
        },
      ],
    },
    {
      id: "methods",
      title: l("Modes, délais et tarifs", "Methods, times and costs"),
      blocks: [
        {
          kind: "table",
          caption: l("Grille de livraison", "Delivery rates"),
          columns: [
            { key: "zone", label: l("Zone", "Zone") },
            { key: "method", label: l("Mode", "Method") },
            { key: "time", label: l("Délai estimé", "Estimated time") },
            { key: "cost", label: l("Tarif", "Cost") },
          ],
          rows: [
            {
              zone: l("[[Zone 1 — ex. pays d’expédition]]", "[[Zone 1 — e.g. country of dispatch]]"),
              method: l("[[Mode standard]]", "[[Standard method]]"),
              time: l("[[Délai]]", "[[Time]]"),
              cost: l("[[Tarif]]", "[[Cost]]"),
            },
            {
              zone: l("[[Zone 2 — ex. Union européenne]]", "[[Zone 2 — e.g. European Union]]"),
              method: l("[[Mode standard / express]]", "[[Standard / express method]]"),
              time: l("[[Délai]]", "[[Time]]"),
              cost: l("[[Tarif]]", "[[Cost]]"),
            },
            {
              zone: l("[[Zone 3 — ex. reste du monde]]", "[[Zone 3 — e.g. rest of world]]"),
              method: l("[[Mode]]", "[[Method]]"),
              time: l("[[Délai]]", "[[Time]]"),
              cost: l("[[Tarif]]", "[[Cost]]"),
            },
          ],
        },
        {
          kind: "p",
          text: l(
            "Le tarif et le délai exacts de votre commande sont toujours affichés avant le paiement. Les délais sont indiqués en jours ouvrés et comptent à partir de l’expédition.",
            "The exact cost and time for your order are always shown before payment. Times are given in working days and count from dispatch.",
          ),
        },
      ],
    },
    {
      id: "free-shipping",
      title: l("Livraison offerte", "Free shipping"),
      blocks: [
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "[[Seuil de livraison offerte et zones concernées, si applicable]]",
            "[[Free-delivery threshold and zones concerned, if applicable]]",
          ),
        },
      ],
    },
    {
      id: "processing",
      title: l("Délai de préparation", "Order processing times"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les commandes sont préparées sous [[Délai de préparation]] après confirmation du paiement, hors week-ends et jours fériés. Les formations en ligne ne sont pas expédiées : elles sont disponibles immédiatement dans votre espace <<Mon compte|/compte>>.",
            "Orders are prepared within [[Preparation time]] after payment is confirmed, excluding weekends and public holidays. Online training is not shipped: it is available straight away in <<My account|/compte>>.",
          ),
        },
      ],
    },
    {
      id: "tracking",
      title: l("Suivi de colis", "Tracking"),
      blocks: [
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Dès l’expédition, vous recevez un e-mail avec votre numéro de suivi. Vous retrouvez aussi l’état de chaque commande dans <<Mes commandes|/compte/commandes>>.",
            "As soon as your order ships, you receive an email with your tracking number. You can also see each order’s status in <<My orders|/compte/commandes>>.",
          ),
        },
      ],
    },
    {
      id: "exceptions",
      title: l("Aléas de livraison", "Delivery exceptions"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Des événements indépendants de notre volonté (intempéries, grèves, pics d’activité des transporteurs, contrôles douaniers) peuvent allonger les délais. Nous vous tenons informé si votre commande est concernée.",
            "Events beyond our control (weather, strikes, carrier peaks, customs checks) can extend delivery times. We will keep you informed if your order is affected.",
          ),
        },
      ],
    },
    {
      id: "failed-delivery",
      title: l("Absence lors de la livraison", "Failed delivery attempts"),
      blocks: [
        {
          kind: "p",
          text: l(
            "En votre absence, le transporteur laisse généralement un avis de passage et dépose le colis en point relais ou le présente à nouveau. Un colis non retiré dans le délai du transporteur nous est retourné : [[Règle appliquée — réexpédition à vos frais ou remboursement hors frais de port]].",
            "If you are out, the carrier usually leaves a notice and takes the parcel to a pickup point or tries again. A parcel not collected within the carrier’s deadline is returned to us: [[Rule applied — re-shipping at your cost or refund excluding shipping]].",
          ),
        },
      ],
    },
    {
      id: "address",
      title: l("Adresse incorrecte", "Incorrect address"),
      blocks: [
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Vérifiez votre adresse avant de payer. En cas d’erreur, écrivez-nous immédiatement via le <<formulaire de contact|/contact?sujet=delivery>> : nous pouvons la corriger tant que le colis n’est pas expédié.",
            "Check your address before paying. If you spot a mistake, write to us immediately through the <<contact form|/contact?sujet=delivery>>: we can correct it as long as the parcel has not shipped.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "Colis expédié à une adresse erronée fournie par le client : [[Prise en charge des frais de réexpédition]].",
            "Parcel sent to a wrong address supplied by the customer: [[Who covers re-shipping costs]].",
          ),
        },
      ],
    },
    {
      id: "lost-damaged",
      title: l("Colis perdu ou endommagé", "Lost or damaged parcels"),
      blocks: [
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Colis abîmé à la réception ? Si possible, notez des réserves auprès du transporteur, photographiez le colis et son contenu, et contactez-nous sous [[Délai de signalement]]. Colis indiqué livré mais introuvable ? Contactez-nous : nous ouvrons une enquête auprès du transporteur.",
            "Parcel damaged on arrival? If possible, note it with the carrier, photograph the parcel and its contents, and contact us within [[Reporting deadline]]. Parcel marked delivered but not received? Contact us: we will open an investigation with the carrier.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Tant que vous n’avez pas pris possession du colis, le risque de perte ou de dommage reste à la charge du vendeur (pour les consommateurs).",
            "Until you take possession of the parcel, the risk of loss or damage stays with the seller (for consumers).",
          ),
        },
      ],
    },
    {
      id: "international",
      title: l("Livraisons internationales, douane et taxes", "International deliveries, customs and import taxes"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Pour les livraisons hors de l’Union européenne, votre colis peut être soumis à des droits de douane, à la TVA locale et à des frais de dédouanement facturés par le transporteur ou les autorités du pays de destination.",
            "For deliveries outside the European Union, your parcel may be subject to customs duties, local VAT and clearance fees charged by the carrier or the destination country’s authorities.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          title: l("Qui paie les frais de douane ?", "Who pays customs charges?"),
          text: l(
            "[[Règle retenue — à la charge du destinataire, ou droits et taxes inclus au paiement]]. Un colis refusé pour ce motif : [[Traitement d’un colis refusé pour frais de douane]].",
            "[[Rule chosen — paid by the recipient, or duties and taxes included at checkout]]. A parcel refused for this reason: [[Handling of a parcel refused over customs charges]].",
          ),
        },
      ],
    },
    {
      id: "contact",
      title: l("Signaler un problème de livraison", "Reporting a delivery issue"),
      blocks: [
        {
          kind: "steps",
          label: l("Signaler un problème", "Reporting a problem"),
          items: [
            { icon: "search", title: l("Vérifiez le suivi", "Check tracking"), text: l("Le lien figure dans l’e-mail d’expédition.", "The link is in your shipping email.") },
            { icon: "clipboard", title: l("Rassemblez les infos", "Gather details"), text: l("N° de commande, photos si le colis est abîmé.", "Order number, photos if damaged.") },
            { icon: "mail", title: l("Écrivez-nous", "Write to us"), text: l("Catégorie « Livraison » du <<formulaire|/contact?sujet=delivery>>.", "“Delivery” category of the <<form|/contact?sujet=delivery>>.") },
          ],
        },
      ],
    },
  ],
};
