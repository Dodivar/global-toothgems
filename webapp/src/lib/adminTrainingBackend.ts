import type { CourseStatus, TrainingCourse } from "../data/adminTraining";
import { TRAINING_COURSES } from "../data/adminTrainingSeed";
import type { TypedSupabaseClient } from "./supabase/client";
import type { CoursePromotion } from "./coursePricing";
import {
  ADMIN_COURSE_SELECT,
  courseToPayload,
  notReadyCodes,
  promotionToRow,
  rowToCourse,
  rowToPromotion,
  trainingErrorKind,
  type CoursePromotionRow,
  type CourseRow,
  type TrainingErrorKind,
} from "./adminTrainingMapping";
import type { Json } from "./supabase/database.types";

/**
 * Where the course builder's work is kept.
 *
 * The builder edits a course in memory (`lib/adminTraining.tsx`) and only
 * these calls leave the browser: load, save a whole course, change its status,
 * delete it, and manage its promotions. Two implementations: the prototype's
 * fixtures (no Supabase configured) and the database (`admin_save_course()`,
 * RLS on the Academy tables — the authority for every rule).
 */

export class TrainingError extends Error {
  readonly kind: TrainingErrorKind;
  /** Readiness codes when the database refused a publication. */
  readonly codes: string[];

  constructor(kind: TrainingErrorKind, codes: string[] = []) {
    super(kind);
    this.kind = kind;
    this.codes = codes;
  }
}

export interface TrainingBackend {
  source: "mock" | "supabase";
  load: () => Promise<{ courses: TrainingCourse[]; promotions: CoursePromotion[] }>;
  /** Creates or updates; resolves with the stored course (slug and dates from the database). */
  saveCourse: (course: TrainingCourse) => Promise<TrainingCourse>;
  setStatus: (course: TrainingCourse, status: CourseStatus) => Promise<Pick<TrainingCourse, "status" | "publishedAt" | "updatedAt">>;
  deleteCourse: (course: TrainingCourse) => Promise<void>;
  savePromotion: (promotion: CoursePromotion) => Promise<CoursePromotion>;
  deletePromotion: (id: string) => Promise<void>;
}

/** How long a prototype save takes, so the save button has a real busy state. */
const MOCK_DELAY_MS = 500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockTrainingBackend: TrainingBackend = {
  source: "mock",
  load: async () => {
    await wait(MOCK_DELAY_MS);
    return { courses: TRAINING_COURSES, promotions: [] };
  },
  saveCourse: async (course) => {
    await wait(MOCK_DELAY_MS);
    return { ...course, updatedAt: new Date().toISOString() };
  },
  setStatus: async (course, status) => {
    await wait(MOCK_DELAY_MS);
    if (status === "draft" && course.publishedAt) throw new TrainingError("published");
    const now = new Date().toISOString();
    return { status, publishedAt: course.publishedAt ?? (status === "published" ? now : null), updatedAt: now };
  },
  deleteCourse: async (course) => {
    await wait(MOCK_DELAY_MS);
    if (course.publishedAt) throw new TrainingError("published");
  },
  savePromotion: async (promotion) => {
    await wait(MOCK_DELAY_MS);
    return promotion;
  },
  deletePromotion: async () => {
    await wait(MOCK_DELAY_MS);
  },
};

function fail(error: { code?: string; message?: string }): never {
  const kind = trainingErrorKind(error);
  if (kind === "network") console.error("Academy authoring:", error);
  throw new TrainingError(kind, kind === "notReady" ? notReadyCodes(error.message) : []);
}

/** The client is resolved on use: the provider also renders on the server, where there is none. */
export function supabaseTrainingBackend(getClient: () => TypedSupabaseClient): TrainingBackend {
  const readCourse = async (id: string): Promise<TrainingCourse> => {
    const client = getClient();
    const { data, error } = await client.from("courses").select(ADMIN_COURSE_SELECT).eq("id", id).single();
    if (error) fail(error);
    return rowToCourse(data as unknown as CourseRow);
  };

  return {
    source: "supabase",
    load: async () => {
      const client = getClient();
      const [courses, promotions] = await Promise.all([
        client.from("courses").select(ADMIN_COURSE_SELECT).order("updated_at", { ascending: false }),
        client.from("course_promotions").select("*").order("starts_at"),
      ]);
      if (courses.error) fail(courses.error);
      if (promotions.error) fail(promotions.error);
      return {
        courses: (courses.data as unknown as CourseRow[]).map(rowToCourse),
        promotions: (promotions.data as CoursePromotionRow[]).map(rowToPromotion),
      };
    },
    saveCourse: async (course) => {
      const client = getClient();
      const { error } = await client.rpc("admin_save_course", { p_course: courseToPayload(course) as unknown as Json });
      if (error) fail(error);
      return readCourse(course.id);
    },
    setStatus: async (course, status) => {
      const client = getClient();
      const { data, error } = await client
        .from("courses")
        .update({ status })
        .eq("id", course.id)
        .select("status, published_at, updated_at")
        .single();
      if (error) fail(error);
      return { status: data.status as CourseStatus, publishedAt: data.published_at, updatedAt: data.updated_at };
    },
    deleteCourse: async (course) => {
      const client = getClient();
      // RLS only lets a never-published course go: zero rows deleted means refused.
      const { error, count } = await client.from("courses").delete({ count: "exact" }).eq("id", course.id);
      if (error) fail(error);
      if (!count) throw new TrainingError(course.publishedAt ? "published" : "forbidden");
    },
    savePromotion: async (promotion) => {
      const client = getClient();
      const { data, error } = await client.from("course_promotions").upsert(promotionToRow(promotion)).select("*").single();
      if (error) fail(error);
      return rowToPromotion(data);
    },
    deletePromotion: async (id) => {
      const client = getClient();
      const { error } = await client.from("course_promotions").delete().eq("id", id);
      if (error) fail(error);
    },
  };
}
