import { useTranslation } from "react-i18next";
import type { Course } from "../../data/courses";
import { pick } from "../../data/types";
import { formatDate } from "../../lib/format";

/**
 * The certificate itself, drawn as a document rather than shown as a thumbnail.
 *
 * There is no certificate asset to preview in this prototype — the signed PDF is
 * served from private storage and is not part of the mockup (see the download
 * toast). So the page renders the document from the data it actually has: the
 * holder's name, the course, the completion date and the derived reference.
 * Nothing here is invented: no signature, no seal of authority, no accreditation
 * body, no verification registry.
 *
 * Sizing is done in container-query units, so one component serves the card
 * preview and the full-size viewer without a second set of type scales: every
 * length below is a fraction of the document's own width.
 */

export function CertificateDocument({
  course,
  holder,
  awardedOn,
  reference,
  lang,
}: {
  course: Course;
  holder: string;
  awardedOn: string;
  reference: string;
  lang: string;
}) {
  const { t } = useTranslation();

  return (
    /* Decorative as far as assistive technology is concerned: every value shown
       here is repeated as real text by the card and the viewer around it, so
       reading the document too would say everything twice. */
    <div
      aria-hidden="true"
      className="@container relative aspect-[297/210] w-full overflow-hidden bg-[var(--gt-off-white)] text-[var(--text-primary)]"
    >
      {/* Paper: a faint wash from the top-left corner, nothing more. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 8% 0%, var(--gt-blue-50) 0%, transparent 58%), radial-gradient(90% 80% at 100% 100%, rgba(185,205,229,.18) 0%, transparent 60%)",
        }}
      />
      {/* Inner rule: the frame a printed document would have. */}
      <span className="pointer-events-none absolute inset-[3.2cqw] border border-[var(--gt-ink-200)]" />

      <div className="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto] p-[6.4cqw]">
        <header className="flex items-start justify-between gap-[3cqw]">
          <span className="flex items-center gap-[1.4cqw] text-[length:1.45cqw] font-semibold uppercase leading-none tracking-[var(--tracking-logo)] text-[var(--text-primary)]">
            <span className="text-[length:1.9cqw] text-[var(--gt-blue-500)]">&#10022;</span>
            Global Toothgems
          </span>
          <span
            className="text-[length:1.35cqw] uppercase leading-none tracking-[var(--tracking-wide)] text-[var(--text-subtle)]"
            style={{ fontFamily: "var(--gt-font-mono)" }}
          >
            {reference}
          </span>
        </header>

        <div className="grid content-center justify-items-center gap-[1.4cqw] text-center">
          <span className="text-[length:1.5cqw] font-semibold uppercase leading-none tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]">
            {t("account.certificateDocEyebrow")}
          </span>
          <span className="text-[length:1.5cqw] leading-none text-[var(--text-muted)]">
            {t("account.certificateDocAwardedTo")}
          </span>
          <strong className="max-w-full break-words text-[length:6cqw] font-[var(--weight-bold)] leading-[1.05] tracking-[var(--tracking-display)]">
            {holder}
          </strong>
          <span className="my-[0.6cqw] h-px w-[16cqw] bg-[var(--gt-blue-300)]" />
          <span className="text-[length:1.5cqw] leading-none text-[var(--text-muted)]">
            {t("account.certificateDocCompleted")}
          </span>
          <strong className="max-w-[72cqw] break-words text-[length:3cqw] font-[var(--weight-semibold)] leading-[1.2] tracking-[var(--tracking-tight)]">
            {pick(course.title, lang)}
          </strong>
          <span className="text-[length:1.4cqw] uppercase leading-none tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
            {pick(course.level, lang)} &middot; {t("course.lessonCount", { count: course.lessonCount })} &middot;{" "}
            {course.duration}
          </span>
        </div>

        <footer className="flex items-end justify-between gap-[3cqw]">
          <span className="text-[length:1.4cqw] leading-none text-[var(--text-muted)]">
            {t("account.certificateDocIssuedOn", { date: formatDate(awardedOn) })}
          </span>
          {/* The one decorative accent on the document. */}
          <span className="gt-script text-[length:4.2cqw] leading-none text-[var(--gt-blue-500)]">Global Toothgems</span>
        </footer>
      </div>
    </div>
  );
}
