import type { Localized } from "./types";

interface Lesson {
  title: Localized;
  duration: string;
}

interface Module {
  title: Localized;
  /** Title without the "Module n ·" prefix, for layouts that number modules themselves. */
  short: Localized;
  /** One line describing what the module's lessons cover. */
  summary: Localized;
  lessons: Lesson[];
}

export const MODULES: Module[] = [
  {
    title: { fr: "Module 1 · Préparation", en: "Module 1 · Preparation" },
    short: { fr: "Préparation", en: "Preparation" },
    summary: {
      fr: "Anatomie de l’émail, hygiène du poste de travail, choix de la gem et de sa position.",
      en: "Enamel anatomy, workspace hygiene, choosing the gem and its position.",
    },
    lessons: [
      { title: { fr: "Anatomie de l’émail", en: "Enamel anatomy" }, duration: "08:40" },
      { title: { fr: "Hygiène et champ de travail", en: "Hygiene and workspace setup" }, duration: "11:05" },
      { title: { fr: "Choisir la gem et la position", en: "Choosing the gem and position" }, duration: "09:30" },
    ],
  },
  {
    title: { fr: "Module 2 · Application", en: "Module 2 · Application" },
    short: { fr: "Application", en: "Application" },
    summary: {
      fr: "Mordançage, pose de la gem, polymérisation en deux temps, contrôle et finition.",
      en: "Etching, applying the gem, two-stage curing, inspection and finishing.",
    },
    lessons: [
      { title: { fr: "Mordançage et rinçage", en: "Etching and rinsing" }, duration: "12:15" },
      { title: { fr: "Pose de la gem", en: "Applying the gem" }, duration: "14:02" },
      { title: { fr: "Polymérisation en deux temps", en: "Two-stage curing" }, duration: "10:48" },
      { title: { fr: "Contrôle et finition", en: "Inspection and finishing" }, duration: "07:20" },
    ],
  },
  {
    title: { fr: "Module 3 · Suivi", en: "Module 3 · Aftercare" },
    short: { fr: "Suivi", en: "Aftercare" },
    summary: {
      fr: "Les conseils à donner au client et le retrait de la gem sans abîmer l’émail.",
      en: "The advice to give the client, and removing the gem without damaging enamel.",
    },
    lessons: [
      { title: { fr: "Conseils au client", en: "Client advice" }, duration: "06:55" },
      { title: { fr: "Retrait sans dommage", en: "Damage-free removal" }, duration: "09:10" },
    ],
  },
];

export const QUIZ = {
  index: 1,
  total: 3,
  question: {
    fr: "Combien de temps faut-il mordancer l’émail avant le rinçage ?",
    en: "How long should the enamel be etched before rinsing?",
  },
  options: [
    { fr: "5 secondes", en: "5 seconds" },
    { fr: "15 secondes", en: "15 seconds" },
    { fr: "30 secondes", en: "30 seconds" },
    { fr: "60 secondes", en: "60 seconds" },
  ] as Localized[],
  correctIndex: 1,
  explanation: {
    fr: "15 secondes suffisent sur un émail sain : au-delà, la surface est inutilement dépolie sans améliorer le collage. Rincez 10 secondes, puis séchez jusqu’à obtenir un aspect mat uniforme.",
    en: "15 seconds is enough on healthy enamel: beyond that, the surface is needlessly roughened without improving the bond. Rinse for 10 seconds, then dry until the surface looks evenly matte.",
  },
};

/**
 * Pass mark of the prototype's courses (mock mode: `lib/academy/fixtures.ts`).
 * Real courses carry their own (`courses.min_score`, and each knowledge
 * check's `passing_score`), enforced server-side in phase C.
 */
export const PASS_SCORE = 80;

/** "12:15" -> 735. The authored durations are always mm:ss. */
export function parseDuration(d: string): number {
  const [m, s] = d.split(":").map(Number);
  return m * 60 + s;
}
