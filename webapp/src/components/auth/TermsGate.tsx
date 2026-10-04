"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Button } from "../ui/Button";
import { AuthCard, AuthLayout } from "./AuthScene";
import { TermsNotice } from "./TermsNotice";

/**
 * Stands in for the member space until the account has accepted the terms —
 * the case of an account created through Google, which skipped the
 * registration form. One click on the acceptance and the page the member asked
 * for opens where they were; the other way out is signing out.
 */
export function TermsGate({ onAccept, onSignOut }: { onAccept: () => Promise<boolean>; onSignOut: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const accept = async () => {
    setBusy(true);
    setFailed(false);
    const done = await onAccept();
    // On success the gate is replaced by the page, so only a refusal stays here.
    if (!done) {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <AuthLayout>
      <AuthCard crown={<span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("termsAccept.eyebrow")}</span>}>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <h1 className="text-[clamp(26px,3.4vw,34px)]">{t("termsAccept.gateTitle")}</h1>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("termsAccept.gateBody")}</p>
          </div>
          <TermsNotice cta={t("termsAccept.gateCta")} busy={busy} failed={failed} onAccept={() => void accept()} />
          <Button variant="ghost" fullWidth iconLeft={LogOut} onClick={onSignOut}>
            {t("termsAccept.decline")}
          </Button>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
