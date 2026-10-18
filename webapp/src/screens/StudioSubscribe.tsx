"use client";

import { useTranslation } from "react-i18next";
import { ArrowLeft, Box, Info } from "lucide-react";
import { Link } from "../lib/navigation";
import { useAuth } from "../lib/auth";
import { StudioCheckoutPlans } from "../components/studio/StudioPlans";
import { STUDIO_PATH } from "../lib/studioUrl";

/**
 * The Studio's subscription page (`/fr/studio-3d/abonnement`,
 * `/en/3d-studio/subscribe`): the three plans, monthly or yearly, and the way
 * to Stripe's payment page. A visitor is asked to sign in first and comes back
 * here. Nothing is granted on this page or on the way back from Stripe: the
 * Studio opens when the verified webhook has recorded the subscription
 * (decision 94).
 */
export function StudioSubscribe() {
  const { t } = useTranslation();
  const { signedIn } = useAuth();

  return (
    <main className="gt-studio-alt overflow-x-clip">
      <div className="gt-studio-b-hero relative px-4 pb-16 pt-6 sm:px-[clamp(16px,4vw,48px)] sm:pt-10">
        <div aria-hidden="true" className="gt-studio-b-aurora pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full opacity-60" />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="flex items-center justify-between gap-3">
            <Link
              to={STUDIO_PATH}
              className="inline-flex items-center gap-2 rounded-full px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("studio.subscribe.back")}
            </Link>
            <span className="inline-flex items-center gap-2 text-[13px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
              <Box size={15} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
              {t("studio.editor.appName")}
            </span>
          </div>

          <header className="mx-auto grid max-w-[760px] justify-items-center gap-3 text-center">
            <h1 className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
              {t("studio.subscribe.title")}
            </h1>
            <p className="m-0 max-w-[58ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("studio.subscribe.body")}</p>
            {!signedIn && (
              <p className="m-0 inline-flex max-w-[60ch] items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-white/75 px-4 py-2.5 text-left text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                <Info size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
                {t("studio.subscribe.signInNote")}
              </p>
            )}
          </header>

          <StudioCheckoutPlans surface="studio_subscribe_page" />
          <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studioPage.plans.note")}</p>
        </div>
      </div>
    </main>
  );
}
