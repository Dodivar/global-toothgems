"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { ArrowRight, Award, BookOpenCheck, Compass, GraduationCap, Hourglass } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { CertificateCard, HeldCertificateShare, PendingCertificateCard } from "../../components/account/CertificateCard";
import { CertificateViewer } from "../../components/account/CertificateViewer";
import { SectionHeader } from "../../components/account/SectionHeader";
import { AchievementBadge } from "../../components/certificate/Achievement";
import { ReviewRequestCard } from "../../components/reviews/ReviewRequestCard";
import { pick } from "../../data/types";
import { learnHref } from "../../lib/academyUrl";
import { useAuth } from "../../lib/auth";
import { useProgress } from "../../lib/progress";
import { useReviewRequests } from "../../lib/reviews";
import { useFormat } from "../../lib/format";

/**
 * The member's certificate collection — a shelf of achievements, not a list
 * of documents.
 *
 * A certificate is the completion record the server writes once the course's
 * rules are met (`course_completions`, with its verification code); the page
 * reads the same progress state as the lesson player, so finishing a course
 * adds a certificate here immediately. The prototype derives it from progress.
 *
 * Three states, all reachable from the seeded demo account: no course at all,
 * courses under way with nothing earned yet, and a collection holding one or
 * more certificates. Each one is designed rather than left to a generic panel.
 *
 * Each certificate can be viewed full size, downloaded (an A4 PDF drawn in the
 * browser, `lib/certificate/render.ts`) and shared as an image. The share
 * dialog opens above the viewer when it is started from there.
 */
