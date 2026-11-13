"use client";

import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowLeft, ArrowRight, Box, Info, Link2, MapPin, Palette, Rotate3d, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ACCOUNT_STUDIO_PATH } from "../components/studio/StudioPlans";
import { STUDIO_PLANS } from "../data/studio";
import { useFormat } from "../lib/format";
import { photo } from "../lib/images";
import { Link, useNavigate } from "../lib/navigation";
import { StudioAccessProvider, useStudioAccess } from "../lib/studioAccess";
import { lowestPlanWith } from "../lib/studioEntitlements";
import { STUDIO_PATH, STUDIO_SUBSCRIBE_PATH, studioSectionPath } from "../lib/studioUrl";
import { useHydrated } from "../lib/useHydrated";
import { useReveal } from "../lib/useReveal";

/**
 * The Glowbook's presentation (`/fr/glowbook`, `/en/glowbook`): what an
 * artist's public page does and the plan that opens it (decision 113). It is
 * the Studio menu's "Glowbook" entry, and where members below that plan land
 * from the Studio's Glowbook section. Three sections, phone first: the
 * promise with a preview, what clients see, how to get online.
 *
 * The call to action follows the member's Studio access as the database
 * reports it (`StudioAccessProvider`): their Glowbook when the plan includes
 * it, the plan switch on their subscription page when they already pay for a
 * lower plan, the subscription page otherwise (signed out included). Display
 * only: nothing is granted here.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";
const BENEFITS_ID = "gt-glowbook-intro-benefits";

const BENEFITS = [
  { key: "link", icon: Link2 },
  { key: "creations", icon: Rotate3d },
  { key: "identity", icon: Palette },
  { key: "found", icon: MapPin },
] as const;

const STEPS = ["plan", "page", "share"] as const;

/** Site photos standing for creations in the preview; decorative. */
const PREVIEW_SPOTLIGHT = "mouth-02.webp";
const PREVIEW_TILES = ["mouth-01.jpg", "mouth-03.jpg", "mouth-04.jpg"] as const;

export function GlowbookIntro() {
  return (
    <StudioAccessProvider>
      <GlowbookIntroContent />
    </StudioAccessProvider>
  );
}

