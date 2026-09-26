import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { Select } from "../components/ui/Select";
import { ProductCard } from "../components/ui/ProductCard";
import { ReviewsSection, useSubjectReviews } from "../components/reviews/ReviewsSection";
import { getProduct, relatedProducts } from "../data/products";
import { pick } from "../data/types";
import { formatPrice } from "../lib/format";
import { useCart } from "../lib/cart";
import { useToast } from "../lib/toast";
import { useReveal } from "../lib/useReveal";

const SHADES = ["Bleu aurore", "Cristal clair", "Or rose"];
const SHADES_EN: Record<string, string> = { "Bleu aurore": "Aurora blue", "Cristal clair": "Clear crystal", "Or rose": "Rose gold" };
const SHADE_SWATCH: Record<string, string> = {
  "Bleu aurore": "linear-gradient(135deg, #b9cde5, #7a95b8)",
  "Cristal clair": "linear-gradient(135deg, #ffffff, #d3e0ef)",
  "Or rose": "linear-gradient(135deg, #f0c8b6, #c98f73)",
};
const SIZES = ["1,8 mm", "2,0 mm", "2,5 mm"];

export function ProductDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { addLine } = useCart();
  const { showToast } = useToast();
  const lang = i18n.language;

  const product = getProduct(id ?? "") ?? getProduct("aurora-heart")!;
  const [shade, setShade] = useState(SHADES[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [qtyCursor, setQtyCursor] = useState({ id: "", qty: 1 });
  const [openFaq, setOpenFaq] = useState(0);
  // Derived rather than reset in an effect: switching products shows image 0
  // on the very first render, with no frame of the previous product's gallery.
  const [imageCursor, setImageCursor] = useState({ id: "", index: 0 });
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);

  const buyRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const crossSellRef = useReveal<HTMLElement>();

  const name = pick(product.name, lang);
  const subtitle = pick(product.subtitle, lang);
  const description = product.description != null ? pick(product.description, lang) : `${name} — ${subtitle}.`;
  const material = product.material || subtitle.split("·")[0].trim();
  const center = product.center ? pick(product.center, lang) : material;
  const gallery = product.gallery ?? [{ src: product.image, alt: { fr: name, en: name } }];
  const related = relatedProducts().filter((p) => p.id !== product.id);

  const activeImage = imageCursor.id === product.id ? Math.min(imageCursor.index, gallery.length - 1) : 0;
  const setActiveImage = (index: number) => setImageCursor({ id: product.id, index });
  const qty = qtyCursor.id === product.id ? qtyCursor.qty : 1;
  const setQty = (next: number | ((q: number) => number)) =>
    setQtyCursor({ id: product.id, qty: typeof next === "function" ? next(qty) : next });

  // The mobile buy bar only appears once the real CTA has scrolled away, so it
  // never duplicates a button that is already on screen.
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowStickyBar(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sizeOptions = SIZES.map((s) => ({ value: s, label: s }));
  const shadeLabel = (s: string) => (lang.startsWith("en") ? SHADES_EN[s] : s);

  const faqs = [
    { q: t("product.faq1Q"), a: t("product.faq1A") },
    { q: t("product.faq2Q"), a: t("product.faq2A") },
    { q: t("product.faq3Q"), a: t("product.faq3A") },
  ];

  const installment = formatPrice(product.price / 4);

  // The rating line reads the same published reviews as the section below it,
  // so the two can never disagree — and a review approved in the back office
  // moves both.
  const reviewSubject = { kind: "product" as const, id: product.id };
  const { summary: ratings } = useSubjectReviews(reviewSubject);

  const addToCart = () => {
    addLine({
      productId: product.id,
      name,
      variant: `${shadeLabel(shade)} · ${size}`,
      image: product.image,
      price: product.price,
      qty,
    });
    showToast(t("product.toastAddedTitle"), `${name} · ${shadeLabel(shade)}`);
  };

  return (
    <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(14px,4vw,48px)] py-[clamp(32px,4vw,56px)]">
      <nav aria-label={t("product.breadcrumbShop")} className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link to="/boutique" className="underline decoration-1 underline-offset-2">
          {t("product.breadcrumbShop")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link to={`/boutique?categorie=${product.cat}`} className="underline decoration-1 underline-offset-2">
          {product.cat}
        </Link>
        <span aria-hidden="true">·</span>
        <span className="text-[var(--text-primary)]" aria-current="page">{name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          {/* Cursor-tracked zoom: transform-origin follows the pointer so the
              detail under the cursor is the detail that magnifies. */}
          <div
            className="aspect-square overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
          >
            <img
              src={gallery[activeImage].src}
              alt={pick(gallery[activeImage].alt, lang)}
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]"
              style={{
                transform: zoom ? "scale(1.6)" : "scale(1)",
                transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : "center",
              }}
            />
          </div>
          {gallery.length > 1 && (
            <div role="group" aria-label={t("product.galleryLabel")} className="grid grid-cols-4 gap-2">
              {gallery.map((g, i) => (
                <button
                  key={g.src + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={t("product.viewImage", { index: i + 1, total: gallery.length })}
                  aria-current={activeImage === i ? "true" : undefined}
                  className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] transition-[outline-color,opacity]"
                  style={{
                    outline: `2px solid ${activeImage === i ? "var(--gt-ink-900)" : "transparent"}`,
                    outlineOffset: 2,
                    opacity: activeImage === i ? 1 : 0.68,
                  }}
                >
                  <img
                    src={g.src}
                    alt={pick(g.alt, lang)}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid content-start gap-5">
          <div className="flex flex-wrap gap-2">
            {product.badge && <Badge tone="highlight">{pick(product.badge, lang)}</Badge>}
            {product.stock !== "out" && <Badge tone="success" icon={CheckCircle2}>{t("product.inStockBadge")}</Badge>}
            {product.stock === "low" && <Badge tone="warning">{t("product.stockLow")}</Badge>}
            {product.stock === "out" && <Badge tone="error">{t("product.stockOut")}</Badge>}
          </div>
          <h1 className="text-[length:var(--text-h1)]">{name}</h1>
          <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <Star size={14} fill="var(--gt-ink-900)" color="var(--gt-ink-900)" aria-hidden="true" />
            {ratings.count > 0 ? (
              <a
                href="#avis"
                className="underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
                aria-label={t("product.ratingAria", { rating: ratings.average.toFixed(1), count: ratings.count })}
              >
                {ratings.average.toFixed(1)} · {ratings.count} {t("product.reviewsSuffix")}
              </a>
            ) : (
              <a href="#avis" className="underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]">
                {t("reviews.section.noneYet")}
              </a>
            )}
            <span aria-hidden="true">· {material}{center !== material ? `, ${center}` : ""}</span>
          </span>
          <div className="flex items-baseline gap-3">
            <strong className="text-[28px] font-bold text-[var(--text-primary)]">{formatPrice(product.price)}</strong>
            {product.compareAtPrice && (
              <span className="text-sm text-[var(--text-subtle)] line-through">{formatPrice(product.compareAtPrice)}</span>
            )}
            <span className="text-sm text-[var(--text-muted)]">{t("product.installment", { amount: installment })}</span>
          </div>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{description}</p>

          {/* Shade is a swatch radio group rather than a dropdown: colour is the
              decision here, and a <select> hides the options behind a click. */}
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
              {t("product.shadeLabel")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {SHADES.map((s) => {
                const selected = shade === s;
                return (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]"
                    style={{
                      border: `1px solid ${selected ? "var(--gt-ink-900)" : "var(--border-default)"}`,
                      background: selected ? "var(--gt-ink-100)" : "transparent",
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="shade"
                      value={s}
                      checked={selected}
                      onChange={() => setShade(s)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 flex-none rounded-full border border-[var(--border-default)]"
                      style={{ background: SHADE_SWATCH[s] }}
                    />
                    {shadeLabel(s)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="max-w-[220px]">
            <Select label={t("product.sizeLabel")} options={sizeOptions} value={size} onChange={setSize} />
          </div>

          <div ref={buyRef} className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)]">
              <IconButton icon={Minus} label={t("product.decreaseQty")} variant="ghost" size="sm" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} />
              <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
              <IconButton icon={Plus} label={t("product.increaseQty")} variant="ghost" size="sm" onClick={() => setQty((q) => q + 1)} />
            </div>
            <Button variant="primary" size="lg" iconLeft={ShoppingBag} onClick={addToCart} disabled={product.stock === "out"} className="flex-1">
              {t("product.addToCart")}
            </Button>
            <IconButton
              icon={Star}
              label={t("product.save")}
              variant="outline"
              size="lg"
              onClick={() => showToast(t("product.toastSavedTitle"), t("product.toastSavedBody", { name }))}
            />
          </div>

          <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-5 text-sm text-[var(--text-muted)]">
            <span>{t("product.trust1")}</span>
            <span>{t("product.trust2")}</span>
            <span>{t("product.trust3")}</span>
          </div>

          <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-5">
            <h2 className="text-[length:var(--text-h4)]">{t("product.specsTitle")}</h2>
            <dl className="m-0 grid gap-0">
              {[
                [t("product.specMaterial"), material],
                [t("product.specCenter"), center],
                [t("product.specDiameter"), size],
                [t("product.specBack"), t("product.specBackValue")],
                [t("product.specPackaging"), t("product.specPackagingValue")],
                [t("product.specWear"), t("product.specWearValue")],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-[var(--border-subtle)] py-2 text-sm">
                  <dt className="text-[var(--text-muted)]">{k}</dt>
                  <dd className="m-0 font-medium text-[var(--text-primary)]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-5">
            <h2 className="text-[length:var(--text-h4)]">{t("product.faqTitle")}</h2>
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className="border-b border-[var(--border-subtle)]">
                  <h3 className="m-0">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? -1 : i)}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-trigger-${i}`}
                      className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-[var(--text-primary)]"
                    >
                      {f.q}
                      <span aria-hidden="true" className="text-lg text-[var(--text-muted)]">{open ? "–" : "+"}</span>
                    </button>
                  </h3>
                  <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-trigger-${i}`} hidden={!open}>
                    <p className="m-0 pb-3 text-sm text-[var(--text-body)]">{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reviews stay below the purchase information, the specifications and
          the FAQ: they support the decision rather than compete with it. */}
      <ReviewsSection subject={reviewSubject} inline />

      <section ref={crossSellRef} className="gt-reveal mt-16 grid gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2.5">
            <span className="gt-eyebrow">{t("product.crossSellEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("product.crossSellTitle")}</h2>
          </div>
          <Button variant="ghost" onClick={() => navigate("/panier")}>{t("product.crossSellCta")}</Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {related.map((p) => (
            <ProductCard
              key={p.id}
              to={`/boutique/${p.id}`}
              product={{
                id: p.id,
                name: pick(p.name, lang),
                subtitle: pick(p.subtitle, lang),
                price: p.price,
                image: p.image,
                hoverImage: p.gallery?.[1]?.src,
                rating: p.rating,
                reviewCount: p.reviewCount,
                stock: p.stock,
              }}
            />
          ))}
        </div>
      </section>

      {/* Sticky mobile buy bar. The CTA used to scroll away behind specs,
          reviews and cross-sell, leaving no way to buy without scrolling back. */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] lg:hidden"
        style={{ transform: showStickyBar ? "translateY(0)" : "translateY(120%)" }}
        aria-hidden={!showStickyBar}
      >
        <div className="flex items-center gap-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-xs text-[var(--text-muted)]">{name}</span>
            <strong className="text-sm text-[var(--text-primary)]">{formatPrice(product.price * qty)}</strong>
          </div>
          <Button
            variant="primary"
            iconLeft={ShoppingBag}
            onClick={addToCart}
            disabled={product.stock === "out"}
            tabIndex={showStickyBar ? 0 : -1}
          >
            {t("product.stickyBarLabel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
