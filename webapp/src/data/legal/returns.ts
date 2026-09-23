import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Returns & refunds.
 *
 * The page gives the procedure and the legal floor, and leaves every
 * commercial rule — the return window offered, who pays postage, the return
 * address — as a placeholder. Tooth gems and adhesives raise real hygiene
 * questions, so the exception is described generically and flagged for a
 * product-by-product decision.
 */
export const RETURNS: LegalDocument = {
  id: "returns",
  path: LEGAL_PATHS.returns,
  eyebrow: l("Service client", "Customer service"),
  title: l("Retours et remboursements", "Returns & refunds"),
  intro: l(
    "Comment retourner un article, ce qui peut l’être, et quand vous êtes remboursé.",
    "How to return an item, what can be returned, and when you are refunded.",
  ),
  updated: DRAFT_DATE,
  showKey: true,
  contactCategory: "returns",
  lead: [
    {
      kind: "steps",
      label: l("Retourner un article en cinq étapes", "Returning an item in five steps"),
      items: [
        { icon: "mail", title: l("Contactez-nous", "Contact us"), text: l("Via le <<formulaire|/contact?sujet=returns>>, catégorie « Retour ».", "Through the <<form|/contact?sujet=returns>>, “Return” category.") },
        { icon: "clipboard", title: l("Instructions de retour", "Return instructions"), text: l("Nous vous envoyons l’adresse et la marche à suivre.", "We send you the address and what to do.") },
        { icon: "package", title: l("Envoyez le produit", "Send the product"), text: l("Bien emballé, avec votre n° de commande.", "Well packed, with your order number.") },
        { icon: "search", title: l("Vérification", "Inspection"), text: l("Nous contrôlons l’état du produit, si nécessaire.", "We check the product’s condition, where applicable.") },
        { icon: "wallet", title: l("Remboursement", "Refund processed"), text: l("Sur votre moyen de paiement d’origine.", "To your original payment method.") },
      ],
    },
  ],
  sections: [
    {
      id: "eligibility",
      title: l("Conditions de retour", "Return eligibility"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Si vous êtes un consommateur dans l’Union européenne, vous disposez en règle générale d’au moins 14 jours à compter de la réception pour vous rétracter d’un achat en ligne, sans justification. Les conditions complètes figurent dans nos <<conditions générales de vente|/conditions-generales>>.",
            "If you are a consumer in the European Union, you generally have at least 14 days from receipt to withdraw from an online purchase, without giving a reason. Full conditions are in our <<terms of sale|/conditions-generales>>.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          title: l("Délai de retour", "Return period"),
          text: l(
            "Délai offert par Global Toothgems : [[Délai de retour, égal ou supérieur au minimum légal]], à compter de [[Point de départ — réception du colis]].",
            "Period offered by Global Toothgems: [[Return period, equal to or longer than the legal minimum]], starting from [[Starting point — receipt of the parcel]].",
          ),
        },
      ],
    },
    {
      id: "condition",
      title: l("État des produits", "Product condition requirements"),
      blocks: [
        {
          kind: "list",
          items: [
            l("produit complet, avec ses accessoires et notices ;", "product complete, with its accessories and instructions;"),
            l("dans son emballage d’origine, si possible ;", "in its original packaging, where possible;"),
            l("non utilisé, non posé et en état d’être revendu.", "unused, not applied and in resaleable condition."),
          ],
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "[[Règle en cas de retour incomplet ou abîmé — ex. remboursement partiel]]",
            "[[Rule for incomplete or damaged returns — e.g. partial refund]]",
          ),
        },
      ],
    },
    {
      id: "non-returnable",
      title: l("Produits non retournables", "Non-returnable products"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          title: l("Exception d’hygiène", "Hygiene exception"),
          text: l(
            "La loi permet d’exclure du droit de rétractation les biens scellés qui ne peuvent être renvoyés pour des raisons d’hygiène ou de protection de la santé, lorsqu’ils ont été descellés après la livraison. Sont aussi exclus les produits personnalisés et, sous conditions, les contenus numériques déjà commencés.",
            "The law allows sealed goods that cannot be returned for hygiene or health-protection reasons to be excluded from the right of withdrawal once unsealed after delivery. Personalised products and, under conditions, digital content already started are also excluded.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Liste des produits concernés et mention sur chaque fiche produit : [[Produits exclus — ex. gems, adhésifs ou kits descellés]]. Traitement des formations en ligne : [[Règle de rétractation pour les formations]].",
            "Products concerned and a notice on each product page: [[Excluded products — e.g. unsealed gems, adhesives or kits]]. Online training: [[Withdrawal rule for training]].",
          ),
        },
      ],
    },
    {
      id: "how",
      title: l("Faire une demande de retour", "How to request a return"),
      blocks: [
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Écrivez-nous via le <<formulaire de contact|/contact?sujet=returns>> (catégorie « Retour / remboursement ») avant d’envoyer quoi que ce soit. Indiquez :",
            "Write to us through the <<contact form|/contact?sujet=returns>> (“Return / refund” category) before sending anything. Include:",
          ),
          items: [
            l("votre numéro de commande ;", "your order number;"),
            l("le ou les articles concernés et leur quantité ;", "the item(s) concerned and quantity;"),
            l("le motif (facultatif pour une rétractation) ;", "the reason (optional for a withdrawal);"),
            l("des photos si le produit est défectueux ou endommagé.", "photos if the product is defective or damaged."),
          ],
        },
      ],
    },
    {
      id: "address",
      title: l("Adresse de retour", "Return address"),
      blocks: [
        {
          kind: "fields",
          fields: [
            { label: l("Adresse de retour", "Return address"), placeholder: l("Adresse de retour", "Return address") },
            { label: l("Référence à indiquer", "Reference to include"), value: l("Votre numéro de commande", "Your order number") },
          ],
        },
        {
          kind: "p",
          text: l(
            "N’envoyez pas de colis sans avoir reçu nos instructions : un retour non annoncé peut retarder son traitement.",
            "Please do not send a parcel before receiving our instructions: an unannounced return may delay processing.",
          ),
        },
      ],
    },
    {
      id: "costs",
      title: l("Frais de retour", "Return shipping costs"),
      blocks: [
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "Rétractation : [[Frais de retour à la charge du client, offerts, ou étiquette prépayée]]. Produit défectueux, endommagé ou erroné : les frais de retour sont à notre charge.",
            "Change of mind: [[Return costs paid by customer, free, or prepaid label]]. Defective, damaged or wrong product: return costs are on us.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Nous vous conseillons un envoi suivi et de conserver la preuve de dépôt.",
            "We recommend a tracked service and keeping proof of postage.",
          ),
        },
      ],
    },
    {
      id: "refunds",
      title: l("Remboursement", "Refund procedure and timeframe"),
      blocks: [
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "En cas de rétractation, nous remboursons toutes les sommes versées, y compris les frais de livraison standard initiaux, au plus tard 14 jours après avoir été informés de votre décision. Nous pouvons attendre d’avoir reçu le produit, ou la preuve de son envoi.",
            "If you withdraw, we refund all sums paid, including the initial standard delivery cost, no later than 14 days after being informed of your decision. We may wait until we have received the product, or proof it was sent.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le remboursement est effectué sur le moyen de paiement utilisé lors de la commande. Selon votre banque, il peut apparaître sur votre compte quelques jours après son émission.",
            "The refund is made to the payment method used for the order. Depending on your bank, it may appear on your account a few days after it is issued.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          title: l("Remboursement partiel", "Partial refunds"),
          text: l(
            "[[Cas de remboursement partiel — ex. retour d’une partie de la commande, dépréciation du produit, frais de livraison express]]",
            "[[Partial refund cases — e.g. returning part of an order, loss of value, express delivery surcharge]]",
          ),
        },
      ],
    },
    {
      id: "defective",
      title: l("Produit défectueux ou endommagé", "Damaged or defective products"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Un produit arrivé abîmé ou qui présente un défaut est couvert par la garantie légale de conformité, indépendamment du droit de rétractation. Contactez-nous avec des photos : nous vous proposons un remplacement ou un remboursement.",
            "A product that arrives damaged or has a defect is covered by the legal guarantee of conformity, separately from the right of withdrawal. Contact us with photos: we will offer a replacement or a refund.",
          ),
        },
      ],
    },
    {
      id: "wrong-item",
      title: l("Mauvais article reçu", "Incorrect products received"),
      blocks: [
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Vous avez reçu un article qui ne correspond pas à votre commande ? Ne l’utilisez pas et contactez-nous avec une photo de l’article et du bordereau : nous organisons l’échange à nos frais.",
            "Received an item that does not match your order? Don’t use it, and contact us with a photo of the item and the packing slip: we will arrange the exchange at our cost.",
          ),
        },
      ],
    },
    {
      id: "contact",
      title: l("Service client", "Customer service"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Une question sur un retour en cours ? <<Contactez-nous|/contact?sujet=returns>> en rappelant votre numéro de commande. Délai de réponse habituel : [[Délai de réponse du service client]].",
            "A question about a return in progress? <<Contact us|/contact?sujet=returns>> quoting your order number. Usual response time: [[Customer service response time]].",
          ),
        },
      ],
    },
  ],
};
