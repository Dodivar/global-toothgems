import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Image as ImageIcon, Star } from "lucide-react";
import { Badge } from "../ui/Badge";
import { QuickAdd } from "../shop/QuickAdd";
import { canQuickAdd } from "../../lib/quickAdd";
import { useSubjectReviews } from "../reviews/ReviewsSection";
import { formatPrice } from "../../lib/format";
import { gemAxes, isGemOptionSet } from "../../lib/gemOptions";
import { pick } from "../../data/types";
import { useTaxonomy } from "../../lib/catalog/useTaxonomy";
import type { Product, ProductVariant } from "../../data/products";

interface StorefrontCardProps {
  product: Product;
  source: "supabase" | "mock";
  saved: boolean;
  onSave: (saved: boolean) => void;
  /** Skip the lazy-load hint for cards that are above the fold. */
  eager?: boolean;
}

/**
 * Product card of the alternative shop (/boutique).
 *
 * The image does the selling, so it takes the card's full width with no inner
 * frame; the text underneath reads in the order people decide in — what kind
 * of product, which one, how much, can I have it now. Stock is spelled out in
 * words next to the price rather than carried by a colour. Options come
 * with their own availability: each colour is a dot, struck through when
 * that colour is sold out.
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
  const { categoryName, familyName } = useTaxonomy();
  const categoryLabel = product.cat ? categoryName(product.cat) : undefined;
  // The family says more than its category ("Swarovski" rather than "Toothgems").
  const eyebrow = product.family ? familyName(product.family) : categoryLabel;
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
            {eyebrow ?? subtitle}
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
        {/* Without a material, the subtitle is the category name again. */}
        {product.cat && subtitle && subtitle !== categoryLabel && subtitle !== eyebrow && (
          <span className="truncate text-xs text-[var(--text-muted)]">{subtitle}</span>
        )}
        <VariantAvailability variants={product.variants ?? []} />
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

/** Colour dots shown before the rest collapse into "+n". */
const MAX_SWATCHES = 6;

/**
 * What the product comes in, and which of it can be had now. Colours are
 * dots — a sold-out one struck through, and named in its tooltip — followed
 * by how many are sold out; gem options are their packs and stone sizes;
 * any other options are counted. The card stays one link: choosing happens
 * on the product page.
 */
function VariantAvailability({ variants }: { variants: ProductVariant[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const outCount = variants.filter((v) => v.stock === "out").length;
  const outText = outCount > 0 ? t("shopAlt.variantsOut", { count: outCount }) : null;

  if (variants.length === 0 || (variants.length === 1 && !variants[0].swatch)) return null;

  if (variants.every((v) => v.swatch)) {
    const shown = variants.slice(0, MAX_SWATCHES);
    return (
      <span
        role="img"
        aria-label={t("shopAlt.colorsAria", { count: variants.length, available: variants.length - outCount })}
        className="flex items-center gap-1.5 pt-0.5"
      >
        <span aria-hidden="true" className="flex items-center gap-1">
          {shown.map((v) => (
            <span
              key={v.id}
              title={`${pick(v.name, lang)} — ${t(`shopAlt.availability.${v.stock ?? "in"}`)}`}
              data-out={v.stock === "out"}
              className="gt-shopb-swatch relative h-3.5 w-3.5 flex-none rounded-full border border-[var(--border-default)]"
              style={{ background: v.swatch }}
            />
          ))}
          {variants.length > shown.length && (
            <span className="text-[11px] text-[var(--text-muted)]">+{variants.length - shown.length}</span>
          )}
        </span>
        {outText && <span aria-hidden="true" className="truncate text-[11px] text-[var(--text-muted)]">· {outText}</span>}
      </span>
    );
  }

  if (isGemOptionSet(variants)) {
    const { packs, sizes } = gemAxes(variants);
    const parts = [
      packs.length > 0 ? t("product.cardPacks", { list: packs.join(" · ") }) : null,
      sizes.length > 1
        ? t("product.cardSizes", { from: `SS${sizes[0]}`, to: `SS${sizes[sizes.length - 1]}` })
        : sizes.length === 1
          ? `SS${sizes[0]}`
          : null,
    ].filter(Boolean);
    return <span className="truncate text-[11px] text-[var(--text-muted)]">{parts.join(" — ")}</span>;
  }

  return (
    <span className="truncate text-[11px] text-[var(--text-muted)]">
      {t("product.cardVariants", { count: variants.length })}
      {outText && ` · ${outText}`}
    </span>
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
