"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../lib/navigation";
import clsx from "clsx";
import { ArrowDown, ArrowRight, Box, Gem, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StudioDemo } from "../components/studio/StudioDemo";
import { StudioPlans } from "../components/studio/StudioPlans";
import { InspirationBoards } from "../components/studio/InspirationBoards";
import { StudioFaq } from "../components/studio/StudioFaq";
import { useFormat } from "../lib/format";
import { useReveal } from "../lib/useReveal";
import { STUDIO_ENTRY_PLAN, STUDIO_TRIAL_DAYS } from "../data/studio";
import { STUDIO_EDITOR_PATH, STUDIO_SUBSCRIBE_PATH } from "../lib/studioUrl";
import { useStudioAccess } from "../lib/studioAccess";

/**
 * The 3D Studio's public presentation page, built for phones first.
 *
 * A product page rather than a tour: the demo film, the promise and the call
 * to action at the top; what the Studio changes for the visitor; one wall of
 * ideas to start from (the inspiration boards); the offers (`StudioPlans`)
 * and the questions. A bar keeps the call to action under the thumb once the
 * hero's buttons have scrolled away.
 *
 * While the Studio is in its free preview (`studioAccess`), "Start" and the
 * trial open the editor itself; a paid plan still leads to the subscription
 * page, so the offers stay visible.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";
const PLANS_ID = "formules";

const ADVANTAGES = [
  { key: "try", icon: Sparkles },
  { key: "shop", icon: Gem },
  { key: "share", icon: Send },
  { key: "keep", icon: ShieldCheck },
] as const;

function SectionHeading({ id, eyebrow, title, body }: { id: string; eyebrow: string; title: string; body?: string }) {
  return (
    <div className="grid max-w-[640px] gap-3">
      <span className="gt-eyebrow">{eyebrow}</span>
      <h2 id={id} className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
        {title}
      </h2>
      {body && <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">{body}</p>}
    </div>
  );
}

export function Studio() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const navigate = useNavigate();
  const entryPrice = formatMoney(STUDIO_ENTRY_PLAN.amountMinor, STUDIO_ENTRY_PLAN.currency);

  const advantagesRef = useReveal<HTMLElement>();
  const inspirationRef = useReveal<HTMLElement>();
  const plansRef = useReveal<HTMLElement>();
  const faqRef = useReveal<HTMLElement>();

  /* The phone call-to-action bar appears once the hero's own buttons have
     scrolled away, so a thumb always has "Start" within reach. */
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const access = useStudioAccess();
  const start = () => navigate(access.granted ? STUDIO_EDITOR_PATH : STUDIO_SUBSCRIBE_PATH);
  const subscribe = () => navigate(STUDIO_SUBSCRIBE_PATH);
  const seePlans = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(PLANS_ID)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  const startLabel = access.granted ? t("studio.hero.ctaOpen") : t("studio.hero.ctaPrimary", { count: STUDIO_TRIAL_DAYS });

  return (
    <div className="gt-studio overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-studio-title" className={clsx("gt-studio-hero relative overflow-hidden pb-[clamp(40px,7vw,96px)] pt-5 sm:pt-[clamp(28px,5vw,72px)]", SECTION_X)}>
        <div aria-hidden="true" className="gt-studio-hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          {/* The demo comes first on a phone, beside the text on a wide screen. */}
          <div className="relative min-w-0 lg:order-2">
            <div aria-hidden="true" className="gt-studio-halo pointer-events-none absolute -inset-8" />
            <StudioDemo className="relative" />
          </div>

          <div className="grid min-w-0 justify-items-start gap-4 lg:order-1 lg:gap-5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/70 py-1 pl-2.5 pr-2 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
              <Box size={13} aria-hidden="true" />
              {t("studio.hero.eyebrow")}
            </span>
            <h1 id="gt-studio-title" className="text-[clamp(32px,8.5vw,40px)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)]">
              {t("studio.hero.title")}
            </h1>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">{t("studio.hero.body")}</p>
            <div ref={heroCtaRef} className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={start} className="gt-studio-cta sm:w-auto">
                {startLabel}
              </Button>
              <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={seePlans} className="sm:w-auto">
                {t("studio.hero.ctaSecondary")}
              </Button>
            </div>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("studio.hero.reassurance", { count: STUDIO_TRIAL_DAYS, price: entryPrice })}
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

      {/* ---------------------------------------------------------- Advantages */}
      <section ref={advantagesRef} aria-labelledby="gt-studio-advantages" className={clsx("gt-reveal py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <SectionHeading id="gt-studio-advantages" eyebrow={t("studio.advantages.eyebrow")} title={t("studio.advantages.title")} body={t("studio.advantages.body")} />
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {ADVANTAGES.map(({ key, icon: Icon }) => (
              <li key={key} className="grid grid-cols-[auto_1fr] items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:grid-cols-1 sm:p-5">
                <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                  <Icon size={18} />
                </span>
                <span className="grid gap-1">
                  <h3 className="text-[length:var(--text-h4)]">{t(`studio.advantages.items.${key}.title`)}</h3>
                  <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studio.advantages.items.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- Inspiration */}
      <section ref={inspirationRef} aria-labelledby="gt-studio-inspiration" className={clsx("gt-reveal bg-[var(--surface-sunken)] py-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <SectionHeading id="gt-studio-inspiration" eyebrow={t("studio.inspiration.eyebrow")} title={t("studio.inspiration.title")} body={t("studio.inspiration.body")} />
          <InspirationBoards />
        </div>
      </section>

      {/* --------------------------------------------------------------- Plans */}
      <section
        id={PLANS_ID}
        ref={plansRef}
        aria-labelledby="gt-studio-plans"
        className={clsx("gt-reveal scroll-mt-20 py-[var(--section-y)]", SECTION_X)}
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <SectionHeading id="gt-studio-plans" eyebrow={t("studio.plans.eyebrow")} title={t("studio.plans.title")} body={t("studio.plans.body")} />
          <StudioPlans onTrial={start} onChoose={subscribe} />
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.plans.note")}</p>
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section ref={faqRef} aria-labelledby="gt-studio-faq" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="grid content-start gap-5">
            <SectionHeading id="gt-studio-faq" eyebrow={t("studio.faq.eyebrow")} title={t("studio.faq.title")} />
            <Button variant="outline" iconRight={ArrowRight} onClick={start} className="justify-self-start">
              {startLabel}
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
        <span className="grid leading-tight text-[var(--text-primary)]">
          <strong className="text-[14px] font-[var(--weight-black)]">{t("studio.bar.trial", { count: STUDIO_TRIAL_DAYS })}</strong>
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t("studio.bar.then", { price: entryPrice })}</span>
        </span>
        <Button variant="primary" size="sm" iconRight={ArrowRight} onClick={start} tabIndex={showBar ? 0 : -1}>
          {t("studio.bar.cta")}
        </Button>
      </div>
    </div>
  );
}
