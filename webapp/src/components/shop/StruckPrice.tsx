import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../lib/format";

/**
 * A struck-out price. Only ever the reference price the database computed (decision 129, Omnibus: the lowest price
 * of the 30 days before the reduction), never a typed or derived one — callers pass `offerPrice(...).was`. Screen
 * readers hear "Reference price: …" instead of an unexplained second amount.
 */
export function StruckPrice({ value, currency, className }: { value: number; currency?: string; className?: string }) {
  const { t } = useTranslation();
  const { formatPrice } = useFormat();
  return (
    <s className={clsx("no-underline", className)} title={t("promo.reference.hint")}>
      <span className="sr-only">{t("promo.reference.struckLabel")} </span>
      <span className="line-through">{formatPrice(value, undefined, currency)}</span>
    </s>
  );
}
