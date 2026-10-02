import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { ArrowRight, Gem, Palette, ShieldCheck, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { AcademyCourseCard } from "../academy/AcademyCourseCard";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import { useReveal } from "../../lib/useReveal";

const PILLARS = [
  { key: "pillar1", icon: Sparkles },
  { key: "pillar2", icon: Gem },
  { key: "pillar3", icon: ShieldCheck },
  { key: "pillar4", icon: Palette },
] as const;

/**
 * The Academy as an aspiration rather than a catalogue: a large statement,
 * what the training covers, then the published courses as editorial cards
 * (none shown until one is online). No course price is shown on the home
 * page — the price belongs to the training's own page, which every card opens.
 */
export function AcademyFeature() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { courses } = useAcademy();
  const ref = useReveal<HTMLElement>();
  const lang = i18n.language;

  return (
    <section ref={ref} aria-labelledby="gt-alt-academy-title" className="gt-reveal gt-alt-section gt-alt-academy w-full">
      <div className="gt-alt-wide px-[var(--gt-alt-gutter)]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-[clamp(48px,7vw,140px)]">
          <div className="grid content-start justify-items-start gap-6">
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.academy.eyebrow")}</span>
            <h2 id="gt-alt-academy-title" className="gt-alt-display max-w-[14ch]">
              {t("homeAlt.academy.title")}
            </h2>
            <p className="m-0 max-w-[56ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("homeAlt.academy.body")}</p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta max-sm:!h-auto max-sm:min-h-14 max-sm:py-3 max-sm:!whitespace-normal max-sm:text-center" onClick={() => navigate("/academy")}>
              {t("homeAlt.academy.cta")}
            </Button>
          </div>

          <div className="grid content-end">
            <h3 className="gt-eyebrow mb-2">{t("homeAlt.academy.pillarsLabel")}</h3>
            <ul className="m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-1">
              {PILLARS.map(({ key, icon: Icon }, i) => (
                <li key={key} className="grid grid-cols-[auto_1fr] items-start gap-4 border-t border-[var(--gt-ink-200)] py-4 sm:py-5 sm:pr-6 lg:pr-0">
                  <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-white)] text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]">
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <span className="grid gap-1">
                    <span className="flex items-baseline gap-3 text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">
                      <span aria-hidden="true" className="text-[11px] font-semibold tabular-nums tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]">
                        0{i + 1}
                      </span>
                      {t(`homeAlt.academy.${key}Title`)}
                    </span>
                    <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`homeAlt.academy.${key}Body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {courses.length > 0 && (
          <div className="mt-[clamp(56px,7vw,112px)]">
            <h3 className="gt-alt-h3 mb-6">{t("homeAlt.academy.coursesTitle")}</h3>
            {/* Phone: a swiped row that runs to the screen edge. */}
            <ul className="gt-scroller gt-alt-snap-pad -mx-[var(--gt-alt-gutter)] my-0 flex list-none gap-4 px-[var(--gt-alt-gutter)] pb-4 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
              {courses.slice(0, 3).map((course, i) => (
                <li key={course.id} className={clsx("w-[82%] max-w-[360px] flex-none snap-start md:w-auto md:max-w-none", i === 0 && "md:col-span-2 lg:col-span-1")}>
                  <AcademyCourseCard
                    course={course}
                    lang={lang}
                    featured={i === 0}
                    heading="h4"
                    badges={i === 0 ? [{ label: t("homeAlt.academy.featured"), tone: "brand" }] : []}
                    ctaLabel={t("homeAlt.academy.courseCta")}
                  />
                </li>
              ))}
            </ul>
            <p className="m-0 mt-7 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("homeAlt.academy.footnote")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
