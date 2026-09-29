import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Image as ImageIcon, Star } from "lucide-react";
import { Badge } from "../ui/Badge";
import { QuickAdd } from "../shop/QuickAdd";
import { canQuickAdd } from "../../lib/quickAdd";
import { useSubjectReviews } from "../reviews/ReviewsSection";
import { formatPrice } from "../../lib/format";
import { pick } from "../../data/types";
import type { Product } from "../../data/products";

interface StorefrontCardProps {
  product: Product;
  source: "supabase" | "mock";
  saved: boolean;
  onSave: (saved: boolean) => void;
  /** Skip the lazy-load hint for cards that are above the fold. */
  eager?: boolean;
}

/**
 * Product card of the alternative shop (/boutique-b).
 *
 * The image does the selling, so it takes the card's full width with no inner
 * frame; the text underneath reads in the order people decide in — what kind
 * of product, which one, how much, can I have it now. Stock is spelled out in
 * words next to the price rather than carried by a colour, and a sold-out
 * product dims its photo as well.
 *
 * Where there is a pointer, the add-to-cart bar slides up over the photo on
 * hover or keyboard focus; on touch screens it is a small "+" that is always
 * there. Products that need an option picked say so instead, and the card's
 * link — one tab stop covering the whole surface — takes the shopper to the
 * page where the choice is made.
 */
export function StorefrontCard({ product, source, saved, onSave, eager = false }: StorefrontCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const name = pick(product.name, lang);
  const subtitle = pick(product.subtitle, lang);
  const stock = product.stock ?? "in";
  const quickAdd = canQuickAdd(product, source);
  const hoverImage = product.gallery?.[1]?.src;

  // Same published reviews as the product page's rating line.
  const subject = useMemo(() => ({ kind: "product" as const, id: product.id }), [product.id]);
  const { summary } = useSubjectReviews(subject);

  const [brokenImage, setBrokenImage] = useState<string | null>(null);
  const showImage = Boolean(product.image) && brokenImage !== product.image;

  return (
    <article
      className="gt-shopb-card group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
      data-stock={stock}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--surface-card)]">
        {showImage ? (
          <>
            <img
              src={product.image}
              alt=""
              loading={eager ? undefined : "lazy"}
              decoding="async"
              onError={() => setBrokenImage(product.image)}
              className="gt-shopb-card-img h-full w-full object-cover"
            />
            {hoverImage && (
              <img
                src={hoverImage}
                alt=""
                loading="lazy"
                decoding="async"
                aria-hidden="true"
                className="gt-shopb-card-img-alt absolute inset-0 h-full w-full object-cover"
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-brand-wash)] text-[var(--gt-blue-500)]">
            <ImageIcon size={22} aria-hidden="true" />
            <span className="text-[10px] font-medium uppercase tracking-[var(--tracking-eyebrow)]">{t("product.imagePlaceholder")}</span>
          </div>
        )}

        {(product.badge || stock === "out") && (
          <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
            {product.badge && (
              <Badge tone={product.badgeTone ?? "highlight"} size="sm">
                {pick(product.badge, lang)}
              </Badge>
            )}
            {stock === "out" && (
              <Badge tone="neutral" size="sm">
                {t("shopAlt.availability.out")}
              </Badge>
            )}
          </span>
        )}

        {/* z-10 keeps the controls above the stretched link; they stay its
            siblings so no interactive element is nested inside another. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSave(!saved);
          }}
          aria-label={t("product.saveAria", { name })}
          aria-pressed={saved}
          data-saved={saved}
          className="gt-shopb-save gt-glass absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[var(--gt-ink-900)]"
        >
          <Heart
            size={16}
            aria-hidden="true"
            fill={saved ? "var(--accent-highlight)" : "none"}
            color={saved ? "var(--accent-highlight)" : "currentColor"}
          />
        </button>

        {quickAdd ? (
          <QuickAdd
            product={product}
            name={name}
            className="gt-shopb-quickadd absolute z-10 inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]"
          />
        ) : (
          stock !== "out" && (
            // The card's own link already goes to the product page; this only
            // says what clicking will do, so it is not a second tab stop.
            <span
              aria-hidden="true"
              className="gt-shopb-options pointer-events-none absolute inset-x-2.5 bottom-2.5 z-10 items-center justify-center rounded-[var(--radius-pill)] text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]"
            >
              {t("shopAlt.chooseOptions")}
            </span>
          )
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3 pb-3.5 pt-3 sm:px-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {product.cat ? t(`shop.categories.${product.cat}`) : subtitle}
          </span>
          {summary.count > 0 && (
            <span
              className="flex flex-none items-center gap-0.5 text-[11px] font-semibold text-[var(--text-body)]"
              aria-label={t("shopAlt.ratingAria", { rating: summary.average.toFixed(1), count: summary.count })}
              role="img"
            >
              <Star size={11} aria-hidden="true" fill="var(--gt-ink-900)" strokeWidth={0} />
              {summary.average.toFixed(1)}
            </span>
          )}
        </div>
        <h3 className="m-0 line-clamp-2 text-[14px] font-semibold leading-[var(--leading-snug)] text-[var(--text-primary)]">
          {/* Stretched link: the ::after covers the whole card. */}
          <Link
            to={`/boutique/${product.id}`}
            className="rounded-[var(--radius-xs)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {name}
          </Link>
        </h3>
        {product.cat && subtitle && (
          <span className="truncate text-xs text-[var(--text-muted)]">{subtitle}</span>
        )}
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-1.5">
          <span className="flex items-baseline gap-1.5">
            <strong className="text-[15px] font-bold text-[var(--text-primary)]">{formatPrice(product.price)}</strong>
            {product.compareAtPrice && (
              <span className="text-xs text-[var(--text-subtle)] line-through">{formatPrice(product.compareAtPrice)}</span>
            )}
          </span>
          <Availability stock={stock} />
        </div>
      </div>
    </article>
  );
}

const STOCK_DOT: Record<"in" | "low" | "out", string> = {
  in: "var(--gt-emerald-500)",
  low: "var(--gt-amber-400)",
  out: "var(--gt-ink-300)",
};

/** Stock in words, with a dot as a second cue — never the dot alone. */
function Availability({ stock }: { stock: "in" | "low" | "out" }) {
  const { t } = useTranslation();
  return (
    <span
      className="flex items-center gap-1 text-[11px] font-medium"
      style={{ color: stock === "low" ? "var(--status-warning-fg)" : "var(--text-muted)" }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: STOCK_DOT[stock] }} />
      {t(`shopAlt.availability.${stock}`)}
    </span>
  );
}

/** Placeholder with the card's proportions, so the grid does not reflow when results land. */
export function StorefrontCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="gt-skeleton aspect-square" />
      <div className="grid gap-2 px-3 pb-4 pt-3">
        <div className="gt-skeleton h-2.5 w-1/3 rounded-full" />
        <div className="gt-skeleton h-3 w-4/5 rounded-full" />
        <div className="gt-skeleton h-3 w-1/2 rounded-full" />
      </div>
    </div>
  );
}
