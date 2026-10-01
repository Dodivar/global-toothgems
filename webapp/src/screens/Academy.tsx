"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, GraduationCap, Lock } from "lucide-react";
import { Button } from "../components/ui/Button";
import { CourseCard } from "../components/ui/CourseCard";
import { courseCardData } from "../components/academy/courseCard";
import { courseHref } from "../lib/academyUrl";
import { useAcademy } from "../lib/academy/AcademyProvider";
import { courseSlug, lessonCount } from "../lib/academy/publicCourse";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";
import { useReveal } from "../lib/useReveal";

/**
 * Counts up to `value` once the number scrolls into view. Renders the final
 * value immediately under reduced motion, and always renders a real number so
 * the figure is never blank.
 */
function CountUp({ value, locale }: { value: number; locale: string }) {
  // Starts at 0 on the server and in the browser alike (the page is rendered
  // on the server, and hydration needs the same markup); under reduced motion
  // the effect below shows the final value at once.
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(value);
      return;
    }

    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1100;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          // easeOutCubic: fast at first, settles on the final figure.
          setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return <span ref={ref}>{new Intl.NumberFormat(locale).format(shown)}</span>;
}

/**
 * The Academy catalogue (phase B): the published courses, from the database
 * (`lib/academy`, the prototype's fixtures in mock mode). The figures under
 * the hero are counted from that catalogue — nothing on the page is invented.
 * Every card opens the course's sales page, where the decision is made.
 */
export function Academy() {
  const { t, i18n } = useTranslation();
  const { signedIn } = useAuth();
  const { courses, status, reload } = useAcademy();
  const { showToast } = useToast();
  const lang = i18n.language;
  const locale = lang.startsWith("en") ? "en" : "fr";
  const numberLocale = lang.startsWith("en") ? "en-IE" : "fr-FR";

  const coursesRef = useReveal<HTMLDivElement>();
  const communityRef = useReveal<HTMLElement>();

  const stats = [
    { key: "academy.statCourses", value: courses.length },
    { key: "academy.statModules", value: courses.reduce((sum, c) => sum + c.modules.length, 0) },
    { key: "academy.statLessons", value: courses.reduce((sum, c) => sum + lessonCount(c), 0) },
  ];

  /** Moves the reader to the catalogue and puts the keyboard there with them. */
  const showCourses = () => {
    const el = coursesRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,104px)] text-[var(--text-inverse)]">
        {/* A faint gem field behind the dark hero: enough to separate the Academy
            from the storefront without competing with the copy. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.16]"
          style={{
            backgroundImage: `radial-gradient(circle at 18% 22%, var(--gt-blue-300) 0, transparent 38%), radial-gradient(circle at 82% 12%, var(--gt-emerald-400) 0, transparent 34%), radial-gradient(circle at 62% 88%, var(--gt-fuchsia-400) 0, transparent 40%)`,
          }}
        />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <div className="grid max-w-[720px] gap-5">
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
              {t("academy.eyebrow")}
            </span>
            <h1
              className="text-[length:var(--text-display-1)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]"
              dangerouslySetInnerHTML={{ __html: t("academy.title") }}
            />
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">{t("academy.body")}</p>
            {courses.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={showCourses}>{t("academy.ctaCourses")}</Button>
              </div>
            )}
            {!signedIn && (
              <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                <Lock size={14} aria-hidden="true" />
                {t("academy.accountRequired")}
              </p>
            )}
          </div>
          {courses.length > 0 && (
            <dl aria-label={t("academy.statsLabel")} className="m-0 grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
              {stats.map((s) => (
                <div key={s.key} className="flex flex-col-reverse gap-1">
                  <dt className="text-sm text-[var(--gt-ink-300)]">{t(s.key, { count: s.value })}</dt>
                  <dd className="m-0 text-[28px] font-[var(--weight-black)] text-[var(--gt-off-white)]">
                    <CountUp value={s.value} locale={numberLocale} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div
            ref={coursesRef}
            id="formations"
            tabIndex={-1}
            aria-label={t("academy.coursesLabel")}
            aria-busy={status === "loading" || status === "idle"}
            className="gt-reveal scroll-mt-6 outline-none"
          >
            {courses.length > 0 ? (
              <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((c) => (
                  <li key={c.id}>
                    <CourseCard
                      tone="ink"
                      course={courseCardData(c, lang, t)}
                      /* The catalogue opens the training's own page: the
                         curriculum, the assessment and the diploma are
                         explained there, and it is open to everyone. */
                      to={courseHref(courseSlug(c, locale))}
                    />
                  </li>
                ))}
              </ul>
            ) : status === "error" ? (
              <div role="alert" className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-white/15 p-[var(--space-6)]">
                <p className="m-0 text-[length:var(--text-body-md)] text-[var(--gt-off-white)]">{t("academy.loadError")}</p>
                <Button variant="glass" onClick={reload}>{t("academy.retry")}</Button>
              </div>
            ) : status === "ready" ? (
              <div className="grid justify-items-start gap-2 rounded-[var(--radius-card)] border border-white/15 p-[var(--space-6)]">
                <GraduationCap size={22} aria-hidden="true" className="text-[var(--gt-blue-300)]" />
                <h2 className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">{t("academy.emptyTitle")}</h2>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">{t("academy.emptyBody")}</p>
              </div>
            ) : (
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]" role="status">{t("academy.loading")}</p>
            )}
          </div>
        </div>
      </section>

      <section ref={communityRef} className="gt-reveal px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="grid gap-4">
            <span className="gt-eyebrow">{t("academy.communityEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("academy.communityTitle")}</h2>
            {/* Classic editorial drop cap — the intended use of .gt-lettrine,
                which was defined in the design system and never used. */}
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">
              <span aria-hidden="true">
                <span className="gt-lettrine float-left mr-2 mt-1">{t("academy.communityBody").charAt(0)}</span>
                {t("academy.communityBody").slice(1)}
              </span>
              <span className="sr-only">{t("academy.communityBody")}</span>
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => showToast(t("common.notIncludedTitle"), t("common.notIncludedArtists"), "info")}>
                {t("academy.communityCta")}
              </Button>
            </div>
          </div>
          <div className="gt-sparkle relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)]">
            <img
              src={photo("mouth-04.jpg")}
              alt=""
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {courses.length > 0 && (
        <section className="px-[clamp(14px,4vw,48px)] pb-[var(--section-y)] text-center">
          <div className="mx-auto flex max-w-[var(--max-width-content)] flex-wrap justify-center gap-3">
            <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={showCourses}>{t("academy.ctaCourses")}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
