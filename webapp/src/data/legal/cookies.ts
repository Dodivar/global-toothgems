import { LEGAL_PATHS } from "./routes";
import { l, type LegalDocument, type LegalSection } from "./types";
import { ADVERTISING_ENABLED } from "../../lib/metaPixelConfig";

/**
 * Cookie policy.
 *
 * Mirrors what the site really does: PostHog only after the analytics choice
 * (`lib/cookieConsent.tsx`), OpenFreeMap tiles for the Glowbook maps, Stripe
 * on the payment page. Every name and duration in the inventory was checked
 * against the code on 2026-11-08, session replay and the account-id-only identity on 2026-11-12 (`lib/posthogConfig.ts`, `lib/cookieConsent.tsx`, `i18n/preference.ts`,
 * `lib/cartStorage.ts`, `@supabase/ssr` defaults, `instrumentation-client.ts`).
 * Update it — and `updated` — when a cookie, a provider or a category changes.
 *
 * The advertising category (Meta Pixel, 2026-11-13) is described only once
 * the pixel is configured (`ADVERTISING_ENABLED`, `lib/metaPixelConfig.ts`):
 * until then the policy keeps saying no advertising tracker is used, which is
 * then true. Wording to be reviewed by a lawyer (supabase/README.md, review of 2026-11-11).
 */

const ADVERTISING_SECTION: LegalSection = {
  id: "advertising",
  title: l("Publicité (pixel Meta)", "Advertising (Meta pixel)"),
  blocks: [
    {
      kind: "p",
      text: l(
        "Avec votre accord seulement, distinct de celui de la mesure d’audience, nous utilisons le pixel de Meta Platforms Ireland Ltd (Facebook, Instagram) sur les pages de la boutique. Il nous sert à mesurer les visites et les achats venus de nos publicités sur ces réseaux, et à y montrer aux visiteurs les produits qu’ils ont consultés. Tant que vous n’avez pas accepté cette catégorie, le pixel n’est pas chargé et rien n’est envoyé à Meta.",
        "Only with your agreement, separate from the analytics one, we use the pixel of Meta Platforms Ireland Ltd (Facebook, Instagram) on the shop’s pages. We use it to measure the visits and purchases that come from our ads on those networks, and to show visitors there the products they looked at. Until you accept this category, the pixel is not loaded and nothing is sent to Meta.",
      ),
    },
    {
      kind: "p",
      text: l(
        "Une fois votre accord donné, Meta reçoit l’adresse de la page, votre adresse IP, les informations de votre navigateur, un identifiant déposé dans votre navigateur (cookies _fbp et, si vous arrivez d’une publicité, _fbc) et nos événements : page vue, produit consulté, ajout au panier, début de paiement et achat, avec les références et prix des produits et le numéro de commande. Nous ne lui transmettons ni votre nom, ni votre adresse e-mail, ni votre téléphone. Le pixel n’est jamais chargé dans votre espace membre, à la connexion, dans le Studio 3D, sur les pages de cours ni sur la page de rétractation.",
        "Once you agree, Meta receives the page address, your IP address, your browser information, an identifier stored in your browser (the _fbp cookie and, if you come from an ad, _fbc) and our events: page viewed, product viewed, added to cart, checkout started and purchase, with the products’ references and prices and the order number. We pass on neither your name, nor your e-mail address, nor your phone number. The pixel is never loaded in your member space, when signing in, in the 3D Studio, on course pages or on the withdrawal page.",
      ),
    },
    {
      kind: "p",
      text: l(
        "Pour la collecte par le pixel et sa transmission, Meta et nous sommes responsables conjoints du traitement ; Meta traite ensuite ces données pour ses propres finalités comme responsable de traitement, selon sa politique de confidentialité, et peut les transférer aux États-Unis (cadre de protection des données UE–États-Unis). Si vous retirez votre accord, le pixel est désactivé aussitôt et ses cookies sont effacés de votre navigateur.",
        "For the collection by the pixel and its transmission, Meta and we are joint controllers; Meta then processes this data for its own purposes as a controller, under its own privacy policy, and may transfer it to the United States (EU–US Data Privacy Framework). If you withdraw your agreement, the pixel is switched off at once and its cookies are erased from your browser.",
      ),
    },
  ],
};

