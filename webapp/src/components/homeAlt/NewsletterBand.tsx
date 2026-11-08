import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowRight, CheckCircle2, Lock, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { useReveal } from "../../lib/useReveal";
import { NEWSLETTER_EMAIL_RE, subscribeToNewsletter, type NewsletterError, type NewsletterOutcome } from "../../lib/newsletter/api";
import { useAuth } from "../../lib/auth";
import { useHydrated } from "../../lib/useHydrated";
import { isCaptchaConfigured, useTurnstile } from "../../lib/captcha/turnstile";

type FieldError = "email" | "consent" | null;

/**
 * The closing newsletter band, through the Edge Function `newsletter-subscribe`
 * (owner's choice, 2026-11-08: no confirmation e-mail when another proof exists):
 *   - a signed-in member sees their account's address filled in and is
 *     subscribed at once with it;
 *   - a visitor passes the Cloudflare Turnstile captcha (loaded once they start
 *     filling the form, usually invisible) and is subscribed at once;
 *   - without a configured captcha, a visitor gets the double opt-in e-mail and
 *     the band asks them to check their inbox.
 * It answers the same whether the address was new or already on the list.
 *
 * Consent stays explicit, as on the current home page — an unticked box that
 * the visitor ticks. Unlike there, the button stays enabled and says what is
 * missing, so a keyboard or screen-reader user is never left facing a
 * disabled control with no explanation.
 */
