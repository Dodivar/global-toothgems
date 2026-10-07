"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "../../lib/navigation";
import { ArrowRight, Award, BookOpenCheck, CalendarCheck, Clock, Compass, Hash, LayoutDashboard, RotateCcw, Share2, Sparkles, Target } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { ProgressRing } from "../../components/learning/LearningStatus";
import { certificateCourse, certificateRef } from "../../components/account/CertificateCard";
import { CertificateSheet, useCertificateContent } from "../../components/account/CertificateDocument";
import { AchievementBadge, AchievementStats, type AchievementStat } from "../../components/certificate/Achievement";
import { Celebration } from "../../components/certificate/Celebration";
import { DownloadCertificateButton } from "../../components/certificate/DownloadCertificateButton";
import { ShareAchievementDialog } from "../../components/certificate/ShareAchievementDialog";
import { pick, type Localized } from "../../data/types";
import { learnHref, lessonHref } from "../../lib/academyUrl";
import { useAuth } from "../../lib/auth";
import { useCertificateExport } from "../../lib/certificate/useCertificateExport";
import { useFormat } from "../../lib/format";
import type { CourseProgress, LearnerCourseCard } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import { formatDuration } from "../../lib/trainingFilters";
import { LearnAccessState } from "./LearnAccessState";
import { useLearnerCourse } from "./useLearnerCourse";

/** The ring around the badge: a progress ring closing on 100 %. */
const RING = { size: 148, stroke: 4 } as const;
const RING_R = (RING.size - RING.stroke) / 2;
const RING_C = 2 * Math.PI * RING_R;

/** Delay step of an element in the entrance sequence (`.gt-cert-seq`). */
function seq(n: number) {
  return { "--seq": n } as React.CSSProperties;
}

/**
 * The end of a training: a milestone, not a notice.
 *
 * The sequence reads before the words do: the progress ring closes on 100 %,
 * the Academy's badge turns in, the headline and the course arrive, and the
 * certificate — already made out to the member — rises into place with a
 * short fall of confetti behind it. Then the two things to do with it,
 * download and share, side by side, and the figures that earned it. Under
 * reduced motion everything is simply there.
 *
 * Opened before the course is actually complete, it says what is left instead
 * of congratulating anyone early. A course that issues no certificate still
 * gets its moment, without a document.
 */
export function CourseCompleted() {
  const { courseId = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { access, card, training, summary, progress } = useLearnerCourse(courseId);

  if (access.state !== "open" || !training || !summary) {
    return <LearnAccessState access={access} courseId={courseId} />;
  }

  if (!progress.completed) {
    const next = summary.path[summary.nextIndex];
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-center gap-4 px-4 py-[clamp(56px,10vw,120px)] text-center">
        <ProgressRing value={summary.pct} size={104} stroke={9} label={t("learning.courseProgress")} />
        <h1 className="text-[length:var(--text-h2)]">{t("learning.almostTitle")}</h1>
        <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">
          {summary.quizAverage !== null && summary.doneCount === summary.total
            ? t("learning.almostScore", { score: summary.quizAverage, min: training.completion.minScore })
            : t("learning.almostBody", { count: summary.total - summary.doneCount })}
        </p>
        {next && (
          <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate(lessonHref(courseId, next.key))}>
            {t("learning.continue")}
          </Button>
        )}
      </div>
    );
  }

  const issues = training.completion.certificate && card !== undefined && progress.completedOn !== null;
  return (
    <CompletionMoment
      courseId={courseId}
      title={training.title}
      card={issues ? card : undefined}
      progress={progress}
      stats={{ done: summary.doneCount, total: summary.total, average: summary.quizAverage, minutes: summary.totalMinutes }}
    />
  );
}

