/**
 * Visual preview of the e-mail layout (decision 79: a script, not a dev server).
 *
 *   cd supabase/functions
 *   deno run --no-lock --allow-write=<dir> _shared/email/preview.ts <dir>
 *
 * Writes two HTML files into <dir>, to open in a browser or paste into an e-mail
 * testing tool:
 *   - components.fr.html — every component of the layout, with EXAMPLE content;
 *   - template.en.html — a database template as it is sent today (body only, no extras).
 * Nothing here is sent or deployed; the content is placeholder text, not real wording.
 */
import {
  accentLine,
  courseCard,
  details,
  divider,
  heading,
  image,
  notice,
  orderSummary,
  paragraph,
  productCard,
  promo,
  textLink,
} from "./components.ts";
import { type LayoutOptions, renderEmail, type TemplateRow } from "./render.ts";

const SITE = "https://globaltoothgems.com";
const MEDIA = "https://abvuyvryerpzlvibttxp.supabase.co/storage/v1/object/public/product-media/products";
const GEM_A = `${MEDIA}/b50b953a-688f-4d43-bff4-d5406f1d2adf/2fb57c92-f84f-4daf-9a8b-0f83eb372a55.webp`;
const GEM_B = `${MEDIA}/3176ea3e-dc7a-4092-b9b8-12dd20d8ed7c/360b75da-d546-4718-b94d-2c4458d46353.webp`;
const GEM_C = `${MEDIA}/89ea34cb-9948-443d-b630-5e094d91fe5f/4948a84d-2042-4928-a31b-75c8e155135e.webp`;

const layout: LayoutOptions = { brandName: "Global Toothgems", siteUrl: SITE };

const exampleTemplate: TemplateRow = {
  locale: "fr",
  subject: "Votre commande {{order_number}} est confirmée",
  preheader: "Merci {{first_name}} ! Nous préparons vos gems avec soin.",
  body:
    "Bonjour {{first_name}},\n\nMerci pour votre confiance. Votre paiement est validé et notre atelier lyonnais prépare déjà votre colis.\n\nVous recevrez un e-mail avec le lien de suivi dès son expédition.",
  variables: ["first_name", "order_number"],
};