export const COOKIE_POLICY: LegalDocument = {
  id: "cookies",
  path: LEGAL_PATHS.cookies,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Politique cookies", "Cookie policy"),
  intro: l(
    "Ce que sont les cookies, à quoi ils servent sur Global Toothgems, et comment accepter, refuser ou changer d’avis à tout moment.",
    "What cookies are, what they are used for on Global Toothgems, and how to accept, refuse or change your mind at any time.",
  ),
  updated: ADVERTISING_ENABLED ? "2026-11-13" : "2026-11-12",
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
            ...(ADVERTISING_ENABLED
              ? [
                  {
                    category: l("Publicité", "Advertising"),
                    purpose: l(
                      "Mesurer les visites et achats venus de nos publicités Facebook et Instagram, et y montrer nos produits (pixel Meta)",
                      "Measure the visits and purchases that come from our Facebook and Instagram ads, and show our products there (Meta pixel)",
                    ),
                    used: l("Oui, sur les pages de la boutique", "Yes, on the shop’s pages"),
                    consent: l("Refusée par défaut, à accepter", "Off by default, you opt in"),
                  },
                ]
              : []),
          ],
        },
        {
          kind: "p",
          text: ADVERTISING_ENABLED
            ? l(
                "En dehors du pixel Meta décrit plus bas, et seulement avec votre accord, nous n’utilisons **aucun autre cookie publicitaire, de ciblage ou de réseau social** (pas de pixel TikTok ni de balise Google Ads). Les liens de nos campagnes peuvent porter des paramètres d’adresse (utm, identifiant de clic) : ils servent à afficher la page de présentation du Studio 3D sans le menu de la boutique, et ne sont transmis à Meta qu’avec votre accord pour la publicité.",
                "Apart from the Meta pixel described below, and only with your agreement, we use **no other advertising, targeting or social-network cookies** (no TikTok pixel or Google Ads tag). Links in our campaigns may carry address parameters (utm, click identifier): they are used to show the 3D Studio presentation page without the shop menu, and are passed to Meta only with your agreement to advertising.",
              )
            : l(
            "Nous n’utilisons **aucun cookie publicitaire, de ciblage ou de réseau social** (pas de pixel Meta, TikTok ou Google Ads). Les liens de nos campagnes peuvent porter des paramètres d’adresse (utm, identifiant de clic) : ils servent seulement à afficher la page de présentation du Studio 3D sans le menu de la boutique, ne sont transmis à aucun tiers et ne sont comptés dans la mesure d’audience qu’avec votre accord.",
            "We use **no advertising, targeting or social-network cookies** (no Meta, TikTok or Google Ads pixel). Links in our campaigns may carry address parameters (utm, click identifier): they are only used to show the 3D Studio presentation page without the shop menu, are passed to no third party, and are counted in audience measurement only with your agreement.",
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
            "Ils permettent d’utiliser les fonctions de base : se connecter à son compte, garder un panier, payer en sécurité, retenir la langue que vous avez choisie et vos choix cookies. Sans eux, le site ne peut pas fonctionner correctement ; ils sont déposés sans consentement et ne peuvent pas être désactivés depuis nos paramètres.",
            "They make the basic functions possible: signing in to your account, keeping a cart, paying securely, remembering the language you chose and your cookie choices. Without them the site cannot work properly; they are set without consent and cannot be switched off in our settings.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Le site garde aussi dans votre navigateur des réglages que vous choisissez vous-même (disposition de l’éditeur du Studio 3D, visite guidée déjà vue, dossiers repliés) et, dans le Studio, les essais « sur mon sourire » des dernières 24 heures, effacés à la déconnexion. Ces données restent sur votre appareil et ne nous sont pas envoyées.",
            "The site also keeps in your browser settings you choose yourself (3D Studio editor layout, guided tour already seen, folded folders) and, in the Studio, your “on my smile” try-ons of the last 24 hours, erased when you sign out. This data stays on your device and is not sent to us.",
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
            "Avec votre accord seulement, nous utilisons PostHog (serveurs situés dans l’Union européenne) pour savoir quelles pages sont consultées, où la navigation se complique, quelles fonctions sont utilisées (panier, paiement, Studio 3D, Academy) et quelles erreurs surviennent. Tant que vous n’avez pas accepté cette catégorie, aucune donnée vous concernant n’est envoyée à PostHog : seules les erreurs techniques de nos serveurs y sont signalées, sans cookie, adresse IP ni identifiant de visiteur.",
            "Only with your agreement, we use PostHog (servers located in the European Union) to know which pages are visited, where navigation gets difficult, which features are used (cart, payment, 3D Studio, Academy) and which errors occur. Until you accept this category, no data about you is sent to PostHog: only our servers’ technical errors are reported there, without any cookie, IP address or visitor identifier.",
          ),
        },
        {
          kind: "p",
          text: l(
            "Une fois votre accord donné, PostHog enregistre un identifiant dans votre navigateur. Si vous êtes connecté, il est rattaché au numéro interne de votre compte, sans votre adresse e-mail ni votre nom. Les codes et jetons présents dans les adresses des pages (connexion, liens envoyés par e-mail) sont masqués avant l’envoi. Ces données servent uniquement à notre propre analyse et ne sont ni vendues ni utilisées pour de la publicité. Si vous retirez votre accord, la collecte s’arrête et cet identifiant est effacé de votre navigateur (voir plus bas).",
            "Once you agree, PostHog stores an identifier in your browser. If you are signed in, it is linked to your account’s internal number, without your e-mail address or name. Codes and tokens in page addresses (sign-in, links sent by e-mail) are masked before sending. This data is used only for our own analysis and is neither sold nor used for advertising. If you withdraw your agreement, collection stops and that identifier is erased from your browser (see below).",
          ),
        },
        {
          kind: "p",
          text: l(
            "Avec ce même accord, PostHog enregistre aussi le déroulé de certaines visites (pages, clics, défilement), pour revoir où un parcours se bloque : seulement sur les pages publiques du site (boutique, Academy, Glowbook…), dans le Studio 3D et sur les pages de cours. Tout ce que vous saisissez (adresse, e-mail, mot de passe, recherche) est masqué, la carte bancaire est saisie chez Stripe et n’est jamais visible, et rien n’est enregistré dans votre espace membre, à la connexion ni sur la page de rétractation. Ces enregistrements sont conservés par PostHog au plus 30 jours, et plus aucun n’est fait une fois votre accord retiré.",
            "With the same agreement, PostHog also records how some visits unfold (pages, clicks, scrolling), so we can see where a journey gets stuck: only on the site’s public pages (shop, Academy, Glowbook…), in the 3D Studio and on the course pages. Everything you type (address, e-mail, password, search) is masked, your card is entered at Stripe and never visible, and nothing is recorded in your member space, when signing in or on the withdrawal page. PostHog keeps these recordings for at most 30 days, and none are made once you withdraw your agreement.",
          ),
        },
      ],
    },
    ...(ADVERTISING_ENABLED ? [ADVERTISING_SECTION] : []),
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
            "Votre choix de cookies, qu’il s’agisse d’un accord ou d’un refus, est conservé 6 mois dans votre navigateur ; nous vous le redemandons ensuite. Aucun cookie optionnel n’a une durée de vie supérieure à 13 mois.",
            "Your cookie choice, whether an acceptance or a refusal, is kept for 6 months in your browser; we ask you again after that. No optional cookie lives longer than 13 months.",
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
              name: l("sb-…-auth-token (cookie)", "sb-…-auth-token (cookie)"),
              provider: l("Global Toothgems (Supabase Auth)", "Global Toothgems (Supabase Auth)"),
              category: l("Nécessaire — connexion", "Necessary — sign-in"),
              duration: l("Jusqu’à la déconnexion, au plus 400 jours", "Until you sign out, at most 400 days"),
            },
            {
              name: l("gt-cookie-consent (stockage local)", "gt-cookie-consent (local storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire — votre choix cookies", "Necessary — your cookie choice"),
              duration: l("6 mois", "6 months"),
            },
            {
              name: l("gt-lang (cookie et stockage local)", "gt-lang (cookie and local storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire — langue choisie", "Necessary — chosen language"),
              duration: l("1 an (cookie), jusqu’à modification (stockage local)", "1 year (cookie), until changed (local storage)"),
            },
            {
              name: l("gt-last-sign-in (stockage local)", "gt-last-sign-in (local storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l(
                "Nécessaire — rappelle le moyen de connexion utilisé en dernier (e-mail, Google ou Apple), sans aucune donnée du compte",
                "Necessary — remembers the sign-in method used last (email, Google or Apple), without any account data",
              ),
              duration: l("Jusqu’à la suppression du compte ou l’effacement par le navigateur", "Until the account is deleted or the browser clears it"),
            },
            {
              name: l("gt-cart (stockage de session)", "gt-cart (session storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire — panier", "Necessary — cart"),
              duration: l("Fermeture de l’onglet", "Until the tab is closed"),
            },
            {
              name: l("Autres gt-… (stockage de session)", "Other gt-… (session storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire — navigation, paiement Studio en cours, liens temporaires des fichiers", "Necessary — navigation, Studio payment under way, temporary file links"),
              duration: l("Fermeture de l’onglet", "Until the tab is closed"),
            },
            {
              name: l("gt-studio3d-… (stockage local)", "gt-studio3d-… (local storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire — réglages de l’éditeur que vous choisissez", "Necessary — editor settings you choose"),
              duration: l("Jusqu’à modification", "Until changed"),
            },
            {
              name: l("gt-studio-try-on (base locale du navigateur)", "gt-studio-try-on (browser local database)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Nécessaire — essais sur votre sourire, sur votre appareil uniquement", "Necessary — try-ons on your smile, on your device only"),
              duration: l("24 heures, effacés à la déconnexion", "24 hours, erased when you sign out"),
            },
            {
              name: l("__stripe_mid, __stripe_sid (cookies)", "__stripe_mid, __stripe_sid (cookies)"),
              provider: l("Stripe", "Stripe"),
              category: l("Nécessaire — paiement et prévention de la fraude", "Necessary — payment and fraud prevention"),
              duration: l("1 an, 30 minutes", "1 year, 30 minutes"),
            },
            {
              name: l("__ph_opt_in_out_… (stockage local)", "__ph_opt_in_out_… (local storage)"),
              provider: l("PostHog", "PostHog"),
              category: l("Nécessaire — retient l’accord ou le refus de mesure d’audience", "Necessary — remembers whether analytics is allowed"),
              duration: l("Jusqu’à modification", "Until changed"),
            },
            {
              name: l("ph_…_posthog (cookie et stockage local)", "ph_…_posthog (cookie and local storage)"),
              provider: l("PostHog", "PostHog"),
              category: l("Mesure d’audience — seulement avec votre accord", "Analytics — only with your agreement"),
              duration: l("1 an, effacé si vous retirez votre accord", "1 year, erased if you withdraw your agreement"),
            },
            ...(ADVERTISING_ENABLED
              ? [
                  {
                    name: l("_fbp, _fbc (cookies)", "_fbp, _fbc (cookies)"),
                    provider: l("Meta", "Meta"),
                    category: l("Publicité — seulement avec votre accord", "Advertising — only with your agreement"),
                    duration: l("90 jours, effacés si vous retirez votre accord", "90 days, erased if you withdraw your agreement"),
                  },
                  {
                    name: l("gt-pixel-evt:… (stockage de session)", "gt-pixel-evt:… (session storage)"),
                    provider: l("Global Toothgems", "Global Toothgems"),
                    category: l(
                      "Publicité — seulement avec votre accord, évite de signaler deux fois un achat à Meta",
                      "Advertising — only with your agreement, avoids reporting a purchase to Meta twice",
                    ),
                    duration: l("Fermeture de l’onglet", "Until the tab is closed"),
                  },
                ]
              : []),
            {
              name: l("gt-studio-evt:… (stockage local et de session)", "gt-studio-evt:… (local and session storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Mesure d’audience — seulement avec votre accord, évite de compter deux fois une étape du Studio", "Analytics — only with your agreement, avoids counting a Studio step twice"),
              duration: l("Jusqu’à effacement (local), fermeture de l’onglet (session)", "Until cleared (local), until the tab is closed (session)"),
            },
            {
              name: l("gt-shop-evt:… (stockage de session)", "gt-shop-evt:… (session storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Mesure d’audience — seulement avec votre accord, évite de compter deux fois une commande", "Analytics — only with your agreement, avoids counting an order twice"),
              duration: l("Fermeture de l’onglet", "Until the tab is closed"),
            },
            {
              name: l("gt-academy-evt:… (stockage de session)", "gt-academy-evt:… (session storage)"),
              provider: l("Global Toothgems", "Global Toothgems"),
              category: l("Mesure d’audience — seulement avec votre accord, évite de compter deux fois une étape de formation", "Analytics — only with your agreement, avoids counting a course step twice"),
              duration: l("Fermeture de l’onglet", "Until the tab is closed"),
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
          text: ADVERTISING_ENABLED
            ? l(
                "Cliquez sur « Paramètres cookies » en bas de chaque page, ou utilisez le bouton « Modifier mes choix » en haut de cette page. Vous pouvez y activer ou désactiver séparément la mesure d’audience et la publicité, les deux catégories optionnelles du site.",
                "Click “Cookie settings” at the bottom of any page, or use the “Change my choices” button at the top of this page. There you can switch audience measurement and advertising, the site’s two optional categories, on or off separately.",
              )
            : l(
            "Cliquez sur « Paramètres cookies » en bas de chaque page, ou utilisez le bouton « Modifier mes choix » en haut de cette page. Vous pouvez y activer ou désactiver la mesure d’audience, seule catégorie optionnelle du site.",
            "Click “Cookie settings” at the bottom of any page, or use the “Change my choices” button at the top of this page. There you can switch audience measurement, the site’s only optional category, on or off.",
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
          text: ADVERTISING_ENABLED
            ? l(
                "Vous pouvez retirer votre consentement à tout moment, aussi simplement que vous l’avez donné, depuis les mêmes paramètres. Le retrait vaut pour l’avenir : la mesure d’audience s’arrête aussitôt et l’identifiant PostHog est effacé de votre navigateur ; le pixel Meta est désactivé et ses cookies effacés. Vous pouvez aussi supprimer depuis votre navigateur les cookies déjà déposés.",
                "You can withdraw consent at any time, as easily as you gave it, from the same settings. Withdrawal applies from then on: audience measurement stops at once and the PostHog identifier is erased from your browser; the Meta pixel is switched off and its cookies erased. You can also delete cookies already set from your browser.",
              )
            : l(
            "Vous pouvez retirer votre consentement à tout moment, aussi simplement que vous l’avez donné, depuis les mêmes paramètres. Le retrait vaut pour l’avenir : la mesure d’audience s’arrête aussitôt et l’identifiant PostHog est effacé de votre navigateur. Vous pouvez aussi supprimer depuis votre navigateur les cookies déjà déposés.",
            "You can withdraw consent at any time, as easily as you gave it, from the same settings. Withdrawal applies from then on: audience measurement stops at once and the PostHog identifier is erased from your browser. You can also delete cookies already set from your browser.",
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
