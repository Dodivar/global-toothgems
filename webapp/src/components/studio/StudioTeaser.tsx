import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Box } from "lucide-react";
import { Button } from "../ui/Button";
import { StudioIntroVideo } from "./StudioIntroVideo";
import { NewTag } from "./NewTag";
import { formatPrice } from "../../lib/format";
import { useReveal } from "../../lib/useReveal";
import { STUDIO_PRICE } from "../../data/studio";
import { STUDIO_EDITOR_PATH, STUDIO_PATH } from "../../lib/studioUrl";
import { useStudioAccess } from "../../lib/studioAccess";

/**
 * The home page's door into the Studio: one headline, one sentence, then a
 * short screen recording of the editor, with the price and one action under
 * it. A teaser, not a second landing page — everything else lives on /studio-3d.
 */
export function StudioTeaser() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useReveal<HTMLElement>();
  const access = useStudioAccess();

  return (
    <section ref={ref} aria-labelledby="gt-studio-teaser-title" className="gt-reveal px-[clamp(14px,4vw,48px)] pb-[var(--section-y)]">
      <div className="gt-studio-teaser relative mx-auto grid max-w-[var(--max-width-content)] justify-items-center gap-[clamp(24px,3.5vw,40px)] overflow-hidden rounded-[var(--radius-2xl)] p-[clamp(20px,4vw,56px)] shadow-[var(--shadow-card)]">
        <div className="relative grid justify-items-center gap-4 text-center">
          <span className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
            <Box size={14} aria-hidden="true" />
            {t("studio.teaser.eyebrow")}
            <NewTag />
          </span>
          <h2 id="gt-studio-teaser-title" className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
            {t("studio.teaser.title")}
          </h2>
          <p className="m-0 max-w-[56ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.teaser.body")}</p>
        </div>
        <div className="relative w-full max-w-[1040px]">
          <StudioIntroVideo />
        </div>
        <div className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
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
    </section>
  );
}
