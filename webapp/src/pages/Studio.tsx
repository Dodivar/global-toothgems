import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowRight,
  Box,
  Camera,
  Check,
  Film,
  Layers,
  MousePointer2,
  Play,
  Repeat,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { StudioMockup } from "../components/studio/StudioMockup";
import { GemIcon } from "../components/studio/Gem";
import { MATERIAL_SWATCH } from "../components/studio/gemStyle";
import { SmileCanvas } from "../components/studio/SmileCanvas";
import { StudioFeatures } from "../components/studio/StudioFeatures";
import { MediaPlaceholder } from "../components/studio/MediaPlaceholder";
import { InspirationBoards } from "../components/studio/InspirationBoards";
import { StudioSteps } from "../components/studio/StudioSteps";
import { StudioPricingCard } from "../components/studio/StudioPricingCard";
import { StudioFaq } from "../components/studio/StudioFaq";
import { NewTag } from "../components/studio/NewTag";
import { formatPrice } from "../lib/format";
import { useReveal } from "../lib/useReveal";
import { useToast } from "../lib/toast";
import { COMPOSITIONS, STUDIO_PRICE, type CompositionId } from "../data/studio";
import { STUDIO_SUBSCRIBE_PATH } from "../lib/studioUrl";

/**
 * The 3D Studio's public presentation page.
 *
 * Open to everyone, like the Academy and Loyalty sales pages. It walks a
 * first-time visitor from "what is this?" to "I want to try": a hero with the
 * Studio itself, the concept, the six capabilities, a media wall still waiting
 * for real renders, inspiration boards, three steps, the offer and the
 * questions. Every Studio surface on it is a mockup (see `StudioMockup`).
 */

const SECTION_X = "px-[clamp(14px,4vw,48px)]";

