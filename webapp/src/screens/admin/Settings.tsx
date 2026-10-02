"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "../../lib/navigation";
import {
  CircleAlert,
  CircleCheck,
  CloudOff,
  Languages,
  Lock,
  Percent,
  RefreshCw,
  RotateCcw,
  Save,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { CardLoadingState } from "../../components/admin/LoadingState";
import { EmptyState } from "../../components/admin/EmptyState";
import { useToast } from "../../lib/toast";
import { useAdminSettings, SETTINGS_SECTIONS, type SettingsSection, type SettingsStatus, type SettingsWriteError } from "../../lib/adminSettings";
import { servedWithoutVat, shippingIssues, validateStore } from "../../lib/settingsRules";
import { focusRing } from "../../components/settings/SettingsUi";
import { StoreDetailsSection } from "../../components/settings/StoreDetailsSection";
import { ShippingSection } from "../../components/settings/ShippingSection";
import { TaxesSection } from "../../components/settings/TaxesSection";
import { LanguagesSection } from "../../components/settings/LanguagesSection";
import { useAdminShell } from "./AdminLayout";

/**
 * Store configuration: identity, shipping, VAT and content languages.
 *
 * One route; the section is the `section` query key, so "the shipping
 * settings" is a link a colleague can open. Every section follows the same
 * model — edit a draft, then Save or Discard — and the header carries that
 * model everywhere: a state line that says whether what you see is live, and
 * the two buttons, disabled while there is nothing to save.
 *
 * Drafts survive moving between sections (and leaving Settings), so the
 * section navigation marks each one with unsaved changes; the browser's own
 * leave-page prompt covers a closed tab. Members without `manage_settings`
 * read everything and change nothing (the database refuses it anyway).
 */

const SLUGS: Record<SettingsSection, string> = {
  store: "boutique",
  shipping: "livraison",
  taxes: "taxes",
  languages: "langues",
};

const ICONS: Record<SettingsSection, LucideIcon> = {
  store: Store,
  shipping: Truck,
  taxes: Percent,
  languages: Languages,
};

function settingsHref(section: SettingsSection, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ section: SLUGS[section], ...extra });
  return `/admin/parametres?${params.toString()}`;
}

