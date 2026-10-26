import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FlaskConical } from "lucide-react";
import clsx from "clsx";

/**
 * Review controls for the recovery and security prototypes.
 *
 * The same dashed, collapsed "Prototype controls" panel as the registration
 * journey: visible and labelled as a demo, so a reviewer can reach every
 * failure and expiry state without guessing which input triggers it, and
 * collapsed by default so it never competes with the real interface.
 */
export function DemoControls({ summary, children }: { summary?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <details className="group rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-white/70 backdrop-blur-[6px]">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-[var(--radius-lg)] px-4 py-2 text-[length:var(--text-caption)] [&::-webkit-details-marker]:hidden">
        <FlaskConical size={14} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
        <span className="font-semibold text-[var(--text-primary)]">{t("register.demo.title")}</span>
        {summary && <span className="hidden truncate text-[var(--text-muted)] sm:inline">· {summary}</span>}
        <ChevronDown size={15} aria-hidden="true" className="ml-auto flex-none text-[var(--text-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 border-t border-dashed border-[var(--border-default)] p-4">{children}</div>
    </details>
  );
}

/** Pill-shaped radio group used by the security demo panels. */
export function RadioPills<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  labelFor,
}: {
  name: string;
  legend: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <fieldset className="m-0 min-w-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option === value;
          return (
            <label
              key={option}
              className={clsx(
                "flex min-h-[36px] cursor-pointer items-center rounded-full border px-3.5 text-[length:var(--text-caption)] font-semibold transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                selected
                  ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                  : "border-[var(--border-subtle)] bg-white text-[var(--text-body)] hover:border-[var(--border-default)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {labelFor(option)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Small helper paragraph for the demo panel. */
export function DemoNote({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{children}</p>;
}

/** Inline monospace token, e.g. a demo password or email. */
export function DemoCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[family-name:var(--gt-font-mono)] text-[11px] text-[var(--text-primary)]">
      {children}
    </code>
  );
}
