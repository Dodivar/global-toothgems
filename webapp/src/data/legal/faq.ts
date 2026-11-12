import type { Localized } from "../types";
import { lp } from "./policies";
import { l, type ContactCategory, type IconKey } from "./types";

/**
 * Frequently asked questions.
 *
 * Answers describe what the prototype actually does (where orders, profile,
 * certificates and the data export live) and point to the policy pages for
 * the rules. Anything the business has not decided stays a placeholder here
 * too, so an FAQ answer can never contradict the terms it summarises.
 */

interface FaqItem {
  id: string;
  question: Localized;
  /** Paragraphs. */
  answer: Localized[];
}

interface FaqCategory {
  id: string;
  title: Localized;
  icon: IconKey;
  contact: ContactCategory;
  items: FaqItem[];
}

export const FAQ: FaqCategory[] = [
  {
    id: "orders",
    title: l("Commandes", "Orders"),
    icon: "cart",
    contact: "order",
    items: [
      {
        id: "place-order",
        question: l("Comment passer commande ?", "How do I place an order?"),
        answer: [
          l(
            "Ajoutez vos produits ou formations au panier, vérifiez-le, puis suivez les étapes : adresse, mode de livraison et paiement. Le détail est décrit dans les <<conditions générales de vente|/conditions-generales#ordering>>.",
            "Add products or courses to your cart, review it, then follow the steps: address, delivery method and payment. The details are in the <<terms of sale|/conditions-generales#ordering>>.",
          ),
        ],
      },
      {
        id: "modify-order",
        question: l("Puis-je modifier ma commande ?", "Can I modify my order?"),
        answer: [
          l(
            "Tant qu’elle n’est pas expédiée, écrivez-nous rapidement via le <<formulaire de contact|/contact?sujet=order>> avec votre numéro de commande. Nous pouvons corriger l’adresse de livraison ou retirer un article (remboursé) ; pour en ajouter un, passez une nouvelle commande.",
            "As long as it has not shipped, write to us quickly through the <<contact form|/contact?sujet=order>> with your order number. We can correct the delivery address or remove an item (refunded); to add one, place a new order.",
          ),
        ],
      },
      {
        id: "cancel-order",
        question: l("Puis-je annuler ma commande ?", "Can I cancel my order?"),
        answer: [
          lp(
            (p) => `Oui, ${p.cancellationStage}, avec un remboursement intégral. Après réception, vous pouvez exercer votre droit de rétractation — voir <<Retours et remboursements|/retours-remboursements>>.`,
            (p) => `Yes, ${p.cancellationStage}, with a full refund. After delivery, you can exercise your right of withdrawal — see <<Returns & refunds|/retours-remboursements>>.`,
          ),
        ],
      },
      {
        id: "order-confirmed",
        question: l("Comment savoir si ma commande est confirmée ?", "How do I know my order was confirmed?"),
        answer: [
          l(
            "Un récapitulatif s’affiche après le paiement et un e-mail de confirmation vous est envoyé, avec nos conditions générales de vente en PDF dans la version qui s’applique à votre commande. Vous retrouvez aussi chaque commande et son statut dans <<Mes commandes|/compte/commandes>>.",
            "A summary is shown after payment and a confirmation email is sent to you, with our terms of sale as a PDF in the version that applies to your order. You can also find every order and its status in <<My orders|/compte/commandes>>.",
          ),
        ],
      },
    ],
  },
  {
    id: "products",
    title: l("Produits", "Products"),
    icon: "package",
    contact: "product",
    items: [
      {
        id: "choose-product",
        question: l("Comment choisir le bon produit ?", "How do I choose the right product?"),
        answer: [
          l(
            "Parcourez la boutique par <<forme|/formes>> ou par <<couleur|/couleurs>>, et consultez la fiche de chaque produit : matière, taille et contenu y sont indiqués. Un doute ? Posez-nous la question via la catégorie « Question produit ».",
            "Browse the shop by <<shape|/formes>> or <<colour|/couleurs>>, and check each product page for material, size and contents. Unsure? Ask us through the “Product question” category.",
          ),
        ],
      },
      {
        id: "suitable",
        question: l("Les produits conviennent-ils à tout le monde ?", "Are products suitable for everyone?"),
        answer: [
          l(
            "Pas nécessairement. La pose d’un bijou dentaire suppose des dents et une hygiène buccale en bonne santé. En cas de doute, demandez l’avis d’un dentiste avant la pose. La pose est déconseillée sur une dent abîmée, cariée, fragile ou couronnée, en cas de traitement dentaire en cours ou d’allergie à l’un des composants, et chez l’enfant.",
            "Not necessarily. Applying a tooth gem assumes healthy teeth and good oral hygiene. If in doubt, ask a dentist before application. Application is not advised on a damaged, decayed, weak or crowned tooth, during ongoing dental treatment or with an allergy to one of the components, nor for children.",
          ),
        ],
      },
      {
        id: "use",
        question: l("Comment utiliser les produits ?", "How should products be used?"),
        answer: [
          l(
            "Suivez les instructions de la fiche produit et les techniques enseignées dans l’<<Academy|/academy>>. Les adhésifs, composites et outils de pose sont destinés à des personnes formées à la pose : leur fiche le précise.",
            "Follow the product page instructions and the techniques taught in the <<Academy|/academy>>. Adhesives, composites and application tools are intended for people trained in application: their page says so.",
          ),
        ],
      },
      {
        id: "maintain",
        question: l("Comment entretenir les produits ?", "How should products be maintained?"),
        answer: [
          l(
            "Conservez les gems et adhésifs dans leur emballage, à l’abri de la chaleur et de l’humidité. Les conseils d’entretien après la pose sont donnés dans la catégorie <<Matériel|/boutique?categorie=materiel>> de la boutique. Les conditions propres à un produit (date limite, température) figurent sur sa fiche et son emballage.",
            "Keep gems and adhesives in their packaging, away from heat and moisture. Aftercare advice is given in the shop’s <<Equipment|/boutique?categorie=materiel>> category. Conditions specific to a product (use-by date, temperature) are on its page and its packaging.",
          ),
        ],
      },
    ],
  },
  {
    id: "shipping",
    title: l("Livraison", "Shipping"),
    icon: "truck",
    contact: "delivery",
    items: [
      {
        id: "where",
        question: l("Où livrez-vous ?", "Where do you ship?"),
        answer: [
          l(
            "En France et à Monaco, dans l’Union européenne, en Suisse et au Liechtenstein, au Royaume-Uni, aux États-Unis et au Canada — voir la page <<Livraison|/livraison#destinations>>.",
            "France and Monaco, the European Union, Switzerland and Liechtenstein, the United Kingdom, the United States and Canada — see <<Shipping & delivery|/livraison#destinations>>.",
          ),
        ],
      },
      {
        id: "times",
        question: l("Quels sont les délais de livraison ?", "What are the delivery times?"),
        answer: [
          lp(
            (p) => `Préparation sous ${p.preparationTime}, puis acheminement selon la zone. Le délai estimé de votre commande est affiché avant le paiement.`,
            (p) => `Preparation within ${p.preparationTime}, then transit depending on the zone. The estimated time for your order is shown before payment.`,
          ),
        ],
      },
      {
        id: "cost",
        question: l("Combien coûte la livraison ?", "How much does shipping cost?"),
        answer: [
          l(
            "Les tarifs dépendent de la zone et du mode choisi ; ils sont affichés avant le paiement et sur la <<grille de livraison|/livraison#methods>>.",
            "Rates depend on the zone and method chosen; they are shown before payment and in the <<delivery rates|/livraison#methods>>.",
          ),
        ],
      },
      {
        id: "track",
        question: l("Puis-je suivre ma commande ?", "Can I track my order?"),
        answer: [
          l(
            "Oui. Un lien de suivi vous est envoyé par e-mail dès l’expédition, et le statut est visible dans <<Mes commandes|/compte/commandes>>.",
            "Yes. A tracking link is emailed to you as soon as it ships, and the status is shown in <<My orders|/compte/commandes>>.",
          ),
        ],
      },
      {
        id: "delayed",
        question: l("Que faire si mon colis est en retard ?", "What happens if my package is delayed?"),
        answer: [
          l(
            "Consultez le suivi, puis contactez-nous via la catégorie « Livraison » du <<formulaire|/contact?sujet=delivery>>. Nous interrogeons le transporteur et vous tenons informé. Vos droits en cas de retard sont décrits dans les <<CGV|/conditions-generales#delivery-delays>>.",
            "Check tracking, then contact us through the “Delivery” category of the <<form|/contact?sujet=delivery>>. We will chase the carrier and keep you posted. Your rights in case of delay are set out in the <<terms|/conditions-generales#delivery-delays>>.",
          ),
        ],
      },
    ],
  },
  {
    id: "returns",
    title: l("Retours et remboursements", "Returns & refunds"),
    icon: "undo",
    contact: "returns",
    items: [
      {
        id: "how-return",
        question: l("Comment retourner un article ?", "How do I return an item?"),
        answer: [
          l(
            "Pour vous rétracter d’un achat, déclarez-le en ligne : « Se rétracter du contrat ici » sur la page de la commande dans <<Mes commandes|/compte/commandes>>, ou, si vous avez commandé sans compte, sur la page <<Se rétracter d’une commande|/retours-remboursements/retractation>>. L’accusé de réception envoyé aussitôt par e-mail donne l’adresse et la marche à suivre. Pour un produit défectueux ou endommagé, contactez-nous via la catégorie « Retour / remboursement ». Tout le processus est détaillé sur la page <<Retours et remboursements|/retours-remboursements>>.",
            "To withdraw from a purchase, declare it online: “Withdraw from the contract here” on the order’s page in <<My orders|/compte/commandes>>, or, if you ordered without an account, on the <<Withdraw from an order|/retours-remboursements/retractation>> page. The acknowledgement e-mailed at once gives the address and what to do. For a defective or damaged product, contact us through the “Return / refund” category. The whole process is on the <<Returns & refunds|/retours-remboursements>> page.",
          ),
        ],
      },
      {
        id: "period",
        question: l("De combien de temps est-ce que je dispose ?", "What is the return period?"),
        answer: [
          lp(
            (p) => `${p.returnPeriod.charAt(0).toUpperCase()}${p.returnPeriod.slice(1)} pour nous informer de votre rétractation, puis ${p.returnShipDeadline} pour renvoyer le produit.`,
            (p) => `${p.returnPeriod.charAt(0).toUpperCase()}${p.returnPeriod.slice(1)} to tell us you are withdrawing, then ${p.returnShipDeadline} to send the product back.`,
          ),
        ],
      },
      {
        id: "refund-when",
        question: l("Quand serai-je remboursé ?", "When will I receive my refund?"),
        answer: [
          l(
            "Au plus tard 14 jours après avoir été informés de votre rétractation ; nous pouvons attendre la réception du produit ou la preuve de son envoi. Le remboursement est fait sur votre moyen de paiement d’origine.",
            "No later than 14 days after we are informed of your withdrawal; we may wait until we receive the product or proof it was sent. The refund goes to your original payment method.",
          ),
        ],
      },
      {
        id: "who-pays",
        question: l("Qui paie les frais de retour ?", "Who pays return shipping?"),
        answer: [
          l(
            "Pour un changement d’avis : vous. Pour un produit défectueux, endommagé ou erroné : nous.",
            "For a change of mind: you do. For a defective, damaged or wrong product: we do.",
          ),
        ],
      },
      {
        id: "non-returnable",
        question: l("Certains produits ne peuvent-ils pas être retournés ?", "Are there products that cannot be returned?"),
        answer: [
          lp(
            (p) => `Oui, dans les cas prévus par la loi : ${p.excludedGoods}, et les produits personnalisés. Le détail figure sur la page <<Retours|/retours-remboursements#non-returnable>>.`,
            (p) => `Yes, where the law allows: ${p.excludedGoods}, and personalised products. Details are on the <<Returns|/retours-remboursements#non-returnable>> page.`,
          ),
        ],
      },
    ],
  },
  {
    id: "payments",
    title: l("Paiement", "Payments"),
    icon: "wallet",
    contact: "order",
    items: [
      {
        id: "methods",
        question: l("Quels moyens de paiement acceptez-vous ?", "What payment methods are available?"),
        answer: [
          lp(
            (p) => `${p.paymentMethods.charAt(0).toUpperCase()}${p.paymentMethods.slice(1)}, ainsi que les cartes cadeaux Global Toothgems.`,
            (p) => `${p.paymentMethods.charAt(0).toUpperCase()}${p.paymentMethods.slice(1)}, as well as Global Toothgems gift cards.`,
          ),
        ],
      },
      {
        id: "secure",
        question: l("Le paiement est-il sécurisé ?", "Is payment secure?"),
        answer: [
          l(
            "Oui. Le paiement est chiffré et traité par Stripe ; votre banque peut vous demander une authentification forte. Nous ne conservons pas vos données de carte.",
            "Yes. Payment is encrypted and processed by Stripe; your bank may ask for strong authentication. We do not store your card details.",
          ),
        ],
      },
      {
        id: "stripe",
        question: l("Pourquoi Stripe apparaît-il lors du paiement ?", "Why is Stripe involved?"),
        answer: [
          l(
            "Stripe est notre prestataire de paiement : il traite la transaction pour notre compte. Vous saisissez vos informations de carte dans son formulaire sécurisé, intégré à notre page de paiement ; elles ne nous sont jamais transmises. Le nom de la boutique ou celui de Stripe peut apparaître sur votre relevé.",
            "Stripe is our payment provider: it processes the transaction on our behalf. You enter your card details in its secure form, embedded in our payment page; they are never passed to us. The shop’s name or Stripe’s may appear on your statement.",
          ),
        ],
      },
    ],
  },
  {
    id: "account",
    title: l("Compte", "Account"),
    icon: "cog",
    contact: "technical",
    items: [
      {
        id: "create",
        question: l("Comment créer un compte ?", "How do I create an account?"),
        answer: [l("Depuis la page <<Inscription|/inscription>> : e-mail, mot de passe, puis quelques préférences facultatives.", "From the <<Sign up|/inscription>> page: email, password, then a few optional preferences.")],
      },
      {
        id: "reset",
        question: l("Comment réinitialiser mon mot de passe ?", "How do I reset my password?"),
        answer: [
          l(
            "Utilisez <<Mot de passe oublié|/mot-de-passe-oublie>> : un lien de réinitialisation vous est envoyé par e-mail. Connecté, vous pouvez aussi le changer dans <<Sécurité et confidentialité|/compte/securite>>.",
            "Use <<Forgot password|/mot-de-passe-oublie>>: a reset link is emailed to you. When signed in, you can also change it in <<Security & privacy|/compte/securite>>.",
          ),
        ],
      },
      {
        id: "modify",
        question: l("Comment modifier mes informations ?", "How can I modify my information?"),
        answer: [
          l(
            "Votre nom et vos coordonnées se modifient dans <<Profil|/compte/profil>> ; votre e-mail de connexion et votre mot de passe dans <<Sécurité et confidentialité|/compte/securite>>.",
            "Your name and contact details are edited in <<Profile|/compte/profil>>; your sign-in email and password in <<Security & privacy|/compte/securite>>.",
          ),
        ],
      },
    ],
  },
  {
    id: "training",
    title: l("Formation", "Training"),
    icon: "clipboard",
    contact: "training",
    items: [
      {
        id: "courses",
        question: l("Comment fonctionnent les formations en ligne ?", "How do the online courses work?"),
        answer: [
          lp(
            (p) =>
              `Après l’achat, la formation apparaît dans votre espace <<Mon compte|/compte>>. Vous suivez les leçons vidéo à votre rythme, dans l’ordre du programme présenté sur l’<<Academy|/academy>>. L’accès est ${p.courseAccess} : la formation reste dans votre compte, sans date de fin.`,
            (p) =>
              `After purchase, the course appears in <<My account|/compte>>. You follow the video lessons at your own pace, in the programme order shown on the <<Academy|/academy>>. Access comes ${p.courseAccess}: the course stays in your account, with no end date.`,
          ),
        ],
      },
      {
        id: "quizzes",
        question: l("Comment fonctionnent les quiz ?", "How do quizzes work?"),
        answer: [
          l(
            "Les leçons se terminent par des questions de validation. Après chaque réponse, une explication vous dit pourquoi la bonne réponse est la bonne.",
            "Lessons end with validation questions. After each answer, an explanation tells you why the right answer is right.",
          ),
        ],
      },
      {
        id: "retake",
        question: l("Puis-je repasser un quiz ?", "Can I retake a quiz?"),
        answer: [
          l(
            "Oui : une question manquée peut être rejouée, sans limite de tentatives. L’objectif est la maîtrise, pas la sanction.",
            "Yes: a missed question can be replayed, with no limit on attempts. The goal is mastery, not a verdict.",
          ),
        ],
      },
      {
        id: "validation",
        question: l("Comment la formation est-elle validée ?", "How is course completion validated?"),
        answer: [
          l(
            "La formation est validée dès que vous atteignez le score requis aux questions de validation, fixé pour chaque formation. Une attestation est alors délivrée.",
            "The course is validated as soon as you reach the required score on the validation questions, set for each course. A certificate is then issued.",
          ),
        ],
      },
      {
        id: "certificates",
        question: l("Où trouver mes attestations ?", "Where can I find my certificates?"),
        answer: [
          l(
            "Dans <<Mes attestations|/compte/attestations>>, où vous pouvez les consulter et les télécharger. Une attestation Global Toothgems atteste que vous avez suivi et validé la formation ; ce n’est ni un diplôme ni une certification professionnelle reconnue par l’État.",
            "In <<My certificates|/compte/attestations>>, where you can view and download them. A Global Toothgems certificate attests that you followed and passed the course; it is neither a diploma nor a state-recognised professional certification.",
          ),
        ],
      },
    ],
  },
  {
    id: "privacy",
    title: l("Confidentialité", "Privacy"),
    icon: "eye",
    contact: "privacy",
    items: [
      {
        id: "data-use",
        question: l("Comment mes données sont-elles utilisées ?", "How is my data used?"),
        answer: [
          l(
            "Pour traiter vos commandes, vous donner accès aux formations et vous répondre — et, seulement avec votre accord, pour le marketing. Tout est expliqué dans la <<politique de confidentialité|/confidentialite>>.",
            "To process your orders, give you access to training and answer you — and, only with your consent, for marketing. Everything is explained in the <<privacy policy|/confidentialite>>.",
          ),
        ],
      },
      {
        id: "delete",
        question: l("Comment demander la suppression de mes données ?", "How can I request deletion of my data?"),
        answer: [
          l(
            "Depuis <<Sécurité et confidentialité|/compte/securite>> (suppression du compte et export des données), ou via la catégorie « Demande de confidentialité » du <<formulaire de contact|/contact?sujet=privacy>>. Certaines données, comme les factures, doivent être conservées par la loi.",
            "From <<Security & privacy|/compte/securite>> (account deletion and data export), or through the “Privacy request” category of the <<contact form|/contact?sujet=privacy>>. Some data, such as invoices, must be kept by law.",
          ),
        ],
      },
      {
        id: "cookies",
        question: l("Comment modifier mes préférences cookies ?", "How can I change cookie preferences?"),
        answer: [
          l(
            "Cliquez sur « Paramètres cookies » en bas de chaque page, ou rendez-vous sur la <<politique cookies|/cookies>>.",
            "Click “Cookie settings” at the bottom of any page, or go to the <<cookie policy|/cookies>>.",
          ),
        ],
      },
    ],
  },
];
