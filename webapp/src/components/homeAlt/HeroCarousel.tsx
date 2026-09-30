import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { SmileCanvas } from "../studio/SmileCanvas";
import { GemIcon } from "../studio/Gem";
import { NewTag } from "../studio/NewTag";
import { COMPOSITIONS } from "../../data/studio";
import { GEMS_CATEGORY, shopHref } from "../../data/taxonomy";
import { useTaxonomy } from "../../lib/catalog/useTaxonomy";
import { photo } from "../../lib/images";
import { STUDIO_PATH } from "../../lib/studioUrl";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** How long a slide stays up while the carousel rotates on its own. */
const DWELL_MS = 7000;
/** Horizontal travel, in px, that turns a touch drag into a slide change. */
const SWIPE_PX = 48;

type SlideId = "shop" | "academy" | "studio";
const SLIDES: SlideId[] = ["shop", "academy", "studio"];

/**
 * The home page's opening: one slide per Global Toothgems experience — the
 * shop, the Academy, the 3D Studio.
 *
 * Built on the WAI-ARIA tabbed-carousel pattern. The picker is a tablist
 * (arrow keys move between experiences), each slide is a labelled tabpanel,
 * and the slides that are not showing are `inert`, so their calls to action
 * are never reached by Tab. Rotation is a convenience, never a requirement:
 * it has a visible pause control, halts while the pointer or keyboard focus is
 * inside the carousel, and never starts for readers who ask for less motion.
 *
 * The progress line under the active tab is the timer: when its CSS animation
 * ends the next slide comes up, so pausing the animation pauses the carousel
 * with no second clock to keep in step.
 */
