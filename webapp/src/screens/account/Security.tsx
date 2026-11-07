"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { SectionHeader } from "../../components/account/SectionHeader";
import { SecurityOverview } from "../../components/security/SecurityOverview";
import { ChangeEmailCard } from "../../components/security/ChangeEmailCard";
import { ChangePasswordCard } from "../../components/security/ChangePasswordCard";
import { DataExportCard } from "../../components/security/DataExportCard";
import { DeleteAccountCard } from "../../components/security/DeleteAccountCard";
import { DemoCode, DemoControls, DemoNote, RadioPills } from "../../components/security/DemoControls";
import { DEMO_CURRENT_PASSWORD, type ServiceOutcome } from "../../lib/accountSecurity";
import { TAKEN_EMAILS } from "../../lib/registration";
import { useAuth } from "../../lib/auth";

const OUTCOMES: ServiceOutcome[] = ["success", "serverError"];

/**
 * Security & privacy, at `/compte/securite`: one member-area section like the
 * others, reached from the same sidebar.
 *
 * Top to bottom it goes from reassurance to consequence: an overview of where
 * the account stands, then sign-in (email, password), then data (export) and
 * finally, quietly, deletion. Each card owns its own states.
 *
 * With Supabase every action is real (Supabase Auth, `my_personal_data()`,
 * the `delete-account` function) and there is no demo panel. Without it (mock
 * mode: the smoke tests), the panel picks the outcome of the simulated calls.
 */
export function Security() {
  const { t } = useTranslation();
  const { realAuth } = useAuth();
  const [outcome, setOutcome] = useState<ServiceOutcome>("success");

  return (
    <div className="grid gap-6">
      <SectionHeader
        icon={ShieldCheck}
        eyebrow={t("account.profileEyebrow")}
        title={t("security.page.title")}
        description={t("security.page.body")}
      />

      {!realAuth && (
        <DemoControls summary={t(`security.demo.outcome.${outcome}`)}>
          <DemoNote>{t("security.page.demoBody")}</DemoNote>
          <RadioPills
            name="gt-security-outcome"
            legend={t("security.demo.outcomeLegend")}
            options={OUTCOMES}
            value={outcome}
            onChange={setOutcome}
            labelFor={(v) => t(`security.demo.outcome.${v}`)}
          />
          <div className="grid gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-primary)]">{t("security.page.demoPassword")}</span>
            <span>
              <DemoCode>{DEMO_CURRENT_PASSWORD}</DemoCode> — {t("security.page.demoPasswordBody")}
            </span>
          </div>
          <div className="grid gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-primary)]">{t("register.demo.takenLegend")}</span>
            <span className="flex flex-wrap gap-1">
              {TAKEN_EMAILS.map((email) => (
                <DemoCode key={email}>{email}</DemoCode>
              ))}
            </span>
          </div>
        </DemoControls>
      )}

      <SecurityOverview />

      <div className="grid gap-4">
        <h2 className="gt-eyebrow">{t("security.page.signInGroup")}</h2>
        <ChangeEmailCard outcome={outcome} />
        <ChangePasswordCard outcome={outcome} />
      </div>

      <div className="grid gap-4">
        <h2 className="gt-eyebrow">{t("security.page.privacyGroup")}</h2>
        <DataExportCard />
        <DeleteAccountCard outcome={outcome} />
      </div>
    </div>
  );
}