function sectionFromSlug(slug: string | null): SettingsSection {
  return (Object.keys(SLUGS) as SettingsSection[]).find((k) => SLUGS[k] === slug) ?? "store";
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const section = sectionFromSlug(params.get("section"));
  const settings = useAdminSettings();
  const { draft, saved, isDirty, discard, save, setAttempted, savedAt, status, canManage, reload } = settings;
  const [saving, setSaving] = useState(false);
  // A failed save is about the section it happened in.
  const [failure, setFailure] = useState<{ section: SettingsSection; error: SettingsWriteError } | null>(null);
  const saveFailed = failure?.section === section ? failure.error : null;
  const ready = status === "ready";
  const summaryRef = useRef<HTMLDivElement>(null);

  const dirty = isDirty(section);
  const anyDirty = SETTINGS_SECTIONS.some(isDirty);

  // A closed tab or a reload would lose the drafts: ask the browser to warn.
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  const errorCount = useMemo(() => (section === "store" ? Object.keys(validateStore(draft.store)).length : 0), [section, draft.store]);

  const showSummary = settings.attempted[section] && errorCount > 0;

  /** Items that need a look, per section — shown as a count in the navigation. */
  const attention: Record<SettingsSection, number> = useMemo(
    () => ({
      store: 0,
      shipping: shippingIssues(draft.shipping).length,
      taxes: servedWithoutVat(saved.shipping, draft.taxes).length,
      languages: 0,
    }),
    [draft.shipping, saved.shipping, draft.taxes],
  );

  const go = (next: SettingsSection) => {
    setParams({ section: SLUGS[next] });
    window.scrollTo({ top: 0 });
  };

  const onSave = async () => {
    setAttempted(section, true);
    if (errorCount > 0) {
      showToast(t("settings.toast.fixErrors", { count: errorCount }), undefined, "error");
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSaving(true);
    const result = await save(section);
    setSaving(false);
    if (result.ok) {
      setFailure(null);
      showToast(t("settings.toast.saved", { section: t(`settings.sections.${section}.title`) }), t(`settings.toast.savedBody.${section}`));
    } else {
      setFailure({ section, error: result.error });
      showToast(t("settings.toast.failed"), t(`settings.saveError.reasons.${result.error}`), "error");
    }
  };

  const onDiscard = () => {
    discard(section);
    setFailure(null);
    showToast(t("settings.toast.discarded"), undefined, "info");
  };

  const lastSaved = savedAt[section];
  const timeFmt = new Intl.DateTimeFormat(i18n.language.startsWith("fr") ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  const stateLine = (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[length:var(--text-caption)] font-semibold",
        dirty ? "text-[var(--accent-highlight-ink)]" : "text-[var(--text-muted)]",
      )}
      aria-live="polite"
    >
      {dirty ? (
        <span aria-hidden="true" className="relative flex h-2 w-2">
          <span className="gt-settings-ping absolute inset-0 rounded-full bg-[var(--accent-highlight)]" />
          <span className="relative h-2 w-2 rounded-full bg-[var(--accent-highlight)]" />
        </span>
      ) : (
        <CircleCheck size={14} strokeWidth={2.2} aria-hidden="true" className="text-[var(--status-success-fg)]" />
      )}
      {dirty
        ? t("settings.state.unsaved")
        : lastSaved
          ? t("settings.state.savedAt", { time: timeFmt.format(lastSaved) })
          : t("settings.state.upToDate")}
    </span>
  );

  return (
    <>
      <AdminHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.settings"), to: settingsHref("store") },
          { label: t(`settings.sections.${section}.title`) },
        ]}
        onOpenNav={openNav}
        actions={
          <div className="hidden items-center gap-3 xl:flex">
            {stateLine}
            <AdminButton variant="outline" iconLeft={RotateCcw} disabled={!dirty || saving || !canManage} onClick={onDiscard}>
              {t("settings.actions.discard")}
            </AdminButton>
            <AdminButton variant="primary" iconLeft={Save} disabled={!dirty || !canManage} loading={saving} onClick={onSave}>
              {t("settings.actions.save")}
            </AdminButton>
          </div>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(96px,10vw,120px)] pt-5 xl:pb-[clamp(32px,5vw,56px)]">
        {!ready ? (
          <StatusPanel status={status} onRetry={reload} />
        ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[248px_minmax(0,1fr)] xl:items-start">
          <SectionNav current={section} onSelect={go} isDirty={isDirty} attention={attention} />

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
            <SectionIntro section={section} />

            {!canManage && (
              <div role="note" className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--border-default)] bg-[var(--surface-sunken)] p-4 text-[length:var(--text-caption)] text-[var(--text-body)]">
                <Lock size={16} aria-hidden="true" className="mt-px flex-none text-[var(--text-muted)]" />
                <p className="m-0">{t("settings.readOnly")}</p>
              </div>
            )}

            {showSummary && (
              <div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4 text-[var(--status-error-fg)] outline-none focus-visible:shadow-[var(--shadow-focus)]"
              >
                <CircleAlert size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
                <div className="grid gap-0.5">
                  <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">{t("settings.errorsSummary.title", { count: errorCount })}</p>
                  <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">{t("settings.errorsSummary.body")}</p>
                </div>
              </div>
            )}

            {saveFailed && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4 text-[var(--status-error-fg)]">
                <CircleAlert size={18} strokeWidth={2} aria-hidden="true" className="flex-none" />
                <div className="grid min-w-[14rem] flex-1 gap-0.5">
                  <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">{t("settings.saveError.title")}</p>
                  <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">{t(`settings.saveError.reasons.${saveFailed}`)}</p>
                </div>
                {saveFailed === "unavailable" && (
                  <AdminButton variant="dark" size="sm" loading={saving} onClick={onSave}>
                    {t("settings.saveError.retry")}
                  </AdminButton>
                )}
              </div>
            )}

            {/* Read-only members see every value; a disabled fieldset disables every control in it. */}
            <fieldset key={section} disabled={!canManage} className="gt-settings-enter m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 border-0 p-0">
              <legend className="sr-only">{t(`settings.sections.${section}.title`)}</legend>
              {section === "store" && <StoreDetailsSection />}
              {section === "shipping" && <ShippingSection />}
              {section === "taxes" && <TaxesSection />}
              {section === "languages" && <LanguagesSection />}
            </fieldset>
          </div>
        </div>
        )}
      </div>

      {/* Below 1280px the header has no room for the save actions beside the
          title, so they ride in a bar at the bottom while there is something
          to save. */}
      {dirty && canManage && (
        <div className="gt-settings-savebar gt-sheet-up fixed inset-x-3 bottom-3 z-[80] sm:left-auto sm:right-[var(--admin-gutter)] sm:w-[min(560px,calc(100%-2*var(--admin-gutter)))] xl:hidden">
          <div className="gt-glass flex items-center gap-2 rounded-[var(--admin-radius)] p-2.5 pl-4 shadow-[var(--shadow-lg)]">
            <span className="min-w-0 flex-1 truncate">{stateLine}</span>
            <AdminButton variant="outline" size="sm" disabled={saving} onClick={onDiscard}>
              {t("settings.actions.discardShort")}
            </AdminButton>
            <AdminButton variant="primary" size="sm" iconLeft={Save} loading={saving} onClick={onSave}>
              {t("settings.actions.save")}
            </AdminButton>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Section navigation. A vertical list with one-line descriptions on wide
 * screens, where there is room to say what each section controls; a
 * horizontal, scrollable tab row below that. The current section is marked by
 * weight, an ink bar and `aria-current` — never by colour alone — and a
 * section with unsaved changes carries a fuchsia dot *and* the words.
 */
function SectionNav({
  current,
  onSelect,
  isDirty,
  attention,
}: {
  current: SettingsSection;
  onSelect: (s: SettingsSection) => void;
  isDirty: (s: SettingsSection) => boolean;
  attention: Record<SettingsSection, number>;
}) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);

  // On narrow screens the tab row scrolls sideways; keep the current section
  // in view (a link straight to "Languages" would otherwise hide its own tab).
  useEffect(() => {
    const box = scroller.current;
    const active = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!box || !active) return;
    const a = active.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    box.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [current]);

  const marker = (s: SettingsSection) =>
    isDirty(s) ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent-highlight-ink)]">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-highlight)]" />
        {t("settings.nav.unsaved")}
      </span>
    ) : attention[s] > 0 ? (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--status-warning-fg)]">
        <span aria-hidden="true">{attention[s]}</span>
        <span className="sr-only">{t(`settings.nav.attention.${s}`, { count: attention[s] })}</span>
      </span>
    ) : null;

  return (
    <nav aria-label={t("settings.nav.label")} className="xl:sticky xl:top-[calc(var(--admin-header-h)+20px)]">
      {/* Wide screens */}
      <ul className="m-0 hidden list-none gap-1 p-0 xl:grid">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = ICONS[s];
          const active = s === current;
          return (
            <li key={s}>
              <a
                href={settingsHref(s)}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(s);
                }}
                className={clsx(
                  "group relative flex items-start gap-3 rounded-[var(--admin-radius)] border p-3 transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)]",
                  focusRing,
                  active
                    ? "border-[var(--border-subtle)] bg-[var(--admin-panel)] shadow-[var(--shadow-sm)]"
                    : "border-transparent hover:bg-[var(--admin-panel)]/70",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute left-0 top-3 bottom-3 w-[3px] rounded-r-[3px] bg-[var(--gt-ink-900)] transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid h-9 w-9 flex-none place-items-center rounded-[9px] transition-colors",
                    active ? "bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
                  )}
                >
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className={clsx("text-[length:var(--text-body-sm)] text-[var(--text-primary)]", active ? "font-bold" : "font-semibold")}>
                      {t(`settings.sections.${s}.title`)}
                    </span>
                    {marker(s)}
                  </span>
                  <span className="text-[11px] leading-snug text-[var(--text-muted)]">{t(`settings.sections.${s}.nav`)}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Below xl */}
      <div ref={scroller} className="gt-scroller -mx-[var(--admin-gutter)] px-[var(--admin-gutter)] xl:hidden">
        <ul className="m-0 flex min-w-max list-none gap-1 border-b border-[var(--border-subtle)] p-0">
          {SETTINGS_SECTIONS.map((s) => {
            const Icon = ICONS[s];
            const active = s === current;
            return (
              <li key={s}>
                <a
                  href={settingsHref(s)}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelect(s);
                  }}
                  className={clsx(
                    "relative inline-flex h-11 items-center gap-2 rounded-t-[var(--admin-radius-sm)] px-3.5 text-[length:var(--text-body-sm)] transition-colors",
                    focusRing,
                    active
                      ? "font-bold text-[var(--text-primary)]"
                      : "font-medium text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                  {t(`settings.sections.${s}.title`)}
                  {marker(s)}
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "absolute inset-x-2 -bottom-px h-[3px] rounded-t-[3px] bg-[var(--gt-ink-900)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
                      active ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function SectionIntro({ section }: { section: SettingsSection }) {
  const { t } = useTranslation();
  const Icon = ICONS[section];
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="hidden h-12 w-12 flex-none place-items-center rounded-[14px] border border-[var(--gt-blue-200)] bg-[linear-gradient(145deg,var(--gt-white),var(--gt-blue-100))] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)] sm:grid"
      >
        <Icon size={22} strokeWidth={1.7} />
      </span>
      <div className="grid gap-1">
        <h2 className="text-[length:var(--text-h3)] leading-[var(--leading-snug)]">{t(`settings.sections.${section}.title`)}</h2>
        <p className="m-0 max-w-[72ch] text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
          {t(`settings.sections.${section}.intro`)}
        </p>
      </div>
    </div>
  );
}

/** What stands in for the sections until the settings are read (or when they cannot be). */
function StatusPanel({ status, onRetry }: { status: SettingsStatus; onRetry: () => void }) {
  const { t } = useTranslation();
  if (status === "loading") return <CardLoadingState label={t("settings.status.loading")} />;
  return (
    <div className="gt-admin-panel">
      {status === "failed" ? (
        <EmptyState
          icon={CircleAlert}
          title={t("settings.status.failedTitle")}
          body={t("settings.status.failedBody")}
          action={
            <AdminButton variant="primary" iconLeft={RefreshCw} onClick={onRetry}>
              {t("settings.status.retry")}
            </AdminButton>
          }
        />
      ) : (
        <EmptyState icon={CloudOff} title={t("settings.status.unavailableTitle")} body={t("settings.status.unavailableBody")} />
      )}
    </div>
  );
}
