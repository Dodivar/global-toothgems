import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Eye,
  GripVertical,
  Languages,
  ListChecks,
  Plus,
  Settings2,
  Star,
  TriangleAlert,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminIconButton } from "../admin/AdminIconButton";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { OverflowMenu } from "../admin/OverflowMenu";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { useToast } from "../../lib/toast";
import { useAdminSettings } from "../../lib/adminSettings";
import { areaCoverage, languageCoverage } from "../../lib/settingsRules";
import { SOURCE_LANGUAGE, type ContentLanguage } from "../../data/adminSettings";
import { COVERAGE_AREAS, TRACKED_LANGUAGES } from "../../data/adminTranslations";
import { AREA_ICON } from "./translationMeta";
import { MissingTranslations, MISSING_LIST_ID } from "./MissingTranslations";
import { CoverageBar, DefaultBadge, Flag, SettingsCard, StatusPill, focusRing } from "./SettingsUi";

/**
 * Content languages: which ones customers can use, in what order, which is the
 * default — and, the part that matters day to day, what is still missing in
 * each and how to fix it.
 *
 * Every language card ends in its gap count as a button; pressing it filters
 * the missing-translations list below to that language and moves focus there.
 * From the list, one click opens the editor on that item in that language.
 */

export function LanguagesSection() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [, setParams] = useSearchParams();
  const { draft, saved, update, translations } = useAdminSettings();
  const settings = draft.languages;
  const enabled = settings.languages.filter((l) => l.enabled);
  const disabled = settings.languages.filter((l) => !l.enabled);
  const targets = enabled.filter((l) => l.code !== SOURCE_LANGUAGE).map((l) => l.code);

  const [confirmDisable, setConfirmDisable] = useState<ContentLanguage | null>(null);
  const [confirmDefault, setConfirmDefault] = useState<ContentLanguage | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const setLanguages = (next: (l: ContentLanguage[]) => ContentLanguage[]) => update("languages", (v) => ({ ...v, languages: next(v.languages) }));
  const pending = t("settings.toast.pendingBody");

  const coverage = (code: string) => languageCoverage(translations, code, code === SOURCE_LANGUAGE);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= enabled.length || from === to) return;
    const order = [...enabled];
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    setLanguages(() => [...order, ...disabled]);
    setAnnounce(t("settings.lang.moved", { name: t(`settings.lang.names.${item.code}`), position: to + 1, total: order.length }));
  };

  const setEnabled = (lang: ContentLanguage, on: boolean) => {
    setLanguages((all) => {
      const rest = all.filter((l) => l.code !== lang.code);
      const en = rest.filter((l) => l.enabled);
      const dis = rest.filter((l) => !l.enabled);
      return on ? [...en, { ...lang, enabled: true }, ...dis] : [...en, { ...lang, enabled: false }, ...dis];
    });
    showToast(t(on ? "settings.lang.toast.enabled" : "settings.lang.toast.disabled", { name: t(`settings.lang.names.${lang.code}`) }), on ? t("settings.lang.toast.enabledBody") : pending, "info");
  };

  const showMissing = (code: string) => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("tr_lang", code);
        return next;
      },
      { replace: true },
    );
    requestAnimationFrame(() => {
      document.getElementById(MISSING_LIST_ID)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      document.getElementById(`${MISSING_LIST_ID}-anchor`)?.focus({ preventScroll: true });
    });
  };

  const defaultLang = settings.languages.find((l) => l.code === settings.defaultCode);

  return (
    <>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Enabled languages ------------------------------------------------ */}
        <SettingsCard
          icon={Languages}
          title={t("settings.lang.enabled.title")}
          description={t("settings.lang.enabled.description")}
          flush
        >
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          <ol className="m-0 grid list-none gap-0 p-0" aria-label={t("settings.lang.enabled.order")}>
            {enabled.map((lang, index) => {
              const isDefault = lang.code === settings.defaultCode;
              const isSource = lang.code === SOURCE_LANGUAGE;
              const cov = coverage(lang.code);
              const gaps = cov.missing + cov.outdated;
              const name = t(`settings.lang.names.${lang.code}`);
              const wasSaved = saved.languages.languages.find((l) => l.code === lang.code)?.enabled;
              return (
                <li
                  key={lang.code}
                  draggable
                  onDragStart={() => (dragFrom.current = index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(index);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => {
                    if (dragFrom.current != null) move(dragFrom.current, index);
                    dragFrom.current = null;
                    setDragOver(null);
                  }}
                  onDragEnd={() => setDragOver(null)}
                  className={clsx(
                    "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-t border-[var(--border-subtle)] px-4 py-4 transition-colors first:border-t-0 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(250px,1.2fr)_auto]",
                    dragOver === index && "bg-[var(--gt-blue-50)] shadow-[inset_0_2px_0_var(--gt-blue-400)]",
                    isDefault && "bg-[linear-gradient(90deg,var(--gt-blue-50),transparent_60%)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <GripVertical size={16} aria-hidden="true" className="hidden cursor-grab text-[var(--text-subtle)] sm:block" />
                    <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[24px] shadow-[var(--shadow-xs)]">
                      <Flag glyph={lang.flag} />
                    </span>
                  </span>

                  <div className="grid min-w-0 gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[length:var(--text-body-md)] font-bold text-[var(--text-primary)]">{name}</span>
                      {isDefault && <DefaultBadge />}
                      {wasSaved === false && (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--gt-fuchsia-50)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-highlight-ink)]">{t("settings.lang.new")}</span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      <span lang={lang.locale}>{lang.native}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-[family-name:var(--gt-font-mono)] font-semibold text-[var(--text-body)]">
                        {lang.code.toUpperCase()} · {lang.locale}
                      </span>
                      {isSource && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t("settings.lang.source")}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Coverage + the next action */}
                  <div className="col-span-3 grid gap-1.5 lg:col-span-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[length:var(--text-caption)]">
                      <span className="whitespace-nowrap font-semibold text-[var(--text-primary)]">
                        {t("settings.lang.coverage", { percent: cov.percent })}
                      </span>
                      {isSource ? (
                        <span className="text-[var(--text-muted)]">{t("settings.lang.original")}</span>
                      ) : gaps > 0 && TRACKED_LANGUAGES.includes(lang.code) ? (
                        <button
                          type="button"
                          onClick={() => showMissing(lang.code)}
                          className={clsx(
                            "inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-semibold text-[var(--status-warning-fg)] underline-offset-2 transition-colors hover:underline",
                            focusRing,
                          )}
                        >
                          <TriangleAlert size={12} aria-hidden="true" />
                          {t("settings.lang.missingCount", { count: gaps })}
                          <span className="sr-only"> — {t("settings.lang.showMissingFor", { name })}</span>
                        </button>
                      ) : gaps > 0 ? (
                        <span className="font-semibold text-[var(--status-warning-fg)]">{t("settings.lang.notStarted")}</span>
                      ) : (
                        <span className="font-semibold text-[var(--status-success-fg)]">{t("settings.lang.complete")}</span>
                      )}
                    </div>
                    <CoverageBar percent={cov.percent} />
                  </div>

                  <div className="col-start-3 row-start-1 flex items-center justify-end gap-1 lg:col-start-auto lg:row-start-auto">
                    <AdminIconButton icon={ArrowUp} size="sm" label={t("settings.lang.moveUp", { name })} disabled={index === 0} onClick={() => move(index, index - 1)} />
                    <AdminIconButton icon={ArrowDown} size="sm" label={t("settings.lang.moveDown", { name })} disabled={index === enabled.length - 1} onClick={() => move(index, index + 1)} />
                    <OverflowMenu
                      label={t("settings.lang.menu", { name })}
                      note={isDefault ? t("settings.lang.defaultNote") : undefined}
                      actions={[
                        { id: "default", label: t("settings.lang.setDefault"), icon: Star, disabled: isDefault, onSelect: () => setConfirmDefault(lang) },
                        { id: "missing", label: t("settings.lang.viewMissing"), icon: ListChecks, disabled: isSource || gaps === 0 || !TRACKED_LANGUAGES.includes(lang.code), onSelect: () => showMissing(lang.code) },
                        { id: "disable", label: t("settings.lang.disable"), icon: Ban, tone: "danger", separated: true, disabled: isDefault, onSelect: () => setConfirmDisable(lang) },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ol>

          {disabled.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-4 py-4 sm:px-6">
              <h3 className="mb-2.5 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{t("settings.lang.available")}</h3>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {disabled.map((lang) => (
                  <li key={lang.code} className="flex items-center gap-3 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] bg-[var(--admin-panel)] px-3 py-2.5">
                    <Flag glyph={lang.flag} className="text-[20px] grayscale-[.3]" />
                    <span className="grid min-w-0 flex-1">
                      <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t(`settings.lang.names.${lang.code}`)}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        <span lang={lang.locale}>{lang.native}</span> · {lang.locale}
                      </span>
                    </span>
                    <StatusPill active={false} inactiveLabel={t("settings.lang.off")} />
                    <AdminButton variant="outline" size="sm" iconLeft={Plus} onClick={() => setEnabled(lang, true)}>
                      {t("settings.lang.enable")}
                    </AdminButton>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 border-t border-[var(--border-subtle)] px-4 py-5 sm:px-6">
            <h3 className="flex items-center gap-2 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
              <Settings2 size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
              {t("settings.lang.options")}
            </h3>
            <ToggleSwitch
              label={t("settings.lang.detect")}
              description={t("settings.lang.detectHint")}
              checked={settings.detectBrowser}
              onChange={(detectBrowser) => update("languages", (v) => ({ ...v, detectBrowser }))}
            />
            <ToggleSwitch
              label={t("settings.lang.fallback")}
              description={t("settings.lang.fallbackHint", { name: defaultLang ? t(`settings.lang.names.${defaultLang.code}`) : "" })}
              checked={settings.fallbackToDefault}
              onChange={(fallbackToDefault) => update("languages", (v) => ({ ...v, fallbackToDefault }))}
            />
          </div>
        </SettingsCard>

        <CoveragePanel targets={targets} />
      </div>

      <MissingTranslations targets={targets.filter((c) => TRACKED_LANGUAGES.includes(c))} untracked={targets.filter((c) => !TRACKED_LANGUAGES.includes(c))} />

      <ConfirmationDialog
        open={confirmDisable != null}
        tone="danger"
        icon={Ban}
        title={t("settings.lang.disableTitle", { name: confirmDisable ? t(`settings.lang.names.${confirmDisable.code}`) : "" })}
        body={
          <div className="grid gap-2">
            <p className="m-0">{t("settings.lang.disableBody", { name: confirmDisable ? t(`settings.lang.names.${confirmDisable.code}`) : "", fallback: defaultLang ? t(`settings.lang.names.${defaultLang.code}`) : "" })}</p>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.lang.disableKeep")}</p>
          </div>
        }
        confirmLabel={t("settings.lang.disableConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        onCancel={() => setConfirmDisable(null)}
        onConfirm={() => {
          if (confirmDisable) setEnabled(confirmDisable, false);
          setConfirmDisable(null);
        }}
      />

      <ConfirmationDialog
        open={confirmDefault != null}
        icon={Star}
        title={t("settings.lang.defaultTitle", { name: confirmDefault ? t(`settings.lang.names.${confirmDefault.code}`) : "" })}
        body={
          confirmDefault && (
            <div className="grid gap-2">
              <p className="m-0">{t("settings.lang.defaultBody", { name: t(`settings.lang.names.${confirmDefault.code}`) })}</p>
              {coverage(confirmDefault.code).percent < 100 && (
                <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
                  <Eye size={14} aria-hidden="true" className="mt-px flex-none" />
                  {t("settings.lang.defaultWarning", { percent: coverage(confirmDefault.code).percent })}
                </p>
              )}
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.lang.defaultSource")}</p>
            </div>
          )
        }
        confirmLabel={t("settings.lang.defaultConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        onCancel={() => setConfirmDefault(null)}
        onConfirm={() => {
          if (confirmDefault) {
            update("languages", (v) => ({ ...v, defaultCode: confirmDefault.code }));
            showToast(t("settings.lang.toast.default", { name: t(`settings.lang.names.${confirmDefault.code}`) }), pending, "info");
          }
          setConfirmDefault(null);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CoveragePanel({ targets }: { targets: string[] }) {
  const { t } = useTranslation();
  const { translations } = useAdminSettings();
  const rows = useMemo(() => COVERAGE_AREAS.map((a) => ({ area: a, percent: areaCoverage(translations, a, targets) })), [translations, targets]);
  const overall = Math.floor(rows.reduce((s, r) => s + r.percent, 0) / rows.length);

  return (
    <SettingsCard icon={ListChecks} tone="emerald" title={t("settings.lang.coveragePanel.title")} description={t("settings.lang.coveragePanel.description")}>
      <div className="grid gap-5">
        <div className="flex items-end gap-3">
          <span className="text-[40px] font-bold leading-none tabular-nums text-[var(--text-primary)]">{overall}%</span>
          <span className="pb-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.lang.coveragePanel.overall", { count: targets.length })}</span>
        </div>
        <ul className="m-0 grid list-none gap-3.5 p-0">
          {rows.map(({ area, percent }) => {
            const Icon = AREA_ICON[area];
            return (
              <li key={area} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                <span aria-hidden="true" className="row-span-2 grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--surface-sunken)] text-[var(--text-body)]">
                  <Icon size={15} strokeWidth={1.9} />
                </span>
                <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t(`settings.tr.area.${area}`)}</span>
                <span className="text-right text-[length:var(--text-caption)] font-bold tabular-nums text-[var(--text-primary)]">{percent}%</span>
                <CoverageBar percent={percent} size="sm" className="col-span-2" />
              </li>
            );
          })}
        </ul>
      </div>
    </SettingsCard>
  );
}