function GlowbookIntroContent() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const planId = lowestPlanWith("glowbook");
  const plan = t(`studio.plans.items.${planId ?? "atelier"}.name`);
  const offer = STUDIO_PLANS.find((p) => p.id === planId);
  const price = offer?.amountMinor ? formatMoney(offer.amountMinor, offer.currency) : null;
  const cta = useGlowbookCta(plan);

  const benefitsRef = useReveal<HTMLElement>();
  const stepsRef = useReveal<HTMLElement>();

  const showBenefits = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(BENEFITS_ID)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="gt-studio-alt overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section
        aria-labelledby="gt-glowbook-intro-title"
        className={clsx("gt-studio-b-hero relative overflow-hidden pb-[clamp(40px,7vw,96px)] pt-5 sm:pt-[clamp(28px,5vw,72px)]", SECTION_X)}
      >
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full opacity-70" />
        <div aria-hidden="true" className="gt-studio-b-aurora--blush pointer-events-none absolute -left-32 top-1/2 h-[300px] w-[300px] rounded-full" />

        <div className="relative mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <div className="grid min-w-0 justify-items-start gap-5">
            <Link
              to={STUDIO_PATH}
              className="inline-flex items-center gap-2 rounded-full px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("studio.glowbook.intro.back")}
            </Link>
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/75 py-1 pl-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] backdrop-blur">
              <Sparkles size={13} aria-hidden="true" />
              {t("studio.glowbook.intro.eyebrow", { plan })}
            </span>
            <h1
              id="gt-glowbook-intro-title"
              className="text-[clamp(34px,9vw,44px)] font-[var(--weight-black)] leading-[0.98] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)]"
            >
              {t("studio.glowbook.intro.title")}
            </h1>
            <p className="m-0 max-w-[50ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">
              {t("studio.glowbook.intro.body")}
            </p>

            {cta.locked && (
              <p className="m-0 inline-flex max-w-[60ch] items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-white/75 px-4 py-2.5 text-left text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                <Info size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
                {t("studio.glowbook.intro.lockedNote")}
              </p>
            )}

            <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={cta.go} className="gt-studio-cta sm:w-auto">
                {cta.label}
              </Button>
              <Button variant="outline" size="lg" fullWidth iconRight={ArrowDown} onClick={showBenefits} className="sm:w-auto">
                {t("studio.glowbook.intro.see")}
              </Button>
            </div>
            {price && !cta.open && (
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studio.glowbook.intro.price", { plan, price })}</p>
            )}
          </div>

          <GlowbookPhonePreview />
        </div>
      </section>

      {/* ------------------------------------------------------------ Benefits */}
      <section
        id={BENEFITS_ID}
        ref={benefitsRef}
        aria-labelledby="gt-glowbook-intro-benefits-title"
        className={clsx("gt-reveal scroll-mt-20 py-[var(--section-y)]", SECTION_X)}
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="grid max-w-[720px] gap-3">
            <span className="grid justify-items-start gap-2">
              <span className="gt-eyebrow">{t("studio.glowbook.intro.benefits.eyebrow")}</span>
              <span aria-hidden="true" className="gt-studio-b-tick h-px w-16" />
            </span>
            <h2
              id="gt-glowbook-intro-benefits-title"
              className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
            >
              {t("studio.glowbook.intro.benefits.title")}
            </h2>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {BENEFITS.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="gt-studio-b-card grid grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-x-4 gap-y-1 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 sm:grid-cols-1 sm:gap-y-4 sm:p-6"
              >
                <span
                  aria-hidden="true"
                  className="row-span-2 grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-white text-[var(--gt-blue-700)] sm:row-span-1"
                >
                  <Icon size={19} />
                </span>
                <h3 className="text-[length:var(--text-h4)]">{t(`studio.glowbook.intro.benefits.items.${key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studio.glowbook.intro.benefits.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------- Steps and closing */}
      <section ref={stepsRef} aria-labelledby="gt-glowbook-intro-steps" className={clsx("gt-reveal pb-[var(--section-y)]", SECTION_X)}>
        <div className="gt-studio-b-close mx-auto grid max-w-[var(--max-width-content)] gap-6 rounded-[var(--radius-xl)] px-5 py-[clamp(32px,6vw,64px)] sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-12">
          <div className="grid gap-5">
            <h2
              id="gt-glowbook-intro-steps"
              className="m-0 text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]"
            >
              {t("studio.glowbook.intro.steps.title")}
            </h2>
            <ol className="m-0 grid list-none gap-3 p-0">
              {STEPS.map((key, index) => (
                <li key={key} className="flex items-start gap-3 text-[length:var(--text-body-md)] text-[var(--gt-ink-800)]">
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--gt-ink-900)] text-[12px] font-bold text-[var(--gt-white)]"
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{t(`studio.glowbook.intro.steps.items.${key}`, { plan })}</span>
                </li>
              ))}
            </ol>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--gt-ink-700)]">{t("studio.glowbook.intro.steps.note")}</p>
          </div>
          <div className="grid gap-2">
            <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={cta.go} className="gt-studio-cta lg:w-auto">
              {cta.label}
            </Button>
            {price && !cta.open && (
              <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--gt-ink-700)]">{t("studio.glowbook.intro.price", { plan, price })}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Where the page's call to action leads for this visitor. Until the page is
 * hydrated and the access is known (and for a visitor signed out), the plans:
 * the server render and the first browser render agree.
 */
function useGlowbookCta(plan: string): { label: string; go: () => void; open: boolean; locked: boolean } {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const status = useStudioAccess()?.status;

  const choose = { label: t("studio.glowbook.intro.ctaChoose", { plan }), go: () => navigate(STUDIO_SUBSCRIBE_PATH), open: false, locked: false };
  if (!hydrated || !status) return choose;
  if (status.kind === "preview" || (status.kind === "ready" && status.info.glowbook)) {
    return { label: t("studio.glowbook.intro.ctaOpen"), go: () => navigate(studioSectionPath("glowbook")), open: true, locked: false };
  }
  if (status.kind !== "ready") return choose;
  // A paying member below the plan switches on their subscription page (prorated, decision 112).
  if (status.info.subscriptionPlan !== null) {
    return { label: t("studio.glowbook.intro.ctaUpgrade", { plan }), go: () => navigate(ACCOUNT_STUDIO_PATH), open: false, locked: true };
  }
  return { ...choose, locked: true };
}

/**
 * A phone showing the shape of a Glowbook page — identity bar, spotlight
 * creation, grid, booking link — drawn from the design tokens and the site's
 * own photos. Decorative: one label for assistive technology, no fake name.
 */
function GlowbookPhonePreview() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto w-full max-w-[260px] min-w-0 sm:max-w-[300px] lg:max-w-[340px]">
      <div
        role="img"
        aria-label={t("studio.glowbook.intro.previewLabel")}
        className="gt-studio-b-frame relative rounded-[36px] border border-[var(--border-subtle)] p-2.5"
      >
        <div aria-hidden="true" className="grid gap-3 overflow-hidden rounded-[28px] bg-[var(--gt-white)] px-3.5 pb-4 pt-3">
          <span className="mx-auto h-1.5 w-16 rounded-full bg-[var(--gt-ink-900)]/80" />
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[linear-gradient(135deg,var(--gt-blue-200),var(--gt-fuchsia-300))] text-[var(--gt-blue-700)]">
              <Sparkles size={16} />
            </span>
            <span className="grid flex-1 gap-1.5">
              <span className="h-2.5 w-24 rounded-full bg-[var(--gt-ink-900)]" />
              <span className="h-2 w-16 rounded-full bg-[var(--gt-blue-200)]" />
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]">
              <MapPin size={13} />
            </span>
          </div>
          <div className="relative overflow-hidden rounded-[18px]">
            <img src={photo(PREVIEW_SPOTLIGHT)} alt="" loading="eager" decoding="async" className="aspect-[4/5] w-full object-cover" />
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
              <Box size={11} />
              3D
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {PREVIEW_TILES.map((name) => (
              <img key={name} src={photo(name)} alt="" loading="lazy" decoding="async" className="aspect-square w-full rounded-[10px] object-cover" />
            ))}
          </div>
          <span className="flex items-center justify-center gap-1.5 rounded-full bg-[var(--gt-ink-900)] py-2 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-white)]">
            {t("studio.glowbook.intro.previewCta")}
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}
