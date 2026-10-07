import { GiftCardVisual } from "../promotions/Visuals";
import type { GiftCardDesign } from "../../lib/giftCards/giftCardMapping";
import type { CustomerOrderLine } from "../../data/orders";

/**
 * The picture of an order line in the member area: the product or course photo
 * or, for a gift card, the card in the design the buyer chose (amount only, like
 * the checkout summary), so the history looks like what they paid for.
 */
export function OrderLineThumb({
  line,
  size,
  dimmed = false,
}: {
  line: CustomerOrderLine;
  /** Side of the square photo, in pixels (the card keeps its own ratio, 72px wide). */
  size: 48 | 56;
  dimmed?: boolean;
}) {
  const opacity = dimmed ? 0.5 : 1;
  if (line.giftCardDesign) {
    return (
      <span className="block w-[72px] flex-none" style={{ opacity }}>
        <GiftCardVisual design={line.giftCardDesign as GiftCardDesign} amountCents={line.unitAmount} size="sm" label="" />
      </span>
    );
  }
  const box = size === 48 ? "h-12 w-12" : "h-14 w-14";
  return line.image ? (
    <img src={line.image} alt="" loading="lazy" decoding="async" className={`${box} flex-none rounded-[var(--radius-sm)] object-cover`} style={{ opacity }} />
  ) : (
    <span aria-hidden="true" className={`${box} flex-none rounded-[var(--radius-sm)] bg-[var(--surface-sunken)]`} />
  );
}
