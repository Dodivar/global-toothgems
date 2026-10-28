import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "../ui/Button";
import { useReveal } from "../../lib/useReveal";

const STAGES = ["discover", "learn", "practice", "create", "grow"] as const;

/**
 * The page's last word, which also carries the progression the marketplace
 * tells in two numbered timelines: "from curiosity to confidence" as one line
 * of five words, then the green way back to the catalogue. The steps of a
 * course itself are on its page.
 */
export function ClosingB({ onExplore }: { onExplore: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="academyb-final-title" className="gt-reveal pb-[clamp(48px,7vw,120px)] pt-[clamp(8px,2vw,24px)] sm:px-[var(--gt-alt-gutter)]">
      <div className="gt-alt-wide gt-academyb-final grid justify-items-center gap-5 px-4 py-[clamp(40px,7vw,96px)] text-center sm:rounded-[var(--radius-xl)] sm:px-[clamp(24px,5vw,80px)]">
        <span aria-hidden="true" className="gt-accent text-[clamp(20px,2.4vw,28px)] text-[var(--gt-blue-700)]">
          {t("academyPage.journey.script")}
        </span>
        <h2 id="academyb-final-title" className="gt-alt-h2 max-w-[18ch] !text-[clamp(28px,3.4vw,52px)]">{t("academyPage.journey.title")}</h2>
        <p className="m-0 max-w-[50ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academyPage.journey.lead")}</p>
        <ol aria-label={t("academyPage.journey.stagesLabel")} className="m-0 flex list-none flex-wrap items-center justify-center gap-x-1.5 gap-y-2 p-0">
          {STAGES.map((stage, i) => (
            <li key={stage} className="inline-flex items-center gap-1.5">
              {/* Arrows only once the five words fit on one line. */}
              {i > 0 && <ChevronRight size={14} aria-hidden="true" className="hidden text-[var(--gt-blue-500)] sm:block" />}
              <span className="rounded-[var(--radius-pill)] bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-[var(--gt-blue-700)]">
                {t(`academyPage.journey.${stage}.title`)}
              </span>
            </li>
          ))}
        </ol>
        <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta mt-2 w-full sm:w-auto" onClick={onExplore}>
          {t("academyPage.final.cta")}
        </Button>
      </div>
    </section>
  );
}
