import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Film, Images, Languages, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { MediaImage } from "./MediaImage";
import { MediaThumb } from "./MediaThumb";
import { MediaPickerDialog } from "./MediaPickerDialog";
import { useTrainingMedia } from "../../../lib/trainingMedia";
import type { MediaKind, TrainingMedia } from "../../../lib/trainingMediaRules";
import type { ContentLang } from "../../../lib/localized";

/**
 * The library picker, rendered on `document.body`.
 *
 * Media fields sit inside draggable block cards and clipped panels: a fixed
 * dialog left in that subtree inherits the card's drag state (faded while a
 * thumbnail is dragged) and its containing block. On the body it is always
 * the whole screen. React events still bubble through the component tree, so
 * a drag started on a thumbnail is stopped before it reaches the card.
 */
function PickerPortal(props: Parameters<typeof MediaPickerDialog>[0]) {
  return createPortal(
    <div onDragStart={(event) => event.stopPropagation()} onDragOver={(event) => event.stopPropagation()} onDrop={(event) => event.stopPropagation()}>
      <MediaPickerDialog {...props} />
    </div>,
    document.body,
  );
}

/**
 * A media field of the course editor (course cover, module cover, video file).
 *
 * Shows the current file and opens the select-only picker to change it; the
 * library itself is managed on its own screen. The value is a media
 * reference (see `data/adminTraining.ts`), never a URL. Images that may differ
 * by language use `LocalizedImageField` instead.
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
  sharedAcrossLanguages = false,
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
  /** Offers to empty the field (optional files). */
  clearable?: boolean;
  /** Says that the file has no per-language version (covers). */
  sharedAcrossLanguages?: boolean;
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
            {current?.name ??
              (value
                ? t(kind === "video" ? "trainingMedia.picker.currentVideo" : "trainingMedia.picker.current")
                : t(kind === "video" ? "trainingMedia.picker.noneVideo" : "trainingMedia.picker.none"))}
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

      {sharedAcrossLanguages && (
        <p className="m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <Languages size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("trainingMedia.localized.allLanguages")}
        </p>
      )}

      {open && (
        <PickerPortal
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

/**
 * An image that may change with the reader's language (image block, video
 * thumbnail, question image).
 *
 * The rule it has to make obvious (decision 92): the **default** image —
 * stored on the French content — is shown in every language; an **English**
 * image is optional and, once chosen, replaces it for English readers only.
 * So both slots are always on screen, whatever language the builder edits,
 * each with what it does in words, and a "what learners see" line resolves
 * the rule per language. The English slot waits for a default image: on its
 * own it would leave French readers with nothing.
 */
export function LocalizedImageField({
  editingLang,
  label,
  hint,
  defaultRef,
  englishRef,
  onPickDefault,
  onPickEnglish,
  onClearEnglish,
  onClearAll,
  autoOpen = false,
  onCancel,
}: {
  /** The language the builder is editing: its slot is marked as such. */
  editingLang: ContentLang;
  label: string;
  hint?: string;
  defaultRef: string;
  englishRef: string | undefined;
  onPickDefault: (media: TrainingMedia) => void;
  onPickEnglish: (media: TrainingMedia) => void;
  onClearEnglish: () => void;
  /** For optional images: removes the image in every language. */
  onClearAll?: () => void;
  /** Opens the default slot's picker straight away (a block just added). */
  autoOpen?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { findByRef } = useTrainingMedia();
  const [open, setOpen] = useState<"default" | "en" | null>(autoOpen ? "default" : null);
  const english = englishRef || "";
  const nameOf = (ref: string) => findByRef(ref)?.name ?? t("trainingMedia.picker.current");

  const enShown = english || defaultRef;

  return (
    <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{label}</legend>
      <p className="m-0 -mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {hint ? `${hint} ` : ""}
        {t("trainingMedia.localized.intro")}
      </p>

      {/* Stacked, default first: the field sits in narrow editor columns as often as wide ones. */}
      <div className="grid gap-3">
        <ImageSlot
          badge={t("trainingMedia.localized.defaultBadge")}
          title={t("trainingMedia.localized.defaultSlot")}
          editing={editingLang === "fr"}
          imageRef={defaultRef}
          name={defaultRef ? nameOf(defaultRef) : t("trainingMedia.picker.none")}
          status={
            !defaultRef
              ? t("trainingMedia.localized.defaultMissing")
              : english
                ? t("trainingMedia.localized.defaultShownFrOnly")
                : t("trainingMedia.localized.defaultShownAll")
          }
          actions={
            <AdminButton variant="outline" size="sm" iconLeft={Images} onClick={() => setOpen("default")}>
              {defaultRef ? t("trainingMedia.picker.change") : t("trainingMedia.localized.chooseDefault")}
            </AdminButton>
          }
        />

        <ImageSlot
          badge={t("trainingMedia.localized.englishBadge")}
          title={t("trainingMedia.localized.englishSlot")}
          editing={editingLang === "en"}
          imageRef={english || defaultRef}
          inherited={!english && Boolean(defaultRef)}
          name={english ? nameOf(english) : t("trainingMedia.localized.englishNone")}
          status={
            english
              ? t("trainingMedia.localized.englishSet")
              : defaultRef
                ? t("trainingMedia.localized.englishInherits")
                : t("trainingMedia.localized.englishNeedsDefault")
          }
          note={english ? undefined : t("trainingMedia.localized.englishWhen")}
          actions={
            <>
              {english && (
                <AdminButton variant="ghost" size="sm" iconLeft={X} onClick={onClearEnglish}>
                  {t("trainingMedia.localized.removeEnglish")}
                </AdminButton>
              )}
              <AdminButton
                variant="outline"
                size="sm"
                iconLeft={Images}
                disabled={!defaultRef && !english}
                onClick={() => setOpen("en")}
              >
                {english ? t("trainingMedia.picker.change") : t("trainingMedia.localized.chooseEnglish")}
              </AdminButton>
            </>
          }
        />
      </div>

      <div className="grid gap-1.5 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-3 py-2.5 text-[length:var(--text-caption)]">
        <span className="font-semibold text-[var(--text-primary)]">{t("trainingMedia.localized.resultTitle")}</span>
        <ResultLine
          language={t("trainingMedia.localized.resultFr")}
          imageRef={defaultRef}
          text={defaultRef ? `${nameOf(defaultRef)} · ${t("trainingMedia.localized.sourceDefault")}` : t("trainingMedia.localized.resultNone")}
        />
        <ResultLine
          language={t("trainingMedia.localized.resultEn")}
          imageRef={enShown}
          text={enShown ? `${nameOf(enShown)} · ${t(english ? "trainingMedia.localized.sourceEnglish" : "trainingMedia.localized.sourceDefault")}` : t("trainingMedia.localized.resultNone")}
        />
      </div>

      {onClearAll && defaultRef && (
        <AdminButton variant="ghost" size="sm" iconLeft={X} onClick={onClearAll} className="justify-self-start">
          {t("trainingMedia.localized.removeAll")}
        </AdminButton>
      )}

      {open && (
        <PickerPortal
          kind="image"
          title={open === "default" ? t("trainingMedia.localized.pickerTitleDefault") : t("trainingMedia.localized.pickerTitleEnglish")}
          initialRef={open === "default" ? defaultRef : english}
          onClose={() => {
            setOpen(null);
            onCancel?.();
          }}
          onInsert={(media) => {
            const slot = open;
            setOpen(null);
            if (slot === "default") onPickDefault(media);
            else onPickEnglish(media);
          }}
        />
      )}
    </fieldset>
  );
}

function ImageSlot({
  badge,
  title,
  editing,
  imageRef,
  inherited = false,
  name,
  status,
  note,
  actions,
}: {
  badge: string;
  title: string;
  editing: boolean;
  imageRef: string;
  /** No image of its own: the default one shows through, faded and said so. */
  inherited?: boolean;
  name: string;
  status: string;
  note?: string;
  actions: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={clsx(
        "grid content-start gap-2.5 rounded-[var(--admin-radius-sm)] border p-3",
        editing ? "border-[var(--gt-ink-900)] bg-[var(--admin-panel)]" : "border-dashed border-[var(--border-default)] bg-[var(--admin-panel-sunken)]",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="grid gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{badge}</span>
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{title}</span>
        </span>
        {editing && (
          <span className="rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-inverse)]">
            {t("trainingMedia.localized.editing")}
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <span className="relative h-16 w-24 flex-none overflow-hidden rounded-[var(--radius-xs)] border border-[var(--border-subtle)]">
          <MediaImage mediaRef={imageRef || undefined} className={clsx("h-full w-full object-cover", inherited && "opacity-50")} />
        </span>
        <span className="grid min-w-[12ch] flex-1 gap-0.5">
          <span className="truncate text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{name}</span>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{status}</span>
        </span>
      </div>
      {note && <p className="m-0 text-[11px] text-[var(--text-subtle)]">{note}</p>}

      <div className="flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}

function ResultLine({ language, imageRef, text }: { language: string; imageRef: string; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[var(--text-body)]">
      <MediaImage mediaRef={imageRef || undefined} className="h-6 w-8 flex-none rounded-[3px] object-cover" />
      <span className="w-[7ch] flex-none font-semibold">{language}</span>
      <span className="min-w-0 text-[var(--text-muted)]">{text}</span>
    </span>
  );
}
