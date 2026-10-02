import { useTranslation } from "react-i18next";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "../ui/Button";
import { useReveal } from "../../lib/useReveal";

/** The page's last word: back to the catalogue, or to the starting-point picker. */
export function FinalCta({ onExplore, onFindStart }: { onExplore: () => void; onFindStart?: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="academy-final-title" className="gt-reveal px-[var(--gt-alt-gutter)] pb-[clamp(64px,8vw,136px)]">
      <div className="gt-alt-wide gt-academy-final relative grid justify-items-center gap-5 overflow-hidden rounded-[var(--radius-xl)] px-[clamp(20px,5vw,80px)] py-[clamp(48px,7vw,104px)] text-center">
        <span aria-hidden="true" className="gt-accent text-[clamp(20px,2.4vw,30px)] text-[var(--gt-blue-700)]">
          {t("academyPage.final.script")}
        </span>
        <h2 id="academy-final-title" className="gt-alt-h2 max-w-[18ch]">{t("academyPage.final.title")}</h2>
        <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("academyPage.final.body")}</p>
        <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta" onClick={onExplore}>
            {t("academyPage.final.cta")}
          </Button>
          {onFindStart && (
            <Button variant="glass" size="lg" iconLeft={Compass} onClick={onFindStart}>
              {t("academyPage.final.ctaSecondary")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
