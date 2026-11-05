"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowRight,
  BookHeart,
  Box,
  Check,
  ClipboardList,
  FolderHeart,
  Gem,
  Palette,
  Share2,
  ShoppingBag,
  Sparkles,
  UserPlus,
  Users,
  Brush,
  Store,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Link, useNavigate } from "../lib/navigation";
import { LanguageMenu } from "../components/layout/LanguageMenu";
import { StudioPlans } from "../components/studio/StudioPlans";
import { StudioFaq } from "../components/studio/StudioFaq";
import { StudioLandingDemo } from "../components/studio/landing/StudioLandingDemo";
import { useAuth } from "../lib/auth";
import { useHydrated } from "../lib/useHydrated";
import { useFormat } from "../lib/format";
import { useReveal } from "../lib/useReveal";
import { useCookieConsent } from "../lib/cookieConsent";
import { useVatFranchise, vatNoticeKey } from "../lib/vatRegime";
import { trackStudio, trackStudioOnce } from "../lib/studioAnalytics";
import { RETURN_PARAM, SIGN_IN_PATH } from "../lib/authRoutes";
import { STUDIO_EDITOR_PATH } from "../lib/studioUrl";
import { LEGAL_PATHS } from "../data/legal/routes";
import { STUDIO_ENTRY_PLAN, STUDIO_TRIAL_DAYS } from "../data/studio";
import logoWordmark from "../assets/logo-wordmark.svg";

