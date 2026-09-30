import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import type { Product } from "../../data/products";
import { pick } from "../../data/types";
import { useFavorites } from "../../lib/favorites";

/**
 * The product page's heart, beside "Add to cart". A toggle button: its label
 * names the product and `aria-pressed` carries the state, and the filled heart
 * repeats it for sighted users.
 */
export function FavoriteButton({ product }: { product: Product }) {
  const { t, i18n } = useTranslation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const saved = isFavorite(product);
  const label = t("product.saveAria", { name: pick(product.name, i18n.language) });

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(product)}
      aria-pressed={saved}
      aria-label={label}
      title={saved ? t("favorites.inFavorites") : t("favorites.add")}
      className="relative inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)] active:scale-[0.96]"
    >
      <Heart
        size={22}
        strokeWidth={1.75}
        aria-hidden="true"
        fill={saved ? "var(--accent-highlight)" : "none"}
        color={saved ? "var(--accent-highlight)" : "currentColor"}
      />
    </button>
  );
}
