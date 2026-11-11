import type { StoreDetails } from "../adminSettings";
import type { Localized } from "../types";
import { countryName } from "../../lib/countryName";
import { addressLines } from "../../lib/storeDetails";
import { LEGAL_PATHS } from "./routes";
import { DRAFT_DATE, l, type LegalDocument } from "./types";

/** The same value in both languages; nothing when it has not been supplied. */
const same = (value: string | undefined): Localized | undefined => (value?.trim() ? l(value.trim(), value.trim()) : undefined);

function legalFormValue(store: StoreDetails): Localized | undefined {
  const form = store.legalForm.trim();
  const capital = store.shareCapital.trim();
  if (!form) return undefined;
  return capital ? l(`${form} au capital de ${capital}`, `${form} with share capital of ${capital}`) : same(form);
}

function officeValue(store: StoreDetails): Localized | undefined {
  const lines = addressLines(store);
  if (!store.address1.trim() || lines.length === 0) return undefined;
  return l([...lines, countryName(store.country, "fr")].join(", "), [...lines, countryName(store.country, "en")].join(", "));
}

/**
 * Who publishes the site: the publisher (decision 121) — the business that
 * holds the site, distinct from the seller — named by its trading name.
 */
function publisherSentence(store: StoreDetails | null): Localized {
  const brand = store?.storeName.trim() || "Global Toothgems";
  const publisher = store ? store.publisherName.trim() || store.publisherLegalName.trim() : "";
  return publisher
    ? l(`Le site ${brand} est détenu et édité par ${publisher}, entreprise identifiée ci-dessous.`, `The ${brand} website is owned and published by ${publisher}, the business identified below.`)
    : l(`Le site ${brand} est édité par l’entreprise identifiée ci-dessous.`, `The ${brand} website is published by the business identified below.`);
}

/**
 * Who sells: the seller of the goods, courses and gift cards, named by its
 * trading name; its legal identity is in the field list, as the law requires
 * (LCEN art. 19), not put forward (decision 120).
 */
function sellerSentence(store: StoreDetails | null): Localized {
  const seller = store ? store.tradingName.trim() || store.legalName.trim() : "";
  return seller
    ? l(
        `Les produits, formations et cartes cadeaux proposés sur le site sont vendus par ${seller}, avec qui les ventes sont conclues selon nos <<conditions générales de vente|/conditions-generales>>.`,
        `The products, courses and gift cards offered on the site are sold by ${seller}, with whom sales are concluded under our <<terms of sale|/conditions-generales>>.`,
      )
    : l(
        "Les produits, formations et cartes cadeaux proposés sur le site sont vendus par l’entreprise identifiée ci-dessous.",
        "The products, courses and gift cards offered on the site are sold by the business identified below.",
      );
}

/**
 * Who sells the 3D Studio: the website publisher (decision 135), identified in
 * the publisher section above; its subscriptions follow their own terms.
 */
function studioSellerSentence(store: StoreDetails | null): Localized {
  const publisher = store ? store.publisherName.trim() || store.publisherLegalName.trim() : "";
  return publisher
    ? l(
        `Les abonnements au Studio 3D sont vendus par l’éditeur du site, ${publisher}, identifié ci-dessus, selon les <<conditions générales d’abonnement au Studio 3D|/conditions-abonnement-studio>>. C’est lui qui encaisse ces abonnements et en émet les factures.`,
        `3D Studio subscriptions are sold by the website publisher, ${publisher}, identified above, under the <<3D Studio subscription terms|/conditions-abonnement-studio>>. It collects these subscriptions and issues their invoices.`,
      )
    : l(
        "Les abonnements au Studio 3D sont vendus par l’éditeur du site, identifié ci-dessus, selon les <<conditions générales d’abonnement au Studio 3D|/conditions-abonnement-studio>>.",
        "3D Studio subscriptions are sold by the website publisher, identified above, under the <<3D Studio subscription terms|/conditions-abonnement-studio>>.",
      );
}

/** Replaces a "to be supplied" marker by the supplied value, in both languages. */
function fill(text: Localized, markers: Localized, value: string | undefined): Localized {
  const v = value?.trim();
  if (!v) return text;
  return { fr: text.fr.replace(markers.fr, v), en: text.en.replace(markers.en, v) };
}

/**
 * Legal notice ("mentions légales"), filled with the business details saved in
 * Settings › Store (`store_settings`). A detail that has not been supplied
 * keeps its placeholder, so the page shows what is still missing instead of
 * inventing it. Which fields actually apply depends on the business's legal
 * form and country of establishment — the reviewer note says so.
 */
