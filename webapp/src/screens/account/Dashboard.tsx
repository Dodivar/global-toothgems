"use client";

import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../../lib/navigation";
import { ArrowRight, GraduationCap, LayoutGrid, ListVideo } from "lucide-react";
import { CourseCard } from "../../components/ui/CourseCard";
import { courseCardData } from "../../components/academy/courseCard";
import { EnrolledCourseRow } from "../../components/account/EnrolledCourseRow";
import { SectionHeader } from "../../components/account/SectionHeader";
import { ReviewRequestCard } from "../../components/reviews/ReviewRequestCard";
import { LoungeActivityCard } from "../../components/communityChat/LoungeActivityCard";
import { ResumeCourseCard } from "../../components/account/dashboard/ResumeCourseCard";
import { ShipmentCard } from "../../components/account/dashboard/ShipmentCard";
import { LoyaltyTile } from "../../components/account/dashboard/LoyaltyTile";
import { WelcomeChecklist } from "../../components/account/dashboard/WelcomeChecklist";
import { StudioTile } from "../../components/account/dashboard/StudioTile";
import { CertificatesTile } from "../../components/account/dashboard/CertificatesTile";
import { FavoritesTile } from "../../components/account/dashboard/FavoritesTile";
import { useAuth } from "../../lib/auth";
import { useOrders } from "../../lib/orders";
import { useCourseMediaUrl, useProgress } from "../../lib/progress";
import { useReviewRequests } from "../../lib/reviews";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import { courseSlug } from "../../lib/academy/publicCourse";
import { courseHref, learnHref, lessonHref } from "../../lib/academyUrl";
import { earnedCertificates, ordersOnTheirWay } from "../../lib/memberDashboard";
import { StudioAccessProvider } from "../../lib/studioAccess";

/**
 * Home of the member area, phone first: what needs the member now, then what
 * is true about the account, then the courses.
 *
 * 1. Things to do, most urgent first, each only when it exists: the parcel on
 *    its way, the lesson to resume, the review to leave.
 * 2. "Your account": cards that each say something concrete — the loyalty
 *    card and what is missing for the reward, the Studio plan in use, the
 *    certificates earned, the favourites on sale. A card with nothing true to
 *    say is not drawn; bare counts (orders, lessons) are deliberately gone.
 * 3. The Members' Lounge (course holders and staff only), the courses held,
 *    then the ones still available — each section only when it has content.
 *
 * It owns no state: every card reads its own store (`lib/orders`,
 * `lib/progress`, `lib/loyalty`, `lib/studioAccess`, `lib/favorites`), all
 * limited to the member's own rows by RLS; the choices are `lib/memberDashboard.ts`.
 */
export function Dashboard() {
  return (
    <StudioAccessProvider>
      <DashboardContent />
    </StudioAccessProvider>
  );
}

function DashboardContent() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { displayName } = useAuth();
  const { openCourse, progressFor, enrolledCourses, trainingFor, activeCourseId } = useProgress();
  const { courses: catalogue } = useAcademy();
  const mediaUrl = useCourseMediaUrl();
  const locale = lang.startsWith("en") ? "en" : "fr";
  const { orders, status: ordersStatus } = useOrders();
  // The one thing the member could review next, if anything.
  const [reviewRequest] = useReviewRequests();

  const enrolled = enrolledCourses();
  const held = new Set(enrolled.map((course) => course.id));
  const available = catalogue.filter((course) => !held.has(course.id));
  const progressByCourse = enrolled.map((course) => ({ course, progress: progressFor(course.id) }));

  const inProgress = progressByCourse.filter(({ course, progress }) => course.status !== "unpublished" && !progress.completed);
  /**
   * The course the "resume" card offers: the one last opened, where the member
   * stopped; else the most advanced one still open — the closest to its certificate.
   */
  const resume =
    inProgress.find(({ course }) => course.id === activeCourseId) ??
    inProgress.slice().sort((a, b) => b.progress.pct - a.progress.pct)[0] ??
    null;
  const certificates = earnedCertificates(progressByCourse);
  const onTheirWay = ordersStatus === "ready" ? ordersOnTheirWay(orders) : [];

  /** A course row opens its overview; the resume card goes straight to the lesson. */
  const open = (courseId: string) => {
    openCourse(courseId);
    navigate(learnHref(courseId));
  };
  const resumeLesson = (courseId: string, key: string | undefined) => {
    openCourse(courseId);
    navigate(key ? lessonHref(courseId, key) : learnHref(courseId));
  };

  return (
    <>
      <section className="grid gap-5">
        <SectionHeader eyebrow={t("account.eyebrow")} title={t("account.greeting", { name: displayName })} />

        {/* New accounts only: a few places to visit, ticked from what the account holds. */}
        <WelcomeChecklist />

        {/* What needs the member now. On a phone these come straight under the greeting. */}
        <ShipmentCard orders={onTheirWay} />

        {resume && (
          <ResumeCourseCard
            title={resume.course.title}
            cover={mediaUrl(resume.course.cover)}
            moduleTitle={
              resume.progress.current
                ? (trainingFor(resume.course.id)?.modules[resume.progress.current.moduleIndex]?.title ?? null)
                : null
            }
            progress={resume.progress}
            onResume={() => resumeLesson(resume.course.id, resume.progress.current?.key)}
          />
        )}
      </section>

      {reviewRequest && <ReviewRequestCard request={reviewRequest} />}

      {/* Each card draws itself only when it has something true to say; an empty
          grid collapses (`:has`), so the heading never stands over nothing. */}
      <section aria-labelledby="gt-dashboard-account" className="grid gap-5 [&:not(:has(li))]:hidden">
        <div className="grid gap-2">
          <span className="gt-eyebrow flex items-center gap-2">
            <LayoutGrid size={13} aria-hidden="true" />
            {t("account.dashboard.accountEyebrow")}
          </span>
          <h2 id="gt-dashboard-account" className="text-[length:var(--text-h3)]">
            {t("account.dashboard.accountTitle")}
          </h2>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          <LoyaltyTile />
          <StudioTile />
          <CertificatesTile earned={certificates} lang={lang} />
          <FavoritesTile />
        </ul>
      </section>

      <LoungeActivityCard />

      {enrolled.length > 0 && (
        <section className="grid gap-5">
          <div className="grid gap-2">
            <span className="gt-eyebrow flex items-center gap-2">
              <GraduationCap size={13} aria-hidden="true" />
              {t("account.coursesEyebrow")}
            </span>
            <h2 className="text-[length:var(--text-h3)]">{t("account.coursesTitle")}</h2>
          </div>
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
        </section>
      )}

      {available.length > 0 && (
        <section className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-2">
              <span className="gt-eyebrow flex items-center gap-2">
                <ListVideo size={13} aria-hidden="true" />
                {t(enrolled.length > 0 ? "account.availableEyebrow" : "account.dashboard.discoverEyebrow")}
              </span>
              <h2 className="text-[length:var(--text-h3)]">
                {t(enrolled.length > 0 ? "account.availableTitle" : "account.dashboard.discoverTitle")}
              </h2>
            </div>
            <Link
              to="/academy"
              className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
            >
              {t("account.availableCta")}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((course) => (
              <CourseCard
                key={course.id}
                course={courseCardData(course, lang, t)}
                to={courseHref(courseSlug(course, locale))}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
