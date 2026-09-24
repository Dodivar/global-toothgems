import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Image as ImageIcon, Star } from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";
import { formatPrice } from "../../lib/format";

export interface ProductCardData {
  id: string;
  name: string;
  subtitle?: string;
  price: number;
  compareAtPrice?: number;
  image?: string;
  /** Second image, crossfaded in on hover. Omitted when the product has no gallery. */
  hoverImage?: string;
  imageLabel?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  rating?: number;
  reviewCount?: number;
  stock?: "in" | "low" | "out";
}

interface ProductCardProps {
  product: ProductCardData;
  /** Destination route. Rendered as a real link so the card is keyboard-reachable. */
  to: string;
  onSave?: (saved: boolean) => void;
  saved?: boolean;
  /** Skip the lazy-load hint for cards that are above the fold. */
  eager?: boolean;
}

export function ProductCard({ product, to, onSave, saved = false, eager = false }: ProductCardProps) {
  const { t } = useTranslation();
  const {
    name, subtitle, price, compareAtPrice, image, hoverImage, imageLabel,
    badge, badgeTone = "highlight", rating, reviewCount, stock = "in",
  } = product;

  const loading = eager ? undefined : ("lazy" as const);
  // A catalogue row can point at a Storage object that was never uploaded;
  // the placeholder then stands in rather than a broken-image icon.
  const [brokenImage, setBrokenImage] = useState<string | null>(null);
  const showImage = Boolean(image) && brokenImage !== image;

  return (
    <article className="group relative rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-3)] shadow-[var(--shadow-xs)] transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)] focus-within:-translate-y-[3px] focus-within:shadow-[var(--shadow-md)]">
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-media)] bg-[var(--surface-sunken)]">
        {showImage ? (
          <>
            <img
              src={image}
              alt=""
              loading={loading}
              decoding="async"
              onError={() => setBrokenImage(image ?? null)}
              className="h-full w-full object-cover transition-transform duration-[var(--duration-normal)] group-hover:scale-[1.03] group-focus-within:scale-[1.03]"
            />
            {hoverImage && (
              <img
                src={hoverImage}
                alt=""
                loading="lazy"
                decoding="async"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-[var(--duration-normal)] group-hover:opacity-100 group-focus-within:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-brand-wash)] text-[var(--gt-blue-500)]">
            <ImageIcon size={22} />
            <span className="text-[10px] font-medium uppercase tracking-[var(--tracking-eyebrow)]">
              {imageLabel ?? t("product.imagePlaceholder")}
            </span>
          </div>
        )}
        {badge && (
          <span className="absolute left-2 top-2">
            <Badge tone={badgeTone} size="sm">{badge}</Badge>
          </span>
        )}
        {stock === "low" && (
          <span className="absolute right-2 top-2">
            <Badge tone="warning" size="sm">{t("product.stockLow")}</Badge>
          </span>
        )}
        {stock === "out" && (
          <span className="absolute right-2 top-2">
            <Badge tone="error" size="sm">{t("product.stockOut")}</Badge>
          </span>
        )}
        {onSave && (
          /* z-10 keeps this above the stretched link below; it must stay a sibling
             of that link rather than a child, or it would be nested interactive content. */
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSave(!saved);
            }}
            aria-label={t("product.saveAria", { name })}
            aria-pressed={saved}
            className={`gt-glass absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-opacity focus-visible:opacity-100 ${saved ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
          >
            <Heart size={16} fill={saved ? "var(--accent-highlight)" : "none"} color={saved ? "var(--accent-highlight)" : "currentColor"} />
          </button>
        )}
      </div>
      <div className="grid gap-1 pt-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          {/* Stretched link: the ::after covers the whole card, so the entire
              surface stays clickable by mouse while the keyboard gets one real stop. */}
          <Link
            to={to}
            className="rounded-[var(--radius-xs)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
          >
            {name}
          </Link>
        </h4>
        {subtitle && <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>}
        {rating != null && (reviewCount ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Star size={12} fill="var(--gt-ink-900)" color="var(--gt-ink-900)" aria-hidden="true" />
            <span aria-label={t("product.ratingAria", { rating: rating.toFixed(1), count: reviewCount ?? 0 })}>
              {rating.toFixed(1)} ({reviewCount ?? 0})
            </span>
          </span>
        )}
        <span className="flex items-baseline gap-2 pt-0.5">
          <strong className="text-[15px] font-bold text-[var(--text-primary)]">{formatPrice(price)}</strong>
          {compareAtPrice && (
            <span className="text-xs text-[var(--text-subtle)] line-through">{formatPrice(compareAtPrice)}</span>
          )}
        </span>
      </div>
    </article>
  );
}
