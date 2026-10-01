import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { CATALOGUE_TTL_SECONDS } from "../catalog/serverCatalog";
import { isSupabaseConfigured } from "../supabase/env";
import { createPublicServerSupabase } from "../supabase/publicServer";
import { fetchPublicCourses } from "./api";
import { FIXTURE_COURSES } from "./fixtures";
import { findCourseByKey, type PublicCourse } from "./publicCourse";

/*
 * The published Academy as the server reads it for public pages: from
 * Supabase with the publishable key (anonymous visitor, RLS), or the
 * fixtures in mock mode. Same cache as the catalogue (`serverCatalog.ts`):
 * shared by every request for `CATALOGUE_TTL_SECONDS`, tagged `academy`; a
 * failed read throws and is not cached. A course published, withdrawn or
 * repriced in the back office shows on server-rendered pages within that
 * delay; prices shown are indicative (selling courses, phase D, will compute
 * them in the database).
 */

export const ACADEMY_CACHE_TAG = "academy";

const readCourses = unstable_cache(() => fetchPublicCourses(undefined, createPublicServerSupabase()), ["academy", "courses"], {
  revalidate: CATALOGUE_TTL_SECONDS,
  tags: [ACADEMY_CACHE_TAG],
});

/** Every published course (once per request). */
export const listPublicCourses = cache(async (): Promise<PublicCourse[]> => {
  if (!isSupabaseConfigured) return FIXTURE_COURSES;
  return readCourses();
});

/** The course a URL key names (any language's slug, or its row id); null when the Academy does not offer it. */
export async function findPublicCourse(key: string): Promise<PublicCourse | null> {
  return findCourseByKey(await listPublicCourses(), key) ?? null;
}

/**
 * What the stores start from on a server-rendered public page (the header,
 * footer, home and Academy pages list the courses): undefined in mock mode
 * (the fixtures are in the bundle) or when the read fails — the browser then
 * loads it, never a fallback to the fixtures.
 */
export const loadAcademySeed = cache(async (): Promise<PublicCourse[] | undefined> => {
  if (!isSupabaseConfigured) return undefined;
  try {
    return await readCourses();
  } catch (error) {
    console.warn("[academy] server read of the courses failed; the browser loads them", error);
    return undefined;
  }
});
