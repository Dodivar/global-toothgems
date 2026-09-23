import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock3, Gift, Heart, Lock, ShoppingBag, Sparkles, Star, Tag, Truck } from "lucide-react";
import clsx from "clsx";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { coveredProductIds, discountedUnitCents } from "../../lib/promotionRules";
import { daysFromNow, type Campaign, type Promotion } from "../../data/adminPromotions";
import type { AdminProduct } from "../../data/adminCatalog";
import { useDiscountLabel, useMoney } from "./PromoBadges";
import { CampaignCover } from "./Visuals";
import { useProductsByCategory } from "./ProductPicker";

/**
 * How a promotion looks to a customer, drawn with the storefront's own
 * vocabulary — pill buttons, 18px card radii, the fuchsia promotional badge —
 * rather than the admin's squarer geometry. The frame around each preview says
 * "this is the shop", so an administrator never mistakes it for a control.
 *
 * Amounts are illustrative: the server recomputes every discount at checkout.
 */

const STANDARD_SHIPPING_CENTS = 690;

export function toCents(euros: number): number {
  return Math.round(euros * 100);
}

/** A labelled frame that reads as "storefront" at a glance. */
export function PreviewFrame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <figure className={clsx("m-0 grid gap-2", className)}>
      <figcaption className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
        <span aria-hidden="true" className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-300)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-300)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-300)]" />
        </span>
        {label}
      </figcaption>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--gt-white)] shadow-[var(--shadow-sm)]">
        {children}
      </div>
    </figure>
  );
}

/** Uppercase storefront badge ("20% OFF"). */
export function ShopBadge({ children, tone = "highlight" }: { children: ReactNode; tone?: "highlight" | "ink" | "brand" }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)]",
        tone === "highlight" && "bg-[var(--accent-highlight)] text-[var(--gt-white)]",
        tone === "ink" && "bg-[var(--gt-ink-900)] text-[var(--gt-white)]",
        tone === "brand" && "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
      )}
    >
      {children}
    </span>
  );
}

/** The product a preview should use: the first covered one, else the first active product. */
export function usePreviewProduct(promotion: Promotion | null): AdminProduct | undefined {
  const { products } = useAdminCatalog();
  const byCategory = useProductsByCategory();
  if (!promotion) return products.find((p) => p.status === "active");
  const covered = coveredProductIds(promotion, byCategory);
  const first = covered?.map((id) => products.find((p) => p.id === id)).find(Boolean);
  return first ?? products.find((p) => p.status === "active");
}

/* -------------------------------------------------------------------------- */
/* Product card                                                               */
/* -------------------------------------------------------------------------- */

