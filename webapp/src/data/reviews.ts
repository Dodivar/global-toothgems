import type { Localized } from "./types";

export interface Review {
  author: string;
  date: string;
  rating: number;
  locale: string;
  title: Localized;
  body: Localized;
}

export const REVIEWS: Review[] = [
  {
    author: "Camille R.",
    date: "12 août 2026",
    rating: 5,
    locale: "FR",
    title: { fr: "Tenue quatre mois", en: "Held for four months" },
    body: {
      fr: "Posée sur une cliente à l’émail sensible. Collage net, aucun décollement après quatre mois de port normal.",
      en: "Applied on a client with sensitive enamel. Clean bond, no lifting after four months of normal wear.",
    },
  },
  {
    author: "Lena M.",
    date: "2 août 2026",
    rating: 5,
    locale: "DE",
    title: { fr: "La vraie valeur, c’est le kit", en: "The real value is the kit" },
    body: {
      fr: "Adhésif, mordançage et cartes de suivi correspondent à ce que le cours enseigne : rien n’est laissé au hasard en cabine.",
      en: "Adhesive, etchant and aftercare cards match exactly what the course teaches: nothing is left to chance in the chair.",
    },
  },
  {
    author: "Sofia B.",
    date: "28 juil. 2026",
    rating: 4,
    locale: "EN",
    title: { fr: "Livraison rapide", en: "Fast shipping" },
    body: {
      fr: "Deux jours pour Dublin. Les gems sont plus lumineuses en vrai qu’à l’écran, l’opale surtout.",
      en: "Two days to Dublin. The gems are more brilliant in person than on screen, especially the opal.",
    },
  },
];
