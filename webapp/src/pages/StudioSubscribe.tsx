import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CreditCard,
  Info,
  Lock,
  MonitorSmartphone,
  PartyPopper,
  RefreshCcw,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Input } from "../components/ui/Input";
import { StudioPricingCard } from "../components/studio/StudioPricingCard";
import { GemIcon } from "../components/studio/Gem";
import { NewTag } from "../components/studio/NewTag";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { formatPrice } from "../lib/format";
import { STUDIO_PRICE } from "../data/studio";
import { STUDIO_PATH, STUDIO_SUBSCRIBE_PATH } from "../lib/studioUrl";

/**
 * The Studio's subscription page: one plan, one account, one action.
 *
 * A visual prototype of the flow, not a checkout. No card is collected, no
 * payment is taken and no access is granted: "Subscribe" plays a loading state
 * and then shows the confirmation the real flow would end on. In production
 * the button hands over to Stripe Checkout in subscription mode, and the
 * Studio unlocks only when the verified webhook says the subscription is
 * active — never because this screen reached its last state.
 */

type Phase = "review" | "processing" | "confirmed";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Long enough for the loading state to be seen, as a real hand-off would be. */
const PROCESSING_MS = 1600;

export function StudioSubscribe() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { signedIn, displayName, initials, email: accountEmail } = useAuth();
  const price = formatPrice(STUDIO_PRICE.amount, undefined, STUDIO_PRICE.currency);

  const [phase, setPhase] = useState<Phase>("review");
  const [agreed, setAgreed] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  // Move focus to the confirmation so screen readers hear the outcome.
  useEffect(() => {
    if (phase === "confirmed") confirmRef.current?.focus();
  }, [phase]);

  const subscribe = () => {
    if (!signedIn && !EMAIL_RE.test(email.trim())) {
      setEmailError(t("studio.subscribe.emailInvalid"));
      return;
    }
    setEmailError(null);
    setPhase("processing");
    timer.current = window.setTimeout(() => setPhase("confirmed"), PROCESSING_MS);
  };

  const steps = [
    { key: "plan", done: true },
    { key: "account", done: signedIn || phase !== "review" },
    { key: "confirm", done: phase === "confirmed" },
  ];

  const reassurance = [
    { icon: Lock, key: "secure" },
    { icon: RefreshCcw, key: "cancel" },
    { icon: MonitorSmartphone, key: "devices" },
  ];

  return (
    <div className="gt-studio overflow-x-clip">
      <section className="gt-studio-hero relative overflow-hidden px-[clamp(14px,4vw,48px)] pb-[var(--section-y)] pt-[clamp(20px,4vw,40px)]">
        <div aria-hidden="true" className="gt-studio-hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1120px] gap-[clamp(28px,4vw,48px)]">
          <Link
            to={STUDIO_PATH}
            className="inline-flex items-center gap-2 justify-self-start rounded-full px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t("studio.subscribe.back")}
          </Link>

          <header className="mx-auto grid max-w-[720px] justify-items-center gap-4 text-center">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-white/70 py-1 pl-2.5 pr-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
              <Box size={13} aria-hidden="true" />
              {t("studio.hero.eyebrow")}
              <NewTag />
            </span>
            <h1 className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
              {t("studio.subscribe.title")}
            </h1>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.subscribe.body")}</p>
          </header>

          <div className="grid grid-cols-1 items-start gap-[clamp(20px,3vw,36px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            {/* The offer: the visual focus of the page. */}
            <div className="relative lg:sticky lg:top-[100px]">
              <div aria-hidden="true" className="gt-studio-halo pointer-events-none absolute -inset-8" />
              <span aria-hidden="true" className="gt-studio-float absolute -right-2 -top-5 z-[1] hidden sm:block">
                <GemIcon shape="heart" material="gold" size={56} />
              </span>
              <span aria-hidden="true" className="gt-studio-float gt-studio-float--late absolute -left-4 bottom-16 z-[1] hidden sm:block">
                <GemIcon shape="round" material="crystal" size={40} />
              </span>
              <StudioPricingCard variant="focus" className="relative" />
            </div>

            {/* The flow */}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(18px,3vw,32px)] shadow-[var(--shadow-md)]">
              <ol aria-label={t("studio.subscribe.stepsLabel")} className="m-0 flex list-none flex-wrap items-center justify-between gap-2 p-0 sm:flex-nowrap sm:justify-start">
                {steps.map((step, i) => (
                  <li key={step.key} className="flex items-center gap-2 sm:flex-1">
                    <span
                      className={clsx(
                        "grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold",
                        step.done ? "bg-[var(--gt-ink-900)] text-white" : "border border-[var(--border-default)] text-[var(--text-muted)]",
                      )}
                    >
                      {step.done ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : i + 1}
                    </span>
                    <span className={clsx("text-[11.5px] font-semibold", step.done ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>
                      {t(`studio.subscribe.steps.${step.key}`)}
                      <span className="sr-only">{step.done ? ` — ${t("studio.subscribe.stepDone")}` : ""}</span>
                    </span>
                    {i < steps.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-[var(--border-subtle)] sm:block" />}
                  </li>
                ))}
              </ol>

              {phase === "confirmed" ? (
                <div className="gt-celebrate grid justify-items-start gap-4 rounded-[var(--radius-lg)] bg-[var(--status-success-bg)] p-[clamp(18px,3vw,28px)]">
                  <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--status-success-fg)] shadow-[var(--shadow-sm)]">
                    <PartyPopper size={22} />
                  </span>
                  <h2 ref={confirmRef} tabIndex={-1} className="text-[length:var(--text-h2)] outline-none">
                    {t("studio.subscribe.confirmedTitle")}
                  </h2>
                  <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
                    {t("studio.subscribe.confirmedBody", { email: signedIn ? accountEmail : email.trim() })}
                  </p>
                  <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--gt-ink-600)]">
                    <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                    {t("studio.subscribe.prototypeConfirmed")}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="primary"
                      iconRight={ArrowRight}
                      onClick={() => showToast(t("common.notIncludedTitle"), t("studio.subscribe.editorToast"), "info")}
                    >
                      {t("studio.subscribe.openStudio")}
                    </Button>
                    <Button variant="outline" iconLeft={ArrowLeft} onClick={() => navigate(STUDIO_PATH)}>
                      {t("studio.subscribe.back")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Plan */}
                  <fieldset className="m-0 grid gap-2 border-0 p-0">
                    <legend className="gt-eyebrow mb-2">{t("studio.subscribe.planLegend")}</legend>
                    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--gt-ink-900)] bg-[var(--gt-off-white)] p-3.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]">
                      <input type="radio" name="studio-plan" checked readOnly className="peer sr-only" />
                      <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center rounded-full border-2 border-[var(--gt-ink-900)]">
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--gt-ink-900)]" />
                      </span>
                      <span className="grid flex-1 gap-0.5">
                        <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("studio.subscribe.planMonthly")}</strong>
                        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.subscribe.planMonthlySub")}</span>
                      </span>
                      <span className="text-[length:var(--text-body-md)] font-[var(--weight-black)] text-[var(--text-primary)]">
                        {price}
                        <span className="text-[12px] font-semibold text-[var(--text-muted)]"> {t("studio.pricing.perMonth")}</span>
                      </span>
                    </label>
                  </fieldset>

                  {/* Account */}
                  <div className="grid gap-2">
                    <span className="gt-eyebrow">{t("studio.subscribe.accountLegend")}</span>
                    {signedIn ? (
                      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3.5">
                        <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[13px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
                          {initials}
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{displayName}</strong>
                          <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{accountEmail}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-success-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--status-success-fg)]">
                          <Check size={11} strokeWidth={3} aria-hidden="true" />
                          {t("studio.subscribe.signedIn")}
                        </span>
                      </div>
                    ) : (
                      <div className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3.5">
                        <Input
                          id="studio-email"
                          label={t("studio.subscribe.emailLabel")}
                          type="email"
                          autoComplete="email"
                          placeholder={t("studio.subscribe.emailPlaceholder")}
                          value={email}
                          disabled={phase === "processing"}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailError) setEmailError(null);
                          }}
                          aria-invalid={emailError ? true : undefined}
                          aria-describedby={emailError ? "studio-email-error" : "studio-email-hint"}
                        />
                        {emailError ? (
                          <p id="studio-email-error" role="alert" className="m-0 text-xs font-medium text-[var(--status-error-fg)]">
                            {emailError}
                          </p>
                        ) : (
                          <p id="studio-email-hint" className="m-0 text-xs text-[var(--text-muted)]">
                            {t("studio.subscribe.emailHint")}{" "}
                            <Link to="/connexion" state={{ from: STUDIO_SUBSCRIBE_PATH }} className="gt-legal-link">
                              {t("studio.subscribe.signInLink")}
                            </Link>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment (fictional) */}
                  <div className="grid gap-2">
                    <span className="gt-eyebrow">{t("studio.subscribe.paymentLegend")}</span>
                    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3.5">
                      <span aria-hidden="true" className="grid h-9 w-12 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                        <CreditCard size={18} />
                      </span>
                      <span className="grid flex-1">
                        <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("studio.subscribe.cardDemo")}</strong>
                        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.subscribe.cardDemoSub")}</span>
                      </span>
                    </div>
                    <p className="gt-review-note m-0 flex items-start gap-2 rounded-[var(--radius-md)] p-3 text-[length:var(--text-caption)] text-[var(--gt-ink-700)]">
                      <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                      {t("studio.subscribe.prototypeNote")}
                    </p>
                  </div>

                  {/* Summary */}
                  <dl className="m-0 grid gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)] p-4 text-[length:var(--text-body-sm)]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-body)]">{t("studio.subscribe.summaryLine")}</dt>
                      <dd className="m-0 font-semibold text-[var(--text-primary)]">{price}</dd>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-[var(--border-subtle)] pt-2">
                      <dt className="font-bold text-[var(--text-primary)]">{t("studio.subscribe.dueToday")}</dt>
                      <dd className="m-0 font-[var(--weight-black)] text-[var(--text-primary)]">{price}</dd>
                    </div>
                    <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.subscribe.renews", { price })}</p>
                  </dl>

                  <Checkbox label={t("studio.subscribe.terms")} description={t("studio.subscribe.termsHint")} checked={agreed} onChange={setAgreed} />

                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
                    <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} disabled={!agreed} loading={phase === "processing"} onClick={subscribe} className="gt-studio-cta !h-auto min-h-14 !whitespace-normal py-3 text-center">
                      {phase === "processing" ? t("studio.subscribe.processing") : t("studio.subscribe.cta")}
                    </Button>
                    {!agreed && <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.subscribe.ctaHint")}</p>}
                    <Button variant="ghost" fullWidth iconLeft={ArrowLeft} onClick={() => navigate(STUDIO_PATH)} disabled={phase === "processing"}>
                      {t("studio.subscribe.back")}
                    </Button>
                  </div>
                </>
              )}

              <ul className="m-0 grid list-none gap-2 border-t border-[var(--border-subtle)] p-0 pt-4 sm:grid-cols-3">
                {reassurance.map(({ icon: Icon, key }) => (
                  <li key={key} className="flex items-center gap-2 text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">
                    <Icon size={14} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
                    {t(`studio.subscribe.reassurance.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
