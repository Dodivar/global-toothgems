import { useState } from "react";

/**
 * Numeric fields of the admin forms (product form, gem options grid).
 */

export interface NumberInputProps {
  id?: string;
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  onBlur?: () => void;
  min?: number;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

/**
 * Numeric entry that keeps what was typed.
 *
 * Parsing straight into the number would erase a half-typed "1." or refuse to
 * let the field be emptied; the text is held locally and only the parsed value
 * travels up.
 */
export function NumberInput({ value, onValueChange, min, ...rest }: NumberInputProps) {
  const [text, setText] = useState(value == null ? "" : String(value));

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      step={1}
      className="gt-admin-field tabular-nums"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = e.target.value === "" ? undefined : Number(e.target.value);
        onValueChange(parsed != null && Number.isFinite(parsed) ? parsed : undefined);
      }}
    />
  );
}

/** Same, with a currency affix. The prototype trades in euro only. */
export function MoneyInput({ value, onValueChange, ...rest }: NumberInputProps) {
  const [text, setText] = useState(value == null ? "" : String(value));

  return (
    <span className="relative block">
      <input
        {...rest}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        className="gt-admin-field pr-9 tabular-nums"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = e.target.value === "" ? undefined : Number(e.target.value);
          onValueChange(parsed != null && Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]"
      >
        €
      </span>
    </span>
  );
}