const components = renderEmail(exampleTemplate, { first_name: "Camille", order_number: "GT-1042" }, layout, {
  eyebrow: "Exemple · Confirmation de commande",
  title: "Merci Camille, votre commande est confirmée",
  intro: "Ceci est un aperçu du gabarit : chaque bloc ci-dessous est un composant réutilisable, rempli de contenu d’exemple.",
  primaryAction: { label: "Suivre ma commande", url: `${SITE}/compte/commandes` },
  secondaryAction: { label: "Continuer mes achats", url: `${SITE}/fr/boutique` },
  blocks: [
    notice({ tone: "success", title: "Paiement confirmé", body: "Nous avons bien reçu votre paiement de 87,60 €." }),
    orderSummary({
      title: "Récapitulatif",
      reference: "Commande GT-1042 · 7 octobre 2026",
      status: { label: "Payée", tone: "success" },
      quantityLabel: (n) => `Qté ${n}`,
      lines: [
        { name: "Heart Crystal", detail: "Cristal · 2 mm", quantity: 2, amount: "29,80 €", imageUrl: GEM_A, imageAlt: "Gem en forme de cœur" },
        { name: "Star Aurora", detail: "Aurora boréale", quantity: 1, amount: "18,90 €", imageUrl: GEM_B, imageAlt: "Gem étoile irisé" },
        { name: "Formation Initiation Tooth Gems", detail: "Accès en ligne", amount: "34,00 €" },
      ],
      totals: [
        { label: "Sous-total", amount: "82,70 €" },
        { label: "Livraison (France)", amount: "4,90 €" },
        { label: "Total TTC", amount: "87,60 €", strong: true },
      ],
    }),
    details({
      title: "Livraison",
      rows: [
        { label: "Adresse", value: "Camille Martin\n12 rue de l’Exemple\n69002 Lyon, France" },
        { label: "Mode", value: "Colissimo suivi · 2 à 3 jours ouvrés" },
      ],
    }),
    heading("Votre formation vous attend"),
    courseCard({
      imageUrl: GEM_C,
      imageAlt: "Pose d’un tooth gem",
      facts: ["Débutant", "6 modules", "3 h 30"],
      title: "Initiation Tooth Gems",
      description: "Les gestes, l’hygiène et le matériel pour réaliser vos premières poses en toute sécurité.",
      badge: { label: "Accès ouvert", tone: "success" },
      link: { label: "Commencer la formation", url: `${SITE}/academy` },
    }),
    notice({
      tone: "info",
      title: "Votre compte Global Toothgems",
      body: "Commandes, formations et créations Studio 3D sont réunies dans un seul espace.",
      link: { label: "Ouvrir mon espace", url: `${SITE}/compte` },
    }),
    notice({ tone: "warning", title: "Adresse à vérifier", body: "Le numéro de rue semble manquer : répondez-nous avant l’expédition." }),
    notice({ tone: "important", title: "Action requise", body: "Exemple de message important : confirmez votre adresse e-mail." }),
    divider({ sparkle: true }),
    accentLine("Un petit éclat qui change tout."),
    paragraph("Exemple de paragraphe éditorial : le texte courant reste en Montserrat, lisible et sobre."),
    productCard({
      imageUrl: GEM_B,
      imageAlt: "Gem étoile irisé",
      name: "Star Aurora",
      description: "Cristal irisé, reflets bleu-rose. Fixation dentaire professionnelle.",
      price: "18,90 €",
      badge: { label: "Nouveau", tone: "info" },
      link: { label: "Voir le produit", url: `${SITE}/fr/boutique` },
    }),
    promo({
      eyebrow: "Offre membre",
      title: "−15 % sur votre prochaine commande",
      body: "Exemple de bloc promotionnel. Valable jusqu’au 31 octobre sur toute la boutique.",
      code: { label: "Code", value: "ECLAT15" },
      link: { label: "Découvrir la boutique", url: `${SITE}/fr/boutique` },
    }),
    image({
      src: GEM_A,
      alt: "Gem en forme de cœur sur fond clair",
      width: 520,
      height: 520,
      caption: "Exemple de bloc image avec légende.",
      href: `${SITE}/fr/boutique`,
    }),
    divider(),
    textLink({ label: "Consulter nos conseils d’entretien", url: `${SITE}/fr/aide` }),
  ],
  unsubscribeUrl: `${SITE}/newsletter/desinscription?token=example`,
});

const plain = renderEmail(
  {
    locale: "en",
    subject: "Your gift card from {{sender_name}}",
    preheader: "A little sparkle is waiting for you",
    body:
      "Hello {{recipient_name}},\n\n{{sender_name}} sent you a Global Toothgems gift card worth {{amount}}.\n\nYour code: {{code}}\n\nUse it at {{shop_url}}",
    variables: ["recipient_name", "sender_name", "amount", "code", "shop_url"],
  },
  { recipient_name: "Alex", sender_name: "Sam", amount: "€50.00", code: "GT-XXXX-XXXX-1234", shop_url: `${SITE}/en` },
  layout,
);

const dir = Deno.args[0];
if (!dir) {
  console.error("usage: deno run --allow-write=<dir> _shared/email/preview.ts <dir>");
  Deno.exit(1);
}
await Deno.writeTextFile(`${dir}/components.fr.html`, components.html);
await Deno.writeTextFile(`${dir}/components.fr.txt`, components.text);
await Deno.writeTextFile(`${dir}/template.en.html`, plain.html);
console.log(`components.fr.html: ${(components.html.length / 1024).toFixed(1)} KB, template.en.html: ${(plain.html.length / 1024).toFixed(1)} KB`);
