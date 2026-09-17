import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Star, Trash2, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminIconButton } from "./AdminIconButton";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { useLocalized } from "../../lib/localized";
import { MEDIA_LIBRARY, mediaFromLibrary, type ProductImage } from "../../data/adminCatalog";
import { photo } from "../../lib/images";

/**
 * Media area of the product form.
 *
 * The prototype never uploads anything — the drop zone opens a picker over the
 * existing brand photography instead. It is drawn as a real drop zone on
 * purpose: this is the part of the form where the future administrator has to
 * recognise the workflow they will actually have, and a plain "choose an image"
 * button would not show it.
 *
 * Reordering is done with buttons rather than drag and drop. Drag is the
 * obvious gesture and the inaccessible one; the arrows work with a mouse, a
 * keyboard and a screen reader, and the first image is labelled as the cover so
 * the order is never just implied.
 */
export function ProductMediaUploader({
  media,
  onChange,
}: {
  media: ProductImage[];
  onChange: (next: ProductImage[]) => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const [pickerOpen, setPickerOpen] = useState(false);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (id: string) => onChange(media.filter((image) => image.id !== id));

  const add = (files: string[]) => {
    onChange([...media, ...files.map(mediaFromLibrary)]);
    setPickerOpen(false);
  };

  return (
    <div className="grid gap-4">
      {/* Drop zone. A button, not a div with a handler: this is the control that
          opens the picker, and it has to be reachable by keyboard. */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="grid place-items-center gap-2 rounded-[var(--admin-radius)] border-2 border-dashed border-[var(--border-default)] bg-[var(--admin-panel-sunken)] px-6 py-8 text-center transition-colors hover:border-[var(--gt-blue-400)] hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-brand)] text-[var(--gt-ink-900)]">
          <UploadCloud size={20} strokeWidth={1.8} />
        </span>
        <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {t("admin.media.dropTitle")}
        </span>
        <span className="max-w-[46ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.media.dropBody")}
        </span>
        <span className="mt-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--admin-panel)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
          {t("admin.media.prototypeNote")}
        </span>
      </button>

      {media.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4">
          {media.map((image, index) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)]"
            >
              <img src={image.src} alt={L(image.alt)} className="aspect-square w-full object-cover" />

              {index === 0 && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-inverse)]">
                  <Star size={10} strokeWidth={2.4} aria-hidden="true" />
                  {t("admin.media.cover")}
                </span>
              )}

              {/* Always visible, never hover-only: hover-only controls are
                  unreachable by keyboard and invisible on touch. */}
              <div className="flex items-center justify-between gap-1 border-t border-[var(--border-subtle)] bg-[var(--admin-panel)] px-1.5 py-1.5">
                <span className="flex items-center gap-0.5">
                  <AdminIconButton
                    size="sm"
                    icon={ArrowLeft}
                    label={t("admin.media.moveEarlier", { index: index + 1 })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <AdminIconButton
                    size="sm"
                    icon={ArrowRight}
                    label={t("admin.media.moveLater", { index: index + 1 })}
                    disabled={index === media.length - 1}
                    onClick={() => move(index, 1)}
                  />
                </span>
                <AdminIconButton
                  size="sm"
                  tone="danger"
                  icon={Trash2}
                  label={t("admin.media.remove", { index: index + 1 })}
                  onClick={() => remove(image.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {media.length > 0 ? t("admin.media.orderHint") : t("admin.media.emptyHint")}
      </p>

      {pickerOpen && <MediaPicker onCancel={() => setPickerOpen(false)} onConfirm={add} />}
    </div>
  );
}

/** Stand-in for the file browser: the brand's photography, multi-selectable. */
function MediaPicker({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (files: string[]) => void }) {
  const { t } = useTranslation();
  const L = useLocalized();
  const ref = useFocusTrap<HTMLDivElement>(true, onCancel);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (file: string) =>
    setSelected((prev) => (prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]));

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onCancel}
        className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.42)]"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-media-picker-title"
        tabIndex={-1}
        className="gt-admin-dialog relative flex max-h-[min(720px,88vh)] w-full max-w-[760px] flex-col rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="grid gap-1">
            <h2 id="gt-media-picker-title" className="text-[length:var(--text-h4)]">
              {t("admin.media.pickerTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.media.pickerBody")}
            </p>
          </div>
          <AdminIconButton icon={X} label={t("common.close")} onClick={onCancel} />
        </div>

        <div className="gt-admin-scroll flex-1 overflow-y-auto p-6">
          <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4 md:grid-cols-5">
            {MEDIA_LIBRARY.map((entry) => {
              const isSelected = selected.includes(entry.file);
              return (
                <li key={entry.file}>
                  <button
                    type="button"
                    onClick={() => toggle(entry.file)}
                    aria-pressed={isSelected}
                    className={clsx(
                      "relative block w-full overflow-hidden rounded-[var(--admin-radius-sm)] border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                      isSelected ? "border-[var(--gt-emerald-500)]" : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]",
                    )}
                  >
                    <img src={photo(entry.file)} alt={L(entry.alt)} className="aspect-square w-full object-cover" loading="lazy" />
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[var(--gt-emerald-500)] text-[var(--gt-white)]"
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-6 py-4">
          <p role="status" aria-live="polite" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("admin.media.selectedCount", { count: selected.length })}
          </p>
          <div className="flex gap-2">
            <AdminButton variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </AdminButton>
            <AdminButton
              variant="dark"
              iconLeft={ImagePlus}
              disabled={selected.length === 0}
              onClick={() => onConfirm(selected)}
            >
              {t("admin.media.addSelected")}
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}