function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  align = "left",
  inverse,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  align?: "left" | "center";
  inverse?: boolean;
}) {
  return (
    <div className={clsx("grid max-w-[640px] gap-3", align === "center" && "mx-auto justify-items-center text-center")}>
      <span className={clsx("gt-eyebrow", inverse && "text-[var(--gt-blue-300)]")}>{eyebrow}</span>
      <h2
        id={id}
        className={clsx(
          "text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]",
          inverse && "text-[var(--gt-off-white)]",
        )}
      >
        {title}
      </h2>
      {body && (
        <p className={clsx("m-0 text-[length:var(--text-body-lg)]", inverse ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]")}>{body}</p>
      )}
    </div>
  );
}

export function Studio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const price = formatPrice(STUDIO_PRICE.amount, undefined, STUDIO_PRICE.currency);

  const conceptRef = useReveal<HTMLElement>();
  const featuresRef = useReveal<HTMLElement>();
  const showcaseRef = useReveal<HTMLElement>();
  const inspirationRef = useReveal<HTMLElement>();
  const stepsRef = useReveal<HTMLElement>();
  const offerRef = useReveal<HTMLElement>();
  const faqRef = useReveal<HTMLElement>();

  /* The phone call-to-action bar appears once the hero's own buttons have
     scrolled away, so a thumb always has "Start creating" within reach. */
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const start = () => navigate(STUDIO_SUBSCRIBE_PATH);
  const discover = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("decouvrir")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const [compareStyle, setCompareStyle] = useState<CompositionId>("statement");

  return (
    <div className="gt-studio overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-studio-title" className={clsx("gt-studio-hero relative overflow-hidden pb-[clamp(48px,7vw,96px)] pt-[clamp(36px,6vw,80px)]", SECTION_X)}>
        <div aria-hidden="true" className="gt-studio-hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,4vw,56px)] lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div className="grid min-w-0 justify-items-start gap-5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/70 py-1 pl-2.5 pr-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
              <Box size={13} aria-hidden="true" />
              {t("studio.hero.eyebrow")}
              <NewTag />
            </span>
            <span className="gt-script -mb-2 text-[clamp(28px,3.4vw,42px)] text-[var(--gt-blue-700)]">{t("studio.hero.script")}</span>
            <h1 id="gt-studio-title" className="text-[length:var(--text-display-1)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
              {t("studio.hero.title")}
            </h1>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.hero.body")}</p>
            <div ref={heroCtaRef} className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={start} className="gt-studio-cta">
                {t("studio.hero.ctaPrimary")}
              </Button>
              <Button variant="outline" size="lg" iconRight={ArrowDown} onClick={discover}>
                {t("studio.hero.ctaSecondary")}
              </Button>
            </div>
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)]">
                <strong className="text-[20px] font-[var(--weight-black)]">{price}</strong>{" "}
                <span className="font-semibold">{t("studio.pricing.perMonth")}</span>
              </span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--gt-ink-300)]" />
              {t("studio.pricing.reassuranceShort")}
            </p>
          </div>

          <div className="relative min-w-0">
            <div aria-hidden="true" className="gt-studio-halo pointer-events-none absolute -inset-10" />
            <StudioMockup variant="full" initial="signature" className="relative" />
            {/* Floating UI moments: decorative echoes of the window, not controls. */}
            <div aria-hidden="true" className="gt-studio-float gt-glass absolute -left-8 bottom-[16%] hidden items-center gap-2.5 rounded-[var(--radius-lg)] p-2 pr-3.5 lg:flex">
              <GemIcon shape="heart" material="gold" size={30} />
              <span className="grid">
                <strong className="text-[12px] text-[var(--gt-ink-900)]">{t("studio.hero.floatPiece")}</strong>
                <span className="text-[10.5px] text-[var(--text-muted)]">{t("studio.hero.floatPieceSub")}</span>
              </span>
            </div>
            <div
              aria-hidden="true"
              className="gt-studio-float gt-studio-float--late gt-glass absolute -bottom-5 right-6 hidden items-center gap-2 rounded-[var(--radius-pill)] py-1.5 pl-2 pr-3.5 text-[11.5px] font-semibold text-[var(--status-success-fg)] sm:flex"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--status-success-bg)]">
                <Check size={12} strokeWidth={3} />
              </span>
              {t("studio.hero.floatSaved")}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Concept */}
      <section id="decouvrir" ref={conceptRef} aria-labelledby="gt-studio-concept" className={clsx("gt-reveal scroll-mt-24 py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,72px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="grid gap-6">
            <SectionHeading id="gt-studio-concept" eyebrow={t("studio.concept.eyebrow")} title={t("studio.concept.title")} body={t("studio.concept.body")} />
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                { icon: Layers, key: "combine" },
                { icon: MousePointer2, key: "position" },
                { icon: Repeat, key: "explore" },
              ].map(({ icon: Icon, key }) => (
                <li key={key} className="grid content-start gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
                  <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                    <Icon size={16} />
                  </span>
                  <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t(`studio.concept.points.${key}.title`)}</strong>
                  <span className="text-[length:var(--text-caption)] leading-relaxed text-[var(--text-muted)]">{t(`studio.concept.points.${key}.body`)}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 flex items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] p-4 text-[length:var(--text-body-sm)] text-[var(--gt-ink-700)]">
              <Sparkles size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
              {t("studio.concept.playground")}
            </p>
          </div>

          <div className="relative px-2 py-6 sm:px-8">
            <div aria-hidden="true" className="gt-studio-halo pointer-events-none absolute inset-0" />
            <StudioMockup variant="compact" initial="mixed" className="relative" />
            {/* Floating panels around the stage */}
            <div aria-hidden="true" className="gt-studio-float gt-glass absolute -left-1 top-0 hidden w-[168px] gap-2 rounded-[var(--radius-lg)] p-3 sm:grid">
              <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-muted)]">{t("studio.mockup.library")}</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["round", "heart", "star", "drop", "flower", "navette"] as const).map((shape, i) => (
                  <span key={shape} className="grid aspect-square place-items-center rounded-[var(--radius-sm)] bg-white/80">
                    <GemIcon shape={shape} material={i === 1 || i === 2 ? "gold" : i === 3 ? "emerald" : i === 4 ? "opal" : "crystal"} size={22} />
                  </span>
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="gt-studio-float gt-studio-float--late gt-glass absolute -right-1 bottom-2 hidden w-[190px] gap-2.5 rounded-[var(--radius-lg)] p-3 sm:grid">
              <span className="flex items-center justify-between text-[10.5px] font-semibold text-[var(--text-muted)]">
                {t("studio.mockup.size")}
                <span className="text-[var(--gt-ink-900)]">{t("studio.mockup.sizeValue", { value: "2.4" })}</span>
              </span>
              <span className="relative h-1 rounded-full bg-[var(--gt-ink-200)]">
                <span className="absolute inset-y-0 left-0 w-[58%] rounded-full bg-[var(--gt-ink-900)]" />
                <span className="absolute left-[58%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--gt-ink-900)] shadow" />
              </span>
              <span className="flex gap-1.5">
                {(["crystal", "gold", "rose", "emerald"] as const).map((m, i) => (
                  <span key={m} className={clsx("h-5 w-5 rounded-full border-2", i === 1 ? "border-[var(--gt-ink-900)]" : "border-white")} style={{ background: MATERIAL_SWATCH[m] }} />
                ))}
              </span>
            </div>
            <div aria-hidden="true" className="gt-studio-float gt-glass absolute right-6 top-3 hidden items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 text-[11px] font-semibold text-[var(--gt-ink-900)] md:flex">
              <span className="h-3.5 w-6 rounded-full bg-[var(--gt-emerald-400)] p-0.5">
                <span className="block h-2.5 w-2.5 translate-x-2.5 rounded-full bg-white" />
              </span>
              {t("studio.mockup.symmetry")}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Features */}
      <section ref={featuresRef} aria-labelledby="gt-studio-features" className={clsx("gt-reveal bg-[var(--surface-sunken)] py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <SectionHeading id="gt-studio-features" eyebrow={t("studio.features.eyebrow")} title={t("studio.features.title")} body={t("studio.features.body")} />
          <StudioFeatures />
        </div>
      </section>

      {/* ------------------------------------------------------------ Showcase */}
      {/* REPLACEABLE CONTENT — every tile below is a MediaPlaceholder waiting
          for a real render, recording or member creation (see data-placeholder). */}
      <section ref={showcaseRef} aria-labelledby="gt-studio-showcase" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading id="gt-studio-showcase" eyebrow={t("studio.showcase.eyebrow")} title={t("studio.showcase.title")} body={t("studio.showcase.body")} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-[repeat(3,minmax(150px,auto))]">
            <MediaPlaceholder
              tag={t("studio.showcase.tags.video")}
              caption={t("studio.showcase.captions.video")}
              icon={Film}
              tone="ink"
              className="col-span-2 aspect-[16/10] lg:row-span-2 lg:aspect-auto"
              action={
                <button
                  type="button"
                  onClick={() => showToast(t("studio.showcase.videoToastTitle"), t("studio.showcase.videoToastBody"), "info")}
                  aria-label={t("studio.showcase.play")}
                  className="gt-studio-play grid h-16 w-16 place-items-center rounded-full bg-white/90 text-[var(--gt-ink-900)] shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-normal)] hover:scale-105"
                >
                  <Play size={22} fill="currentColor" aria-hidden="true" className="translate-x-0.5" />
                </button>
              }
            >
              <div className="w-[118%] opacity-55">
                <SmileCanvas pieces={COMPOSITIONS.signature} className="block h-auto w-full" />
              </div>
            </MediaPlaceholder>
            <MediaPlaceholder tag={t("studio.showcase.tags.composition")} caption={t("studio.showcase.captions.composition")} icon={Box} tone="blue" className="aspect-square lg:aspect-auto">
              <GemCluster shapes={["heart", "round", "star"]} />
            </MediaPlaceholder>
            <MediaPlaceholder tag={t("studio.showcase.tags.screenshot")} caption={t("studio.showcase.captions.screenshot")} icon={Camera} tone="sand" className="aspect-square lg:aspect-auto">
              <MiniWindow />
            </MediaPlaceholder>
            <MediaPlaceholder tag={t("studio.showcase.tags.beforeAfter")} caption={t("studio.showcase.captions.beforeAfter")} icon={Repeat} tone="ink" className="col-span-2 aspect-[16/9] lg:aspect-auto">
              <div className="grid h-full w-full grid-cols-2 opacity-60">
                <div className="overflow-hidden">
                  <div className="h-full" style={{ transform: "scale(1.3) translateX(14%)" }}>
                    <SmileCanvas pieces={[]} className="block h-full w-full" />
                  </div>
                </div>
                <div className="overflow-hidden border-l-2 border-white/70">
                  <div className="h-full" style={{ transform: "scale(1.3) translateX(-14%)" }}>
                    <SmileCanvas pieces={COMPOSITIONS[compareStyle]} className="block h-full w-full" />
                  </div>
                </div>
              </div>
            </MediaPlaceholder>
            {(["one", "two", "three", "four"] as const).map((n, i) => (
              <MediaPlaceholder
                key={n}
                tag={t("studio.showcase.tags.user")}
                caption={t(`studio.showcase.captions.user.${n}`)}
                icon={UserRound}
                tone={i % 2 ? "blush" : "blue"}
                className="aspect-[4/5] lg:aspect-[4/3]"
              >
                <GemCluster shapes={i === 0 ? ["flower", "round"] : i === 1 ? ["drop", "drop"] : i === 2 ? ["navette", "star", "round"] : ["round", "round", "round"]} tilt={i % 2 ? 8 : -6} />
              </MediaPlaceholder>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("studio.showcase.compareLabel")}>
            <span className="mr-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">{t("studio.showcase.compareLabel")}</span>
            {(["statement", "symmetrical", "sparkle"] as CompositionId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={compareStyle === id}
                onClick={() => setCompareStyle(id)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                  compareStyle === id
                    ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
                    : "border-[var(--border-default)] text-[var(--text-body)] hover:border-[var(--gt-ink-500)]",
                )}
              >
                {t(`studio.compositions.${id}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Inspiration */}
      <section ref={inspirationRef} aria-labelledby="gt-studio-inspiration" className={clsx("gt-reveal bg-[var(--surface-card)] py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <SectionHeading id="gt-studio-inspiration" eyebrow={t("studio.inspiration.eyebrow")} title={t("studio.inspiration.title")} body={t("studio.inspiration.body")} />
          <InspirationBoards />
        </div>
      </section>

      {/* -------------------------------------------------------- How it works */}
      <section ref={stepsRef} aria-labelledby="gt-studio-steps" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-12">
          <SectionHeading id="gt-studio-steps" align="center" eyebrow={t("studio.steps.eyebrow")} title={t("studio.steps.title")} />
          <StudioSteps />
        </div>
      </section>

      {/* --------------------------------------------------------------- Offer */}
      <section ref={offerRef} aria-labelledby="gt-studio-offer" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="gt-studio-offer relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(28px,4vw,64px)] overflow-hidden rounded-[var(--radius-2xl)] p-[clamp(22px,5vw,64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="relative grid gap-6">
            <SectionHeading inverse id="gt-studio-offer" eyebrow={t("studio.offer.eyebrow")} title={t("studio.offer.title")} body={t("studio.offer.body")} />
            <ul className="m-0 grid list-none gap-2 p-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-200)] sm:grid-cols-2">
              {(t("studio.offer.points", { returnObjects: true }) as string[]).map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <Sparkles size={14} aria-hidden="true" className="flex-none text-[var(--gt-blue-300)]" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <StudioPricingCard
            className="relative"
            action={
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={start} className="gt-studio-cta">
                {t("studio.offer.cta")}
              </Button>
            }
          />
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section ref={faqRef} aria-labelledby="gt-studio-faq" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="grid content-start gap-5">
            <SectionHeading id="gt-studio-faq" eyebrow={t("studio.faq.eyebrow")} title={t("studio.faq.title")} />
            <Button variant="outline" iconRight={ArrowRight} onClick={start} className="justify-self-start">
              {t("studio.hero.ctaPrimary")}
            </Button>
          </div>
          <StudioFaq />
        </div>
      </section>

      {/* Phone call-to-action bar */}
      <div
        aria-hidden={!showBar}
        className={clsx(
          "gt-studio-bar fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-[var(--radius-pill)] border border-white/70 py-2 pl-5 pr-2 shadow-[var(--shadow-glass-heavy)] md:hidden",
          showBar ? "is-shown" : "pointer-events-none",
        )}
      >
        <span className="text-[var(--text-primary)]">
          <strong className="text-[17px] font-[var(--weight-black)]">{price}</strong>{" "}
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t("studio.pricing.perMonth")}</span>
        </span>
        <Button variant="primary" size="sm" iconRight={ArrowRight} onClick={start} tabIndex={showBar ? 0 : -1}>
          {t("studio.hero.ctaPrimary")}
        </Button>
      </div>
    </div>
  );
}

/** Decorative pieces for placeholder tiles, until real renders replace them. */
function GemCluster({ shapes, tilt = -4 }: { shapes: ("round" | "heart" | "star" | "drop" | "navette" | "flower")[]; tilt?: number }) {
  const materials = ["gold", "crystal", "sapphire", "rose", "emerald", "opal"] as const;
  return (
    <div className="flex items-center justify-center gap-1" style={{ transform: `rotate(${tilt}deg)` }}>
      {shapes.map((shape, i) => (
        <GemIcon key={i} shape={shape} material={materials[(i + shapes.length) % materials.length]} size={i === 0 ? 64 : 42} className="drop-shadow-[0_8px_14px_rgba(17,17,17,.18)]" />
      ))}
    </div>
  );
}

/** A tiny sketch of the Studio window for the screenshot placeholder. */
function MiniWindow() {
  return (
    <div className="grid w-[78%] -rotate-3 gap-1.5 rounded-[10px] bg-white p-1.5 shadow-[var(--shadow-lg)]">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--gt-ink-200)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--gt-ink-200)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--gt-ink-200)]" />
      </div>
      <div className="grid grid-cols-[18%_1fr] gap-1.5">
        <div className="grid content-start gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 rounded-[3px] bg-[var(--gt-blue-100)]" />
          ))}
        </div>
        <div className="gt-studio-stage aspect-[16/10] overflow-hidden rounded-[6px]">
          <SmileCanvas pieces={COMPOSITIONS.minimal} className="block h-full w-full" />
        </div>
      </div>
    </div>
  );
}
