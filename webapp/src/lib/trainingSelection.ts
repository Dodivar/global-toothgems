import type { TrainingCourse } from "../data/adminTraining";

/**
 * What the builder's centre panel is currently editing.
 *
 * The selection lives in the query string rather than in component state, for
 * the reason the orders and customers lists document: a colleague should be
 * able to paste "the step I mean", and the browser's Back button should walk
 * back through the tree rather than out of the builder.
 */

export type Selection =
  | { kind: "course" }
  | { kind: "module"; moduleId: string }
  | { kind: "step"; moduleId: string; stepId: string }
  | { kind: "quiz"; moduleId: string };

export function readSelection(params: URLSearchParams): Selection {
  const moduleId = params.get("module");
  const stepId = params.get("etape");
  const quiz = params.get("quiz") === "1";

  if (!moduleId) return { kind: "course" };
  if (quiz) return { kind: "quiz", moduleId };
  if (stepId) return { kind: "step", moduleId, stepId };
  return { kind: "module", moduleId };
}

export function writeSelection(selection: Selection): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.kind === "course") return params;
  params.set("module", selection.moduleId);
  if (selection.kind === "step") params.set("etape", selection.stepId);
  if (selection.kind === "quiz") params.set("quiz", "1");
  return params;
}

/**
 * Narrows a selection to something that still exists.
 *
 * A deleted step leaves a URL pointing at nothing. Falling back to its module,
 * then to the course, keeps the builder on the nearest surviving node instead
 * of showing an empty panel the administrator has to click their way out of.
 */
export function resolveSelection(course: TrainingCourse, selection: Selection): Selection {
  if (selection.kind === "course") return selection;

  const module = course.modules.find((m) => m.id === selection.moduleId);
  if (!module) return { kind: "course" };

  if (selection.kind === "quiz") {
    return module.quiz ? selection : { kind: "module", moduleId: module.id };
  }
  if (selection.kind === "step") {
    return module.steps.some((s) => s.id === selection.stepId)
      ? selection
      : { kind: "module", moduleId: module.id };
  }
  return selection;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "course" || b.kind === "course") return true;
  if (a.moduleId !== (b as { moduleId: string }).moduleId) return false;
  if (a.kind === "step" && b.kind === "step") return a.stepId === b.stepId;
  return true;
}
