"use client";

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowDown, ArrowLeft, ArrowRight, CalendarCheck, CalendarDays, Check, Clock, MapPin, MessageCircleOff, Sparkles, UserPlus, Wand2, type LucideIcon } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StudioPageImage, type StudioStill } from "../components/studio/StudioPageImage";
import { StudioLoopVideo, type LoopFilm } from "../components/studio/StudioLoopVideo";
import { useStudioCheckoutChoice } from "../components/studio/useStudioCheckoutChoice";
import { TryOnShowcase } from "../components/studio/atelier/TryOnShowcase";
import { Link } from "../lib/navigation";
import { useFormat } from "../lib/format";
import { useReveal } from "../lib/useReveal";
import { useStudioPlanPrices } from "../lib/studioBilling";
import { displayPrice, monthsFreeOf } from "../lib/studioBillingMapping";
import { useStudioVatFranchise, vatNoticeKey } from "../lib/vatRegime";
import { STUDIO_PATH, STUDIO_SUBSCRIBE_PATH } from "../lib/studioUrl";
import { STUDIO_TRIAL_DAYS, type StudioBillingInterval } from "../data/studio";

/**
 * The Atelier plan in detail (`/fr/studio-3d/formule-atelier`,
 * `/en/3d-studio/atelier-plan`; owner's request, 2026-11-21): what the
 * highest Studio plan adds — the directory, the AI try-on, online bookings
 * and the calendar — told as a client's journey, then the gains, the extras
 * and the plan itself.
 *
 * Reached only from the Atelier card of the public plans (`StudioPaidPlans`
 * `atelierDetails`), so it adds no new entry to the menus. What it shows is
 * what the plan holds (`STUDIO_PLAN_FEATURES.atelier`, decision 113) and how
 * the tools really behave (decisions 111, 144, 145, 147); its prices are the
 * live Stripe prices (`studio_plan_prices`). It invents no figure: the gains
 * are the tools' own mechanics, never a measured rate. Its pictures are real
 * screenshots of the site (`public/images/atelier-page/`, the film in
 * `public/videos/atelier-booking-*`), with example names and artists, said so
 * in their captions; the try-on examples are the owner's (`TryOnShowcase`).
 * Nothing is bought here: the plan button leads to the checkout page.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";
const JOURNEY_ID = "atelier-parcours";
const MEDIA_WIDTH = "(min-width: 1024px) 720px, calc(100vw - 32px)";

const PAGE = "/images/atelier-page";
type Lang = "fr" | "en";
const agendaWeek = (lang: Lang): StudioStill => ({ base: `${PAGE}/agenda-week-${lang}`, width: 800, height: 700 });
const agendaList = (lang: Lang): StudioStill => ({ base: `${PAGE}/agenda-list-${lang}`, width: 800, height: 700 });
const directory = (lang: Lang): StudioStill => ({ base: `${PAGE}/directory-${lang}`, width: 800, height: 700 });
/** The booking journey recorded on the site, one film per language (it shows the interface's words). */
const bookingFilm = (lang: Lang): LoopFilm => ({
  src: `/videos/atelier-booking-${lang}.mp4`,
  mobileSrc: `/videos/atelier-booking-${lang}-mobile.mp4`,
  poster: `/videos/atelier-booking-${lang}-poster.webp`,
});

const STEPS: readonly { key: "directory" | "tryOn" | "booking" | "agenda"; icon: LucideIcon }[] = [
  { key: "directory", icon: MapPin },
  { key: "tryOn", icon: Wand2 },
  { key: "booking", icon: CalendarCheck },
  { key: "agenda", icon: CalendarDays },
];
const sectionId = (key: string) => `atelier-${key}`;

const GAINS: readonly { key: string; icon: LucideIcon }[] = [
  { key: "time", icon: MessageCircleOff },
  { key: "noShow", icon: Clock },
  { key: "newClients", icon: UserPlus },
  { key: "decided", icon: Sparkles },
];

