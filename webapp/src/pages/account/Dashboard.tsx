import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Award, BookOpen, GraduationCap, ListVideo, Package, PlayCircle } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { CourseCard } from "../../components/ui/CourseCard";
import { EnrolledCourseRow } from "../../components/account/EnrolledCourseRow";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { StatTile } from "../../components/account/StatTile";
import { FLAT, MODULES, moduleIndexForFlatIndex } from "../../data/lessons";
import { pick } from "../../data/types";
import { useAuth } from "../../lib/auth";
import { useOrders } from "../../lib/orders";
import { useProgress } from "../../lib/progress";

/**
 * Home of the member area: what the account is worth in figures, the lesson to
 * resume, the courses being followed and the ones still available.
 *
 * It owns no state. Progress comes from `lib/progress.tsx` and orders from
 * `lib/orders.tsx`, so validating a lesson in the player or paying in the cart
 * moves these numbers immediately.
 */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { displayName } = useAuth();
  const { openCourse, progressFor, enrolledCourses, availableCourses } = useProgress();
  const { orders } = useOrders();

  const enrolled = enrolledCourses();
  const available = availableCourses();
  const progressByCourse = enrolled.map((course) => ({ course, progress: progressFor(course.id) }));

  const inProgress = progressByCourse.filter(({ progress }) => !progress.completed);
  const certificates = progressByCourse.filter(({ progress }) => progress.completed).length;
  const lessonsDone = progressByCourse.reduce((sum, { progress }) => sum + progress.doneCount, 0);
  /** The course the "resume" card offers: the least advanced one still open. */
  const resume = inProgress.slice().sort((a, b) => a.progress.pct - b.progress.pct)[0] ?? null;

  const open = (courseId: string) => {
    openCourse(courseId);
    navigate("/academy/lecon");
  };

  return (
    <>
      <section className="grid gap-5">
        <SectionHeader eyebrow={t("account.eyebrow")} title={t("account.greeting", { name: displayName })} />

        <dl aria-label={t("account.statsLabel")} className="m-0 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile value={String(inProgress.length)} label={t("account.statCourses")} icon={BookOpen} />
          <StatTile value={String(lessonsDone)} label={t("account.statLessons")} icon={PlayCircle} />
          <StatTile value={String(certificates)} label={t("account.statCertificates")} icon={Award} />
          <StatTile value={String(orders.length)} label={t("account.statOrders")} icon={Package} />
        </dl>

        {/* The single most useful control on the dashboard, so it keeps the dark
            treatment while the rest of the member area stays light. */}
        {resume ? (
          <div className="grid grid-cols-1 gap-5 rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-5)] text-[var(--text-inverse)] sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)]">
              <img
                src={resume.course.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 grid place-items-center text-white/90">
                <PlayCircle size={40} strokeWidth={1.5} aria-hidden="true" />
              </span>
            </div>
            <div className="grid content-center gap-3">
              <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                {t("account.resumeEyebrow")}
              </span>
              <strong className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">
                {t("account.resumeLesson", {
                  number: resume.progress.activeIdx + 1,
                  title: pick(FLAT[resume.progress.activeIdx].title, lang),
                })}
              </strong>
              <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                {pick(resume.course.title, lang)} ·{" "}
                {pick(MODULES[moduleIndexForFlatIndex(resume.progress.activeIdx)].title, lang)} ·{" "}
                {t("account.resumeRemaining", { minutes: resume.progress.remainingMinutes })}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" iconRight={ArrowRight} onClick={() => open(resume.course.id)}>
                  {t("account.resumeCta")}
                </Button>
                <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--gt-ink-300)]">
                  {t("lesson.progressLabel", { done: resume.progress.doneCount, total: resume.progress.total })} ·{" "}
                  {resume.progress.pct}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-5)] text-[var(--text-inverse)]">
            <div className="grid gap-1">
              <strong className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">
                {t("account.resumeDoneTitle")}
              </strong>
              <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                {t("account.resumeDoneBody")}
              </span>
            </div>
            <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/academy")}>
              {t("account.resumeDoneCta")}
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-5">
        <div className="grid gap-2">
          <span className="gt-eyebrow flex items-center gap-2">
            <GraduationCap size={13} aria-hidden="true" />
            {t("account.coursesEyebrow")}
          </span>
          <h2 className="text-[length:var(--text-h3)]">{t("account.coursesTitle")}</h2>
        </div>
        {enrolled.length === 0 ? (
          <EmptyPanel
            action={
              <Button variant="outline" size="sm" iconRight={ArrowRight} onClick={() => navigate("/academy")}>
                {t("account.resumeDoneCta")}
              </Button>
            }
          >
            {t("account.coursesEmpty")}
          </EmptyPanel>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {progressByCourse.map(({ course, progress }) => (
              <EnrolledCourseRow
                key={course.id}
                course={course}
                progress={progress}
                lang={lang}
                onOpen={() => open(course.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2">
            <span className="gt-eyebrow flex items-center gap-2">
              <ListVideo size={13} aria-hidden="true" />
              {t("account.availableEyebrow")}
            </span>
            <h2 className="text-[length:var(--text-h3)]">{t("account.availableTitle")}</h2>
          </div>
          <Link
            to="/academy"
            className="text-[length:var(--text-caption)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {t("account.availableCta")}
          </Link>
        </div>
        {available.length === 0 ? (
          <EmptyPanel>{t("account.availableAllDone")}</EmptyPanel>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((course) => (
              <CourseCard
                key={course.id}
                course={{
                  id: course.id,
                  title: pick(course.title, lang),
                  level: pick(course.level, lang),
                  lessonCount: course.lessonCount,
                  duration: course.duration,
                  price: course.price,
                  image: course.image,
                  state: "available",
                }}
                onSelect={() => open(course.id)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
