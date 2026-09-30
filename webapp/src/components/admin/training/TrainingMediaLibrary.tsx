import { useId, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, GraduationCap, ImagePlus, Images, Search, Trash2, TriangleAlert, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { AdminSelect } from "../AdminSelect";
import { useAdminTraining } from "../../../lib/adminTraining";
import { useFocusTrap } from "../../../lib/useFocusTrap";
import { useTrainingMedia } from "../../../lib/trainingMedia";
import {
  ACCEPTED_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_CATEGORIES,
  filterMedia,
  formatBytes,
  mediaUsage,
  type MediaCategory,
  type UploadRejection,
  type TrainingMedia,
  type UsageFilter,
} from "../../../lib/trainingMediaRules";
import { formatDate } from "../../../lib/format";

/**
 * The training image library: the course editor's own media collection.
 *
 * Opened from any image field of the course editor — an image block, a module
 * cover, a video thumbnail, a question illustration — to upload (button or
 * drag and drop), search, filter, inspect, describe, delete and finally insert
 * an image. It never lists product photographs, and says so in its header:
 * training material and shop media are different collections.
 *
 * The grid is a radio group: one image is selected at a time, which is what
 * arrow keys then move. Selection shows as a ring, a tick and the details
 * panel, never as a colour alone. An image used in a course cannot be deleted;
 * the panel says where the problem is instead of breaking a lesson.
 */
export function TrainingMediaLibrary({
  initialSrc,
  onInsert,
  onClose,
}: {
  initialSrc?: string;
  onInsert: (media: TrainingMedia) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const { courses } = useAdminTraining();
  const { items, pending, upload, updateMedia, deleteMedia, findBySrc } = useTrainingMedia();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MediaCategory | "all">("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() => (initialSrc ? findBySrc(initialSrc)?.id ?? null : null));
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<{ name: string; reason: UploadRejection }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const usage = useMemo(() => mediaUsage(courses), [courses]);
  const visible = useMemo(
    () => filterMedia(items, { query, category, usage: usageFilter }, usage, lang),
    [items, query, category, usageFilter, usage, lang],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const filtered = query !== "" || category !== "all" || usageFilter !== "all";

  const select = (id: string) => {
    setSelectedId(id);
    setConfirmDelete(false);
  };

  const receive = async (files: File[]) => {
    if (files.length === 0) return;
    const result = await upload(files, category === "all" ? "technique" : category);
    setRejected(result.rejected);
    if (result.added[0]) {
      setUsageFilter("all");
      setQuery("");
      select(result.added[0].id);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void receive(Array.from(event.dataTransfer.files));
  };

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setUsageFilter("all");
  };

  const openPicker = () => fileInput.current?.click();

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center p-0 sm:p-4">
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={onClose} className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.46)]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={onDrop}
        className="gt-admin gt-admin-dialog relative grid h-full w-full max-w-[1120px] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-[var(--admin-panel)] shadow-[var(--shadow-lg)] sm:h-[min(800px,94vh)] sm:rounded-[var(--admin-radius)]"
      >
        {/* Header */}
        <header className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
            <Images size={19} strokeWidth={2} />
          </span>
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-[length:var(--text-h4)]">
                {t("trainingMedia.title")}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-emerald-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--accent-cta-ink)]">
                <GraduationCap size={11} aria-hidden="true" />
                {t("trainingMedia.badge")}
              </span>
            </div>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("trainingMedia.subtitle")}</p>
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

        {/* Toolbar */}
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
            <div className="w-[190px]">
              <AdminSelect
                aria-label={t("trainingMedia.usageFilter")}
                value={usageFilter}
                onChange={(e) => setUsageFilter(e.target.value as UsageFilter)}
                options={[
                  { value: "all", label: t("trainingMedia.usage.all") },
                  { value: "unused", label: t("trainingMedia.usage.unused") },
                  { value: "uploads", label: t("trainingMedia.usage.uploads") },
                ]}
              />
            </div>
            <AdminButton variant="primary" iconLeft={UploadCloud} onClick={openPicker}>
              {t("trainingMedia.upload")}
            </AdminButton>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void receive(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
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

        {/* Body */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-1">
          <div className="gt-admin-scroll relative min-h-0 overflow-y-auto p-5">
            {rejected.length > 0 && (
              <div role="alert" className="mb-4 grid gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
                <strong className="flex items-center gap-1.5">
                  <TriangleAlert size={13} aria-hidden="true" />
                  {t("trainingMedia.rejectedTitle", { count: rejected.length })}
                </strong>
                <ul className="m-0 grid list-none gap-0.5 p-0">
                  {rejected.map((r) => (
                    <li key={r.name}>
                      {r.name} — {t(`trainingMedia.rejected.${r.reason}`, { max: formatBytes(MAX_UPLOAD_BYTES, lang) })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {items.length === 0 && pending.length === 0 ? (
              <EmptyLibrary onUpload={openPicker} />
            ) : (
              <>
                {pending.length > 0 && (
                  <ul aria-label={t("trainingMedia.uploading")} className="m-0 mb-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
                    {pending.map((p) => (
                      <li key={p.id} className="grid gap-1.5">
                        <span className="relative block aspect-square overflow-hidden rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)]">
                          <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
                          <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,.7)]">
                            <span className="block h-full bg-[var(--accent-cta)] transition-[width]" style={{ width: `${p.progress}%` }} />
                          </span>
                        </span>
                        <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {t("trainingMedia.uploadingFile", { progress: p.progress })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {visible.length === 0 ? (
                  <div className="grid justify-items-center gap-3 py-16 text-center">
                    <Search size={26} aria-hidden="true" className="text-[var(--text-subtle)]" />
                    <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("trainingMedia.noMatch")}</p>
                    {filtered && (
                      <AdminButton variant="outline" size="sm" onClick={clearFilters}>
                        {t("trainingMedia.clearFilters")}
                      </AdminButton>
                    )}
                  </div>
                ) : (
                  <fieldset className="m-0 border-0 p-0">
                    <legend className="sr-only">{t("trainingMedia.gridLabel")}</legend>
                    <p className="m-0 mb-3 text-[length:var(--text-caption)] text-[var(--text-muted)]" aria-live="polite">
                      {t("trainingMedia.count", { count: visible.length })}
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {visible.map((item) => {
                        const isSelected = item.id === selectedId;
                        const used = usage.get(item.src) ?? 0;
                        return (
                          <label key={item.id} className="group grid cursor-pointer gap-1.5">
                            <input type="radio" name="training-media" checked={isSelected} onChange={() => select(item.id)} className="peer sr-only" />
                            <span
                              className={clsx(
                                "relative block aspect-square overflow-hidden rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] ring-offset-2 transition-shadow",
                                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus-ring)]",
                                isSelected ? "ring-[3px] ring-[var(--gt-emerald-500)]" : "ring-1 ring-[var(--border-subtle)] group-hover:ring-[var(--gt-ink-400)]",
                              )}
                            >
                              <img src={item.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                              {isSelected && (
                                <span aria-hidden="true" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--gt-emerald-500)] text-[var(--gt-white)] shadow-[var(--shadow-sm)]">
                                  <Check size={14} strokeWidth={3} />
                                </span>
                              )}
                              {used > 0 && (
                                <span className="absolute bottom-2 left-2 rounded-[var(--radius-pill)] bg-[rgba(17,17,17,.72)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gt-white)]">
                                  {t("trainingMedia.inUse", { count: used })}
                                </span>
                              )}
                              {item.origin === "upload" && (
                                <span className="absolute left-2 top-2 rounded-[var(--radius-pill)] bg-[var(--gt-white)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)]">
                                  {t("trainingMedia.new")}
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
              </>
            )}

            {dragging && (
              <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-[var(--admin-radius)] border-2 border-dashed border-[var(--gt-emerald-500)] bg-[rgba(228,249,240,.92)]">
                <span className="grid justify-items-center gap-2 text-center text-[var(--accent-cta-ink)]">
                  <UploadCloud size={32} aria-hidden="true" />
                  <strong>{t("trainingMedia.dropHere")}</strong>
                </span>
              </div>
            )}
          </div>

          <DetailsPanel
            media={selected}
            used={selected ? usage.get(selected.src) ?? 0 : 0}
            confirmDelete={confirmDelete}
            onAskDelete={() => setConfirmDelete(true)}
            onCancelDelete={() => setConfirmDelete(false)}
            onDelete={() => {
              if (!selected) return;
              deleteMedia(selected.id);
              setSelectedId(null);
              setConfirmDelete(false);
            }}
            onChange={(patch) => selected && updateMedia(selected.id, patch)}
          />
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3">
          <p className="m-0 min-w-0 truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {selected ? t("trainingMedia.selectedName", { name: selected.name }) : t("trainingMedia.noneSelected")}
          </p>
          <div className="flex gap-2">
            <AdminButton variant="outline" onClick={onClose}>
              {t("trainingMedia.cancel")}
            </AdminButton>
            <AdminButton variant="primary" iconLeft={ImagePlus} disabled={!selected} onClick={() => selected && onInsert(selected)}>
              {t("trainingMedia.insert")}
            </AdminButton>
          </div>
        </footer>
      </div>
    </div>
  );
}

function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid h-full min-h-[320px] place-items-center rounded-[var(--admin-radius)] border-2 border-dashed border-[var(--border-default)] p-8 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
          <Images size={26} aria-hidden="true" />
        </span>
        <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t("trainingMedia.emptyTitle")}</p>
        <p className="m-0 max-w-[40ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("trainingMedia.emptyBody")}</p>
        <AdminButton variant="primary" iconLeft={UploadCloud} onClick={onUpload}>
          {t("trainingMedia.emptyCta")}
        </AdminButton>
      </div>
    </div>
  );
}

function DetailsPanel({
  media,
  used,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onChange,
}: {
  media: TrainingMedia | null;
  used: number;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onChange: (patch: Partial<Pick<TrainingMedia, "name" | "alt" | "category" | "tags">>) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ids = { name: useId(), altFr: useId(), altEn: useId(), tags: useId(), category: useId() };

  if (!media) {
    return (
      <aside className="hidden border-l border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-5 md:grid md:place-items-center">
        <p className="m-0 max-w-[24ch] text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("trainingMedia.detailsEmpty")}</p>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("trainingMedia.details")}
      className="gt-admin-scroll grid max-h-[40vh] content-start gap-3 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4 md:max-h-none md:border-l md:border-t-0 md:p-5"
    >
      <img src={media.src} alt="" className="aspect-[4/3] w-full rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] object-contain max-md:hidden" />
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--text-caption)]">
        <dt className="text-[var(--text-muted)]">{t("trainingMedia.meta.size")}</dt>
        <dd className="m-0 tabular-nums text-[var(--text-primary)]">
          {media.width > 0 ? `${media.width} × ${media.height} px · ` : ""}
          {formatBytes(media.bytes, lang)}
        </dd>
        <dt className="text-[var(--text-muted)]">{t("trainingMedia.meta.added")}</dt>
        <dd className="m-0 text-[var(--text-primary)]">{formatDate(media.createdAt.slice(0, 10))}</dd>
        <dt className="text-[var(--text-muted)]">{t("trainingMedia.meta.usage")}</dt>
        <dd className="m-0 text-[var(--text-primary)]">{used > 0 ? t("trainingMedia.usedIn", { count: used }) : t("trainingMedia.notUsed")}</dd>
      </dl>

      <Field id={ids.name} label={t("trainingMedia.fields.name")}>
        <input id={ids.name} type="text" className="gt-admin-field" value={media.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field id={ids.category} label={t("trainingMedia.fields.category")}>
        <AdminSelect
          id={ids.category}
          value={media.category}
          onChange={(e) => onChange({ category: e.target.value as MediaCategory })}
          options={MEDIA_CATEGORIES.map((value) => ({ value, label: t(`trainingMedia.category.${value}`) }))}
        />
      </Field>
      <Field id={ids.altFr} label={t("trainingMedia.fields.altFr")} hint={t("trainingMedia.fields.altHint")}>
        <input id={ids.altFr} type="text" className="gt-admin-field" value={media.alt.fr} onChange={(e) => onChange({ alt: { ...media.alt, fr: e.target.value } })} />
      </Field>
      <Field id={ids.altEn} label={t("trainingMedia.fields.altEn")}>
        <input id={ids.altEn} type="text" className="gt-admin-field" value={media.alt.en} onChange={(e) => onChange({ alt: { ...media.alt, en: e.target.value } })} />
      </Field>
      <Field id={ids.tags} label={t("trainingMedia.fields.tags")} hint={t("trainingMedia.fields.tagsHint")}>
        <input
          id={ids.tags}
          type="text"
          className="gt-admin-field"
          defaultValue={media.tags.join(", ")}
          key={media.id}
          onBlur={(e) => onChange({ tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
        />
      </Field>

      <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-3">
        {used > 0 ? (
          <p className="m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("trainingMedia.deleteBlocked", { count: used })}
          </p>
        ) : confirmDelete ? (
          <div role="alert" className="grid gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
            <strong>{t("trainingMedia.deleteConfirm")}</strong>
            <div className="flex gap-2">
              <AdminButton size="sm" variant="danger" iconLeft={Trash2} onClick={onDelete}>
                {t("trainingMedia.delete")}
              </AdminButton>
              <AdminButton size="sm" variant="outline" onClick={onCancelDelete}>
                {t("trainingMedia.cancel")}
              </AdminButton>
            </div>
          </div>
        ) : (
          <AdminButton
            size="sm"
            variant="ghost"
            iconLeft={Trash2}
            onClick={onAskDelete}
            className="justify-self-start text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
          >
            {t("trainingMedia.delete")}
          </AdminButton>
        )}
      </div>
    </aside>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
    </div>
  );
}
