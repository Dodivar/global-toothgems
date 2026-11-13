import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";
import { ADVERTISING_ENABLED } from "../../lib/metaPixelConfig";

/**
 * Privacy policy, written for a GDPR-conscious European shop.
 *
 * Completed on 2026-11-08 with the owner's go-ahead (decision 126): the
 * providers named are the ones the code actually calls, the retention periods
 * are decision 125 (a)'s, and the data controller is the seller — the business
 * customers contract with — filled in from the store's details by
 * `storeFill.ts` (`[[!Responsable du traitement]]`). Who the controller is
 * remains the owner's (or a lawyer's) call, decision 121.
 *
 * Meta (advertising pixel, 2026-11-13) is named only once the pixel is
 * configured (`ADVERTISING_ENABLED`, `lib/metaPixelConfig.ts`); wording to be
 * reviewed by a lawyer (supabase/README.md, review of 2026-11-11).
 */

const PART = {
  who: l("Qui sommes-nous", "Who we are"),
  what: l("Données collectées", "Data we collect"),
  who2: l("Prestataires", "Service providers"),
  why: l("Utilisation", "How we use it"),
  rights: l("Vos droits", "Your rights"),
  more: l("Informations complémentaires", "Further information"),
};

const EU = l("Union européenne", "European Union");
const US_DPF = l("États-Unis (Data Privacy Framework ou clauses contractuelles types)", "United States (Data Privacy Framework or standard contractual clauses)");

