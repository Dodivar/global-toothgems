import type { Localized } from "./types";

export interface Lesson {
  title: Localized;
  duration: string;
}

export interface Module {
  title: Localized;
  lessons: Lesson[];
}

export const MODULES: Module[] = [
  {
    title: { fr: "Module 1 · Préparation", en: "Module 1 · Preparation" },
    lessons: [
      { title: { fr: "Anatomie de l’émail", en: "Enamel anatomy" }, duration: "08:40" },
      { title: { fr: "Hygiène et champ de travail", en: "Hygiene and workspace setup" }, duration: "11:05" },
      { title: { fr: "Choisir la gem et la position", en: "Choosing the gem and position" }, duration: "09:30" },
    ],
  },
  {
    title: { fr: "Module 2 · Application", en: "Module 2 · Application" },
    lessons: [
      { title: { fr: "Mordançage et rinçage", en: "Etching and rinsing" }, duration: "12:15" },
      { title: { fr: "Pose de la gem", en: "Applying the gem" }, duration: "14:02" },
      { title: { fr: "Polymérisation en deux temps", en: "Two-stage curing" }, duration: "10:48" },
      { title: { fr: "Contrôle et finition", en: "Inspection and finishing" }, duration: "07:20" },
    ],
  },
  {
    title: { fr: "Module 3 · Suivi", en: "Module 3 · Aftercare" },
    lessons: [
      { title: { fr: "Conseils au client", en: "Client advice" }, duration: "06:55" },
      { title: { fr: "Retrait sans dommage", en: "Damage-free removal" }, duration: "09:10" },
    ],
  },
];

export const FLAT: Lesson[] = MODULES.flatMap((m) => m.lessons);

export function moduleIndexForFlatIndex(flatIndex: number): number {
  let count = 0;
  for (let m = 0; m < MODULES.length; m++) {
    count += MODULES[m].lessons.length;
    if (flatIndex < count) return m;
  }
  return MODULES.length - 1;
}

export const LESSON_POINTS: Record<number, Localized[]> = {
  4: [
    { fr: "Positionner la gem sur le grand axe de la dent.", en: "Position the gem on the tooth's major axis." },
    {
      fr: "Quelle quantité d’adhésif suffit — et à quoi ressemble un excès.",
      en: "How much adhesive is enough — and what excess looks like.",
    },
    {
      fr: "Polymérisation en deux temps, avec les temps pour la lampe 1200 mW.",
      en: "Two-stage curing, with timings for the 1200mW lamp.",
    },
  ],
};

export const LESSON_POINTS_FALLBACK: Localized[] = [
  {
    fr: "Les points clés de cette leçon sont détaillés dans les notes téléchargeables.",
    en: "The key points of this lesson are detailed in the downloadable notes.",
  },
  {
    fr: "Chaque geste est filmé en plan serré, puis répété au ralenti.",
    en: "Every motion is filmed in close-up, then repeated in slow motion.",
  },
  {
    fr: "Le quiz de fin de module reprend les trois erreurs les plus fréquentes.",
    en: "The end-of-module quiz covers the three most common mistakes.",
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

export const DEFAULT_LESSON_STATE = { activeIdx: 4, doneCount: 4 };

/** "12:15" -> 735. The authored durations are always mm:ss. */
export function parseDuration(d: string): number {
  const [m, s] = d.split(":").map(Number);
  return m * 60 + s;
}

/** Video seconds still ahead of a learner who has validated `doneCount` lessons. */
export function remainingSeconds(doneCount: number): number {
  return FLAT.reduce((sum, l, i) => (i >= doneCount ? sum + parseDuration(l.duration) : sum), 0);
}

/**
 * Flat index of the first lesson of each module, so a caller holding a single
 * `doneCount` can map course progress back onto the module breakdown.
 */
export const MODULE_OFFSETS: number[] = MODULES.map((_, i) =>
  MODULES.slice(0, i).reduce((sum, m) => sum + m.lessons.length, 0),
);
