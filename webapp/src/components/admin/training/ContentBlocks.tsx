import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  FileText,
  GripVertical,
  Image as ImageIcon,
  MoveDown,
  MoveUp,
  Pencil,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
  Video,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { FormField } from "../FormField";
import { AdminSelect } from "../AdminSelect";
import { BlockTypeBadge } from "./TrainingPrimitives";
import { MediaPicker } from "./MediaPicker";
import { RichTextEditor, RichTextView } from "./RichTextEditor";
import { BLOCK_TYPES, type BlockType, type ContentBlock, type ImageBlock, type TextBlock, type VideoBlock } from "../../../data/adminTraining";
import type { ContentLang } from "../../../lib/localized";
import type { DragItemProps } from "../../../lib/useDragReorder";

/* -------------------------------------------------------------------------- */
/* Add content                                                                 */
/* -------------------------------------------------------------------------- */

const ADD_ICON: Record<BlockType, LucideIcon> = { text: FileText, image: ImageIcon, video: Video };

/**
 * The "+ Add content" control.
 *
 * It appears once under the last block and again, quietly, between every pair
 * of blocks — the between-blocks affordance is what makes it obvious that a
 * step holds *several* blocks rather than one. Both open the same three-entry
 * menu; three content types do not deserve a dialog.
 */