export const PRIVACY: LegalDocument = {
  id: "privacy",
  path: LEGAL_PATHS.privacy,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Politique de confidentialité", "Privacy policy"),
  intro: l(
    "Quelles données nous collectons quand vous achetez, vous formez, utilisez le Studio 3D ou nous écrivez, pourquoi, combien de temps nous les gardons, et comment exercer vos droits.",
    "What data we collect when you shop, train, use the 3D Studio or write to us, why, how long we keep it, and how to exercise your rights.",
  ),
  updated: DRAFT_DATE,
  showKey: true,
  contactCategory: "privacy",
  lead: [
    {
      kind: "callout",
      tone: "policy",
      title: l("En bref", "In short"),
      text: l(
        "Nous collectons ce qui est nécessaire pour vous livrer, vous former et vous répondre. Nous ne vendons pas vos données. La mesure d’audience et les e-mails marketing ne sont utilisés qu’avec votre accord, que vous pouvez retirer à tout moment.",
        "We collect what we need to deliver your orders, train you and answer you. We do not sell your data. Audience measurement and marketing emails are only used with your consent, which you can withdraw at any time.",
      ),
    },
    // Editor's note, never published: Completed on 8 November 2026 (decision 126). For the business to confirm: the data controller chosen (the seller, the publisher acting on its behalf), and the purge jobs that apply the retention periods stated.
  ],
  sections: [
    {
      id: "controller",
      part: PART.who,
      title: l("Responsable du traitement", "Data controller"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Deux entreprises sont responsables de vos données, chacune pour ce qu’elle vous vend. Le vendeur des produits, formations et cartes cadeaux, identifié dans les <<mentions légales|/mentions-legales#seller>>, est responsable de votre compte, de vos commandes, de l’Academy, du Club fidélité, de la newsletter et de vos échanges avec le service client. L’éditeur du site, qui vend le Studio 3D (<<mentions légales|/mentions-legales#studio-seller>>), est responsable de votre abonnement au Studio (paiement, factures), de vos créations, de la page Glowbook et de l’essai sur un sourire. L’éditeur assure aussi la réalisation et la maintenance technique du site pour le compte du vendeur, selon ses instructions.",
            "Two businesses are responsible for your data, each for what it sells you. The seller of the products, courses and gift cards, identified in the <<legal notice|/mentions-legales#seller>>, is the controller of your account, your orders, the Academy, the Loyalty Club, the newsletter and your exchanges with customer service. The website publisher, which sells the 3D Studio (<<legal notice|/mentions-legales#studio-seller>>), is the controller of your Studio subscription (payment, invoices), your creations, the Glowbook page and the smile try-on. The publisher also builds and maintains the site on the seller’s behalf and on its instructions.",
          ),
        },
        {
          kind: "fields",
          fields: [
            { label: l("Responsable du traitement", "Data controller"), value: l("[[!Responsable du traitement]]", "[[!Data controller]]") },
            { label: l("Adresse", "Address"), value: l("[[!Adresse du siège]]", "[[!Registered office address]]") },
            {
              label: l("Responsable du traitement — Studio 3D", "Data controller — 3D Studio"),
              value: l("[[!Vendeur du Studio, dénomination et forme juridique]]", "[[!Studio seller legal name and entity type]]"),
            },
            { label: l("Adresse — Studio 3D", "Address — 3D Studio"), value: l("[[!Adresse du vendeur du Studio]]", "[[!Studio seller address]]") },
            { label: l("Contact confidentialité", "Privacy contact"), value: l("[[!E-mail confidentialité]]", "[[!Privacy email]]") },
            {
              label: l("Délégué à la protection des données", "Data protection officer"),
              value: l("Non désigné", "Not appointed"),
              hint: l("Sa désignation n’est pas obligatoire pour notre activité ; écrivez au contact ci-dessus.", "Appointing one is not mandatory for our activity; write to the contact above."),
            },
          ],
        },
      ],
    },
    {
      id: "categories",
      part: PART.what,
      title: l("Catégories de données collectées", "Categories of personal data"),
      blocks: [
        {
          kind: "table",
          caption: l("Données collectées selon votre utilisation du site", "Data collected depending on how you use the site"),
          columns: [
            { key: "context", label: l("Contexte", "Context") },
            { key: "data", label: l("Données", "Data") },
            { key: "source", label: l("Source", "Source") },
          ],
          rows: [
            {
              context: l("Compte", "Account"),
              data: l("Nom, e-mail, mot de passe (chiffré), profil choisi, préférences, photo de profil", "Name, email, password (hashed), chosen profile, preferences, profile picture"),
              source: l("Vous, Google si vous vous connectez avec Google", "You, Google if you sign in with Google"),
            },
            {
              context: l("Commandes et facturation", "Orders and billing"),
              data: l("Produits achetés, montants, adresse de facturation, factures, historique", "Products bought, amounts, billing address, invoices, history"),
              source: l("Vous", "You"),
            },
            {
              context: l("Livraison", "Shipping"),
              data: l("Nom du destinataire, adresse, téléphone, suivi du colis", "Recipient name, address, phone, parcel tracking"),
              source: l("Vous, transporteur", "You, carrier"),
            },
            {
              context: l("Paiement", "Payment"),
              data: l("Statut du paiement et du remboursement, références de transaction (aucune donnée de carte)", "Payment and refund status, transaction references (no card data)"),
              source: l("Stripe", "Stripe"),
            },
            {
              context: l("Contact et service client", "Contact and customer service"),
              data: l("Message, catégorie, n° de commande, pièces jointes, échanges", "Message, category, order number, attachments, exchanges"),
              source: l("Vous", "You"),
            },
            {
              context: l("Formation", "Training"),
              data: l("Inscriptions, progression, réponses et scores aux quiz, attestations", "Enrolments, progress, quiz answers and scores, certificates"),
              source: l("Vous, la plateforme", "You, the platform"),
            },
            {
              context: l("Studio 3D et Glowbook", "3D Studio and Glowbook"),
              data: l(
                "Créations, collections, liens de partage, logo, page Glowbook (nom d’artiste, ville, lieu d’exercice, liens), abonnement",
                "Creations, collections, share links, logo, Glowbook page (artist name, city, place of work, links), subscription",
              ),
              source: l("Vous", "You"),
            },
            {
              context: l("Essai sur un sourire", "Smile try-on"),
              data: l("Photo de votre sourire et image générée, le temps du calcul (non conservées par nous)", "Photo of your smile and the generated image, for the time of the render (not kept by us)"),
              source: l("Vous", "You"),
            },
            {
              context: l("Avis et communauté", "Reviews and community"),
              data: l("Avis, notes, photos, messages dans les salons des membres, nom d’affichage", "Reviews, ratings, photos, messages in the members’ lounges, display name"),
              source: l("Vous", "You"),
            },
            {
              context: l("Modération des salons", "Lounge moderation"),
              data: l(
                "Vos signalements et leurs explications, les décisions de l’équipe qui vous concernent (avec une copie du contenu visé), vos contestations, les membres dont vous masquez les messages",
                "Your reports and their explanations, the team’s decisions that concern you (with a copy of the content concerned), your complaints, the members whose messages you hide",
              ),
              source: l("Vous, notre équipe", "You, our team"),
            },
            {
              context: l("Newsletter et marketing", "Newsletter and marketing"),
              data: l("E-mail, langue, consentement et sa date, désinscription", "Email, language, consent and its date, unsubscribe"),
              source: l("Vous", "You"),
            },
            {
              context: l("Navigation", "Browsing"),
              data: l("Données techniques (adresse IP, navigateur), pages vues et cookies selon vos choix", "Technical data (IP address, browser), pages viewed and cookies according to your choices"),
              source: l("Votre navigateur", "Your browser"),
            },
          ],
        },
      ],
    },
    {
      id: "account-data",
      part: PART.what,
      title: l("Compte, commandes et livraison", "Account, orders and shipping"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les informations de compte servent à vous identifier, à sécuriser l’accès et à vous donner accès à vos commandes, formations, créations et attestations. Les données de commande et de livraison servent à préparer, expédier et facturer vos achats, et à gérer retours et réclamations.",
            "Account information is used to identify you, secure access and give you access to your orders, courses, creations and certificates. Order and shipping data is used to prepare, ship and invoice your purchases, and to handle returns and complaints.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Si vous vous connectez avec votre compte Google, nous recevons uniquement votre nom, votre adresse e-mail et, le cas échéant, votre photo de profil.",
            "If you sign in with your Google account, we only receive your name, email address and, where available, your profile picture.",
          ),
        },
      ],
    },
    {
      id: "contact-data",
      part: PART.what,
      title: l("Formulaire de contact et service client", "Contact form and customer service"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Lorsque vous nous écrivez, nous utilisons vos coordonnées, votre message et vos éventuelles pièces jointes pour traiter votre demande et en garder la trace. N’y joignez pas d’informations de santé ou de données bancaires.",
            "When you write to us, we use your contact details, message and any attachments to handle your request and keep a record of it. Please do not include health information or bank details.",
          ),
        },
      ],
    },
    {
      id: "training-data",
      part: PART.what,
      title: l("Formation, quiz et progression", "Training, quizzes and progress"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Pour les formations de l’Academy, nous enregistrons vos inscriptions, les leçons terminées, vos réponses et scores aux quiz et la délivrance de vos attestations. Ces données servent à suivre votre progression, valider la formation et vérifier l’authenticité d’une attestation.",
            "For Academy courses, we record your enrolments, completed lessons, quiz answers and scores, and the certificates issued to you. This data is used to track your progress, validate the course and verify that a certificate is genuine.",
          ),
        },
      ],
    },
    {
      id: "studio-data",
      part: PART.what,
      title: l("Studio 3D, Glowbook et essai sur un sourire", "3D Studio, Glowbook and smile try-on"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vos créations sont enregistrées sur votre compte. Une page Glowbook et les créations que vous y ajoutez sont publiques une fois approuvées par notre équipe ; si vous indiquez un lieu d’exercice, seule une zone approximative (environ 1 km) ou l’adresse publique de votre salon est affichée, jamais une adresse personnelle.",
            "Your creations are saved to your account. A Glowbook page and the creations you add to it are public once approved by our team; if you give a place of work, only an approximate area (about 1 km) or your salon’s public address is shown, never a home address.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Pour l’essai d’une création sur un sourire, la photo que vous choisissez est envoyée à Google (service Gemini) pour vérifier qu’elle convient et générer l’image. Nous ne conservons ni la photo ni l’image : elles restent sur votre appareil pendant 24 heures au plus, pour que vous puissiez retrouver le résultat. N’envoyez que la photo d’une personne qui a donné son accord.",
            "For trying a creation on a smile, the photo you choose is sent to Google (Gemini service) to check it is suitable and generate the image. We keep neither the photo nor the image: they stay on your device for 24 hours at most, so you can find the result again. Only send a photo of someone who has agreed to it.",
          ),
        },
      ],
    },
    {
      id: "ugc",
      part: PART.what,
      title: l("Avis et contenus publiés", "Reviews and user-generated content"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les avis, photos et messages que vous publiez sont visibles par les autres visiteurs ou membres, avec le nom d’affichage que vous avez choisi. Vous pouvez demander leur suppression à tout moment ; ils sont supprimés avec votre compte.",
            "Reviews, photos and posts you publish are visible to other visitors or members, with the display name you chose. You can ask for them to be removed at any time; they are deleted with your account.",
          ),
        },
      ],
    },
    {
      id: "marketing",
      part: PART.what,
      title: l("Préférences marketing", "Marketing preferences"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous ne vous envoyons notre newsletter et nos e-mails promotionnels que si vous l’avez demandé et confirmé en cliquant sur le lien reçu par e-mail. Chaque e-mail contient un lien de désinscription ; vous pouvez aussi changer d’avis depuis votre <<profil|/compte/profil>>. Les e-mails liés à vos commandes, formations et abonnements vous sont envoyés dans tous les cas.",
            "We only send you our newsletter and promotional emails if you asked for them and confirmed by clicking the link emailed to you. Every email contains an unsubscribe link; you can also change your mind from your <<profile|/compte/profil>>. Emails about your orders, courses and subscriptions are sent to you in any case.",
          ),
        },
      ],
    },
    {
      id: "cookies",
      part: PART.what,
      title: l("Cookies et traceurs", "Cookies and tracking technologies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les cookies non essentiels ne sont déposés qu’avec votre accord. Le détail figure dans la <<politique cookies|/cookies>>, où vous pouvez aussi modifier vos choix.",
            "Non-essential cookies are only set with your consent. Details are in the <<cookie policy|/cookies>>, where you can also change your choices.",
          ),
        },
      ],
    },
    {
      id: "payment",
      part: PART.who2,
      title: l("Paiement et rôle de Stripe", "Payment and Stripe’s role"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les paiements sont traités par Stripe Payments Europe, Ltd. (Dublin, Irlande). Vos données de carte sont saisies dans le formulaire sécurisé de Stripe et ne nous sont pas transmises ; nous recevons uniquement le statut du paiement et ses références. Stripe agit comme sous-traitant pour le traitement du paiement, et comme responsable de traitement indépendant pour ses propres obligations (prévention de la fraude, lutte contre le blanchiment), selon sa politique de confidentialité.",
            "Payments are processed by Stripe Payments Europe, Ltd. (Dublin, Ireland). Your card details are entered in Stripe’s secure form and are not passed to us; we only receive the payment status and its references. Stripe acts as a processor for handling the payment, and as an independent controller for its own obligations (fraud prevention, anti-money-laundering), under its own privacy policy.",
          ),
        },
      ],
    },
    {
      id: "providers",
      part: PART.who2,
      title: l("Autres prestataires", "Other service providers"),
      blocks: [
        {
          kind: "table",
          caption: l("Prestataires qui traitent des données pour notre compte", "Providers processing data on our behalf"),
          columns: [
            { key: "role", label: l("Fonction", "Function") },
            { key: "provider", label: l("Prestataire", "Provider") },
            { key: "location", label: l("Localisation des données", "Data location") },
          ],
          rows: [
            { role: l("Hébergement du site", "Website hosting"), provider: l("Vercel Inc.", "Vercel Inc."), location: US_DPF },
            {
              role: l("Base de données, comptes, fichiers et vidéos des formations", "Database, accounts, files and course videos"),
              provider: l("Supabase Inc.", "Supabase Inc."),
              location: l("Union européenne (Paris)", "European Union (Paris)"),
            },
            { role: l("E-mails de service et newsletter", "Service emails and newsletter"), provider: l("Resend (Plus Five Five, Inc.)", "Resend (Plus Five Five, Inc.)"), location: US_DPF },
            { role: l("Mesure d’audience, avec votre accord", "Audience measurement, with your consent"), provider: l("PostHog Inc.", "PostHog Inc."), location: l("Union européenne (Francfort)", "European Union (Frankfurt)") },
            ...(ADVERTISING_ENABLED
              ? [
                  {
                    role: l(
                      "Mesure des publicités Facebook et Instagram (pixel Meta), avec votre accord — responsable conjoint pour la collecte",
                      "Measuring Facebook and Instagram ads (Meta pixel), with your consent — joint controller for the collection",
                    ),
                    provider: l("Meta Platforms Ireland Ltd", "Meta Platforms Ireland Ltd"),
                    location: US_DPF,
                  },
                ]
              : []),
            { role: l("Livraison", "Delivery"), provider: l("La Poste (Colissimo), Chronopost, GLS", "La Poste (Colissimo), Chronopost, GLS"), location: l("France et pays de destination", "France and the destination country") },
            { role: l("Connexion avec Google", "Sign-in with Google"), provider: l("Google Ireland Ltd / Google LLC", "Google Ireland Ltd / Google LLC"), location: US_DPF },
            { role: l("Essai d’une création sur un sourire (IA)", "Trying a creation on a smile (AI)"), provider: l("Google (API Gemini)", "Google (Gemini API)"), location: US_DPF },
            {
              role: l("Cartes des pages Glowbook (chargées quand vous les faites défiler)", "Glowbook page maps (loaded as you scroll to them)"),
              provider: l("OpenFreeMap — données © OpenStreetMap", "OpenFreeMap — data © OpenStreetMap"),
              location: EU,
            },
            {
              role: l("Recherche d’adresse dans le Studio (artistes)", "Address search in the Studio (artists)"),
              provider: l("Nominatim — Fondation OpenStreetMap", "Nominatim — OpenStreetMap Foundation"),
              location: l("Royaume-Uni et Union européenne (décision d’adéquation)", "United Kingdom and European Union (adequacy decision)"),
            },
          ],
        },
      ],
    },
    {
      id: "purposes",
      part: PART.why,
      title: l("Finalités et bases légales", "Purposes and legal bases"),
      blocks: [
        {
          kind: "table",
          caption: l("Pourquoi nous traitons vos données, et sur quel fondement", "Why we process your data, and on what basis"),
          columns: [
            { key: "purpose", label: l("Finalité", "Purpose") },
            { key: "basis", label: l("Base légale", "Legal basis") },
          ],
          rows: [
            { purpose: l("Gérer votre compte", "Manage your account"), basis: l("Exécution du contrat (CGU)", "Performance of a contract (terms of use)") },
            { purpose: l("Traiter, livrer et facturer vos commandes", "Process, deliver and invoice orders"), basis: l("Exécution du contrat", "Performance of a contract") },
            { purpose: l("Donner accès aux formations, suivre la progression, délivrer les attestations", "Provide training, track progress, issue certificates"), basis: l("Exécution du contrat", "Performance of a contract") },
            { purpose: l("Fournir le Studio 3D, les liens de partage et la page Glowbook", "Provide the 3D Studio, share links and the Glowbook page"), basis: l("Exécution du contrat", "Performance of a contract") },
            { purpose: l("Essai d’une création sur un sourire", "Trying a creation on a smile"), basis: l("Consentement (donné à chaque envoi de photo)", "Consent (given each time a photo is sent)") },
            { purpose: l("Conserver les factures et pièces comptables", "Keep invoices and accounting records"), basis: l("Obligation légale", "Legal obligation") },
            { purpose: l("Répondre à vos demandes", "Answer your requests"), basis: l("Intérêt légitime ou mesures précontractuelles", "Legitimate interest or pre-contractual steps") },
            { purpose: l("Prévenir la fraude et sécuriser le site", "Prevent fraud and secure the site"), basis: l("Intérêt légitime", "Legitimate interest") },
            { purpose: l("Publier vos avis et messages", "Publish your reviews and posts"), basis: l("Exécution du contrat (CGU), à votre initiative", "Performance of a contract (terms of use), at your initiative") },
            {
              purpose: l("Traiter les signalements, modérer les salons, répondre aux contestations", "Handle reports, moderate the lounges, answer complaints"),
              basis: l("Obligation légale (loi pour la confiance dans l’économie numérique, règlement sur les services numériques) et exécution du contrat (CGU)", "Legal obligation (French LCEN, Digital Services Act) and performance of a contract (terms of use)"),
            },
            { purpose: l("Envoyer la newsletter et des e-mails marketing", "Send the newsletter and marketing emails"), basis: l("Consentement", "Consent") },
            { purpose: l("Mesure d’audience et cookies non essentiels", "Audience measurement and non-essential cookies"), basis: l("Consentement", "Consent") },
            ...(ADVERTISING_ENABLED
              ? [
                  {
                    purpose: l(
                      "Mesurer nos publicités Facebook et Instagram et y montrer nos produits (pixel Meta, pages de la boutique, sans nom ni e-mail)",
                      "Measure our Facebook and Instagram ads and show our products there (Meta pixel, shop pages, no name or e-mail)",
                    ),
                    basis: l("Consentement (catégorie « Publicité »)", "Consent (“Advertising” category)"),
                  },
                ]
              : []),
          ],
        },
      ],
    },
    {
      id: "retention",
      part: PART.why,
      title: l("Durées de conservation", "Data retention periods"),
      blocks: [
        {
          kind: "table",
          caption: l("Combien de temps nous gardons vos données", "How long we keep your data"),
          columns: [
            { key: "data", label: l("Données", "Data") },
            { key: "period", label: l("Durée", "Period") },
          ],
          rows: [
            { data: l("Compte, créations, progression et attestations", "Account, creations, progress and certificates"), period: l("Jusqu’à la suppression de votre compte", "Until you delete your account") },
            {
              data: l("Commandes, factures et avoirs", "Orders, invoices and credit notes"),
              period: l("10 ans à compter de la clôture de l’exercice (obligation comptable), détachés de votre compte s’il est supprimé", "10 years from the end of the financial year (accounting obligation), detached from your account if it is deleted"),
            },
            { data: l("Demandes au service client et pièces jointes", "Customer service requests and attachments"), period: l("3 ans après le dernier échange, puis effacées automatiquement", "3 years after the last exchange, then erased automatically") },
            {
              data: l("Newsletter", "Newsletter"),
              period: l(
                "Jusqu’à votre désinscription ; l’adresse est ensuite gardée sur une liste d’opposition, pour ne plus vous écrire. Une inscription jamais confirmée est effacée 30 jours après l’expiration du lien de confirmation",
                "Until you unsubscribe; the address is then kept on an opt-out list, so we no longer write to you. A sign-up never confirmed is erased 30 days after its confirmation link expired",
              ),
            },
            {
              data: l("Alertes de retour en stock", "Back-in-stock alerts"),
              period: l("1 an après l’envoi de l’alerte ; 3 ans après la demande si le produit n’est jamais revenu", "1 year after the alert is sent; 3 years after the request if the product never came back"),
            },
            {
              data: l("Preuves de consentement", "Proof of consent"),
              period: l(
                "Tant que le consentement est en vigueur, puis 5 ans après son retrait ou son remplacement ; 5 ans pour une preuve liée à un achat",
                "While the consent is in force, then 5 years after it is withdrawn or replaced; 5 years for a proof tied to a purchase",
              ),
            },
            {
              data: l("Signalements, décisions de modération et contestations des salons", "Lounge reports, moderation decisions and complaints"),
              period: l(
                "Les textes (explications, copie du contenu visé, contestation) 12 mois après la décision, puis le reste 3 ans après, sauf contestation en cours ; effacés ou détachés de votre compte s’il est supprimé. Les membres que vous masquez : jusqu’à la suppression de votre compte",
                "The texts (explanations, copy of the content concerned, complaint) 12 months after the decision, then the rest 3 years after, unless a complaint is under way; erased or detached from your account if it is deleted. The members you hide: until you delete your account",
              ),
            },
            { data: l("Photo envoyée pour un essai sur un sourire", "Photo sent for a smile try-on"), period: l("Non conservée par nous (24 heures au plus sur votre appareil)", "Not kept by us (24 hours at most on your device)") },
            { data: l("Cookies", "Cookies"), period: l("Voir la <<politique cookies|/cookies>>", "See the <<cookie policy|/cookies>>") },
          ],
        },
      ],
    },
    {
      id: "recipients",
      part: PART.why,
      title: l("Destinataires", "Data recipients"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vos données sont accessibles aux seules personnes qui en ont besoin au sein de Global Toothgems, à nos prestataires dans la limite de leur mission, et aux autorités lorsque la loi l’exige. Nous ne vendons pas vos données.",
            "Your data is accessible only to the people at Global Toothgems who need it, to our providers within the limits of their task, and to authorities where the law requires. We do not sell your data.",
          ),
        },
      ],
    },
    {
      id: "transfers",
      part: PART.why,
      title: l("Transferts hors de l’Union européenne", "International data transfers"),
      blocks: [
        {
          kind: "p",
          text: ADVERTISING_ENABLED
            ? l(
                "Notre base de données est hébergée dans l’Union européenne. Certains prestataires (Vercel, Resend, Google) et Meta, si vous acceptez la publicité, sont établis aux États-Unis ou y transfèrent des données : ces transferts reposent sur le cadre de protection des données UE–États-Unis (Data Privacy Framework) lorsque le destinataire y adhère, et à défaut sur les clauses contractuelles types de la Commission européenne. Les transferts vers le Royaume-Uni reposent sur une décision d’adéquation.",
                "Our database is hosted in the European Union. Some providers (Vercel, Resend, Google) and Meta, if you accept advertising, are established in the United States or transfer data there: these transfers rely on the EU–US Data Privacy Framework where the recipient has joined it, and otherwise on the European Commission’s standard contractual clauses. Transfers to the United Kingdom rely on an adequacy decision.",
              )
            : l(
            "Notre base de données est hébergée dans l’Union européenne. Certains prestataires (Vercel, Resend, Google) sont établis aux États-Unis et peuvent y traiter des données : ces transferts reposent sur le cadre de protection des données UE–États-Unis (Data Privacy Framework) lorsque le prestataire y adhère, et à défaut sur les clauses contractuelles types de la Commission européenne. Les transferts vers le Royaume-Uni reposent sur une décision d’adéquation.",
            "Our database is hosted in the European Union. Some providers (Vercel, Resend, Google) are established in the United States and may process data there: these transfers rely on the EU–US Data Privacy Framework where the provider has joined it, and otherwise on the European Commission’s standard contractual clauses. Transfers to the United Kingdom rely on an adequacy decision.",
          ),
        },
      ],
    },
    {
      id: "rights",
      part: PART.rights,
      title: l("Vos droits sur vos données", "Your privacy rights"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le RGPD vous donne les droits suivants. Vous pouvez les exercer gratuitement ; nous répondons dans un délai d’un mois, qui peut être prolongé dans certains cas.",
            "The GDPR gives you the following rights. You can exercise them free of charge; we reply within one month, which may be extended in some cases.",
          ),
        },
        {
          kind: "cards",
          items: [
            { icon: "eye", title: l("Accès", "Access"), text: l("Savoir quelles données nous détenons sur vous et en obtenir une copie.", "Find out what data we hold about you and get a copy.") },
            { icon: "pencil", title: l("Rectification", "Rectification"), text: l("Corriger des données inexactes ou incomplètes — la plupart directement depuis votre <<profil|/compte/profil>>.", "Correct inaccurate or incomplete data — most of it directly from your <<profile|/compte/profil>>.") },
            { icon: "trash", title: l("Effacement", "Erasure"), text: l("Supprimer votre compte depuis <<Sécurité et confidentialité|/compte/securite>>, ou nous demander d’effacer vos données, sauf celles que la loi nous oblige à conserver.", "Delete your account from <<Security & privacy|/compte/securite>>, or ask us to erase your data, except what the law requires us to keep.") },
            { icon: "pause", title: l("Limitation", "Restriction"), text: l("Geler l’utilisation de vos données, par exemple pendant la vérification d’une contestation.", "Freeze the use of your data, for example while a dispute is being checked.") },
            { icon: "hand", title: l("Opposition", "Objection"), text: l("Vous opposer à un traitement fondé sur notre intérêt légitime, et à tout moment au marketing.", "Object to processing based on our legitimate interest, and to marketing at any time.") },
            { icon: "download", title: l("Portabilité", "Portability"), text: l("Télécharger vos données dans un fichier structuré depuis <<Sécurité et confidentialité|/compte/securite>>.", "Download your data as a structured file from <<Security & privacy|/compte/securite>>.") },
            { icon: "undo", title: l("Retrait du consentement", "Withdraw consent"), text: l("Retirer à tout moment un consentement donné (e-mails, <<cookies|/cookies>>), sans effet sur le passé.", "Withdraw any consent at any time (emails, <<cookies|/cookies>>), without affecting past processing.") },
            {
              icon: "scale",
              title: l("Réclamation", "Complaint"),
              text: l(
                "Saisir la CNIL (Commission nationale de l’informatique et des libertés, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, cnil.fr) ou l’autorité de protection des données de votre pays.",
                "Lodge a complaint with the CNIL (Commission nationale de l’informatique et des libertés, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France, cnil.fr) or the data protection authority of your country.",
              ),
            },
          ],
        },
        {
          kind: "p",
          text: l(
            "Vous pouvez aussi définir des directives sur le sort de vos données après votre décès (article 85 de la loi Informatique et Libertés).",
            "You can also set instructions on what happens to your data after your death (article 85 of the French Data Protection Act).",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          title: l("Exercer vos droits", "Exercising your rights"),
          text: l(
            "Écrivez-nous via le <<formulaire de contact — catégorie « Demande de confidentialité »|/contact?sujet=privacy>> ou à [[!E-mail confidentialité]]. Nous pourrons vous demander de confirmer votre identité avant de répondre.",
            "Write to us through the <<contact form — “Privacy request” category|/contact?sujet=privacy>> or at [[!Privacy email]]. We may ask you to confirm your identity before replying.",
          ),
        },
      ],
    },
    {
      id: "security",
      part: PART.more,
      title: l("Sécurité des données", "Data security"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous mettons en œuvre des mesures techniques et organisationnelles adaptées : connexions chiffrées (HTTPS), mots de passe stockés sous forme hachée, contrôle d’accès appliqué par la base de données à chaque lecture et écriture, fichiers personnels et contenus de formation dans des espaces privés servis par des liens temporaires, accès de l’équipe limité selon son rôle et actions sensibles journalisées. Aucun système n’étant infaillible, nous vous informerons si une violation de données présentant un risque élevé vous concerne.",
            "We use appropriate technical and organisational measures: encrypted connections (HTTPS), passwords stored hashed, access control enforced by the database on every read and write, personal files and course content in private storage served through temporary links, team access limited by role and sensitive actions logged. As no system is infallible, we will inform you if a data breach presenting a high risk affects you.",
          ),
        },
      ],
    },
    {
      id: "automated",
      part: PART.more,
      title: l("Décisions automatisées et profilage", "Automated decision-making and profiling"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous ne prenons aucune décision produisant des effets juridiques à votre égard sur la seule base d’un traitement automatisé, et ne faisons pas de profilage publicitaire. Notre prestataire de paiement analyse automatiquement chaque transaction pour détecter la fraude et peut refuser un paiement à risque : dans ce cas, contactez-nous pour qu’une personne examine la situation.",
            "We make no decision with legal effects on you based solely on automated processing, and do no advertising profiling. Our payment provider automatically analyses each transaction to detect fraud and may decline a risky payment: if that happens, contact us so that a person can look into it.",
          ),
        },
      ],
    },
    {
      id: "children",
      part: PART.more,
      title: l("Mineurs", "Children’s privacy"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le site ne s’adresse pas aux enfants. Il faut avoir au moins 15 ans pour créer un compte, et l’accord d’un représentant légal pour commander avant 18 ans. Si vous pensez qu’un mineur de moins de 15 ans nous a transmis des données, contactez-nous : nous les supprimerons.",
            "The site is not intended for children. You must be at least 15 to create an account, and have a legal guardian’s consent to order under 18. If you think a child under 15 has given us their data, please contact us: we will delete it.",
          ),
        },
      ],
    },
    {
      id: "updates",
      part: PART.more,
      title: l("Mises à jour de cette politique", "Policy updates"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous pouvons faire évoluer cette politique. La date de dernière mise à jour figure en haut de la page ; en cas de changement important, nous vous en informerons par e-mail ou sur le site.",
            "We may update this policy. The last-updated date is shown at the top of the page; for significant changes, we will let you know by email or on the site.",
          ),
        },
      ],
    },
    {
      id: "contact",
      part: PART.more,
      title: l("Nous contacter", "Contact us about privacy"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Pour toute question sur vos données : <<formulaire de contact, catégorie « Demande de confidentialité »|/contact?sujet=privacy>>, ou [[!E-mail confidentialité]].",
            "For any question about your data: <<contact form, “Privacy request” category|/contact?sujet=privacy>>, or [[!Privacy email]].",
          ),
        },
      ],
    },
  ],
};
