import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_QUIZ_SETTINGS,
  type Answer,
  type ContentBlock,
  type BlockType,
  type CourseStatus,
  type Module,
  type Question,
  type Quiz,
  type Step,
  type TrainingCourse,
} from "../data/adminTraining";
import type { Localized } from "../data/types";
import { useAdminAuth } from "./adminAuth";
import { mockTrainingBackend, supabaseTrainingBackend, TrainingError, type TrainingBackend } from "./adminTrainingBackend";
import { courseSlug } from "./adminTrainingMapping";
import type { CoursePromotion } from "./coursePricing";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";

/**
 * The course builder's store: the authored course catalogue.
 *
 * Read by the back office and, until the learner side is wired (phase C), by
 * the prototype learner pages in mock mode (`lib/progress.tsx`).
 *
 * Structural edits — adding a step, reordering a module, marking an answer
 * correct — are synchronous and stay in memory: a builder where every click
 * waits on the network is a builder nobody wants to use. Saving sends the
 * whole course at once (`admin_save_course()`), and that is what the
 * unsaved/saved indicator tracks. Persistence goes through a backend
 * (`lib/adminTrainingBackend.ts`): Supabase when configured, the prototype's
 * fixtures otherwise. With Supabase, nothing is read until a staff session is
 * open — this provider sits under the root layout, above public pages too.
 *
 * Writes reject with a `TrainingError`; the screens turn it into a message
 * (the toasts live below this provider).
 */

/* -------------------------------------------------------------------------- */
/* Identity and array helpers                                                  */
/* -------------------------------------------------------------------------- */

/** Node ids are created here, so a new node keeps its id once stored (uuid columns). */
const newId = () => crypto.randomUUID();

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function insertAfter<T>(list: T[], index: number, item: T): T[] {
  const next = list.slice();
  next.splice(index + 1, 0, item);
  return next;
}

const empty = (): Localized => ({ fr: "", en: "" });

/** Marks a duplicate in both languages, so the copy is obvious in either. */
function copyLabel(value: Localized): Localized {
  return { fr: `${value.fr} (copie)`, en: `${value.en} (copy)` };
}

/* -------------------------------------------------------------------------- */
/* Deep copies with fresh identity                                             */
/* -------------------------------------------------------------------------- */

function cloneBlock(block: ContentBlock): ContentBlock {
  return { ...block, id: newId() };
}

function cloneStep(step: Step, rename = true): Step {
  return {
    ...step,
    id: newId(),
    title: rename ? copyLabel(step.title) : step.title,
    blocks: step.blocks.map(cloneBlock),
  };
}

function cloneQuestion(question: Question, rename = false): Question {
  const id = newId();
  return {
    ...question,
    id,
    text: rename ? copyLabel(question.text) : question.text,
    answers: question.answers.map((a) => ({ ...a, id: newId() })),
  };
}

function cloneQuiz(quiz: Quiz): Quiz {
  return {
    ...quiz,
    id: newId(),
    settings: { ...quiz.settings },
    questions: quiz.questions.map((q) => cloneQuestion(q)),
  };
}

