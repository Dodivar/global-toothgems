import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Bold, Eye, Italic, List, ListOrdered, PenLine } from "lucide-react";
import clsx from "clsx";
import { AdminIconButton } from "./AdminIconButton";
import { RichText } from "../ui/RichText";
import { toggleInlineMarker, toggleList, type TextEdit } from "../../lib/richTextEditing";

/**
 * Textarea for the product description, with a toolbar that inserts the
 * Markdown markers the storefront renders (see `lib/richText.ts`).
 *
 * The value stays plain text: the buttons only type what an administrator
 * could type by hand, and a preview shows the result before saving.
 */
interface RichTextAreaProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  "aria-required": boolean | undefined;
  value: string;
  onValueChange: (value: string) => void;
  rows?: number;
}

export function RichTextArea({ value, onValueChange, rows = 8, ...fieldProps }: RichTextAreaProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // The controlled value lands on the next render; the selection has to be
  // put back after it, or the cursor jumps to the end of the text.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const selection = pendingSelection.current;
    if (!textarea || !selection) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(selection[0], selection[1]);
  }, [value]);

  const apply = (edit: (value: string, start: number, end: number) => TextEdit) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = edit(value, textarea.selectionStart, textarea.selectionEnd);
    pendingSelection.current = [result.selectionStart, result.selectionEnd];
    onValueChange(result.value);
  };

  const bold = () => apply((v, s, e) => toggleInlineMarker(v, s, e, "**"));
  const italic = () => apply((v, s, e) => toggleInlineMarker(v, s, e, "*"));

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      bold();
    } else if (key === "i") {
      event.preventDefault();
      italic();
    }
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div role="toolbar" aria-label={t("admin.form.richText.toolbar")} aria-controls={fieldProps.id} className="flex gap-0.5">
          <AdminIconButton size="sm" icon={Bold} label={t("admin.form.richText.bold")} onClick={bold} disabled={previewing} />
          <AdminIconButton size="sm" icon={Italic} label={t("admin.form.richText.italic")} onClick={italic} disabled={previewing} />
          <span aria-hidden="true" className="mx-1 w-px self-stretch bg-[var(--border-subtle)]" />
          <AdminIconButton
            size="sm"
            icon={List}
            label={t("admin.form.richText.bulletList")}
            onClick={() => apply((v, s, e) => toggleList(v, s, e, false))}
            disabled={previewing}
          />
          <AdminIconButton
            size="sm"
            icon={ListOrdered}
            label={t("admin.form.richText.numberedList")}
            onClick={() => apply((v, s, e) => toggleList(v, s, e, true))}
            disabled={previewing}
          />
        </div>
        <button
          type="button"
          aria-pressed={previewing}
          onClick={() => setPreviewing((on) => !on)}
          className={clsx(
            "inline-flex h-8 items-center gap-1.5 rounded-[var(--admin-radius-sm)] px-2.5 text-[length:var(--text-caption)] font-semibold transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
            previewing
              ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
              : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
          )}
        >
          {previewing ? <PenLine size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          {previewing ? t("admin.form.richText.edit") : t("admin.form.richText.preview")}
        </button>
      </div>

      {previewing ? (
        <div
          aria-live="polite"
          className="min-h-[calc(var(--admin-control-h)*2)] rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]"
        >
          {value.trim() ? (
            <RichText source={value} />
          ) : (
            <p className="m-0 text-[var(--text-subtle)]">{t("admin.form.richText.empty")}</p>
          )}
        </div>
      ) : (
        <textarea
          {...fieldProps}
          ref={textareaRef}
          rows={rows}
          className="gt-admin-field"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}
