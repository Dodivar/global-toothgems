import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowRight } from "lucide-react";
import { Badge } from "../ui/Badge";
import { CertificateDocument } from "../account/CertificateDocument";
import { sampleCertificateRef } from "../account/CertificateCard";
import { CheckItem } from "./TrainingPrimitives";
import { pick } from "../../data/types";
import { lessonCount, type PublicCourse } from "../../lib/academy/publicCourse";
import { formatDuration } from "../../lib/trainingFilters";

/**
 * The reward at the end of the training, shown as the document itself.
 *
 * This is the same `CertificateDocument` the member area issues — not a
 * lookalike — filled with the visitor's own name once they are signed in and
 * with a placeholder otherwise, and labelled as a preview. Rendering the real
 * component is what keeps the promise honest: what is drawn here is exactly
 * what lands in the account.
 */
export function DiplomaPanel({
  course,
  lang,
  holder,
  signedIn,
}: {
  course: PublicCourse;
  lang: string;
  holder: string;
  signedIn: boolean;
}) {
  const { t } = useTranslation();
  // Dated today: a preview of the document as it would be issued now.
  const previewDate = new Date().toISOString().slice(0, 10);
  const lessons = lessonCount(course);
  const printed = {
    title: course.title,
    level: t(`academy.levels.${course.level}`),
    lessonCount: lessons,
    duration: formatDuration(course.minutes, lang),
  };

  return (
    <div className="grid items-center gap-[clamp(28px,4vw,56px)] lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
      <div className="grid gap-6">
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">
          {t("training.diplomaLead")}
        </p>
        <ul className="m-0 grid list-none gap-3 p-0">
          <CheckItem dark>{t("training.diplomaPoint1", { count: lessons })}</CheckItem>
          <CheckItem dark>{t("training.diplomaPoint2", { score: course.minScore })}</CheckItem>
          <CheckItem dark>{t("training.diplomaPoint3")}</CheckItem>
          <CheckItem dark>{t("training.diplomaPoint4")}</CheckItem>
        </ul>
        {signedIn && (
          <Link
            to="/compte/attestations"
            className="inline-flex w-fit items-center gap-2 border-b border-white/30 pb-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--gt-off-white)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--accent-cta)] hover:text-[var(--accent-cta)]"
          >
            {t("training.diplomaCta")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </div>

      <figure className="m-0 grid gap-3 justify-items-center">
        {/* Mounted the way the member area mounts it: a mat, a hairline, and
            the document itself carrying no elevation of its own. */}
        <div
          className="gt-diploma w-full max-w-[560px] overflow-hidden rounded-[var(--radius-sm)] bg-[var(--gt-white)] p-[3%] shadow-[var(--shadow-lg)]"
          role="img"
          aria-label={t("training.diplomaDocAria", { title: pick(course.title, lang) })}
        >
          <div className="overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--gt-ink-200)]">
            <CertificateDocument
              course={printed}
              holder={holder}
              awardedOn={previewDate}
              reference={sampleCertificateRef(course.id, previewDate)}
              lang={lang}
            />
          </div>
        </div>
        <figcaption>
          <Badge tone="ink" size="sm">
            {t("training.diplomaPreviewLabel")}
          </Badge>
        </figcaption>
      </figure>
    </div>
  );
}