export function legalNotice(store: StoreDetails | null): LegalDocument {
  const contactEmail = store ? store.businessEmail.trim() || store.supportEmail.trim() : "";
  return {
    id: "legal-notice",
    path: LEGAL_PATHS.legalNotice,
    eyebrow: l("Informations légales", "Legal information"),
    title: l("Mentions légales", "Legal notice"),
    intro: l(
      "Qui édite ce site, qui vend ce qu’il propose, qui l’héberge et comment nous joindre.",
      "Who publishes this website, who sells what it offers, who hosts it and how to reach us.",
    ),
    updated: DRAFT_DATE,
    showKey: true,
    contactCategory: "other",
    lead: [
      // Editor's note, never published: Business information comes from the store settings (back office › Settings › Store). A field still empty must be supplied: the publisher’s and the seller’s telephone numbers are mandatory (LCEN, art. 6 III and 19).
    ],
    sections: [
      {
        id: "publisher",
        title: l("Éditeur du site", "Website publisher"),
        blocks: [
          { kind: "p", text: publisherSentence(store) },
          {
            kind: "fields",
            fields: [
              { label: l("Nom commercial", "Trading name"), value: same(store?.publisherName), placeholder: l("Nom commercial de l’éditeur", "Publisher’s trading name") },
              { label: l("Marque du site", "Website brand"), value: same(store?.storeName) ?? l("Global Toothgems", "Global Toothgems") },
              {
                label: l("Dénomination", "Legal name"),
                value: same(store?.publisherLegalName),
                placeholder: l("Dénomination (ou nom de l’entrepreneur)", "Legal name (or the entrepreneur’s name)"),
              },
              { label: l("Forme juridique", "Legal entity type"), value: same(store?.publisherLegalForm), placeholder: l("Forme juridique", "Legal entity type") },
              {
                label: l("Siège social / adresse", "Registered office / address"),
                value: same(store?.publisherAddress),
                placeholder: l("Adresse du siège social", "Registered office address"),
              },
              {
                label: l("Numéro d’immatriculation", "Registration number"),
                value: same(store?.publisherRegistrationNumber),
                placeholder: l("Numéro et registre d’immatriculation", "Registration number and register"),
              },
              { label: l("E-mail de contact", "Contact email"), value: same(store?.publisherEmail), placeholder: l("Adresse e-mail de l’éditeur", "Publisher’s email address") },
              { label: l("Téléphone", "Telephone"), value: same(store?.publisherPhone), placeholder: l("Numéro de téléphone de l’éditeur", "Publisher’s telephone number") },
            ],
          },
        ],
      },
      {
        id: "seller",
        title: l("Vendeur", "Seller"),
        blocks: [
          { kind: "p", text: sellerSentence(store) },
          {
            kind: "fields",
            fields: [
              { label: l("Nom commercial", "Trading name"), value: same(store?.tradingName), placeholder: l("Nom commercial", "Trading name") },
              {
                label: l("Dénomination", "Legal name"),
                value: same(store?.legalName),
                placeholder: l("Dénomination (ou nom de l’entrepreneur)", "Legal name (or the entrepreneur’s name)"),
              },
              {
                label: l("Forme juridique", "Legal entity type"),
                value: store ? legalFormValue(store) : undefined,
                placeholder: l("Forme juridique", "Legal entity type"),
                hint: l("Et montant du capital social, si la forme juridique l’exige.", "And share capital, where the legal form requires it."),
              },
              {
                label: l("Siège social / adresse", "Registered office / address"),
                value: store ? officeValue(store) : undefined,
                placeholder: l("Adresse du siège social", "Registered office address"),
              },
              {
                label: l("Numéro d’immatriculation", "Registration number"),
                value: same(store?.registrationNumber),
                placeholder: l("Numéro et registre d’immatriculation", "Registration number and register"),
              },
              {
                label: l("Numéro de TVA intracommunautaire", "VAT number"),
                value: same(store?.vatNumber),
                placeholder: l("Numéro de TVA", "VAT number"),
                hint: l("Uniquement si l’entreprise est assujettie à la TVA.", "Only if the business is registered for VAT."),
              },
              { label: l("E-mail de contact", "Contact email"), value: same(contactEmail), placeholder: l("Adresse e-mail de contact", "Contact email address") },
              {
                label: l("Téléphone", "Telephone"),
                value: store?.showPhone ? same(store.phone) : undefined,
                placeholder: l("Numéro de téléphone", "Telephone number"),
                hint: l("Obligatoire pour un vendeur en ligne (LCEN, art. 19).", "Mandatory for an online seller (LCEN, art. 19)."),
              },
            ],
          },
        ],
      },
      {
        id: "studio-seller",
        title: l("Vendeur du Studio 3D", "3D Studio seller"),
        blocks: [
          { kind: "p", text: studioSellerSentence(store) },
          {
            kind: "fields",
            fields: [
              {
                label: l("Numéro de TVA intracommunautaire", "VAT number"),
                value: same(store?.publisherVatNumber),
                placeholder: l("Numéro de TVA", "VAT number"),
                hint: l("Uniquement si l’entreprise est assujettie à la TVA.", "Only if the business is registered for VAT."),
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
              { label: l("Nom", "Name"), value: same(store?.publicationDirector), placeholder: l("Nom du directeur de la publication", "Publication director’s name") },
              { label: l("Qualité", "Role"), value: same(store?.publicationDirectorRole), placeholder: l("Fonction au sein de l’entreprise", "Role within the company") },
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
              "Le site et ses données (application, base de données, fichiers) sont hébergés par les prestataires suivants.",
              "The website and its data (application, database, files) are hosted by the following providers.",
            ),
          },
          {
            kind: "fields",
            fields: [
              { label: l("Hébergeur", "Hosting provider"), value: same(store?.hostName), placeholder: l("Nom de l’hébergeur", "Hosting provider name") },
              {
                label: l("Adresse de l’hébergeur", "Hosting provider address"),
                value: same(store?.hostAddress),
                placeholder: l("Adresse de l’hébergeur", "Hosting provider address"),
              },
              {
                label: l("Contact de l’hébergeur", "Hosting provider contact"),
                value: same(store?.hostContact),
                placeholder: l("Téléphone ou site de l’hébergeur", "Hosting provider phone or website"),
              },
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
            text: fill(
              l(
                "Pour toute question concernant le site ou une commande, le moyen le plus rapide est notre <<formulaire de contact|/contact>>. Vous pouvez aussi nous écrire à [[!E-mail du service client]].",
                "For any question about the website or an order, the quickest way is our <<contact form|/contact>>. You can also write to us at [[!Customer service email]].",
              ),
              l("[[!E-mail du service client]]", "[[!Customer service email]]"),
              store?.supportEmail,
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
            text: fill(
              l(
                "L’ensemble des contenus de ce site — textes, photographies, vidéos, supports de formation, logos, identité visuelle et mise en page — est protégé par le droit de la propriété intellectuelle. Sauf mention contraire, ces contenus appartiennent à [[!Titulaire des droits]] ou sont utilisés avec l’autorisation de leurs auteurs.",
                "All content on this website — text, photographs, videos, training materials, logos, visual identity and layout — is protected by intellectual property law. Unless stated otherwise, it belongs to [[!Rights holder]] or is used with its authors’ permission.",
              ),
              l("[[!Titulaire des droits]]", "[[!Rights holder]]"),
              store ? store.publisherName.trim() || store.publisherLegalName.trim() : undefined,
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
              "Les photos et créations publiées par les membres (avis, pages Glowbook, salons) restent la propriété de leurs auteurs, dans les conditions prévues par nos <<conditions générales d’utilisation|/conditions-generales-utilisation#user-content>>.",
              "Photos and creations posted by members (reviews, Glowbook pages, lounges) remain the property of their authors, under the terms set out in our <<terms of use|/conditions-generales-utilisation#user-content>>.",
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
              "Les noms « Global Toothgems » et « PIMP TON SMILE » et les logos associés sont des signes distinctifs protégés : toute reproduction ou utilisation sans autorisation écrite préalable est interdite.",
              "The names “Global Toothgems” and “PIMP TON SMILE” and their logos are protected distinctive signs: any reproduction or use without prior written permission is prohibited.",
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
              "Les présentes mentions légales sont régies par le droit français. Les règles applicables aux ventes figurent dans nos <<conditions générales de vente|/conditions-generales>>, celles de l’utilisation du site dans nos <<conditions générales d’utilisation|/conditions-generales-utilisation>>.",
              "This legal notice is governed by French law. The rules that apply to sales are set out in our <<terms of sale|/conditions-generales>>, those for using the site in our <<terms of use|/conditions-generales-utilisation>>.",
            ),
          },
        ],
      },
    ],
  };
}

/** The notice with nothing supplied: page metadata and mock mode. */
export const LEGAL_NOTICE: LegalDocument = legalNotice(null);
