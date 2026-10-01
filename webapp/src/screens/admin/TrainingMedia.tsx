"use client";

import { useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Images, Save, Search, Trash2, TriangleAlert, UploadCloud } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminSelect } from "../../components/admin/AdminSelect";
import { MediaThumb } from "../../components/admin/training/MediaThumb";
import { useAdminTraining } from "../../lib/adminTraining";
import { useFormat } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { useTrainingMedia, type RejectedUpload } from "../../lib/trainingMedia";
import {
  ACCEPTED_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_CATEGORIES,
  filterMedia,
  formatBytes,
  mediaUsage,
  type MediaCategory,
  type MediaKind,
  type TrainingMedia as Media,
  type UsageFilter,
} from "../../lib/trainingMediaRules";
import { secondsToClock } from "../../lib/adminTrainingMapping";
import { useAdminShell } from "./AdminLayout";

/**
 * The training media library: the course editor's images and videos, managed
 * on their own screen (owner's decision, 2026-10-01) — upload (button or drag
 * and drop), find, describe, delete. The course builder only picks from it.
 *
 * Videos go to the private bucket through resumable uploads; the size limit
 * shown is the plan's (50 MB per file on the free plan).
 *
 * A file used by a course cannot be deleted: the panel says where the problem
 * is, and the database refuses it anyway.
 */