export function NewsletterBand() {
  const { t, i18n } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const emailId = useId();
  const errorId = useId();
  const { signedIn, email: accountEmail } = useAuth();
  const hydrated = useHydrated();
  // null until typed: a signed-in member's own address stands in (read once hydrated).
  const [typed, setTyped] = useState<string | null>(null);
  const email = typed ?? (hydrated && signedIn ? (accountEmail ?? "") : "");
  const ownAddress = signedIn && !!accountEmail && email.trim().toLowerCase() === accountEmail.toLowerCase();
  const captchaNeeded = isCaptchaConfigured && !ownAddress;
  // The captcha script loads once the visitor starts filling the form, not with the page.
  const [engaged, setEngaged] = useState(false);
  const { attach: attachCaptcha, token: captchaToken, reset: resetCaptcha, failed: captchaFailed } = useTurnstile(engaged && captchaNeeded, i18n.language?.startsWith("en") ? "en" : "fr");
  const [outcome, setOutcome] = useState<NewsletterOutcome>("sent");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<FieldError>(null);
  const [sendError, setSendError] = useState<NewsletterError | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  // Honeypot: hidden from people and from assistive technology; a bot fills it.
  const [website, setWebsite] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!NEWSLETTER_EMAIL_RE.test(email.trim())) {
      setError("email");
      document.getElementById(emailId)?.focus();
      return;
    }
    if (!consent) {
      setError("consent");
      return;
    }
    setError(null);
    setSendError(null);
    setStatus("sending");
    let token: string | null = null;
    if (captchaNeeded) {
      setEngaged(true);
      token = await captchaToken();
      if (!token) {
        setSendError(captchaFailed ? "captcha_failed" : "captcha_required");
        setStatus("idle");
        return;
      }
    }
    const result = await subscribeToNewsletter({
      email,
      locale: i18n.language?.startsWith("en") ? "en" : "fr",
      source: "home",
      consent,
      website,
      captcha: token,
    });
    // A token is single use, whatever the answer.
    if (token) resetCaptcha();
    if (result.ok) {
      setOutcome(result.outcome);
      setStatus("done");
    } else {
      setSendError(result.error);
      setStatus("idle");
    }
  };

  return (
    <section ref={ref} aria-labelledby="gt-alt-newsletter-title" className="gt-reveal gt-alt-section w-full !py-[clamp(24px,3vw,48px)]">
      <div className="gt-alt-wide px-[var(--gt-alt-gutter)]">
        <div className="gt-alt-newsletter relative mx-auto grid max-w-[1120px] items-center gap-x-12 gap-y-6 overflow-hidden rounded-[var(--radius-2xl)] px-[clamp(20px,4vw,56px)] py-[clamp(20px,2.5vw,32px)] text-center lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:text-left">
          <div className="grid justify-items-center gap-2 lg:justify-items-start">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]">
              <Sparkles size={18} />
            </span>
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.newsletter.eyebrow")}</span>
            <h2 id="gt-alt-newsletter-title" className="gt-alt-h2 max-w-[26ch] !text-[clamp(26px,2.6vw,38px)]">{t("homeAlt.newsletter.title")}</h2>
            <p className="m-0 max-w-[54ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("homeAlt.newsletter.body")}</p>
          </div>

          <div className="grid justify-items-center gap-3 lg:justify-items-stretch">
          {status === "done" ? (
            <div role="status" className="gt-celebrate grid justify-items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-card)] px-6 py-5 shadow-[var(--shadow-card)]">
              <span className="inline-flex items-center gap-2 text-[16px] font-bold text-[var(--status-success-fg)]">
                <CheckCircle2 size={18} aria-hidden="true" />
                {outcome === "subscribed" ? t("homeAlt.newsletter.subscribedTitle") : t("homeAlt.newsletter.successTitle")}
              </span>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                {outcome === "subscribed"
                  ? t("homeAlt.newsletter.subscribedBody", { email: email.trim() })
                  : t("homeAlt.newsletter.successBody", { email: email.trim() })}
              </span>
              {outcome === "sent" && <span className="text-[12px] text-[var(--text-muted)]">{t("homeAlt.newsletter.successHint")}</span>}
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => void submit(e)}
              onFocusCapture={() => setEngaged(true)}
              className="relative grid w-full max-w-[560px] gap-3 text-left"
            >
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
              <label htmlFor={emailId} className="sr-only">
                {t("homeAlt.newsletter.emailLabel")}
              </label>
              {/* On a phone the field and the button are stacked, each full width and
                  the same height; from sm up they share one pill. */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2 sm:rounded-[var(--radius-pill)] sm:bg-[var(--surface-card)] sm:p-1.5 sm:shadow-[var(--shadow-card)] sm:ring-1 sm:ring-[var(--border-subtle)] sm:focus-within:ring-2 sm:focus-within:ring-[var(--focus-ring)]">
                <input
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t("homeAlt.newsletter.emailPlaceholder")}
                  value={email}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    if (error === "email") setError(null);
                  }}
                  aria-invalid={error === "email" ? true : undefined}
                  aria-describedby={error || sendError ? errorId : undefined}
                  className="h-[52px] w-full min-w-0 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-5 text-[16px] text-[var(--text-primary)] shadow-[var(--shadow-sm)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus-ring)] aria-[invalid=true]:border-[var(--status-error-fg)] sm:h-12 sm:flex-1 sm:border-0 sm:bg-transparent sm:shadow-none sm:focus:ring-0"
                />
                <Button type="submit" variant="primary" size="md" iconRight={ArrowRight} loading={status === "sending"} className="gt-alt-cta h-[52px] w-full sm:h-12 sm:w-auto">
                  {t("homeAlt.newsletter.submit")}
                </Button>
              </div>
              <div className="px-2">
                <Checkbox
                  label={t("homeAlt.newsletter.consentLabel")}
                  description={t("homeAlt.newsletter.consentHint")}
                  checked={consent}
                  onChange={(next) => {
                    setConsent(next);
                    if (next && error === "consent") setError(null);
                  }}
                />
              </div>
              {/* Turnstile draws here only when it needs the visitor (interaction-only). */}
              {captchaNeeded && <div ref={attachCaptcha} className="px-2 empty:hidden" />}
              {(error || sendError) && (
                <p id={errorId} role="alert" className="m-0 px-2 text-[13px] font-medium text-[var(--status-error-fg)]">
                  {error === "email"
                    ? t("homeAlt.newsletter.invalidEmail")
                    : error === "consent"
                      ? t("homeAlt.newsletter.consentRequired")
                      : t(`newsletter.errors.${sendError}`)}
                </p>
              )}
            </form>
          )}

          <p className="m-0 inline-flex flex-wrap items-center justify-center gap-x-2 lg:justify-start lg:px-2 gap-y-1 text-[12px] text-[var(--text-muted)]">
            <Lock size={13} aria-hidden="true" />
            {t("homeAlt.newsletter.privacy")}
            <Link to={LEGAL_PATHS.privacy} className="gt-underline font-semibold text-[var(--text-primary)]">
              {t("homeAlt.newsletter.privacyLink")}
            </Link>
          </p>
          </div>
        </div>
      </div>
    </section>
  );
}
