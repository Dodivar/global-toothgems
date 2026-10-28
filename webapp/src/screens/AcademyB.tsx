"use client";

import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HeroB } from "../components/academyPageB/HeroB";
import { CourseCatalogB } from "../components/academyPageB/CourseCatalogB";
import { BenefitsB } from "../components/academyPageB/BenefitsB";
import { EcosystemB } from "../components/academyPageB/EcosystemB";
import { ClosingB } from "../components/academyPageB/ClosingB";
import { LearnerReviews } from "../components/academyPage/LearnerReviews";
import { useAcademy } from "../lib/academy/AcademyProvider";
import { featuredCourse } from "../lib/academy/catalog";

/**
 * Académie B (`/fr/academy-b`, `/en/academy-b`): a second composition of the
 * Academy marketplace, to compare with `/academy` before one of them is kept
 * (requested by the owner on 2026-10-28; not indexed). Same copy and the same
 * published catalogue, presented phone first in the brand's blue and white
 * with green calls to action: a short hero, the catalogue right under it,
 * the benefits once, the rest of the Global Toothgems world, the reviews when
 * there are any, and a closing call that carries the progression — the
 * marketplace's two numbered timelines are not repeated, since a course's own
 * page tells how it runs.
 */
export function AcademyB() {
  const { i18n } = useTranslation();
  const { courses, status, reload } = useAcademy();
  const lang = i18n.language;

  const catalogRef = useRef<HTMLElement>(null);
  const featured = useMemo(() => featuredCourse(courses), [courses]);

  const explore = () => {
    const el = catalogRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <div className="gt-alt gt-academyb">
      <HeroB courses={courses} onExplore={explore} />
      <CourseCatalogB courses={courses} status={status} onRetry={reload} featured={featured} lang={lang} sectionRef={catalogRef} />
      <BenefitsB />
      <EcosystemB />
      <LearnerReviews courses={courses} lang={lang} />
      <ClosingB onExplore={explore} />
    </div>
  );
}