export function AddContentMenu({
  onAdd,
  variant = "block",
  label,
}: {
  onAdd: (type: BlockType) => void;
  /** `block` is the full-width control; `inline` is the hairline between blocks. */
  variant?: "block" | "inline";
  label?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const choose = (type: BlockType) => {
    setOpen(false);
    onAdd(type);
  };

  return (
    <div ref={wrapper} className="relative">
      {variant === "inline" ? (
        <div className="group/add flex items-center gap-2 py-1">
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-subtle)] opacity-0 transition-opacity group-hover/add:opacity-100" />
          <button
            type="button"
            id={`${id}-trigger`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={clsx(
              "inline-flex h-6 items-center gap-1 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] bg-[var(--admin-panel)] px-2 text-[10px] font-semibold text-[var(--text-subtle)] transition-[opacity,color,border-color]",
              "hover:border-[var(--gt-emerald-500)] hover:text-[var(--accent-cta-ink)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              // Hidden until wanted, but never hidden from the keyboard.
              open ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/add:opacity-100",
            )}
          >
            <Plus size={11} strokeWidth={2.5} aria-hidden="true" />
            {label ?? t("admin.training.step.addContentHere")}
          </button>
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-subtle)] opacity-0 transition-opacity group-hover/add:opacity-100" />
        </div>
      ) : (
        <AdminButton
          variant="outline"
          iconLeft={Plus}
          fullWidth
          id={`${id}-trigger`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="border-dashed"
        >
          {label ?? t("admin.training.step.addContent")}
        </AdminButton>
      )}

      {open && (
        <div
          role="menu"
          aria-labelledby={`${id}-trigger`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="gt-admin-dialog absolute left-1/2 z-[120] mt-1 w-[240px] -translate-x-1/2 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-2 shadow-[var(--shadow-lg)]"
        >
          <p className="m-0 px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
            {t("admin.training.blocks.addTitle")}
          </p>
          {BLOCK_TYPES.map((type) => {
            const Icon = ADD_ICON[type];
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                onClick={() => choose(type)}
                className="flex w-full items-start gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <Icon size={15} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 flex-none text-[var(--text-muted)]" />
                <span className="grid gap-0.5">
                  <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                    {t(`admin.training.blocks.${type}`)}
                  </span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t(`admin.training.blocks.${type}Hint`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Block card                                                                  */
/* -------------------------------------------------------------------------- */

export interface BlockActions {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * One content block in the step editor.
 *
 * Collapsed it shows what the block is and a readable summary of what is in it;
 * expanded it becomes the block's own editor. Only one block is open at a time,
 * which keeps a nine-block step to one screen of scrolling and keeps the
 * controls per block down to the five that matter.
 */
export function BlockCard({
  block,
  index,
  total,
  lang,
  open,
  actions,
  children,
  dragProps,
  dragClassName,
}: {
  block: ContentBlock;
  index: number;
  total: number;
  lang: ContentLang;
  open: boolean;
  actions: BlockActions;
  children?: React.ReactNode;
  dragProps?: DragItemProps;
  dragClassName?: string;
}) {
  const { t } = useTranslation();
  const missingAlt = block.type === "image" && block.alt[lang].trim() === "";

  return (
    <article
      {...dragProps}
      aria-label={t("admin.training.step.blockPosition", { index: index + 1, total })}
      className={clsx(
        "group/block rounded-[var(--admin-radius)] border bg-[var(--admin-panel)] transition-colors",
        open ? "border-[var(--gt-ink-900)] shadow-[var(--shadow-sm)]" : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]",
        dragClassName,
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <span
          aria-hidden="true"
          className="mt-1 flex-none cursor-grab text-[var(--text-subtle)] opacity-40 transition-opacity group-hover/block:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={15} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BlockTypeBadge type={block.type} />
            <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">
              {t("admin.training.step.blockPosition", { index: index + 1, total })}
            </span>
            {missingAlt && (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warning-fg)]">
                <TriangleAlert size={10} strokeWidth={2.4} aria-hidden="true" />
                {t("admin.training.blocks.imageAltMissing")}
              </span>
            )}
          </div>

          {!open && <BlockSummary block={block} lang={lang} />}
        </div>

        <div className="flex flex-none items-center gap-0.5">
          <IconAction
            icon={MoveUp}
            label={t("admin.training.blocks.moveUp")}
            disabled={index === 0}
            onClick={actions.onMoveUp}
          />
          <IconAction
            icon={MoveDown}
            label={t("admin.training.blocks.moveDown")}
            disabled={index === total - 1}
            onClick={actions.onMoveDown}
          />
          <IconAction icon={Copy} label={t("admin.training.blocks.duplicate")} onClick={actions.onDuplicate} />
          <IconAction
            icon={open ? Check : Pencil}
            label={open ? t("admin.training.blocks.done") : t("admin.training.blocks.edit")}
            onClick={actions.onEdit}
            emphasis
          />
          <IconAction
            icon={Trash2}
            label={t("admin.training.blocks.delete")}
            onClick={actions.onDelete}
            tone="danger"
          />
        </div>
      </div>

      {open && <div className="border-t border-[var(--border-subtle)] p-4">{children}</div>}
    </article>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
  emphasis,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-30",
        tone === "danger"
          ? "text-[var(--text-muted)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)]"
          : emphasis
            ? "text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)]"
            : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
      )}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/** One readable line per block type, so a collapsed step is still scannable. */
function BlockSummary({ block, lang }: { block: ContentBlock; lang: ContentLang }) {
  const { t } = useTranslation();

  if (block.type === "text") {
    const plain = block.html[lang].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return (
      <p className="m-0 mt-1.5 line-clamp-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {plain || t("admin.training.blocks.textHint")}
      </p>
    );
  }

  if (block.type === "image") {
    return (
      <div className="mt-1.5 flex items-center gap-2.5">
        <img src={block.src} alt="" aria-hidden="true" className="h-10 w-14 flex-none rounded-[var(--radius-xs)] object-cover" />
        <p className="m-0 line-clamp-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {block.caption[lang] || block.alt[lang] || t("admin.training.blocks.imageHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-2.5">
      <span className="relative h-10 w-14 flex-none overflow-hidden rounded-[var(--radius-xs)]">
        <img src={block.poster} alt="" aria-hidden="true" className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-[rgba(17,17,17,.34)] text-[var(--gt-white)]">
          <Play size={12} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
        </span>
      </span>
      <p className="m-0 line-clamp-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {block.title[lang] || t("admin.training.blocks.videoHint")}
        <span className="ml-1.5 tabular-nums text-[var(--text-subtle)]">{block.duration}</span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editors                                                                     */
/* -------------------------------------------------------------------------- */

export function TextBlockEditor({
  block,
  lang,
  onChange,
}: {
  block: TextBlock;
  lang: ContentLang;
  onChange: (patch: Partial<TextBlock>) => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();

  return (
    <div className="grid gap-2">
      <RichTextEditor
        seedKey={`${block.id}-${lang}`}
        html={block.html[lang]}
        label={t("admin.training.blocks.textContent")}
        describedBy={hintId}
        onChange={(html) => onChange({ html: { ...block.html, [lang]: html } })}
      />
      <p id={hintId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("admin.training.blocks.textHintLong")}
      </p>
    </div>
  );
}

export function ImageBlockEditor({
  block,
  lang,
  onChange,
}: {
  block: ImageBlock;
  lang: ContentLang;
  onChange: (patch: Partial<ImageBlock>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <figure className="m-0 grid gap-2">
          <img
            src={block.src}
            alt={block.alt[lang] || ""}
            className="w-full rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] object-cover"
          />
          <figcaption className="text-[length:var(--text-caption)] text-[var(--text-subtle)]">
            {t("admin.training.blocks.previewLabel")}
          </figcaption>
        </figure>

        <div className="grid content-start gap-3">
          <FormField
            label={t("admin.training.blocks.imageAlt")}
            hint={t("admin.training.blocks.imageAltHint")}
            required
            error={block.alt[lang].trim() === "" ? t("admin.training.blocks.imageAltMissing") : undefined}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={block.alt[lang]}
                onChange={(e) => onChange({ alt: { ...block.alt, [lang]: e.target.value } })}
              />
            )}
          </FormField>

          <FormField label={t("admin.training.blocks.imageCaption")} hint={t("admin.training.blocks.imageCaptionHint")}>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={block.caption[lang]}
                onChange={(e) => onChange({ caption: { ...block.caption, [lang]: e.target.value } })}
              />
            )}
          </FormField>

          <FormField label={t("admin.training.blocks.imageAlign")}>
            {(props) => (
              <AdminSelect
                {...props}
                value={block.align}
                onChange={(e) => onChange({ align: e.target.value as ImageBlock["align"] })}
                options={[
                  { value: "full", label: t("admin.training.blocks.alignFull") },
                  { value: "center", label: t("admin.training.blocks.alignCenter") },
                  { value: "left", label: t("admin.training.blocks.alignLeft") },
                ]}
              />
            )}
          </FormField>
        </div>
      </div>

      <MediaPicker
        value={block.src}
        onChange={(src) => onChange({ src })}
        label={t("admin.training.blocks.imageReplace")}
      />
    </div>
  );
}

export function VideoBlockEditor({
  block,
  lang,
  onChange,
}: {
  block: VideoBlock;
  lang: ContentLang;
  onChange: (patch: Partial<VideoBlock>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <VideoFrame poster={block.poster} title={block.title[lang]} duration={block.duration} />
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
            {t("admin.training.blocks.videoMock")}
          </p>
        </div>

        <div className="grid content-start gap-3">
          <FormField label={t("admin.training.blocks.videoTitle")} hint={t("admin.training.blocks.videoTitleHint")}>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={block.title[lang]}
                onChange={(e) => onChange({ title: { ...block.title, [lang]: e.target.value } })}
              />
            )}
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("admin.training.blocks.videoDuration")} hint={t("admin.training.blocks.videoDurationHint")}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="numeric"
                  placeholder="00:00"
                  className="gt-admin-field tabular-nums"
                  value={block.duration}
                  onChange={(e) => onChange({ duration: e.target.value })}
                />
              )}
            </FormField>

            <FormField label={t("admin.training.blocks.videoCaption")}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="gt-admin-field"
                  value={block.caption[lang]}
                  onChange={(e) => onChange({ caption: { ...block.caption, [lang]: e.target.value } })}
                />
              )}
            </FormField>
          </div>

          <FormField label={t("admin.training.blocks.videoSource")} hint={t("admin.training.blocks.videoSourceHint")}>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)]"
                value={block.source}
                onChange={(e) => onChange({ source: e.target.value })}
              />
            )}
          </FormField>
        </div>
      </div>

      <MediaPicker
        value={block.poster}
        onChange={(poster) => onChange({ poster })}
        label={t("admin.training.blocks.videoPoster")}
        hint={t("admin.training.blocks.videoPosterHint")}
      />
    </div>
  );
}

