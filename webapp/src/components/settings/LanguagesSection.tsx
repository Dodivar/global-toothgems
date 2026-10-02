import { useTranslation } from "react-i18next";
import { Globe2, Info, Languages, Lock } from "lucide-react";
import clsx from "clsx";
import { useToast } from "../../lib/toast";
import { useAdminSettings } from "../../lib/adminSettings";
import { flagOf } from "../../lib/settingsRules";
import { STOREFRONT_LANGUAGES, type ContentLanguage } from "../../data/adminSettings";
import { DefaultBadge, Flag, RowSwitch, SettingsCard, StatusPill } from "./SettingsUi";

/**
 * Content languages, as `public.languages` holds them.
 *
 * The default language (French) is the language the base content is written
 * in, and the storefront is published in French and English: those cannot be
 * switched off here — the database refuses it. Any other language can be
 * switched on to start accepting content translations in it (products,
 * categories, pages, e-mails, orders and member preferences may use it); it
 * does not add a language to the public site, which the page says outright.
 */

const regionOf = (locale: string) => locale.split("-")[1] ?? "";

export function LanguagesSection() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { draft, saved, update } = useAdminSettings();
  const languages = draft.languages.languages;

  const setEnabled = (lang: ContentLanguage, enabled: boolean) => {
    update("languages", (v) => ({ languages: v.languages.map((l) => (l.code === lang.code ? { ...l, enabled } : l)) }));
    showToast(
      t(enabled ? "settings.lang.toast.enabled" : "settings.lang.toast.disabled", { name: t(`settings.lang.names.${lang.code}`, { defaultValue: lang.native }) }),
      t("settings.toast.pendingBody"),
      "info",
    );
  };

  return (
    <>
      <div className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] p-4 text-[length:var(--text-caption)] text-[var(--text-body)]">
        <Globe2 size={18} aria-hidden="true" className="mt-px flex-none text-[var(--gt-blue-700)]" />
        <div className="grid gap-1">
          <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("settings.lang.storefront.title")}</p>
          <p className="m-0">{t("settings.lang.storefront.body")}</p>
        </div>
      </div>

      <SettingsCard icon={Languages} title={t("settings.lang.enabled.title")} description={t("settings.lang.enabled.description")} flush>
        <ul className="m-0 grid list-none gap-0 p-0">
          {languages.map((lang) => {
            const name = t(`settings.lang.names.${lang.code}`, { defaultValue: lang.native });
            const storefront = STOREFRONT_LANGUAGES.includes(lang.code);
            const locked = lang.isDefault || storefront;
            const wasEnabled = saved.languages.languages.find((l) => l.code === lang.code)?.enabled;
            return (
              <li
                key={lang.code}
                className={clsx(
                  "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-t border-[var(--border-subtle)] px-4 py-4 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6",
                  lang.isDefault && "bg-[linear-gradient(90deg,var(--gt-blue-50),transparent_60%)]",
                  !lang.enabled && "bg-[var(--admin-panel-sunken)]",
                )}
              >
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[24px] shadow-[var(--shadow-xs)]">
                  <Flag glyph={flagOf(regionOf(lang.locale))} className={clsx(!lang.enabled && "grayscale-[.3]")} />
                </span>

                <div className="grid min-w-0 gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[length:var(--text-body-md)] font-bold text-[var(--text-primary)]">{name}</span>
                    {lang.isDefault && <DefaultBadge />}
                    {storefront && (
                      <span className="rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gt-blue-700)]">{t("settings.lang.onStorefront")}</span>
                    )}
                    <StatusPill active={lang.enabled} inactiveLabel={t("settings.lang.off")} />
                    {wasEnabled !== undefined && wasEnabled !== lang.enabled && (
                      <span className="rounded-[var(--radius-pill)] bg-[var(--gt-fuchsia-50)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-highlight-ink)]">{t("settings.lang.changed")}</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    <span lang={lang.locale}>{lang.native}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-[family-name:var(--gt-font-mono)] font-semibold text-[var(--text-body)]">
                      {lang.code.toUpperCase()} · {lang.locale}
                    </span>
                    {lang.isDefault && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t("settings.lang.source")}</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                  {locked ? (
                    <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">
                      <Lock size={13} aria-hidden="true" />
                      {lang.isDefault ? t("settings.lang.lockedDefault") : t("settings.lang.lockedStorefront")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)]">
                      <RowSwitch checked={lang.enabled} onChange={(v) => setEnabled(lang, v)} label={t("settings.lang.enableLabel", { name })} />
                      <span aria-hidden="true">{lang.enabled ? t("settings.ui.on") : t("settings.ui.off")}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="m-0 flex items-start gap-2 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)] sm:px-6">
          <Info size={14} aria-hidden="true" className="mt-px flex-none" />
          {t("settings.lang.effect")}
        </p>
      </SettingsCard>
    </>
  );
}
