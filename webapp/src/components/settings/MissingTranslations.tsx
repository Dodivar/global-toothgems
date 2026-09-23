import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { FilterX, Languages, PartyPopper, PenLine, Search, SearchX } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { EmptyState } from "../admin/EmptyState";
import { useAdminSettings } from "../../lib/adminSettings";
import { itemProgress, missingRows, TR_SORTS, type TrFilters, type TrRow, type TrSort, type TrStatusFilter } from "../../lib/settingsRules";
import { TR_CONTENT_TYPES, type TrContentType } from "../../data/adminTranslations";
import { AREA_ICON, PriorityLabel, TrStatusBadge, useShortDate } from "./translationMeta";
import { TranslationEditor } from "./TranslationEditor";
import { CoverageBar, SettingsCard, focusRing } from "./SettingsUi";

/**
 * "What's missing, and where do I fix it?"
 *
 * A summary that doubles as a set of filters (by type, by language), a
 * searchable list, and on every row the one action that matters: Edit
 * translation. Filters live in the query string, so the list survives opening
 * the editor, saving and coming back — the loop the page is built around:
 * see what is missing → open it → translate → save → back to the list.
 */

export const MISSING_LIST_ID = "missing-translations";

function readFilters(p: URLSearchParams, targets: string[]): TrFilters {
  const lang = p.get("tr_lang") ?? "all";
  const type = p.get("tr_type") ?? "all";
  const status = p.get("tr_status") ?? "all";
  const sort = p.get("tr_sort") ?? "priority";
  return {
    query: p.get("tr_q") ?? "",
    lang: lang === "all" || targets.includes(lang) ? lang : "all",
    type: (TR_CONTENT_TYPES as string[]).includes(type) ? (type as TrContentType) : "all",
    status: ["missing", "partial", "outdated"].includes(status) ? (status as TrStatusFilter) : "all",
    sort: (TR_SORTS as string[]).includes(sort) ? (sort as TrSort) : "priority",
  };
}

