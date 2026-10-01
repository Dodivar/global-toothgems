import { COURSES } from "../../data/courses";
import { MODULES, PASS_SCORE, parseDuration } from "../../data/lessons";
import { toMinorUnits } from "../catalog/money";
import type { CourseLevel, PublicCourse, PublicModule } from "./publicCourse";

/**
 * The public Academy in mock mode (no Supabase configured): the prototype's
 * three courses (`data/courses.ts`) and the syllabus their pages advertised
 * (`data/lessons.ts`), in the shape the database gives. Their enrolment is the
 * prototype's (`demo`): these are the courses the learner fixtures know.
 * Never used when Supabase is configured.
 */

/** The prototype courses' levels (also read by the learner fixtures, `lib/progress.tsx`). */
export const FIXTURE_LEVELS: Record<string, CourseLevel> = { fondation: "beginner", avance: "advanced", business: "all" };

const OUTLINE: PublicModule[] = MODULES.map((module, m) => ({
  id: `module-${m + 1}`,
  title: module.short,
  summary: module.summary,
  steps: module.lessons.map((lesson, s) => ({
    id: `module-${m + 1}-step-${s + 1}`,
    title: lesson.title,
    minutes: Math.round(parseDuration(lesson.duration) / 60),
  })),
  check: { title: { fr: "Contrôle des acquis", en: "Knowledge check" }, passingScore: PASS_SCORE },
}));

/** What the prototype's sales pages listed under "what you will be able to do". */
const OBJECTIVES = [
  { fr: "Lire l’anatomie de l’émail et ce qu’elle autorise.", en: "Read enamel anatomy and what it allows." },
  { fr: "Préparer un poste de travail propre et un champ conforme.", en: "Set up a clean workspace and a compliant field." },
  { fr: "Choisir la gem et sa position sur la dent.", en: "Choose the gem and its position on the tooth." },
  { fr: "Mordancer, rincer et sécher l’émail dans les bons temps.", en: "Etch, rinse and dry enamel with the right timings." },
  { fr: "Poser la gem et mener la polymérisation en deux temps.", en: "Apply the gem and run the two-stage cure." },
  { fr: "Contrôler la finition, puis conseiller le client.", en: "Inspect the finish, then advise the client." },
  { fr: "Retirer une gem sans abîmer l’émail.", en: "Remove a gem without damaging enamel." },
];

const MINUTES = OUTLINE.reduce((sum, module) => sum + module.steps.reduce((total, step) => total + step.minutes, 0), 0);

export const FIXTURE_COURSES: PublicCourse[] = COURSES.map((course) => {
  const price = { minor: toMinorUnits(course.price), currency: "EUR" };
  return {
    id: course.id,
    title: course.title,
    summary: course.copy,
    description: null,
    level: FIXTURE_LEVELS[course.id] ?? "all",
    minutes: MINUTES,
    objectives: OBJECTIVES,
    requirements: [],
    minScore: PASS_SCORE,
    issuesCertificate: true,
    price,
    currentPrice: price,
    promotionEndsAt: null,
    cover: { src: course.image, alt: null },
    modules: OUTLINE,
    enrolment: "demo",
  };
});
