import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { pick } from "../../data/types";
import { useFormat } from "../../lib/format";
import type { ProductOffer } from "../../lib/storefrontOffers";

/** The wording of a promotion's badge ("−20 %", "2 achetés, 1 offert"…): `promo.discount.badge.<type>`. */
export function useOfferLabel() {
  const { t } = useTranslation();
  const { formatPrice } = useFormat();
  return (promotion: NonNullable<ProductOffer["promotion"]>): string => {
    const value =
      promotion.type === "percentage"
        ? String(promotion.percent ?? "")
        : promotion.type === "fixed_amount"
          ? formatPrice((promotion.amountCents ?? 0) / 100)
          : promotion.type === "bundle"
            ? formatPrice((promotion.bundleCents ?? 0) / 100)
            : "";
    const key = { percentage: "percentage", fixed_amount: "fixed", buy_x_get_y: "bxgy", free_shipping: "freeShipping", bundle: "bundle", gift: "gift" }[promotion.type];
    return t(`promo.discount.badge.${key}`, { value, buy: promotion.buy ?? 0, get: promotion.get ?? 0 });
  };
}

const pill =
  "inline-flex h-6 max-w-full items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)]";

/** The campaign first (ink), then the promotion (highlight): what a customer sees on a product in the shop window. */
export function OfferBadges({ offer, className }: { offer: ProductOffer | null | undefined; className?: string }) {
  const { i18n } = useTranslation();
  const label = useOfferLabel();
  if (!offer || (!offer.campaign && !offer.promotion)) return null;
  return (
    <span className={clsx("flex flex-col items-start gap-1", className)}>
      {offer.campaign && (
        <span className={clsx(pill, "bg-[var(--gt-ink-900)] text-[var(--gt-white)]")}>
          <Sparkles size={10} aria-hidden="true" className="flex-none" />
          {pick(offer.campaign.title, i18n.language)}
        </span>
      )}
      {offer.promotion && <span className={clsx(pill, "bg-[var(--accent-highlight)] text-[var(--gt-white)]")}>{label(offer.promotion)}</span>}
    </span>
  );
}