/** Scrolls to a section of this page, respecting the reader's motion setting. */
function scrollToSection(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--text-body)] sm:text-[length:var(--text-body-md)]">
          <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
            <Check size={13} strokeWidth={3} />
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One tool of the journey: its step number, its words and points on one side,
 * its media on the other (alternating on wide screens, the media under the
 * words on phones).
 */
function Feature({ step, flip, media, sunken }: { step: number; flip: boolean; media: ReactNode; sunken?: boolean }) {
  const { t } = useTranslation();
  const { key, icon: Icon } = STEPS[step];
  const k = `atelierPage.${key}`;
  const ref = useReveal<HTMLElement>();
  return (
    <section
      id={sectionId(key)}
      ref={ref}
      aria-labelledby={`${sectionId(key)}-title`}
      className={clsx("gt-reveal scroll-mt-20 py-[var(--section-y)]", sunken && "bg-[var(--surface-sunken)]", SECTION_X)}
    >
      <div
        className={clsx(
          "mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-8 lg:gap-14",
          flip ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
        )}
      >
        <div className={clsx("grid min-w-0 content-start gap-4", flip && "lg:order-2")}>
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-[var(--gt-blue-50)]">
              <Icon size={15} />
            </span>
            <span className="sr-only">{t("atelierPage.journey.stepLabel", { n: step + 1 })} · </span>
            {t(`${k}.eyebrow`)}
          </span>
          <h2
            id={`${sectionId(key)}-title`}
            className="text-[clamp(26px,5.4vw,40px)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
          >
            {t(`${k}.title`)}
          </h2>
          <p className="m-0 max-w-[56ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t(`${k}.body`)}</p>
          <Points items={t(`${k}.points`, { returnObjects: true }) as string[]} />
        </div>
        <div className={clsx("min-w-0", flip && "lg:order-1")}>{media}</div>
      </div>
    </section>
  );
}

/** The Atelier plan's offer: monthly or yearly, its live price, the way to the checkout. */
function AtelierOffer() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const live = useStudioPlanPrices();
  const choose = useStudioCheckoutChoice("studio_atelier_page");
  const vatNotice = vatNoticeKey(useStudioVatFranchise());
  const [interval, setInterval] = useState<StudioBillingInterval>("month");
  const price = displayPrice("atelier", interval, live);
  const monthsFree = monthsFreeOf(displayPrice("atelier", "month", live), displayPrice("atelier", "year", live));
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="atelier-offer-title" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
      <div className="gt-studio-b-close mx-auto grid max-w-[var(--max-width-content)] gap-8 rounded-[var(--radius-xl)] px-5 py-[clamp(32px,6vw,64px)] sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center lg:gap-14">
        <div className="grid content-start gap-4">
          <span className="gt-eyebrow">{t("atelierPage.offer.eyebrow")}</span>
          <h2
            id="atelier-offer-title"
            className="m-0 text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
          >
            {t("atelierPage.offer.title")}
          </h2>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-700)]">{t("atelierPage.offer.body")}</p>
          <h3 className="m-0 mt-2 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t("atelierPage.extras.title")}</h3>
          <Points items={["unlimited", "postLayouts", "artist"].map((key) => t(`atelierPage.extras.items.${key}`))} />
        </div>

        <div className="gt-studio-b-plan gt-studio-b-plan--featured grid content-start gap-5 rounded-[var(--radius-xl)] border bg-[var(--surface-card)] p-5 sm:p-6">
          <div
            role="group"
            aria-label={t("studioPage.plans.intervalLabel")}
            className="inline-flex flex-wrap items-center gap-1 justify-self-start rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1"
          >
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
                className={clsx(
                  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                  interval === value ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]" : "text-[var(--text-primary)] hover:bg-[var(--gt-blue-50)]",
                )}
              >
                {t(value === "month" ? "studioPage.plans.monthly" : "studioPage.plans.yearly")}
                {value === "year" && monthsFree > 0 && (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--gt-emerald-300)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
                    {t("studioPage.plans.monthsFree", { count: monthsFree })}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <h3 className="text-[length:var(--text-h4)]">{t("studio.plans.items.atelier.name")}</h3>
            {price ? (
              <p className="m-0 flex items-baseline gap-1.5 text-[var(--text-primary)]">
                <span className="text-[clamp(36px,8vw,46px)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]">
                  {formatMoney(price.amountMinor, price.currency)}
                </span>
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">
                  {t(interval === "month" ? "studioPage.plans.perMonth" : "studioPage.plans.perYear")}
                </span>
              </p>
            ) : (
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">{t("studioPage.plans.unavailable")}</p>
            )}
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("atelierPage.hero.priceNote")}</p>
          </div>

          <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} disabled={!price} onClick={() => choose("atelier", interval, price)} className="gt-studio-cta">
            {t("atelierPage.hero.cta")}
          </Button>

          <Link
            to={STUDIO_SUBSCRIBE_PATH}
            className="justify-self-center rounded-[var(--radius-sm)] text-[length:var(--text-body-sm)] font-semibold text-[var(--gt-blue-700)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t("atelierPage.offer.compare")}
          </Link>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {vatNotice && `${t(vatNotice)}. `}
            {t("atelierPage.offer.trialNote", { count: STUDIO_TRIAL_DAYS })}
          </p>
        </div>
      </div>
    </section>
  );
}

