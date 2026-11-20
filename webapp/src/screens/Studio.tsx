"use client";

import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowDown, ArrowRight, Camera, Quote, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StudioPageImage, type StudioStill } from "../components/studio/StudioPageImage";
import { HeroVideo } from "../components/studio/HeroVideo";
import { StudioLoopVideo, type LoopFilm } from "../components/studio/StudioLoopVideo";
import { StudioPlans } from "../components/studio/StudioPlans";
import { StudioFaq } from "../components/studio/StudioFaq";
import { useNavigate } from "../lib/navigation";
import { useFormat } from "../lib/format";
import { useStudioVatFranchise, vatNoticeKey } from "../lib/vatRegime";
import { useReveal } from "../lib/useReveal";
import { STUDIO_ENTRY_PLAN, STUDIO_TRIAL_DAYS } from "../data/studio";
import { STUDIO_EDITOR_PATH } from "../lib/studioUrl";
import { STUDIO_PREVIEW } from "../lib/studioAccess";

/**
 * The 3D Studio's public presentation page (`/studio-3d`, `/en/3d-studio`).
 * It replaced the first design on 2026-10-17, the owner having preferred this
 * one. It sells the creative experience before the
 * tool — an editorial hero, four benefits, each beside its picture, room for
 * the artists' own words, then the offers, a closing call and the questions.
 *
 * What it does not do: invent anything. Plan names, amounts and the trial's
 * length come from `data/studio.ts`; the hero plays the Studio film (`HeroVideo`); the benefit blocks and the
 * artists' gallery show stills rendered by the editor's own engine from the
 * Global Toothgems team's designs, and a film of the editor at work
 * (`StudioPageImage`, `public/images/studio-page/`, `StudioLoopVideo`); the testimonials stay
 * labelled placeholders until the owner supplies real ones, and no
 * testimonial, rating or figure is made up; the buttons behave as follows: while the Studio is in
 * free preview (`studioAccess`) "start" opens the editor, otherwise it leads
 * to the subscription page, and nothing here activates a trial or takes a
 * payment.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";
const EXPERIENCE_ID = "studio-b-experience";
const PLANS_ID = "studio-b-formules";

const STILLS = "/images/studio-page";
/** The media column (two thirds of the content) on wide screens, the screen less its gutters on phones. */
const MEDIA_WIDTH = "(min-width: 1024px) 800px, calc(100vw - 32px)";

/**
 * The four benefits, each beside its own media: the editor at work (a film
 * per language, since it shows the interface's words), the Scorpion as it was
 * made (finished, with the three steps before it, all under one camera), six
 * designs under one camera and one light (a single picture whose gaps are
 * transparent), and one finished design of the team.
 */
const BENEFITS = [
  { key: "visualize", still: null, look: "film" },
  { key: "experiment", still: { base: `${STILLS}/scorpion`, width: 960, height: 720 }, look: "steps" },
  { key: "signature", still: { base: `${STILLS}/signatures`, width: 800, height: 600 }, look: "grid" },
  { key: "confidence", still: { base: `${STILLS}/creation-etoile-halo`, width: 600, height: 600 }, look: "square" },
] as const;

/** The Scorpion before it was finished: one gem, the body, then the claws and the sting. */
const SCORPION_STEPS: StudioStill[] = [1, 2, 3].map((n) => ({ base: `${STILLS}/scorpion-step-${n}`, width: 480, height: 360 }));
const STEP_SIZES = "(min-width: 1024px) 260px, calc((100vw - 56px) / 3)";

/** Three finished designs of the team for the artists' section, square. */
const GALLERY: { key: string; still: StudioStill }[] = [
  { key: "heart", still: { base: `${STILLS}/creation-coeur`, width: 600, height: 600 } },
  { key: "star", still: { base: `${STILLS}/creation-etoile-halo`, width: 600, height: 600 } },
  { key: "gold", still: { base: `${STILLS}/creation-doree`, width: 600, height: 600 } },
];
const GALLERY_SIZES = "(min-width: 1024px) 410px, (min-width: 640px) 30vw, calc(100vw - 32px)";

/**
 * The editor demonstration (`/videos/studio-3d-demo-<lang>*`): the team's
 * "Cristaux minimalistes" rebuilt from a blank smile in the real editor, in
 * colour — placed, lassoed, aligned, mirror-copied, copied to the lower arch,
 * recoloured, duplicated, spaced evenly and centred — in about 15 seconds
 * (recorded live, played 1.5 times faster).
 */
const demoFilm = (lang: "fr" | "en"): LoopFilm => ({
  src: `/videos/studio-3d-demo-${lang}.mp4`,
  mobileSrc: `/videos/studio-3d-demo-${lang}-mobile.mp4`,
  poster: `/videos/studio-3d-demo-${lang}-poster.webp`,
});

/**
 * The "experiment" benefit's media: the finished Scorpion, large, then the
 * three steps that led to it, numbered, each named by its caption (the
 * pictures themselves are decorative next to it).
 */
