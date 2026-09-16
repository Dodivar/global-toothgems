import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { Select } from "../components/ui/Select";
import { ProductCard } from "../components/ui/ProductCard";
import { ReviewBlock } from "../components/ui/ReviewBlock";
import { getProduct, relatedProducts } from "../data/products";
import { REVIEWS } from "../data/reviews";
import { pick } from "../data/types";
import { formatPrice } from "../lib/format";
import { useCart } from "../lib/cart";
import { useToast } from "../lib/toast";

const SHADES = ["Bleu aurore", "Cristal clair", "Or rose"];
const SHADES_EN: Record<string, string> = { "Bleu aurore": "Aurora blue", "Cristal clair": "Clear crystal", "Or rose": "Rose gold" };
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
  const [qty, setQty] = useState(1);
  const [openFaq, setOpenFaq] = useState(0);

  const name = pick(product.name, lang);
  const subtitle = pick(product.subtitle, lang);
  const description =
    product.description != null
      ? pick(product.description, lang)
      : `${name} — ${subtitle}.`;
  const material = product.material || subtitle.split("·")[0].trim();
  const center = product.center ? pick(product.center, lang) : material;
  const gallery = product.gallery ?? [{ src: product.image, alt: { fr: name, en: name } }];
  const related = relatedProducts().filter((p) => p.id !== product.id);

  const shadeOptions = SHADES.map((s) => ({ value: s, label: lang.startsWith("en") ? SHADES_EN[s] : s }));
  const sizeOptions = SIZES.map((s) => ({ value: s, label: s }));

  const faqs = [
    { q: t("product.faq1Q"), a: t("product.faq1A") },
    { q: t("product.faq2Q"), a: t("product.faq2A") },
    { q: t("product.faq3Q"), a: t("product.faq3A") },
  ];

  const installment = useMemo(() => formatPrice(product.price / 4), [product.price]);

  const addToCart = () => {
    addLine({
      productId: product.id,
      name,
      variant: `${lang.startsWith("en") ? SHADES_EN[shade] : shade} · ${size}`,
      image: product.image,
      price: product.price,
      qty,
    });
    showToast(t("product.toastAddedTitle"), `${name} · ${lang.startsWith("en") ? SHADES_EN[shade] : shade}`);
  };

  return (
    <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(14px,4vw,48px)] py-[clamp(32px,4vw,56px)]">
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <button type="button" onClick={() => navigate("/boutique")} className="underline decoration-1 underline-offset-2">
          {t("product.breadcrumbShop")}
        </button>
        <span>·</span>
        <span>{product.cat}</span>
        <span>·</span>
        <span className="text-[var(--text-primary)]">{name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="aspect-square overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]">
            <img src={gallery[0].src} alt={pick(gallery[0].alt, lang)} className="h-full w-full object-cover" />
          </div>
          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {gallery.map((g, i) => (
                <div key={i} className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-sunken)]">
                  <img src={g.src} alt={pick(g.alt, lang)} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 content-start">
          <div className="flex flex-wrap gap-2">
            {product.badge && <Badge tone="highlight">{pick(product.badge, lang)}</Badge>}
            {product.stock !== "out" && (
              <Badge tone="success" icon={CheckCircle2}>{t("product.inStockBadge")}</Badge>
            )}
          </div>
          <h1 className="text-[length:var(--text-h1)]">{name}</h1>
          <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <Star size={14} fill="var(--gt-ink-900)" color="var(--gt-ink-900)" />
            {product.rating.toFixed(1)} · {product.reviewCount} {t("product.reviewsSuffix")} · {material}{center !== material ? `, ${center}` : ""}
          </span>
          <div className="flex items-baseline gap-3">
            <strong className="text-[28px] font-bold text-[var(--text-primary)]">{formatPrice(product.price)}</strong>
            <span className="text-sm text-[var(--text-muted)]">{t("product.installment", { amount: installment })}</span>
          </div>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{description}</p>

          <div className="grid grid-cols-2 gap-4">
            <Select label={t("product.shadeLabel")} options={shadeOptions} value={shade} onChange={setShade} />
            <Select label={t("product.sizeLabel")} options={sizeOptions} value={size} onChange={setSize} />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)]">
              <IconButton icon={Minus} label={t("product.decreaseQty")} variant="ghost" size="sm" onClick={() => setQty((q) => Math.max(1, q - 1))} />
              <span className="w-8 text-center text-sm font-semibold">{qty}</span>
              <IconButton icon={Plus} label={t("product.increaseQty")} variant="ghost" size="sm" onClick={() => setQty((q) => q + 1)} />
            </div>
            <Button variant="primary" size="lg" iconLeft={ShoppingBag} onClick={addToCart} className="flex-1">
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
            <h4 className="text-[length:var(--text-h4)]">{t("product.specsTitle")}</h4>
            {[
              [t("product.specMaterial"), material],
              [t("product.specCenter"), center],
              [t("product.specDiameter"), size],
              [t("product.specBack"), t("product.specBackValue")],
              [t("product.specPackaging"), t("product.specPackagingValue")],
              [t("product.specWear"), t("product.specWearValue")],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[var(--border-subtle)] py-2 text-sm">
                <span className="text-[var(--text-muted)]">{k}</span>
                <span className="font-medium text-[var(--text-primary)]">{v}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-5">
            <h4 className="text-[length:var(--text-h4)]">{t("product.faqTitle")}</h4>
            {faqs.map((f, i) => (
              <div key={f.q} className="border-b border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-[var(--text-primary)]"
                >
                  {f.q}
                  <span className="text-lg text-[var(--text-muted)]">{openFaq === i ? "–" : "+"}</span>
                </button>
                {openFaq === i && <p className="m-0 pb-3 text-sm text-[var(--text-body)]">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-16 grid gap-8">
        <div className="grid gap-2.5">
          <span className="gt-eyebrow">{t("product.reviewsEyebrow")}</span>
          <h2 className="text-[length:var(--text-h2)]">{t("product.reviewsTitle")}</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">
          {REVIEWS.map((r) => (
            <ReviewBlock key={r.author} author={r.author} date={r.date} rating={r.rating} locale={r.locale} verified title={pick(r.title, lang)} body={pick(r.body, lang)} />
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-8">
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
              product={{
                id: p.id,
                name: pick(p.name, lang),
                subtitle: pick(p.subtitle, lang),
                price: p.price,
                image: p.image,
                rating: p.rating,
                reviewCount: p.reviewCount,
              }}
              onSelect={() => navigate(`/boutique/${p.id}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
