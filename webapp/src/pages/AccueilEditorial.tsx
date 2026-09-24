import { useState, type HTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCircle2, Heart, Star } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Checkbox } from "../components/ui/Checkbox";
import { ShapeGlyph } from "../components/ui/ShapeGlyph";
import { bestSellers, shapesInCatalog } from "../data/products";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { CATEGORY_TILES } from "../data/categoryTiles";
import { COURSES } from "../data/courses";
import { REVIEWS } from "../data/reviews";
import { pick } from "../data/types";
import { courseHref } from "../lib/academyUrl";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";
import { formatPrice } from "../lib/format";
import { useReveal } from "../lib/useReveal";
import { shapeHref } from "../lib/shopUrl";

/**
 * The alternative home-page direction, served at `/accueil-b` beside the
 * existing page at `/` so the two can be compared on the same content.
 *
 * Nothing is removed and nothing is invented: the sections, products, courses,
 * reviews, category filters, calls to action and the newsletter consent flow are
 * the ones `Home` ships, driven by the same `home.*` translations. What changes
 * is the art direction.
 *
 * The existing page is built from rounded, shadowed cards floating on a
 * symmetric 1240px grid, with a glass panel as its one bold move and a flat 30px
 * heading in every section. This direction is a printed issue instead: a
 * numbered running order, hairline rules rather than card borders, square
 * corners, display type at section heads, offset columns and one full-bleed edge
 * per section. Pastel blue becomes a large flat field, emerald stays on exactly
 * one primary action per viewport, and fuchsia is reduced to a rule and a single
 * badge.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Shared page gutter. Wider than the existing page's, because the type is bigger. */
const GUTTER = "px-[clamp(20px,4vw,56px)]";

/**
 * A revealed section. Each instance owns its observer: `gt-reveal` starts at
 * `opacity: 0`, so a section sharing someone else's ref would never appear.
 */
