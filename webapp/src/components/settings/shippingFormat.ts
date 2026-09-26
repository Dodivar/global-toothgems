import { useTranslation } from "react-i18next";
import { Gift, Store, Truck, Zap, type LucideIcon } from "lucide-react";
import type { RateKind, ShippingRate } from "../../data/adminSettings";
import { useMoney } from "../promotions/PromoBadges";

/**
 * Shipping rules in the words a customer or a colleague would use:
 * "2–4 business days", "Orders from €75", "Up to 2 kg". The zone cards, the
 * destination checker and the rate drawer's checkout preview all read from
 * here, so one rate is never described two ways.
 */

export const RATE_ICON: Record<RateKind, LucideIcon> = {
  standard: Truck,
  express: Zap,
  free: Gift,
  pickup: Store,
};

export function useRateText() {
  const { t } = useTranslation();
  const money = useMoney();

  const kg = (g: number) => `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;

  const delivery = (r: Pick<ShippingRate, "kind" | "minDays" | "maxDays">) => {
    if (r.kind === "pickup") return t("settings.shipping.delivery.pickup", { count: r.maxDays });
    if (r.minDays === r.maxDays) return t("settings.shipping.delivery.exact", { count: r.maxDays });
    return t("settings.shipping.delivery.range", { min: r.minDays, max: r.maxDays });
  };

  const price = (r: Pick<ShippingRate, "priceCents">) => (r.priceCents === 0 ? t("settings.shipping.free") : money(r.priceCents));

  const conditions = (r: ShippingRate): string[] => {
    const out: string[] = [];
    if (r.minOrderCents != null && r.maxOrderCents != null)
      out.push(t("settings.shipping.cond.orderRange", { min: money(r.minOrderCents), max: money(r.maxOrderCents) }));
    else if (r.minOrderCents != null) out.push(t("settings.shipping.cond.orderMin", { amount: money(r.minOrderCents) }));
    else if (r.maxOrderCents != null) out.push(t("settings.shipping.cond.orderMax", { amount: money(r.maxOrderCents) }));
    if (r.minWeightG != null && r.maxWeightG != null)
      out.push(t("settings.shipping.cond.weightRange", { min: kg(r.minWeightG), max: kg(r.maxWeightG) }));
    else if (r.minWeightG != null) out.push(t("settings.shipping.cond.weightMin", { weight: kg(r.minWeightG) }));
    else if (r.maxWeightG != null) out.push(t("settings.shipping.cond.weightMax", { weight: kg(r.maxWeightG) }));
    if (r.freeOverCents != null) out.push(t("settings.shipping.cond.freeOver", { amount: money(r.freeOverCents) }));
    return out;
  };

  return { delivery, price, conditions, money };
}
