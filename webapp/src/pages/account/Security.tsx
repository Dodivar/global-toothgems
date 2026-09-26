import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FastForward, ShieldCheck, TimerOff } from "lucide-react";
import { SectionHeader } from "../../components/account/SectionHeader";
import { SecurityOverview } from "../../components/security/SecurityOverview";
import { ChangeEmailCard } from "../../components/security/ChangeEmailCard";
import { ChangePasswordCard } from "../../components/security/ChangePasswordCard";
import { DataExportCard } from "../../components/security/DataExportCard";
import { DeleteAccountCard } from "../../components/security/DeleteAccountCard";
import { DemoCode, DemoControls, DemoNote, RadioPills } from "../../components/security/DemoControls";
import { DEMO_CURRENT_PASSWORD, type ServiceOutcome } from "../../lib/accountSecurity";
import { useAccountSecurity } from "../../lib/securityState";
import { TAKEN_EMAILS } from "../../lib/registration";

const OUTCOMES: ServiceOutcome[] = ["success", "serverError"];

const demoButton =
  "inline-flex min-h-[36px] items-center gap-2 rounded-full border border-[var(--border-default)] bg-white px-3.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] disabled:pointer-events-none disabled:opacity-45";

/**
 * Security & privacy, at `/compte/securite`: one member-area section like the
 * others, reached from the same sidebar.
 *
 * Top to bottom it goes from reassurance to consequence: an overview of where
 * the account stands, then sign-in (email, password), then data (export) and
 * finally, quietly, deletion. Each card owns its own states; the page only
 * holds the demo outcome that every simulated call reads.
 */
export function Security() {
  const { t } = useTranslation();
  const { dataExport, finishExportNow, expireExportNow } = useAccountSecurity();
  const [outcome, setOutcome] = useState<ServiceOutcome>("success");

  return (
    <div className="grid max-w-[880px] gap-6">
      <SectionHeader
        icon={ShieldCheck}
        eyebrow={t("account.profileEyebrow")}
        title={t("security.page.title")}
        description={t("security.page.body")}
      />

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
        <div className="grid gap-2">
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("security.page.demoExport")}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={demoButton} onClick={finishExportNow} disabled={dataExport.status !== "processing"}>
              <FastForward size={13} aria-hidden="true" />
              {t("security.page.demoFinishExport")}
            </button>
            <button type="button" className={demoButton} onClick={expireExportNow} disabled={dataExport.status !== "ready"}>
              <TimerOff size={13} aria-hidden="true" />
              {t("security.page.demoExpireExport")}
            </button>
          </div>
        </div>
      </DemoControls>

      <SecurityOverview />

      <div className="grid gap-4">
        <h2 className="gt-eyebrow">{t("security.page.signInGroup")}</h2>
        <ChangeEmailCard outcome={outcome} />
        <ChangePasswordCard outcome={outcome} />
      </div>

      <div className="grid gap-4">
        <h2 className="gt-eyebrow">{t("security.page.privacyGroup")}</h2>
        <DataExportCard outcome={outcome} />
        <DeleteAccountCard outcome={outcome} />
      </div>
    </div>
  );
}
