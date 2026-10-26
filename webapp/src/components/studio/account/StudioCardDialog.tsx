"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CreditCard } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { StripePaymentForm } from "../../checkout/StripePaymentForm";
import { confirmStudioCharge, saveStudioCard, startStudioCardStep } from "../../../lib/studioBilling";
import type { StudioCardStep } from "../../../lib/studioManageMapping";

/**
 * Replacing the card of the 3D Studio subscription (decision 112): the shop's
 * payment form in setup mode (nothing is charged), then the function makes it
 * the subscription's card; a payment to fix is retried with it at once, and a
 * bank's check (3-D Secure) is finished here.
 */
export function StudioCardDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (tone: "success" | "error", message: string) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";
  const k = "studio.account.card";
  const [step, setStep] = useState<StudioCardStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStep(null);
    setError(null);
    const answer = await startStudioCardStep(locale);
    if (answer.kind === "ok") setStep(answer.value);
    else setError(t(`${k}.error`));
  }, [locale, t]);

  useEffect(() => {
    if (open) void start();
  }, [open, start]);

  const saved = async (sessionId: string) => {
    const answer = await saveStudioCard(sessionId);
    if (answer.kind === "requires_action") {
      const paid = await confirmStudioCharge(answer.clientSecret, answer.publishableKey, locale);
      onSaved(paid ? "success" : "error", t(paid ? `${k}.savedAndPaid` : `${k}.savedPaymentFailed`));
      return;
    }
    if (answer.kind === "error") {
      onSaved("error", t(answer.error === "payment_failed" ? `${k}.savedPaymentFailed` : `${k}.error`));
      return;
    }
    onSaved("success", t(`${k}.saved`));
  };

  return (
    <Dialog open={open} onClose={onClose} title={t(`${k}.dialogTitle`)} description={t(`${k}.dialogBody`)} icon={<CreditCard size={20} aria-hidden="true" />} closeLabel={t(`${k}.close`)} scrollBody>
      {error ? (
        <p role="alert" className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-sm font-medium text-[var(--status-error-fg)]">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : step ? (
        <StripePaymentForm
          clientSecret={step.clientSecret}
          publishableKey={step.publishableKey}
          expiresAt={step.expiresAt}
          locale={locale}
          payLabel={t(`${k}.save`)}
          onPaid={(sessionId) => void saved(sessionId)}
          onRestart={() => void start()}
          footer={<p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`${k}.noCharge`)}</p>}
        />
      ) : (
        <p role="status" aria-busy="true" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t(`${k}.loading`)}
        </p>
      )}
    </Dialog>
  );
}
