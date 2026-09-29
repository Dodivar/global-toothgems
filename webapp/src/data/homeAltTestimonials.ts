import type { Localized } from "./types";
import { photo } from "../lib/images";

/**
 * Testimonials shown on the alternative home page (/accueil-b), as a
 * Pinterest-style feed.
 *
 * DEMO CONTENT. The names, quotes, ratings and pictures are fictional,
 * written for the design comparison; they are not published reviews and are
 * not read from the review system. Each one says where it comes from — the
 * Academy or the shop — and points at the course or the product it is about.
 * The pictures are example photos from the site's own library, standing in
 * for the photos customers would attach to a review.
 */
export interface HomeTestimonialImage {
  src: string;
  alt: Localized;
  /** CSS aspect ratio of the crop: varied on purpose, it is what makes the feed a mosaic. */
  ratio: string;
  /** A product shot on white, shown whole on a tint rather than cropped. */
  cutout?: boolean;
}

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
  /** Omitted for text-only pins, which the feed sets on a tint instead. */
  image?: HomeTestimonialImage;
}

export const HOME_TESTIMONIALS: HomeTestimonial[] = [
  {
    id: "ines",
    kind: "academy",
    author: "Inès D.",
    place: { fr: "Lyon, France", en: "Lyon, France" },
    rating: 5,
    quote: {
      fr: "Je n’avais jamais tenu un applicateur. Neuf leçons plus tard, j’ai posé mes trois premières clientes — le module sur l’émail a tout changé.",
      en: "I had never held an applicator. Nine lessons later I had set gems on my first three clients — the enamel module changed everything.",
    },
    refId: "fondation",
    refName: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
    image: {
      src: photo("img-12.jpg"),
      alt: { fr: "Pose de petites gems rouges sur une rangée de dents", en: "Small red gems being set along a row of teeth" },
      ratio: "4 / 5",
    },
  },
  {
    id: "camille",
    kind: "product",
    author: "Camille R.",
    place: { fr: "Bordeaux, France", en: "Bordeaux, France" },
    rating: 5,
    quote: {
      fr: "Collage net, aucun décollement après quatre mois. Le cœur en or attrape la lumière à chaque sourire.",
      en: "A clean bond, no lifting after four months. The gold heart catches the light with every smile.",
    },
    refId: "aurora-heart",
    refName: { fr: "Aurora Heart", en: "Aurora Heart" },
    image: {
      src: photo("mouth-05.jpg"),
      alt: { fr: "Sourire orné de cœurs en cristal", en: "A smile set with crystal hearts" },
      ratio: "3 / 4",
    },
  },
  {
    id: "sofia",
    kind: "product",
    author: "Sofia B.",
    place: { fr: "Dublin, Irlande", en: "Dublin, Ireland" },
    rating: 4,
    quote: {
      fr: "Deux jours pour Dublin. Les cristaux sont encore plus lumineux en vrai qu’à l’écran.",
      en: "Two days to Dublin. The crystals are even more brilliant in person than on screen.",
    },
    refId: "solitaire",
    refName: { fr: "Solitaire Cristal", en: "Crystal Solitaire" },
  },
  {
    id: "marta",
    kind: "academy",
    author: "Marta K.",
    place: { fr: "Berlin, Allemagne", en: "Berlin, Germany" },
    rating: 5,
    quote: {
      fr: "Les compositions multi-gems m’ont donné une vraie signature. On me réserve pour un style, plus seulement pour une pierre.",
      en: "The multi-gem compositions gave me a real signature. Clients book me for a style, not just for a stone.",
    },
    refId: "avance",
    refName: { fr: "Placement & façonnage avancés", en: "Advanced placement & shaping" },
    image: {
      src: photo("mouth-03.jpg"),
      alt: { fr: "Composition de gems et de pièces en argent sur plusieurs dents", en: "A composition of gems and silver pieces across several teeth" },
      ratio: "1 / 1",
    },
  },
  {
    id: "lena",
    kind: "product",
    author: "Lena M.",
    place: { fr: "Munich, Allemagne", en: "Munich, Germany" },
    rating: 5,
    quote: {
      fr: "Tout le kit correspond à ce que la formation enseigne. Rien n’est laissé au hasard en cabine.",
      en: "Everything in the kit matches what the course teaches. Nothing is left to chance in the chair.",
    },
    refId: "starter-kit",
    refName: { fr: "Kit Starter Pro", en: "Starter Pro Kit" },
    image: {
      src: photo("img-11.jpg"),
      alt: { fr: "Cristal multicolore du kit", en: "A multicolour crystal from the kit" },
      ratio: "1 / 1",
      cutout: true,
    },
  },
  {
    id: "jade",
    kind: "academy",
    author: "Jade P.",
    place: { fr: "Bruxelles, Belgique", en: "Brussels, Belgium" },
    rating: 5,
    quote: {
      fr: "Les modèles de tarifs et de consentement m’ont fait gagner des semaines. J’ai ouvert mon agenda le mois suivant.",
      en: "The pricing and consent templates saved me weeks. I opened my bookings the following month.",
    },
    refId: "business",
    refName: { fr: "Kit Business Studio", en: "Business Studio Kit" },
    image: {
      src: photo("mouth-01.jpg"),
      alt: { fr: "Sourire orné de nombreuses gems colorées et d’un anneau à la lèvre", en: "A smile set with many coloured gems and a lip ring" },
      ratio: "4 / 5",
    },
  },
  {
    id: "clara",
    kind: "product",
    author: "Clara S.",
    place: { fr: "Nantes, France", en: "Nantes, France" },
    rating: 5,
    quote: {
      fr: "Ce reflet bleu-violet est hypnotique. Mes clientes me la demandent par son nom.",
      en: "That blue-violet flash is hypnotic. My clients ask for it by name.",
    },
    refId: "sapphire-ab",
    refName: { fr: "Sapphire AB SS9", en: "Sapphire AB SS9" },
    image: {
      src: photo("img-14.jpg"),
      alt: { fr: "Cristal Sapphire AB", en: "Sapphire AB crystal" },
      ratio: "4 / 3",
      cutout: true,
    },
  },
  {
    id: "amelie",
    kind: "academy",
    author: "Amélie V.",
    place: { fr: "Genève, Suisse", en: "Geneva, Switzerland" },
    rating: 5,
    quote: {
      fr: "J’ai repris chaque leçon à mon rythme, le soir. Le quiz final m’a rassurée avant ma première vraie pose.",
      en: "I went through every lesson at my own pace, in the evenings. The final quiz reassured me before my first real application.",
    },
    refId: "fondation",
    refName: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
    image: {
      src: photo("img-17.jpg"),
      alt: { fr: "Sourire avec de petites gems posées sur les dents du bas", en: "A smile with small gems set on the lower teeth" },
      ratio: "3 / 4",
    },
  },
  {
    id: "noah",
    kind: "product",
    author: "Noah L.",
    place: { fr: "Lille, France", en: "Lille, France" },
    rating: 5,
    quote: {
      fr: "Je remets une carte de suivi à chaque client : moins de questions après la séance, et des gems qui durent.",
      en: "Every client leaves with an aftercare card: fewer questions after the session, and gems that last.",
    },
    refId: "aftercare",
    refName: { fr: "Cartes de suivi (50)", en: "Aftercare cards (50)" },
  },
];