function cloneModule(module: Module, rename = true): Module {
  return {
    ...module,
    id: newId(),
    title: rename ? copyLabel(module.title) : module.title,
    objectives: module.objectives.map((o) => ({ ...o })),
    steps: module.steps.map((s) => cloneStep(s, false)),
    quiz: module.quiz ? cloneQuiz(module.quiz) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Factories                                                                   */
/* -------------------------------------------------------------------------- */

export function blankCourse(): TrainingCourse {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: empty(),
    shortDescription: empty(),
    fullDescription: empty(),
    cover: "",
    category: "technique",
    level: "beginner",
    duration: 0,
    objectives: [],
    requirements: [],
    completion: { allSteps: true, allQuizzes: true, minScore: 70, certificate: true },
    priceMinor: 0,
    currency: "EUR",
    slug: "",
    status: "draft",
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    completionRate: 0,
    enrolled: 0,
    modules: [],
  };
}

function newModule(index: number): Module {
  return {
    id: newId(),
    title: { fr: `Nouveau module ${index}`, en: `New module ${index}` },
    description: empty(),
    cover: "",
    objectives: [],
    steps: [],
    quiz: null,
  };
}

function newStep(index: number): Step {
  return {
    id: newId(),
    title: { fr: `Nouvelle étape ${index}`, en: `New step ${index}` },
    summary: empty(),
    duration: 5,
    blocks: [],
  };
}

/**
 * A new block arrives with placeholder text; image and video blocks arrive
 * without a file, shown as an empty slot to fill from the media library (the
 * publication check reports any left empty).
 */
export function newBlock(type: BlockType): ContentBlock {
  const id = newId();
  if (type === "text") {
    return {
      id,
      type: "text",
      html: {
        fr: "<p>Écrivez votre contenu ici.</p>",
        en: "<p>Write your content here.</p>",
      },
    };
  }
  if (type === "image") {
    return {
      id,
      type: "image",
      src: "",
      alt: empty(),
      caption: empty(),
      align: "full",
    };
  }
  return {
    id,
    type: "video",
    poster: "",
    title: { fr: "Nouvelle vidéo", en: "New video" },
    duration: "00:00",
    source: "",
    caption: empty(),
  };
}

function newQuestion(index: number): Question {
  const id = newId();
  return {
    id,
    text: {
      fr: `Question ${String(index).padStart(2, "0")}`,
      en: `Question ${String(index).padStart(2, "0")}`,
    },
    answers: [
      { id: `${id}-a1`, text: { fr: "Réponse correcte", en: "Correct answer" }, correct: true },
      { id: `${id}-a2`, text: { fr: "Réponse incorrecte", en: "Incorrect answer" }, correct: false },
      { id: `${id}-a3`, text: { fr: "Réponse incorrecte", en: "Incorrect answer" }, correct: false },
    ],
    correctFeedback: { fr: "Exact !", en: "Correct!" },
    incorrectFeedback: { fr: "Pas tout à fait.", en: "Not quite." },
  };
}

function newQuiz(): Quiz {
  return {
    id: newId(),
    title: { fr: "Point de connaissances", en: "Knowledge check" },
    intro: {
      fr: "Quelques questions pour valider ce module.",
      en: "A few questions to confirm this module.",
    },
    questions: [],
    settings: { ...DEFAULT_QUIZ_SETTINGS },
  };
}

export function newAnswer(): Answer {
  return {
    id: newId(),
    text: { fr: "Nouvelle réponse", en: "New answer" },
    correct: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

export type MoveDirection = "up" | "down";

interface AdminTrainingValue {
  /** Where courses are kept: the prototype fixtures or the Supabase database. */
  source: "mock" | "supabase";
  courses: TrainingCourse[];
  loading: boolean;
  /** Set when the last load failed. */
  loadError: TrainingError | null;
  reload: () => void;
  /** True once anything has been edited and not yet saved. */
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;

  getCourse: (id: string) => TrainingCourse | undefined;
  createCourse: (course: TrainingCourse) => Promise<TrainingCourse>;
  updateCourse: (id: string, patch: Partial<TrainingCourse>) => void;
  /** Saves a draft copy (new ids, status draft) and resolves with it. */
  duplicateCourse: (id: string) => Promise<TrainingCourse | undefined>;
  /** Refused (`TrainingError("published")`) for a course that was ever published. */
  deleteCourse: (id: string) => Promise<void>;
  /** Saves the course first, so the database checks what the builder shows. */
  setCourseStatus: (id: string, status: CourseStatus) => Promise<void>;
  saveDraft: (id: string) => Promise<void>;

  promotionsFor: (courseId: string) => CoursePromotion[];
  savePromotion: (promotion: CoursePromotion) => Promise<CoursePromotion>;
  deletePromotion: (id: string) => Promise<void>;

  addModule: (courseId: string) => string | undefined;
  updateModule: (courseId: string, moduleId: string, patch: Partial<Module>) => void;
  duplicateModule: (courseId: string, moduleId: string) => string | undefined;
  deleteModule: (courseId: string, moduleId: string) => void;
  moveModule: (courseId: string, moduleId: string, to: number | MoveDirection) => void;

  addStep: (courseId: string, moduleId: string) => string | undefined;
  updateStep: (courseId: string, moduleId: string, stepId: string, patch: Partial<Step>) => void;
  duplicateStep: (courseId: string, moduleId: string, stepId: string) => string | undefined;
  deleteStep: (courseId: string, moduleId: string, stepId: string) => void;
  moveStep: (courseId: string, moduleId: string, stepId: string, to: number | MoveDirection) => void;

  addBlock: (courseId: string, moduleId: string, stepId: string, type: BlockType, afterId?: string) => string | undefined;
  updateBlock: (courseId: string, moduleId: string, stepId: string, blockId: string, patch: Partial<ContentBlock>) => void;
  duplicateBlock: (courseId: string, moduleId: string, stepId: string, blockId: string) => void;
  deleteBlock: (courseId: string, moduleId: string, stepId: string, blockId: string) => void;
  moveBlock: (courseId: string, moduleId: string, stepId: string, blockId: string, to: number | MoveDirection) => void;

  addQuiz: (courseId: string, moduleId: string) => void;
  updateQuiz: (courseId: string, moduleId: string, patch: Partial<Quiz>) => void;
  deleteQuiz: (courseId: string, moduleId: string) => void;

  addQuestion: (courseId: string, moduleId: string) => string | undefined;
  updateQuestion: (courseId: string, moduleId: string, questionId: string, patch: Partial<Question>) => void;
  duplicateQuestion: (courseId: string, moduleId: string, questionId: string) => void;
  deleteQuestion: (courseId: string, moduleId: string, questionId: string) => void;
  moveQuestion: (courseId: string, moduleId: string, questionId: string, to: number | MoveDirection) => void;

  addAnswer: (courseId: string, moduleId: string, questionId: string) => void;
  updateAnswer: (courseId: string, moduleId: string, questionId: string, answerId: string, patch: Partial<Answer>) => void;
  deleteAnswer: (courseId: string, moduleId: string, questionId: string, answerId: string) => void;
  /** Exactly one answer per question is correct, so this replaces rather than toggles. */
  setCorrectAnswer: (courseId: string, moduleId: string, questionId: string, answerId: string) => void;
}

const AdminTrainingContext = createContext<AdminTrainingValue | null>(null);

/** Resolves a direction against a current index; a number passes through. */
function target(to: number | MoveDirection, index: number): number {
  if (to === "up") return index - 1;
  if (to === "down") return index + 1;
  return to;
}

export function AdminTrainingProvider({ children }: { children: ReactNode }) {
  const backend = useMemo<TrainingBackend>(
    () => (isSupabaseConfigured ? supabaseTrainingBackend(requireSupabase) : mockTrainingBackend),
    [],
  );
  const { admin, restoring } = useAdminAuth();
  // The database is read only for a staff session (RLS would return nothing else anyway).
  const enabled = backend.source === "mock" || (!restoring && admin !== null);

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [promotions, setPromotions] = useState<CoursePromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<TrainingError | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Writes read the latest courses without being rebuilt on every keystroke.
  const coursesRef = useRef(courses);
  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    backend
      .load()
      .then((result) => {
        if (cancelled) return;
        setCourses(result.courses);
        setPromotions(result.promotions);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof TrainingError ? error : new TrainingError("network"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, enabled, loadCount]);

  const reload = useCallback(() => setLoadCount((n) => n + 1), []);

  /** Runs one write with the busy flag, whatever its outcome. */
  const persist = useCallback(async <T,>(write: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try {
      return await write();
    } finally {
      setSaving(false);
    }
  }, []);

  /** Puts a stored course back into the list (the database's slug and dates win). */
  const storeCourse = useCallback((saved: TrainingCourse) => {
    setCourses((prev) =>
      prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev],
    );
    setDirty(false);
    setLastSavedAt(new Date().toISOString());
  }, []);

  /**
   * Every structural edit goes through here: it rewrites one course, stamps
   * `updatedAt` and raises the unsaved flag. Nothing else is allowed to call
   * `setCourses`, which is what keeps the indicator honest.
   */
  const edit = useCallback((courseId: string, recipe: (course: TrainingCourse) => TrainingCourse) => {
    setCourses((prev) =>
      prev.map((course) =>
        course.id === courseId ? { ...recipe(course), updatedAt: new Date().toISOString() } : course,
      ),
    );
    setDirty(true);
  }, []);

  const editModule = useCallback(
    (courseId: string, moduleId: string, recipe: (module: Module) => Module) => {
      edit(courseId, (course) => ({
        ...course,
        modules: course.modules.map((m) => (m.id === moduleId ? recipe(m) : m)),
      }));
    },
    [edit],
  );

  const editStep = useCallback(
    (courseId: string, moduleId: string, stepId: string, recipe: (step: Step) => Step) => {
      editModule(courseId, moduleId, (module) => ({
        ...module,
        steps: module.steps.map((s) => (s.id === stepId ? recipe(s) : s)),
      }));
    },
    [editModule],
  );

  const editQuiz = useCallback(
    (courseId: string, moduleId: string, recipe: (quiz: Quiz) => Quiz) => {
      editModule(courseId, moduleId, (module) => (module.quiz ? { ...module, quiz: recipe(module.quiz) } : module));
    },
    [editModule],
  );

  const editQuestion = useCallback(
    (courseId: string, moduleId: string, questionId: string, recipe: (question: Question) => Question) => {
      editQuiz(courseId, moduleId, (quiz) => ({
        ...quiz,
        questions: quiz.questions.map((q) => (q.id === questionId ? recipe(q) : q)),
      }));
    },
    [editQuiz],
  );

  /* ----------------------------------------------------------------------- */
  /* Courses                                                                  */
  /* ----------------------------------------------------------------------- */

  const getCourse = useCallback((id: string) => courses.find((c) => c.id === id), [courses]);

  const createCourse = useCallback(
    async (course: TrainingCourse) => {
      const saved = await persist(() => backend.saveCourse({ ...course, slug: course.slug || courseSlug(course.title.fr) }));
      storeCourse(saved);
      return saved;
    },
    [backend, persist, storeCourse],
  );

  const updateCourse = useCallback(
    (id: string, patch: Partial<TrainingCourse>) => edit(id, (course) => ({ ...course, ...patch })),
    [edit],
  );

  const duplicateCourse = useCallback(
    async (id: string) => {
      const source = coursesRef.current.find((c) => c.id === id);
      if (!source) return undefined;
      const now = new Date().toISOString();
      const title = copyLabel(source.title);
      const copy: TrainingCourse = {
        ...source,
        id: newId(),
        title,
        slug: courseSlug(title.fr),
        // A copy always starts as a draft, whatever the original was: nothing
        // should reach learners because someone duplicated a published course.
        status: "draft",
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        completionRate: 0,
        enrolled: 0,
        modules: source.modules.map((m) => cloneModule(m, false)),
      };
      const saved = await persist(() => backend.saveCourse(copy));
      storeCourse(saved);
      return saved;
    },
    [backend, persist, storeCourse],
  );

  const deleteCourse = useCallback(
    async (id: string) => {
      const course = coursesRef.current.find((c) => c.id === id);
      if (!course) return;
      await persist(() => backend.deleteCourse(course));
      setCourses((prev) => prev.filter((c) => c.id !== id));
      setPromotions((prev) => prev.filter((p) => p.courseId !== id));
    },
    [backend, persist],
  );

  const saveDraft = useCallback(
    async (id: string) => {
      const course = coursesRef.current.find((c) => c.id === id);
      if (!course) return;
      storeCourse(await persist(() => backend.saveCourse(course)));
    },
    [backend, persist, storeCourse],
  );

  const setCourseStatus = useCallback(
    async (id: string, status: CourseStatus) => {
      const course = coursesRef.current.find((c) => c.id === id);
      if (!course) return;
      await persist(async () => {
        const saved = await backend.saveCourse(course);
        const next = await backend.setStatus(saved, status);
        storeCourse({ ...saved, ...next });
      });
    },
    [backend, persist, storeCourse],
  );

  const promotionsFor = useCallback(
    (courseId: string) => promotions.filter((p) => p.courseId === courseId),
    [promotions],
  );

  const savePromotion = useCallback(
    async (promotion: CoursePromotion) => {
      const saved = await persist(() => backend.savePromotion(promotion));
      setPromotions((prev) =>
        prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved],
      );
      return saved;
    },
    [backend, persist],
  );

  const deletePromotion = useCallback(
    async (id: string) => {
      await persist(() => backend.deletePromotion(id));
      setPromotions((prev) => prev.filter((p) => p.id !== id));
    },
    [backend, persist],
  );

  /* ----------------------------------------------------------------------- */
  /* Modules                                                                  */
  /* ----------------------------------------------------------------------- */

  const addModule = useCallback(
    (courseId: string) => {
      const course = courses.find((c) => c.id === courseId);
      if (!course) return undefined;
      const module = newModule(course.modules.length + 1);
      edit(courseId, (c) => ({ ...c, modules: [...c.modules, module] }));
      return module.id;
    },
    [courses, edit],
  );

  const updateModule = useCallback(
    (courseId: string, moduleId: string, patch: Partial<Module>) =>
      editModule(courseId, moduleId, (module) => ({ ...module, ...patch })),
    [editModule],
  );

  const duplicateModule = useCallback(
    (courseId: string, moduleId: string) => {
      const course = courses.find((c) => c.id === courseId);
      const index = course?.modules.findIndex((m) => m.id === moduleId) ?? -1;
      if (!course || index < 0) return undefined;
      const copy = cloneModule(course.modules[index]);
      edit(courseId, (c) => ({ ...c, modules: insertAfter(c.modules, index, copy) }));
      return copy.id;
    },
    [courses, edit],
  );

  const deleteModule = useCallback(
    (courseId: string, moduleId: string) =>
      edit(courseId, (course) => ({ ...course, modules: course.modules.filter((m) => m.id !== moduleId) })),
    [edit],
  );

  const moveModule = useCallback(
    (courseId: string, moduleId: string, to: number | MoveDirection) =>
      edit(courseId, (course) => {
        const index = course.modules.findIndex((m) => m.id === moduleId);
        if (index < 0) return course;
        return { ...course, modules: move(course.modules, index, target(to, index)) };
      }),
    [edit],
  );

  /* ----------------------------------------------------------------------- */
  /* Steps                                                                    */
  /* ----------------------------------------------------------------------- */

  const addStep = useCallback(
    (courseId: string, moduleId: string) => {
      const module = courses.find((c) => c.id === courseId)?.modules.find((m) => m.id === moduleId);
      if (!module) return undefined;
      const step = newStep(module.steps.length + 1);
      editModule(courseId, moduleId, (m) => ({ ...m, steps: [...m.steps, step] }));
      return step.id;
    },
    [courses, editModule],
  );

  const updateStep = useCallback(
    (courseId: string, moduleId: string, stepId: string, patch: Partial<Step>) =>
      editStep(courseId, moduleId, stepId, (step) => ({ ...step, ...patch })),
    [editStep],
  );

  const duplicateStep = useCallback(
    (courseId: string, moduleId: string, stepId: string) => {
      const module = courses.find((c) => c.id === courseId)?.modules.find((m) => m.id === moduleId);
      const index = module?.steps.findIndex((s) => s.id === stepId) ?? -1;
      if (!module || index < 0) return undefined;
      const copy = cloneStep(module.steps[index]);
      editModule(courseId, moduleId, (m) => ({ ...m, steps: insertAfter(m.steps, index, copy) }));
      return copy.id;
    },
    [courses, editModule],
  );

  const deleteStep = useCallback(
    (courseId: string, moduleId: string, stepId: string) =>
      editModule(courseId, moduleId, (module) => ({ ...module, steps: module.steps.filter((s) => s.id !== stepId) })),
    [editModule],
  );

  const moveStep = useCallback(
    (courseId: string, moduleId: string, stepId: string, to: number | MoveDirection) =>
      editModule(courseId, moduleId, (module) => {
        const index = module.steps.findIndex((s) => s.id === stepId);
        if (index < 0) return module;
        return { ...module, steps: move(module.steps, index, target(to, index)) };
      }),
    [editModule],
  );

  /* ----------------------------------------------------------------------- */
  /* Content blocks                                                           */
  /* ----------------------------------------------------------------------- */

  const addBlock = useCallback(
    (courseId: string, moduleId: string, stepId: string, type: BlockType, afterId?: string) => {
      const block = newBlock(type);
      editStep(courseId, moduleId, stepId, (step) => {
        // `afterId` is what makes the inline "+" between two blocks land where
        // the administrator clicked rather than at the end of the step.
        const index = afterId ? step.blocks.findIndex((b) => b.id === afterId) : step.blocks.length - 1;
        return { ...step, blocks: insertAfter(step.blocks, index, block) };
      });
      return block.id;
    },
    [editStep],
  );

  const updateBlock = useCallback(
    (courseId: string, moduleId: string, stepId: string, blockId: string, patch: Partial<ContentBlock>) =>
      editStep(courseId, moduleId, stepId, (step) => ({
        ...step,
        blocks: step.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as ContentBlock) : b)),
      })),
    [editStep],
  );

  const duplicateBlock = useCallback(
    (courseId: string, moduleId: string, stepId: string, blockId: string) =>
      editStep(courseId, moduleId, stepId, (step) => {
        const index = step.blocks.findIndex((b) => b.id === blockId);
        if (index < 0) return step;
        return { ...step, blocks: insertAfter(step.blocks, index, cloneBlock(step.blocks[index])) };
      }),
    [editStep],
  );

  const deleteBlock = useCallback(
    (courseId: string, moduleId: string, stepId: string, blockId: string) =>
      editStep(courseId, moduleId, stepId, (step) => ({
        ...step,
        blocks: step.blocks.filter((b) => b.id !== blockId),
      })),
    [editStep],
  );

  const moveBlock = useCallback(
    (courseId: string, moduleId: string, stepId: string, blockId: string, to: number | MoveDirection) =>
      editStep(courseId, moduleId, stepId, (step) => {
        const index = step.blocks.findIndex((b) => b.id === blockId);
        if (index < 0) return step;
        return { ...step, blocks: move(step.blocks, index, target(to, index)) };
      }),
    [editStep],
  );

  /* ----------------------------------------------------------------------- */
  /* Quiz                                                                     */
  /* ----------------------------------------------------------------------- */

  const addQuiz = useCallback(
    (courseId: string, moduleId: string) =>
      editModule(courseId, moduleId, (module) => (module.quiz ? module : { ...module, quiz: newQuiz() })),
    [editModule],
  );

  const updateQuiz = useCallback(
    (courseId: string, moduleId: string, patch: Partial<Quiz>) =>
      editQuiz(courseId, moduleId, (quiz) => ({ ...quiz, ...patch })),
    [editQuiz],
  );

  const deleteQuiz = useCallback(
    (courseId: string, moduleId: string) => editModule(courseId, moduleId, (module) => ({ ...module, quiz: null })),
    [editModule],
  );

  const addQuestion = useCallback(
    (courseId: string, moduleId: string) => {
      const module = courses.find((c) => c.id === courseId)?.modules.find((m) => m.id === moduleId);
      if (!module?.quiz) return undefined;
      const question = newQuestion(module.quiz.questions.length + 1);
      editQuiz(courseId, moduleId, (quiz) => ({ ...quiz, questions: [...quiz.questions, question] }));
      return question.id;
    },
    [courses, editQuiz],
  );

  const updateQuestion = useCallback(
    (courseId: string, moduleId: string, questionId: string, patch: Partial<Question>) =>
      editQuestion(courseId, moduleId, questionId, (question) => ({ ...question, ...patch })),
    [editQuestion],
  );

  const duplicateQuestion = useCallback(
    (courseId: string, moduleId: string, questionId: string) =>
      editQuiz(courseId, moduleId, (quiz) => {
        const index = quiz.questions.findIndex((q) => q.id === questionId);
        if (index < 0) return quiz;
        return { ...quiz, questions: insertAfter(quiz.questions, index, cloneQuestion(quiz.questions[index], true)) };
      }),
    [editQuiz],
  );

  const deleteQuestion = useCallback(
    (courseId: string, moduleId: string, questionId: string) =>
      editQuiz(courseId, moduleId, (quiz) => ({
        ...quiz,
        questions: quiz.questions.filter((q) => q.id !== questionId),
      })),
    [editQuiz],
  );

  const moveQuestion = useCallback(
    (courseId: string, moduleId: string, questionId: string, to: number | MoveDirection) =>
      editQuiz(courseId, moduleId, (quiz) => {
        const index = quiz.questions.findIndex((q) => q.id === questionId);
        if (index < 0) return quiz;
        return { ...quiz, questions: move(quiz.questions, index, target(to, index)) };
      }),
    [editQuiz],
  );

  const addAnswer = useCallback(
    (courseId: string, moduleId: string, questionId: string) =>
      editQuestion(courseId, moduleId, questionId, (question) => ({
        ...question,
        answers: [...question.answers, newAnswer()],
      })),
    [editQuestion],
  );

  const updateAnswer = useCallback(
    (courseId: string, moduleId: string, questionId: string, answerId: string, patch: Partial<Answer>) =>
      editQuestion(courseId, moduleId, questionId, (question) => ({
        ...question,
        answers: question.answers.map((a) => (a.id === answerId ? { ...a, ...patch } : a)),
      })),
    [editQuestion],
  );

  const deleteAnswer = useCallback(
    (courseId: string, moduleId: string, questionId: string, answerId: string) =>
      editQuestion(courseId, moduleId, questionId, (question) => {
        const remaining = question.answers.filter((a) => a.id !== answerId);
        // A question with no correct answer is unanswerable, so removing the
        // correct one promotes the first survivor rather than leaving a quiz
        // that can never be passed.
        if (remaining.length > 0 && !remaining.some((a) => a.correct)) {
          remaining[0] = { ...remaining[0], correct: true };
        }
        return { ...question, answers: remaining };
      }),
    [editQuestion],
  );

  const setCorrectAnswer = useCallback(
    (courseId: string, moduleId: string, questionId: string, answerId: string) =>
      editQuestion(courseId, moduleId, questionId, (question) => ({
        ...question,
        answers: question.answers.map((a) => ({ ...a, correct: a.id === answerId })),
      })),
    [editQuestion],
  );

  const value = useMemo<AdminTrainingValue>(
    () => ({
      source: backend.source,
      courses,
      loading,
      loadError,
      reload,
      dirty,
      saving,
      lastSavedAt,
      getCourse,
      createCourse,
      updateCourse,
      duplicateCourse,
      deleteCourse,
      setCourseStatus,
      saveDraft,
      addModule,
      updateModule,
      duplicateModule,
      deleteModule,
      moveModule,
      addStep,
      updateStep,
      duplicateStep,
      deleteStep,
      moveStep,
      addBlock,
      updateBlock,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      addQuiz,
      updateQuiz,
      deleteQuiz,
      addQuestion,
      updateQuestion,
      duplicateQuestion,
      deleteQuestion,
      moveQuestion,
      addAnswer,
      updateAnswer,
      deleteAnswer,
      setCorrectAnswer,
      promotionsFor,
      savePromotion,
      deletePromotion,
    }),
    [
      backend.source,
      courses,
      loading,
      loadError,
      reload,
      dirty,
      saving,
      lastSavedAt,
      getCourse,
      createCourse,
      updateCourse,
      duplicateCourse,
      deleteCourse,
      setCourseStatus,
      saveDraft,
      addModule,
      updateModule,
      duplicateModule,
      deleteModule,
      moveModule,
      addStep,
      updateStep,
      duplicateStep,
      deleteStep,
      moveStep,
      addBlock,
      updateBlock,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      addQuiz,
      updateQuiz,
      deleteQuiz,
      addQuestion,
      updateQuestion,
      duplicateQuestion,
      deleteQuestion,
      moveQuestion,
      addAnswer,
      updateAnswer,
      deleteAnswer,
      setCorrectAnswer,
      promotionsFor,
      savePromotion,
      deletePromotion,
    ],
  );

  return <AdminTrainingContext.Provider value={value}>{children}</AdminTrainingContext.Provider>;
}

export function useAdminTraining() {
  const ctx = useContext(AdminTrainingContext);
  if (!ctx) throw new Error("useAdminTraining must be used within AdminTrainingProvider");
  return ctx;
}