/**
 * The video placeholder, shared by the editor and the learner preview.
 *
 * It is plainly a still with a play affordance — nothing streams in the
 * prototype, and a control that looks like it plays and then does nothing is
 * worse than one that says what it is.
 */
export function VideoFrame({
  poster,
  title,
  duration,
  large,
}: {
  poster: string;
  title: string;
  duration: string;
  large?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--gt-ink-900)]">
      <img src={poster} alt="" aria-hidden="true" className="aspect-video w-full object-cover opacity-80" />
      <div className="absolute inset-0 grid place-items-center">
        <span
          aria-hidden="true"
          className={clsx(
            "grid place-items-center rounded-full bg-[rgba(250,250,248,.92)] text-[var(--gt-ink-900)] shadow-[var(--shadow-md)]",
            large ? "h-16 w-16" : "h-11 w-11",
          )}
        >
          <Play size={large ? 24 : 16} strokeWidth={2} fill="currentColor" className="ml-0.5" />
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-[rgba(17,17,17,.82)] to-transparent p-3">
        <span className="min-w-0 truncate text-[length:var(--text-caption)] font-semibold text-[var(--gt-white)]">
          {title || t("admin.training.preview.videoMock")}
        </span>
        <span className="flex-none rounded-[var(--radius-xs)] bg-[rgba(17,17,17,.7)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--gt-white)]">
          {duration}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Read-only rendering                                                         */
/* -------------------------------------------------------------------------- */

/** How a block looks to a learner. Used by the preview and the step preview. */
export function BlockView({ block, lang }: { block: ContentBlock; lang: ContentLang }) {
  if (block.type === "text") {
    return <RichTextView html={block.html[lang]} />;
  }

  if (block.type === "image") {
    const width = block.align === "full" ? "w-full" : block.align === "center" ? "mx-auto max-w-[520px]" : "max-w-[420px]";
    return (
      <figure className={clsx("m-0 grid gap-2", width)}>
        <img
          src={block.src}
          alt={block.alt[lang]}
          className="w-full rounded-[var(--radius-media)] border border-[var(--border-subtle)] object-cover"
        />
        {block.caption[lang] && (
          <figcaption className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {block.caption[lang]}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className="m-0 grid gap-2">
      <VideoFrame poster={block.poster} title={block.title[lang]} duration={block.duration} large />
      {block.caption[lang] && (
        <figcaption className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {block.caption[lang]}
        </figcaption>
      )}
    </figure>
  );
}
