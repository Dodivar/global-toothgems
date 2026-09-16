import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ProductCard } from "../components/ui/ProductCard";
import { CourseCard } from "../components/ui/CourseCard";
import { ReviewBlock } from "../components/ui/ReviewBlock";
import { Input } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { useState } from "react";
import { bestSellers } from "../data/products";
import { COURSES } from "../data/courses";
import { REVIEWS } from "../data/reviews";
import { pick } from "../data/types";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";

const CATEGORY_TILES: { key: string; image: string; label: string; sub?: string }[] = [
  { key: "swarovski", image: photo("img-02.jpg"), label: "Swarovski®" },
  { key: "preciosa", image: photo("img-05.jpg"), label: "Preciosa®" },
  { key: "sparklets", image: photo("img-08.jpg"), label: "Sparklets™", sub: "SS0 SS1" },
  { key: "or", image: photo("img-11.jpg"), label: "Or 14k et 18k" },
  { key: "opale", image: photo("img-14.jpg"), label: "Pièces en opale" },
  { key: "zircone", image: photo("img-17.jpg"), label: "Zircone", sub: "minis" },
  { key: "resine", image: photo("img-19.jpg"), label: "Résine acrylique", sub: "minis" },
  { key: "fairy", image: photo("img-20.jpg"), label: "Fairy dust", sub: "Swarovski®" },
];

