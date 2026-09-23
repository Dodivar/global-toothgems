import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Cookie, Lock } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { NO_OPTIONAL_CONSENT, OPTIONAL_CATEGORIES, useCookieConsent, type ConsentChoices } from "../../lib/cookieConsent";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { Placeholder } from "./RichText";

/**
 * Cookie preferences, one switch per optional category.
 *
 * Opens on the visitor's current choice, or on everything off when there is
 * none yet — an optional category is never switched on for them. "Reject all"
 * and "Accept all" are the same size and weight; saving the switches as set is
 * the dark button because it is the action this dialog exists for.
 *
 * The panel mounts only while open, so each opening starts from the saved
 * choice rather than from whatever was toggled and abandoned last time.
 */
export function CookieSettingsDialog() {
  const { settingsOpen } = useCookieConsent();
  return settingsOpen ? <CookieSettingsPanel /> : null;
}

function CookieSettingsPanel() {
  const { t } = useTranslation();
  const { record, closeSettings, save, acceptAll, rejectAll } = useCookieConsent();
  const [draft, setDraft] = useState<ConsentChoices>(() =>
    record ? { preferences: record.preferences, analytics: record.analytics, marketing: record.marketing } : NO_OPTIONAL_CONSENT,
  );

  return (
    <Dialog
      open
      onClose={closeSettings}
      title={t("legal.cookies.settingsTitle")}
      description={t("legal.cookies.settingsBody")}
      icon={<Cookie size={17} />}
      closeLabel={t("common.close")}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={rejectAll} fullWidth>
            {t("legal.cookies.rejectAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={acceptAll} fullWidth>
            {t("legal.cookies.acceptAll")}
          </Button>
          <Button variant="dark" size="sm" onClick={() => save(draft)} fullWidth className="col-span-2 h-11">
            {t("legal.cookies.save")}
          </Button>
        </div>
      }
    >
      <ul className="m-0 grid list-none gap-0 divide-y divide-[var(--border-subtle)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-0">
        <li className="grid gap-1.5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t("legal.cookies.category.essential.title")}
              </span>
              <p className="m-0 text-[length:var(--text-caption)] leading-[1.5] text-[var(--text-muted)]">
                {t("legal.cookies.category.essential.body")}
              </p>
            </div>
            <span className="inline-flex flex-none items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-body)]">
              <Lock size={11} aria-hidden="true" />
              {t("legal.cookies.alwaysActive")}
            </span>
          </div>
        </li>
        {OPTIONAL_CATEGORIES.map((category) => (
          <li key={category} className="grid gap-2 p-4">
            <ToggleSwitch
              label={t(`legal.cookies.category.${category}.title`)}
              description={t(`legal.cookies.category.${category}.body`)}
              checked={draft[category]}
              onChange={(checked) => setDraft((d) => ({ ...d, [category]: checked }))}
            />
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("legal.cookies.providers")}{" "}
              <Placeholder label={t("legal.cookies.providersPlaceholder")} />
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("legal.cookies.settingsFoot")}{" "}
        <Link to={LEGAL_PATHS.cookies} onClick={closeSettings} className="gt-legal-link">
          {t("legal.cookies.policyLink")}
        </Link>
      </p>
    </Dialog>
  );
}
