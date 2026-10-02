import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/Button";
import { photo } from "../../lib/images";
import { useReveal } from "../../lib/useReveal";

const STAGES = ["discover", "learn", "practice", "create", "grow"] as const;

/**
 * "From curiosity to confidence": the emotional and professional arc of
 * learning, told as five stages on the page's one dark band. It sells the
 * progression — skill, assurance, creativity — not a course's contents.
 * The line between the stages draws itself once revealed (instantly under
 * reduced motion).
 */
export function JourneyBand({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="academy-journey-title" className="gt-reveal gt-academy-journey gt-alt-section relative overflow-hidden text-[var(--gt-ink-300)]">
      <div className="gt-alt-wide relative grid gap-[clamp(40px,5vw,80px)] px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)] lg:items-center">
        <div className="grid gap-[clamp(32px,4vw,56px)]">
          <div className="grid gap-4">
            <span className="gt-eyebrow !text-[var(--gt-blue-300)]">{t("academyPage.journey.eyebrow")}</span>
            <span aria-hidden="true" className="gt-accent -mb-2 text-[clamp(20px,2.2vw,28px)] text-[var(--gt-blue-300)]">
              {t("academyPage.journey.script")}
            </span>
            <h2 id="academy-journey-title" className="gt-alt-h2 max-w-[16ch] !text-[var(--gt-off-white)]">{t("academyPage.journey.title")}</h2>
            <p className="m-0 max-w-[54ch] text-[length:var(--text-body-lg)]">{t("academyPage.journey.lead")}</p>
          </div>
          <ol aria-label={t("academyPage.journey.stagesLabel")} className="gt-academy-stages m-0 grid list-none gap-6 p-0 sm:grid-cols-5 sm:gap-4">
            {STAGES.map((stage, i) => (
              <li key={stage} className="gt-academy-stage relative grid content-start gap-2 pl-12 sm:pl-0 sm:pt-12">
                <span aria-hidden="true" className="gt-academy-stage-dot absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold tabular-nums">
                  {i + 1}
                </span>
                <h3 className="text-[length:var(--text-h4)] font-bold text-[var(--gt-off-white)]">{t(`academyPage.journey.${stage}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)]">{t(`academyPage.journey.${stage}.body`)}</p>
              </li>
            ))}
          </ol>
          <div>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta" onClick={onStart}>
              {t("academyPage.journey.cta")}
            </Button>
          </div>
        </div>
        <div className="relative mx-auto hidden w-full max-w-[420px] lg:block">
          <div className="gt-alt-arch gt-alt-frame aspect-[3/4] overflow-hidden">
            <img src={photo("mouth-03.jpg")} alt={t("academyPage.journey.imageAlt")} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}
