import { useTranslation } from "react-i18next";
import { HeroCarousel } from "../components/homeAlt/HeroCarousel";
import { BestSellersRail } from "../components/homeAlt/BestSellersRail";
import { CategoryMosaic } from "../components/homeAlt/CategoryMosaic";
import { AcademyFeature } from "../components/homeAlt/AcademyFeature";
import { ReviewFeed } from "../components/homeAlt/ReviewFeed";
import { StudioVideoFeature } from "../components/homeAlt/StudioVideoFeature";
import { GiftCardFeature } from "../components/homeAlt/GiftCardFeature";
import { LoyaltyFeature } from "../components/homeAlt/LoyaltyFeature";
import { NewsletterBand } from "../components/homeAlt/NewsletterBand";

/**
 * The alternative home page, at /accueil-b: the same brand, components and
 * content as `/`, composed full width and editorially so the two can be
 * compared side by side. It wears the site's usual header and footer.
 *
 * A visual prototype: nothing on it reaches a backend. Quick-adding a best
 * seller uses the ordinary cart; the newsletter and the Studio film are
 * mock-ups that say so.
 */
export function HomeAlt() {
  const { t } = useTranslation();
  return (
    <div className="gt-alt">
      {/* The carousel's slides are each an h2; the page's own heading names
          what the page is. */}
      <h1 className="sr-only">{t("homeAlt.pageTitle")}</h1>
      <HeroCarousel />
      <BestSellersRail />
      <CategoryMosaic />
      <AcademyFeature />
      <ReviewFeed />
      <StudioVideoFeature />
      <GiftCardFeature />
      <LoyaltyFeature />
      <NewsletterBand />
    </div>
  );
}
