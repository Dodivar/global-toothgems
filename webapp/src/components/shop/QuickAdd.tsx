import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus } from "lucide-react";
import { pick } from "../../data/types";
import type { Product } from "../../data/products";
import { useCart } from "../../lib/cart";
import { toMinorUnits } from "../../lib/catalog/money";
import { useToast } from "../../lib/toast";

/** How long the button says "Added" before offering itself again. */
const ADDED_MS = 1800;

/**
 * One-tap add to the cart, laid over a product card's image.
 *
 * Nothing here decides a price — the cart line carries the catalogue's display
 * price and checkout recomputes it server-side. The look belongs to the
 * caller, through `className`; the label sits in its own span so a layout can
 * hide it and keep the icon.
 */
export function QuickAdd({ product, name, className }: { product: Product; name: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const { addLine } = useCart();
  const { showToast } = useToast();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(false), ADDED_MS);
    return () => window.clearTimeout(id);
  }, [added]);

  const variant = product.variants?.[0];

  return (
    <button
      type="button"
      aria-label={t("product.quickAddAria", { name })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addLine({
          productId: product.id,
          dbProductId: product.dbId,
          variantId: variant?.id,
          variant: variant ? pick(variant.name, i18n.language) : undefined,
          name,
          image: variant?.image ?? product.image,
          unitPrice: toMinorUnits(variant?.price ?? product.price),
          currency: product.currency ?? "EUR",
          qty: 1,
        });
        setAdded(true);
        showToast(t("product.quickAddToastTitle"), t("product.quickAddToastBody", { name }));
      }}
      className={className}
      data-added={added}
    >
      {added ? <Check size={15} strokeWidth={2.5} className="text-[var(--accent-cta-ink)]" /> : <Plus size={15} strokeWidth={2.5} />}
      <span className="gt-quickadd-label">{added ? t("product.quickAddDone") : t("product.quickAdd")}</span>
    </button>
  );
}
