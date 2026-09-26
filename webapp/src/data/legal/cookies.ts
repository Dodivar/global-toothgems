import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Cookie policy.
 *
 * Describes categories, not cookies: no cookie name, provider or lifetime is
 * listed because none has been verified against a real implementation. The
 * inventory table is there to be filled from an audit of the live site.
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
            "Un cookie est un petit fichier déposé sur votre appareil lorsque vous consultez un site. Il permet par exemple de garder votre panier ou de mémoriser votre langue. Cette politique couvre aussi les technologies similaires (stockage local du navigateur, pixels).",
            "A cookie is a small file placed on your device when you visit a website. It lets a site, for example, keep your cart or remember your language. This policy also covers similar technologies (browser local storage, pixels).",
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
      title: l("Catégories de cookies", "Cookie categories"),
      blocks: [
        {
          kind: "table",
          caption: l("Les quatre catégories et leur régime", "The four categories and how they are handled"),
          columns: [
            { key: "category", label: l("Catégorie", "Category") },
            { key: "purpose", label: l("Finalité", "Purpose") },
            { key: "required", label: l("Obligatoire ?", "Required?") },
            { key: "consent", label: l("Consentement", "Consent") },
          ],
          rows: [
            {
              category: l("Essentiels", "Essential"),
              purpose: l("Fonctionnement du site : panier, connexion, sécurité, mémorisation de vos choix cookies", "Website functionality: cart, sign-in, security, remembering your cookie choices"),
              required: l("Oui", "Yes"),
              consent: l("Non requis, lorsque la loi le permet", "Not required where legally applicable"),
            },
            {
              category: l("Préférences", "Preferences"),
              purpose: l("Mémoriser vos choix (langue, affichage)", "Remember your choices (language, display)"),
              required: l("Selon l’usage", "Depends"),
              consent: l("Paramétrable", "Configurable"),
            },
            {
              category: l("Mesure d’audience", "Analytics"),
              purpose: l("Comprendre l’utilisation du site pour l’améliorer", "Understand how the site is used to improve it"),
              required: l("Selon l’usage", "Depends"),
              consent: l("Paramétrable", "Configurable"),
            },
            {
              category: l("Marketing", "Marketing"),
              purpose: l("Publicité et suivi des campagnes", "Advertising and campaign tracking"),
              required: l("Selon l’usage", "Depends"),
              consent: l("Paramétrable", "Configurable"),
            },
          ],
        },
        {
          kind: "callout",
          tone: "verify",
          text: l(
            "Confirmer quelles catégories sont réellement utilisées. Si aucun cookie marketing ou d’audience n’est déposé, retirer la catégorie de cette page et du bandeau : [[Catégories effectivement utilisées]].",
            "Confirm which categories are actually used. If no marketing or analytics cookie is set, remove the category from this page and the banner: [[Categories actually used]].",
          ),
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
            "Ils permettent d’utiliser les fonctions de base : naviguer, garder un panier, se connecter à son compte, payer en sécurité, suivre une formation. Sans eux, le site ne peut pas fonctionner correctement ; ils ne peuvent donc pas être désactivés depuis nos paramètres.",
            "They make the basic functions possible: browsing, keeping a cart, signing in, paying securely, following a course. Without them the site cannot work properly, so they cannot be switched off in our settings.",
          ),
        },
      ],
    },
    {
      id: "preferences",
      title: l("Cookies de préférences", "Preference cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Ils mémorisent des choix qui rendent votre visite plus confortable, comme la langue d’affichage. [[Préférences concernées et qualification (nécessaire ou soumis au consentement)]]",
            "They remember choices that make your visit more comfortable, such as display language. [[Preferences concerned and classification (necessary or consent-based)]]",
          ),
        },
      ],
    },
    {
      id: "analytics",
      title: l("Cookies de mesure d’audience", "Analytics cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "S’ils sont utilisés, ils nous aident à comprendre quelles pages sont consultées et où la navigation se complique, à partir de statistiques agrégées. Outil utilisé : [[Outil de mesure d’audience, si utilisé]].",
            "If used, they help us understand which pages are visited and where navigation gets difficult, from aggregated statistics. Tool used: [[Analytics tool, if used]].",
          ),
        },
      ],
    },
    {
      id: "marketing",
      title: l("Cookies marketing et publicitaires", "Marketing and advertising cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "S’ils sont utilisés, ils servent à mesurer l’efficacité de nos campagnes et à afficher des publicités adaptées sur d’autres sites. Plateformes concernées : [[Plateformes publicitaires, si utilisées]].",
            "If used, they measure how well our campaigns perform and show relevant ads on other websites. Platforms concerned: [[Advertising platforms, if used]].",
          ),
        },
      ],
    },
    {
      id: "third-party",
      title: l("Cookies tiers", "Third-party cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Certains cookies peuvent être déposés par des services tiers intégrés au site, par exemple la page de paiement ou un lecteur vidéo. Ces tiers les utilisent selon leur propre politique. [[Services tiers intégrés et cookies associés]]",
            "Some cookies may be set by third-party services built into the site, such as the payment page or a video player. These third parties use them under their own policies. [[Embedded third-party services and their cookies]]",
          ),
        },
      ],
    },
    {
      id: "duration",
      title: l("Durée de conservation", "Cookie duration"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Certains cookies expirent à la fermeture du navigateur (cookies de session), d’autres restent un temps limité (cookies persistants). Votre choix est conservé [[Durée de conservation du choix de consentement]], après quoi nous vous le redemandons.",
            "Some cookies expire when you close your browser (session cookies), others remain for a limited time (persistent cookies). Your choice is kept for [[Consent choice retention period]], after which we ask you again.",
          ),
        },
        {
          kind: "table",
          caption: l("Inventaire des cookies", "Cookie inventory"),
          columns: [
            { key: "name", label: l("Nom", "Name") },
            { key: "provider", label: l("Fournisseur", "Provider") },
            { key: "category", label: l("Catégorie", "Category") },
            { key: "duration", label: l("Durée", "Duration") },
          ],
          rows: [
            {
              name: l("[[À établir par audit du site en production]]", "[[To be established by auditing the live site]]"),
              provider: l("—", "—"),
              category: l("—", "—"),
              duration: l("—", "—"),
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
        {
          kind: "list",
          items: [
            l("Chrome : Paramètres › Confidentialité et sécurité › Cookies", "Chrome: Settings › Privacy and security › Cookies"),
            l("Safari : Réglages › Confidentialité", "Safari: Settings › Privacy"),
            l("Firefox : Paramètres › Vie privée et sécurité", "Firefox: Settings › Privacy & Security"),
            l("Edge : Paramètres › Cookies et autorisations de site", "Edge: Settings › Cookies and site permissions"),
          ],
        },
        {
          kind: "p",
          text: l("Le nom exact des menus peut varier selon la version du navigateur.", "Exact menu names may vary with the browser version."),
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
