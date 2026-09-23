import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import clsx from "clsx";

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon: LucideIcon;
}

/**
 * Optional single-choice question drawn as cards.
 *
 * Native radios underneath, so the group is one tab stop, arrow keys move
 * through it and the legend is announced once. The selected card shows a tick
 * and a heavier border as well as its tint, so the choice does not rely on
 * colour. A "Clear" action exists because a radio cannot be unticked, and the
 * question is optional.
 */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  hint,
  choices,
  value,
  onChange,
  clearLabel,
}: {
  name: string;
  legend: string;
  hint?: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  clearLabel: string;
}) {
  return (
    <fieldset className="m-0 min-w-0 grid gap-3 border-0 p-0">
      <legend className="mb-3 grid w-full gap-1 p-0">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{legend}</span>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
            >
              {clearLabel}
            </button>
          )}
        </span>
        {hint && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</span>}
      </legend>
      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        {choices.map(({ value: v, label, description, icon: Icon }) => {
          const selected = v === value;
          return (
            <label
              key={v}
              className={clsx(
                "gt-choice relative flex min-h-[64px] cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3.5 pr-10 transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)]",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                selected
                  ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)] shadow-[inset_0_0_0_1px_var(--gt-ink-900)]"
                  : "border-[var(--border-subtle)] bg-white hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-off-white)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={v}
                checked={selected}
                onChange={() => onChange(v)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={clsx(
                  "grid h-9 w-9 flex-none place-items-center rounded-full transition-colors",
                  selected ? "bg-[var(--gt-ink-900)] text-white" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
                )}
              >
                <Icon size={17} />
              </span>
              <span className="grid gap-0.5">
                <span className="text-[length:var(--text-body-sm)] font-semibold leading-snug text-[var(--text-primary)]">{label}</span>
                {description && (
                  <span className="text-[length:var(--text-caption)] leading-snug text-[var(--text-muted)]">{description}</span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={clsx(
                  "absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full border transition-colors",
                  selected ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white" : "border-[var(--border-default)] bg-white",
                )}
              >
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
