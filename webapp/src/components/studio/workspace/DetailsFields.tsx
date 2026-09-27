import { useId, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RecordDetails } from "../../../lib/studioWorkspace/types";
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  TAG_MAX,
  TAGS_MAX,
  normalizeTags,
  type DetailsError,
} from "../../../lib/studioWorkspace/validation";
import { fieldClass, focusRing } from "./workspaceStyles";

/**
 * Name, description and tags — the fields every save and "edit details"
 * dialog shares, for creations and Gem Groups alike. Controlled: the dialog
 * owns the values and decides when they are submitted.
 */
export function DetailsFields({
  value,
  onChange,
  error,
  suggestions,
  placeholders,
  autoFocus = true,
}: {
  value: RecordDetails;
  onChange: (next: RecordDetails) => void;
  error: DetailsError | null;
  /** Tags offered in one tap: the library's own, then a few starters. */
  suggestions: string[];
  placeholders: { name: string; description: string };
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const ids = { name: useId(), description: useId(), tags: useId(), error: useId(), tagsHint: useId() };
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const next = normalizeTags([...value.tags, ...raw.split(",")]);
    onChange({ ...value, tags: next });
    setDraft("");
  };
  const removeTag = (tag: string) => onChange({ ...value, tags: value.tags.filter((x) => x !== tag) });
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && value.tags.length) {
      removeTag(value.tags[value.tags.length - 1]);
    }
  };
  const offered = suggestions.filter((s) => !value.tags.some((x) => x.toLocaleLowerCase() === s.toLocaleLowerCase())).slice(0, 6);
  const full = value.tags.length >= TAGS_MAX;
  const nameError = error === "nameMissing" || error === "nameTooLong";

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={ids.name} className="text-[12.5px] font-bold text-[var(--text-primary)]">
          {t("studio.workspace.details.name")}
        </label>
        <input
          id={ids.name}
          autoFocus={autoFocus}
          value={value.name}
          maxLength={NAME_MAX}
          required
          aria-invalid={nameError}
          aria-describedby={nameError ? ids.error : undefined}
          placeholder={placeholders.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className={fieldClass}
        />
        {nameError && (
          <p id={ids.error} className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
            {t(`studio.workspace.details.errors.${error}`, { max: NAME_MAX })}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={ids.description} className="text-[12.5px] font-bold text-[var(--text-primary)]">
            {t("studio.workspace.details.description")}{" "}
            <span className="font-medium text-[var(--text-subtle)]">{t("studio.workspace.details.optional")}</span>
          </label>
          <span aria-hidden="true" className="text-[11px] tabular-nums text-[var(--text-subtle)]">
            {value.description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
        <textarea
          id={ids.description}
          rows={2}
          value={value.description}
          maxLength={DESCRIPTION_MAX}
          placeholder={placeholders.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          className={`${fieldClass} resize-none leading-relaxed`}
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.tags} className="text-[12.5px] font-bold text-[var(--text-primary)]">
          {t("studio.workspace.details.tags")}{" "}
          <span className="font-medium text-[var(--text-subtle)]">{t("studio.workspace.details.optional")}</span>
        </label>
        <div
          className={`${fieldClass} flex flex-wrap items-center gap-1.5 py-2 focus-within:border-[var(--focus-ring)]`}
          onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
        >
          {value.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-[var(--gt-blue-700)]"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={t("studio.workspace.details.removeTag", { tag })}
                className={`grid h-5 w-5 place-items-center rounded-full hover:bg-white/70 ${focusRing}`}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            id={ids.tags}
            value={draft}
            disabled={full}
            maxLength={TAG_MAX + 1}
            aria-describedby={ids.tagsHint}
            placeholder={value.tags.length ? "" : t("studio.workspace.details.tagsPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={() => draft.trim() && addTag(draft)}
            className="min-w-[8ch] flex-1 bg-transparent text-[length:var(--text-body-sm)] outline-none placeholder:text-[var(--text-subtle)] disabled:hidden"
          />
        </div>
        <p id={ids.tagsHint} className="m-0 text-[11.5px] text-[var(--text-subtle)]">
          {full ? t("studio.workspace.details.tagsFull", { max: TAGS_MAX }) : t("studio.workspace.details.tagsHint")}
        </p>
        {offered.length > 0 && !full && (
          <div className="flex flex-wrap gap-1.5" aria-label={t("studio.workspace.details.suggested")} role="group">
            {offered.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTag(s)}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-dashed border-[var(--gt-blue-300)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--gt-blue-700)] transition-colors hover:bg-[var(--gt-blue-50)] ${focusRing}`}
              >
                <Plus size={11} aria-hidden="true" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
