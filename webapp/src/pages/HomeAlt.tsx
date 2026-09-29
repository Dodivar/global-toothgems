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
 * The home page, at /: the brand's storefront composed full width and
 * editorially. It wears the site's usual header and footer.
 *
 * Nothing on it reaches a backend of its own. Quick-adding a best seller uses
 * the ordinary cart; the newsletter is a mock-up that says so.
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