export function StudioAtelier() {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith("en") ? "en" : "fr";
  const { formatMoney } = useFormat();
  const live = useStudioPlanPrices();
  const choose = useStudioCheckoutChoice("studio_atelier_page");
  const monthly = displayPrice("atelier", "month", live);
  const journeyRef = useReveal<HTMLElement>();
  const gainsRef = useReveal<HTMLElement>();

  return (
    <div className="gt-studio-alt overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="atelier-title" className={clsx("gt-studio-b-hero relative overflow-hidden pb-[clamp(44px,7vw,96px)] pt-5 sm:pt-8", SECTION_X)}>
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-70" />
        <div aria-hidden="true" className="gt-studio-b-aurora--blush pointer-events-none absolute -left-32 top-1/2 h-[320px] w-[320px] rounded-full" />

        <div className="relative mx-auto grid max-w-[var(--max-width-content)] gap-6 sm:gap-8">
          <Link
            to={STUDIO_PATH}
            className="inline-flex items-center gap-2 justify-self-start rounded-full px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t("atelierPage.back")}
          </Link>

          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            <div className="grid min-w-0 justify-items-start gap-4 sm:gap-5">
              <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/75 py-1 pl-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
                <Sparkles size={13} aria-hidden="true" />
                {t("atelierPage.hero.eyebrow")}
              </span>
              <h1
                id="atelier-title"
                className="text-[clamp(34px,9vw,44px)] font-[var(--weight-black)] leading-[0.98] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)] lg:text-[length:var(--text-display-2)]"
              >
                {t("atelierPage.hero.title")}
              </h1>
              <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t("atelierPage.hero.body")}</p>
              {monthly && (
                <p className="m-0 flex flex-wrap items-baseline gap-x-1.5 text-[var(--text-primary)]">
                  <span className="text-[28px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]">{formatMoney(monthly.amountMinor, monthly.currency)}</span>
                  <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">{t("studioPage.plans.perMonth")}</span>
                </p>
              )}
              <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
                <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} disabled={!monthly} onClick={() => choose("atelier", "month", monthly)} className="gt-studio-cta sm:w-auto">
                  {t("atelierPage.hero.cta")}
                </Button>
                <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={() => scrollToSection(JOURNEY_ID)} className="sm:w-auto">
                  {t("atelierPage.hero.ctaSecondary")}
                </Button>
              </div>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("atelierPage.hero.priceNote")}</p>
            </div>

            <StudioPageImage
              still={agendaWeek(lang)}
              alt={t("atelierPage.hero.media.alt")}
              caption={t("atelierPage.hero.media.caption")}
              sizes={MEDIA_WIDTH}
              loading="eager"
              imageClassName="rounded-[var(--radius-xl)] border border-white/70 shadow-[var(--shadow-lg)]"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Journey */}
      <section id={JOURNEY_ID} ref={journeyRef} aria-labelledby="atelier-journey-title" className={clsx("gt-reveal scroll-mt-20 bg-[var(--surface-brand-wash)] py-[clamp(36px,6vw,72px)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-6">
          <div className="grid max-w-[720px] gap-3">
            <span className="grid justify-items-start gap-2">
              <span className="gt-eyebrow">{t("atelierPage.journey.eyebrow")}</span>
              <span aria-hidden="true" className="gt-studio-b-tick h-px w-16" />
            </span>
            <h2
              id="atelier-journey-title"
              className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
            >
              {t("atelierPage.journey.title")}
            </h2>
          </div>
          <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ key, icon: Icon }, index) => (
              <li key={key}>
                <a
                  href={`#${sectionId(key)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection(sectionId(key));
                  }}
                  className="gt-studio-b-card group grid h-full content-start gap-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <span className="flex items-center justify-between">
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]">
                      <Icon size={19} />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("atelierPage.journey.stepLabel", { n: index + 1 })}</span>
                  </span>
                  <span className="text-[length:var(--text-body-lg)] font-[var(--weight-black)] leading-snug text-[var(--text-primary)]">{t(`atelierPage.journey.steps.${key}.title`)}</span>
                  <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`atelierPage.journey.steps.${key}.body`)}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- The four tools */}
      <Feature
        step={0}
        flip={false}
        media={
          <StudioPageImage
            still={directory(lang)}
            alt={t("atelierPage.directory.media.alt")}
            caption={t("atelierPage.directory.media.caption")}
            sizes={MEDIA_WIDTH}
            imageClassName="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-md)]"
          />
        }
      />
      <Feature step={1} flip sunken media={<TryOnShowcase />} />
      <Feature
        step={2}
        flip={false}
        media={
          <figure className="m-0 grid gap-2.5">
            <StudioLoopVideo film={bookingFilm(lang)} description={t("atelierPage.booking.media.description")} buttonSide="left" aspectClassName="aspect-[10/7]" />
            <figcaption className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("atelierPage.booking.media.caption")}</figcaption>
          </figure>
        }
      />
      <Feature
        step={3}
        flip
        sunken
        media={
          <StudioPageImage
            still={agendaList(lang)}
            alt={t("atelierPage.agenda.media.alt")}
            caption={t("atelierPage.agenda.media.caption")}
            sizes={MEDIA_WIDTH}
            imageClassName="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-md)]"
          />
        }
      />

      {/* --------------------------------------------------------------- Gains */}
      <section ref={gainsRef} aria-labelledby="atelier-gains-title" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="grid max-w-[720px] gap-3">
            <span className="grid justify-items-start gap-2">
              <span className="gt-eyebrow">{t("atelierPage.gains.eyebrow")}</span>
              <span aria-hidden="true" className="gt-studio-b-tick h-px w-16" />
            </span>
            <h2
              id="atelier-gains-title"
              className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
            >
              {t("atelierPage.gains.title")}
            </h2>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {GAINS.map(({ key, icon: Icon }) => (
              <li key={key} className="grid content-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 sm:p-6">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]">
                  <Icon size={20} />
                </span>
                <h3 className="m-0 text-[length:var(--text-body-lg)] font-[var(--weight-black)] leading-snug">{t(`atelierPage.gains.items.${key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`atelierPage.gains.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <AtelierOffer />
    </div>
  );
}
