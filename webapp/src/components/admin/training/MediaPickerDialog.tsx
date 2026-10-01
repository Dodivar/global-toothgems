import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, ImagePlus, RefreshCw, Search, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { MediaThumb } from "./MediaThumb";
import { useAdminTraining } from "../../../lib/adminTraining";
import { useFocusTrap } from "../../../lib/useFocusTrap";
import { useTrainingMedia } from "../../../lib/trainingMedia";
import { MEDIA_CATEGORIES, filterMedia, mediaUsage, type MediaCategory, type MediaKind, type TrainingMedia } from "../../../lib/trainingMediaRules";

/** Where the library is managed (`app/admin/(staff)/formations/medias`). */
export const MEDIA_LIBRARY_PATH = "/admin/formations/medias";

/**
 * Choosing a file for a course field.
 *
 * Select only: uploading, describing and deleting happen on the library's own
 * screen (owner's decision, 2026-10-01). The link opens it in a new tab so the
 * course being edited — and its unsaved changes — stays where it is; "Refresh"
 * then brings in what was added there.
 *
 * The grid is a radio group: one file is selected at a time, which arrow keys
 * then move. Selection shows as a ring, a tick and the footer text, never as a
 * colour alone.
 */
export function MediaPickerDialog({
  kind,
  initialRef,
  onInsert,
  onClose,
}: {
  kind: MediaKind;
  initialRef?: string;
  onInsert: (media: TrainingMedia) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const { courses } = useAdminTraining();
  const { items, loading, reload, findByRef } = useTrainingMedia();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const titleId = useId();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MediaCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(() => (initialRef ? findByRef(initialRef)?.id ?? null : null));

  const usage = useMemo(() => mediaUsage(courses), [courses]);
  const visible = useMemo(
    () => filterMedia(items, { query, category, usage: "all", kind }, usage, lang),
    [items, query, category, kind, usage, lang],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const hasAny = items.some((item) => item.kind === kind);

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center p-0 sm:p-4">
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={onClose} className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.46)]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="gt-admin gt-admin-dialog relative grid h-full w-full max-w-[980px] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-[var(--admin-panel)] shadow-[var(--shadow-lg)] sm:h-[min(760px,92vh)] sm:rounded-[var(--admin-radius)]"
      >
        <header className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 id={titleId} className="text-[length:var(--text-h4)]">
              {t(kind === "video" ? "trainingMedia.picker.titleVideo" : "trainingMedia.picker.titleImage")}
            </h2>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("trainingMedia.picker.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("trainingMedia.close")}
            className="grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <label htmlFor={searchId} className="sr-only">
                {t("trainingMedia.search")}
              </label>
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("trainingMedia.searchPlaceholder")}
                className="gt-admin-field pl-9"
              />
            </div>
            <AdminButton variant="outline" iconLeft={RefreshCw} onClick={reload} loading={loading}>
              {t("trainingMedia.picker.refresh")}
            </AdminButton>
            <a
              href={MEDIA_LIBRARY_PATH}
              target="_blank"
              rel="noopener"
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--admin-radius-sm)] px-3 text-[length:var(--text-caption)] font-semibold text-[var(--accent-cta-ink)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <ExternalLink size={14} aria-hidden="true" />
              {t("trainingMedia.picker.manage")}
              <span className="sr-only"> {t("trainingMedia.picker.newTab")}</span>
            </a>
          </div>
          <div role="group" aria-label={t("trainingMedia.categoryFilter")} className="gt-scroller -mx-1 flex gap-1.5 px-1">
            {(["all", ...MEDIA_CATEGORIES] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={clsx(
                  "inline-flex h-8 flex-none items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors",
                  category === value
                    ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                    : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:border-[var(--gt-ink-400)]",
                )}
              >
                {category === value && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                {t(`trainingMedia.category.${value}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="gt-admin-scroll min-h-0 overflow-y-auto p-5">
          {loading && items.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
              {Array.from({ length: 10 }).map((_, index) => (
                <span key={index} className="gt-skeleton block aspect-square rounded-[var(--admin-radius-sm)]" />
              ))}
            </div>
          ) : !hasAny ? (
            <div className="grid justify-items-center gap-3 py-16 text-center">
              <ImagePlus size={28} aria-hidden="true" className="text-[var(--text-subtle)]" />
              <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(kind === "video" ? "trainingMedia.picker.emptyVideo" : "trainingMedia.picker.emptyImage")}
              </p>
              <p className="m-0 max-w-[44ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("trainingMedia.picker.emptyBody")}</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="m-0 py-16 text-center text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("trainingMedia.noMatch")}</p>
          ) : (
            <fieldset className="m-0 border-0 p-0">
              <legend className="sr-only">{t("trainingMedia.gridLabel")}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {visible.map((item) => {
                  const isSelected = item.id === selectedId;
                  return (
                    <label key={item.id} className="group grid cursor-pointer gap-1.5">
                      <input type="radio" name="training-media-pick" checked={isSelected} onChange={() => setSelectedId(item.id)} className="peer sr-only" />
                      <span
                        className={clsx(
                          "relative block aspect-square overflow-hidden rounded-[var(--admin-radius-sm)] ring-offset-2 transition-shadow",
                          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus-ring)]",
                          isSelected ? "ring-[3px] ring-[var(--gt-emerald-500)]" : "ring-1 ring-[var(--border-subtle)] group-hover:ring-[var(--gt-ink-400)]",
                        )}
                      >
                        <MediaThumb media={item} className="h-full w-full" />
                        {isSelected && (
                          <span aria-hidden="true" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--gt-emerald-500)] text-[var(--gt-white)] shadow-[var(--shadow-sm)]">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span className={clsx("truncate text-[length:var(--text-caption)]", isSelected ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-body)]")}>
                        {item.name}
                        {isSelected && <span className="sr-only"> — {t("trainingMedia.selected")}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3">
          <p className="m-0 min-w-0 truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {selected ? t("trainingMedia.selectedName", { name: selected.name }) : t("trainingMedia.noneSelected")}
          </p>
          <div className="flex gap-2">
            <AdminButton variant="outline" onClick={onClose}>
              {t("trainingMedia.cancel")}
            </AdminButton>
            <AdminButton variant="primary" iconLeft={ImagePlus} disabled={!selected} onClick={() => selected && onInsert(selected)}>
              {t(kind === "video" ? "trainingMedia.insertVideo" : "trainingMedia.insert")}
            </AdminButton>
          </div>
        </footer>
      </div>
    </div>
  );
}
