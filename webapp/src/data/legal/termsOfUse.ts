import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Terms of use ("conditions générales d'utilisation").
 *
 * They govern the use of the website, the member account, the Academy and the
 * Studio 3D, as opposed to the terms of sale (`terms.ts`), which govern
 * purchases. Same conventions as the other legal pages: `legal` callouts
 * summarise what the law provides, `policy` callouts are the shop's own
 * choices, `[[...]]` marks every value nobody has confirmed yet.
 *
 * Structure and wording for review, not a contract: first draft to be read
 * and validated by the business (and a lawyer) before publication.
 */

const PART = {
  general: l("Généralités", "General"),
  account: l("Compte et accès", "Account and access"),
  use: l("Utilisation du site", "Using the site"),
  content: l("Contenus et propriété intellectuelle", "Content and intellectual property"),
  liability: l("Responsabilité", "Liability"),
  more: l("Informations complémentaires", "Further information"),
};

export const TERMS_OF_USE: LegalDocument = {
  id: "termsOfUse",
  path: LEGAL_PATHS.termsOfUse,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Conditions générales d’utilisation", "Terms of use"),
  intro: l(
    "Les règles qui s’appliquent à l’utilisation du site Global Toothgems : votre compte, la boutique, l’Academy, le Studio 3D, les contenus que vous publiez et ce que nous attendons de vous.",
    "The rules that apply to using the Global Toothgems website: your account, the shop, the Academy, the 3D Studio, the content you post and what we expect from you.",
  ),
  updated: DRAFT_DATE,
  numbered: true,
  showKey: true,
  contactCategory: "other",
  lead: [
    {
      kind: "internal",
      text: l(
        "Première version de travail, à relire et à valider avant publication : ce n’est pas un texte juridique validé. Les encadrés « Information légale » résument des principes du droit européen et doivent être confirmés par un juriste ; toutes les règles propres à l’entreprise (modération, durée de conservation, suspension de compte…) sont à fixer par elle.",
        "First working draft, to be read and validated before publication: this is not validated legal text. “Legal information” boxes summarise EU-law principles and must be confirmed by a lawyer; every business-specific rule (moderation, retention, account suspension…) is for the business to set.",
      ),
    },
    {
      kind: "callout",
      tone: "policy",
      title: l("En bref", "In short"),
      text: l(
        "Un seul compte donne accès à la boutique, à l’Academy et au Studio 3D. Vous restez responsable de ce que vous publiez, nous modérons les contenus qui ne respectent pas ces règles, et les achats sont régis par les <<conditions générales de vente|/conditions-generales>>.",
        "One account gives you access to the shop, the Academy and the 3D Studio. You remain responsible for what you post, we moderate content that does not follow these rules, and purchases are governed by the <<terms of sale|/conditions-generales>>.",
      ),
    },
  ],
  sections: [
    {
      id: "purpose",
      part: PART.general,
      title: l("Objet et champ d’application", "Purpose and scope"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les présentes conditions définissent les règles d’accès et d’utilisation du site Global Toothgems et de ses services : la consultation du catalogue, le compte client, les favoris, les avis, la fidélité, l’Academy (formations en ligne) et le Studio 3D. Elles s’appliquent à tout visiteur et à tout membre.",
            "These terms set out the rules for accessing and using the Global Toothgems website and its services: browsing the catalogue, the customer account, favourites, reviews, loyalty, the Academy (online training) and the 3D Studio. They apply to every visitor and member.",
          ),
        },
        {
          kind: "p",
          text: l(
            "En naviguant sur le site ou en créant un compte, vous reconnaissez avoir pris connaissance de ces conditions. L’achat de produits ou de formations est en outre soumis aux <<conditions générales de vente|/conditions-generales>> ; en cas de contradiction sur une commande, ces dernières prévalent.",
            "By browsing the site or creating an account, you acknowledge that you have read these terms. Buying products or training is also subject to the <<terms of sale|/conditions-generales>>; if the two conflict on an order, the terms of sale prevail.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Confirmer l’articulation avec les CGV et le mode d’acceptation (case à cocher à l’inscription, simple navigation) : [[Mode d’acceptation des CGU]].",
            "Confirm how these terms relate to the terms of sale and how they are accepted (checkbox at sign-up, mere browsing): [[How the terms of use are accepted]].",
          ),
        },
      ],
    },
    {
      id: "publisher",
      part: PART.general,
      title: l("Éditeur du site", "Site publisher"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le site est édité par [[!Dénomination sociale]]. Les informations d’identification complètes, ainsi que l’hébergeur du site, figurent dans les <<mentions légales|/mentions-legales>>.",
            "The site is published by [[!Legal business name]]. Full identification details, and the site’s host, are in the <<legal notice|/mentions-legales>>.",
          ),
        },
      ],
    },
    {
      id: "access",
      part: PART.general,
      title: l("Accès au site", "Access to the site"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le site est accessible gratuitement à toute personne disposant d’un accès à Internet ; les frais de connexion et de matériel restent à votre charge. Nous nous efforçons de le maintenir disponible mais pouvons l’interrompre, notamment pour maintenance ou mise à jour, sans que cela ouvre droit à indemnité.",
            "The site is free to access for anyone with an Internet connection; connection and equipment costs are your own. We aim to keep it available but may interrupt it, for example for maintenance or updates, without entitling you to compensation.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Certaines fonctionnalités (compte, favoris, avis, Academy, Studio 3D) nécessitent un compte. Certaines fonctionnalités peuvent être réservées à des offres payantes ou soumises à conditions, indiquées au moment de leur proposition.",
            "Some features (account, favourites, reviews, Academy, 3D Studio) require an account. Some features may be reserved for paid offers or subject to conditions, which are stated when they are offered.",
          ),
        },
      ],
    },
    {
      id: "account",
      part: PART.account,
      title: l("Création et gestion du compte", "Creating and managing your account"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le compte est personnel et unique : il sert à la fois pour la boutique, l’Academy et le Studio 3D. Vous vous engagez à fournir des informations exactes, à les tenir à jour et à ne pas créer de compte au nom d’une autre personne.",
            "The account is personal and unique: it is used for the shop, the Academy and the 3D Studio alike. You agree to provide accurate information, keep it up to date and not create an account in someone else’s name.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Vous pouvez modifier vos informations, votre adresse e-mail et votre mot de passe depuis votre espace <<mon compte|/compte>>.",
            "You can change your details, email address and password from your <<account area|/compte>>.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Préciser l’âge minimal pour créer un compte et le traitement des mineurs : [[Âge minimal pour s’inscrire]]. Voir aussi la <<politique de confidentialité|/confidentialite#children>>.",
            "State the minimum age to create an account and how minors are handled: [[Minimum age to register]]. See also the <<privacy policy|/confidentialite#children>>.",
          ),
        },
      ],
    },
    {
      id: "credentials",
      part: PART.account,
      title: l("Identifiants et sécurité", "Credentials and security"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité réalisée depuis votre compte. Ne le communiquez à personne : un compte ne peut être partagé, notamment pour accéder à une formation achetée par une seule personne.",
            "You are responsible for keeping your password confidential and for all activity carried out from your account. Do not share it: an account cannot be shared, in particular to access a course bought by a single person.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Si vous pensez que votre compte a été utilisé sans votre accord, changez immédiatement votre mot de passe depuis la page <<sécurité|/compte/securite>> et <<contactez-nous|/contact?sujet=technical>>.",
            "If you think your account has been used without your permission, change your password straight away from the <<security|/compte/securite>> page and <<contact us|/contact?sujet=technical>>.",
          ),
        },
      ],
    },
    {
      id: "suspension",
      part: PART.account,
      title: l("Suspension et fermeture du compte", "Suspension and closure of your account"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vous pouvez demander la fermeture de votre compte à tout moment. Nous pouvons suspendre ou fermer un compte en cas de manquement à ces conditions, de fraude ou d’usage abusif, [[Procédure de préavis et de réponse avant suspension]].",
            "You can ask for your account to be closed at any time. We may suspend or close an account in case of breach of these terms, fraud or abuse, [[Notice and right-of-reply procedure before suspension]].",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "Sort des formations achetées, des créations du Studio 3D et des points de fidélité en cas de fermeture : [[Conséquences de la fermeture du compte]].",
            "What happens to purchased courses, 3D Studio creations and loyalty stamps when an account is closed: [[Consequences of closing the account]].",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Les droits liés aux achats déjà réalisés (rétractation, garanties, remboursement) ne sont pas affectés par la fermeture du compte.",
            "Rights attached to purchases already made (withdrawal, guarantees, refunds) are not affected by closing the account.",
          ),
        },
      ],
    },
    {
      id: "rules",
      part: PART.use,
      title: l("Règles d’utilisation", "Rules of use"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vous vous engagez à utiliser le site de bonne foi et conformément à la loi. Il est notamment interdit de :",
            "You agree to use the site in good faith and in accordance with the law. In particular, you must not:",
          ),
        },
        {
          kind: "list",
          items: [
            l("perturber le fonctionnement du site ou chercher à contourner ses mesures de sécurité ;", "disrupt the operation of the site or try to bypass its security measures;"),
            l("accéder aux comptes, aux données ou aux contenus d’autres personnes sans autorisation ;", "access other people’s accounts, data or content without permission;"),
            l("extraire de façon automatisée le contenu du site (robots, collecte massive) sans accord écrit ;", "extract the site’s content automatically (bots, bulk collection) without written agreement;"),
            l("utiliser le site pour une activité frauduleuse, notamment en matière de paiement ou de codes promotionnels et cartes cadeaux ;", "use the site for fraudulent activity, in particular involving payments, promotion codes and gift cards;"),
            l("introduire des virus ou tout code malveillant.", "introduce viruses or any malicious code."),
          ],
        },
      ],
    },
    {
      id: "shop",
      part: PART.use,
      title: l("Boutique, fidélité et cartes cadeaux", "Shop, loyalty and gift cards"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les conditions de commande, de paiement, de livraison et de rétractation sont celles des <<conditions générales de vente|/conditions-generales>>. Les avantages de fidélité et les cartes cadeaux sont personnels, non cessibles contre de l’argent et soumis aux règles du programme en vigueur, présentées sur les pages <<fidélité|/fidelite>> et <<carte cadeau|/carte-cadeau>>.",
            "Ordering, payment, delivery and withdrawal are governed by the <<terms of sale|/conditions-generales>>. Loyalty benefits and gift cards are personal, cannot be exchanged for money and follow the programme rules in force, set out on the <<loyalty|/fidelite>> and <<gift card|/carte-cadeau>> pages.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Valider les règles de cession, de durée de validité et de cumul des avantages : [[Règles d’usage des points de fidélité et cartes cadeaux]].",
            "Validate the rules on transfer, validity period and combining benefits: [[Rules for using loyalty stamps and gift cards]].",
          ),
        },
      ],
    },
    {
      id: "academy",
      part: PART.use,
      title: l("Academy : accès aux formations", "Academy: access to training"),
      blocks: [
        {
          kind: "p",
          text: l(
            "L’accès à une formation est personnel et rattaché à votre compte, pour la durée indiquée sur la page de la formation. Il s’ouvre une fois la commande payée, ou lorsque nous vous l’accordons directement. Votre progression, vos résultats aux quiz et vos attestations sont enregistrés sur votre compte.",
            "Access to a course is personal and tied to your account, for the period stated on the course page. It opens once the order is paid, or when we grant it to you directly. Your progress, quiz results and certificates are recorded on your account.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Les contenus de formation (vidéos, supports, quiz) sont réservés à votre usage personnel : il est interdit de les enregistrer, copier, redistribuer, revendre ou partager avec des tiers.",
            "Course content (videos, materials, quizzes) is for your personal use only: you must not record, copy, redistribute, resell or share it with third parties.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Confirmer la durée d’accès et la valeur de l’attestation délivrée (elle ne vaut pas diplôme) : [[Durée d’accès et portée de l’attestation]].",
            "Confirm the access duration and the status of the certificate issued (it is not a diploma): [[Access duration and scope of the certificate]].",
          ),
        },
      ],
    },
    {
      id: "studio",
      part: PART.use,
      title: l("Studio 3D", "3D Studio"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le Studio 3D permet de composer des créations et des groupes de gems, puis de les partager par lien. Vos créations sont enregistrées sur votre compte ; un lien de partage donne accès à la création concernée à toute personne qui le possède, et vous pouvez le désactiver à tout moment.",
            "The 3D Studio lets you compose creations and gem groups, then share them by link. Your creations are saved to your account; a share link gives anyone who has it access to that creation, and you can switch it off at any time.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le Studio est un outil de visualisation : le rendu est indicatif et peut différer du produit réel (teinte, proportions, positionnement). Il ne remplace pas l’avis d’un professionnel.",
            "The Studio is a visualisation tool: the rendering is indicative and may differ from the actual product (colour, proportions, placement). It does not replace a professional’s advice.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "Conditions d’accès au Studio (gratuit, abonnement, essai) : [[Offre du Studio 3D et conditions d’abonnement]].",
            "Conditions for access to the Studio (free, subscription, trial): [[3D Studio offer and subscription conditions]].",
          ),
        },
      ],
    },
    {
      id: "user-content",
      part: PART.content,
      title: l("Contenus que vous publiez", "Content you post"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vous pouvez publier des avis, des photos et d’autres contenus. Vous restez propriétaire de vos contenus et responsable de leur publication. Vous nous accordez une licence non exclusive, gratuite et limitée à l’exploitation du site pour les afficher [[Étendue et durée de la licence sur les contenus des membres]].",
            "You can post reviews, photos and other content. You remain the owner of your content and are responsible for posting it. You grant us a non-exclusive, free licence, limited to operating the site, to display it [[Scope and duration of the licence on members’ content]].",
          ),
        },
        {
          kind: "p",
          text: l(
            "Vous garantissez détenir les droits nécessaires sur ce que vous publiez (photos, textes) et ne pas porter atteinte aux droits de tiers, notamment au droit à l’image et à la vie privée. Vous pouvez demander la suppression d’un contenu à tout moment.",
            "You confirm you hold the rights necessary for what you post (photos, texts) and do not infringe third-party rights, including image and privacy rights. You can ask for content to be removed at any time.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Les avis publiés doivent refléter une expérience réelle. Les pratiques consistant à publier de faux avis ou à en payer sont interdites.",
            "Published reviews must reflect a genuine experience. Posting fake reviews or paying for them is prohibited.",
          ),
        },
      ],
    },
    {
      id: "moderation",
      part: PART.content,
      title: l("Modération et signalement", "Moderation and reporting"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les contenus sont publiés sous réserve de modération. Nous pouvons refuser, masquer ou supprimer un contenu illicite, injurieux, trompeur, publicitaire, sans rapport avec le sujet ou contraire à ces conditions, [[Délais et modalités de modération]].",
            "Content is published subject to moderation. We may refuse, hide or remove content that is unlawful, abusive, misleading, promotional, off-topic or contrary to these terms, [[Moderation timing and procedure]].",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Pour signaler un contenu, utilisez le bouton de signalement présent sur les avis ou <<contactez-nous|/contact?sujet=other>> en indiquant le contenu concerné et le motif.",
            "To report content, use the report button on reviews or <<contact us|/contact?sujet=other>> naming the content concerned and the reason.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "En tant qu’hébergeur de contenus publiés par des tiers, nous retirons promptement tout contenu manifestement illicite dont nous avons connaissance.",
            "As a host of content posted by third parties, we promptly remove any manifestly unlawful content that we become aware of.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Faire valider ce régime de responsabilité d’hébergeur et la procédure de notification par un juriste : [[Procédure de notification des contenus illicites]].",
            "Have this host-liability regime and the notice procedure validated by a lawyer: [[Notice procedure for unlawful content]].",
          ),
        },
      ],
    },
    {
      id: "ip",
      part: PART.content,
      title: l("Propriété intellectuelle", "Intellectual property"),
      blocks: [
        {
          kind: "p",
          text: l(
            "La marque Global Toothgems, le site, ses textes, images, vidéos, formations, modèles 3D, logiciels et bases de données sont protégés et appartiennent à [[!Dénomination sociale]] ou à ses partenaires. Toute reproduction, représentation ou réutilisation, totale ou partielle, sans autorisation écrite préalable est interdite.",
            "The Global Toothgems brand, the site, its texts, images, videos, courses, 3D models, software and databases are protected and belong to [[!Legal business name]] or its partners. Any reproduction, representation or reuse, in whole or in part, without prior written permission is prohibited.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Vous disposez d’un droit d’usage personnel, non exclusif et non cessible du site et de ses contenus, dans la limite de ces conditions. Voir aussi les <<mentions légales|/mentions-legales>>.",
            "You have a personal, non-exclusive, non-transferable right to use the site and its content, within the limits of these terms. See also the <<legal notice|/mentions-legales>>.",
          ),
        },
      ],
    },
    {
      id: "advice",
      part: PART.liability,
      title: l("Usage des produits et des formations", "Use of products and training"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les informations, conseils et formations proposés ont une vocation d’information et de formation. Les produits doivent être utilisés conformément à leur notice et aux précautions indiquées sur leur fiche ; en cas de doute (allergie, sensibilité, santé dentaire), demandez l’avis d’un professionnel avant toute pose.",
            "The information, advice and training offered are for information and education. Products must be used according to their instructions and the precautions on their page; if in doubt (allergy, sensitivity, dental health), seek a professional’s advice before application.",
          ),
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Faire relire cette clause au regard de la réglementation applicable aux produits et à l’activité de formation : [[Réglementation applicable à la pose et à la formation]].",
            "Have this clause reviewed against the regulations applying to the products and to the training activity: [[Regulations applying to application and training]].",
          ),
        },
      ],
    },
    {
      id: "liability",
      part: PART.liability,
      title: l("Responsabilité", "Liability"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous mettons en œuvre des moyens raisonnables pour que les informations du site soient exactes et à jour, sans pouvoir garantir l’absence d’erreur ou d’interruption. Nous ne sommes pas responsables des dommages résultant d’une utilisation du site non conforme à ces conditions, d’un événement hors de notre contrôle ou du fait d’un tiers, [[Limites de responsabilité souhaitées]].",
            "We use reasonable means to keep the site’s information accurate and up to date, without being able to guarantee the absence of errors or interruptions. We are not liable for damage arising from use of the site that breaches these terms, from events beyond our control or from a third party’s act, [[Desired limits of liability]].",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Aucune clause ne peut exclure ou limiter la responsabilité en cas de faute lourde ou intentionnelle, de dommage corporel, ni priver un consommateur des droits que la loi lui reconnaît.",
            "No clause can exclude or limit liability for gross or intentional fault or personal injury, or deprive a consumer of the rights the law gives them.",
          ),
        },
      ],
    },
    {
      id: "links",
      part: PART.liability,
      title: l("Liens vers d’autres sites", "Links to other sites"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le site peut contenir des liens vers des sites tiers ou s’appuyer sur des services tiers (par exemple le paiement en ligne). Nous ne contrôlons pas leur contenu et ne sommes pas responsables de leurs pratiques ; leurs propres conditions s’appliquent.",
            "The site may contain links to third-party sites or rely on third-party services (for example online payment). We do not control their content and are not responsible for their practices; their own terms apply.",
          ),
        },
      ],
    },
    {
      id: "data",
      part: PART.more,
      title: l("Données personnelles et cookies", "Personal data and cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les données personnelles sont traitées comme décrit dans la <<politique de confidentialité|/confidentialite>>, qui précise aussi vos droits d’accès, de rectification, d’effacement et d’opposition. L’usage des cookies et la gestion de vos choix sont expliqués dans la <<politique cookies|/cookies>>.",
            "Personal data is processed as described in the <<privacy policy|/confidentialite>>, which also sets out your rights of access, rectification, erasure and objection. How cookies are used and how to manage your choices is explained in the <<cookie policy|/cookies>>.",
          ),
        },
      ],
    },
    {
      id: "updates",
      part: PART.more,
      title: l("Modification des conditions", "Updates to these terms"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous pouvons modifier ces conditions, par exemple pour tenir compte d’une évolution de la loi ou de nos services. La version applicable est celle en ligne au moment de votre utilisation ; la date de dernière mise à jour figure en haut de cette page. En cas de modification importante, nous vous en informons [[Mode d’information des membres lors d’une modification]].",
            "We may change these terms, for example to reflect a change in the law or in our services. The version that applies is the one online when you use the site; the last-updated date is shown at the top of this page. For a significant change, we will let you know [[How members are told of a change]].",
          ),
        },
      ],
    },
    {
      id: "law",
      part: PART.more,
      title: l("Droit applicable et litiges", "Applicable law and disputes"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les présentes conditions sont soumises à [[Droit applicable]]. À défaut de solution amiable, le litige sera porté devant [[Juridiction compétente]]. Les modalités de réclamation et de médiation applicables aux consommateurs sont détaillées dans les <<conditions générales de vente|/conditions-generales#mediation>>.",
            "These terms are governed by [[Applicable law]]. If no amicable solution is found, the dispute will be brought before [[Competent courts]]. How consumer complaints and mediation work is detailed in the <<terms of sale|/conditions-generales#mediation>>.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Un consommateur de l’Union européenne conserve la protection des règles impératives du pays où il réside habituellement et peut saisir les juridictions de son lieu de domicile.",
            "A consumer in the European Union keeps the protection of the mandatory rules of the country where they habitually reside and can bring proceedings before the courts of the place where they live.",
          ),
        },
      ],
    },
    {
      id: "contact",
      part: PART.more,
      title: l("Nous contacter", "Contact us"),
      blocks: [
        {
          kind: "fields",
          fields: [
            { label: l("Contact", "Contact"), value: l("<<Formulaire de contact|/contact>>", "<<Contact form|/contact>>") },
            { label: l("E-mail", "Email"), placeholder: l("E-mail du service client", "Customer service email") },
            { label: l("Adresse postale", "Postal address"), placeholder: l("Adresse postale", "Postal address") },
          ],
        },
      ],
    },
  ],
};