function Section({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`gt-reveal ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** The running-order numeral that heads every section below the cover. */
function Index({ n, tone = "ink" }: { n: string; tone?: "ink" | "paper" }) {
  return (
    <span
      aria-hidden="true"
      className="block text-[length:var(--text-h3)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]"
      style={{ color: tone === "ink" ? "var(--gt-blue-400)" : "var(--gt-blue-300)" }}
    >
      {n}
    </span>
  );
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={label}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          size={13}
          fill={i < Math.round(rating) ? "var(--gt-ink-900)" : "none"}
          color={i < Math.round(rating) ? "var(--gt-ink-900)" : "var(--gt-ink-300)"}
        />
      ))}
    </span>
  );
}

export function AccueilEditorial() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lang = i18n.language;

  const [optIn, setOptIn] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const { products } = useCatalog();
  const featured = bestSellers(products);
  const shapeGroups = shapesInCatalog(products);
  const [lead, ...rest] = REVIEWS;

  const subscribe = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t("home.newsletterInvalidEmail"));
      return;
    }
    setEmailError(null);
    setSubscribed(true);
    showToast(t("home.toastSubscribeTitle"), t("home.toastSubscribeBody"));
  };

  const trust = [t("product.trust1"), t("product.trust2"), t("product.trust3")];

  return (
    <div className="bg-[var(--surface-page)]">
      {/* ------------------------------------------------------------------ */}
      {/* Cover. Type on paper, photography as a bleeding panel — deliberately
          not the glass card the existing hero is built around. On a phone the
          image leads, because a 46vh photograph is the thing that survives the
          drop to one column. */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-[var(--gt-ink-900)]">
        <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
          <div className={`order-2 flex flex-col justify-between gap-8 sm:gap-10 lg:order-1 ${GUTTER} py-7 sm:py-[clamp(36px,5vw,72px)]`}>
            <div className="grid gap-[clamp(20px,2.4vw,32px)]">
              {/* The one decorative-script moment above the fold, held on a rule. */}
              <span className="flex items-baseline gap-4 border-b border-[var(--border-subtle)] pb-3 sm:pb-4">
                <span className="gt-script text-[clamp(24px,3vw,38px)] leading-none text-[var(--gt-blue-700)]">
                  {t("home.heroEyebrow")}
                </span>
              </span>
              <h1
                className="text-[clamp(32px,4.4vw,58px)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
                dangerouslySetInnerHTML={{ __html: t("home.heroHeadline") }}
              />
              {/* Offset measure: the body copy starts a column in from the
                  headline, which is what makes the block read as a spread. */}
              <div className="grid gap-5 sm:gap-7 lg:pl-[16%]">
                <span aria-hidden="true" className="block h-px w-16 bg-[var(--accent-highlight)]" />
                {/* 16px on a phone, 18px from sm up: the larger size ran to four
                    lines at 375px and pushed the primary CTA under the fold. */}
                <p className="m-0 max-w-[46ch] text-[length:var(--text-body-md)] leading-[var(--leading-normal)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">
                  {t("home.heroBody")}
                </p>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                  <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
                    {t("home.ctaShopFull")}
                  </Button>
                  {/* Secondary path reads as a rule-and-arrow link, so the one
                      emerald button above the fold is unmistakably the primary. */}
                  <Link
                    to="/academy"
                    className="group inline-flex items-center gap-2 border-b border-[var(--gt-ink-900)] pb-1 text-[13px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)] transition-colors hover:text-[var(--accent-highlight-ink)] hover:border-[var(--accent-highlight)]"
                  >
                    {t("home.ctaAcademyFull")}
                    <ArrowUpRight
                      size={16}
                      aria-hidden="true"
                      className="transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>
              </div>
            </div>
            {/* The two hero figures, set as a ruled table rather than a floating
                glass chip. Display numerals do the work the glass used to. */}
            <div className="grid grid-cols-2 border-t border-[var(--gt-ink-900)]">
              {[
                { v: t("home.heroStat1Value"), l: t("home.heroStat1Label") },
                { v: t("home.heroStat2Value"), l: t("home.heroStat2Label") },
              ].map((stat, i) => (
                <div key={stat.l} className={`grid gap-1 pt-5 ${i === 0 ? "pr-6" : "border-l border-[var(--border-subtle)] pl-6"}`}>
                  <strong className="text-[clamp(30px,3.6vw,50px)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
                    {stat.v}
                  </strong>
                  <span className="max-w-[24ch] text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                    {stat.l}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Bleeds to the top, right and bottom of the viewport: the one hard
              edge that tells you this is a cover and not a card. */}
          <div className="gt-sparkle relative order-1 min-h-[26vh] border-b border-[var(--gt-ink-900)] bg-[var(--surface-brand)] sm:min-h-[38vh] lg:order-2 lg:min-h-[82vh] lg:border-b-0 lg:border-l">
            <img
              src={photo("mouth-02.jpg")}
              alt=""
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "50% 45%" }}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Reassurance. A thin ruled strip directly under the cover: expertise
          stated as a masthead line, not as a row of medical icons. */}
      {/* ------------------------------------------------------------------ */}
      <Section className={`${GUTTER} border-b border-[var(--border-subtle)] py-6`} aria-labelledby="alt-trust-label">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-4 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-10">
          <span id="alt-trust-label" className="gt-eyebrow whitespace-nowrap">{t("homeAlt.trustEyebrow")}</span>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3 sm:gap-0">
            {trust.map((line, i) => (
              <li
                key={line}
                className={`text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)] ${
                  i === 0 ? "sm:pr-6" : "sm:border-l sm:border-[var(--border-subtle)] sm:px-6"
                }`}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 01 — Shapes. The cuts as an index of drawn silhouettes in a ruled
          grid, instead of round tiles on a scrolling rail. */}
      {/* ------------------------------------------------------------------ */}
      <Section className={`${GUTTER} py-[var(--section-y)]`} aria-labelledby="alt-shapes-title">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-4">
              <Index n="01" />
              <span className="gt-eyebrow">{t("home.shapesEyebrow")}</span>
              <h2
                id="alt-shapes-title"
                className="max-w-[16ch] text-[clamp(26px,3.2vw,44px)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)]"
              >
                {t("home.shapesTitle")}
              </h2>
              <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)] lg:pl-[16%]">
                {t("home.shapesBody")}
              </p>
            </div>
            <Link
              to="/boutique?categorie=Gems"
              className="group inline-flex items-center gap-2 justify-self-start border-b border-[var(--gt-ink-900)] pb-1 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]"
            >
              {t("home.shapesCta")}
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:translate-x-1"
              />
            </Link>
          </div>
          {/* Hairline grid. Borders live on the cells rather than on a gap
              track, so an odd number of cuts degrades to an open edge instead
              of a grey hole. */}
          <div className="grid grid-cols-3 border-l border-t border-[var(--border-subtle)] md:grid-cols-9">
            {shapeGroups.map((group) => (
              <Link
                key={group.shape}
                to={shapeHref(group.shape)}
                aria-label={t("home.shapeTileAria", { shape: t(`shop.shapes.${group.shape}`), count: group.count })}
                className="group grid justify-items-center gap-3 border-b border-r border-[var(--border-subtle)] px-2 py-6 text-center transition-colors duration-[var(--duration-normal)] hover:bg-[var(--gt-blue-50)]"
              >
                <span className="text-[var(--gt-blue-700)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:-translate-y-1 group-hover:text-[var(--gt-ink-900)]">
                  <ShapeGlyph shape={group.shape} size={40} />
                </span>
                <span className="grid gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--gt-ink-900)]">
                    {t(`shop.shapes.${group.shape}`)}
                  </span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-subtle)]">
                    {t("home.shapeCount", { count: group.count })}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 02 — Categories. A full-bleed contact sheet: one lead plate, one wide
          plate, six squares, hairline-separated and square-cornered. */}
      {/* ------------------------------------------------------------------ */}
      <Section className="border-y border-[var(--gt-ink-900)]" aria-labelledby="alt-categories-title">
        <div className={`${GUTTER} py-[clamp(36px,4vw,56px)]`}>
          <div className="mx-auto grid max-w-[var(--max-width-content)] gap-4">
            <Index n="02" />
            <span className="gt-eyebrow">{t("home.categoriesEyebrow")}</span>
            <h2
              id="alt-categories-title"
              className="max-w-[16ch] text-[clamp(26px,3.2vw,44px)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)]"
            >
              {t("home.categoriesTitle")}
            </h2>
          </div>
        </div>
        <div
          className="grid grid-cols-2 gap-px bg-[var(--gt-ink-900)] [grid-auto-rows:150px] md:grid-cols-4 md:[grid-auto-rows:205px]"
        >
          {CATEGORY_TILES.map((tile, i) => {
            /* Indexes 0 and 5 carry the composition: 4 + 2 + 6 single cells fill
               three rows of four exactly, and two rows of two on a phone. */
            const isLead = i === 0;
            const wide = i === 5;
            return (
              <Link
                key={tile.key}
                to={tile.to}
                aria-label={t("home.categoryTileAria", { label: tile.label })}
                className={`group relative block overflow-hidden bg-[var(--surface-sunken)] ${
                  isLead ? "col-span-2 row-span-2" : wide ? "col-span-2" : ""
                }`}
              >
                <img
                  src={tile.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background: isLead
                      ? "linear-gradient(0deg, rgba(17,17,17,.82), rgba(17,17,17,.04) 52%)"
                      : "linear-gradient(0deg, rgba(17,17,17,.78), rgba(17,17,17,.06) 62%)",
                  }}
                />
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-3 text-[10px] font-semibold tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-200)]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="absolute inset-x-4 bottom-4 grid gap-1">
                  <span
                    className={`font-[var(--weight-black)] uppercase leading-none tracking-[var(--tracking-display)] text-[var(--gt-off-white)] ${
                      isLead ? "text-[clamp(20px,2.6vw,34px)]" : "text-[clamp(13px,1.3vw,17px)]"
                    }`}
                  >
                    {tile.label}
                  </span>
                  {tile.sub && (
                    <span className="text-[11px] font-medium uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-200)]">
                      {tile.sub}
                    </span>
                  )}
                  {/* Micro-interaction: a rule that draws itself under the label. */}
                  <span
                    aria-hidden="true"
                    className="mt-1 h-px w-0 bg-[var(--gt-off-white)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover:w-10"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 03 — Best sellers. Plates in ruled columns: no card border, no radius,
          no shadow. The picture is the product and the type sits under it. */}
      {/* ------------------------------------------------------------------ */}
      <Section className={`${GUTTER} py-[var(--section-y)]`} aria-labelledby="alt-best-title">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="mb-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-4">
              <Index n="03" />
              <span className="gt-eyebrow">{t("home.bestSellersEyebrow")}</span>
              <h2
                id="alt-best-title"
                className="text-[clamp(26px,3.2vw,44px)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)]"
              >
                {t("home.bestSellersTitle")}
              </h2>
            </div>
            <Link
              to="/boutique"
              className="group inline-flex items-center gap-2 justify-self-start border-b border-[var(--gt-ink-900)] pb-1 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]"
            >
              {t("home.bestSellersCta")}
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:translate-x-1"
              />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] lg:grid-cols-4">
            {featured.map((p, i) => {
              const name = pick(p.name, lang);
              const isSaved = saved[p.id] ?? false;
              const hoverImage = p.gallery?.[1]?.src;
              return (
                <article key={p.id} className="group relative grid content-start gap-4 bg-[var(--surface-page)] p-[clamp(10px,1.4vw,18px)]">
                  <div className="relative aspect-square overflow-hidden bg-[var(--surface-sunken)]">
                    <img
                      src={p.image}
                      alt=""
                      loading={i < 2 ? undefined : "lazy"}
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
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
                    {/* The single fuchsia moment on the page, spent on the one
                        product that has actually earned the claim. */}
                    {i === 0 && (
                      <span className="absolute left-0 top-0 bg-[var(--accent-highlight)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-white)]">
                        {t("home.bestSellerBadge")}
                      </span>
                    )}
                    {p.stock === "low" && (
                      <span className="absolute right-0 top-0">
                        <Badge tone="warning" size="sm">{t("product.stockLow")}</Badge>
                      </span>
                    )}
                    {p.stock === "out" && (
                      <span className="absolute right-0 top-0">
                        <Badge tone="error" size="sm">{t("product.stockOut")}</Badge>
                      </span>
                    )}
                    {/* Sibling of the stretched link below, never a child of it. */}
                    <button
                      type="button"
                      onClick={() => {
                        setSaved((s) => ({ ...s, [p.id]: !isSaved }));
                        showToast(t("product.toastSavedTitle"), t("product.toastSavedBody", { name }));
                      }}
                      aria-label={t("product.saveAria", { name })}
                      aria-pressed={isSaved}
                      className={`absolute bottom-0 right-0 z-10 flex h-9 w-9 items-center justify-center border border-[var(--gt-ink-900)] bg-[var(--gt-off-white)] transition-opacity focus-visible:opacity-100 ${
                        isSaved ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <Heart
                        size={15}
                        fill={isSaved ? "var(--accent-highlight)" : "none"}
                        color={isSaved ? "var(--accent-highlight)" : "currentColor"}
                      />
                    </button>
                  </div>
                  <div className="grid gap-1.5 border-t border-[var(--gt-ink-900)] pt-3">
                    <span aria-hidden="true" className="text-[10px] font-semibold tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-[length:var(--text-h4)] font-[var(--weight-bold)] leading-[var(--leading-snug)] text-[var(--gt-ink-900)]">
                      <Link
                        to={`/boutique/${p.id}`}
                        className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
                      >
                        {name}
                      </Link>
                    </h3>
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{pick(p.subtitle, lang)}</span>
                    <span className="flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      <Star size={11} fill="var(--gt-ink-900)" color="var(--gt-ink-900)" aria-hidden="true" />
                      <span aria-label={t("product.ratingAria", { rating: p.rating.toFixed(1), count: p.reviewCount })}>
                        {p.rating.toFixed(1)} ({p.reviewCount})
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2 pt-1">
                      <strong className="text-[length:var(--text-h3)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--gt-ink-900)]">
                        {formatPrice(p.price)}
                      </strong>
                      {p.compareAtPrice && (
                        <span className="text-[length:var(--text-caption)] text-[var(--text-subtle)] line-through">
                          {formatPrice(p.compareAtPrice)}
                        </span>
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 04 — Academy. The ink spread. Learning is one sustained page rather
          than three course cards, so "become an expert" reads as a different
          offer from "shop the gems" without leaving the identity. */}
      {/* ------------------------------------------------------------------ */}
      <Section
        className={`${GUTTER} bg-[var(--surface-inverse)] py-[var(--section-y)] text-[var(--text-inverse)]`}
        aria-labelledby="alt-academy-title"
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-[clamp(40px,5vw,72px)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-6 lg:sticky lg:top-[120px] lg:self-start">
            <Index n="04" tone="paper" />
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
              {t("home.academyEyebrow")}
            </span>
            <h2
              id="alt-academy-title"
              className="text-[clamp(26px,3.2vw,44px)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]"
            >
              {t("home.academyTitle")}
            </h2>
            <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--gt-ink-300)]">
              {t("home.academyFootnote")}
            </p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="justify-self-start" onClick={() => navigate("/academy")}>
              {t("home.academyCta")}
            </Button>
          </div>
          {/* Courses as a syllabus: numbered rows, thumbnail, metadata, price. */}
          <ul className="m-0 grid list-none gap-0 border-t border-[var(--gt-ink-700)] p-0">
            {COURSES.map((c, i) => {
              const title = pick(c.title, lang);
              return (
                <li key={c.id} className="border-b border-[var(--gt-ink-700)]">
                  <button
                    type="button"
                    /* The training's own page, open to everyone, like every
                       other course card: the account belongs to the purchase. */
                    onClick={() => navigate(courseHref(c.id))}
                    /* Below sm the price drops under the title instead of
                       squeezing it: a three-line course name beside a price
                       column is the one place this row stopped feeling premium
                       on a phone. */
                    className="group grid w-full grid-cols-[auto_56px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-5 text-left transition-colors duration-[var(--duration-normal)] hover:bg-[var(--gt-ink-800)] sm:grid-cols-[auto_72px_minmax(0,1fr)_auto] sm:gap-x-6 sm:gap-y-0 sm:py-7"
                  >
                    <span aria-hidden="true" className="text-[11px] font-semibold tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <img
                      src={c.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-[56px] w-[56px] object-cover grayscale transition-[filter] duration-[var(--duration-slow)] group-hover:grayscale-0 sm:h-[72px] sm:w-[72px]"
                    />
                    <span className="grid min-w-0 gap-1.5">
                      <span className="text-[clamp(16px,1.7vw,22px)] font-[var(--weight-bold)] leading-[var(--leading-snug)] text-[var(--gt-off-white)]">
                        {title}
                      </span>
                      <span className="text-[length:var(--text-caption)] uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-300)]">
                        {pick(c.level, lang)} · {t("course.lessonCount", { count: c.lessonCount })} · {c.duration}
                      </span>
                    </span>
                    <span className="col-start-3 row-start-2 flex items-center gap-3 justify-self-start sm:col-start-4 sm:row-start-1 sm:justify-self-end">
                      <strong className="text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--gt-off-white)]">
                        {formatPrice(c.price)}
                      </strong>
                      <ArrowUpRight
                        size={18}
                        aria-hidden="true"
                        className="text-[var(--gt-blue-300)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 05 — Reviews. One customer gets the page: an oversized pull quote, the
          rest set as ruled margin notes. Verified, rated and dated exactly as
          before — the proof is unchanged, only its weight. */}
      {/* ------------------------------------------------------------------ */}
      <Section className={`${GUTTER} py-[var(--section-y)]`} aria-labelledby="alt-reviews-title">
        <div className="mx-auto max-w-[var(--max-width-content)]">
          <div className="grid gap-4 border-b border-[var(--gt-ink-900)] pb-8">
            <Index n="05" />
            <span className="gt-eyebrow">{t("home.reviewsEyebrow")}</span>
            <h2
              id="alt-reviews-title"
              className="text-[length:var(--text-h2)] font-[var(--weight-bold)] tracking-[var(--tracking-tight)]"
            >
              {t("home.reviewsTitle")}
            </h2>
          </div>
          <figure className="m-0 grid gap-8 py-[clamp(36px,5vw,64px)] lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-12">
            {/* Decorative accent, carrying no information of its own. Set in
                Montserrat rather than the script face: the script's quote glyph
                is a hairline mark in a 2em line box, which reads as a rendering
                fault and pushes the quote down the column. The page already
                spends its script moments on the eyebrow and the gift title. */}
            <span
              aria-hidden="true"
              className="hidden select-none text-[clamp(90px,10vw,150px)] font-[var(--weight-black)] leading-[.72] text-[var(--gt-blue-300)] lg:block"
            >
              “
            </span>
            <div className="grid gap-8">
              <blockquote className="m-0 max-w-[24ch] text-[clamp(26px,3.6vw,52px)] font-[var(--weight-bold)] leading-[var(--leading-snug)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
                {pick(lead.body, lang)}
              </blockquote>
              <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-5">
                <Stars rating={lead.rating} label={t("review.starsAria", { rating: lead.rating })} />
                <strong className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-900)]">{lead.author}</strong>
                <span className="text-[length:var(--text-caption)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                  {lead.date} · {lead.locale}
                </span>
                <Badge tone="success" size="sm">{t("review.verified")}</Badge>
              </figcaption>
            </div>
          </figure>
          <div className="grid gap-8 border-t border-[var(--gt-ink-900)] pt-8 sm:grid-cols-2 sm:gap-0">
            {rest.map((r) => (
              <article
                key={r.author}
                className="grid content-start gap-3 sm:border-l sm:border-[var(--border-subtle)] sm:px-8 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Stars rating={r.rating} label={t("review.starsAria", { rating: r.rating })} />
                  <strong className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-900)]">{r.author}</strong>
                  <span className="ml-auto text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {r.date} · {r.locale}
                  </span>
                </div>
                <h3 className="text-[length:var(--text-h4)] font-[var(--weight-bold)] text-[var(--gt-ink-900)]">{pick(r.title, lang)}</h3>
                <p className="m-0 max-w-[48ch] text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
                  {pick(r.body, lang)}
                </p>
                <span className="justify-self-start pt-1">
                  <Badge tone="success" size="sm">{t("review.verified")}</Badge>
                </span>
              </article>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 06 — Gift card. The pastel blue used the way the brief asks for it:
          one large flat field, with the photograph breaking its top edge. */}
      {/* ------------------------------------------------------------------ */}
      <Section className="relative bg-[var(--surface-brand)]" aria-labelledby="alt-gift-title">
        <div className={`${GUTTER} pb-[var(--section-y)] pt-[clamp(36px,5vw,64px)]`}>
          <div className="mx-auto grid max-w-[var(--max-width-content)] items-center gap-[clamp(32px,5vw,72px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Lifted out of the band, so the image and the field overlap
                instead of sitting side by side in two equal boxes. */}
            <div className="gt-sparkle relative aspect-[4/5] w-full overflow-hidden bg-[var(--gt-blue-200)] lg:-mt-[clamp(48px,7vw,110px)] lg:mb-[clamp(20px,3vw,48px)]">
              <img
                src={photo("mouth-05.jpg")}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div className="grid gap-6">
              <Index n="06" />
              <span className="justify-self-start">
                <Badge tone="highlight" size="sm">{t("home.giftBadge")}</Badge>
              </span>
              {/* Editorial accent: short, decorative, not carrying essential detail. */}
              <h2 id="alt-gift-title" className="gt-script m-0 text-[clamp(44px,6.5vw,86px)] font-normal tracking-normal text-[var(--gt-ink-900)]">
                {t("home.giftTitle")}
              </h2>
              <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] leading-[var(--leading-normal)] text-[var(--gt-ink-800)]">
                {t("home.giftBody")}
              </p>
              <ul className="m-0 grid list-none gap-0 border-t border-[var(--gt-blue-500)] p-0">
                {[t("home.giftBullet1"), t("home.giftBullet2"), t("home.giftBullet3")].map((bullet, i) => (
                  <li
                    key={bullet}
                    className="grid grid-cols-[28px_minmax(0,1fr)] items-baseline gap-3 border-b border-[var(--gt-blue-500)] py-3.5 text-[length:var(--text-body-sm)] text-[var(--gt-ink-800)]"
                  >
                    <span aria-hidden="true" className="text-[10px] font-semibold tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {bullet}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="lg"
                iconRight={ArrowRight}
                className="justify-self-start"
                onClick={() => navigate("/boutique")}
              >
                {t("home.giftCta")}
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 07 — Newsletter. Explicit consent, inline validation and the inline
          success state are the existing behaviour, verbatim. The form is set as
          ruled fields rather than pill inputs in a floating card. */}
      {/* ------------------------------------------------------------------ */}
      <Section className={`${GUTTER} border-t border-[var(--gt-ink-900)] py-[var(--section-y)]`} aria-labelledby="alt-newsletter-title">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-[clamp(32px,5vw,72px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="grid content-start gap-5">
            <Index n="07" />
            <span className="gt-eyebrow">{t("home.newsletterEyebrow")}</span>
            <h2
              id="alt-newsletter-title"
              className="max-w-[14ch] text-[clamp(26px,3.2vw,44px)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)]"
            >
              {t("home.newsletterTitle")}
            </h2>
            <p className="m-0 max-w-[46ch] text-[length:var(--text-body-md)] leading-[var(--leading-normal)] text-[var(--text-body)] lg:pl-[14%]">
              {t("home.newsletterBody")}
            </p>
          </div>
          <div className="grid content-start gap-5 border-t border-[var(--gt-ink-900)] pt-8">
            {subscribed ? (
              /* An inline success state: a toast disappears after 3.6s and leaves
                 the form looking untouched. */
              <div className="gt-celebrate grid justify-items-start gap-3">
                <Badge tone="success" icon={CheckCircle2}>{t("home.newsletterSuccessTitle")}</Badge>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("home.newsletterSuccessBody")}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <label
                    htmlFor="alt-newsletter-email"
                    className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]"
                  >
                    {t("home.newsletterEmailLabel")}
                  </label>
                  <input
                    id="alt-newsletter-email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("home.newsletterEmailPlaceholder")}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? "alt-newsletter-error" : undefined}
                    className="h-12 border-b bg-transparent px-0 text-[length:var(--text-body-lg)] text-[var(--gt-ink-900)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]"
                    style={{ borderBottomColor: emailError ? "var(--status-error-fg)" : "var(--gt-ink-900)" }}
                  />
                  {emailError && (
                    <p id="alt-newsletter-error" role="alert" className="m-0 text-xs font-medium text-[var(--status-error-fg)]">
                      {emailError}
                    </p>
                  )}
                </div>
                <Checkbox
                  label={t("home.newsletterCheckboxLabel")}
                  description={t("home.newsletterCheckboxDescription")}
                  checked={optIn}
                  onChange={setOptIn}
                />
                <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} disabled={!optIn} onClick={subscribe}>
                  {t("home.newsletterSubmit")}
                </Button>
              </>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
