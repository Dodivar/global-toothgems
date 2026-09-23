import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Award, GraduationCap, Hourglass } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { CertificateCard, PendingCertificateCard } from "../../components/account/CertificateCard";
import { CertificateViewer } from "../../components/account/CertificateViewer";
import { SectionHeader } from "../../components/account/SectionHeader";
import { ReviewRequestCard } from "../../components/reviews/ReviewRequestCard";
import { pick } from "../../data/types";
import { useAuth } from "../../lib/auth";
import { useProgress } from "../../lib/progress";
import { useReviewRequests } from "../../lib/reviews";
import { useToast } from "../../lib/toast";
import { formatDate } from "../../lib/format";

/**
 * The member's certificate collection.
 *
 * Unlocking is derived from progress reaching 100 %, never stored as a flag: a
 * flag would drift the moment a lesson is validated. The page reads the same
 * progress state as the lesson player, so finishing a course adds a certificate
 * here immediately.
 *
 * Three states, all reachable from the seeded demo account: no course at all,
 * courses under way with nothing earned yet, and a collection holding one or
 * more certificates. Each one is designed rather than left to a generic panel.
 */
export function Certificates() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { displayName } = useAuth();
  const { progressFor, enrolledCourses } = useProgress();
  const { showToast } = useToast();
  // A finished training is the natural moment to review it.
  const courseRequest = useReviewRequests().find((r) => r.subject.kind === "course" && r.context === "completed");
  /** Course id of the certificate open in the viewer, or null. */
  const [viewing, setViewing] = useState<string | null>(null);

  const rows = enrolledCourses().map((course) => ({ course, progress: progressFor(course.id) }));
  /** Most recent first: the collection is chronological, not a ranking. */
  const earned = rows
    .filter((row) => row.progress.completed && row.progress.completedOn !== null)
    .sort((a, b) => b.progress.completedOn!.localeCompare(a.progress.completedOn!));
  const pending = rows.filter((row) => !row.progress.completed || row.progress.completedOn === null);

  const [featured, ...rest] = earned;
  const open = viewing ? earned.find((row) => row.course.id === viewing) : undefined;
  const holder = displayName || t("account.eyebrow");

  const download = () => showToast(t("account.toastCertificateTitle"), t("account.toastCertificateBody"), "info");

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
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-5)] rounded-[var(--radius-card)] bg-[var(--surface-inverse)] px-[var(--space-6)] py-[var(--space-5)] text-[var(--text-inverse)]">
            <dl aria-label={t("account.certificateSummaryLabel")} className="m-0 flex items-center gap-4">
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
            <span className="flex items-center gap-2 text-[var(--gt-blue-300)]">
              <span aria-hidden="true">&#10022;</span>
              <span className="gt-script text-[26px] leading-none">{t("account.certificatesTagline")}</span>
            </span>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        /* No course on the account: aspirational, not an error. */
        <section className="grid justify-items-start gap-[var(--space-4)] rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash)] p-[clamp(20px,4vw,40px)]">
          <span className="gt-eyebrow flex items-center gap-2">
            <Award size={13} aria-hidden="true" />
            {t("account.certificatesEmptyEyebrow")}
          </span>
          <h2 className="max-w-[var(--max-width-prose)] text-[length:var(--text-h3)]">
            {t("account.certificatesEmptyTitle")}
          </h2>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("account.certificatesEmpty")}
          </p>
          <Button variant="dark" iconRight={ArrowRight} onClick={() => navigate("/academy")}>
            {t("account.certificatesEmptyCta")}
          </Button>
        </section>
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
              onDownload={download}
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
                      onDownload={download}
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
        <section className="grid justify-items-start gap-[var(--space-4)] rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)]">
          <span className="gt-eyebrow flex items-center gap-2">
            <Award size={13} aria-hidden="true" />
            {t("account.certificatesFeaturedEyebrow")}
          </span>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("account.certificatesNoneYet")}
          </p>
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
              <PendingCertificateCard key={row.course.id} course={row.course} progress={row.progress} lang={lang} />
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
          onDownload={download}
        />
      )}
    </>
  );
}