export function PreviewProductCard({
  product,
  promotion,
  campaign,
  compact,
}: {
  product: AdminProduct;
  promotion: Promotion | null;
  campaign?: Campaign | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const discount = useDiscountLabel();
  const price = toCents(product.price);
  const now = promotion ? discountedUnitCents(price, promotion) : price;

  return (
    <article className="group relative rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 shadow-[var(--shadow-xs)] transition-[transform,box-shadow] duration-[var(--duration-normal)] hover:-translate-y-[2px] hover:shadow-[var(--shadow-md)]">
      <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[var(--surface-sunken)]">
        {product.media[0] && (
          <img
            src={product.media[0].src}
            alt={l(product.media[0].alt) || l(product.name)}
            className="h-full w-full object-cover transition-transform duration-[var(--duration-normal)] group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {promotion && <ShopBadge>{discount(promotion, "badge")}</ShopBadge>}
          {campaign && !compact && (
            <ShopBadge tone="ink">
              <Sparkles size={10} aria-hidden="true" />
              {t("promo.shop.partOf", { name: campaign.name })}
            </ShopBadge>
          )}
        </div>
        <span aria-hidden="true" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-[var(--text-primary)]">
          <Heart size={14} />
        </span>
      </div>
      <div className="grid gap-1 px-1 pb-1 pt-2.5">
        <h3 className="truncate text-[length:var(--text-body-sm)] font-semibold">{l(product.name)}</h3>
        {!compact && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <Star size={11} className="fill-[var(--gt-ink-900)] text-[var(--gt-ink-900)]" aria-hidden="true" /> 4,9 · 128
          </span>
        )}
        <span className="flex items-baseline gap-2">
          <strong className={clsx("text-[length:var(--text-body-md)] tabular-nums", now < price && "text-[var(--accent-highlight-ink)]")}>
            {money(now)}
          </strong>
          {now < price && <s className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{money(price)}</s>}
        </span>
        {promotion && now === price && (
          <span className="text-[11px] font-semibold text-[var(--accent-highlight-ink)]">
            {l(promotion.customerTitle) || discount(promotion)}
          </span>
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Product detail                                                             */
/* -------------------------------------------------------------------------- */

export function PreviewProductPage({
  product,
  promotion,
  campaign,
}: {
  product: AdminProduct;
  promotion: Promotion;
  campaign?: Campaign | null;
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const discount = useDiscountLabel();
  const price = toCents(product.price);
  const now = discountedUnitCents(price, promotion);
  const endsIn = promotion.schedule.endsAt ? daysFromNow(promotion.schedule.endsAt) : null;

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] sm:p-5">
      <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[var(--surface-sunken)]">
        {product.media[0] && <img src={product.media[0].src} alt={l(product.name)} className="h-full w-full object-cover" />}
        <span className="absolute left-2.5 top-2.5">
          <ShopBadge>{discount(promotion, "badge")}</ShopBadge>
        </span>
      </div>
      <div className="grid content-start gap-3">
        {campaign && (
          <span className="gt-script text-[26px] leading-none text-[var(--gt-blue-600)]">{l(campaign.title) || campaign.name}</span>
        )}
        <h3 className="text-[length:var(--text-h4)]">{l(product.name)}</h3>
        <div className="flex items-baseline gap-2">
          <strong className={clsx("text-[22px] tabular-nums", now < price && "text-[var(--accent-highlight-ink)]")}>{money(now)}</strong>
          {now < price && <s className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{money(price)}</s>}
        </div>
        <div className="grid gap-1 rounded-[14px] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] p-3">
          <span className="flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--accent-highlight-ink)]">
            <Tag size={14} aria-hidden="true" />
            {l(promotion.customerTitle) || discount(promotion)}
          </span>
          {l(promotion.customerDescription) && (
            <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{l(promotion.customerDescription)}</span>
          )}
          <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">
            {promotion.code.mode === "code" && promotion.code.code
              ? t("promo.shop.useCode", { code: promotion.code.code })
              : t("promo.shop.automatic")}
          </span>
          {endsIn != null && endsIn >= 0 && endsIn <= 14 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-primary)]">
              <Clock3 size={12} aria-hidden="true" />
              {t("promo.shop.endsIn", { count: Math.max(1, endsIn) })}
            </span>
          )}
        </div>
        <span
          aria-hidden="true"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] text-[length:var(--text-caption)] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]"
        >
          <ShoppingBag size={15} />
          {t("promo.shop.addToCart")}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cart & checkout                                                            */
/* -------------------------------------------------------------------------- */

interface PreviewLine {
  product: AdminProduct;
  qty: number;
  unitCents: number;
  free?: boolean;
}

interface PreviewCart {
  lines: PreviewLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  qualifies: boolean;
  shortfallCents: number;
}

/**
 * A plausible basket for the promotion — enough of the covered product to
 * trigger it, and the discount it would earn. Illustration only: the prototype
 * never charges anything, and the real total is computed by the server.
 */
function buildCart(promotion: Promotion, products: AdminProduct[], main: AdminProduct): PreviewCart {
  const d = promotion.discount;
  const find = (id?: string) => products.find((p) => p.id === id);
  const lines: PreviewLine[] = [];

  if (d.type === "bundle") {
    (d.bundleProductIds ?? []).forEach((id) => {
      const p = find(id);
      if (p) lines.push({ product: p, qty: 1, unitCents: toCents(p.price) });
    });
  } else if (d.type === "bxgy") {
    lines.push({ product: main, qty: (d.buyQty ?? 2) + (d.getQty ?? 1), unitCents: toCents(main.price) });
  } else {
    lines.push({ product: main, qty: 2, unitCents: toCents(main.price) });
  }
  if (lines.length === 0) lines.push({ product: main, qty: 1, unitCents: toCents(main.price) });

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
  const min = d.minOrderCents ?? promotion.eligibility.minCartCents ?? 0;
  const qualifies = subtotal >= min;
  let discountCents = 0;
  let shipping = subtotal >= 8000 ? 0 : STANDARD_SHIPPING_CENTS;

  if (qualifies) {
    switch (d.type) {
      case "percentage":
        discountCents = Math.round((subtotal * (d.percent ?? 0)) / 100);
        if (d.maxDiscountCents) discountCents = Math.min(discountCents, d.maxDiscountCents);
        break;
      case "fixed":
        discountCents = Math.min(subtotal, d.amountCents ?? 0);
        break;
      case "bxgy":
        discountCents = Math.round(((d.getQty ?? 1) * lines[0].unitCents * (d.rewardPercent ?? 100)) / 100);
        break;
      case "freeShipping":
        shipping = 0;
        break;
      case "bundle":
        discountCents = Math.max(0, subtotal - (d.bundlePriceCents ?? subtotal));
        break;
      case "gift": {
        const gift = find(d.giftProductId);
        if (gift) lines.push({ product: gift, qty: 1, unitCents: 0, free: true });
        break;
      }
    }
  }
  return {
    lines,
    subtotalCents: subtotal,
    discountCents,
    shippingCents: shipping,
    totalCents: subtotal - discountCents + shipping,
    qualifies,
    shortfallCents: Math.max(0, min - subtotal),
  };
}

export function PreviewCart({ promotion, product }: { promotion: Promotion; product: AdminProduct }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const discount = useDiscountLabel();
  const { products } = useAdminCatalog();
  const cart = buildCart(promotion, products, product);

  return (
    <div className="grid gap-3 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-[length:var(--text-body-md)]">
        <ShoppingBag size={16} aria-hidden="true" /> {t("promo.shop.cart")}
      </h3>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {cart.lines.map((line) => (
          <li key={line.product.id + (line.free ? "-gift" : "")} className="flex items-center gap-3">
            <span className="h-12 w-12 flex-none overflow-hidden rounded-[10px] bg-[var(--surface-sunken)]">
              {line.product.media[0] && <img src={line.product.media[0].src} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[length:var(--text-body-sm)] font-semibold">{l(line.product.name)}</span>
              <span className="text-[11px] text-[var(--text-muted)]">× {line.qty}</span>
              {line.free && (
                <span className="mt-0.5 inline-flex w-fit items-center gap-1 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--accent-highlight-ink)]">
                  <Gift size={11} aria-hidden="true" /> {t("promo.shop.gifted")}
                </span>
              )}
            </span>
            <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums">
              {line.free ? t("promo.shop.free") : money(line.qty * line.unitCents)}
            </span>
          </li>
        ))}
      </ul>
      {promotion.code.mode === "code" ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] py-1.5 pl-4 pr-1.5">
          <span className="truncate font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-bold text-[var(--status-success-fg)]">
            {promotion.code.code || "CODE"} ✓
          </span>
          <span className="rounded-[var(--radius-pill)] bg-[var(--gt-white)] px-3 py-1 text-[11px] font-semibold text-[var(--text-body)]">
            {t("promo.shop.applied")}
          </span>
        </div>
      ) : (
        <p className="m-0 flex items-center gap-1.5 rounded-[12px] bg-[var(--gt-fuchsia-50)] px-3 py-2 text-[length:var(--text-caption)] font-semibold text-[var(--accent-highlight-ink)]">
          <Sparkles size={13} aria-hidden="true" />
          {cart.qualifies
            ? t("promo.shop.autoApplied", { name: l(promotion.customerTitle) || discount(promotion) })
            : t("promo.shop.almost", { amount: money(cart.shortfallCents) })}
        </p>
      )}
      <Totals cart={cart} label={l(promotion.customerTitle) || discount(promotion)} freeShipping={promotion.discount.type === "freeShipping"} />
    </div>
  );
}

function Totals({ cart, label, freeShipping }: { cart: PreviewCart; label: string; freeShipping: boolean }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <dl className="m-0 grid gap-1.5 border-t border-[var(--border-subtle)] pt-3 text-[length:var(--text-body-sm)]">
      <Row label={t("promo.shop.subtotal")} value={money(cart.subtotalCents)} />
      {cart.discountCents > 0 && (
        <Row
          label={label}
          value={`−${money(cart.discountCents)}`}
          className="font-semibold text-[var(--accent-highlight-ink)]"
          icon={<Tag size={12} aria-hidden="true" />}
        />
      )}
      <Row
        label={t("promo.shop.shipping")}
        value={cart.shippingCents === 0 ? t("promo.shop.free") : money(cart.shippingCents)}
        className={freeShipping && cart.shippingCents === 0 ? "font-semibold text-[var(--accent-highlight-ink)]" : undefined}
        icon={freeShipping ? <Truck size={12} aria-hidden="true" /> : undefined}
      />
      <Row label={t("promo.shop.total")} value={money(cart.totalCents)} className="border-t border-[var(--border-subtle)] pt-2 text-[length:var(--text-body-md)] font-bold text-[var(--text-primary)]" />
    </dl>
  );
}

