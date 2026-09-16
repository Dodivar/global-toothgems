import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, GraduationCap } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ProductCard } from "../components/ui/ProductCard";
import { CourseCard } from "../components/ui/CourseCard";
import { ReviewBlock } from "../components/ui/ReviewBlock";
import { Input } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { bestSellers } from "../data/products";
import { COURSES } from "../data/courses";
import { REVIEWS } from "../data/reviews";
import { pick } from "../data/types";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";
import { useReveal } from "../lib/useReveal";

/**
 * `to` carries the shop filter each tile stands for. These used to navigate to a
 * bare /boutique, so picking a category did nothing.
 */
const CATEGORY_TILES: { key: string; image: string; label: string; sub?: string; to: string }[] = [
  { key: "swarovski", image: photo("img-02.jpg"), label: "Swarovski®", to: "/boutique?categorie=Gems&matiere=Swarovski" },
  { key: "preciosa", image: photo("img-05.jpg"), label: "Preciosa®", to: "/boutique?categorie=Gems&matiere=Cristal" },
  { key: "sparklets", image: photo("img-08.jpg"), label: "Sparklets™", sub: "SS0 SS1", to: "/boutique?categorie=Gems" },
  { key: "or", image: photo("img-11.jpg"), label: "Or 14k et 18k", to: "/boutique?categorie=Gems&matiere=Or+18k" },
  { key: "opale", image: photo("img-14.jpg"), label: "Pièces en opale", to: "/boutique?categorie=Gems&matiere=Opale+de+labo" },
  { key: "zircone", image: photo("img-17.jpg"), label: "Zircone", sub: "minis", to: "/boutique?categorie=Gems&prix=under30" },
  { key: "resine", image: photo("img-19.jpg"), label: "Résine acrylique", sub: "minis", to: "/boutique?categorie=Gems&prix=under30" },
  { key: "fairy", image: photo("img-20.jpg"), label: "Fairy dust", sub: "Swarovski®", to: "/boutique?categorie=Gems&matiere=Swarovski" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lang = i18n.language;

  const [optIn, setOptIn] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const featured = bestSellers();

  const categoriesRef = useReveal<HTMLElement>();
  const bestSellersRef = useReveal<HTMLElement>();
  const academyRef = useReveal<HTMLElement>();
  const reviewsRef = useReveal<HTMLElement>();
  const giftRef = useReveal<HTMLElement>();
  const newsletterRef = useReveal<HTMLElement>();

  const subscribe = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t("home.newsletterInvalidEmail"));
      return;
    }
    setEmailError(null);
    setSubscribed(true);
    showToast(t("home.toastSubscribeTitle"), t("home.toastSubscribeBody"));
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative grid min-h-[74vh] items-end overflow-hidden bg-[var(--surface-brand)] p-[clamp(14px,4vw,48px)]">
        <div className="absolute inset-0 overflow-hidden border-b border-[var(--gt-blue-500)]">
          <img
            src={photo("mouth-02.jpg")}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="gt-kenburns block h-full w-full object-cover"
            style={{ objectPosition: "50% 45%" }}
          />
        </div>
        <div className="relative mx-auto grid w-full min-w-0 max-w-[var(--max-width-content)] grid-cols-1 items-end gap-6 lg:grid-cols-[minmax(min(520px,100%),2fr)_minmax(min(220px,100%),1fr)]">
          <div className="gt-glass-panel grid min-w-0 max-w-[620px] gap-5 rounded-[var(--radius-xl)] p-[clamp(24px,3vw,40px)]">
            {/* The one decorative-script moment above the fold. */}
            <span className="gt-script text-[clamp(26px,3.4vw,40px)] text-[var(--gt-blue-700)]">
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
      <section ref={categoriesRef} className="gt-reveal px-[clamp(14px,4vw,48px)] pt-[var(--section-y)]">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-8 grid gap-2.5">
            <span className="gt-eyebrow">{t("home.categoriesEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("home.categoriesTitle")}</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
            {CATEGORY_TILES.map((tile) => (
              <Link
                key={tile.key}
                to={tile.to}
                aria-label={t("home.categoryTileAria", { label: tile.label })}
                className="group relative block h-[104px] rounded-[var(--radius-card)] shadow-[var(--shadow-xs)] transition-[transform,box-shadow] duration-[var(--duration-normal)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)]"
              >
                <img
                  src={tile.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="block h-full w-full rounded-[var(--radius-card)] object-cover"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[var(--radius-card)]"
                  style={{ background: "linear-gradient(90deg, rgba(17,17,17,.62), rgba(17,17,17,0) 62%)" }}
                />
                <span className="absolute bottom-4 left-5 grid gap-0.5">
                  <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-off-white)]">
                    {tile.label}
                  </span>
                  {tile.sub && <span className="text-[11px] font-medium text-[var(--gt-blue-200)]">{tile.sub}</span>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Best sellers */}
      <section ref={bestSellersRef} className="gt-reveal px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
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
                to={`/boutique/${p.id}`}
                product={{
                  id: p.id,
                  name: pick(p.name, lang),
                  subtitle: pick(p.subtitle, lang),
                  price: p.price,
                  compareAtPrice: p.compareAtPrice,
                  image: p.image,
                  hoverImage: p.gallery?.[1]?.src,
                  badge: i === 0 ? t("home.bestSellerBadge") : undefined,
                  badgeTone: "ink",
                  rating: p.rating,
                  reviewCount: p.reviewCount,
                  stock: p.stock,
                }}
                onSave={() => showToast(t("product.toastSavedTitle"), t("product.toastSavedBody", { name: pick(p.name, lang) }))}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Academy band */}
      <section ref={academyRef} className="gt-reveal bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[var(--section-y)] text-[var(--text-inverse)]">
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
      <section ref={reviewsRef} className="gt-reveal px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
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
      <section ref={giftRef} className="gt-reveal px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="gt-sparkle relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)]">
            <img
              src={photo("mouth-05.jpg")}
              alt=""
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover"
            />
          </div>
          <div className="grid gap-5">
            <span className="justify-self-start">
              <Badge tone="highlight" size="sm">{t("home.giftBadge")}</Badge>
            </span>
            {/* Editorial accent: short, decorative, not carrying essential detail. */}
            <h2 className="gt-script m-0 text-[clamp(38px,5vw,64px)] font-normal tracking-normal">{t("home.giftTitle")}</h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("home.giftBody")}</p>
            <ul className="m-0 grid list-none gap-2 p-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              <li>{t("home.giftBullet1")}</li>
              <li>{t("home.giftBullet2")}</li>
              <li>{t("home.giftBullet3")}</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="lg" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
                {t("home.giftCta")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section ref={newsletterRef} className="gt-reveal bg-[var(--surface-brand-wash)] px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="grid gap-4">
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
              {t("home.newsletterEyebrow")}
            </span>
            <h2 className="text-[length:var(--text-h2)]">{t("home.newsletterTitle")}</h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("home.newsletterBody")}</p>
          </div>
          <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)]">
            {subscribed ? (
              /* An inline success state: a toast disappears after 3.6s and leaves
                 the form looking untouched. */
              <div className="gt-celebrate grid justify-items-start gap-3 py-2">
                <Badge tone="success" icon={CheckCircle2}>{t("home.newsletterSuccessTitle")}</Badge>
                <p className="m-0 text-sm text-[var(--text-body)]">{t("home.newsletterSuccessBody")}</p>
              </div>
            ) : (
              <>
                <Input
                  label={t("home.newsletterEmailLabel")}
                  type="email"
                  autoComplete="email"
                  placeholder={t("home.newsletterEmailPlaceholder")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? "newsletter-error" : undefined}
                />
                {emailError && (
                  <p id="newsletter-error" role="alert" className="m-0 text-xs font-medium text-[var(--status-error-fg)]">
                    {emailError}
                  </p>
                )}
                <Checkbox
                  label={t("home.newsletterCheckboxLabel")}
                  description={t("home.newsletterCheckboxDescription")}
                  checked={optIn}
                  onChange={setOptIn}
                />
                <Button variant="primary" fullWidth iconRight={ArrowRight} disabled={!optIn} onClick={subscribe}>
                  {t("home.newsletterSubmit")}
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
