import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/**
 * Legal notice ("mentions légales").
 *
 * Every identifier on this page is left empty on purpose. The fields list what
 * is usually required for an online shop; which of them actually apply depends
 * on the business's legal form and country of establishment, which this
 * prototype does not know.
 */
export const LEGAL_NOTICE: LegalDocument = {
  id: "legal-notice",
  path: LEGAL_PATHS.legalNotice,
  eyebrow: l("Informations légales", "Legal information"),
  title: l("Mentions légales", "Legal notice"),
  intro: l(
    "Qui édite ce site, qui l’héberge et comment nous joindre. Les informations d’identification de l’entreprise sont à compléter et à vérifier avant publication.",
    "Who publishes this website, who hosts it and how to reach us. The company’s identification details must be completed and verified before publication.",
  ),
  updated: DRAFT_DATE,
  showKey: true,
  contactCategory: "other",
  lead: [
    {
      kind: "internal",
      text: l(
        "Les informations de l’entreprise doivent être vérifiées avant publication. Aucun numéro d’immatriculation, numéro de TVA, adresse ou hébergeur n’a été renseigné : chaque champ vide est à fournir par l’entreprise, et la liste des mentions obligatoires est à confirmer selon la forme juridique et le pays d’établissement réels.",
        "Business information must be verified before publication. No registration number, VAT number, address or hosting provider has been filled in: every empty field must be supplied by the business, and the list of mandatory disclosures must be confirmed against the actual legal form and country of establishment.",
      ),
    },
  ],
  sections: [
    {
      id: "publisher",
      title: l("Éditeur du site", "Website publisher"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le site Global Toothgems est édité par l’entreprise identifiée ci-dessous.",
            "The Global Toothgems website is published by the company identified below.",
          ),
        },
        {
          kind: "fields",
          fields: [
            { label: l("Dénomination sociale", "Legal business name"), placeholder: l("Dénomination sociale", "Legal business name") },
            { label: l("Nom commercial / marque", "Trading name / brand"), value: l("Global Toothgems", "Global Toothgems") },
            {
              label: l("Forme juridique", "Legal entity type"),
              placeholder: l("Forme juridique", "Legal entity type"),
              hint: l("Et montant du capital social, si la forme juridique l’exige.", "And share capital, where the legal form requires it."),
            },
            { label: l("Siège social / adresse", "Registered office / address"), placeholder: l("Adresse du siège social", "Registered office address") },
            {
              label: l("Numéro d’immatriculation", "Registration number"),
              placeholder: l("Numéro et registre d’immatriculation", "Registration number and register"),
            },
            {
              label: l("Numéro de TVA intracommunautaire", "VAT number"),
              placeholder: l("Numéro de TVA", "VAT number"),
              hint: l("Uniquement si l’entreprise est assujettie à la TVA.", "Only if the business is registered for VAT."),
            },
            { label: l("E-mail de contact", "Contact email"), placeholder: l("Adresse e-mail de contact", "Contact email address") },
            {
              label: l("Téléphone", "Telephone"),
              placeholder: l("Numéro de téléphone", "Telephone number"),
              hint: l("Si un numéro est mis à disposition des clients.", "If a number is made available to customers."),
            },
            {
              label: l("Autres mentions obligatoires", "Other mandatory information"),
              placeholder: l("Selon la structure et le pays (ex. activité réglementée)", "Depending on structure and country (e.g. regulated activity)"),
            },
          ],
        },
      ],
    },
    {
      id: "director",
      title: l("Directeur de la publication", "Publication director"),
      blocks: [
        {
          kind: "fields",
          fields: [
            { label: l("Nom", "Name"), placeholder: l("Nom du directeur de la publication", "Publication director’s name") },
            { label: l("Qualité", "Role"), placeholder: l("Fonction au sein de l’entreprise", "Role within the company") },
          ],
        },
      ],
    },
    {
      id: "hosting",
      title: l("Hébergement", "Hosting"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Le site est hébergé par le prestataire suivant. Si plusieurs prestataires hébergent le site et ses données (application, base de données, fichiers), chacun devra être identifié.",
            "The website is hosted by the following provider. If several providers host the site and its data (application, database, files), each should be identified.",
          ),
        },
        {
          kind: "fields",
          fields: [
            { label: l("Hébergeur", "Hosting provider"), placeholder: l("Nom de l’hébergeur", "Hosting provider name") },
            { label: l("Adresse de l’hébergeur", "Hosting provider address"), placeholder: l("Adresse de l’hébergeur", "Hosting provider address") },
            { label: l("Contact de l’hébergeur", "Hosting provider contact"), placeholder: l("Téléphone ou site de l’hébergeur", "Hosting provider phone or website") },
          ],
        },
      ],
    },
    {
      id: "contact",
      title: l("Nous contacter", "Contact us"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Pour toute question concernant le site ou une commande, le moyen le plus rapide est notre <<formulaire de contact|/contact>>. Vous pouvez aussi nous écrire à [[!E-mail du service client]].",
            "For any question about the website or an order, the quickest way is our <<contact form|/contact>>. You can also write to us at [[!Customer service email]].",
          ),
        },
      ],
    },
    {
      id: "intellectual-property",
      title: l("Propriété intellectuelle", "Intellectual property"),
      blocks: [
        {
          kind: "p",
          text: l(
            "L’ensemble des contenus de ce site — textes, photographies, vidéos, supports de formation, logos, identité visuelle et mise en page — est protégé par le droit de la propriété intellectuelle. Sauf mention contraire, ces contenus appartiennent à [[!Titulaire des droits]] ou sont utilisés avec l’autorisation de leurs auteurs.",
            "All content on this website — text, photographs, videos, training materials, logos, visual identity and layout — is protected by intellectual property law. Unless stated otherwise, it belongs to [[!Rights holder]] or is used with its authors’ permission.",
          ),
        },
        {
          kind: "callout",
          tone: "legal",
          text: l(
            "Toute reproduction, représentation, adaptation ou diffusion, totale ou partielle, sans autorisation écrite préalable est interdite, sauf dans les cas prévus par la loi (par exemple la copie privée ou la courte citation).",
            "Any reproduction, performance, adaptation or distribution, in whole or in part, without prior written permission is prohibited, except where the law allows it (for example private copying or short quotation).",
          ),
        },
        {
          kind: "p",
          text: l(
            "Les photos publiées par les membres (avis, communauté) restent la propriété de leurs auteurs, dans les conditions prévues par nos <<conditions générales|/conditions-generales>>.",
            "Photos posted by members (reviews, community) remain the property of their authors, under the terms set out in our <<terms of sale|/conditions-generales>>.",
          ),
        },
      ],
    },
    {
      id: "trademarks",
      title: l("Marques", "Trademarks"),
      blocks: [
        {
          kind: "p",
          text: l(
            "« Global Toothgems » et le logo associé sont utilisés par l’éditeur du site. Statut d’enregistrement : [[Marque déposée ou non — office, numéro et classes]].",
            "“Global Toothgems” and its logo are used by the website publisher. Registration status: [[Registered or not — office, number and classes]].",
          ),
        },
        {
          kind: "p",
          text: l(
            "Les autres marques citées sur le site (par exemple celles de nos prestataires de paiement) appartiennent à leurs titulaires respectifs.",
            "Other trademarks mentioned on the site (for example those of our payment providers) belong to their respective owners.",
          ),
        },
      ],
    },
    {
      id: "liability",
      title: l("Responsabilité et liens", "Liability and links"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Nous faisons notre possible pour que les informations publiées soient exactes et à jour, mais elles peuvent contenir des erreurs ou des omissions. Les liens vers des sites tiers sont fournis pour information ; nous n’avons pas de contrôle sur leur contenu.",
            "We do our best to keep the information published here accurate and up to date, but it may contain errors or omissions. Links to third-party websites are provided for information; we have no control over their content.",
          ),
        },
        {
          kind: "callout",
          tone: "instruction",
          text: l(
            "Vous constatez une erreur ou un contenu qui porte atteinte à vos droits ? Signalez-le-nous via le <<formulaire de contact|/contact?sujet=other>> en précisant la page concernée.",
            "Spotted an error or content that infringes your rights? Let us know through the <<contact form|/contact?sujet=other>>, stating the page concerned.",
          ),
        },
      ],
    },
    {
      id: "personal-data",
      title: l("Données personnelles et cookies", "Personal data and cookies"),
      blocks: [
        {
          kind: "p",
          text: l(
            "La manière dont nous traitons vos données est décrite dans notre <<politique de confidentialité|/confidentialite>>, et l’usage des cookies dans notre <<politique cookies|/cookies>>.",
            "How we process your data is described in our <<privacy policy|/confidentialite>>, and our use of cookies in our <<cookie policy|/cookies>>.",
          ),
        },
      ],
    },
    {
      id: "law",
      title: l("Droit applicable", "Applicable law"),
      blocks: [
        {
          kind: "p",
          text: l(
            "Les présentes mentions légales sont régies par [[Droit applicable]]. Les règles applicables aux ventes figurent dans nos <<conditions générales de vente|/conditions-generales>>.",
            "This legal notice is governed by [[Applicable law]]. The rules that apply to sales are set out in our <<terms of sale|/conditions-generales>>.",
          ),
        },
      ],
    },
  ],
};
