"use client";

import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AcademyHero } from "../components/academyPage/AcademyHero";
import { ValueSection } from "../components/academyPage/ValueSection";
import { CourseCatalog, PATHWAYS_FROM } from "../components/academyPage/CourseCatalog";
import { HowItWorks } from "../components/academyPage/HowItWorks";
import { JourneyBand } from "../components/academyPage/JourneyBand";
import { Ecosystem } from "../components/academyPage/Ecosystem";
import { LearnerReviews } from "../components/academyPage/LearnerReviews";
import { FinalCta } from "../components/academyPage/FinalCta";
import { useAcademy } from "../lib/academy/AcademyProvider";
import { featuredCourse } from "../lib/academy/catalog";

/** Scrolls to a section and puts the keyboard there with the reader. */
function bringIntoView(el: HTMLElement | null) {
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

/**
 * The Academy marketplace (`/fr/academy`, `/en/academy`): discovery,
 * comparison, inspiration and choice. It answers "which course is for me?"
 * and hands over to the course's own page, which answers "what exactly will
 * I learn, and how?" — so no curriculum, quiz mechanics or diploma details
 * are repeated here.
 *
 * Everything course-related is the published catalogue (`lib/academy`: the
 * database, or the prototype's fixtures in mock mode): the featured course,
 * the figures, the filters and the reviews. Nothing is invented to make the
 * catalogue look bigger; the page scales with it (`CourseCatalog`).
 */
export function Academy() {
  const { i18n } = useTranslation();
  const { courses, status, reload } = useAcademy();
  const lang = i18n.language;

  const catalogRef = useRef<HTMLElement>(null);
  const pathwaysRef = useRef<HTMLDivElement>(null);
  const featured = useMemo(() => featuredCourse(courses), [courses]);

  const explore = () => bringIntoView(catalogRef.current);
  const findStart = courses.length >= PATHWAYS_FROM ? () => bringIntoView(pathwaysRef.current) : undefined;

  return (
    <div className="gt-alt gt-academy">
      <AcademyHero courses={courses} featured={featured} lang={lang} onExplore={explore} onFindStart={findStart} />
      <ValueSection />
      <CourseCatalog
        courses={courses}
        status={status}
        onRetry={reload}
        featured={featured}
        lang={lang}
        sectionRef={catalogRef}
        pathwaysRef={pathwaysRef}
      />
      <HowItWorks certificate={courses.some((course) => course.issuesCertificate)} />
      <JourneyBand onStart={explore} />
      <Ecosystem onLearn={explore} />
      <LearnerReviews courses={courses} lang={lang} />
      <FinalCta onExplore={explore} onFindStart={findStart} />
    </div>
  );
}
