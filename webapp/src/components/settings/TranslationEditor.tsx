import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, CheckCheck, ChevronDown, ChevronUp, CircleAlert, CircleDashed, History, Save, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminSheet, SheetBody, SheetFooter } from "../admin/AdminSheet";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { useToast } from "../../lib/toast";
import { useAdminSettings } from "../../lib/adminSettings";
import { itemProgress, type TrRow } from "../../lib/settingsRules";
import type { TrFieldKind, TrItem, TrValue } from "../../data/adminTranslations";
import { AREA_ICON, PriorityLabel, useShortDate } from "./translationMeta";
import { langFlag } from "./MissingTranslations";
import { CoverageBar, focusRing } from "./SettingsUi";

/**
 * The quick translation editor, opened from the missing list with the missing
 * language already selected.
 *
 * Source and translation sit side by side, field by field. Missing fields are
 * marked in amber with the word "Missing"; fields translated before the
 * English changed are marked "Needs review" and can be confirmed as they are.
 * "Next missing field" walks the gaps without scrolling; "Save & next item"
 * saves and opens the next row of the list, so a translator can clear the
 * whole list without going back to it in between.
 *
 * Edits in several languages of the same item are kept while switching
 * language tabs and saved together.
 */

type Draft = Partial<Record<TrFieldKind, TrValue>>;

function draftFrom(item: TrItem, lang: string): Draft {
  const rec = item.translations[lang];
  if (!rec || rec === "complete") return {};
  return { ...rec };
}

const PLACEHOLDER = /\{\{\s*\w+\s*\}\}/g;

