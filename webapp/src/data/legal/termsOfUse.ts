import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Terms of use ("conditions générales d'utilisation").
 *
 * They govern the use of the website, the member account, the Academy and the
 * Studio 3D, as opposed to the terms of sale (`terms.ts`), which govern
 * purchases. Same conventions as the other legal pages: `legal` callouts
 * summarise what the law provides, `policy` callouts are the shop's own
 * choices — completed on 2026-11-08 with the owner's go-ahead, to validate
 * (decision 126) —, `[[!...]]` is filled from the store's details.
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
    // Editor's note, never published: Completed on 8 November 2026 with workable rules, to be validated by the business (decision 126). To have a lawyer review before launch: the clause on applying tooth gems and on training.
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
          kind: "p",
          text: l(
            "Lors de la création d’un compte, vous acceptez expressément ces conditions et la politique de confidentialité en cochant la case prévue ; la date de cette acceptation est enregistrée sur votre compte.",
            "When you create an account, you expressly accept these terms and the privacy policy by ticking the box provided; the date of that acceptance is recorded on your account.",
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
          tone: "policy",
          text: l(
            "Il faut avoir au moins 15 ans pour créer un compte. Un mineur ne peut passer commande qu’avec l’accord de son représentant légal. Voir aussi la <<politique de confidentialité|/confidentialite#children>>.",
            "You must be at least 15 to create an account. A minor may only order with the consent of their legal guardian. See also the <<privacy policy|/confidentialite#children>>.",
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
            "Vous pouvez supprimer votre compte à tout moment depuis <<Sécurité et confidentialité|/compte/securite>>. Nous pouvons suspendre ou fermer un compte en cas de manquement à ces conditions, de fraude ou d’usage abusif, après vous avoir informé par e-mail du motif et laissé 8 jours pour y répondre — sauf urgence (fraude, atteinte à la sécurité du site ou contenu manifestement illicite), où la suspension peut être immédiate et vous est notifiée.",
            "You can delete your account at any time from <<Security & privacy|/compte/securite>>. We may suspend or close an account in case of breach of these terms, fraud or abuse, after telling you the reason by email and giving you 8 days to reply — except in an emergency (fraud, a threat to the site’s security or manifestly unlawful content), where suspension can be immediate and is notified to you.",
          ),
        },
        {
          kind: "callout",
          tone: "policy",
          text: l(
            "La suppression du compte est immédiate et définitive : les accès aux formations, les attestations, les créations du Studio 3D, la page Glowbook, les favoris et les tampons de fidélité sont effacés. Elle n’est pas possible tant qu’un abonnement au Studio 3D ou un paiement est en cours. Les factures sont conservées pendant la durée légale.",
            "Deleting the account is immediate and final: access to courses, certificates, 3D Studio creations, the Glowbook page, favourites and loyalty stamps are erased. It is not possible while a 3D Studio subscription or a payment is under way. Invoices are kept for the legal period.",
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
          tone: "policy",
          text: l(
            "Une carte cadeau est valable 12 mois à compter de son émission et peut être offerte. Les tampons de fidélité sont attachés à votre compte, ne sont ni transférables ni échangeables contre de l’argent, et la récompense s’utilise dans le panier selon les règles affichées sur la page fidélité.",
            "A gift card is valid for 12 months from issue and can be given to someone else. Loyalty stamps are tied to your account, cannot be transferred or exchanged for money, and the reward is used in the cart under the rules shown on the loyalty page.",
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
          tone: "policy",
          text: l(
            "Sauf mention contraire sur la page de la formation, l’accès dure 24 mois à compter de l’achat. L’attestation délivrée à la fin d’une formation atteste que vous l’avez suivie et validée ; ce n’est ni un diplôme ni une certification professionnelle reconnue par l’État, et elle ne vaut pas autorisation d’exercer.",
            "Unless the course page says otherwise, access lasts 24 months from purchase. The certificate issued at the end of a course attests that you followed and passed it; it is neither a diploma nor a state-recognised professional certification, and it is not a licence to practise.",
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
            "L’éditeur du Studio est accessible avec un compte : un essai gratuit de 48 heures, une fois par compte, puis un abonnement (Essential, Artist ou Atelier). Ce que chaque formule permet est présenté sur la page du Studio 3D ; les conditions de paiement, de résiliation et de rétractation figurent dans les <<conditions générales de vente|/conditions-generales#studio>>. Les créations publiées sur une page Glowbook sont relues par notre équipe avant d’être visibles publiquement.",
            "The Studio editor is available with an account: a free 48-hour trial, once per account, then a subscription (Essential, Artist or Atelier). What each plan allows is set out on the 3D Studio page; payment, cancellation and withdrawal terms are in the <<terms of sale|/conditions-generales#studio>>. Creations published on a Glowbook page are reviewed by our team before they become publicly visible.",
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
            "Vous pouvez publier des avis, des photos et d’autres contenus. Vous restez propriétaire de vos contenus et responsable de leur publication. Vous nous accordez une licence non exclusive et gratuite pour les reproduire et les afficher sur le site (fiches produit, pages Glowbook, salons des membres), dans le monde entier, pour la durée de leur publication. Cette licence prend fin lorsque vous supprimez le contenu ou votre compte.",
            "You can post reviews, photos and other content. You remain the owner of your content and are responsible for posting it. You grant us a non-exclusive, free licence to reproduce and display it on the site (product pages, Glowbook pages, members’ lounges), worldwide, for as long as it is published. This licence ends when you delete the content or your account.",
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
            "Les avis et les pages Glowbook sont relus par notre équipe avant leur publication, en général sous 3 jours ouvrés. Nous pouvons refuser, masquer ou supprimer un contenu illicite, injurieux, trompeur, publicitaire, sans rapport avec le sujet ou contraire à ces conditions ; l’auteur d’un contenu refusé ou retiré peut nous en demander le motif et nous demander de revoir la décision.",
            "Reviews and Glowbook pages are checked by our team before they are published, usually within 3 working days. We may refuse, hide or remove content that is unlawful, abusive, misleading, promotional, off-topic or contrary to these terms; the author of content refused or removed can ask us for the reason and for the decision to be reviewed.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Pour signaler un contenu, <<contactez-nous|/contact?sujet=other>> en indiquant votre nom et votre e-mail, l’adresse de la page, le contenu concerné et les raisons pour lesquelles il vous paraît illicite ou contraire à ces conditions.",
            "To report content, <<contact us|/contact?sujet=other>> giving your name and email, the page address, the content concerned and why you think it is unlawful or contrary to these terms.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "En tant qu’hébergeur des contenus publiés par les membres (article 6 de la loi pour la confiance dans l’économie numérique et règlement européen sur les services numériques), nous ne les contrôlons pas tous a priori, mais retirons promptement tout contenu manifestement illicite qui nous est signalé, et traitons chaque signalement de manière diligente et objective.",
            "As a host of the content posted by members (article 6 of the French law on confidence in the digital economy and the EU Digital Services Act), we do not check all of it in advance, but promptly remove any manifestly unlawful content reported to us, and handle every report diligently and objectively.",
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
          kind: "p",
          text: l(
            "Il appartient à chaque artiste de vérifier et de respecter la réglementation qui s’applique à son activité de pose dans son pays (qualification, hygiène, assurance, information du client). Les formations et le Studio 3D ne remplacent pas l’avis d’un dentiste.",
            "Each artist is responsible for checking and following the regulations that apply to their application activity in their country (qualification, hygiene, insurance, client information). The courses and the 3D Studio do not replace a dentist’s advice.",
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
            "Nous mettons en œuvre des moyens raisonnables pour que les informations du site soient exactes et à jour, sans pouvoir garantir l’absence d’erreur ou d’interruption. Nous ne sommes pas responsables des dommages résultant d’une utilisation du site non conforme à ces conditions, d’un événement hors de notre contrôle ou du fait d’un tiers, ni des dommages indirects. Les services gratuits (consultation du site, essai du Studio) sont fournis en l’état. Il vous appartient de conserver une copie des contenus auxquels vous tenez.",
            "We use reasonable means to keep the site’s information accurate and up to date, without being able to guarantee the absence of errors or interruptions. We are not liable for damage arising from use of the site that breaches these terms, from events beyond our control or from a third party’s act, or for indirect damage. Free services (browsing the site, the Studio trial) are provided as they are. It is up to you to keep a copy of the content that matters to you.",
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
            "Nous pouvons modifier ces conditions, par exemple pour tenir compte d’une évolution de la loi ou de nos services. La version applicable est celle en ligne au moment de votre utilisation ; la date de dernière mise à jour figure en haut de cette page. En cas de modification importante, nous vous en informons par e-mail au moins 15 jours avant son entrée en vigueur ; si vous ne l’acceptez pas, vous pouvez supprimer votre compte.",
            "We may change these terms, for example to reflect a change in the law or in our services. The version that applies is the one online when you use the site; the last-updated date is shown at the top of this page. For a significant change, we will let you know by email at least 15 days before it takes effect; if you do not accept it, you can delete your account.",
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
            "Les présentes conditions sont soumises au droit français. À défaut de solution amiable, le litige sera porté devant les juridictions françaises compétentes ; entre professionnels, devant les tribunaux du ressort de Strasbourg. Les modalités de réclamation et de médiation applicables aux consommateurs sont détaillées dans les <<conditions générales de vente|/conditions-generales#mediation>>.",
            "These terms are governed by French law. If no amicable solution is found, the dispute will be brought before the competent French courts; between professionals, before the courts of Strasbourg. How consumer complaints and mediation work is detailed in the <<terms of sale|/conditions-generales#mediation>>.",
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
            { label: l("E-mail", "Email"), value: l("[[!E-mail du service client]]", "[[!Customer service email]]") },
            { label: l("Adresse postale", "Postal address"), value: l("[[!Adresse du siège]]", "[[!Registered office address]]") },
          ],
        },
      ],
    },
  ],
};
