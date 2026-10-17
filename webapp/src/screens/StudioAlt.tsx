"use client";

import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowDown, ArrowRight, BadgeCheck, Camera, Eye, Film, Fingerprint, Image as ImageIcon, Images, MonitorPlay, Quote, Shuffle, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { HeroMediaPlaceholder, MediaPlaceholder, type PlaceholderCopy } from "../components/studio/alt/MediaPlaceholder";
import { StudioAltPlans } from "../components/studio/alt/StudioAltPlans";
import { StudioAltFaq } from "../components/studio/alt/StudioAltFaq";
import { useNavigate } from "../lib/navigation";
import { useFormat } from "../lib/format";
import { useReveal } from "../lib/useReveal";
import { STUDIO_ENTRY_PLAN, STUDIO_TRIAL_DAYS } from "../data/studio";
import { STUDIO_EDITOR_PATH, STUDIO_SUBSCRIBE_PATH } from "../lib/studioUrl";
import { useStudioAccess } from "../lib/studioAccess";

/**
 * An alternative design of the 3D Studio's presentation page, at
 * `/studio-3d-b` (`/en/3d-studio-b`), asked for on 2026-10-17 so the owner
 * can compare it with `/studio-3d` and keep one of the two. The page it is
 * compared against is untouched; the two never share a component, only the
 * design tokens, the shared UI and the Studio's own data.
 *
 * What it does differently: it sells the creative experience before the
 * tool — an editorial hero, four benefits, three showcase blocks, room for
 * the artists' own words, then the offers, a closing call and the questions.
 *
 * What it does not do: invent anything. Plan names, amounts and the trial's
 * length come from `data/studio.ts`; the media that does not exist yet is
 * drawn as a labelled placeholder; no testimonial, rating or figure is made
 * up; the buttons behave exactly as on `/studio-3d` — while the Studio is in
 * free preview (`studioAccess`) "start" opens the editor, otherwise it leads
 * to the subscription page, and nothing here activates a trial or takes a
 * payment.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";
const EXPERIENCE_ID = "studio-b-experience";
const PLANS_ID = "studio-b-formules";

const BENEFITS = [
  { key: "visualize", icon: Eye },
  { key: "experiment", icon: Shuffle },
  { key: "signature", icon: Fingerprint },
  { key: "confidence", icon: BadgeCheck },
] as const;

const SHOWCASE = [
  { key: "idea", icon: ImageIcon, ratio: "aspect-[4/5]" },
  { key: "signature", icon: Images, ratio: "aspect-[4/3]" },
  { key: "space", icon: MonitorPlay, ratio: "aspect-[16/10]" },
] as const;

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

export function StudioAlt() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const navigate = useNavigate();
  const access = useStudioAccess();

  const entryPrice = formatMoney(STUDIO_ENTRY_PLAN.amountMinor, STUDIO_ENTRY_PLAN.currency);
  const start = () => navigate(access.granted ? STUDIO_EDITOR_PATH : STUDIO_SUBSCRIBE_PATH);
  const subscribe = () => navigate(STUDIO_SUBSCRIBE_PATH);
  const startLabel = access.granted ? t("studioAlt.hero.ctaOpen") : t("studioAlt.hero.ctaPrimary", { count: STUDIO_TRIAL_DAYS });

  const benefitsRef = useReveal<HTMLElement>();
  const showcaseRef = useReveal<HTMLElement>();
  const proofRef = useReveal<HTMLElement>();
  const plansRef = useReveal<HTMLElement>();
  const closingRef = useReveal<HTMLElement>();
  const faqRef = useReveal<HTMLElement>();

  const copy = (key: string) => t(key, { returnObjects: true }) as PlaceholderCopy;

  return (
    <div className="gt-studio-alt overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-studio-b-title" className={clsx("gt-studio-b-hero relative overflow-hidden pb-[clamp(44px,7vw,104px)] pt-6 sm:pt-[clamp(32px,5vw,80px)]", SECTION_X)}>
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-70" />
        <div aria-hidden="true" className="gt-studio-b-aurora--blush pointer-events-none absolute -left-32 top-1/2 h-[320px] w-[320px] rounded-full" />

        <div className="relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="grid min-w-0 justify-items-start gap-5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/75 py-1 pl-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
              <Sparkles size={13} aria-hidden="true" />
              {t("studioAlt.hero.eyebrow")}
            </span>
            <h1
              id="gt-studio-b-title"
              className="text-[clamp(34px,9vw,44px)] font-[var(--weight-black)] leading-[0.98] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)]"
            >
              {t("studioAlt.hero.title")}
            </h1>
            <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t("studioAlt.hero.body")}</p>

            <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={start} className="gt-studio-cta sm:w-auto">
                {startLabel}
              </Button>
              <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={() => scrollToSection(EXPERIENCE_ID)} className="sm:w-auto">
                {t("studioAlt.hero.ctaSecondary")}
              </Button>
            </div>

            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("studioAlt.hero.reassurance", { count: STUDIO_TRIAL_DAYS, price: entryPrice })}
            </p>
            {access.granted && (
              <p className="m-0 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
                <Sparkles size={13} aria-hidden="true" />
                {t("studio.access.previewNote")}
              </p>
            )}
          </div>

          <div className="relative min-w-0">
            <HeroMediaPlaceholder copy={copy("studioAlt.hero.media")} icon={Film} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Benefits */}
      <section ref={benefitsRef} aria-labelledby="gt-studio-b-benefits" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-9">
          <SectionHeading
            id="gt-studio-b-benefits"
            eyebrow={t("studioAlt.benefits.eyebrow")}
            title={t("studioAlt.benefits.title")}
            body={t("studioAlt.benefits.body")}
          />
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ key, icon: Icon }) => (
              <li key={key} className="gt-studio-b-card grid content-start gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-5 sm:p-6">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-white text-[var(--gt-blue-700)]">
                  <Icon size={19} />
                </span>
                <h3 className="text-[length:var(--text-h4)]">{t(`studioAlt.benefits.items.${key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studioAlt.benefits.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ Showcase */}
      <section
        id={EXPERIENCE_ID}
        ref={showcaseRef}
        aria-labelledby="gt-studio-b-showcase"
        className={clsx("gt-reveal scroll-mt-20 bg-[var(--surface-sunken)] py-[var(--section-y)]", SECTION_X)}
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10 lg:gap-14">
          <SectionHeading id="gt-studio-b-showcase" eyebrow={t("studioAlt.showcase.eyebrow")} title={t("studioAlt.showcase.title")} />
          {SHOWCASE.map(({ key, icon, ratio }, index) => (
            <article key={key} className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-14">
              <div className={clsx("grid min-w-0 content-start gap-3", index % 2 === 1 && "lg:order-2")}>
                <h3 className="text-[clamp(24px,5vw,34px)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
                  {t(`studioAlt.showcase.items.${key}.title`)}
                </h3>
                <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t(`studioAlt.showcase.items.${key}.body`)}</p>
              </div>
              <div className={clsx("min-w-0", index % 2 === 1 && "lg:order-1")}>
                <MediaPlaceholder copy={copy(`studioAlt.showcase.items.${key}.media`)} icon={icon} ratio={ratio} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- Artists (proof) */}
      <section ref={proofRef} aria-labelledby="gt-studio-b-proof" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <SectionHeading id="gt-studio-b-proof" eyebrow={t("studioAlt.proof.eyebrow")} title={t("studioAlt.proof.title")} body={t("studioAlt.proof.body")} />

          <h3 className="sr-only">{t("studioAlt.proof.testimonialsTitle")}</h3>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 lg:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <li key={slot} className="grid content-start gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] p-5 sm:p-6">
                <span aria-hidden="true" className="text-[var(--gt-blue-400)]">
                  <Quote size={22} />
                </span>
                <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t("studioAlt.proof.testimonial.title")}</p>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("studioAlt.proof.testimonial.body")}</p>
                <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  <Camera size={13} aria-hidden="true" />
                  {t("studioAlt.proof.testimonial.caption")}
                </p>
              </li>
            ))}
          </ul>

          <h3 className="sr-only">{t("studioAlt.proof.galleryTitle")}</h3>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <li key={slot}>
                <MediaPlaceholder copy={copy("studioAlt.proof.gallery")} icon={ImageIcon} ratio="aspect-square" />
              </li>
            ))}
          </ul>
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
          <SectionHeading id="gt-studio-b-plans" eyebrow={t("studioAlt.plans.eyebrow")} title={t("studioAlt.plans.title")} body={t("studioAlt.plans.body")} />
          <StudioAltPlans onTrial={start} onChoose={subscribe} />
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("studioAlt.plans.note")}
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
            {t("studioAlt.closing.title")}
          </h2>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-700)]">{t("studioAlt.closing.body")}</p>
          <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
            <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={start} className="gt-studio-cta sm:w-auto">
              {startLabel}
            </Button>
            <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={() => scrollToSection(PLANS_ID)} className="sm:w-auto">
              {t("studioAlt.closing.ctaSecondary")}
            </Button>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section ref={faqRef} aria-labelledby="gt-studio-b-faq" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="grid content-start gap-5">
            <SectionHeading id="gt-studio-b-faq" eyebrow={t("studioAlt.faq.eyebrow")} title={t("studioAlt.faq.title")} />
            <Button variant="outline" iconRight={ArrowRight} onClick={start} className="justify-self-start">
              {startLabel}
            </Button>
          </div>
          <StudioAltFaq />
        </div>
      </section>
    </div>
  );
}
