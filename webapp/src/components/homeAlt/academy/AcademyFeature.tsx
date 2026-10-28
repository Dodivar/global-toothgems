import { useTranslation } from "react-i18next";
import { ArrowRight, Award, PlayCircle } from "lucide-react";
import { Button } from "../../ui/Button";
import { useNavigate } from "../../../lib/navigation";
import { photo } from "../../../lib/images";
import { pick } from "../../../data/types";
import { useAcademy } from "../../../lib/academy/AcademyProvider";
import { catalogueFigures, lessonCount } from "../../../lib/academy/publicCourse";
import { useReveal } from "../../../lib/useReveal";
import { AcademyCourseRow, AcademyEcosystem, AcademyFigures } from "./AcademyBandParts";

/**
 * The home page's Academy band, "the evening atelier" (chosen by the owner on
 * 2026-10-28 among three proposals). The Academy on the brand's ink, lit by
 * the pastel blue: a two-part statement, the catalogue's real figures, an
 * arched portrait carrying the first course and its certificate, then the
 * courses and the Global Toothgems world on the same dark band.
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
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] lg:gap-[clamp(48px,6vw,120px)]">
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

          <div className="relative mx-auto w-full max-w-[520px] pb-10 lg:pb-0">
            <div className="gt-alt-arch gt-alt-frame relative mx-auto aspect-[4/5] w-[82%] overflow-hidden">
              <img src={photo("img-12.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
            {first && (
              <div className="gt-alt-float absolute bottom-0 left-0 grid max-w-[78%] grid-cols-[auto_1fr] items-center gap-3 rounded-[var(--radius-lg)] border border-white/20 bg-white/10 p-3 pr-5 shadow-[var(--shadow-lg)] backdrop-blur-md sm:left-[-2%] lg:bottom-[8%] lg:left-[-10%]">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--text-on-accent)]">
                  <PlayCircle size={22} strokeWidth={1.75} />
                </span>
                <span className="grid gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-300)]">
                    {t("homeAlt.academy.courseChip", { lessons: t("course.lessonCount", { count: lessonCount(first) }) })}
                  </span>
                  <span className="text-[15px] font-bold leading-tight">{pick(first.title, i18n.language)}</span>
                </span>
              </div>
            )}
            {figures.certificate && (
              <span className="gt-alt-float gt-alt-float--late absolute right-0 top-[10%] inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gt-off-white)] px-4 py-2.5 text-[13px] font-semibold text-[var(--gt-ink-900)] shadow-[var(--shadow-lg)] lg:right-[-4%]">
                <Award size={16} strokeWidth={1.9} aria-hidden="true" className="text-[var(--gt-emerald-600)]" />
                {t("homeAlt.academy.certificateChip")}
              </span>
            )}
          </div>
        </div>

        <AcademyCourseRow className="mt-[clamp(56px,7vw,112px)]" />
        <AcademyEcosystem className="mt-[clamp(64px,8vw,128px)]" />
      </div>
    </section>
  );
}
