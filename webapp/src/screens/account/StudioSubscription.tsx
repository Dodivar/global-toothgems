"use client";

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, CircleAlert, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { useNavigate } from "../../lib/navigation";
import { useFormat } from "../../lib/format";
import { StudioAccessProvider, useStudioAccess } from "../../lib/studioAccess";
import { openStudioBillingPortal } from "../../lib/studioBilling";
import { StudioWithdrawalPanel } from "../../components/studio/account/StudioWithdrawalPanel";
import { STUDIO_EDITOR_PATH, STUDIO_SUBSCRIBE_PATH } from "../../lib/studioUrl";
import type { StudioAccessInfo } from "../../lib/studioAccessState";

/**
 * The member's 3D Studio subscription (`/compte/studio`, decision 94): the
 * access the database reports (plan, billing, next renewal or end date, a
 * payment to fix) and the way to Stripe's customer portal, where the plan, the
 * card and the cancellation are managed. What is changed there comes back
 * through the verified webhook; this page re-reads the access when the member
 * returns to it (the provider re-reads on focus). Within 14 days of the first
 * payment, the right of withdrawal (decision 95) is offered below.
 */
export function StudioSubscription() {
  return (
    <StudioAccessProvider>
      <StudioSubscriptionContent />
    </StudioAccessProvider>
  );
}

function StudioSubscriptionContent() {
  const { t } = useTranslation();
  const access = useStudioAccess();
  const status = access?.status;

  return (
    <section className="grid gap-5">
      <SectionHeader icon={Box} eyebrow={t("studio.account.eyebrow")} title={t("studio.account.title")} description={t("studio.account.description")} />
      {!status || status.kind === "loading" ? (
        <p role="status" aria-busy="true" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("studio.account.loading")}
        </p>
      ) : status.kind === "ready" ? (
        <>
          <SubscriptionPanel info={status.info} />
          {status.info.subscriptionPlan !== null && <StudioWithdrawalPanel onWithdrawn={() => void access?.refresh()} />}
        </>
      ) : status.kind === "preview" ? (
        <EmptyPanel>{t("studio.account.noPlan")}</EmptyPanel>
      ) : (
        <EmptyPanel
          action={
            <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={() => void access?.refresh()}>
              {t("studio.account.retry")}
            </Button>
          }
        >
          {t("studio.account.loadError")}
        </EmptyPanel>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-[length:var(--text-body-md)] text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

function SubscriptionPanel({ info }: { info: StudioAccessInfo }) {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [portalError, setPortalError] = useState(false);

  const date = (ms: number | null) => (ms === null ? "" : formatDate(new Date(ms).toISOString()));
  const live = info.state === "subscribed";
  const pastDue = live && info.subscriptionStatus === "past_due";
  // A member with a Stripe subscription, live or not, has invoices and a card to see.
  const hasBilling = info.subscriptionPlan !== null;
  const stateLabel = pastDue ? t("studio.account.state.pastDue") : t(`studio.account.state.${info.state}`);

  const manage = async () => {
    setOpening(true);
    setPortalError(false);
    const answer = await openStudioBillingPortal(i18n.language?.startsWith("en") ? "en" : "fr");
    if (answer.kind === "redirect") {
      window.location.assign(answer.url);
      return;
    }
    setOpening(false);
    setPortalError(true);
  };

  let note: string | null = null;
  if (pastDue) note = t("studio.account.pastDue");
  else if (live && info.subscriptionCancelAtPeriodEnd) note = t("studio.account.endsOn", { date: date(info.subscriptionPeriodEnd) });
  else if (live) note = t("studio.account.renews", { date: date(info.subscriptionPeriodEnd) });
  else if (info.state === "trial_active") note = t("studio.account.trialUntil", { date: date(info.trialExpiresAt) });
  else if (info.state === "staff") note = t("studio.account.staffNote");
  else if (info.state !== "subscription_pending") note = t("studio.account.noPlan");

  return (
    <div className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <dl className="m-0 grid gap-4">
        <Row label={t("studio.account.statusLabel")}>
          <span className="inline-flex items-center gap-2 font-semibold">
            {pastDue && <CircleAlert size={16} aria-hidden="true" className="text-[var(--status-error-fg)]" />}
            {stateLabel}
          </span>
        </Row>
        {live && info.subscriptionPlan && (
          <Row label={t("studio.account.planLabel")}>{t(`studio.plans.items.${info.subscriptionPlan}.name`)}</Row>
        )}
        {live && info.subscriptionInterval && (
          <Row label={t("studio.account.billingLabel")}>{t(`studio.account.interval.${info.subscriptionInterval}`)}</Row>
        )}
      </dl>

      {note && (
        <p
          className={
            pastDue
              ? "m-0 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]"
              : "m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]"
          }
        >
          {note}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {hasBilling && (
          <Button variant={pastDue ? "primary" : "outline"} iconRight={ExternalLink} loading={opening} disabled={opening} onClick={() => void manage()}>
            {t("studio.account.manage")}
          </Button>
        )}
        {live || info.state === "trial_active" || info.state === "staff" ? (
          <Button variant={hasBilling ? "ghost" : "primary"} iconRight={ArrowRight} onClick={() => navigate(STUDIO_EDITOR_PATH)}>
            {t("studio.account.openStudio")}
          </Button>
        ) : (
          info.state !== "subscription_pending" && (
            <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate(STUDIO_SUBSCRIBE_PATH)}>
              {t("studio.account.choosePlan")}
            </Button>
          )
        )}
      </div>
      {hasBilling && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("studio.account.manageHint")}</p>}
      {portalError && (
        <p role="alert" className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">
          {t("studio.account.portalError")}
        </p>
      )}
    </div>
  );
}
