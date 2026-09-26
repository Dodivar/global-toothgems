import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Gift,
  Lock,
  Mail,
  MailCheck,
  PartyPopper,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "../components/ui/Button";
import { usePromotions } from "../lib/adminPromotions";
import { useLocalized } from "../lib/localized";
import { useReveal } from "../lib/useReveal";
import { parseEuros } from "../lib/promotionRules";
import type { FieldMode, GiftCardDesign } from "../data/adminPromotions";
import { useMoney, usePromoDates } from "../components/promotions/PromoBadges";
import { GiftCardVisual } from "../components/promotions/Visuals";

/**
 * The gift card, as a customer buys it.
 *
 * Emotional at the top — one elegant card, one sentence, one button — and
 * practical below: amount, design, who it is for, a message, when it arrives.
 * The card on the right (above the form on a phone) redraws as each field is
 * filled, so the customer is always looking at the thing they are about to
 * give.
 *
 * Every option comes from the back office's gift card configuration (same
 * store): the preset amounts and their order, the custom-amount range, which
 * fields are required, which designs are offered, whether delivery can be
 * scheduled. "Buy gift card" is a prototype: it validates and confirms, but
 * nothing is charged or sent; payment and fulfilment belong to Stripe and the
 * server, driven by a verified webhook.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOMORROW = "2027-11-25";

export function GiftCard() {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const { dateLong } = usePromoDates();
  const { config } = usePromotions();
  const formRef = useRef<HTMLElement>(null);
  const heroRef = useReveal<HTMLDivElement>();

  const designs = config.designs.filter((d) => d.enabled).map((d) => d.id);
  const [amount, setAmount] = useState<number | "custom">(config.amounts[1] ?? config.amounts[0] ?? "custom");
  const [custom, setCustom] = useState("");
  const [design, setDesign] = useState<GiftCardDesign>(designs.includes(config.defaultDesign) ? config.defaultDesign : (designs[0] ?? "sparkle"));
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [deliverOn, setDeliverOn] = useState("2027-12-24");
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const customCents = parseEuros(custom);
  const cents = amount === "custom" ? customCents : amount;

  // Recomputed every render: a handful of string checks, and it keeps the
  // messages in step with the language switch without a dependency list.
  const errors = (() => {
    const e: Record<string, string> = {};
    if (amount === "custom") {
      if (!customCents) e.amount = t("promo.store.errors.amount");
      else if (customCents < config.minCents || customCents > config.maxCents)
        e.amount = t("promo.store.errors.range", { min: money(config.minCents), max: money(config.maxCents) });
    }
    const need = (mode: FieldMode, value: string, key: string, msg: string) => {
      if (mode === "required" && !value.trim()) e[key] = msg;
    };
    need(config.fields.recipientName, recipientName, "recipientName", t("promo.store.errors.recipientName"));
    if (!recipientEmail.trim()) e.recipientEmail = t("promo.store.errors.email");
    else if (!EMAIL.test(recipientEmail.trim())) e.recipientEmail = t("promo.store.errors.emailFormat");
    need(config.fields.senderName, senderName, "senderName", t("promo.store.errors.senderName"));
    need(config.fields.message, message, "message", t("promo.store.errors.message"));
    if (when === "later" && (!deliverOn || deliverOn < TOMORROW)) e.deliverOn = t("promo.store.errors.date");
    return e;
  })();

  const err = (key: string) => (submitted ? errors[key] : undefined);

  const buy = () => {
    setSubmitted(true);
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById(`gc-${first}`)?.focus();
      return;
    }
    setStatus("loading");
    setTimeout(() => setStatus("done"), 900);
  };

  const reset = () => {
    setStatus("idle");
    setSubmitted(false);
    setRecipientName("");
    setRecipientEmail("");
    setMessage("");
  };

  if (!config.published) {
    return (
      <section className="gt-register-wash grid min-h-[60vh] place-items-center px-[var(--gutter-page)] py-[var(--section-y-sm)] text-center">
        <div className="grid max-w-[520px] justify-items-center gap-4">
          <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
            <Gift size={28} strokeWidth={1.6} />
          </span>
          <h1 className="text-[length:var(--text-h2)]">{t("promo.store.unavailableTitle")}</h1>
          <p className="m-0 text-[var(--text-body)]">{t("promo.store.unavailableBody")}</p>
          <Link to="/boutique" className="gt-underline font-semibold">{t("promo.store.backToShop")}</Link>
        </div>
      </section>
    );
  }

  const previewMessage = config.fields.message === "hidden" ? undefined : message || undefined;

  return (
    <div className="bg-[var(--surface-page)]">
      {/* Hero */}
      <section className="gt-register-wash relative overflow-hidden px-[var(--gutter-page)] pb-[var(--section-y-sm)] pt-[clamp(32px,6vw,72px)] lg:px-[var(--gutter-page-lg)]">
        <div ref={heroRef} className="gt-reveal mx-auto grid max-w-[var(--max-width-content)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-5">
            <p className="gt-eyebrow m-0">{t("promo.store.eyebrow")}</p>
            <h1 className="text-[length:var(--text-display-2)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
              {t("promo.store.headlineA")}{" "}
              <span className="gt-script font-normal text-[var(--gt-blue-600)]">{t("promo.store.headlineB")}</span>
            </h1>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">{l(config.description)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" iconRight={Gift} onClick={() => formRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
                {t("promo.store.cta")}
              </Button>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {t("promo.store.from", { amount: money(Math.min(...config.amounts, config.allowCustomAmount ? config.minCents : Infinity)) })}
              </span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[520px]">
            <span aria-hidden="true" className="absolute -inset-6 -z-0 rounded-[var(--radius-2xl)] bg-[radial-gradient(closest-side,rgba(185,205,229,.8),transparent)]" />
            <div className="relative rotate-[-4deg] transition-transform duration-[var(--duration-slow)] hover:rotate-0 motion-reduce:rotate-0">
              <GiftCardVisual design={design} amountCents={cents ?? null} recipient={t("promo.store.heroRecipient")} message={t("promo.store.heroMessage")} size="lg" />
            </div>
            <div className="gt-glass-panel gt-glass-panel-compact absolute -bottom-7 right-2 hidden items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 sm:flex">
              <MailCheck size={18} aria-hidden="true" className="text-[var(--gt-emerald-600)]" />
              <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("promo.store.heroChip")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Reassurance */}
      <section aria-label={t("promo.store.reassuranceLabel")} className="border-y border-[var(--border-subtle)] bg-[var(--surface-brand-wash-strong)] px-[var(--gutter-page)]">
        <ul className="mx-auto grid max-w-[var(--max-width-content)] list-none grid-cols-2 gap-4 p-0 py-5 md:grid-cols-4">
          {[
            { icon: Mail, key: "email" },
            { icon: Tag, key: "redeem" },
            { icon: Lock, key: "secure" },
            { icon: Sparkles, key: "valid" },
          ].map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-3">
              <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--gt-white)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)]">
                <Icon size={16} />
              </span>
              <span className="grid">
                <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t(`promo.store.reassurance.${key}`)}</strong>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`promo.store.reassurance.${key}Body`, { months: config.expiryMonths ?? 0 })}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Configurator */}
      <section ref={formRef} id="configurer" aria-labelledby="gc-config-title" className="scroll-mt-20 px-[var(--gutter-page)] py-[var(--section-y-sm)] lg:px-[var(--gutter-page-lg)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12">
          <div className="order-2 grid gap-8 lg:order-1">
            <header className="grid gap-2">
              <h2 id="gc-config-title" className="text-[length:var(--text-h2)]">{l(config.title)}</h2>
              <p className="m-0 text-[var(--text-muted)]">{t("promo.store.configIntro")}</p>
            </header>

            {status === "done" ? (
              <Confirmation cents={cents ?? 0} name={recipientName} email={recipientEmail} when={when === "now" ? t("promo.store.now") : dateLong(`${deliverOn}T09:00`)} onAnother={reset} />
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  buy();
                }}
                className="grid gap-8"
              >
                <Step n={1} title={t("promo.store.step.amount")}>
                  <div role="radiogroup" aria-label={t("promo.store.step.amount")} className="flex flex-wrap gap-2">
                    {config.amounts.map((a) => (
                      <AmountPill key={a} selected={amount === a} onSelect={() => setAmount(a)} label={money(a)} />
                    ))}
                    {config.allowCustomAmount && <AmountPill selected={amount === "custom"} onSelect={() => setAmount("custom")} label={t("promo.store.otherAmount")} />}
                  </div>
                  {amount === "custom" && (
                    <div className="gt-field-message grid max-w-[260px] gap-1.5">
                      <label htmlFor="gc-amount" className="gt-field-label">{t("promo.store.customLabel", { min: money(config.minCents), max: money(config.maxCents) })}</label>
                      <div className="relative">
                        <input id="gc-amount" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={err("amount") ? true : undefined} aria-describedby={err("amount") ? "gc-amount-err" : undefined} className="gt-field pr-12" placeholder="80" />
                        <span aria-hidden="true" className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 font-semibold text-[var(--text-muted)]">€</span>
                      </div>
                      <FieldError id="gc-amount-err" message={err("amount")} />
                    </div>
                  )}
                </Step>

                {designs.length > 1 && (
                  <Step n={2} title={t("promo.store.step.design")}>
                    <div role="radiogroup" aria-label={t("promo.store.step.design")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {designs.map((d) => (
                        <label key={d} className={clsx("group grid cursor-pointer gap-2 rounded-[var(--radius-md)] p-1.5 transition-[box-shadow,transform] duration-[var(--duration-fast)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]", design === d ? "shadow-[0_0_0_2px_var(--gt-ink-900)]" : "hover:-translate-y-0.5")}>
                          <input type="radio" name="gc-design" checked={design === d} onChange={() => setDesign(d)} className="sr-only" />
                          <GiftCardVisual design={d} amountCents={cents ?? null} size="sm" label="" />
                          <span className="flex items-center justify-center gap-1 text-[length:var(--text-caption)] font-semibold">
                            {design === d && <Check size={13} aria-hidden="true" />}
                            {t(`promo.design.${d}`)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </Step>
                )}

                <Step n={designs.length > 1 ? 3 : 2} title={t("promo.store.step.who")}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {config.fields.recipientName !== "hidden" && (
                      <TextField id="gc-recipientName" label={t("promo.store.recipientName")} optional={config.fields.recipientName === "optional"} value={recipientName} onChange={setRecipientName} error={err("recipientName")} autoComplete="off" placeholder="Jade" />
                    )}
                    <TextField id="gc-recipientEmail" type="email" label={t("promo.store.recipientEmail")} value={recipientEmail} onChange={setRecipientEmail} error={err("recipientEmail")} autoComplete="off" placeholder="jade@exemple.fr" hint={t("promo.store.emailHint")} />
                    {config.fields.senderName !== "hidden" && (
                      <TextField id="gc-senderName" label={t("promo.store.senderName")} optional={config.fields.senderName === "optional"} value={senderName} onChange={setSenderName} error={err("senderName")} autoComplete="given-name" placeholder="Manon" />
                    )}
                  </div>
                  {config.fields.message !== "hidden" && (
                    <div className="grid gap-1.5">
                      <div className="flex items-baseline justify-between">
                        <label htmlFor="gc-message" className="gt-field-label">
                          {t("promo.store.message")} {config.fields.message === "optional" && <span className="font-normal text-[var(--text-muted)]">({t("promo.store.optional")})</span>}
                        </label>
                        <span className={clsx("text-[length:var(--text-caption)] tabular-nums", message.length > config.messageMaxLength * 0.9 ? "text-[var(--status-warning-fg)]" : "text-[var(--text-muted)]")} aria-live="polite">
                          {message.length}/{config.messageMaxLength}
                        </span>
                      </div>
                      <textarea id="gc-message" rows={3} maxLength={config.messageMaxLength} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={err("message") ? true : undefined} className="gt-field h-auto rounded-[var(--radius-lg)] py-3" placeholder={t("promo.store.messagePlaceholder")} />
                      <FieldError message={err("message")} />
                    </div>
                  )}
                </Step>

                <Step n={designs.length > 1 ? 4 : 3} title={t("promo.store.step.when")}>
                  <div role="radiogroup" aria-label={t("promo.store.step.when")} className="grid gap-2 sm:grid-cols-2">
                    <WhenCard selected={when === "now"} onSelect={() => setWhen("now")} icon={Send} title={t("promo.store.sendNow")} body={t("promo.store.sendNowBody")} />
                    {config.allowScheduledDelivery && <WhenCard selected={when === "later"} onSelect={() => setWhen("later")} icon={CalendarClock} title={t("promo.store.schedule")} body={t("promo.store.scheduleBody")} />}
                  </div>
                  {when === "later" && (
                    <div className="gt-field-message grid max-w-[280px] gap-1.5">
                      <label htmlFor="gc-deliverOn" className="gt-field-label">{t("promo.store.deliveryDate")}</label>
                      <input id="gc-deliverOn" type="date" min={TOMORROW} value={deliverOn} onChange={(e) => setDeliverOn(e.target.value)} aria-invalid={err("deliverOn") ? true : undefined} className="gt-field" />
                      <FieldError message={err("deliverOn")} />
                    </div>
                  )}
                </Step>

                {submitted && Object.keys(errors).length > 0 && (
                  <p role="alert" className="m-0 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
                    <CircleAlert size={16} aria-hidden="true" /> {t("promo.store.errors.summary", { count: Object.keys(errors).length })}
                  </p>
                )}

                <div className="hidden items-center gap-4 lg:flex">
                  <Button type="submit" size="lg" iconLeft={Gift} loading={status === "loading"}>
                    {t("promo.store.buy")}{cents ? ` · ${money(cents)}` : ""}
                  </Button>
                  <span className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    <ShieldCheck size={14} aria-hidden="true" /> {t("promo.store.securePay")}
                  </span>
                </div>

                {/* Phones: the price and the button stay pinned to the thumb. */}
                <div className="fixed inset-x-0 bottom-0 z-[60] flex items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--gt-white)]/95 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[10px] lg:hidden">
                  <span className="grid leading-tight">
                    <span className="text-[11px] text-[var(--text-muted)]">{t("promo.store.total")}</span>
                    <strong className="text-[length:var(--text-body-lg)] tabular-nums">{cents ? money(cents) : "—"}</strong>
                  </span>
                  <Button type="submit" iconLeft={Gift} loading={status === "loading"} fullWidth>
                    {t("promo.store.buy")}
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Live preview. Above the form on phones (compact), sticky beside it on desktop. */}
          <aside aria-label={t("promo.store.previewLabel")} className="order-1 grid gap-3 lg:sticky lg:top-24 lg:order-2">
            <div className="rounded-[var(--radius-xl)] bg-[radial-gradient(420px_240px_at_80%_0%,var(--gt-blue-100),transparent),var(--gt-off-white)] p-4 sm:p-6">
              <div className="mx-auto max-w-[400px]">
                <GiftCardVisual design={design} amountCents={cents ?? null} recipient={recipientName || undefined} sender={senderName || undefined} message={previewMessage} size="md" />
              </div>
              <dl className="mx-auto mt-4 grid max-w-[400px] gap-1.5 text-[length:var(--text-body-sm)]">
                <Summary label={t("promo.store.summary.amount")} value={cents ? money(cents) : "—"} />
                <Summary label={t("promo.store.summary.to")} value={recipientName || recipientEmail || "—"} />
                <Summary label={t("promo.store.summary.delivery")} value={when === "now" ? t("promo.store.summary.byEmailNow") : t("promo.store.summary.byEmailOn", { date: dateLong(`${deliverOn || TOMORROW}T09:00`) })} />
                <Summary label={t("promo.store.summary.validity")} value={config.expiryMonths ? t("promo.store.summary.validFor", { count: config.expiryMonths }) : t("promo.config.noExpiry")} />
              </dl>
            </div>
            <p className="m-0 text-center text-[11px] text-[var(--text-muted)]">{t("promo.store.prototypeNote")}</p>
          </aside>
        </div>
      </section>

      {/* How it works + FAQ */}
      <section className="bg-[var(--surface-page)] px-[var(--gutter-page)] py-[var(--section-y-sm)] pb-28 lg:px-[var(--gutter-page-lg)] lg:pb-[var(--section-y-sm)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10 lg:grid-cols-2">
          <div className="grid content-start gap-5">
            <h2 className="text-[length:var(--text-h3)]">{t("promo.store.howTitle")}</h2>
            <ol className="m-0 grid list-none gap-4 p-0">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-4">
                  <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--gt-blue-100)] text-[length:var(--text-body-sm)] font-bold text-[var(--gt-blue-700)]">{n}</span>
                  <span className="grid gap-0.5">
                    <strong className="text-[var(--text-primary)]">{t(`promo.store.how.${n}.title`)}</strong>
                    <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`promo.store.how.${n}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid content-start gap-3">
            <h2 className="text-[length:var(--text-h3)]">{t("promo.store.faqTitle")}</h2>
            {[1, 2, 3, 4].map((n) => (
              <details key={n} className="group rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-white)] px-4 py-3 open:shadow-[var(--shadow-xs)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
                  {t(`promo.store.faq.${n}.q`)}
                  <ChevronDown size={16} aria-hidden="true" className="flex-none transition-transform group-open:rotate-180" />
                </summary>
                <p className="m-0 mt-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`promo.store.faq.${n}.a`, { months: config.expiryMonths ?? 0 })}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <fieldset aria-labelledby={id} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <h3 id={id} className="flex items-center gap-3 text-[length:var(--text-h4)]">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[length:var(--text-caption)] font-bold text-[var(--gt-white)]">{n}</span>
        {title}
      </h3>
      {children}
    </fieldset>
  );
}

function AmountPill({ selected, onSelect, label }: { selected: boolean; onSelect: () => void; label: string }) {
  return (
    <label
      className={clsx(
        "inline-flex h-12 min-w-[84px] cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border px-5 text-[length:var(--text-body-md)] font-bold tabular-nums transition-[background-color,border-color,color,transform] duration-[var(--duration-fast)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)] active:scale-[.98]",
        selected ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-default)] bg-[var(--gt-white)] text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
      )}
    >
      <input type="radio" name="gc-amount-choice" checked={selected} onChange={onSelect} className="sr-only" />
      {selected && <Check size={15} aria-hidden="true" />}
      {label}
    </label>
  );
}

function WhenCard({ selected, onSelect, icon: Icon, title, body }: { selected: boolean; onSelect: () => void; icon: typeof Send; title: string; body: string }) {
  return (
    <label className={clsx("flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]", selected ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)] shadow-[inset_0_0_0_1px_var(--gt-ink-900)]" : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]")}>
      <input type="radio" name="gc-when" checked={selected} onChange={onSelect} className="sr-only" />
      <span aria-hidden="true" className={clsx("grid h-9 w-9 flex-none place-items-center rounded-full", selected ? "bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]")}>
        <Icon size={16} />
      </span>
      <span className="grid gap-0.5">
        <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{title}</strong>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{body}</span>
      </span>
    </label>
  );
}

function TextField({ id, label, value, onChange, error, optional, type = "text", autoComplete, placeholder, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; optional?: boolean; type?: string; autoComplete?: string; placeholder?: string; hint?: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="gt-field-label">
        {label} {optional && <span className="font-normal text-[var(--text-muted)]">({t("promo.store.optional")})</span>}
      </label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} data-valid={value && !error ? "true" : undefined} className="gt-field" />
      {hint && !error && <p id={`${id}-hint`} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="gt-field-message m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
      <CircleAlert size={13} aria-hidden="true" /> {message}
    </p>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--border-subtle)] pb-1.5 last:border-b-0">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 truncate text-right font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function Confirmation({ cents, name, email, when, onAnother }: { cents: number; name: string; email: string; when: string; onAnother: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <div role="status" className="gt-celebrate grid justify-items-start gap-4 rounded-[var(--radius-xl)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] p-6">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-[var(--gt-white)] text-[var(--gt-emerald-600)]">
        <PartyPopper size={22} />
      </span>
      <h3 className="text-[length:var(--text-h3)]">{t("promo.store.doneTitle")}</h3>
      <p className="m-0 text-[var(--text-body)]">{t("promo.store.doneBody", { amount: money(cents), name: name || email, email, when })}</p>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.store.doneNote")}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onAnother} variant="dark" iconLeft={Gift}>{t("promo.store.another")}</Button>
        <Link to="/boutique" className="gt-underline self-center font-semibold">{t("promo.store.backToShop")}</Link>
      </div>
    </div>
  );
}
