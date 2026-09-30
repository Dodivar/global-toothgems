import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Images } from "lucide-react";
import { AdminButton } from "../AdminButton";
import { useTrainingMedia } from "../../../lib/trainingMedia";
import type { TrainingMedia } from "../../../lib/trainingMediaRules";
import { TrainingMediaLibrary } from "./TrainingMediaLibrary";

/**
 * An image field of the course editor.
 *
 * Shows the current image and opens the training image library to change it —
 * where images are uploaded, found, described and inserted. Every image field
 * of the builder (image blocks, module covers, video thumbnails, question
 * illustrations) goes through here, so they all share one training-only
 * collection that never mixes with the shop's product photos.
 */
export function MediaPicker({
  value,
  onChange,
  onPick,
  label,
  hint,
  autoOpen = false,
  onCancel,
  showPreview = true,
}: {
  value: string;
  onChange?: (src: string) => void;
  /** The whole library entry, for callers that also want its description. */
  onPick?: (media: TrainingMedia) => void;
  label: string;
  hint?: string;
  /** Opens the library straight away — "Add image" is the first half of choosing one. */
  autoOpen?: boolean;
  /** Called when the library is closed without inserting anything. */
  onCancel?: () => void;
  /** Off where the caller already shows the image. */
  showPreview?: boolean;
}) {
  const { t } = useTranslation();
  const { findBySrc } = useTrainingMedia();
  const [open, setOpen] = useState(autoOpen);
  const current = value ? findBySrc(value) : undefined;

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{label}</legend>
      {hint && <p className="m-0 -mt-1 mb-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] bg-[var(--admin-panel-sunken)] p-2.5">
        {showPreview && value && (
          <img src={value} alt="" aria-hidden="true" className="h-14 w-20 flex-none rounded-[var(--radius-xs)] object-cover" />
        )}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            {current?.name ?? (value ? t("trainingMedia.picker.current") : t("trainingMedia.picker.none"))}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">{t("trainingMedia.picker.from")}</span>
        </span>
        <AdminButton variant="outline" size="sm" iconLeft={Images} onClick={() => setOpen(true)}>
          {value ? t("trainingMedia.picker.change") : t("trainingMedia.picker.choose")}
        </AdminButton>
      </div>

      {open && (
        <TrainingMediaLibrary
          initialSrc={value}
          onClose={() => {
            setOpen(false);
            onCancel?.();
          }}
          onInsert={(media) => {
            setOpen(false);
            onChange?.(media.src);
            onPick?.(media);
          }}
        />
      )}
    </fieldset>
  );
}
