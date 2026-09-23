import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Privacy policy, written for a GDPR-conscious European shop.
 *
 * The only processor named is Stripe, because the project has chosen it for
 * payments. Every other provider (hosting, email, analytics…) is a placeholder:
 * the architecture documents list candidates, but none is confirmed, and a
 * privacy policy that names the wrong processor is wrong in a way that matters.
 */

const PART = {
  who: l("Qui sommes-nous", "Who we are"),
  what: l("Données collectées", "Data we collect"),
  who2: l("Prestataires", "Service providers"),
  why: l("Utilisation", "How we use it"),
  rights: l("Vos droits", "Your rights"),
  more: l("Informations complémentaires", "Further information"),
};

export const PRIVACY: LegalDocument = {
  id: "privacy",
  path: LEGAL_PATHS.privacy,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Politique de confidentialité", "Privacy policy"),
  intro: l(
    "Quelles données nous collectons quand vous achetez, vous formez ou nous écrivez, pourquoi, combien de temps nous les gardons, et comment exercer vos droits.",
    "What data we collect when you shop, train or write to us, why, how long we keep it, and how to exercise your rights.",
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
        "Nous collectons ce qui est nécessaire pour vous livrer, vous former et vous répondre. Nous ne vendons pas vos données. Les cookies et e-mails marketing optionnels ne sont utilisés qu’avec votre accord, que vous pouvez retirer à tout moment.",
        "We collect what we need to deliver your orders, train you and answer you. We do not sell your data. Optional cookies and marketing emails are only used with your consent, which you can withdraw at any time.",
      ),
    },
    {
      kind: "internal",
      text: l(
        "Aucun prestataire n’est nommé ici hormis Stripe (choix de paiement du projet). Les documents d’architecture citent des candidats (hébergement applicatif, base de données, e-mail transactionnel, analytics) : les confirmer, vérifier leurs contrats de sous-traitance et leurs transferts hors UE avant de les ajouter.",
        "No provider is named here other than Stripe (the project’s payment choice). The architecture documents list candidates (application hosting, database, transactional email, analytics): confirm them and check their processing agreements and non-EU transfers before adding them.",
      ),
    },
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
            "Le responsable du traitement de vos données est l’éditeur du site, identifié dans les <<mentions légales|/mentions-legales>>.",
            "The controller of your data is the website publisher, identified in the <<legal notice|/mentions-legales>>.",
          ),
        },
        {
          kind: "fields",
          fields: [
            { label: l("Responsable du traitement", "Data controller"), placeholder: l("Dénomination sociale", "Legal business name") },
            { label: l("Adresse", "Address"), placeholder: l("Adresse du siège", "Registered office address") },
            { label: l("Contact confidentialité", "Privacy contact"), placeholder: l("E-mail dédié aux demandes de confidentialité", "Email for privacy requests") },
            {
              label: l("Délégué à la protection des données", "Data protection officer"),
              placeholder: l("Coordonnées du DPO, si désigné", "DPO contact details, if appointed"),
              hint: l("Une désignation n’est obligatoire que dans certains cas.", "Appointment is only mandatory in certain cases."),
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
              data: l("Nom, e-mail, mot de passe (chiffré), profil choisi, préférences", "Name, email, password (hashed), chosen profile, preferences"),
              source: l("Vous", "You"),
            },
            {
              context: l("Commandes et facturation", "Orders and billing"),
              data: l("Produits achetés, montants, adresse de facturation, historique", "Products bought, amounts, billing address, history"),
              source: l("Vous", "You"),
            },
            {
              context: l("Livraison", "Shipping"),
              data: l("Nom du destinataire, adresse, téléphone, suivi du colis", "Recipient name, address, phone, parcel tracking"),
              source: l("Vous, transporteur", "You, carrier"),
            },
            {
              context: l("Paiement", "Payment"),
              data: l("Statut du paiement, [[Informations de carte reçues de Stripe, le cas échéant]]", "Payment status, [[Card details received from Stripe, if any]]"),
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
              context: l("Avis et communauté", "Reviews and community"),
              data: l("Avis, notes, photos, messages publiés, pseudonyme", "Reviews, ratings, photos, posts, display name"),
              source: l("Vous", "You"),
            },
            {
              context: l("Marketing", "Marketing"),
              data: l("Consentement aux e-mails, date du consentement, désinscription", "Email consent, date of consent, unsubscribe"),
              source: l("Vous", "You"),
            },
            {
              context: l("Navigation", "Browsing"),
              data: l("Données techniques et cookies selon vos choix", "Technical data and cookies according to your choices"),
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
            "Les informations de compte servent à vous identifier, à sécuriser l’accès et à vous donner accès à vos commandes, formations et attestations. Les données de commande et de livraison servent à préparer, expédier et facturer vos achats, et à gérer retours et réclamations.",
            "Account information is used to identify you, secure access and give you access to your orders, courses and certificates. Order and shipping data is used to prepare, ship and invoice your purchases, and to handle returns and complaints.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Si vous vous connectez avec un compte tiers, nous recevons uniquement les informations nécessaires à la connexion : [[Fournisseurs de connexion tiers proposés]].",
            "If you sign in with a third-party account, we only receive the information needed to sign you in: [[Third-party sign-in providers offered]].",
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
      id: "ugc",
      part: PART.what,
      title: l("Avis et contenus publiés", "Reviews and user-generated content"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les avis, photos et messages que vous publiez sont visibles par les autres visiteurs ou membres, avec le nom d’affichage que vous avez choisi. Vous pouvez demander leur suppression à tout moment.",
            "Reviews, photos and posts you publish are visible to other visitors or members, with the display name you chose. You can ask for them to be removed at any time.",
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
            "Nous ne vous envoyons d’e-mails promotionnels que si vous l’avez accepté, ou [[Envoi aux clients existants pour des produits similaires, si retenu et autorisé]]. Chaque e-mail contient un lien de désinscription.",
            "We only send you promotional emails if you have agreed, or [[Emails to existing customers about similar products, if chosen and permitted]]. Every email contains an unsubscribe link.",
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
            "Les paiements sont traités par Stripe. Vos données de carte sont saisies chez Stripe et ne nous sont pas transmises ; nous recevons le statut du paiement et, le cas échéant, des informations limitées : [[Données de paiement effectivement reçues]]. Stripe traite également certaines données pour la prévention de la fraude et ses obligations légales, selon sa propre politique de confidentialité.",
            "Payments are processed by Stripe. Your card details are entered with Stripe and are not passed to us; we receive the payment status and, where applicable, limited information: [[Payment data actually received]]. Stripe also processes some data for fraud prevention and its own legal obligations, under its own privacy policy.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "[[Entité Stripe contractante et rôle (sous-traitant / responsable) à confirmer]]",
            "[[Contracting Stripe entity and role (processor / controller) to confirm]]",
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
            { role: l("Hébergement du site", "Website hosting"), provider: l("[[Hébergeur]]", "[[Hosting provider]]"), location: l("[[Pays]]", "[[Country]]") },
            { role: l("Base de données et comptes", "Database and accounts"), provider: l("[[Prestataire base de données]]", "[[Database provider]]"), location: l("[[Pays]]", "[[Country]]") },
            { role: l("E-mails et communication", "Email and communication"), provider: l("[[Prestataire e-mail]]", "[[Email provider]]"), location: l("[[Pays]]", "[[Country]]") },
            { role: l("Mesure d’audience", "Analytics"), provider: l("[[Outil d’analytics, si utilisé]]", "[[Analytics provider, if used]]"), location: l("[[Pays]]", "[[Country]]") },
            { role: l("Livraison", "Delivery"), provider: l("[[Transporteurs]]", "[[Carriers]]"), location: l("[[Pays]]", "[[Country]]") },
            { role: l("Vidéo des formations", "Training video"), provider: l("[[Hébergeur vidéo]]", "[[Video host]]"), location: l("[[Pays]]", "[[Country]]") },
            { role: l("Autres", "Other"), provider: l("[[Autres prestataires]]", "[[Other providers]]"), location: l("[[Pays]]", "[[Country]]") },
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
            { purpose: l("Gérer votre compte", "Manage your account"), basis: l("Exécution du contrat", "Performance of a contract") },
            { purpose: l("Traiter, livrer et facturer vos commandes", "Process, deliver and invoice orders"), basis: l("Exécution du contrat", "Performance of a contract") },
            { purpose: l("Donner accès aux formations, suivre la progression, délivrer les attestations", "Provide training, track progress, issue certificates"), basis: l("Exécution du contrat", "Performance of a contract") },
            { purpose: l("Conserver les factures et pièces comptables", "Keep invoices and accounting records"), basis: l("Obligation légale", "Legal obligation") },
            { purpose: l("Répondre à vos demandes", "Answer your requests"), basis: l("Intérêt légitime ou mesures précontractuelles", "Legitimate interest or pre-contractual steps") },
            { purpose: l("Prévenir la fraude et sécuriser le site", "Prevent fraud and secure the site"), basis: l("Intérêt légitime", "Legitimate interest") },
            { purpose: l("Publier vos avis et messages", "Publish your reviews and posts"), basis: l("[[Consentement ou exécution du contrat]]", "[[Consent or performance of a contract]]") },
            { purpose: l("Envoyer des e-mails marketing", "Send marketing emails"), basis: l("Consentement", "Consent") },
            { purpose: l("Cookies non essentiels", "Non-essential cookies"), basis: l("Consentement", "Consent") },
          ],
        },
        {
          kind: "callout",
          tone: "verify",
          text: l("[[Bases légales à valider pour chaque traitement]]", "[[Legal bases to validate for each processing activity]]"),
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
            { data: l("Compte", "Account"), period: l("[[Durée de conservation — ex. jusqu’à suppression + délai d’inactivité]]", "[[Retention period — e.g. until deletion + inactivity period]]") },
            { data: l("Commandes et factures", "Orders and invoices"), period: l("[[Durée légale de conservation comptable]]", "[[Statutory accounting retention period]]") },
            { data: l("Demandes au service client", "Customer service requests"), period: l("[[Durée de conservation]]", "[[Retention period]]") },
            { data: l("Progression et attestations", "Progress and certificates"), period: l("[[Durée de conservation]]", "[[Retention period]]") },
            { data: l("Consentement marketing", "Marketing consent"), period: l("[[Durée de conservation]]", "[[Retention period]]") },
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
          text: l(
            "Certains prestataires peuvent traiter des données hors de l’Espace économique européen. Dans ce cas, le transfert est encadré par une garantie reconnue par le RGPD (décision d’adéquation ou clauses contractuelles types, par exemple) : [[Transferts effectifs et garanties utilisées]].",
            "Some providers may process data outside the European Economic Area. In that case, the transfer is covered by a safeguard recognised by the GDPR (such as an adequacy decision or standard contractual clauses): [[Actual transfers and safeguards used]].",
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
            { icon: "trash", title: l("Effacement", "Erasure"), text: l("Demander la suppression de vos données, sauf celles que nous devons conserver par la loi.", "Ask us to delete your data, except what the law requires us to keep.") },
            { icon: "pause", title: l("Limitation", "Restriction"), text: l("Geler l’utilisation de vos données, par exemple pendant la vérification d’une contestation.", "Freeze the use of your data, for example while a dispute is being checked.") },
            { icon: "hand", title: l("Opposition", "Objection"), text: l("Vous opposer à un traitement fondé sur notre intérêt légitime, et à tout moment au marketing.", "Object to processing based on our legitimate interest, and to marketing at any time.") },
            { icon: "download", title: l("Portabilité", "Portability"), text: l("Recevoir vos données dans un format structuré — voir l’export dans <<Sécurité et confidentialité|/compte/securite>>.", "Receive your data in a structured format — see the export in <<Security & privacy|/compte/securite>>.") },
            { icon: "undo", title: l("Retrait du consentement", "Withdraw consent"), text: l("Retirer à tout moment un consentement donné (e-mails, <<cookies|/cookies>>), sans effet sur le passé.", "Withdraw any consent at any time (emails, <<cookies|/cookies>>), without affecting past processing.") },
            { icon: "scale", title: l("Réclamation", "Complaint"), text: l("Saisir l’autorité de protection des données de votre pays : [[Autorité de contrôle compétente]].", "Lodge a complaint with the data protection authority of your country: [[Competent supervisory authority]].") },
          ],
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
            "Nous mettons en œuvre des mesures techniques et organisationnelles adaptées : connexions chiffrées, mots de passe stockés sous forme chiffrée, accès aux données limité aux personnes habilitées, contenus de formation protégés. Aucun système n’étant infaillible, nous vous informerons si une violation de données présentant un risque élevé vous concerne. [[Mesures de sécurité à confirmer avec l’implémentation finale]]",
            "We use appropriate technical and organisational measures: encrypted connections, hashed passwords, access to data limited to authorised people, protected training content. As no system is infallible, we will inform you if a data breach presenting a high risk affects you. [[Security measures to confirm against the final implementation]]",
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
            "Nous ne prenons aucune décision produisant des effets juridiques à votre égard sur la seule base d’un traitement automatisé. [[Confirmer l’absence de profilage, ou décrire celui mis en place (ex. anti-fraude)]]",
            "We do not make decisions with legal effects on you based solely on automated processing. [[Confirm there is no profiling, or describe any in place (e.g. anti-fraud)]]",
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
            "Le site ne s’adresse pas aux enfants. Âge minimum pour créer un compte ou commander : [[Âge minimum]]. Si vous pensez qu’un mineur nous a transmis des données, contactez-nous.",
            "The site is not intended for children. Minimum age to create an account or order: [[Minimum age]]. If you think a minor has given us their data, please contact us.",
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
