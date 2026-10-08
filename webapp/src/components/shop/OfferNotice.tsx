import { Clock3, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pick } from "../../data/types";
import type { ProductOffer } from "../../lib/storefrontOffers";
import { OfferBadges, useOfferLabel } from "./OfferBadges";

/**
 * On the product page: the campaign and promotion this product is part of, in the customer's own words (title and
 * description as written in the back office), with the time left when it ends soon. Nothing for a product with no
 * running offer.
 */
export function OfferNotice({ offer }: { offer: ProductOffer | null }) {
  const { t, i18n } = useTranslation();
  const label = useOfferLabel();
  if (!offer) return null;
  const { campaign, promotion } = offer;
  const endsIn = promotion?.endsAt ? Math.ceil((Date.parse(promotion.endsAt) - Date.now()) / 86_400_000) : null;
  const title = promotion ? pick(promotion.title, i18n.language) || label(promotion) : "";
  const description = promotion ? pick(promotion.description, i18n.language) : "";
  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] p-3.5" data-testid="offer-notice">
      <OfferBadges offer={offer} className="sm:flex-row sm:flex-wrap" />
      {promotion && (
        <>
          <span className="flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--accent-highlight-ink)]">
            <Tag size={14} aria-hidden="true" className="flex-none" />
            {title}
          </span>
          {description && <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{description}</span>}
          {promotion.conditional && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.shop.conditional")}</span>}
          {endsIn !== null && endsIn >= 0 && endsIn <= 14 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-primary)]">
              <Clock3 size={12} aria-hidden="true" />
              {t("promo.shop.endsIn", { count: Math.max(1, endsIn) })}
            </span>
          )}
        </>
      )}
      {!promotion && campaign && <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{pick(campaign.title, i18n.language)}</span>}
    </div>
  );
}
