"use client";

import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AcademyHero } from "../components/academyPage/AcademyHero";
import { CourseCatalog } from "../components/academyPage/CourseCatalog";
import { ValueSection } from "../components/academyPage/ValueSection";
import { Ecosystem } from "../components/academyPage/Ecosystem";
import { LearnerReviews } from "../components/academyPage/LearnerReviews";
import { FinalCta } from "../components/academyPage/FinalCta";
import { useAcademy } from "../lib/academy/AcademyProvider";
import { featuredCourse } from "../lib/academy/catalog";

/**
 * The Academy marketplace (`/fr/academy`, `/en/academy`): discovery,
 * comparison and choice, phone first, in the brand's blue and white with
 * green calls to action (chosen by the owner on 2026-10-28 over the former
 * editorial design). A short hero, the catalogue right under it, the
 * benefits once, the Global Toothgems world, the reviews when there are any
 * and a closing call. It answers "which course is for me?" and hands over to
 * the course's own page, which answers "what exactly will I learn, and how?"
 * — so no curriculum, steps of a course, quiz mechanics or diploma details
 * are repeated here.
 *
 * Everything course-related is the published catalogue (`lib/academy`: the
 * database, or the fixtures in mock mode); nothing is invented to make the
 * catalogue look bigger, and the page scales with it (`CourseCatalog`).
 */
export function Academy() {
  const { i18n } = useTranslation();
  const { courses, status, reload } = useAcademy();
  const lang = i18n.language;

  const catalogRef = useRef<HTMLElement>(null);
  const featured = useMemo(() => featuredCourse(courses), [courses]);

  // Scrolls to the catalogue and puts the keyboard there with the reader.
  const explore = () => {
    const el = catalogRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <div className="gt-alt gt-academy">
      <AcademyHero courses={courses} onExplore={explore} />
      <CourseCatalog courses={courses} status={status} onRetry={reload} featured={featured} lang={lang} sectionRef={catalogRef} />
      <ValueSection />
      <Ecosystem onLearn={explore} />
      <LearnerReviews courses={courses} lang={lang} />
      <FinalCta onExplore={explore} />
    </div>
  );
}
