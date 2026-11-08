import { lp } from "./policies";
import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Shipping & delivery.
 *
 * The destinations, the rate table and the free-delivery rules are replaced
 * on the server by the zones and rates saved in Settings › Shipping
 * (`shippingGrid.ts`); the wording here is what stays when they cannot be
 * read. The other rules come from `policies.ts` (decision 126).
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
        { icon: "package", title: l("Préparation", "Processing"), text: lp((p) => `Nous préparons votre colis sous ${p.preparationTime}.`, (p) => `We prepare your parcel within ${p.preparationTime}.`) },
        { icon: "truck", title: l("Expédiée", "Shipped"), text: l("Votre colis est remis au transporteur.", "Your parcel is handed to the carrier.") },
        { icon: "search", title: l("Suivi", "Tracking"), text: l("Un lien de suivi vous est envoyé par e-mail.", "A tracking link is sent to you by email.") },
        { icon: "home", title: l("Livrée", "Delivered"), text: l("Votre commande arrive à l’adresse indiquée.", "Your order arrives at the address given.") },
      ],
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
            "Nous livrons en France et à Monaco, dans l’Union européenne, en Suisse et au Liechtenstein, au Royaume-Uni, aux États-Unis et au Canada. Les pays ouverts à la livraison sont proposés lors du paiement ; si le vôtre n’y figure pas, contactez-nous avant de commander.",
            "We deliver to France and Monaco, the European Union, Switzerland and Liechtenstein, the United Kingdom, the United States and Canada. The countries open for delivery are offered at checkout; if yours is not listed, contact us before ordering.",
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
              zone: l("Toutes zones", "All zones"),
              method: l("Standard ou express", "Standard or express"),
              time: l("Affiché au paiement", "Shown at checkout"),
              cost: l("Affiché dans le panier", "Shown in the cart"),
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
            "La livraison standard est offerte au-delà d’un montant d’achat qui dépend de la zone ; le panier indique ce qu’il reste à ajouter pour en profiter.",
            "Standard delivery is free above an order amount that depends on the zone; the cart shows how much is left to add to get it.",
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
          text: lp(
            (p) =>
              `Les commandes sont préparées sous ${p.preparationTime} après confirmation du paiement, hors week-ends et jours fériés, puis confiées à ${p.carriers}. Les formations en ligne ne sont pas expédiées : elles sont disponibles immédiatement dans votre espace <<Mon compte|/compte>>.`,
            (p) =>
              `Orders are prepared within ${p.preparationTime} after payment is confirmed, excluding weekends and public holidays, then handed to ${p.carriers}. Online courses are not shipped: they are available straight away in <<My account|/compte>>.`,
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
            "En votre absence, le transporteur laisse généralement un avis de passage et dépose le colis en point relais ou le présente à nouveau. Un colis non retiré dans le délai du transporteur nous est retourné : nous vous le réexpédions à vos frais, ou nous vous remboursons les produits, sans les frais de livraison.",
            "If you are out, the carrier usually leaves a notice and takes the parcel to a pickup point or tries again. A parcel not collected within the carrier’s deadline is returned to us: we send it again at your cost, or refund the products, without the delivery cost.",
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
            "Colis expédié à une adresse erronée fournie par le client : s’il nous revient, sa réexpédition est à votre charge.",
            "Parcel sent to a wrong address supplied by the customer: if it comes back to us, sending it again is at your cost.",
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
          text: lp(
            (p) =>
              `Colis abîmé à la réception ? Si possible, notez des réserves auprès du transporteur, photographiez le colis et son contenu, et contactez-nous de préférence dans les ${p.damageReport}, pour que nous puissions agir auprès du transporteur. Colis indiqué livré mais introuvable ? Contactez-nous : nous ouvrons une enquête auprès du transporteur.`,
            (p) =>
              `Parcel damaged on arrival? If possible, note it with the carrier, photograph the parcel and its contents, and contact us preferably within ${p.damageReport}, so we can act with the carrier. Parcel marked delivered but not received? Contact us: we will open an investigation with the carrier.`,
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
            "Le destinataire, à la livraison : ils ne sont pas inclus dans le prix payé sur le site. Un colis refusé pour ce motif nous revient : nous remboursons alors les produits, sans les frais de livraison ni les frais de retour facturés par le transporteur.",
            "The recipient, on delivery: they are not included in the price paid on the site. A parcel refused for this reason comes back to us: we then refund the products, without the delivery cost or the return charges billed by the carrier.",
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
