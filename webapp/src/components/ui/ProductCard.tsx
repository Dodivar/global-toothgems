import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Image as ImageIcon } from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";
import { formatPrice } from "../../lib/format";
import { gemAxes, isGemOptionSet } from "../../lib/gemOptions";
import { pick } from "../../data/types";
import type { ProductVariant } from "../../data/products";
import { Stars } from "../reviews/Stars";
import { useSubjectReviews } from "../reviews/ReviewsSection";

/** Named variants shown as chips before the rest collapse into "+n". */
const MAX_VARIANT_CHIPS = 4;

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
  stock?: "in" | "low" | "out";
  /** Purchasable options of the product, shown as a summary under the name. */
  variants?: ProductVariant[];
}

interface ProductCardProps {
  product: ProductCardData;
  /** Destination route. Rendered as a real link so the card is keyboard-reachable. */
  to: string;
  onSave?: (saved: boolean) => void;
  saved?: boolean;
  /** Skip the lazy-load hint for cards that are above the fold. */
  eager?: boolean;
  /**
   * A control laid over the bottom-left of the image, such as a quick add to
   * the cart. Rendered above the stretched link, like the save button, so it
   * stays a sibling of the link rather than nested interactive content.
   */
  quickAction?: ReactNode;
}

export function ProductCard({ product, to, onSave, saved = false, eager = false, quickAction }: ProductCardProps) {
  const { t, i18n } = useTranslation();
  const {
    name, subtitle, price, compareAtPrice, image, hoverImage, imageLabel,
    badge, badgeTone = "highlight", stock = "in", variants = [],
  } = product;

  // Same published reviews as the product page's rating line, so the card and
  // the page can never disagree.
  const subject = useMemo(() => ({ kind: "product" as const, id: product.id }), [product.id]);
  const { summary } = useSubjectReviews(subject);
  const rating = summary.average;
  const reviewCount = summary.count;

  const loading = eager ? undefined : ("lazy" as const);
  // A catalogue row can point at a Storage object that was never uploaded;
  // the placeholder then stands in rather than a broken-image icon.
  const [brokenImage, setBrokenImage] = useState<string | null>(null);
  const showImage = Boolean(image) && brokenImage !== image;

  return (
    <article className="group relative rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-3)] shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-card-hover)] focus-within:-translate-y-[3px] focus-within:shadow-[var(--shadow-card-hover)]">
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
        {quickAction && <span className="absolute bottom-2 left-2 z-10">{quickAction}</span>}
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
        {reviewCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Stars rating={rating} size={12} />
            <span aria-label={t("product.ratingAria", { rating: rating.toFixed(1), count: reviewCount })}>
              {rating.toFixed(1)} ({reviewCount})
            </span>
          </span>
        )}
        <VariantSummary variants={variants} lang={i18n.language} />
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

/**
 * What a product can be bought as, in one quiet line or row. Colours are dots,
 * gem options are the packs and the stone-size range, anything else is a few
 * named chips. Informational only: the card stays a single link, and the
 * customer picks on the product page.
 */
function VariantSummary({ variants, lang }: { variants: ProductVariant[]; lang: string }) {
  const { t } = useTranslation();
  if (variants.length < 2 && !(variants.length === 1 && variants[0].swatch)) return null;

  if (variants.every((v) => v.swatch)) {
    const shown = variants.slice(0, 6);
    return (
      <span className="flex flex-wrap items-center gap-1 pt-0.5" aria-label={t("product.cardColors", { count: variants.length })} role="img">
        {shown.map((v) => (
          <span
            key={v.id}
            aria-hidden="true"
            title={pick(v.name, lang)}
            className={`h-3.5 w-3.5 rounded-full border border-[var(--border-default)] ${v.stock === "out" ? "opacity-40" : ""}`}
            style={{ background: v.swatch }}
          />
        ))}
        {variants.length > shown.length && (
          <span aria-hidden="true" className="text-[11px] text-[var(--text-muted)]">+{variants.length - shown.length}</span>
        )}
      </span>
    );
  }

  if (isGemOptionSet(variants)) {
    const { packs, sizes } = gemAxes(variants);
    const parts = [
      packs.length > 0 ? t("product.cardPacks", { list: packs.join(" · ") }) : null,
      sizes.length > 1 ? t("product.cardSizes", { from: `SS${sizes[0]}`, to: `SS${sizes[sizes.length - 1]}` }) : sizes.length === 1 ? `SS${sizes[0]}` : null,
    ].filter(Boolean);
    return <span className="text-xs text-[var(--text-muted)]">{parts.join(" — ")}</span>;
  }

  const shown = variants.slice(0, MAX_VARIANT_CHIPS);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 p-0 pt-0.5" aria-label={t("product.cardVariants", { count: variants.length })}>
      {shown.map((v) => (
        <li
          key={v.id}
          className={`rounded-[var(--radius-pill)] border border-[var(--border-default)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] ${v.stock === "out" ? "line-through opacity-60" : ""}`}
        >
          {pick(v.name, lang)}
        </li>
      ))}
      {variants.length > shown.length && (
        <li className="px-1 py-0.5 text-[11px] text-[var(--text-muted)]">+{variants.length - shown.length}</li>
      )}
    </ul>
  );
}
