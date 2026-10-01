"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { productSlugTranslator } from "../catalog/productSlugs";
import type { ParamTranslator } from "../localeRoutes";
import { isSupabaseConfigured } from "../supabase/client";
import { fetchPublicCourses } from "./api";
import { FIXTURE_COURSES } from "./fixtures";
import { findCourseByKey, type PublicCourse } from "./publicCourse";

export type AcademyStatus = "idle" | "loading" | "ready" | "error";

interface AcademyContextValue {
  status: AcademyStatus;
  /** Where the courses come from: the database, or the prototype's fixtures when it is not configured. */
  source: "supabase" | "mock";
  courses: PublicCourse[];
  reload: () => void;
  findCourse: (key: string) => PublicCourse | undefined;
  /** Course slugs of each language for links and the language switch (`lib/navigation`). */
  translateSlugs: ParamTranslator;
}

const AcademyContext = createContext<AcademyContextValue | null>(null);

/**
 * The published Academy, shared by the header, the footer, the home page and
 * the Academy pages (phase B). It starts from what the server read for a
 * public page (`seed`, `lib/academy/serverAcademy.ts`); elsewhere (member
 * space, back office) it loads only once a component asks for it. A failed
 * load is `status: "error"` with a retry, never the fixtures.
 */
export function AcademyProvider({ seed, children }: { seed?: PublicCourse[]; children: ReactNode }) {
  const [state, setState] = useState<{ status: AcademyStatus; courses: PublicCourse[] }>(() => {
    if (!isSupabaseConfigured) return { status: "ready", courses: FIXTURE_COURSES };
    if (seed) return { status: "ready", courses: seed };
    return { status: "idle", courses: [] };
  });
  // Bumped to (re)load: 1 for the first load a component asks for, +1 per retry.
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || loads === 0) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    fetchPublicCourses(controller.signal)
      .then((courses) => setState({ status: "ready", courses }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[academy] load failed", error);
        setState({ status: "error", courses: [] });
      });
    return () => controller.abort();
  }, [loads]);

  const reload = useCallback(() => setLoads((n) => n + 1), []);
  const request = useCallback(() => setLoads((n) => (n === 0 ? 1 : n)), []);

  const translateSlugs = useMemo(() => productSlugTranslator(state.courses, "course"), [state.courses]);

  const value = useMemo<AcademyContextValue & { request: () => void }>(
    () => ({
      status: state.status,
      courses: state.courses,
      source: isSupabaseConfigured ? "supabase" : "mock",
      reload,
      request,
      findCourse: (key) => findCourseByKey(state.courses, key),
      translateSlugs,
    }),
    [state, reload, request, translateSlugs],
  );

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

const keepSlugs: ParamTranslator = (_id, params) => params;

/** The courses' slug translator, or none outside an `AcademyProvider`. */
export function useCourseSlugTranslator(): ParamTranslator {
  return useContext(AcademyContext)?.translateSlugs ?? keepSlugs;
}

/** The published courses; asks the provider to load them when nothing was seeded. */
export function useAcademy(): AcademyContextValue {
  const ctx = useContext(AcademyContext) as (AcademyContextValue & { request: () => void }) | null;
  if (!ctx) throw new Error("useAcademy must be used within AcademyProvider");
  const { request, status } = ctx;
  useEffect(() => {
    if (status === "idle") request();
  }, [status, request]);
  return ctx;
}
