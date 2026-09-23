import type { Localized } from "../types";
import { l, type ContactCategory, type IconKey } from "./types";

/**
 * Frequently asked questions.
 *
 * Answers describe what the prototype actually does (where orders, profile,
 * certificates and the data export live) and point to the policy pages for
 * the rules. Anything the business has not decided stays a placeholder here
 * too, so an FAQ answer can never contradict the terms it summarises.
 */

export interface FaqItem {
  id: string;
  question: Localized;
  /** Paragraphs. */
  answer: Localized[];
}

export interface FaqCategory {
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
            "Tant qu’elle n’est pas expédiée, écrivez-nous rapidement via le <<formulaire de contact|/contact?sujet=order>> avec votre numéro de commande. Nous ferons notre possible : [[Modifications possibles et délai]].",
            "As long as it has not shipped, write to us quickly through the <<contact form|/contact?sujet=order>> with your order number. We will do our best: [[Changes possible and deadline]].",
          ),
        ],
      },
      {
        id: "cancel-order",
        question: l("Puis-je annuler ma commande ?", "Can I cancel my order?"),
        answer: [
          l(
            "Oui, avant expédition : [[Délai ou étape jusqu’à laquelle l’annulation est possible]]. Après réception, vous pouvez exercer votre droit de rétractation — voir <<Retours et remboursements|/retours-remboursements>>.",
            "Yes, before shipping: [[Period or stage up to which cancellation is possible]]. After delivery, you can exercise your right of withdrawal — see <<Returns & refunds|/retours-remboursements>>.",
          ),
        ],
      },
      {
        id: "order-confirmed",
        question: l("Comment savoir si ma commande est confirmée ?", "How do I know my order was confirmed?"),
        answer: [
          l(
            "Un récapitulatif s’affiche après le paiement et un e-mail de confirmation vous est envoyé. Vous retrouvez aussi chaque commande et son statut dans <<Mes commandes|/compte/commandes>>.",
            "A summary is shown after payment and a confirmation email is sent to you. You can also find every order and its status in <<My orders|/compte/commandes>>.",
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
            "Pas nécessairement. La pose d’un bijou dentaire suppose des dents et une hygiène buccale en bonne santé. En cas de doute, demandez l’avis d’un dentiste avant la pose. [[Contre-indications et public visé à valider]]",
            "Not necessarily. Applying a tooth gem assumes healthy teeth and good oral hygiene. If in doubt, ask a dentist before application. [[Contraindications and target audience to validate]]",
          ),
        ],
      },
      {
        id: "use",
        question: l("Comment utiliser les produits ?", "How should products be used?"),
        answer: [
          l(
            "Suivez les instructions de la fiche produit et les techniques enseignées dans l’<<Academy|/academy>>. Certains produits sont destinés à un usage professionnel : [[Produits réservés aux professionnels]].",
            "Follow the product page instructions and the techniques taught in the <<Academy|/academy>>. Some products are intended for professional use: [[Products reserved for professionals]].",
          ),
        ],
      },
      {
        id: "maintain",
        question: l("Comment entretenir les produits ?", "How should products be maintained?"),
        answer: [
          l(
            "Conservez les gems et adhésifs dans leur emballage, à l’abri de la chaleur et de l’humidité. Les conseils d’entretien après la pose sont donnés dans la catégorie <<Suivi client|/boutique?categorie=Suivi>> de la boutique. [[Conditions de conservation par produit]]",
            "Keep gems and adhesives in their packaging, away from heat and moisture. Aftercare advice is given in the shop’s <<Aftercare|/boutique?categorie=Suivi>> category. [[Storage conditions per product]]",
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
        answer: [l("[[Liste des pays et zones de livraison]] — voir la page <<Livraison|/livraison#destinations>>.", "[[List of delivery countries and zones]] — see <<Shipping & delivery|/livraison#destinations>>.")],
      },
      {
        id: "times",
        question: l("Quels sont les délais de livraison ?", "What are the delivery times?"),
        answer: [
          l(
            "Préparation sous [[Délai de préparation]], puis acheminement selon la zone. Le délai estimé de votre commande est affiché avant le paiement.",
            "Preparation within [[Preparation time]], then transit depending on the zone. The estimated time for your order is shown before payment.",
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
            "Contactez-nous d’abord via la catégorie « Retour / remboursement » : nous vous envoyons les instructions. Tout le processus est détaillé sur la page <<Retours et remboursements|/retours-remboursements>>.",
            "Contact us first through the “Return / refund” category: we will send you instructions. The whole process is on the <<Returns & refunds|/retours-remboursements>> page.",
          ),
        ],
      },
      {
        id: "period",
        question: l("De combien de temps est-ce que je dispose ?", "What is the return period?"),
        answer: [
          l(
            "[[Délai de retour offert]]. Pour les consommateurs de l’UE, la loi prévoit en règle générale au moins 14 jours à compter de la réception.",
            "[[Return period offered]]. For EU consumers, the law generally provides at least 14 days from receipt.",
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
            "Pour un changement d’avis : [[Règle retenue]]. Pour un produit défectueux, endommagé ou erroné : nous.",
            "For a change of mind: [[Rule chosen]]. For a defective, damaged or wrong product: we do.",
          ),
        ],
      },
      {
        id: "non-returnable",
        question: l("Certains produits ne peuvent-ils pas être retournés ?", "Are there products that cannot be returned?"),
        answer: [
          l(
            "Oui, dans les cas prévus par la loi — notamment les produits scellés pour des raisons d’hygiène une fois descellés. La liste figure sur la page <<Retours|/retours-remboursements#non-returnable>> : [[Produits exclus à confirmer]].",
            "Yes, where the law allows — in particular products sealed for hygiene reasons once unsealed. The list is on the <<Returns|/retours-remboursements#non-returnable>> page: [[Excluded products to confirm]].",
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
        answer: [l("[[Moyens de paiement activés]] — ils sont affichés sur la page de paiement.", "[[Payment methods enabled]] — they are shown on the payment page.")],
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
            "Stripe est notre prestataire de paiement : il traite la transaction pour notre compte. Vous saisissez vos informations de carte sur sa page sécurisée, puis revenez sur Global Toothgems. Son nom ou [[Libellé sur le relevé bancaire]] peut apparaître sur votre relevé.",
            "Stripe is our payment provider: it processes the transaction on our behalf. You enter your card details on its secure page, then return to Global Toothgems. Its name or [[Bank-statement descriptor]] may appear on your statement.",
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
          l(
            "Après l’achat, la formation apparaît dans votre espace <<Mon compte|/compte>>. Vous suivez les leçons vidéo à votre rythme, dans l’ordre du programme présenté sur l’<<Academy|/academy>>. Durée d’accès : [[Durée d’accès aux formations]].",
            "After purchase, the course appears in <<My account|/compte>>. You follow the video lessons at your own pace, in the programme order shown on the <<Academy|/academy>>. Access duration: [[Training access duration]].",
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
            "La formation est validée dès que vous atteignez le score requis aux questions de validation : [[Score requis par formation]]. Une attestation est alors délivrée.",
            "The course is validated as soon as you reach the required score on the validation questions: [[Required score per course]]. A certificate is then issued.",
          ),
        ],
      },
      {
        id: "certificates",
        question: l("Où trouver mes attestations ?", "Where can I find my certificates?"),
        answer: [
          l(
            "Dans <<Mes attestations|/compte/attestations>>, où vous pouvez les consulter et les télécharger. [[Valeur et reconnaissance de l’attestation à préciser]]",
            "In <<My certificates|/compte/attestations>>, where you can view and download them. [[Status and recognition of the certificate to specify]]",
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