function ScorpionStory({ finished }: { finished: StudioStill }) {
  const { t } = useTranslation();
  const steps = t("studioPage.benefits.items.experiment.steps", { returnObjects: true }) as string[];
  return (
    <div className="grid gap-4">
      <StudioPageImage
        still={finished}
        alt={t("studioPage.benefits.items.experiment.media.alt")}
        caption={t("studioPage.benefits.items.experiment.media.caption")}
        sizes={MEDIA_WIDTH}
        imageClassName="rounded-[var(--radius-xl)] border border-white/70 shadow-[var(--shadow-md)]"
      />
      <div className="grid gap-2.5">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("studioPage.benefits.items.experiment.stepsTitle")}</p>
        <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:gap-3">
          {SCORPION_STEPS.map((still, index) => (
            <li key={still.base}>
              <StudioPageImage
                still={still}
                alt=""
                caption={`${index + 1}. ${steps[index] ?? ""}`}
                sizes={STEP_SIZES}
                imageClassName="rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Scrolls to a section of this page, respecting the reader's motion setting. */
function scrollToSection(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

function SectionHeading({ id, eyebrow, title, body }: { id: string; eyebrow: string; title: string; body?: string }) {
  return (
    <div className="grid max-w-[720px] gap-3">
      <span className="grid gap-2 justify-items-start">
        <span className="gt-eyebrow">{eyebrow}</span>
        <span aria-hidden="true" className="gt-studio-b-tick h-px w-16" />
      </span>
      <h2
        id={id}
        className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
      >
        {title}
      </h2>
      {body && <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">{body}</p>}
    </div>
  );
}

export function Studio() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const vatNotice = vatNoticeKey(useStudioVatFranchise());
  const { formatMoney } = useFormat();
  const navigate = useNavigate();
  // The editor itself shows the trial invitation or the plans (StudioAccessGate).
  const access = { granted: STUDIO_PREVIEW };

  const entryPrice = formatMoney(STUDIO_ENTRY_PLAN.amountMinor, STUDIO_ENTRY_PLAN.currency);
  const start = () => navigate(STUDIO_EDITOR_PATH);
  const startLabel = access.granted ? t("studioPage.hero.ctaOpen") : t("studioPage.hero.ctaPrimary", { count: STUDIO_TRIAL_DAYS });

  const benefitsRef = useReveal<HTMLElement>();
  const proofRef = useReveal<HTMLElement>();
  const plansRef = useReveal<HTMLElement>();
  const closingRef = useReveal<HTMLElement>();
  const faqRef = useReveal<HTMLElement>();

  return (
    <div className="gt-studio-alt overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-studio-b-title" className={clsx("gt-studio-b-hero relative overflow-hidden pb-[clamp(44px,7vw,104px)] pt-6 sm:pt-[clamp(32px,5vw,80px)]", SECTION_X)}>
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-70" />
        <div aria-hidden="true" className="gt-studio-b-aurora--blush pointer-events-none absolute -left-32 top-1/2 h-[320px] w-[320px] rounded-full" />

        {/* Phones: the title, then the film, large, then the text and the calls. Wide screens: the film beside both. */}
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-14 lg:gap-y-6">
          <div className="grid min-w-0 justify-items-start gap-4 sm:gap-5 lg:row-start-2">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/75 py-1 pl-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
              <Sparkles size={13} aria-hidden="true" />
              {t("studioPage.hero.eyebrow")}
            </span>
            <h1
              id="gt-studio-b-title"
              className="text-[clamp(34px,9vw,44px)] font-[var(--weight-black)] leading-[0.98] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)] lg:text-[length:var(--text-display-2)]"
            >
              {t("studioPage.hero.title")}
            </h1>
          </div>

          <div className="relative mx-auto w-full min-w-0 max-w-[560px] lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:max-w-[min(100%,calc(100svh-210px))] lg:self-center">
            <HeroVideo />
          </div>

          <div className="grid min-w-0 justify-items-start gap-5 lg:row-start-3">
            <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t("studioPage.hero.body")}</p>

            <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={start} className="gt-studio-cta sm:w-auto">
                {startLabel}
              </Button>
              <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={() => scrollToSection(EXPERIENCE_ID)} className="sm:w-auto">
                {t("studioPage.hero.ctaSecondary")}
              </Button>
            </div>

            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("studioPage.hero.reassurance", { count: STUDIO_TRIAL_DAYS, price: entryPrice })}
            </p>
            {access.granted && (
              <p className="m-0 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
                <Sparkles size={13} aria-hidden="true" />
                {t("studio.access.previewNote")}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Benefits, each beside its picture */}
      <section
        id={EXPERIENCE_ID}
        ref={benefitsRef}
        aria-labelledby="gt-studio-b-benefits"
        className={clsx("gt-reveal scroll-mt-20 bg-[var(--surface-sunken)] py-[var(--section-y)]", SECTION_X)}
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10 lg:gap-14">
          <SectionHeading
            id="gt-studio-b-benefits"
            eyebrow={t("studioPage.benefits.eyebrow")}
            title={t("studioPage.benefits.title")}
            body={t("studioPage.benefits.body")}
          />
          {BENEFITS.map(({ key, still, look }, index) => (
            <article
              key={key}
              className={clsx(
                "grid grid-cols-1 items-center gap-6 lg:gap-12",
                index % 2 === 1 ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
              )}
            >
              <div className={clsx("grid min-w-0 content-start gap-3", index % 2 === 1 && "lg:order-2")}>
                <h3 className="text-[clamp(24px,5vw,34px)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
                  {t(`studioPage.benefits.items.${key}.title`)}
                </h3>
                <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t(`studioPage.benefits.items.${key}.body`)}</p>
              </div>
              <div className={clsx("min-w-0", index % 2 === 1 && "lg:order-1")}>
                {look === "film" ? (
                  <figure className="m-0 grid gap-2.5">
                    <StudioLoopVideo film={demoFilm(lang)} description={t(`studioPage.benefits.items.${key}.media.description`)} buttonSide="left" />
                    <figcaption className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`studioPage.benefits.items.${key}.media.caption`)}</figcaption>
                  </figure>
                ) : look === "steps" ? (
                  <ScorpionStory finished={still} />
                ) : (
                  <StudioPageImage
                    still={still}
                    alt={t(`studioPage.benefits.items.${key}.media.alt`)}
                    caption={t(`studioPage.benefits.items.${key}.media.caption`)}
                    sizes={MEDIA_WIDTH}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- Artists (proof) */}
      <section ref={proofRef} aria-labelledby="gt-studio-b-proof" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <SectionHeading id="gt-studio-b-proof" eyebrow={t("studioPage.proof.eyebrow")} title={t("studioPage.proof.title")} body={t("studioPage.proof.body")} />

          <h3 className="sr-only">{t("studioPage.proof.testimonialsTitle")}</h3>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <li key={slot} className="grid content-start gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] p-5 sm:p-6">
                <span aria-hidden="true" className="text-[var(--gt-blue-400)]">
                  <Quote size={22} />
                </span>
                <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t("studioPage.proof.testimonial.title")}</p>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("studioPage.proof.testimonial.body")}</p>
                <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  <Camera size={13} aria-hidden="true" />
                  {t("studioPage.proof.testimonial.caption")}
                </p>
              </li>
            ))}
          </ul>

          <h3 className="sr-only">{t("studioPage.proof.galleryTitle")}</h3>
          <div className="grid gap-3">
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
              {GALLERY.map(({ key, still }) => (
                <li key={key}>
                  <StudioPageImage
                    still={still}
                    alt={t(`studioPage.proof.gallery.items.${key}.alt`)}
                    caption={t(`studioPage.proof.gallery.items.${key}.name`)}
                    sizes={GALLERY_SIZES}
                    imageClassName="rounded-[var(--radius-lg)] border border-[var(--border-subtle)]"
                  />
                </li>
              ))}
            </ul>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studioPage.proof.gallery.caption")}</p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Plans */}
      <section
        id={PLANS_ID}
        ref={plansRef}
        aria-labelledby="gt-studio-b-plans"
        className={clsx("gt-reveal scroll-mt-20 bg-[var(--surface-brand-wash)] py-[var(--section-y)]", SECTION_X)}
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <SectionHeading id="gt-studio-b-plans" eyebrow={t("studioPage.plans.eyebrow")} title={t("studioPage.plans.title")} body={t("studioPage.plans.body")} />
          <StudioPlans onTrial={start} />
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {vatNotice && `${t(vatNotice)}. `}
            {t("studioPage.plans.note")}
            {access.granted ? ` ${t("studio.access.previewHint")}` : ""}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- Closing */}
      <section ref={closingRef} aria-labelledby="gt-studio-b-closing" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="gt-studio-b-close mx-auto grid max-w-[var(--max-width-content)] justify-items-center gap-5 rounded-[var(--radius-xl)] px-5 py-[clamp(36px,6vw,72px)] text-center sm:px-10">
          <h2
            id="gt-studio-b-closing"
            className="m-0 max-w-[20ch] text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
          >
            {t("studioPage.closing.title")}
          </h2>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-700)]">{t("studioPage.closing.body")}</p>
          <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
            <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={start} className="gt-studio-cta sm:w-auto">
              {startLabel}
            </Button>
            <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={() => scrollToSection(PLANS_ID)} className="sm:w-auto">
              {t("studioPage.closing.ctaSecondary")}
            </Button>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section ref={faqRef} aria-labelledby="gt-studio-b-faq" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="grid content-start gap-5">
            <SectionHeading id="gt-studio-b-faq" eyebrow={t("studioPage.faq.eyebrow")} title={t("studioPage.faq.title")} />
            <Button variant="outline" iconRight={ArrowRight} onClick={start} className="justify-self-start">
              {startLabel}
            </Button>
          </div>
          <StudioFaq />
        </div>
      </section>
    </div>
  );
}