function CompletionMoment({
  courseId,
  title,
  card,
  progress,
  stats,
}: {
  courseId: string;
  title: Localized;
  /** The course as the member area lists it — set only when a certificate was issued. */
  card: LearnerCourseCard | undefined;
  progress: CourseProgress;
  stats: { done: number; total: number; average: number | null; minutes: number };
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { formatDate } = useFormat();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { displayName, profile } = useAuth();
  const [sharing, setSharing] = useState(false);
  // The certificate's wording of the course when there is one, so the page and the document agree.
  const courseTitle = pick(card?.title ?? title, lang);
  const firstName = profile?.firstName?.trim() || displayName.split(" ")[0] || "";

  const awardedOn = progress.completedOn ?? "";
  const reference = card ? certificateRef(card, progress) : "";
  const content = useCertificateContent({
    course: card ? certificateCourse(card, progress, lang, t) : { title, level: "", lessonCount: 0, duration: "" },
    holder: displayName,
    awardedOn: awardedOn || "1970-01-01",
    reference,
    lang,
  });
  const { status, download } = useCertificateExport(content);

  const onDownload = () =>
    void download("pdf").then((ok) =>
      ok
        ? showToast(t("certificate.downloadDoneLive"), t("certificate.downloadDoneBody"), "success")
        : showToast(t("certificate.downloadError"), undefined, "error"),
    );

  const figures: AchievementStat[] = [
    { icon: CalendarCheck, label: t("learning.stats.date"), value: awardedOn ? formatDate(awardedOn) : "—" },
    { icon: BookOpenCheck, label: t("learning.stats.lessons"), value: `${stats.done}/${stats.total}` },
    ...(stats.average !== null ? [{ icon: Target, label: t("learning.stats.average"), value: `${stats.average} %` }] : []),
    ...(stats.minutes > 0 ? [{ icon: Clock, label: t("certificate.statLearning"), value: formatDuration(stats.minutes, lang) }] : []),
    ...(card ? [{ icon: Hash, label: t("certificate.statReference"), value: reference, mono: true }] : []),
  ];

  return (
    <div className="relative isolate overflow-hidden">
      <Celebration />

      <section
        aria-labelledby="gt-completion-title"
        className="mx-auto grid max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-x-[clamp(32px,5vw,72px)] gap-y-7 px-4 pb-10 pt-[clamp(32px,6vw,72px)] text-center lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-center lg:text-left lg:[grid-template-areas:'head_cert'_'actions_cert']"
      >
        {/* The moment: ring, badge, headline. */}
        <div className="grid justify-items-center gap-4 lg:justify-items-start lg:[grid-area:head]">
          <div className="relative grid place-items-center max-sm:-my-3 max-sm:scale-[.8]" style={{ width: RING.size, height: RING.size }}>
            <svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden="true" className="absolute inset-0 -rotate-90">
              <circle cx={RING.size / 2} cy={RING.size / 2} r={RING_R} fill="none" stroke="var(--gt-blue-100)" strokeWidth={RING.stroke} />
              <circle
                className="gt-cert-ring-arc"
                cx={RING.size / 2}
                cy={RING.size / 2}
                r={RING_R}
                fill="none"
                stroke="var(--accent-cta)"
                strokeWidth={RING.stroke}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={0}
                style={{ "--circ": RING_C } as React.CSSProperties}
              />
            </svg>
            <AchievementBadge size="lg" reveal />
            <span className="sr-only">{t("certificate.progressDone")}</span>
          </div>

          <span
            className="gt-cert-seq inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--accent-highlight-ink)] shadow-[var(--shadow-xs)] backdrop-blur-[6px]"
            style={seq(0)}
          >
            <Sparkles size={13} aria-hidden="true" />
            {t("certificate.unlocked")}
          </span>

          <div className="grid gap-2.5">
            <p className="gt-cert-seq gt-accent m-0 text-[clamp(22px,3vw,30px)] text-[var(--gt-blue-600)]" style={seq(1)}>
              {firstName ? t("certificate.bravoName", { name: firstName }) : t("learning.bravo")}
            </p>
            <h1 id="gt-completion-title" className="gt-cert-seq text-[clamp(30px,4.6vw,48px)] leading-[1.05]" style={seq(1)}>
              {t("certificate.heroTitle")}
            </h1>
            <p className="gt-cert-seq m-0 text-[length:var(--text-body-lg)] font-semibold text-[var(--text-primary)]" style={seq(2)}>
              {courseTitle}
            </p>
            <p className="gt-cert-seq m-0 mx-auto max-w-[46ch] text-[length:var(--text-body-md)] text-[var(--text-muted)] lg:mx-0" style={seq(3)}>
              {card ? t("certificate.heroBody") : t("learning.completeBody")}
            </p>
          </div>
        </div>

        {/* The certificate, made out to the member. */}
        {card && (
          <figure className="m-0 grid justify-items-center gap-3 lg:[grid-area:cert]">
            <div className="gt-cert-reveal relative w-full max-w-[640px]">
              <span aria-hidden="true" className="absolute -inset-3 -z-10 rounded-[var(--radius-card)] border border-white/70 bg-white/45 shadow-[var(--shadow-sm)] backdrop-blur-[8px] sm:-inset-5" />
              <div className="overflow-hidden rounded-[var(--radius-sm)] bg-[var(--gt-white)] p-[2.5%] shadow-[var(--shadow-lg)]">
                <div className="overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--gt-ink-200)]">
                  <CertificateSheet content={content} />
                </div>
              </div>
            </div>
            <figcaption className="gt-cert-seq mt-2 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]" style={seq(4)}>
              <Award size={14} aria-hidden="true" className="text-[var(--accent-cta-ink)]" />
              {t("certificate.figcaption", { name: displayName, title: courseTitle, date: formatDate(awardedOn) })}
            </figcaption>
          </figure>
        )}

        {/* What to do with it. */}
        <div className="gt-cert-seq grid justify-items-center gap-4 lg:justify-items-start lg:[grid-area:actions]" style={seq(4)}>
          {card ? (
            <>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
                <DownloadCertificateButton status={status.pdf} onDownload={onDownload} size="lg" className="w-full sm:w-auto max-sm:h-auto max-sm:min-h-[52px] max-sm:whitespace-normal max-sm:px-5 max-sm:py-3 max-sm:text-[length:var(--text-body-sm)]" />
                <Button variant="dark" size="lg" iconLeft={Share2} className="gt-cert-cta w-full sm:w-auto max-sm:h-auto max-sm:min-h-[52px] max-sm:whitespace-normal max-sm:px-5 max-sm:py-3 max-sm:text-[length:var(--text-body-sm)]" onClick={() => setSharing(true)}>
                  {t("certificate.shareCta")}
                </Button>
              </div>
              <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <Award size={14} aria-hidden="true" />
                <span>
                  {t("certificate.savedToProfile")}{" "}
                  <Link to="/compte/attestations" className="font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--text-link-hover)]">
                    {t("certificate.savedToProfileLink")}
                  </Link>
                </span>
              </p>
            </>
          ) : (
            <>
              <Button variant="primary" size="lg" iconLeft={LayoutDashboard} onClick={() => navigate("/compte")}>
                {t("learning.toDashboard")}
              </Button>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("learning.criteriaNoCertificate")}</p>
            </>
          )}
        </div>
      </section>

      {/* The figures that earned it, then the way on. */}
      <section aria-label={t("certificate.statsLabel")} className="gt-cert-seq mx-auto grid max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-[clamp(40px,7vw,88px)]" style={seq(5)}>
        <AchievementStats stats={figures} />

        <div className="flex flex-col items-center justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--surface-inverse)] px-[clamp(20px,4vw,40px)] py-6 text-center text-[var(--text-inverse)] sm:flex-row sm:text-left">
          <div className="grid gap-1">
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
              {t("certificate.nextEyebrow")}
            </span>
            <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--gt-off-white)]">{t("certificate.nextTitle")}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" iconLeft={Compass} onClick={() => navigate("/academy")}>
              {t("certificate.nextCta")}
            </Button>
            <Button variant="ghost" iconLeft={RotateCcw} className="text-[var(--gt-off-white)] hover:bg-white/10" onClick={() => navigate(learnHref(courseId))}>
              {t("learning.reviewCourse")}
            </Button>
          </div>
        </div>
      </section>

      {sharing && card && <ShareAchievementDialog content={content} awardedOn={awardedOn} onClose={() => setSharing(false)} />}
    </div>
  );
}
