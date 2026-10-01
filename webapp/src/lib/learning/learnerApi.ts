import type { Json } from "../supabase/database.types";
import type { TypedSupabaseClient } from "../supabase/client";
import type { CorrectionJson, LearnerCourseJson, ProgressJson, SubmissionJson } from "./learnerCourse";

/**
 * The learner's calls to the database (migration `…_academy_learner_access`).
 * Every one is a SECURITY DEFINER function that checks the entitlement and
 * the path rules itself; the browser only ever reads its own courses and
 * asks for progress to be recorded. Errors are thrown as they come (the
 * store decides what the member is told).
 */

const BUCKET = "training-media";
/** Long enough for a lesson video to be watched and sought through; re-signed before it ends. */
export const LEARNER_SIGNED_URL_SECONDS = 4 * 60 * 60;

/** The courses the member holds now, with content, media paths and progress. */
export async function fetchLearnerCourses(db: TypedSupabaseClient): Promise<LearnerCourseJson[]> {
  const { data, error } = await db.rpc("learner_courses");
  if (error) throw error;
  return (data ?? []) as unknown as LearnerCourseJson[];
}

export async function completeStep(db: TypedSupabaseClient, stepId: string): Promise<ProgressJson> {
  const { data, error } = await db.rpc("complete_course_step", { p_step_id: stepId });
  if (error) throw error;
  return data as unknown as ProgressJson;
}

export async function answerQuestion(
  db: TypedSupabaseClient,
  moduleId: string,
  questionId: string,
  answerId: string,
): Promise<CorrectionJson> {
  const { data, error } = await db.rpc("answer_quiz_question", {
    p_module_id: moduleId,
    p_question_id: questionId,
    p_answer_id: answerId,
  });
  if (error) throw error;
  return data as unknown as CorrectionJson;
}

export async function submitQuiz(
  db: TypedSupabaseClient,
  moduleId: string,
  answers: Record<string, string>,
): Promise<SubmissionJson> {
  const { data, error } = await db.rpc("submit_quiz_answers", { p_module_id: moduleId, p_answers: answers as Json });
  if (error) throw error;
  return data as unknown as SubmissionJson;
}

/** Signed URLs for the member's media (storage policy: files of the courses they hold). */
export async function signMedia(db: TypedSupabaseClient, paths: Map<string, string>): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const list = [...new Set(paths.values())];
  if (list.length === 0) return signed;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(list, LEARNER_SIGNED_URL_SECONDS);
  if (error) throw error;
  const byPath = new Map((data ?? []).filter((entry) => entry.signedUrl).map((entry) => [entry.path, entry.signedUrl]));
  for (const [id, path] of paths) {
    const url = byPath.get(path);
    if (url) signed.set(id, url);
  }
  return signed;
}
