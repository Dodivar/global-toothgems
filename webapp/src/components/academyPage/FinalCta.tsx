import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { photo } from "../../lib/images";
import { useReveal } from "../../lib/useReveal";

const STAGES = ["discover", "learn", "practice", "create", "grow"] as const;

/**
 * The page's last word: "from curiosity to confidence", told by a collage —
 * a smile in an arch with a light sweep, a second smile in a round inset and
 * two gems floating over the blue — beside the promise, the five words of the
 * progression (the last one, "grow", in emerald) and the green way back to the
 * catalogue. On a phone the collage comes first. The steps of a course itself
 * are on its page, so nothing here is numbered.
 */
export function FinalCta({ onExplore }: { onExplore: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="academy-final-title" className="gt-reveal pb-[clamp(48px,7vw,120px)] pt-[clamp(8px,2vw,24px)] sm:px-[var(--gt-alt-gutter)]">
      <div className="gt-alt-wide gt-academy-final relative grid items-center gap-8 overflow-hidden px-4 py-[clamp(40px,6vw,88px)] sm:rounded-[var(--radius-xl)] sm:px-[clamp(24px,5vw,80px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        {/* The collage: three pieces, kept clear of the copy at every width. */}
        <div aria-hidden="true" className="gt-academy-final-art relative mx-auto aspect-[5/4] w-full max-w-[460px] lg:order-2 lg:aspect-square lg:max-w-[520px]">
          <div className="gt-alt-arch gt-sparkle absolute left-[18%] top-0 h-full w-[58%] overflow-hidden border-[6px] border-white shadow-[var(--shadow-lg)]">
            <img src={photo("mouth-03.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
          <span className="gt-alt-float absolute bottom-[4%] right-[2%] block aspect-square w-[34%] overflow-hidden rounded-full border-[5px] border-white shadow-[var(--shadow-lg)]">
            <img src={photo("img-17.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </span>
          <img src={photo("microgems.webp")} alt="" loading="lazy" decoding="async" className="gt-alt-cutout gt-alt-float gt-alt-float--late absolute left-0 top-[8%] w-[20%] max-w-[104px]" />
          <img src={photo("opaline.webp")} alt="" loading="lazy" decoding="async" className="gt-alt-cutout gt-alt-float absolute bottom-[10%] left-[4%] w-[15%] max-w-[80px]" />
          <span className="absolute right-[6%] top-[6%] grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--accent-cta-ink)] shadow-[var(--shadow-sm)]">
            <Sparkles size={20} strokeWidth={1.75} />
          </span>
        </div>

        <div className="grid justify-items-center gap-5 text-center lg:justify-items-start lg:text-left">
          <span aria-hidden="true" className="gt-accent text-[clamp(22px,2.4vw,30px)] text-[var(--gt-blue-700)]">
            {t("academyPage.journey.script")}
          </span>
          <h2 id="academy-final-title" className="gt-alt-h2 max-w-[14ch] !text-[clamp(32px,4vw,60px)]">{t("academyPage.journey.title")}</h2>
          <p className="m-0 max-w-[46ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t("academyPage.journey.lead")}</p>
          <ol aria-label={t("academyPage.journey.stagesLabel")} className="m-0 flex list-none flex-wrap items-center justify-center gap-x-1.5 gap-y-2 p-0 lg:justify-start">
            {STAGES.map((stage, i) => {
              const last = i === STAGES.length - 1;
              return (
                <li key={stage} className="inline-flex items-center gap-1.5">
                  {/* Arrows only once the five words fit on one line. */}
                  {i > 0 && <ChevronRight size={14} aria-hidden="true" className="hidden text-[var(--gt-blue-600)] sm:block" />}
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 py-2 text-[13px] font-semibold shadow-[var(--shadow-sm)]",
                      last ? "bg-[var(--accent-cta)] text-[var(--text-on-accent)]" : "bg-white text-[var(--gt-blue-700)]",
                    )}
                  >
                    {last && <Sparkles size={14} aria-hidden="true" />}
                    {t(`academyPage.journey.${stage}.title`)}
                  </span>
                </li>
              );
            })}
          </ol>
          <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta mt-1 w-full sm:w-auto" onClick={onExplore}>
            {t("academyPage.final.cta")}
          </Button>
        </div>
      </div>
    </section>
  );
}
