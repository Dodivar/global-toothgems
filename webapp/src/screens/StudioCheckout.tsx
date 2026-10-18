"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Box, CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { TermsNotice } from "../components/auth/TermsNotice";
import { useStudioCheckout } from "../components/studio/access/useStudioCheckout";
import { RequireAccount, useAuth } from "../lib/auth";
import { Link, useNavigate, useSearchParams } from "../lib/navigation";
import { ACCOUNT_STUDIO_PATH } from "../components/studio/StudioPlans";
import { parseStudioCheckoutQuery, STUDIO_EDITOR_PATH, STUDIO_SUBSCRIBE_PATH, studioPlansPathFor, type StudioCheckoutQuery } from "../lib/studioUrl";

// Stripe.js and the payment form are fetched only on this page.
const StudioPaymentStep = lazy(() => import("../components/studio/access/StudioPaymentStep"));

/**
 * The Studio subscription's checkout page (`/studio-3d/paiement?plan=…&interval=…&from=…`,
 * signed-in members only: `gateFor`, `RequireAccount`). The plan buttons lead
 * here; the page opens a payment step for that plan (`useStudioCheckout`) and
 * shows the summary, the request for immediate access and the shop's payment
 * form. Paid, it opens the Studio editor, which waits for the verified webhook
 * before letting the member in (decision 94). "Change plan" goes back to the
 * plans the member chose from; leaving the page unpaid closes the Stripe session.
 */
export function StudioCheckout() {
  const [params] = useSearchParams();
  const query = parseStudioCheckoutQuery(params);
  return (
    <CheckoutShell backTo={query ? studioPlansPathFor(query.surface) : STUDIO_SUBSCRIBE_PATH} query={query}>
      <RequireAccount>{query ? <CheckoutBody query={query} /> : <UnknownPlan />}</RequireAccount>
    </CheckoutShell>
  );
}

function CheckoutBody({ query }: { query: StudioCheckoutQuery }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { acceptTerms } = useAuth();
  const checkout = useStudioCheckout(query);
  const { open } = checkout;
  const [accepting, setAccepting] = useState(false);
  const [termsFailed, setTermsFailed] = useState(false);
  const paid = useRef(false);
  const leave = useRef(checkout.leave);

  // One payment step per visit of the page (and per plan, should the address change).
  useEffect(() => {
    void open();
  }, [open]);

  // Leaving the page unpaid ("Change plan", the menu, the back button): its Stripe session is closed.
  useEffect(() => {
    leave.current = checkout.leave;
  }, [checkout.leave]);
  useEffect(
    () => () => {
      if (!paid.current) leave.current();
    },
    [],
  );

  const acceptAndRetry = async () => {
    setAccepting(true);
    setTermsFailed(false);
    const done = await acceptTerms("checkout");
    setAccepting(false);
    if (!done) {
      setTermsFailed(true);
      return;
    }
    void open();
  };

  const { error, payment } = checkout;
  if (error) {
    return (
      <div role="alert" className="mx-auto grid w-full max-w-[680px] gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
        <strong className="inline-flex items-center gap-2">
          <CircleAlert size={15} aria-hidden="true" className="text-[var(--status-error-fg)]" />
          {t("studio.access.checkout.title")}
        </strong>
        <p className="m-0">{t(`studio.access.checkout.errors.${error}`)}</p>
        {error === "terms_required" ? (
          <TermsNotice cta={t("studio.access.checkout.termsCta")} busy={accepting} failed={termsFailed} onAccept={() => void acceptAndRetry()} />
        ) : error === "already_subscribed" ? (
          <Link to={ACCOUNT_STUDIO_PATH} className="w-fit font-semibold underline underline-offset-2">
            {t("studio.access.checkout.manage")}
          </Link>
        ) : (
          <Button variant="outline" iconLeft={RotateCcw} onClick={() => void open()} className="w-fit">
            {t("checkout.payment.restart")}
          </Button>
        )}
      </div>
    );
  }

  const skeleton = <div className="gt-skeleton mx-auto h-[480px] w-full max-w-[1040px] rounded-[var(--radius-card)]" role="status" aria-label={t("checkout.payment.loading")} />;
  if (!payment) return skeleton;
  return (
    <Suspense fallback={skeleton}>
      <StudioPaymentStep
        query={query}
        payment={payment}
        locale={checkout.locale}
        recordConsent={checkout.recordConsent}
        // Paid on the page: the editor opens once the verified webhook has recorded the subscription.
        onPaid={() => {
          paid.current = true;
          navigate(`${STUDIO_EDITOR_PATH}?subscription=success`, { replace: true });
        }}
        onRestart={checkout.restart}
      />
    </Suspense>
  );
}

function UnknownPlan() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mx-auto grid w-full max-w-[680px] justify-items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
      <p className="m-0">{t("studio.access.checkout.errors.plan_unavailable")}</p>
      <Link to={STUDIO_SUBSCRIBE_PATH} className="font-semibold underline underline-offset-2">
        {t("studio.access.payment.seePlans")}
      </Link>
    </div>
  );
}

/** The page around the checkout: the Studio's light backdrop, the way back to the plans, the heading. */
function CheckoutShell({ backTo, query, children }: { backTo: string; query: StudioCheckoutQuery | null; children: React.ReactNode }) {
  const { t } = useTranslation();
  const name = query ? t(`studio.plans.items.${query.plan}.name`) : null;
  return (
    <main className="gt-studio-alt min-h-[100dvh] overflow-x-clip">
      <div className="gt-studio-b-hero relative min-h-[100dvh] px-4 pb-16 pt-6 sm:px-[clamp(16px,4vw,48px)] sm:pt-10">
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full opacity-60" />
        <div className="relative mx-auto grid max-w-[1040px] gap-8">
          <div className="flex items-center justify-between gap-3">
            <Link
              to={backTo}
              className="inline-flex items-center gap-2 rounded-full px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("studio.access.payment.back")}
            </Link>
            <span className="inline-flex items-center gap-2 text-[13px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
              <Box size={15} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
              {t("studio.editor.appName")}
            </span>
          </div>
          <header className="grid gap-2">
            <h1 className="text-[length:var(--text-h1)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
              {t("studio.access.payment.title")}
            </h1>
            {name && <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.access.payment.subtitle", { plan: name })}</p>}
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}
