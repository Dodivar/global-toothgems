import type { Localized } from "./types";

/**
 * Testimonials shown on the alternative home page (/accueil-b).
 *
 * DEMO CONTENT. The names, quotes and ratings are fictional, written for the
 * design comparison; they are not published reviews and are not read from the
 * review system. Each one says where it comes from — the Academy or the shop —
 * and points at the course or the product it is about.
 */
export interface HomeTestimonial {
  id: string;
  kind: "academy" | "product";
  author: string;
  /** City and country, shown under the name. */
  place: Localized;
  rating: number;
  quote: Localized;
  /** Course id (`courseHref`) or product id (`/boutique/:id`). */
  refId: string;
  /** The course or product name, kept here so the card still reads if the catalogue lacks it. */
  refName: Localized;
}

export const HOME_TESTIMONIALS: HomeTestimonial[] = [
  {
    id: "ines",
    kind: "academy",
    author: "Inès D.",
    place: { fr: "Lyon, France", en: "Lyon, France" },
    rating: 5,
    quote: {
      fr: "Je n’avais jamais tenu un applicateur. Neuf leçons plus tard, j’ai posé mes trois premières clientes — le module sur la préparation de l’émail a tout changé.",
      en: "I had never held an applicator. Nine lessons later I had set gems on my first three clients — the enamel-prep module changed everything.",
    },
    refId: "fondation",
    refName: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
  },
  {
    id: "camille",
    kind: "product",
    author: "Camille R.",
    place: { fr: "Bordeaux, France", en: "Bordeaux, France" },
    rating: 5,
    quote: {
      fr: "Posée sur une cliente à l’émail sensible : collage net, aucun décollement après quatre mois. Le cœur en or attrape la lumière à chaque sourire.",
      en: "Applied on a client with sensitive enamel: a clean bond, no lifting after four months. The gold heart catches the light with every smile.",
    },
    refId: "aurora-heart",
    refName: { fr: "Aurora Heart", en: "Aurora Heart" },
  },
  {
    id: "marta",
    kind: "academy",
    author: "Marta K.",
    place: { fr: "Berlin, Allemagne", en: "Berlin, Germany" },
    rating: 5,
    quote: {
      fr: "Les leçons sur les compositions multi-gems m’ont donné une vraie signature. Mes clientes réservent maintenant pour un style, plus seulement pour une pierre.",
      en: "The multi-gem composition lessons gave me a real signature. Clients now book me for a style, not just for a stone.",
    },
    refId: "avance",
    refName: { fr: "Placement & façonnage avancés", en: "Advanced placement & shaping" },
  },
  {
    id: "lena",
    kind: "product",
    author: "Lena M.",
    place: { fr: "Munich, Allemagne", en: "Munich, Germany" },
    rating: 5,
    quote: {
      fr: "Tout le kit correspond à ce que la formation enseigne. Rien n’est laissé au hasard en cabine, et ça se sent dans la confiance de mes clientes.",
      en: "Everything in the kit matches what the course teaches. Nothing is left to chance in the chair, and my clients can feel the confidence.",
    },
    refId: "starter-kit",
    refName: { fr: "Kit Starter Pro", en: "Starter Pro Kit" },
  },
  {
    id: "sofia",
    kind: "product",
    author: "Sofia B.",
    place: { fr: "Dublin, Irlande", en: "Dublin, Ireland" },
    rating: 4,
    quote: {
      fr: "Deux jours pour Dublin. Les cristaux sont encore plus lumineux en vrai qu’à l’écran — je recommande le Solitaire pour une première gem.",
      en: "Two days to Dublin. The crystals are even more brilliant in person than on screen — I recommend the Solitaire for a first gem.",
    },
    refId: "solitaire",
    refName: { fr: "Solitaire Cristal", en: "Crystal Solitaire" },
  },
];
