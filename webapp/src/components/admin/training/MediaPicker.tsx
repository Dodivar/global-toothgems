import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Film, Images, X } from "lucide-react";
import { AdminButton } from "../AdminButton";
import { MediaThumb } from "./MediaThumb";
import { MediaPickerDialog } from "./MediaPickerDialog";
import { useTrainingMedia } from "../../../lib/trainingMedia";
import type { MediaKind, TrainingMedia } from "../../../lib/trainingMediaRules";

/**
 * A media field of the course editor (cover, module cover, image block, video
 * block, video poster, question illustration).
 *
 * Shows the current file and opens the select-only picker to change it; the
 * library itself is managed on its own screen. The value is a media
 * reference (see `data/adminTraining.ts`), never a URL.
 */
export function MediaPicker({
  kind = "image",
  value,
  onChange,
  onPick,
  label,
  hint,
  autoOpen = false,
  onCancel,
  showPreview = true,
  clearable = false,
}: {
  kind?: MediaKind;
  value: string;
  onChange?: (ref: string) => void;
  /** The whole library entry, for callers that also want its description or length. */
  onPick?: (media: TrainingMedia) => void;
  label: string;
  hint?: string;
  /** Opens the picker straight away — "Add image" is the first half of choosing one. */
  autoOpen?: boolean;
  /** Called when the picker is closed without choosing anything. */
  onCancel?: () => void;
  /** Off where the caller already shows the file. */
  showPreview?: boolean;
  /** Offers to empty the field (optional files, e.g. a poster). */
  clearable?: boolean;
}) {
  const { t } = useTranslation();
  const { findByRef } = useTrainingMedia();
  const [open, setOpen] = useState(autoOpen);
  const current = value ? findByRef(value) : undefined;
  const Icon = kind === "video" ? Film : Images;

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{label}</legend>
      {hint && <p className="m-0 -mt-1 mb-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] bg-[var(--admin-panel-sunken)] p-2.5">
        {showPreview && current && <MediaThumb media={current} className="h-14 w-20 flex-none overflow-hidden rounded-[var(--radius-xs)]" />}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            {current?.name ?? (value ? t("trainingMedia.picker.current") : t(kind === "video" ? "trainingMedia.picker.noneVideo" : "trainingMedia.picker.none"))}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">{t("trainingMedia.picker.from")}</span>
        </span>
        {clearable && value && (
          <AdminButton variant="ghost" size="sm" iconLeft={X} onClick={() => onChange?.("")}>
            {t("trainingMedia.picker.clear")}
          </AdminButton>
        )}
        <AdminButton variant="outline" size="sm" iconLeft={Icon} onClick={() => setOpen(true)}>
          {value ? t("trainingMedia.picker.change") : t("trainingMedia.picker.choose")}
        </AdminButton>
      </div>

      {open && (
        <MediaPickerDialog
          kind={kind}
          initialRef={value}
          onClose={() => {
            setOpen(false);
            onCancel?.();
          }}
          onInsert={(media) => {
            setOpen(false);
            onChange?.(media.ref);
            onPick?.(media);
          }}
        />
      )}
    </fieldset>
  );
}