export function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lang = i18n.language;
  const [optIn, setOptIn] = useState(false);

  const featured = bestSellers();

  return (
    <div>
      {/* Hero */}
      <section className="relative grid min-h-[74vh] items-end overflow-hidden bg-[var(--surface-brand)] p-[clamp(14px,4vw,48px)]">
        <div className="absolute inset-0 overflow-hidden border-b border-[var(--gt-blue-500)]">
          <img
            src={photo("mouth-02.jpg")}
            alt="Sourire orné de gems en gros plan"
            className="block h-full w-full object-cover"
            style={{ objectPosition: "50% 45%" }}
          />
        </div>
        <div className="relative mx-auto grid w-full min-w-0 max-w-[var(--max-width-content)] grid-cols-1 items-end gap-6 lg:grid-cols-[minmax(min(520px,100%),2fr)_minmax(min(220px,100%),1fr)]">
          <div
            className="grid min-w-0 max-w-[620px] gap-5 rounded-[var(--radius-xl)] border border-white/80 p-[clamp(24px,3vw,40px)]"
            style={{
              background: "rgba(250,250,248,.72)",
              backdropFilter: "blur(9px) saturate(1.45)",
              WebkitBackdropFilter: "blur(9px) saturate(1.45)",
              boxShadow: "var(--shadow-glass-heavy), inset 0 1px 0 rgba(255,255,255,.9)",
            }}
          >
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-ink-900)]">
              {t("home.heroEyebrow")}
            </span>
            <h1
              className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
              dangerouslySetInnerHTML={{ __html: t("home.heroHeadline") }}
            />
            <p className="m-0 max-w-[460px] text-[length:var(--text-body-lg)] text-[var(--gt-ink-900)]">{t("home.heroBody")}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
                {t("home.ctaShopFull")}
              </Button>
              <Button variant="dark" size="lg" iconLeft={GraduationCap} onClick={() => navigate("/academy")}>
                {t("home.ctaAcademyFull")}
              </Button>
            </div>
          </div>
          <div className="gt-glass grid min-w-[230px] justify-self-end gap-3.5 self-end rounded-[var(--radius-lg)] p-[var(--space-5)]">
            <div className="grid gap-0.5">
              <strong className="text-[22px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">{t("home.heroStat1Value")}</strong>
              <span className="text-[length:var(--text-caption)] text-[var(--gt-ink-700)]">{t("home.heroStat1Label")}</span>
            </div>
            <div className="h-px bg-black/[.14]" />
            <div className="grid gap-0.5">
              <strong className="text-[22px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">{t("home.heroStat2Value")}</strong>
              <span className="text-[length:var(--text-caption)] text-[var(--gt-ink-700)]">{t("home.heroStat2Label")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="px-[clamp(14px,4vw,48px)] pt-[var(--section-y)]">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-8 grid gap-2.5">
            <span className="gt-eyebrow">{t("home.categoriesEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("home.categoriesTitle")}</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
            {CATEGORY_TILES.map((tile) => (
              <a
                key={tile.key}
                href="/boutique"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/boutique");
                }}
                className="group relative block h-[104px] overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-xs)] transition-[transform,box-shadow] duration-[var(--duration-normal)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)]"
              >
                <img src={tile.image} alt={tile.label} className="block h-full w-full object-cover" />
                <span
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(90deg, rgba(17,17,17,.55), rgba(17,17,17,0) 62%)" }}
                />
                <span className="absolute bottom-4 left-5 grid gap-0.5">
                  <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-off-white)]">
                    {tile.label}
                  </span>
                  {tile.sub && <span className="text-[11px] font-medium text-[var(--gt-blue-200)]">{tile.sub}</span>}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Best sellers */}
      <section className="px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div className="grid gap-2.5">
              <span className="gt-eyebrow">{t("home.bestSellersEyebrow")}</span>
              <h2 className="text-[length:var(--text-h2)]">{t("home.bestSellersTitle")}</h2>
            </div>
            <Button variant="ghost" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
              {t("home.bestSellersCta")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {featured.map((p, i) => (
              <ProductCard
                key={p.id}
                product={{
                  id: p.id,
                  name: pick(p.name, lang),
                  subtitle: pick(p.subtitle, lang),
                  price: p.price,
                  compareAtPrice: p.compareAtPrice,
                  image: p.image,
                  badge: i === 0 ? t("home.bestSellerBadge") : undefined,
                  badgeTone: "ink",
                  rating: p.rating,
                  reviewCount: p.reviewCount,
                  stock: p.stock,
                }}
                onSelect={() => navigate(`/boutique/${p.id}`)}
                onSave={() => showToast(t("product.toastSavedTitle"), t("product.toastSavedBody", { name: pick(p.name, lang) }))}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Academy band */}
      <section className="bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[var(--section-y)] text-[var(--text-inverse)]">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div className="grid max-w-[620px] gap-2.5">
              <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                {t("home.academyEyebrow")}
              </span>
              <h2 className="text-[length:var(--text-h2)] text-[var(--gt-off-white)]">{t("home.academyTitle")}</h2>
            </div>
            <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/academy")}>
              {t("home.academyCta")}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COURSES.map((c) => (
              <CourseCard
                key={c.id}
                tone="ink"
                course={{
                  id: c.id,
                  title: pick(c.title, lang),
                  level: pick(c.level, lang),
                  lessonCount: c.lessonCount,
                  duration: c.duration,
                  price: c.price,
                  image: c.image,
                }}
                onSelect={() => {
                  navigate("/academy/lecon");
                  showToast(t("academy.toastCourseTitle"), t("academy.toastCourseBody", { title: pick(c.title, lang) }));
                }}
              />
            ))}
          </div>
          <p className="m-0 mt-7 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
            {t("home.academyFootnote")}
          </p>
        </div>
      </section>

      {/* Reviews */}
      <section className="px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-10 grid gap-2.5">
            <span className="gt-eyebrow">{t("home.reviewsEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("home.reviewsTitle")}</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">
            {REVIEWS.map((r) => (
              <ReviewBlock
                key={r.author}
                author={r.author}
                date={r.date}
                rating={r.rating}
                locale={r.locale}
                verified
                title={pick(r.title, lang)}
                body={pick(r.body, lang)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Gift card */}
      <section className="px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)]">
            <img src={photo("mouth-05.jpg")} alt="Sourire orné de gems, offert en carte cadeau" className="block h-full w-full object-cover" />
          </div>
          <div className="grid gap-5">
            <span className="justify-self-start">
              <Badge tone="highlight" size="sm">{t("home.giftBadge")}</Badge>
            </span>
            <h2 className="m-0 text-[length:var(--text-h2)]">{t("home.giftTitle")}</h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("home.giftBody")}</p>
            <div className="grid gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              <span>{t("home.giftBullet1")}</span>
              <span>{t("home.giftBullet2")}</span>
              <span>{t("home.giftBullet3")}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="lg" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
                {t("home.giftCta")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-[var(--surface-brand-wash)] px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="grid gap-4">
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
              {t("home.newsletterEyebrow")}
            </span>
            <h2 className="text-[length:var(--text-h2)]">{t("home.newsletterTitle")}</h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("home.newsletterBody")}</p>
          </div>
          <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)]">
            <Input label={t("home.newsletterEmailLabel")} type="email" placeholder={t("home.newsletterEmailPlaceholder")} />
            <Checkbox
              label={t("home.newsletterCheckboxLabel")}
              description={t("home.newsletterCheckboxDescription")}
              checked={optIn}
              onChange={setOptIn}
            />
            <Button
              variant="primary"
              fullWidth
              iconRight={ArrowRight}
              disabled={!optIn}
              onClick={() => showToast(t("home.toastSubscribeTitle"), t("home.toastSubscribeBody"))}
            >
              {t("home.newsletterSubmit")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
