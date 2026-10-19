import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { RecordDetails } from "../../../lib/studioWorkspace/types";
import { DESCRIPTION_MAX, NAME_MAX, type DetailsError } from "../../../lib/studioWorkspace/validation";
import { fieldClass } from "./workspaceStyles";

/**
 * Name and description — the fields every save and "edit details"
 * dialog shares, for creations and Gem Groups alike. Controlled: the dialog
 * owns the values and decides when they are submitted.
 */
export function DetailsFields({
  value,
  onChange,
  error,
  placeholders,
  autoFocus = true,
}: {
  value: RecordDetails;
  onChange: (next: RecordDetails) => void;
  error: DetailsError | null;
  placeholders: { name: string; description: string };
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const ids = { name: useId(), description: useId(), error: useId() };
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
    </div>
  );
}