export function Certificates() {
  const { formatDate } = useFormat();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { displayName } = useAuth();
  const { progressFor, enrolledCourses } = useProgress();
  // A finished training is the natural moment to review it.
  const courseRequest = useReviewRequests().find((r) => r.subject.kind === "course" && r.context === "completed");
  /** Course id of the certificate open in the viewer, or null. */
  const [viewing, setViewing] = useState<string | null>(null);
  /** Course id of the certificate being shared, or null. */
  const [sharing, setSharing] = useState<string | null>(null);

  // Only courses that issue a certificate belong on this page.
  const rows = enrolledCourses()
    .filter((course) => course.issuesCertificate)
    .map((course) => ({ course, progress: progressFor(course.id) }));
  /** Most recent first: the collection is chronological, not a ranking. A certificate outlives a withdrawn course. */
  const earned = rows
    .filter((row) => row.progress.completed && row.progress.completedOn !== null)
    .sort((a, b) => b.progress.completedOn!.localeCompare(a.progress.completedOn!));
  // A withdrawn course cannot be followed until it is back: it is not "under way".
  const pending = rows.filter(
    (row) => row.course.status !== "unpublished" && (!row.progress.completed || row.progress.completedOn === null),
  );

  const [featured, ...rest] = earned;
  const open = viewing ? earned.find((row) => row.course.id === viewing) : undefined;
  const shared = sharing ? earned.find((row) => row.course.id === sharing) : undefined;
  // The name printed on the certificates: the profile's, as the account shows it.
  const holder = displayName;

  return (
    <>
      <section className="grid gap-[var(--space-5)]">
        <SectionHeader
          icon={Award}
          eyebrow={t("account.certificatesEyebrow")}
          title={t("account.certificatesTitle")}
          description={t("account.certificatesBody")}
        />

        {/* The collection plate. Only ever shows counts and dates that exist. */}
        {earned.length > 0 && (
          <div className="relative flex flex-wrap items-center justify-between gap-[var(--space-5)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-inverse)] px-[var(--space-6)] py-[var(--space-5)] text-[var(--text-inverse)]">
            <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--gt-blue-500)] opacity-25 blur-[50px]" />
            <dl aria-label={t("account.certificateSummaryLabel")} className="relative m-0 flex items-center gap-4">
              <AchievementBadge size="md" />
              <dd className="m-0 text-[44px] font-[var(--weight-black)] tabular-nums leading-none text-[var(--gt-off-white)]">
                {String(earned.length).padStart(2, "0")}
              </dd>
              <div className="grid gap-1">
                <dt className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                  {t("account.certificatesEarnedCount", { count: earned.length })}
                </dt>
                <span className="text-[length:var(--text-caption)] text-[var(--gt-ink-300)]">
                  {t("account.certificatesLatest", {
                    title: pick(featured.course.title, lang),
                    date: formatDate(featured.progress.completedOn!),
                  })}
                </span>
              </div>
            </dl>
            <span className="relative flex items-center gap-2 text-[var(--gt-blue-300)]">
              <span aria-hidden="true">&#10022;</span>
              <span className="gt-accent text-[15px] leading-none">{t("account.certificatesTagline")}</span>
            </span>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        /* No course on the account: aspirational, not an error. */
        <EmptyCertificates onDiscover={() => navigate("/academy")} />
      ) : (
        earned.length > 0 && (
          <section className="grid gap-[var(--space-5)]">
            <div className="grid gap-2">
              <span className="gt-eyebrow flex items-center gap-2">
                <Award size={13} aria-hidden="true" />
                {t("account.certificatesFeaturedEyebrow")}
              </span>
              <h2 className="text-[length:var(--text-h3)]">{t("account.certificatesFeaturedTitle")}</h2>
            </div>

            <CertificateCard
              course={featured.course}
              progress={featured.progress}
              holder={holder}
              lang={lang}
              index={1}
              total={earned.length}
              featured
              onOpen={() => setViewing(featured.course.id)}
              onShare={() => setSharing(featured.course.id)}
            />

            {rest.length > 0 && (
              <>
                <div className="mt-[var(--space-3)] grid gap-2">
                  <span className="gt-eyebrow flex items-center gap-2">
                    <GraduationCap size={13} aria-hidden="true" />
                    {t("account.certificatesCollectionEyebrow")}
                  </span>
                  <h2 className="text-[length:var(--text-h3)]">{t("account.certificatesCollectionTitle")}</h2>
                </div>
                <div className="grid grid-cols-1 gap-[var(--space-5)] xl:grid-cols-2">
                  {rest.map((row, i) => (
                    <CertificateCard
                      key={row.course.id}
                      course={row.course}
                      progress={row.progress}
                      holder={holder}
                      lang={lang}
                      index={i + 2}
                      total={earned.length}
                      onOpen={() => setViewing(row.course.id)}
                      onShare={() => setSharing(row.course.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )
      )}

      {courseRequest && <ReviewRequestCard request={courseRequest} variant="dark" />}

      {/* Enrolled but nothing finished yet: the collection says so in its own
          words, so the page never reads as if something failed to load. */}
      {rows.length > 0 && earned.length === 0 && (
        <section className="flex flex-wrap items-center gap-[var(--space-5)] rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash)] p-[var(--space-6)]">
          <AchievementBadge size="md" className="opacity-60 grayscale" />
          <div className="grid max-w-[var(--max-width-prose)] gap-1.5">
            <span className="gt-eyebrow flex items-center gap-2">
              <Award size={13} aria-hidden="true" />
              {t("certificate.noneYetEyebrow")}
            </span>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("account.certificatesNoneYet")}</p>
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section className="grid gap-[var(--space-5)]">
          <div className="grid gap-2">
            <span className="gt-eyebrow flex items-center gap-2">
              <Hourglass size={13} aria-hidden="true" />
              {t("account.certificatesPendingEyebrow")}
            </span>
            <h2 className="text-[length:var(--text-h3)]">{t("account.certificatesPendingTitle")}</h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("account.certificatesPendingBody")}
            </p>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-[var(--space-4)] p-0 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((row) => (
              <PendingCertificateCard
                key={row.course.id}
                course={row.course}
                progress={row.progress}
                lang={lang}
                onContinue={() => navigate(learnHref(row.course.id))}
              />
            ))}
          </ul>
        </section>
      )}

      {open && (
        <CertificateViewer
          course={open.course}
          progress={open.progress}
          holder={holder}
          lang={lang}
          onClose={() => setViewing(null)}
          onShare={() => setSharing(open.course.id)}
        />
      )}

      {shared && (
        <HeldCertificateShare course={shared.course} progress={shared.progress} holder={holder} lang={lang} onClose={() => setSharing(null)} />
      )}
    </>
  );
}

/**
 * No course on the account yet. The page shows what is waiting rather than
 * what is missing: the path to a first certificate in three steps, ending on
 * the badge it earns.
 */
function EmptyCertificates({ onDiscover }: { onDiscover: () => void }) {
  const { t } = useTranslation();
  const steps = [
    { icon: Compass, title: t("certificate.emptyStep1"), body: t("certificate.emptyStep1Body") },
    { icon: BookOpenCheck, title: t("certificate.emptyStep2"), body: t("certificate.emptyStep2Body") },
    { icon: Award, title: t("certificate.emptyStep3"), body: t("certificate.emptyStep3Body") },
  ];
  return (
    <section className="relative grid gap-[var(--space-6)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,4vw,40px)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_80%_at_100%_0%,var(--gt-blue-100),transparent_60%),radial-gradient(50%_60%_at_0%_100%,var(--gt-emerald-50),transparent_70%)]"
      />
      <div className="relative grid justify-items-start gap-[var(--space-4)]">
        <span className="gt-eyebrow flex items-center gap-2">
          <Award size={13} aria-hidden="true" />
          {t("account.certificatesEmptyEyebrow")}
        </span>
        <h2 className="max-w-[var(--max-width-prose)] text-[length:var(--text-h3)]">{t("account.certificatesEmptyTitle")}</h2>
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("account.certificatesEmpty")}</p>
        <Button variant="primary" iconRight={ArrowRight} className="gt-cert-cta" onClick={onDiscover}>
          {t("account.certificatesEmptyCta")}
        </Button>
      </div>
      <ol className="relative m-0 grid list-none gap-3 p-0">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-white/80 bg-white/70 p-3.5 shadow-[var(--shadow-xs)] backdrop-blur-[6px]">
            {i === steps.length - 1 ? (
              <AchievementBadge size="sm" />
            ) : (
              <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]">
                <Icon size={18} aria-hidden="true" />
              </span>
            )}
            <span className="grid gap-0.5">
              <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{title}</strong>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