export function HeroCarousel() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchX = useRef<number | null>(null);

  const autoplay = !reduced && !userPaused;
  const running = autoplay && !hovered && !focused;
  const total = SLIDES.length;

  const go = useCallback((next: number) => setIndex(((next % total) + total) % total), [total]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: total - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = ((moves[e.key] % total) + total) % total;
    go(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("homeAlt.hero.label")}
      className="gt-alt-hero relative grid w-full overflow-hidden"
      data-slide={SLIDES[index]}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null || Math.abs(end - start) < SWIPE_PX) return;
        go(index + (end < start ? 1 : -1));
      }}
    >
      {/* Every slide shares one grid cell, so the carousel is as tall as its
          tallest slide and nothing below it moves when the slide changes. */}
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1" aria-live={running ? "off" : "polite"}>
        {SLIDES.map((id, i) => (
          <div
            key={id}
            id={`gt-alt-slide-${id}`}
            role="tabpanel"
            aria-roledescription="slide"
            aria-labelledby={`gt-alt-tab-${id}`}
            aria-label={t("homeAlt.hero.slideLabel", { index: i + 1, total })}
            inert={i !== index}
            data-active={i === index}
            className="gt-alt-slide"
          >
            {id === "shop" && <ShopSlide />}
            {id === "academy" && <AcademySlide />}
            {id === "studio" && <StudioSlide />}
          </div>
        ))}
      </div>

      {/* Controls: the experience picker with its timer, then pause and step. */}
      <div className="gt-alt-hero-controls relative z-[2] w-full px-[var(--gt-alt-gutter)] pb-5 pt-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:pb-7 lg:pt-0">
        <div className="gt-alt-wide flex items-center gap-3 sm:gap-5">
          <div role="tablist" aria-label={t("homeAlt.hero.pickerLabel")} className="flex min-w-0 flex-1 gap-2 sm:gap-4">
            {SLIDES.map((id, i) => {
              const active = i === index;
              return (
                <button
                  key={id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  id={`gt-alt-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`gt-alt-slide-${id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => go(i)}
                  onKeyDown={onTabKey}
                  className={clsx(
                    "gt-alt-tab group grid min-h-11 min-w-0 content-start gap-2 rounded-[var(--radius-xs)] pt-2 text-left sm:max-w-[240px] sm:flex-1",
                    // On a phone only the showing experience is named; the others keep their number.
                    active ? "flex-1" : "w-11 flex-none sm:w-auto",
                  )}
                >
                  <span className="gt-alt-tab-track relative block h-[2px] w-full overflow-hidden rounded-full">
                    <span
                      key={active ? `run-${index}` : "idle"}
                      aria-hidden="true"
                      className={clsx("gt-alt-tab-fill absolute inset-0 block rounded-full", active && autoplay && "gt-alt-tab-fill--timed")}
                      style={{
                        animationDuration: `${DWELL_MS}ms`,
                        animationPlayState: running ? "running" : "paused",
                      }}
                      onAnimationEnd={active ? () => go(index + 1) : undefined}
                    />
                  </span>
                  <span className="flex items-baseline gap-2 truncate text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)]">
                    <span aria-hidden="true" className="gt-alt-tab-num tabular-nums">0{i + 1}</span>
                    <span className={clsx("truncate", !active && "sr-only sm:not-sr-only")}>{t(`homeAlt.hero.${id}.tab`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-none items-center gap-1.5 sm:gap-2">
            {!reduced && (
              <IconButton
                icon={userPaused ? Play : Pause}
                label={userPaused ? t("homeAlt.hero.play") : t("homeAlt.hero.pause")}
                variant="glass"
                size="md"
                onClick={() => setUserPaused((p) => !p)}
              />
            )}
            <IconButton icon={ChevronLeft} label={t("homeAlt.hero.prev")} variant="glass" size="md" onClick={() => go(index - 1)} />
            <IconButton icon={ChevronRight} label={t("homeAlt.hero.next")} variant="glass" size="md" onClick={() => go(index + 1)} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Shared scaffold: copy then visual on a wide screen; the visual leads on a phone. */
function SlideLayout({ copy, visual }: { copy: ReactNode; visual: ReactNode }) {
  return (
    <div className="gt-alt-wide grid h-full grid-cols-[minmax(0,1fr)] items-center gap-8 px-[var(--gt-alt-gutter)] pb-4 pt-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-[clamp(32px,5vw,96px)] lg:pb-[104px] lg:pt-12">
      <div className="gt-alt-slide-copy order-2 grid min-w-0 content-center justify-items-start gap-5 lg:order-1 lg:gap-6">
        {copy}
      </div>
      <div className="gt-alt-slide-visual relative order-1 min-w-0 lg:order-2">{visual}</div>
    </div>
  );
}

function SlideTitle({ children, inverse = false }: { children: ReactNode; inverse?: boolean }) {
  return (
    <h2
      className={clsx(
        "max-w-[18ch] text-balance text-[clamp(34px,4.3vw,72px)] font-[var(--weight-black)] leading-[1.02] tracking-[var(--tracking-display)]",
        inverse ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]",
      )}
    >
      {children}
    </h2>
  );
}

function ShopSlide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { taxonomy, categoryName } = useTaxonomy();
  return (
    <div className="gt-alt-hero-shop h-full">
      <SlideLayout
        copy={
          <>
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.hero.shop.eyebrow")}</span>
            <SlideTitle>{t("homeAlt.hero.shop.title")}</SlideTitle>
            <p className="m-0 max-w-[48ch] text-[16px] text-[var(--gt-ink-700)] lg:text-[length:var(--text-body-lg)]">{t("homeAlt.hero.shop.body")}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta" onClick={() => navigate("/boutique")}>
                {t("homeAlt.hero.shop.cta")}
              </Button>
              <Button variant="glass" size="lg" onClick={() => navigate(shopHref(GEMS_CATEGORY))}>
                {t("homeAlt.hero.shop.ctaSecondary")}
              </Button>
            </div>
            <nav aria-label={t("homeAlt.hero.shop.chipsLabel")} className="hidden pt-2 sm:block">
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {taxonomy.map(({ slug }) => (
                  <li key={slug}>
                    <Link
                      to={shopHref(slug)}
                      className="inline-flex h-9 items-center rounded-[var(--radius-pill)] border border-[var(--gt-blue-400)] bg-white/40 px-4 text-[12px] font-semibold text-[var(--gt-ink-900)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--gt-ink-900)] hover:bg-white/80"
                    >
                      {categoryName(slug)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        }
        visual={
          <div className="relative mx-auto aspect-[16/10] w-full max-w-[880px] lg:aspect-square lg:h-[min(640px,calc(100svh-230px))] lg:w-auto lg:max-w-full">
            <div className="gt-alt-slide-media absolute inset-0 overflow-hidden rounded-[var(--radius-2xl)] shadow-[var(--shadow-glass-heavy)]">
              <img
                src={photo("mouth-01.jpg")}
                alt=""
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
                style={{ objectPosition: "50% 55%" }}
              />
            </div>
            {/* Loose stones on the blue, beside the photo: product cut-outs on
                white, multiplied into the backdrop so only the gem remains. */}
            <img src={photo("img-04.jpg")} alt="" aria-hidden="true" className="gt-alt-cutout gt-alt-float absolute -left-[15%] top-[6%] hidden w-[16%] max-w-[112px] lg:block" />
            <img src={photo("img-14.jpg")} alt="" aria-hidden="true" className="gt-alt-cutout gt-alt-float gt-alt-float--late absolute -left-[13%] bottom-[22%] hidden w-[15%] max-w-[104px] lg:block" />
            <div className="gt-glass-panel gt-glass-panel-compact absolute -bottom-4 right-4 flex items-center gap-3 rounded-[var(--radius-lg)] py-2.5 pl-2.5 pr-5 sm:right-8 lg:-bottom-5 lg:right-auto lg:left-[8%]">
              <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[var(--radius-md)] bg-white">
                <img src={photo("img-04.jpg")} alt="" className="h-10 w-10 object-contain" />
              </span>
              <span className="grid gap-0.5">
                <NewTag className="justify-self-start" />
                <span className="text-[13px] font-bold text-[var(--gt-ink-900)]">{t("homeAlt.hero.shop.floatName")}</span>
              </span>
            </div>
          </div>
        }
      />
    </div>
  );
}

function AcademySlide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const steps = ["step1", "step2", "step3"] as const;
  return (
    <div className="gt-alt-hero-academy h-full">
      <SlideLayout
        copy={
          <>
            <span className="gt-eyebrow !text-[var(--gt-blue-300)]">{t("homeAlt.hero.academy.eyebrow")}</span>
            <SlideTitle inverse>{t("homeAlt.hero.academy.title")}</SlideTitle>
            <p className="m-0 max-w-[46ch] text-[16px] text-[var(--gt-ink-300)] lg:text-[length:var(--text-body-lg)]">{t("homeAlt.hero.academy.body")}</p>
            <ol className="m-0 grid list-none gap-2.5 p-0 sm:flex sm:flex-wrap sm:gap-x-6">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-2.5 text-[14px] font-semibold text-[var(--gt-off-white)]">
                  <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full border border-white/25 text-[11px] tabular-nums text-[var(--gt-blue-300)]">
                    {i + 1}
                  </span>
                  {t(`homeAlt.hero.academy.${s}`)}
                </li>
              ))}
            </ol>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta" onClick={() => navigate("/academy")}>
              {t("homeAlt.hero.academy.cta")}
            </Button>
          </>
        }
        visual={
          <div className="relative mx-auto flex h-full w-full max-w-[640px] items-center justify-center py-2">
            {/* The photographs are 640 px masters: framed tall and narrow
                rather than stretched across the slide. */}
            <div className="gt-alt-slide-media gt-alt-arch relative aspect-[4/5] h-[clamp(240px,64vw,320px)] overflow-hidden lg:h-[min(600px,calc(100svh-230px))]">
              <img src={photo("mouth-04.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
            <figure className="gt-alt-float absolute bottom-[4%] left-0 m-0 grid w-[38%] max-w-[210px] gap-2 sm:left-[4%]">
              <span className="block aspect-square overflow-hidden rounded-full border-4 border-[var(--gt-ink-900)] shadow-[var(--shadow-lg)]">
                <img src={photo("img-12.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </span>
              <figcaption className="justify-self-center rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-off-white)] ring-1 ring-white/20 backdrop-blur-sm">
                {t("homeAlt.hero.academy.caption")}
              </figcaption>
            </figure>
          </div>
        }
      />
    </div>
  );
}

function StudioSlide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="gt-alt-hero-studio relative h-full">
      <div aria-hidden="true" className="gt-studio-hero-grid pointer-events-none absolute inset-0" />
      <SlideLayout
        copy={
          <>
            <span className="gt-eyebrow inline-flex items-center gap-2 !text-[var(--gt-blue-700)]">
              {t("homeAlt.hero.studio.eyebrow")}
              <NewTag />
            </span>
            <SlideTitle>{t("homeAlt.hero.studio.title")}</SlideTitle>
            <p className="m-0 max-w-[46ch] text-[16px] text-[var(--gt-ink-700)] lg:text-[length:var(--text-body-lg)]">{t("homeAlt.hero.studio.body")}</p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta" onClick={() => navigate(STUDIO_PATH)}>
              {t("homeAlt.hero.studio.cta")}
            </Button>
          </>
        }
        visual={
          <div className="relative mx-auto w-full max-w-[860px]">
            <div className="gt-alt-slide-media gt-studio-stage overflow-hidden rounded-[var(--radius-2xl)] shadow-[var(--shadow-glass-heavy)] ring-1 ring-white/40">
              <SmileCanvas pieces={COMPOSITIONS.signature} label={t("homeAlt.hero.studio.canvasLabel")} className="block aspect-[16/10] w-full" />
            </div>
            <span aria-hidden="true" className="gt-alt-float gt-glass absolute -left-3 top-[12%] hidden items-center gap-2 rounded-[var(--radius-pill)] py-1.5 pl-1.5 pr-3.5 text-[12px] font-semibold text-[var(--gt-ink-900)] sm:inline-flex lg:-left-8">
              <GemIcon shape="heart" material="gold" size={26} />
              {t("homeAlt.hero.studio.chipShape")}
            </span>
            <span aria-hidden="true" className="gt-alt-float gt-alt-float--late gt-glass absolute -right-2 bottom-[16%] hidden items-center gap-2 rounded-[var(--radius-pill)] py-1.5 pl-1.5 pr-3.5 text-[12px] font-semibold text-[var(--gt-ink-900)] sm:inline-flex lg:-right-6">
              <GemIcon shape="star" material="gold" size={26} />
              {t("homeAlt.hero.studio.chipMaterial")}
            </span>
            <span aria-hidden="true" className="gt-glass absolute -bottom-4 left-[10%] hidden items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 py-2 text-[12px] font-semibold text-[var(--gt-ink-900)] sm:inline-flex">
              <Check size={14} className="text-[var(--accent-cta-ink)]" />
              {t("homeAlt.hero.studio.chipSaved")}
            </span>
          </div>
        }
      />
    </div>
  );
}
