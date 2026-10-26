import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Cookie policy.
 *
 * Mirrors what the site really does: PostHog only after the analytics choice
 * (`lib/cookieConsent.tsx`), OpenFreeMap tiles for the Glowbook maps, Stripe
 * on the payment page. Update it when a cookie, a provider or a category changes.
 */
export const COOKIE_POLICY: LegalDocument = {
  id: "cookies",
  path: LEGAL_PATHS.cookies,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Politique cookies", "Cookie policy"),
  intro: l(
    "Ce que sont les cookies, à quoi ils servent sur Global Toothgems, et comment accepter, refuser ou changer d’avis à tout moment.",
    "What cookies are, what they are used for on Global Toothgems, and how to accept, refuse or change your mind at any time.",
  ),
  updated: DRAFT_DATE,
  showKey: true,
  contactCategory: "privacy",
  lead: [{ kind: "widget", widget: "cookieChoices" }],
  sections: [
    {
      id: "what",
      title: l("Qu’est-ce qu’un cookie ?", "What are cookies?"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Un cookie est un petit fichier déposé sur votre appareil lorsque vous consultez un site. Il permet par exemple de garder votre session ou de mémoriser votre langue. Cette politique couvre aussi les technologies similaires (stockage local du navigateur).",
            "A cookie is a small file placed on your device when you visit a website. It lets a site, for example, keep your session or remember your language. This policy also covers similar technologies (browser local storage).",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Les cookies strictement nécessaires au fonctionnement du site peuvent être déposés sans consentement. Tous les autres nécessitent votre accord préalable, que vous pouvez refuser aussi facilement que l’accepter.",
            "Cookies strictly necessary for the site to work can be set without consent. All others require your prior agreement, which you can refuse as easily as you can accept it.",
          ),
        },
      ],
    },
    {
      id: "categories",
      title: l("Ce que nous utilisons", "What we use"),
      blocks: [
        {
          kind: "table",
          caption: l("Les catégories et leur régime", "The categories and how they are handled"),
          columns: [
            { key: "category", label: l("Catégorie", "Category") },
            { key: "purpose", label: l("Finalité", "Purpose") },
            { key: "used", label: l("Utilisée sur le site", "Used on the site") },
            { key: "consent", label: l("Consentement", "Consent") },
          ],
          rows: [
            {
              category: l("Nécessaires", "Necessary"),
              purpose: l("Connexion, panier, paiement sécurisé, langue choisie, mémorisation de vos choix cookies", "Sign-in, cart, secure payment, chosen language, remembering your cookie choices"),
              used: l("Oui", "Yes"),
              consent: l("Non requis", "Not required"),
            },
            {
              category: l("Mesure d’audience", "Analytics"),
              purpose: l("Comprendre l’utilisation du site et corriger ses erreurs (PostHog)", "Understand how the site is used and fix its errors (PostHog)"),
              used: l("Oui", "Yes"),
              consent: l("Refusée par défaut, à accepter", "Off by default, you opt in"),
            },
            {
              category: l("Préférences", "Preferences"),
              purpose: l("Aucune donnée de confort soumise au consentement", "No comfort data that requires consent"),
              used: l("Non", "No"),
              consent: l("—", "—"),
            },
            {
              category: l("Marketing", "Marketing"),
              purpose: l("Publicité et suivi des campagnes", "Advertising and campaign tracking"),
              used: l("Non", "No"),
              consent: l("—", "—"),
            },
          ],
        },
      ],
    },
    {
      id: "necessary",
      title: l("Cookies nécessaires", "Necessary cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Ils permettent d’utiliser les fonctions de base : se connecter à son compte, garder un panier, payer en sécurité, retenir la langue que vous avez choisie et vos choix cookies. Sans eux, le site ne peut pas fonctionner correctement ; ils sont déposés sans consentement et ne peuvent pas être désactivés depuis nos paramètres.",
            "They make the basic functions possible: signing in to your account, keeping a cart, paying securely, remembering the language you chose and your cookie choices. Without them the site cannot work properly; they are set without consent and cannot be switched off in our settings.",
          ),
        },
      ],
    },
    {
      id: "analytics",
      title: l("Mesure d’audience (PostHog)", "Analytics (PostHog)"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Avec votre accord seulement, nous utilisons PostHog (serveurs situés dans l’Union européenne) pour savoir quelles pages sont consultées, où la navigation se complique, quelles fonctions sont utilisées (panier, paiement, Studio 3D) et quelles erreurs surviennent. Tant que vous n’avez pas accepté cette catégorie, aucune donnée n’est envoyée à PostHog.",
            "Only with your agreement, we use PostHog (servers located in the European Union) to know which pages are visited, where navigation gets difficult, which features are used (cart, payment, 3D Studio) and which errors occur. Until you accept this category, no data is sent to PostHog.",
          ),
        },
        {
          kind: "p",
          text: l(
            "PostHog enregistre un identifiant dans votre navigateur. Si vous êtes connecté, il est rattaché à votre compte, avec votre adresse e-mail et votre nom. Ces données servent uniquement à notre propre analyse. Vous pouvez retirer votre accord à tout moment (voir plus bas).",
            "PostHog stores an identifier in your browser. If you are signed in, it is linked to your account, with your e-mail address and name. This data is used only for our own analysis. You can withdraw your agreement at any time (see below).",
          ),
        },
      ],
    },
    {
      id: "third-party",
      title: l("Services tiers", "Third-party services"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Paiement : la page de paiement charge Stripe, qui dépose ses propres cookies de sécurité et de prévention de la fraude, nécessaires pour payer. Ils relèvent de la politique cookies de Stripe.",
            "Payment: the payment page loads Stripe, which sets its own security and fraud-prevention cookies, needed to pay. They are covered by Stripe’s own cookie policy.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Cartes Glowbook : la carte d’une page d’artiste se charge lorsque vous faites défiler jusqu’à elle. Ses fonds de carte viennent d’OpenFreeMap (données © OpenStreetMap), qui reçoit alors votre adresse IP et la zone affichée pour vous les envoyer. Aucun cookie n’est déposé par ce service ; avant ce défilement, rien n’est chargé.",
            "Glowbook maps: the map on an artist’s page loads when you scroll to it. Its map tiles come from OpenFreeMap (data © OpenStreetMap), which then receives your IP address and the area shown in order to send them to you. This service sets no cookie; before that scroll, nothing is loaded.",
          ),
        },
      ],
    },
    {
      id: "duration",
      title: l("Inventaire et durées", "Inventory and durations"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Votre choix de cookies est conservé dans votre navigateur jusqu’à ce que vous le modifiiez ou effaciez les données du site.",
            "Your cookie choice is kept in your browser until you change it or clear the site’s data.",
          ),
        },
        {
          kind: "table",
          caption: l("Cookies et stockages similaires", "Cookies and similar storage"),
          columns: [
            { key: "name", label: l("Nom", "Name") },
            { key: "provider", label: l("Fournisseur", "Provider") },
            { key: "category", label: l("Catégorie", "Category") },
            { key: "duration", label: l("Durée", "Duration") },
          ],
          rows: [
            {
              name: l("sb-…-auth-token", "sb-…-auth-token"),
              provider: l("Global Toothgems (Supabase Auth)", "Global Toothgems (Supabase Auth)"),
              category: l("Nécessaire", "Necessary"),
              duration: l("Session de connexion", "Sign-in session"),
            },
            {
              name: l("gt-cookie-consent", "gt-cookie-consent"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire", "Necessary"),
              duration: l("Jusqu’à modification", "Until changed"),
            },
            {
              name: l("gt-lang", "gt-lang"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire", "Necessary"),
              duration: l("Jusqu’à modification", "Until changed"),
            },
            {
              name: l("Panier (stockage de session)", "Cart (session storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire", "Necessary"),
              duration: l("Fermeture de l’onglet", "Until the tab is closed"),
            },
            {
              name: l("__stripe_mid, __stripe_sid", "__stripe_mid, __stripe_sid"),
              provider: l("Stripe", "Stripe"),
              category: l("Nécessaire (paiement)", "Necessary (payment)"),
              duration: l("1 an, 30 minutes", "1 year, 30 minutes"),
            },
            {
              name: l("ph_…_posthog", "ph_…_posthog"),
              provider: l("PostHog", "PostHog"),
              category: l("Mesure d’audience", "Analytics"),
              duration: l("1 an, avec votre accord", "1 year, with your agreement"),
            },
          ],
        },
      ],
    },
    {
      id: "manage",
      title: l("Modifier vos préférences", "Changing your preferences"),
      blocks: [
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Cliquez sur « Paramètres cookies » en bas de chaque page, ou utilisez le bouton « Modifier mes choix » en haut de cette page. Vous pouvez activer ou désactiver chaque catégorie optionnelle séparément.",
            "Click “Cookie settings” at the bottom of any page, or use the “Change my choices” button at the top of this page. You can switch each optional category on or off separately.",
          ),
        },
      ],
    },
    {
      id: "withdraw",
      title: l("Retirer votre consentement", "Withdrawing consent"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Vous pouvez retirer votre consentement à tout moment, aussi simplement que vous l’avez donné, depuis les mêmes paramètres. Le retrait vaut pour l’avenir ; il est aussi possible de supprimer les cookies déjà déposés depuis votre navigateur.",
            "You can withdraw consent at any time, as easily as you gave it, from the same settings. Withdrawal applies from then on; you can also delete cookies already set from your browser.",
          ),
        },
      ],
    },
    {
      id: "browser",
      title: l("Gérer les cookies depuis votre navigateur", "Managing cookies in your browser"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Tous les navigateurs permettent de consulter, bloquer ou supprimer les cookies, généralement dans les réglages « Confidentialité » ou « Vie privée ». Bloquer tous les cookies peut empêcher certaines fonctions du site (panier, connexion) de fonctionner.",
            "Every browser lets you view, block or delete cookies, usually under “Privacy” settings. Blocking all cookies may stop some site functions (cart, sign-in) from working.",
          ),
        },
      ],
    },
    {
      id: "contact",
      title: l("Nous contacter", "Contact"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Une question sur les cookies ? Écrivez-nous via le <<formulaire de contact|/contact?sujet=privacy>>. Pour le reste de vos données, voir la <<politique de confidentialité|/confidentialite>>.",
            "A question about cookies? Write to us through the <<contact form|/contact?sujet=privacy>>. For the rest of your data, see the <<privacy policy|/confidentialite>>.",
          ),
        },
      ],
    },
  ],
};
