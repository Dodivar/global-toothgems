import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Lock, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { useToast } from "../../lib/toast";
import { useReveal } from "../../lib/useReveal";

/** Same check as the current home page's newsletter form. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FieldError = "email" | "consent" | null;

/**
 * The closing newsletter band. Visual only: nothing is sent or stored.
 *
 * Consent stays explicit, as on the current home page — an unticked box that
 * the visitor ticks. Unlike there, the button stays enabled and says what is
 * missing, so a keyboard or screen-reader user is never left facing a
 * disabled control with no explanation.
 */
export function NewsletterBand() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const ref = useReveal<HTMLElement>();
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<FieldError>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError("email");
      document.getElementById(emailId)?.focus();
      return;
    }
    if (!consent) {
      setError("consent");
      return;
    }
    setError(null);
    setStatus("sending");
    // A short beat so the loading state reads; there is no request behind it.
    window.setTimeout(() => {
      setStatus("done");
      showToast(t("homeAlt.newsletter.toastTitle"), t("homeAlt.newsletter.toastBody"));
    }, 700);
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
                {t("homeAlt.newsletter.successTitle")}
              </span>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("homeAlt.newsletter.successBody", { email: email.trim() })}</span>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="grid w-full max-w-[560px] gap-3 text-left">
              <label htmlFor={emailId} className="sr-only">
                {t("homeAlt.newsletter.emailLabel")}
              </label>
              <div className="flex flex-col gap-2 rounded-[var(--radius-xl)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-card)] ring-1 ring-[var(--border-subtle)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)] sm:flex-row sm:items-center sm:rounded-[var(--radius-pill)]">
                <input
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t("homeAlt.newsletter.emailPlaceholder")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error === "email") setError(null);
                  }}
                  aria-invalid={error === "email" ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className="h-12 min-w-0 flex-1 rounded-[var(--radius-pill)] bg-transparent px-5 text-[16px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)]"
                />
                <Button type="submit" variant="primary" size="md" iconRight={ArrowRight} loading={status === "sending"} className="gt-alt-cta h-12">
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
              {error && (
                <p id={errorId} role="alert" className="m-0 px-2 text-[13px] font-medium text-[var(--status-error-fg)]">
                  {error === "email" ? t("homeAlt.newsletter.invalidEmail") : t("homeAlt.newsletter.consentRequired")}
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