export function TranslationEditor({
  item,
  lang,
  targets,
  rows,
  onNavigate,
  onClose,
}: {
  item: TrItem | undefined;
  lang: string;
  targets: string[];
  rows: TrRow[];
  onNavigate: (itemId: string, lang: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const open = !!item;
  // Escape, the scrim and the close button go through the editor's own guard,
  // so unsaved text is never dropped without a question.
  const requestClose = useRef<() => void>(onClose);
  return (
    <AdminSheet
      open={open}
      onClose={() => requestClose.current()}
      title={item ? item.name : ""}
      description={item ? t("settings.tr.editor.description") : undefined}
      closeLabel={t("settings.ui.close")}
      width={1040}
    >
      {item && (
        <EditorBody
          key={item.id}
          item={item}
          urlLang={lang}
          targets={targets}
          rows={rows}
          onNavigate={onNavigate}
          onClose={onClose}
          registerClose={(fn) => (requestClose.current = fn)}
        />
      )}
    </AdminSheet>
  );
}

function EditorBody({
  item,
  urlLang,
  targets,
  rows,
  onNavigate,
  onClose,
  registerClose,
}: {
  item: TrItem;
  urlLang: string;
  targets: string[];
  rows: TrRow[];
  onNavigate: (itemId: string, lang: string) => void;
  onClose: () => void;
  registerClose: (fn: () => void) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { saveTranslation } = useAdminSettings();
  const date = useShortDate();
  const langs = targets;
  // The language lives in the URL (`langue`), so a chip in the list, a tab
  // here and a pasted link all agree on it.
  const lang = langs.includes(urlLang) ? urlLang : (langs.find((l) => itemProgress(item, l).status !== "complete") ?? langs[0]);
  const setLang = (l: string) => onNavigate(item.id, l);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(langs.map((l) => [l, draftFrom(item, l)])));
  const [saving, setSaving] = useState<null | "close" | "next">(null);
  const [error, setError] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<null | (() => void)>(null);
  const fieldRefs = useRef<Partial<Record<TrFieldKind, HTMLTextAreaElement | HTMLInputElement | null>>>({});

  const draft = drafts[lang] ?? {};
  const complete = item.translations[lang] === "complete";
  const langName = t(`settings.lang.names.${lang}`);

  const stateOf = (key: TrFieldKind): "missing" | "outdated" | "translated" => {
    if (complete) return "translated";
    const v = draft[key];
    if (!v || !v.value.trim()) return "missing";
    return v.outdated ? "outdated" : "translated";
  };

  const dirtyLangs = langs.filter((l) => JSON.stringify(drafts[l]) !== JSON.stringify(draftFrom(item, l)));
  const dirty = dirtyLangs.length > 0;

  const progress = useMemo(() => {
    const total = item.fields.length;
    const states = item.fields.map((f) => stateOf(f.key));
    const done = states.filter((s) => s === "translated").length;
    return { total, done, missing: states.filter((s) => s === "missing").length, review: states.filter((s) => s === "outdated").length };
    // stateOf reads draft/complete, both covered here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, complete, item.fields]);

  const setValue = (key: TrFieldKind, value: string) =>
    setDrafts((d) => ({ ...d, [lang]: { ...d[lang], [key]: { value } } }));

  const confirmReview = (key: TrFieldKind) =>
    setDrafts((d) => {
      const v = d[lang]?.[key];
      return v ? { ...d, [lang]: { ...d[lang], [key]: { value: v.value } } } : d;
    });

  const confirmAllReviews = () =>
    setDrafts((d) => {
      const next: Draft = {};
      for (const [k, v] of Object.entries(d[lang] ?? {}) as [TrFieldKind, TrValue][]) next[k] = { value: v.value };
      return { ...d, [lang]: next };
    });

  const gapKeys = item.fields.map((f) => f.key).filter((k) => stateOf(k) !== "translated");

  const jump = (dir: 1 | -1) => {
    if (gapKeys.length === 0) return;
    const active = document.activeElement;
    const current = item.fields.findIndex((f) => fieldRefs.current[f.key] === active);
    const order = item.fields.map((f) => f.key);
    const n = order.length;
    for (let step = 1; step <= n; step++) {
      const idx = (((current < 0 ? (dir === 1 ? -1 : 0) : current) + dir * step) % n + n) % n;
      const key = order[idx];
      if (gapKeys.includes(key)) {
        const el = fieldRefs.current[key];
        el?.focus();
        el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        return;
      }
    }
  };

  // Rows after this one in the list, for "Save & next item".
  const nextRow = useMemo(() => {
    const idx = rows.findIndex((r) => r.item.id === item.id);
    const after = idx >= 0 ? rows.slice(idx + 1) : rows.filter((r) => r.item.id !== item.id);
    return after[0];
  }, [rows, item.id]);

  const save = async (then: "close" | "next") => {
    setSaving(then);
    setError(false);
    let ok = true;
    for (const l of dirtyLangs) {
      ok = (await saveTranslation(item.id, l, drafts[l] ?? {})) && ok;
      if (!ok) break;
    }
    setSaving(null);
    if (!ok) {
      setError(true);
      showToast(t("settings.tr.editor.failed"), t("settings.toast.failedBody"), "error");
      return;
    }
    if (dirtyLangs.length > 0) {
      showToast(
        t("settings.tr.editor.saved", { name: item.name }),
        dirtyLangs.map((l) => t(`settings.lang.names.${l}`)).join(", "),
      );
    }
    if (then === "next" && nextRow) onNavigate(nextRow.item.id, nextRow.langs[0]);
    else onClose();
  };

  const guard = (action: () => void) => (dirty ? setConfirmLeave(() => action) : action());
  useEffect(() => {
    registerClose(() => guard(onClose));
  });
  const Icon = AREA_ICON[item.type];
  const firstGap = gapKeys[0];

  return (
    <>
      {/* Identity + language switch */}
      <div className="flex-none border-b border-[var(--border-subtle)] px-5 py-3.5 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-body)]">
            <Icon size={14} aria-hidden="true" />
            {t(`settings.tr.type.${item.type}`)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{item.context}</span>
          <span aria-hidden="true">·</span>
          <PriorityLabel priority={item.priority} />
          <span aria-hidden="true">·</span>
          <span>{t("settings.tr.updatedOn", { date: date(item.updatedAt) })}</span>
        </div>
        <div role="group" aria-label={t("settings.tr.editor.languages")} className="flex flex-wrap gap-1.5">
          {langs.map((l) => {
            const saved = itemProgress(item, l);
            const done = saved.status === "complete";
            const active = l === lang;
            const unsaved = dirtyLangs.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={active}
                disabled={done}
                onClick={() => setLang(l)}
                title={done ? t("settings.tr.editor.completeTitle") : undefined}
                className={clsx(
                  "inline-flex h-9 items-center gap-2 rounded-[var(--admin-radius-sm)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors",
                  focusRing,
                  active
                    ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                    : done
                      ? "cursor-default border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                      : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-primary)] hover:border-[var(--gt-ink-400)]",
                )}
              >
                <span aria-hidden="true">{langFlag(l)}</span>
                {t(`settings.lang.names.${l}`)}
                <span className={clsx("font-medium", active ? "text-[var(--gt-white)]/80" : "opacity-80")}>
                  {done ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Check size={12} strokeWidth={2.6} aria-hidden="true" />
                      100%
                    </span>
                  ) : saved.status === "missing" ? (
                    t("settings.tr.status.missing")
                  ) : (
                    `${saved.percent}%`
                  )}
                </span>
                {unsaved && (
                  <>
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-highlight)]" />
                    <span className="sr-only">{t("settings.nav.unsaved")}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Progress + field navigation */}
      <div className="flex-none border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="grid min-w-[12rem] flex-1 gap-1.5">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]" aria-live="polite">
              {t("settings.tr.editor.progress", { name: langName, done: progress.done, total: progress.total })}
              {progress.missing > 0 && <span className="font-medium text-[var(--status-warning-fg)]"> · {t("settings.tr.editor.left", { count: progress.missing })}</span>}
              {progress.review > 0 && <span className="font-medium text-[var(--text-muted)]"> · {t("settings.tr.editor.toReview", { count: progress.review })}</span>}
            </span>
            <CoverageBar percent={Math.round((progress.done / progress.total) * 100)} size="sm" />
          </div>
          <div className="flex items-center gap-1.5">
            <AdminButton variant="outline" size="sm" iconLeft={ChevronUp} disabled={gapKeys.length === 0} onClick={() => jump(-1)}>
              {t("settings.tr.editor.prev")}
            </AdminButton>
            <AdminButton variant="outline" size="sm" iconLeft={ChevronDown} disabled={gapKeys.length === 0} onClick={() => jump(1)}>
              {t("settings.tr.editor.next")}
            </AdminButton>
          </div>
        </div>
        <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0" aria-label={t("settings.tr.editor.fields")}>
          {item.fields.map((f) => {
            const s = stateOf(f.key);
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => fieldRefs.current[f.key]?.focus()}
                  className={clsx(
                    "inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[11px] font-semibold transition-colors",
                    focusRing,
                    s === "missing"
                      ? "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                      : s === "outdated"
                        ? "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-body)]"
                        : "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
                  )}
                >
                  {s === "missing" ? <CircleDashed size={11} aria-hidden="true" /> : s === "outdated" ? <History size={11} aria-hidden="true" /> : <Check size={11} strokeWidth={2.6} aria-hidden="true" />}
                  {t(`settings.tr.field.${f.key}`)}
                  <span className="sr-only"> — {t(`settings.tr.fieldState.${s}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <SheetBody>
        {complete ? (
          <p className="m-0 flex items-center gap-2 rounded-[var(--admin-radius)] bg-[var(--status-success-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--status-success-fg)]">
            <CheckCheck size={18} aria-hidden="true" />
            {t("settings.tr.editor.alreadyComplete", { name: langName })}
          </p>
        ) : (
          <div className="grid gap-4">
            {progress.review > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-[length:var(--text-caption)] text-[var(--text-body)]">
                {t("settings.tr.editor.reviewMany", { count: progress.review })}
                <AdminButton variant="outline" size="sm" iconLeft={CheckCheck} onClick={confirmAllReviews}>
                  {t("settings.tr.editor.confirmAll")}
                </AdminButton>
              </div>
            )}
            {item.fields.map((f) => {
              const s = stateOf(f.key);
              const value = draft[f.key]?.value ?? "";
              const inputId = `tr-${item.id}-${lang}-${f.key}`;
              const needed = (f.source.match(PLACEHOLDER) ?? []).filter((ph) => value.trim() && !value.includes(ph));
              const Field = f.multiline ? "textarea" : "input";
              return (
                <section
                  key={f.key}
                  aria-labelledby={`${inputId}-label`}
                  className={clsx(
                    "grid gap-3 rounded-[var(--admin-radius)] border p-4 transition-[border-color,background-color] duration-[var(--duration-normal)]",
                    s === "missing"
                      ? "border-[var(--gt-amber-400)] bg-[linear-gradient(90deg,var(--status-warning-bg),var(--admin-panel)_55%)] shadow-[inset_3px_0_0_var(--gt-amber-400)]"
                      : s === "outdated"
                        ? "border-[var(--border-default)] shadow-[inset_3px_0_0_var(--gt-ink-400)]"
                        : "border-[var(--border-subtle)]",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`${inputId}-label`} className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
                      {t(`settings.tr.field.${f.key}`)}
                    </h3>
                    <FieldStateBadge state={s} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid content-start gap-1.5">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                        <span aria-hidden="true">{langFlag("en")}</span>
                        {t("settings.tr.editor.original")}
                      </span>
                      <p lang="en" className="m-0 whitespace-pre-wrap rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
                        {f.source}
                      </p>
                    </div>
                    <div className="grid content-start gap-1.5">
                      <label htmlFor={inputId} className="flex items-center justify-between gap-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true">{langFlag(lang)}</span>
                          {langName}
                        </span>
                        <span className="font-medium normal-case tracking-normal tabular-nums text-[var(--text-subtle)]">
                          {value.length} / {f.source.length}
                        </span>
                      </label>
                      <Field
                        id={inputId}
                        ref={(el: HTMLTextAreaElement | HTMLInputElement | null) => {
                          fieldRefs.current[f.key] = el;
                        }}
                        lang={lang}
                        data-autofocus={f.key === firstGap ? "" : undefined}
                        value={value}
                        rows={f.multiline ? 4 : undefined}
                        placeholder={t("settings.tr.editor.placeholder", { name: langName })}
                        aria-describedby={needed.length > 0 ? `${inputId}-ph` : undefined}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setValue(f.key, e.target.value)}
                        className={clsx("gt-admin-field", s === "missing" && "border-[var(--gt-amber-400)]")}
                      />
                      {needed.length > 0 && (
                        <p id={`${inputId}-ph`} className="m-0 flex items-start gap-1.5 text-[11px] font-medium text-[var(--status-warning-fg)]">
                          <TriangleAlert size={12} aria-hidden="true" className="mt-px flex-none" />
                          {t("settings.tr.editor.placeholders", { list: needed.join(", ") })}
                        </p>
                      )}
                      {s === "outdated" && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] px-2.5 py-2 text-[11px] text-[var(--text-body)]">
                          <span className="inline-flex items-center gap-1.5">
                            <History size={12} aria-hidden="true" />
                            {t("settings.tr.editor.outdated", { date: date(item.updatedAt) })}
                          </span>
                          <button
                            type="button"
                            onClick={() => confirmReview(f.key)}
                            className={clsx("inline-flex items-center gap-1 rounded-[4px] font-semibold text-[var(--text-primary)] underline underline-offset-2", focusRing)}
                          >
                            <Check size={12} aria-hidden="true" />
                            {t("settings.tr.editor.keep")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </SheetBody>

      <SheetFooter>
        {error ? (
          <span role="alert" className="mr-auto inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
            <CircleAlert size={14} aria-hidden="true" />
            {t("settings.tr.editor.failedInline")}
          </span>
        ) : (
          <span className="mr-auto hidden text-[length:var(--text-caption)] text-[var(--text-muted)] sm:inline">
            {dirty ? t("settings.tr.editor.unsaved", { count: dirtyLangs.length }) : t("settings.tr.editor.noChanges")}
          </span>
        )}
        <AdminButton variant="outline" onClick={() => guard(onClose)} disabled={saving != null}>
          {t("settings.ui.cancel")}
        </AdminButton>
        {nextRow && (
          <AdminButton variant="dark" iconRight={ArrowRight} loading={saving === "next"} disabled={saving === "close"} onClick={() => (dirty ? save("next") : onNavigate(nextRow.item.id, nextRow.langs[0]))}>
            {dirty ? t("settings.tr.editor.saveNext") : t("settings.tr.editor.skip")}
          </AdminButton>
        )}
        <AdminButton variant="primary" iconLeft={Save} loading={saving === "close"} disabled={!dirty || saving === "next"} onClick={() => save("close")}>
          {t("settings.tr.editor.save")}
        </AdminButton>
      </SheetFooter>

      <ConfirmationDialog
        open={confirmLeave != null}
        title={t("settings.tr.editor.leaveTitle")}
        body={t("settings.tr.editor.leaveBody")}
        confirmLabel={t("settings.tr.editor.leaveConfirm")}
        cancelLabel={t("settings.tr.editor.leaveCancel")}
        tone="danger"
        onCancel={() => setConfirmLeave(null)}
        onConfirm={() => {
          const action = confirmLeave;
          setConfirmLeave(null);
          action?.();
        }}
      />
    </>
  );
}

function FieldStateBadge({ state }: { state: "missing" | "outdated" | "translated" }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded-[var(--radius-pill)] border px-2 text-[11px] font-semibold",
        state === "missing"
          ? "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
          : state === "outdated"
            ? "border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-body)]"
            : "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
      )}
    >
      {state === "missing" ? <CircleDashed size={12} aria-hidden="true" /> : state === "outdated" ? <History size={12} aria-hidden="true" /> : <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
      {t(`settings.tr.fieldState.${state}`)}
    </span>
  );
}
