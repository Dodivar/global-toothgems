import { useState } from "react";
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
  imageLabel?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  rating?: number;
  reviewCount?: number;
  stock?: "in" | "low" | "out";
}

interface ProductCardProps {
  product: ProductCardData;
  onSelect?: () => void;
  onSave?: (saved: boolean) => void;
  saved?: boolean;
}

export function ProductCard({ product, onSelect, onSave, saved = false }: ProductCardProps) {
  const [hover, setHover] = useState(false);
  const { name, subtitle, price, compareAtPrice, image, imageLabel, badge, badgeTone = "highlight", rating, reviewCount, stock = "in" } = product;

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      className="group cursor-pointer rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-3)] transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]"
      style={{ boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)", transform: hover ? "translateY(-3px)" : "none" }}
    >
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-media)] bg-[var(--surface-sunken)]">
        {image ? (
          <img
            src={image}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-[var(--duration-normal)]"
            style={{ transform: hover ? "scale(1.03)" : "scale(1)" }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-brand-wash)] text-[var(--gt-blue-500)]">
            <ImageIcon size={22} />
            <span className="text-[10px] font-medium uppercase tracking-[var(--tracking-eyebrow)]">{imageLabel ?? "Produit"}</span>
          </div>
        )}
        {badge && (
          <span className="absolute left-2 top-2">
            <Badge tone={badgeTone} size="sm">{badge}</Badge>
          </span>
        )}
        {stock === "low" && (
          <span className="absolute right-2 top-2">
            <Badge tone="warning" size="sm">Stock limité</Badge>
          </span>
        )}
        {stock === "out" && (
          <span className="absolute right-2 top-2">
            <Badge tone="error" size="sm">Épuisé</Badge>
          </span>
        )}
        {onSave && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSave(!saved);
            }}
            aria-label="Favoris"
            className={`gt-glass absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full transition-opacity ${hover || saved ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <Heart size={16} fill={saved ? "var(--accent-highlight)" : "none"} color={saved ? "var(--accent-highlight)" : "currentColor"} />
          </button>
        )}
      </div>
      <div className="grid gap-1 pt-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{name}</h4>
        {subtitle && <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>}
        {rating != null && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Star size={12} fill="var(--gt-ink-900)" color="var(--gt-ink-900)" />
            {rating.toFixed(1)} <span>({reviewCount ?? 0})</span>
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
