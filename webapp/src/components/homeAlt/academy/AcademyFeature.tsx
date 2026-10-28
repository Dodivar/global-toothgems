import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { Button } from "../../ui/Button";
import { AcademyCourseCard } from "../../academy/AcademyCourseCard";
import { useNavigate } from "../../../lib/navigation";
import { useAcademy } from "../../../lib/academy/AcademyProvider";
import { catalogueFigures } from "../../../lib/academy/publicCourse";
import { useReveal } from "../../../lib/useReveal";
import { AcademyCourseRow, AcademyEcosystem, AcademyFigures } from "./AcademyBandParts";

/**
 * The home page's Academy band, "the evening atelier" (chosen by the owner on
 * 2026-10-28 among three proposals). The Academy on the brand's ink, lit by
 * the pastel blue: a two-part statement and the catalogue's real figures
 * beside the first published course (the owner's choice, 2026-10-29: the
 * course itself rather than a photograph), then any other courses and the
 * Global Toothgems world on the same dark band. No price on the home page.
 */
export function AcademyFeature() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { courses } = useAcademy();
  const ref = useReveal<HTMLElement>();
  const figures = catalogueFigures(courses);
  const first = courses[0];

  return (
    <section ref={ref} aria-labelledby="gt-alt-academy-title" className="gt-reveal gt-alt-section gt-alt-academy relative w-full overflow-hidden text-[var(--gt-off-white)]">
      <div aria-hidden="true" className="gt-alt-studio-grid pointer-events-none absolute inset-0" />
      <div className="gt-alt-wide relative px-[var(--gt-alt-gutter)]">
        <div className={clsx("grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:gap-[clamp(48px,6vw,120px)]", first && "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]")}>
          <div className="grid content-start justify-items-start gap-6">
            <span className="gt-eyebrow !text-[var(--gt-blue-300)]">{t("homeAlt.academy.eyebrow")}</span>
            <h2 id="gt-alt-academy-title" className="gt-alt-display max-w-[15ch] !text-[var(--gt-off-white)]">
              {t("homeAlt.academy.titleLead")}{" "}
              <span className="gt-accent block text-[var(--gt-blue-300)]">{t("homeAlt.academy.titleAccent")}</span>
            </h2>
            <p className="m-0 max-w-[54ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">{t("homeAlt.academy.body")}</p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta w-full sm:w-auto" onClick={() => navigate("/academy")}>
              {t("homeAlt.academy.cta")}
            </Button>
            <AcademyFigures figures={figures} className="mt-4 w-full" />
          </div>

          {first && (
            <div className="mx-auto grid w-full max-w-[560px] gap-4">
              <AcademyCourseCard
                course={first}
                lang={i18n.language}
                featured
                badges={[{ label: t("homeAlt.academy.featured"), tone: "brand" }]}
                ctaLabel={t("homeAlt.academy.courseCta")}
              />
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">{t("homeAlt.academy.footnote")}</p>
            </div>
          )}
        </div>

        <AcademyCourseRow courses={courses.slice(1, 4)} className="mt-[clamp(56px,7vw,112px)]" />
        <AcademyEcosystem className="mt-[clamp(64px,8vw,128px)]" />
      </div>
    </section>
  );
}
