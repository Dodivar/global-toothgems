import { useTranslation } from "react-i18next";
import { ArrowRight, Award, ListChecks, MonitorPlay, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "../../ui/Button";
import { useNavigate } from "../../../lib/navigation";
import { photo } from "../../../lib/images";
import { useAcademy } from "../../../lib/academy/AcademyProvider";
import { catalogueFigures } from "../../../lib/academy/publicCourse";
import { useReveal } from "../../../lib/useReveal";
import { AcademyCourseRow, AcademyEcosystem, AcademyFigures } from "./AcademyBandParts";

/**
 * Proposal B — "the pastel path". The Academy on the brand's pastel blue,
 * the colour the storefront cards float on: the statement beside a collage of
 * real placements, the path a learner walks (each step shown only when the
 * catalogue offers it), then the courses and the Global Toothgems world.
 */
export function AcademyFeaturePastel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { courses } = useAcademy();
  const ref = useReveal<HTMLElement>();
  const figures = catalogueFigures(courses);

  const steps = [
    { key: "step1", icon: MonitorPlay },
    figures.checks > 0 && { key: "step2", icon: ListChecks },
    figures.certificate && { key: "step3", icon: Award },
    figures.certificate && { key: "step4", icon: Sparkles },
  ].filter((step): step is { key: string; icon: LucideIcon } => Boolean(step));

  return (
    <section ref={ref} aria-labelledby="gt-alt-academy-title" className="gt-reveal gt-alt-section gt-alt-academy-pastel relative w-full overflow-hidden">
      <div className="gt-alt-wide relative px-[var(--gt-alt-gutter)]">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] lg:gap-[clamp(48px,6vw,120px)]">
          <div className="grid content-start justify-items-start gap-6">
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.academy.eyebrow")}</span>
            <h2 id="gt-alt-academy-title" className="gt-alt-display max-w-[15ch]">
              {t("homeAlt.academy.pastel.titleLead")}{" "}
              <span className="gt-accent block text-[var(--gt-blue-700)]">{t("homeAlt.academy.pastel.titleAccent")}</span>
            </h2>
            <p className="m-0 max-w-[54ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("homeAlt.academy.pastel.body")}</p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta w-full sm:w-auto" onClick={() => navigate("/academy")}>
              {t("homeAlt.academy.cta")}
            </Button>
          </div>

          {/* Three real placements, staggered, with two loose gems in the air. */}
          <div aria-hidden="true" className="relative mx-auto grid w-full max-w-[560px] grid-cols-[1fr_1.25fr] items-center gap-3 sm:gap-4">
            <div className="grid gap-3 sm:gap-4">
              <span className="block aspect-square overflow-hidden rounded-full border-4 border-white shadow-[var(--shadow-card)]">
                <img src={photo("mouth-02.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </span>
              <span className="block aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] border-4 border-white shadow-[var(--shadow-card)]">
                <img src={photo("mouth-03.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </span>
            </div>
            <span className="gt-alt-arch block aspect-[3/4] overflow-hidden border-4 border-white shadow-[var(--shadow-lg)]">
              <img src={photo("img-12.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </span>
            <img src={photo("img-05.jpg")} alt="" className="gt-alt-cutout gt-alt-float absolute -right-[2%] -top-[6%] w-[18%] max-w-[96px]" />
            <img src={photo("img-20.jpg")} alt="" className="gt-alt-cutout gt-alt-float gt-alt-float--late absolute -bottom-[6%] left-[34%] w-[16%] max-w-[84px]" />
          </div>
        </div>

        <div className="mt-[clamp(48px,6vw,96px)] grid gap-6">
          <h3 className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.academy.pastel.journeyLabel")}</h3>
          <ol className="gt-alt-path m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {steps.map(({ key, icon: Icon }, i) => (
              <li key={key} className="relative grid content-start gap-2 rounded-[var(--radius-xl)] border border-white/80 bg-white/70 p-4 sm:gap-3 sm:p-[clamp(18px,2vw,28px)] shadow-[var(--shadow-sm)] backdrop-blur-sm">
                <span className="flex items-center justify-between">
                  <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-inverse)] text-[var(--gt-blue-300)]">
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <span aria-hidden="true" className="text-[24px] font-[var(--weight-black)] leading-none tabular-nums text-[var(--gt-blue-300)] sm:text-[32px]">0{i + 1}</span>
                </span>
                <span className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">{t(`homeAlt.academy.pastel.${key}Title`)}</span>
                <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`homeAlt.academy.pastel.${key}Body`)}</span>
              </li>
            ))}
          </ol>
          <AcademyFigures figures={figures} tone="light" className="mt-2" />
        </div>

        <AcademyCourseRow tone="light" className="mt-[clamp(56px,7vw,112px)]" />
        <AcademyEcosystem tone="light" className="mt-[clamp(64px,8vw,128px)]" />
      </div>
    </section>
  );
}