export function MissingTranslations({ targets, untracked }: { targets: string[]; untracked: string[] }) {
  const { t } = useTranslation();
  const { translations } = useAdminSettings();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params, targets);
  const date = useShortDate();

  const setFilter = (patch: Partial<Record<"tr_lang" | "tr_type" | "tr_status" | "tr_sort" | "tr_q", string>>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (!v || v === "all" || (k === "tr_sort" && v === "priority")) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const clear = () => setFilter({ tr_lang: "", tr_type: "", tr_status: "", tr_q: "", tr_sort: "" });
  const filtered = filters.lang !== "all" || filters.type !== "all" || filters.status !== "all" || filters.query.trim() !== "";

  const all = useMemo(() => missingRows(translations, targets, { ...filters, query: "", type: "all", status: "all", lang: "all" }), [translations, targets, filters]);
  const rows = useMemo(() => missingRows(translations, targets, filters), [translations, targets, filters]);

  const byType = TR_CONTENT_TYPES.map((type) => ({ type, count: all.filter((r) => r.item.type === type).length }));
  const byLang = targets.map((code) => ({
    code,
    count: translations.filter((it) => itemProgress(it, code).status !== "complete").length,
  }));

  const openEditor = (row: TrRow, lang?: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set("traduire", row.item.id);
      next.set("langue", lang ?? (filters.lang !== "all" ? filters.lang : row.langs[0]));
      return next;
    });

  const editorId = params.get("traduire");
  const editorItem = translations.find((it) => it.id === editorId);

  return (
    <SettingsCard
      id={MISSING_LIST_ID}
      icon={PenLine}
      tone="fuchsia"
      title={t("settings.tr.title")}
      description={t("settings.tr.description")}
      flush
    >
      <div tabIndex={-1} id={`${MISSING_LIST_ID}-anchor`} aria-label={t("settings.tr.title")} className="outline-none" />
      {/* Summary: every figure is also a filter. */}
      <div className="grid gap-4 px-5 pb-5 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-8">
        <div className="grid gap-0.5">
          <span className="text-[34px] font-bold leading-none tabular-nums text-[var(--text-primary)]">{all.length}</span>
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("settings.tr.itemsToTranslate", { count: all.length })}</span>
          <span className="text-[11px] text-[var(--text-muted)]">{t("settings.tr.fieldsToTranslate", { count: all.reduce((s, r) => s + r.gaps, 0) })}</span>
        </div>
        <div className="grid gap-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("settings.tr.byType")}>
            {byType.map(({ type, count }) => {
              const Icon = AREA_ICON[type];
              const on = filters.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  disabled={count === 0}
                  onClick={() => setFilter({ tr_type: on ? "" : type })}
                  className={clsx(
                    "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors disabled:opacity-40",
                    focusRing,
                    on
                      ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                      : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-primary)] hover:border-[var(--gt-ink-400)]",
                  )}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span className="tabular-nums">{count}</span> {t(`settings.tr.typePlural.${type}`, { count })}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("settings.tr.byLanguage")}>
            {byLang.map(({ code, count }) => {
              const on = filters.lang === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  disabled={count === 0}
                  onClick={() => setFilter({ tr_lang: on ? "" : code })}
                  className={clsx(
                    "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors disabled:opacity-40",
                    focusRing,
                    on
                      ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                      : "border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--text-primary)] hover:border-[var(--gt-blue-400)]",
                  )}
                >
                  <span aria-hidden="true">{langFlag(code)}</span>
                  {t(`settings.lang.names.${code}`)}
                  <span className="tabular-nums opacity-80">· {t("settings.tr.itemsShort", { count })}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {untracked.length > 0 && (
        <p className="mx-5 mb-4 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-warning-fg)] sm:mx-6">
          <Languages size={14} aria-hidden="true" className="mt-px flex-none" />
          {t("settings.tr.untracked", { names: untracked.map((c) => t(`settings.lang.names.${c}`)).join(", ") })}
        </p>
      )}

      {/* Toolbar */}
      <div className="grid gap-3 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3.5 sm:px-6 md:grid-cols-2 xl:grid-cols-[minmax(200px,1.4fr)_repeat(4,minmax(0,1fr))]">
        <label className="relative block md:col-span-2 xl:col-span-1">
          <span className="sr-only">{t("settings.tr.search")}</span>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilter({ tr_q: e.target.value })}
            placeholder={t("settings.tr.search")}
            className="gt-admin-field pl-9"
          />
        </label>
        <AdminSelect
          aria-label={t("settings.tr.filters.language")}
          value={filters.lang}
          onChange={(e) => setFilter({ tr_lang: e.target.value })}
          options={[{ value: "all", label: t("settings.tr.filters.allLanguages") }, ...targets.map((c) => ({ value: c, label: `${langFlag(c)}  ${t(`settings.lang.names.${c}`)}` }))]}
        />
        <AdminSelect
          aria-label={t("settings.tr.filters.type")}
          value={filters.type}
          onChange={(e) => setFilter({ tr_type: e.target.value })}
          options={[{ value: "all", label: t("settings.tr.filters.allTypes") }, ...TR_CONTENT_TYPES.map((c) => ({ value: c, label: t(`settings.tr.type.${c}`) }))]}
        />
        <AdminSelect
          aria-label={t("settings.tr.filters.status")}
          value={filters.status}
          onChange={(e) => setFilter({ tr_status: e.target.value })}
          options={[
            { value: "all", label: t("settings.tr.filters.allStatuses") },
            ...(["missing", "partial", "outdated"] as const).map((s) => ({ value: s, label: t(`settings.tr.status.${s}`) })),
          ]}
        />
        <AdminSelect
          aria-label={t("settings.tr.filters.sort")}
          value={filters.sort}
          onChange={(e) => setFilter({ tr_sort: e.target.value })}
          options={TR_SORTS.map((s) => ({ value: s, label: t(`settings.tr.sort.${s}`) }))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-2.5 sm:px-6">
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]" aria-live="polite">
          {t("settings.tr.showing", { shown: rows.length, total: all.length })}
        </p>
        {filtered && (
          <AdminButton variant="ghost" size="sm" iconLeft={FilterX} onClick={clear}>
            {t("settings.tr.clearFilters")}
          </AdminButton>
        )}
      </div>

      {all.length === 0 ? (
        <EmptyState icon={PartyPopper} title={t("settings.tr.allDone.title")} body={t("settings.tr.allDone.body")} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t("settings.tr.noMatch.title")}
          body={t("settings.tr.noMatch.body")}
          action={
            <AdminButton variant="outline" iconLeft={FilterX} onClick={clear}>
              {t("settings.tr.clearFilters")}
            </AdminButton>
          }
        />
      ) : (
        <>
          {/* Table from xl */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t("settings.tr.title")}</caption>
              <thead className="gt-admin-thead">
                <tr className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                  <th scope="col" className="px-6 py-2.5 font-semibold">{t("settings.tr.col.content")}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t("settings.tr.col.missing")}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t("settings.tr.col.status")}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t("settings.tr.col.progress")}</th>
                  <th scope="col" className="px-6 py-2.5 text-right font-semibold"><span className="sr-only">{t("settings.ui.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.item.id} className="gt-admin-row border-t border-[var(--border-subtle)] align-middle">
                    <th scope="row" className="min-w-[260px] px-6 py-3 font-normal">
                      <ContentCell row={row} updated={date(row.item.updatedAt)} />
                    </th>
                    <td className="px-3 py-3">
                      <LangChips row={row} onOpen={(l) => openEditor(row, l)} />
                    </td>
                    <td className="px-3 py-3">
                      <TrStatusBadge status={row.status} />
                    </td>
                    <td className="w-[120px] px-3 py-3">
                      <span className="grid gap-1">
                        <span className="text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-primary)]">{row.percent}%</span>
                        <CoverageBar percent={row.percent} size="sm" />
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <AdminButton variant="primary" size="sm" iconLeft={PenLine} onClick={() => openEditor(row)}>
                        {t("settings.tr.edit")}
                        <span className="sr-only"> — {row.item.name}</span>
                      </AdminButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below xl */}
          <ul className="m-0 grid list-none gap-0 p-0 xl:hidden">
            {rows.map((row) => (
              <li key={row.item.id} className="grid gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <ContentCell row={row} />
                  <TrStatusBadge status={row.status} />
                </div>
                <LangChips row={row} onOpen={(l) => openEditor(row, l)} />
                <div className="flex items-center gap-3">
                  <span className="grid flex-1 gap-1">
                    <span className="flex justify-between text-[11px] text-[var(--text-muted)]">
                      <span className="font-semibold tabular-nums text-[var(--text-primary)]">{row.percent}%</span>
                      <span>{t("settings.tr.updatedOn", { date: date(row.item.updatedAt) })}</span>
                    </span>
                    <CoverageBar percent={row.percent} size="sm" />
                  </span>
                  <AdminButton variant="primary" size="sm" iconLeft={PenLine} onClick={() => openEditor(row)}>
                    {t("settings.tr.edit")}
                    <span className="sr-only"> — {row.item.name}</span>
                  </AdminButton>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <TranslationEditor
        item={editorItem}
        lang={params.get("langue") ?? ""}
        targets={targets}
        rows={rows}
        onNavigate={(itemId, lang) =>
          setParams((p) => {
            const next = new URLSearchParams(p);
            next.set("traduire", itemId);
            next.set("langue", lang);
            return next;
          })
        }
        onClose={() =>
          setParams((p) => {
            const next = new URLSearchParams(p);
            next.delete("traduire");
            next.delete("langue");
            return next;
          })
        }
      />
    </SettingsCard>
  );
}

const FLAGS: Record<string, string> = { en: "🇬🇧", fr: "🇫🇷", it: "🇮🇹", de: "🇩🇪", es: "🇪🇸", pt: "🇵🇹", nl: "🇳🇱" };
export const langFlag = (code: string) => FLAGS[code] ?? "🏳️";

function ContentCell({ row, updated }: { row: TrRow; updated?: string }) {
  const { t } = useTranslation();
  const Icon = AREA_ICON[row.item.type];
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-[9px] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{row.item.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-body)]">{t(`settings.tr.type.${row.item.type}`)}</span>
          <span aria-hidden="true">·</span>
          <span>{row.item.context}</span>
          <span aria-hidden="true">·</span>
          <PriorityLabel priority={row.item.priority} />
          {updated && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t("settings.tr.updatedOn", { date: updated })}</span>
            </>
          )}
        </span>
      </span>
    </span>
  );
}

/** Each missing language is its own shortcut into the editor. */
function LangChips({ row, onOpen }: { row: TrRow; onOpen: (lang: string) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {row.langs.map((code) => {
        const p = itemProgress(row.item, code);
        const name = t(`settings.lang.names.${code}`);
        return (
          <li key={code}>
            <button
              type="button"
              onClick={() => onOpen(code)}
              aria-label={t("settings.tr.openIn", { name, item: row.item.name, done: p.done, total: p.total })}
              className={clsx(
                "inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[length:var(--text-caption)] font-semibold transition-colors hover:border-[var(--gt-ink-900)]",
                p.status === "missing"
                  ? "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                  : p.status === "outdated"
                    ? "border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-body)]"
                    : "border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]",
                focusRing,
              )}
            >
              <span aria-hidden="true">{langFlag(code)}</span>
              {name}
              <span className="tabular-nums font-medium opacity-80">
                {p.status === "missing" ? t("settings.tr.status.missing") : p.status === "outdated" ? t("settings.tr.status.outdated") : `${p.done}/${p.total}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
