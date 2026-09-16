import type { Localized } from "./types";

export interface Course {
  id: string;
  title: Localized;
  level: Localized;
  lessonCount: number;
  duration: string;
  price: number;
  image: string;
  copy: Localized;
  meta: Localized;
}

const img = (name: string) => new URL(`../assets/photos/${name}`, import.meta.url).href;

export const COURSES: Course[] = [
  {
    id: "fondation",
    title: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
    level: { fr: "Débutant", en: "Beginner" },
    lessonCount: 18,
    duration: "3 h 40",
    price: 349,
    image: img("img-12.jpg"),
    copy: {
      fr: "Préparation de l’émail, choix de la gem, pose, polissage et retrait sans dommage.",
      en: "Enamel prep, choosing the gem, application, polishing and damage-free removal.",
    },
    meta: { fr: "18 leçons · 3 h 40 · FR · EN · DE", en: "18 lessons · 3h40 · FR · EN · DE" },
  },
  {
    id: "avance",
    title: { fr: "Placement & façonnage avancés", en: "Advanced placement & shaping" },
    level: { fr: "Avancé", en: "Advanced" },
    lessonCount: 12,
    duration: "2 h 10",
    price: 279,
    image: img("mouth-02.jpg"),
    copy: {
      fr: "Compositions multi-gems, dents latérales, cas difficiles et corrections.",
      en: "Multi-gem compositions, lateral teeth, difficult cases and corrections.",
    },
    meta: { fr: "12 leçons · 2 h 10 · prérequis Fondation", en: "12 lessons · 2h10 · Foundation required" },
  },
  {
    id: "business",
    title: { fr: "Kit Business Studio", en: "Business Studio Kit" },
    level: { fr: "Tous niveaux", en: "All levels" },
    lessonCount: 9,
    duration: "1 h 25",
    price: 149,
    image: img("mouth-01.jpg"),
    copy: {
      fr: "Tarification, hygiène, consentement client, photo et prise de rendez-vous.",
      en: "Pricing, hygiene, client consent, photography and booking.",
    },
    meta: { fr: "9 leçons · 1 h 25 · modèles inclus", en: "9 lessons · 1h25 · templates included" },
  },
];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