function Row({ label, value, className, icon }: { label: string; value: string; className?: string; icon?: ReactNode }) {
  return (
    <div className={clsx("flex items-center justify-between gap-3", className)}>
      <dt className="flex min-w-0 items-center gap-1.5 truncate">
        {icon}
        {label}
      </dt>
      <dd className="m-0 tabular-nums">{value}</dd>
    </div>
  );
}

export function PreviewCheckout({ promotion, product }: { promotion: Promotion; product: AdminProduct }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const discount = useDiscountLabel();
  const money = useMoney();
  const { products } = useAdminCatalog();
  const cart = buildCart(promotion, products, product);
  return (
    <div className="grid gap-3 bg-[var(--gt-off-white)] p-4 sm:p-5">
      <h3 className="flex items-center justify-between gap-2 text-[length:var(--text-body-md)]">
        {t("promo.shop.orderSummary")}
        <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]">
          <Lock size={11} aria-hidden="true" />
          {t("promo.shop.secure")}
        </span>
      </h3>
      <Totals cart={cart} label={l(promotion.customerTitle) || discount(promotion)} freeShipping={promotion.discount.type === "freeShipping"} />
      {cart.discountCents > 0 && (
        <p className="m-0 rounded-[12px] bg-[var(--status-success-bg)] px-3 py-2 text-center text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
          {t("promo.shop.youSave", { amount: money(cart.discountCents) })}
        </p>
      )}
      <span
        aria-hidden="true"
        className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] text-[length:var(--text-caption)] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-white)]"
      >
        {t("promo.shop.pay", { amount: money(cart.totalCents) })}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Campaign landing                                                           */
