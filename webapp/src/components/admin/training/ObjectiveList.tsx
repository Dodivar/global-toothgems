import { useTranslation } from "react-i18next";
import { Plus, Target, X } from "lucide-react";
import { AdminButton } from "../AdminButton";
import type { Localized } from "../../../data/types";
import type { ContentLang } from "../../../lib/localized";

/**
 * An ordered list of short bilingual statements: learning objectives on a
 * course or a module, prerequisites on a course.
 *
 * Rows rather than a textarea split on newlines. A textarea is quicker to build
 * and worse to use: it cannot label its rows, cannot be reordered, and turns
 * "remove the third objective" into a text-editing exercise.
 */
export function ObjectiveList({
  items,
  lang,
  onChange,
  label,
  hint,
  addLabel,
  placeholder,
  removeLabel,
  emptyLabel,
}: {
  items: Localized[];
  lang: ContentLang;
  onChange: (items: Localized[]) => void;
  label: string;
  hint?: string;
  addLabel: string;
  placeholder: string;
  removeLabel: string;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();

  const setAt = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [lang]: value } : item)));

  const removeAt = (index: number) => onChange(items.filter((_, i) => i !== index));

  const add = () => onChange([...items, { fr: "", en: "" }]);

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{label}</legend>
      {hint && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}

      {items.length === 0 ? (
        <p className="m-0 flex items-center gap-2 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] px-3 py-3 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
          <Target size={13} strokeWidth={2} aria-hidden="true" />
          {emptyLabel ?? t("admin.training.create.objectivesHint")}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--surface-sunken)] text-[10px] font-bold tabular-nums text-[var(--text-muted)]"
              >
                {index + 1}
              </span>
              <input
                type="text"
                value={item[lang]}
                placeholder={placeholder}
                aria-label={`${label} ${index + 1}`}
                onChange={(e) => setAt(index, e.target.value)}
                className="gt-admin-field"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`${removeLabel} ${index + 1}`}
                title={removeLabel}
                className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
              >
                <X size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <AdminButton variant="ghost" size="sm" iconLeft={Plus} onClick={add}>
          {addLabel}
        </AdminButton>
      </div>
    </fieldset>
  );
}
