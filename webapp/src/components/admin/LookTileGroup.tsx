import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

/**
 * One gem-look choice (a shape, a colour…) as a grid of picture tiles.
 *
 * Tiles rather than wrapped pills: every option gets the same box, so a row
 * reads like a palette and the eye scans it in columns. Each tile is a real
 * radio input, so arrow keys, the checked state and the group label come from
 * the platform. "Not set" comes first, and the current choice is echoed next
 * to the legend so it stays readable without hunting for the dark tile.
 */
export interface LookTile<T extends string> {
  value: T;
  label: string;
  visual: ReactNode;
}

interface LookTileGroupProps<T extends string> {
  label: string;
  options: LookTile<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}

export function LookTileGroup<T extends string>({ label, options, value, onChange }: LookTileGroupProps<T>) {
  const { t } = useTranslation();
  const name = useId();
  const noneLabel = t("admin.form.gemLookNone");
  const current = options.find((option) => option.value === value)?.label ?? noneLabel;

  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-2 flex w-full items-baseline gap-2 p-0 text-[length:var(--text-caption)]">
        <span className="font-semibold text-[var(--text-primary)]">{label}</span>
        <span aria-hidden="true" className="truncate text-[var(--text-muted)]">· {current}</span>
      </legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
        <Tile
          name={name}
          checked={value === undefined}
          onSelect={() => onChange(undefined)}
          label={noneLabel}
          visual={
            <span aria-hidden="true" className="block h-6 w-6 rounded-full border border-dashed border-[var(--border-default)]" />
          }
        />
        {options.map((option) => (
          <Tile
            key={option.value}
            name={name}
            checked={value === option.value}
            onSelect={() => onChange(option.value)}
            label={option.label}
            visual={option.visual}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Tile({
  name,
  checked,
  onSelect,
  label,
  visual,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  visual: ReactNode;
}) {
  return (
    <label className="relative flex cursor-pointer">
      <input type="radio" name={name} className="peer sr-only" checked={checked} onChange={onSelect} />
      <span
        className={clsx(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-[var(--admin-radius-sm)] border px-1.5 py-2.5 text-center text-[length:var(--text-caption)] leading-tight transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
          checked
            ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)] font-semibold text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--gt-ink-900)]"
            : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:border-[var(--gt-ink-900)]",
        )}
      >
        <span className="flex h-7 items-center justify-center">{visual}</span>
        <span>{label}</span>
      </span>
    </label>
  );
}