/* -------------------------------------------------------------------------- */

export function PreviewCampaignLanding({
  campaign,
  promotions,
  productIds,
}: {
  campaign: Campaign;
  promotions: Promotion[];
  productIds: string[];
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const discount = useDiscountLabel();
  const { products } = useAdminCatalog();
  const list = productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean).slice(0, 3) as AdminProduct[];
  const headline = promotions[0];

  return (
    <div>
      <CampaignCover
        theme={campaign.theme}
        cover={campaign.cover}
        title={l(campaign.title) || campaign.name}
        eyebrow={campaign.name}
        subtitle={l(campaign.description)}
        size="md"
      >
        <span className="mt-2 flex flex-wrap gap-1.5">
          {promotions.slice(0, 3).map((p) => (
            <ShopBadge key={p.id}>{discount(p, "badge")}</ShopBadge>
          ))}
        </span>
      </CampaignCover>
      <div className="grid gap-3 p-4 sm:p-5">
        {list.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {list.map((p, i) => (
              <div key={p.id} className={clsx(i === 2 && "hidden sm:block")}>
                <PreviewProductCard product={p} promotion={headline ?? null} compact />
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-[14px] border border-dashed border-[var(--border-default)] px-4 py-6 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("promo.shop.noProducts")}
          </p>
        )}
      </div>
    </div>
  );
}