/**
 * The 3D Studio's advertising landing page (`/fr/studio-3d/essayer`,
 * `/en/3d-studio/try`), the address social ads point to.
 *
 * One goal — a visitor creates an account and starts the free trial — so the
 * page has no storefront header or footer (`AppShell`), a slim bar of its
 * own, and the same call to action in the hero, after the demo, in the plans,
 * in the closing block and in a bar that follows small screens. It is
 * `noindex` and absent from the sitemap (`localeRoutes`: `indexed: false`);
 * the ad's UTM parameters stay on the address and PostHog reads them.
 *
 * What it does not do: invent anything. Prices and the trial's length come
 * from `data/studio.ts` / the live plan prices; every feature listed exists in
 * the Studio (the AI smile try-on is left out until the owner connects it);
 * there is no testimonial, rating or figure until real ones exist; the demo
 * says it is a 2D illustration. Nothing here starts a trial or takes a
 * payment: the button leads to sign-up (or the editor, for a member), where
 * the trial is started on purpose (decision 93).
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";
const PLANS_ID = "studio-landing-plans";

const WHO = [
  { key: "artists", icon: Brush },
  { key: "salons", icon: Store },
  { key: "fans", icon: Users },
] as const;

const STEPS = [
  { key: "account", icon: UserPlus },
  { key: "compose", icon: Box },
  { key: "share", icon: Share2 },
] as const;

const FEATURES = [
  { key: "library", icon: Gem },
  { key: "view3d", icon: Box },
  { key: "appointment", icon: ClipboardList },
  { key: "share", icon: Share2 },
  { key: "shop", icon: ShoppingBag },
  { key: "organise", icon: FolderHeart },
  { key: "glowbook", icon: BookHeart },
] as const;

type Placement = "bar" | "hero" | "demo" | "plans" | "closing" | "sticky" | "faq";

function Heading({ id, eyebrow, title, body, center }: { id: string; eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <div className={clsx("grid max-w-[720px] gap-3", center && "mx-auto justify-items-center text-center")}>
      <span className="gt-eyebrow">{eyebrow}</span>
      <h2 id={id} className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
        {title}
      </h2>
      {body && <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">{body}</p>}
    </div>
  );
}

export function StudioLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  const hydrated = useHydrated();
  const { formatMoney } = useFormat();
  const { openSettings } = useCookieConsent();
  const vatNotice = vatNoticeKey(useVatFranchise());
  const member = hydrated && signedIn;

  const entryPrice = formatMoney(STUDIO_ENTRY_PLAN.amountMinor, STUDIO_ENTRY_PLAN.currency);
  const startLabel = member ? t("studioLanding.hero.ctaOpen") : t("studioLanding.hero.cta", { count: STUDIO_TRIAL_DAYS });

  // One view per tab; UTM and referrer ride on PostHog's own properties.
  useEffect(() => {
    trackStudioOnce("landing_viewed", "studio_landing_viewed");
  }, []);

  /** A member opens the editor; a visitor creates an account first and is brought back to it. */
  const start = (placement: Placement) => {
    trackStudio("studio_landing_cta_clicked", { placement, signed_in: member });
    if (member) navigate(STUDIO_EDITOR_PATH);
    else navigate("/inscription", { state: { from: STUDIO_EDITOR_PATH } });
  };
  const signIn = () => navigate(`${SIGN_IN_PATH}?${RETURN_PARAM}=${encodeURIComponent(STUDIO_EDITOR_PATH)}`);
  const toPlans = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(PLANS_ID)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  // The bar that follows small screens appears once the hero's button has gone by.
  const heroCta = useRef<HTMLDivElement>(null);
  const [passedHero, setPassedHero] = useState(false);
  useEffect(() => {
    const node = heroCta.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPassedHero(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const whoRef = useReveal<HTMLElement>();
  const stepsRef = useReveal<HTMLElement>();
  const featuresRef = useReveal<HTMLElement>();
  const plansRef = useReveal<HTMLElement>();
  const closingRef = useReveal<HTMLElement>();
  const faqRef = useReveal<HTMLElement>();

  const points = t("studioLanding.hero.points", { returnObjects: true }) as string[];

  return (
    <div className="gt-studio-alt overflow-x-clip pb-20 sm:pb-0">
      {/* ----------------------------------------------------------- Slim bar */}
      <header className={clsx("flex h-16 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-chrome)]", SECTION_X)}>
        <img src={logoWordmark.src} alt="Global Toothgems" className="h-5 w-auto sm:h-6" />
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageMenu />
          {!member && (
            <button type="button" onClick={signIn} className="min-h-11 rounded-[var(--radius-md)] px-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] hover:underline">
              {t("studioLanding.bar.signIn")}
            </button>
          )}
          <Button variant="primary" size="sm" onClick={() => start("bar")} className="gt-studio-cta">
            {member ? t("studioLanding.hero.ctaOpen") : t("studioLanding.bar.cta")}
          </Button>
        </div>
      </header>

      {/* --------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-studio-landing-title" className={clsx("gt-studio-b-hero relative overflow-hidden pb-[clamp(40px,7vw,96px)] pt-8 sm:pt-[clamp(32px,5vw,72px)]", SECTION_X)}>
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-70" />
        <div aria-hidden="true" className="gt-studio-b-aurora--blush pointer-events-none absolute -left-32 top-1/2 h-[320px] w-[320px] rounded-full" />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div className="grid min-w-0 justify-items-start gap-5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/75 py-1 pl-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
              <Sparkles size={13} aria-hidden="true" />
              {t("studioLanding.hero.eyebrow")}
            </span>
            <h1 id="gt-studio-landing-title" className="text-[clamp(34px,9vw,44px)] font-[var(--weight-black)] leading-[0.98] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)]">
              {t("studioLanding.hero.title")}
            </h1>
            <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t("studioLanding.hero.body")}</p>

            <div ref={heroCta} className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => start("hero")} className="gt-studio-cta sm:w-auto">
                {startLabel}
              </Button>
              <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={toPlans} className="sm:w-auto">
                {t("studioLanding.hero.ctaSecondary")}
              </Button>
            </div>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studioLanding.hero.reassurance", { count: STUDIO_TRIAL_DAYS, price: entryPrice })}</p>

            <ul className="m-0 grid list-none gap-2 p-0">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  <Check size={16} aria-hidden="true" className="text-[var(--gt-emerald-600,#0b6e50)]" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <StudioLandingDemo onContinue={() => start("demo")} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Who */}
      <section ref={whoRef} aria-labelledby="gt-studio-landing-who" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <Heading id="gt-studio-landing-who" eyebrow={t("studioLanding.who.eyebrow")} title={t("studioLanding.who.title")} />
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
            {WHO.map(({ key, icon: Icon }) => (
              <li key={key} className="gt-studio-b-card grid content-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-5 sm:p-6">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-white text-[var(--gt-blue-700)]">
                  <Icon size={19} />
                </span>
                <h3 className="text-[length:var(--text-h4)]">{t(`studioLanding.who.items.${key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studioLanding.who.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------------- Steps */}
      <section ref={stepsRef} aria-labelledby="gt-studio-landing-steps" className={clsx("gt-reveal bg-[var(--surface-sunken)] py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <Heading id="gt-studio-landing-steps" eyebrow={t("studioLanding.steps.eyebrow")} title={t("studioLanding.steps.title")} />
          <ol className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
            {STEPS.map(({ key, icon: Icon }, index) => (
              <li key={key} className="grid content-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 sm:p-6">
                <span className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--gt-blue-700)] text-[length:var(--text-body-sm)] font-bold text-white">
                    {index + 1}
                  </span>
                  <Icon size={18} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
                </span>
                <h3 className="text-[length:var(--text-h4)]">{t(`studioLanding.steps.items.${key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studioLanding.steps.items.${key}.body`)}</p>
              </li>
            ))}
          </ol>
          <div>
            <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => start("demo")} className="gt-studio-cta">
              {startLabel}
            </Button>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Features */}
      <section ref={featuresRef} aria-labelledby="gt-studio-landing-features" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-9">
          <Heading id="gt-studio-landing-features" eyebrow={t("studioLanding.features.eyebrow")} title={t("studioLanding.features.title")} body={t("studioLanding.features.body")} />
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <li key={key} className="gt-studio-b-card grid content-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-5 sm:p-6">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-white text-[var(--gt-blue-700)]">
                  <Icon size={19} />
                </span>
                <h3 className="text-[length:var(--text-h4)]">{t(`studioLanding.features.items.${key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studioLanding.features.items.${key}.body`)}</p>
                <p className="m-0 mt-auto inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-brand-wash)] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)]">
                  <Palette size={12} aria-hidden="true" />
                  {t(`studioLanding.features.items.${key}.tag`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------------- Plans */}
      <section id={PLANS_ID} ref={plansRef} aria-labelledby="gt-studio-landing-plans" className={clsx("gt-reveal scroll-mt-4 bg-[var(--surface-brand-wash)] py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <Heading id="gt-studio-landing-plans" eyebrow={t("studioLanding.plans.eyebrow")} title={t("studioLanding.plans.title")} body={t("studioLanding.plans.body")} />
          <StudioPlans onTrial={() => start("plans")} surface="studio_landing" />
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {vatNotice && `${t(vatNotice)}. `}
            {t("studioLanding.plans.note")}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ Closing */}
      <section ref={closingRef} aria-labelledby="gt-studio-landing-closing" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="gt-studio-b-close mx-auto grid max-w-[var(--max-width-content)] justify-items-center gap-5 rounded-[var(--radius-xl)] px-5 py-[clamp(36px,6vw,72px)] text-center sm:px-10">
          <h2 id="gt-studio-landing-closing" className="m-0 max-w-[20ch] text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
            {t("studioLanding.closing.title")}
          </h2>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-700)]">{t("studioLanding.closing.body")}</p>
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => start("closing")} className="gt-studio-cta">
            {member ? t("studioLanding.hero.ctaOpen") : t("studioLanding.closing.cta", { count: STUDIO_TRIAL_DAYS })}
          </Button>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-700)]">{t("studioLanding.hero.reassurance", { count: STUDIO_TRIAL_DAYS, price: entryPrice })}</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FAQ */}
      <section ref={faqRef} aria-labelledby="gt-studio-landing-faq" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="grid content-start gap-5">
            <Heading id="gt-studio-landing-faq" eyebrow={t("studioLanding.faq.eyebrow")} title={t("studioLanding.faq.title")} />
            <Button variant="outline" iconRight={ArrowRight} onClick={() => start("faq")} className="justify-self-start">
              {startLabel}
            </Button>
          </div>
          <StudioFaq />
        </div>
      </section>

      {/* ------------------------------------------------------------- Footer */}
      <footer className={clsx("border-t border-[var(--border-subtle)] py-8", SECTION_X)}>
        <div className="mx-auto flex max-w-[var(--max-width-content)] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label={t("studioLanding.footer.legal")} className="flex flex-wrap gap-x-5 gap-y-1 text-[length:var(--text-body-sm)]">
            <Link to={LEGAL_PATHS.legalNotice} className="py-2 text-[var(--text-body)] hover:underline">{t("legal.pages.legalNotice")}</Link>
            <Link to={LEGAL_PATHS.terms} className="py-2 text-[var(--text-body)] hover:underline">{t("legal.pages.terms")}</Link>
            <Link to={LEGAL_PATHS.privacy} className="py-2 text-[var(--text-body)] hover:underline">{t("legal.pages.privacy")}</Link>
            <Link to={LEGAL_PATHS.cookies} className="py-2 text-[var(--text-body)] hover:underline">{t("legal.pages.cookies")}</Link>
            <button type="button" onClick={openSettings} className="py-2 text-[var(--text-body)] hover:underline">{t("studioLanding.footer.cookiesSettings")}</button>
            <Link to={LEGAL_PATHS.contact} className="py-2 text-[var(--text-body)] hover:underline">{t("legal.pages.contact")}</Link>
          </nav>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studioLanding.footer.copyright")}</p>
        </div>
      </footer>

      {/* ---------------------------------------- Bar following small screens */}
      <div
        className={clsx(
          "fixed inset-x-0 bottom-0 z-[40] border-t border-[var(--border-subtle)] bg-[var(--surface-chrome)] p-3 shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-normal)] sm:hidden",
          passedHero ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        aria-hidden={!passedHero}
      >
        <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => start("sticky")} tabIndex={passedHero ? 0 : -1} className="gt-studio-cta">
          {member ? t("studioLanding.hero.ctaOpen") : t("studioLanding.sticky.label", { count: STUDIO_TRIAL_DAYS })}
        </Button>
      </div>
    </div>
  );
}
