import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Box } from "lucide-react";
import { Button } from "../ui/Button";
import { StudioMockup } from "./StudioMockup";
import { NewTag } from "./NewTag";
import { GemIcon } from "./Gem";
import { formatPrice } from "../../lib/format";
import { useReveal } from "../../lib/useReveal";
import { STUDIO_PRICE } from "../../data/studio";
import { STUDIO_EDITOR_PATH, STUDIO_PATH } from "../../lib/studioUrl";
import { useStudioAccess } from "../../lib/studioAccess";

/**
 * The home page's door into the Studio: one headline, one sentence, the price
 * and one action, beside a live preview. A teaser, not a second landing page —
 * everything else lives on /studio-3d.
 */
export function StudioTeaser() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useReveal<HTMLElement>();
  const access = useStudioAccess();

  return (
    <section ref={ref} aria-labelledby="gt-studio-teaser-title" className="gt-reveal px-[clamp(14px,4vw,48px)] pb-[var(--section-y)]">
      <div className="gt-studio-teaser relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(28px,4vw,56px)] overflow-hidden rounded-[var(--radius-2xl)] p-[clamp(20px,4vw,56px)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="relative grid justify-items-start gap-5">
          <span className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
            <Box size={14} aria-hidden="true" />
            {t("studio.teaser.eyebrow")}
            <NewTag />
          </span>
          <h2 id="gt-studio-teaser-title" className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
            {t("studio.teaser.title")}
          </h2>
          <p className="m-0 max-w-[46ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.teaser.body")}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => navigate(STUDIO_PATH)}>
              {t("studio.teaser.cta")}
            </Button>
            {/* During the free preview the editor is one click away. */}
            {access.granted && (
              <Button variant="outline" size="lg" onClick={() => navigate(STUDIO_EDITOR_PATH)}>
                {t("studio.hero.ctaOpen")}
              </Button>
            )}
            <p className="m-0 flex items-baseline gap-1.5 text-[var(--text-primary)]">
              <strong className="text-[26px] font-[var(--weight-black)]">{formatPrice(STUDIO_PRICE.amount, undefined, STUDIO_PRICE.currency)}</strong>
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">{t("studio.pricing.perMonth")}</span>
            </p>
          </div>
        </div>
        <div className="relative">
          <StudioMockup variant="compact" initial="signature" />
          <span
            aria-hidden="true"
            className="gt-studio-float gt-glass absolute -left-3 top-6 hidden items-center gap-2 rounded-[var(--radius-pill)] py-1.5 pl-1.5 pr-3.5 text-[11.5px] font-semibold text-[var(--gt-ink-900)] sm:inline-flex"
          >
            <GemIcon shape="heart" material="gold" size={24} />
            {t("studio.teaser.chip")}
          </span>
        </div>
      </div>
    </section>
  );
}
