import { useTranslation } from "react-i18next";
import { Award } from "lucide-react";
import { CertificateCard } from "../../components/account/CertificateCard";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { useProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";

/**
 * Attestations. Unlocking is derived from progress reaching 100 %, never stored
 * as a flag: a flag would drift the moment a lesson is validated.
 */
export function Certificates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { progressFor, enrolledCourses } = useProgress();
  const { showToast } = useToast();

  const enrolled = enrolledCourses();

  return (
    <section className="grid gap-5">
      <SectionHeader
        icon={Award}
        eyebrow={t("account.certificatesEyebrow")}
        title={t("account.certificatesTitle")}
        description={t("account.certificatesBody")}
      />
      {enrolled.length === 0 ? (
        <EmptyPanel>{t("account.certificatesEmpty")}</EmptyPanel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {enrolled.map((course) => (
            <CertificateCard
              key={course.id}
              course={course}
              progress={progressFor(course.id)}
              lang={lang}
              onDownload={() => showToast(t("account.toastCertificateTitle"), t("account.toastCertificateBody"), "info")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