export function TrainingMedia() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { courses } = useAdminTraining();
  const { items, loading, loadFailed, reload, pending, upload, updateMedia, deleteMedia } = useTrainingMedia();
  const fileInput = useRef<HTMLInputElement>(null);
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [category, setCategory] = useState<MediaCategory | "all">("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<RejectedUpload[]>([]);

  const usage = useMemo(() => mediaUsage(courses), [courses]);
  const visible = useMemo(
    () => filterMedia(items, { query, category, usage: usageFilter, kind }, usage, lang),
    [items, query, category, usageFilter, kind, usage, lang],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const filtered = query !== "" || category !== "all" || usageFilter !== "all" || kind !== "all";

  const receive = async (files: File[]) => {
    if (files.length === 0) return;
    const result = await upload(files, category === "all" ? "technique" : category);
    setRejected(result.rejected);
    if (result.added.length > 0) {
      setUsageFilter("all");
      setQuery("");
      setSelectedId(result.added[0].id);
      showToast(t("trainingMedia.toasts.uploaded", { count: result.added.length }));
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void receive(Array.from(event.dataTransfer.files));
  };

  const clearFilters = () => {
    setQuery("");
    setKind("all");
    setCategory("all");
    setUsageFilter("all");
  };

  const openPicker = () => fileInput.current?.click();

  return (
    <>
      <AdminHeader
        title={t("trainingMedia.page.title")}
        description={t("trainingMedia.page.description")}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.training"), to: "/admin/formations" },
          { label: t("trainingMedia.page.crumb") },
        ]}
        onOpenNav={openNav}
        actions={
          <AdminButton variant="primary" iconLeft={UploadCloud} onClick={openPicker}>
            {t("trainingMedia.upload")}
          </AdminButton>
        }
      />
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

      <div
        className="relative grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("trainingMedia.page.limits", { image: formatBytes(MAX_IMAGE_BYTES, lang), video: formatBytes(MAX_VIDEO_BYTES, lang) })}
        </p>

        <div className="gt-admin-panel grid gap-3 p-3">
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
            <div className="w-[160px]">
              <AdminSelect
                aria-label={t("trainingMedia.kindFilter")}
                value={kind}
                onChange={(e) => setKind(e.target.value as MediaKind | "all")}
                options={[
                  { value: "all", label: t("trainingMedia.kind.all") },
                  { value: "image", label: t("trainingMedia.kind.image") },
                  { value: "video", label: t("trainingMedia.kind.video") },
                ]}
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

        {rejected.length > 0 && (
          <div role="alert" className="grid gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
            <strong className="flex items-center gap-1.5">
              <TriangleAlert size={13} aria-hidden="true" />
              {t("trainingMedia.rejectedTitle", { count: rejected.length })}
            </strong>
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {rejected.map((r) => (
                <li key={r.name}>
                  {r.name} — {t(`trainingMedia.rejected.${r.reason}`, { max: formatBytes(r.reason === "videoSize" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES, lang) })}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label={t("trainingMedia.gridLabel")} className="gt-admin-panel relative min-h-[320px] p-4">
            {loadFailed ? (
              <div role="alert" className="grid justify-items-center gap-3 py-16 text-center">
                <TriangleAlert size={26} aria-hidden="true" className="text-[var(--status-error-fg)]" />
                <p className="m-0 font-semibold">{t("trainingMedia.loadFailed")}</p>
                <AdminButton variant="outline" size="sm" onClick={reload}>
                  {t("trainingMedia.retry")}
                </AdminButton>
              </div>
            ) : loading && items.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
                {Array.from({ length: 8 }).map((_, index) => (
                  <span key={index} className="gt-skeleton block aspect-square rounded-[var(--admin-radius-sm)]" />
                ))}
              </div>
            ) : items.length === 0 && pending.length === 0 ? (
              <EmptyLibrary onUpload={openPicker} />
            ) : (
              <>
                {pending.length > 0 && (
                  <ul aria-label={t("trainingMedia.uploading")} className="m-0 mb-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4">
                    {pending.map((p) => (
                      <li key={p.id} className="grid gap-1.5">
                        <span className="relative block aspect-square overflow-hidden rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)]">
                          {p.kind === "image" && <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />}
                          <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,.7)]">
                            <span className="block h-full bg-[var(--accent-cta)] transition-[width]" style={{ width: `${p.progress}%` }} />
                          </span>
                        </span>
                        <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {p.name} — {t("trainingMedia.uploadingFile", { progress: p.progress })}
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
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {visible.map((item) => {
                        const isSelected = item.id === selectedId;
                        const used = usage.get(item.ref) ?? 0;
                        return (
                          <label key={item.id} className="group grid cursor-pointer gap-1.5">
                            <input type="radio" name="training-media" checked={isSelected} onChange={() => setSelectedId(item.id)} className="peer sr-only" />
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
                              <span className="sr-only">
                                {" "}— {t(`trainingMedia.kind.${item.kind}`)}
                                {isSelected ? `, ${t("trainingMedia.selected")}` : ""}
                              </span>
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
          </section>

          <DetailsPanel
            key={selected?.id ?? "none"}
            media={selected}
            used={selected ? usage.get(selected.ref) ?? 0 : 0}
            onSave={async (patch) => {
              if (!selected) return;
              try {
                await updateMedia(selected.id, patch);
                showToast(t("trainingMedia.toasts.saved"));
              } catch {
                showToast(t("trainingMedia.toasts.saveFailed"), undefined, "error");
              }
            }}
            onDelete={async () => {
              if (!selected) return;
              try {
                const outcome = await deleteMedia(selected.id);
                if (outcome === "inUse") {
                  showToast(t("trainingMedia.toasts.inUse"), undefined, "warning");
                  return;
                }
                setSelectedId(null);
                showToast(t("trainingMedia.toasts.deleted"), undefined, "info");
              } catch {
                showToast(t("trainingMedia.toasts.deleteFailed"), undefined, "error");
              }
            }}
          />
        </div>
      </div>
    </>
  );
}

function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid h-full min-h-[300px] place-items-center rounded-[var(--admin-radius)] border-2 border-dashed border-[var(--border-default)] p-8 text-center">
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

type DraftPatch = Pick<Media, "name" | "alt" | "category" | "tags">;

/** The selected file: preview, facts, description (saved explicitly) and deletion. */
function DetailsPanel({
  media,
  used,
  onSave,
  onDelete,
}: {
  media: Media | null;
  used: number;
  onSave: (patch: DraftPatch) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { formatDate } = useFormat();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ids = { name: useId(), altFr: useId(), altEn: useId(), tags: useId(), category: useId() };
  const [draft, setDraft] = useState<DraftPatch | null>(() =>
    media ? { name: media.name, alt: { ...media.alt }, category: media.category, tags: media.tags } : null,
  );
  const [tagsText, setTagsText] = useState(media?.tags.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);


  if (!media || !draft) {
    return (
      <aside className="gt-admin-panel hidden p-5 text-center lg:grid lg:min-h-[320px] lg:place-items-center">
        <p className="m-0 max-w-[24ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("trainingMedia.detailsEmpty")}</p>
      </aside>
    );
  }

  const tags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
  const changed =
    draft.name !== media.name ||
    draft.alt.fr !== media.alt.fr ||
    draft.alt.en !== media.alt.en ||
    draft.category !== media.category ||
    tags.join("|") !== media.tags.join("|");

  return (
    <aside aria-label={t("trainingMedia.details")} className="gt-admin-panel grid content-start gap-3 p-4 lg:sticky lg:top-[calc(var(--admin-header-h)+16px)]">
      {media.kind === "video" && media.src ? (
        <video src={media.src} controls preload="metadata" playsInline className="aspect-video w-full rounded-[var(--admin-radius-sm)] bg-[var(--gt-ink-900)]">
          <track kind="captions" />
        </video>
      ) : (
        <MediaThumb media={media} className="aspect-[4/3] w-full overflow-hidden rounded-[var(--admin-radius-sm)] object-contain" />
      )}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--text-caption)]">
        <dt className="text-[var(--text-muted)]">{t("trainingMedia.meta.kind")}</dt>
        <dd className="m-0 text-[var(--text-primary)]">
          {t(`trainingMedia.kind.${media.kind}`)}
          {media.durationSeconds !== null ? ` · ${secondsToClock(media.durationSeconds)}` : ""}
        </dd>
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
        <input id={ids.name} type="text" maxLength={200} className="gt-admin-field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <Field id={ids.category} label={t("trainingMedia.fields.category")}>
        <AdminSelect
          id={ids.category}
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value as MediaCategory })}
          options={MEDIA_CATEGORIES.map((value) => ({ value, label: t(`trainingMedia.category.${value}`) }))}
        />
      </Field>
      <Field id={ids.altFr} label={t("trainingMedia.fields.altFr")} hint={t("trainingMedia.fields.altHint")}>
        <input id={ids.altFr} type="text" maxLength={500} className="gt-admin-field" value={draft.alt.fr} onChange={(e) => setDraft({ ...draft, alt: { ...draft.alt, fr: e.target.value } })} />
      </Field>
      <Field id={ids.altEn} label={t("trainingMedia.fields.altEn")}>
        <input id={ids.altEn} type="text" maxLength={500} className="gt-admin-field" value={draft.alt.en} onChange={(e) => setDraft({ ...draft, alt: { ...draft.alt, en: e.target.value } })} />
      </Field>
      <Field id={ids.tags} label={t("trainingMedia.fields.tags")} hint={t("trainingMedia.fields.tagsHint")}>
        <input id={ids.tags} type="text" className="gt-admin-field" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
      </Field>

      <AdminButton
        variant="primary"
        size="sm"
        iconLeft={Save}
        disabled={!changed || draft.name.trim() === ""}
        loading={busy}
        className="justify-self-start"
        onClick={async () => {
          setBusy(true);
          await onSave({ ...draft, tags });
          setBusy(false);
        }}
      >
        {t("trainingMedia.save")}
      </AdminButton>

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
              <AdminButton
                size="sm"
                variant="danger"
                iconLeft={Trash2}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await onDelete();
                  setBusy(false);
                  setConfirmDelete(false);
                }}
              >
                {t("trainingMedia.delete")}
              </AdminButton>
              <AdminButton size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                {t("trainingMedia.cancel")}
              </AdminButton>
            </div>
          </div>
        ) : (
          <AdminButton
            size="sm"
            variant="ghost"
            iconLeft={Trash2}
            onClick={() => setConfirmDelete(true)}
            className="justify-self-start text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
          >
            {t("trainingMedia.delete")}
          </AdminButton>
        )}
      </div>
    </aside>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
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
