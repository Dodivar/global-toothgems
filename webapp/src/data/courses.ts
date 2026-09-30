import type { Localized } from "./types";
import { photo } from "../lib/images";

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
  /**
   * The authored training this product gives access to — the course built in
   * the back office (`data/adminTrainingSeed.ts`). Buying the product is the
   * entitlement; the learner then reads that course exactly as it was built.
   */
  trainingId: string;
}

const img = photo;

/**
 * Lesson counts and durations mirror the single syllabus in `data/lessons.ts`
 * (9 lessons, ~1 h 30), which the Academy sales pages still advertise. The
 * learner experience itself no longer reads that syllabus: it reads the course
 * linked by `trainingId`, as authored in the back office, and derives its own
 * counts and progress from it (`lib/progress.tsx`).
 */
export const COURSES: Course[] = [
  {
    id: "fondation",
    title: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
    level: { fr: "Débutant", en: "Beginner" },
    lessonCount: 9,
    duration: "1 h 30",
    price: 349,
    image: img("img-12.jpg"),
    copy: {
      fr: "Préparation de l’émail, choix de la gem, pose, polissage et retrait sans dommage.",
      en: "Enamel prep, choosing the gem, application, polishing and damage-free removal.",
    },
    meta: { fr: "9 leçons · 1 h 30 · FR · EN · DE", en: "9 lessons · 1h30 · FR · EN · DE" },
    trainingId: "pose-professionnelle",
  },
  {
    id: "avance",
    title: { fr: "Placement & façonnage avancés", en: "Advanced placement & shaping" },
    level: { fr: "Avancé", en: "Advanced" },
    lessonCount: 9,
    duration: "1 h 30",
    price: 279,
    image: img("mouth-02.jpg"),
    copy: {
      fr: "Compositions multi-gems, dents latérales, cas difficiles et corrections.",
      en: "Multi-gem compositions, lateral teeth, difficult cases and corrections.",
    },
    meta: { fr: "9 leçons · 1 h 30 · prérequis Fondation", en: "9 lessons · 1h30 · Foundation required" },
    trainingId: "cristaux-charms",
  },
  {
    id: "business",
    title: { fr: "Kit Business Studio", en: "Business Studio Kit" },
    level: { fr: "Tous niveaux", en: "All levels" },
    lessonCount: 9,
    duration: "1 h 30",
    price: 149,
    image: img("mouth-01.jpg"),
    copy: {
      fr: "Tarification, hygiène, consentement client, photo et prise de rendez-vous.",
      en: "Pricing, hygiene, client consent, photography and booking.",
    },
    meta: { fr: "9 leçons · 1 h 30 · modèles inclus", en: "9 lessons · 1h30 · templates included" },
    trainingId: "hygiene-securite",
  },
];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
