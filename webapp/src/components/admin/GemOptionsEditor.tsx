import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Info, Plus, X } from "lucide-react";
import clsx from "clsx";
import { MoneyInput, NumberInput } from "./AdminNumberInputs";
import { ToggleSwitch } from "./ToggleSwitch";
import { AdminButton } from "./AdminButton";
import { blankGemVariant, offeredGemVariants, type GemOptions, type GemOptionVariant } from "../../data/adminCatalog";
import {
  comboKey,
  comboName,
  formatSize,
  formatSizeDetail,
  MM_MAX,
  MM_MIN,
  PACK_MAX,
  PACK_MIN,
  parsePackCount,
  parseSizeInput,
  sameSize,
  sizeKey,
  sizeLongestMm,
  sizeMode,
  sortSizes,
  STONE_SIZES,
  type GemOptionKey,
  type GemSize,
  type SizeMode,
} from "../../lib/gemOptions";
import { pick } from "../../data/types";

/**
 * Pack × size options of a gem.
 *
 * The administrator types the packs this product is sold in (any number of
 * stones) and its sizes — SS gauges ticked for a round stone, or millimetre
 * dimensions typed freely for any other cut ("2x4", "2,5"; decision 107) —
 * and every combination becomes a row
 * with its own price and stock. Rows are derived, not added one by one, so the
 * offer is always a complete grid and a customer never meets a pack that
 * exists in one size only by mistake.
 */

interface GemOptionsEditorProps {
  options: GemOptions | undefined;
  /** Placeholder of an empty option price. */
  productPrice: number;
  error?: string;
  onChange: (options: GemOptions) => void;
  /**
   * `comboKey()` of the option to bring forward on arrival (the product
   * list links here from an option row): scrolled into view, highlighted, its
   * stock field focused. A key the grid does not show is ignored.
   */
  focusOption?: string | null;
  /** How a product without sizes yet is sized: SS for a round stone, millimetres for any other cut. */
  defaultSizeMode: SizeMode;
}

const EMPTY: GemOptions = { enabled: false, packs: [], sizes: [], variants: [] };

export function GemOptionsEditor({ options = EMPTY, productPrice, error, onChange, focusOption, defaultSizeMode }: GemOptionsEditorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const mode = options.sizeMode ?? defaultSizeMode;
  const modeSizes = options.sizes.filter((size) => sizeMode(size) === mode);
  // Sizes of the other way stay in the draft (not offered): switching back gives them back.
  const setSizes = (sizes: GemSize[]) => onChange({ ...options, sizeMode: mode, sizes });
  const toggleSize = (size: GemSize) =>
    setSizes(options.sizes.some((s) => sameSize(s, size)) ? options.sizes.filter((s) => !sameSize(s, size)) : sortSizes([...options.sizes, size]));
  const offered = offeredGemVariants(options);
  const target = focusOption && offered.some((v) => comboKey(v) === focusOption) ? focusOption : null;
  const arrived = useRef(false);

  // Once, on arrival: ticking and unticking options later must not pull the
  // focus back to this row.
  useEffect(() => {
    if (arrived.current || !target) return;
    arrived.current = true;
    const input = document.getElementById(stockFieldId(target));
    input?.closest("tr")?.scrollIntoView({ block: "center" });
    input?.focus({ preventScroll: true });
  }, [target]);

  const toggleIn = (list: number[], value: number) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value].sort((a, b) => a - b);

  /** Values typed in a row, kept in `variants` so unticking an axis does not lose them. */
  const updateVariant = (key: GemOptionKey, patch: Partial<GemOptionVariant>) => {
    const id = comboKey(key);
    const exists = options.variants.some((v) => comboKey(v) === id);
    onChange({
      ...options,
      variants: exists
        ? options.variants.map((v) => (comboKey(v) === id ? { ...v, ...patch } : v))
        : [...options.variants, { ...blankGemVariant(key), ...patch }],
    });
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
        <ToggleSwitch
          label={t("admin.form.optionsToggle")}
          description={t("admin.form.optionsToggleHint")}
          checked={options.enabled}
          onChange={(enabled) => onChange({ ...options, enabled })}
        />
      </div>

      {options.enabled && (
        <>
          <PackList
            packs={options.packs}
            onAdd={(pack) => onChange({ ...options, packs: toggleIn(options.packs, pack) })}
            onRemove={(pack) => onChange({ ...options, packs: options.packs.filter((p) => p !== pack) })}
          />

          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="mb-2 p-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              {t("admin.form.optionsSizes")}
            </legend>
            <div role="radiogroup" aria-label={t("admin.form.optionsSizeMode")} className="flex flex-wrap gap-2">
              {(["ss", "mm"] as const).map((value) => (
                <Chip
                  key={value}
                  type="radio"
                  name="gem-size-mode"
                  checked={mode === value}
                  onChange={() => onChange({ ...options, sizeMode: value })}
                  label={t(value === "ss" ? "admin.form.optionsSizeModeSs" : "admin.form.optionsSizeModeMm")}
                />
              ))}
            </div>
            {mode === "ss" ? (
              <ChipGroup legend={t("admin.form.optionsSizesSs")} hint={t("admin.form.optionsSizesHint")}>
                {STONE_SIZES.map(({ ss }) => (
                  <Chip
                    key={ss}
                    checked={modeSizes.some((s) => s.ss === ss)}
                    onChange={() => toggleSize({ ss })}
                    label={formatSize({ ss }, lang)}
                    detail={formatSizeDetail({ ss }, lang)}
                  />
                ))}
              </ChipGroup>
            ) : (
              <SizeList
                sizes={modeSizes}
                onAdd={(size) => setSizes(sortSizes([...options.sizes, size]))}
                onRemove={(size) => setSizes(options.sizes.filter((s) => !sameSize(s, size)))}
              />
            )}
          </fieldset>

          {offered.length === 0 ? (
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.form.optionsNone")}</p>
          ) : (
            <div className="grid gap-2">
              <p className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
                {t("admin.form.optionsCount", { count: offered.length })}
              </p>
              {/* A real table: four columns read across a row, and a screen
                  reader announces which option each field belongs to. */}
              <div className="overflow-x-auto rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)]">
                <table className="w-full min-w-[520px] border-collapse text-[length:var(--text-body-sm)]">
                  <thead className="bg-[var(--admin-panel-sunken)] text-left text-[10px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("admin.form.optionsColOption")}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("admin.form.optionsColPrice")}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("admin.form.optionsColStock")}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{t("admin.form.optionsColThreshold")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offered.map((variant) => {
                      const name = pick(comboName(variant), lang);
                      return (
                        <tr
                          key={comboKey(variant)}
                          className={clsx(
                            "border-t border-[var(--border-subtle)]",
                            comboKey(variant) === target && "bg-[var(--status-warning-bg)]",
                          )}
                        >
                          <th scope="row" className="px-3 py-2 text-left font-semibold">
                            {name}
                            {variant.size && formatSizeDetail(variant.size, lang) && (
                              <span className="block text-[length:var(--text-caption)] font-normal text-[var(--text-muted)]">
                                {formatSizeDetail(variant.size, lang)}
                              </span>
                            )}
                          </th>
                          <td className="px-3 py-2">
                            <MoneyInput
                              aria-label={t("admin.form.optionsPriceLabel", { option: name })}
                              value={variant.price}
                              placeholder={String(productPrice)}
                              onValueChange={(price) => updateVariant(variant, { price })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumberInput
                              id={stockFieldId(comboKey(variant))}
                              aria-label={t("admin.form.optionsStockLabel", { option: name })}
                              value={variant.stock}
                              min={0}
                              onValueChange={(stock) => updateVariant(variant, { stock: stock ?? 0 })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumberInput
                              aria-label={t("admin.form.optionsThresholdLabel", { option: name })}
                              value={variant.lowStockThreshold}
                              min={0}
                              onValueChange={(value) => updateVariant(variant, { lowStockThreshold: value ?? 0 })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.optionsPriceHint")}</p>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
          {error}
        </p>
      )}

      <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
        {t("admin.form.optionsRemoveNotice")}
      </p>
    </div>
  );
}

/** Id of an option's stock field, for the arrival focus. */
function stockFieldId(key: string): string {
  return `gem-option-stock-${key}`;
}

/**
 * The packs of this product: one removable pill each, and a field to add one.
 * A removed pack keeps its typed price and stock in `variants`, so adding the
 * same number back restores them.
 */
function PackList({ packs, onAdd, onRemove }: { packs: number[]; onAdd: (pack: number) => void; onRemove: (pack: number) => void }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const sorted = [...packs].sort((a, b) => a - b);

  const add = () => {
    const pack = parsePackCount(text);
    if (pack == null) {
      setError(t("admin.form.optionsPackInvalid", { min: PACK_MIN, max: PACK_MAX.toLocaleString(i18n.language) }));
      return;
    }
    if (packs.includes(pack)) {
      setError(t("admin.form.optionsPackDuplicate", { count: pack }));
      return;
    }
    onAdd(pack);
    setText("");
    setError(null);
  };

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
        {t("admin.form.optionsPacks")}
      </legend>
      {sorted.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {sorted.map((pack) => (
            <li
              key={pack}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] py-1 pl-3 pr-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-inverse)]"
            >
              {t("admin.form.optionsPackValue", { count: pack })}
              <button
                type="button"
                // The pill and its button disappear: keep the keyboard user in the list's field.
                onClick={() => {
                  onRemove(pack);
                  inputRef.current?.focus();
                }}
                aria-label={t("admin.form.optionsPackRemove", { count: pack })}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--gt-ink-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t("admin.form.optionsPackInputLabel")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="number"
          inputMode="numeric"
          min={PACK_MIN}
          max={PACK_MAX}
          step={1}
          className="gt-admin-field w-40 tabular-nums"
          placeholder={t("admin.form.optionsPackInputLabel")}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          // Enter adds the pack; it must not submit the product form.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <AdminButton variant="outline" iconLeft={Plus} onClick={add}>
          {t("admin.form.optionsPackAdd")}
        </AdminButton>
      </div>
      <p id={errorId} aria-live="polite" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)] empty:hidden">
        {error ?? ""}
      </p>
    </fieldset>
  );
}

/**
 * Millimetre sizes of this product, typed freely: one removable pill each,
 * and a field that reads "2x4", "2 × 4 mm" or "2,5" and says, as it is typed,
 * which size it will add — the shop shows that name and the 3D Studio draws
 * the stone at its longest side.
 */
function SizeList({ sizes, onAdd, onRemove }: { sizes: GemSize[]; onAdd: (size: GemSize) => void; onRemove: (size: GemSize) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = text.trim() ? parseSizeInput(text, "mm") : null;
  const mm = (n: number) => (lang.startsWith("en") ? String(n) : String(n).replace(".", ","));

  const add = () => {
    if (!parsed) {
      setError(t("admin.form.optionsSizeInvalid", { min: mm(MM_MIN), max: mm(MM_MAX) }));
      return;
    }
    if (sizes.some((s) => sameSize(s, parsed))) {
      setError(t("admin.form.optionsSizeDuplicate", { size: formatSize(parsed, lang) }));
      return;
    }
    onAdd(parsed);
    setText("");
    setError(null);
  };

  return (
    <div className="grid gap-2">
      {sizes.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t("admin.form.optionsSizesMm")}>
          {sizes.map((size) => (
            <li
              key={sizeKey(size)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] py-1 pl-3 pr-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-inverse)]"
            >
              {formatSize(size, lang)}
              <button
                type="button"
                // The pill and its button disappear: keep the keyboard user in the list's field.
                onClick={() => {
                  onRemove(size);
                  inputRef.current?.focus();
                }}
                aria-label={t("admin.form.optionsSizeRemove", { size: formatSize(size, lang) })}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--gt-ink-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t("admin.form.optionsSizeInputLabel")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={20}
          className="gt-admin-field w-40"
          placeholder={t("admin.form.optionsSizePlaceholder")}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          // Enter adds the size; it must not submit the product form.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <AdminButton variant="outline" iconLeft={Plus} onClick={add}>
          {t("admin.form.optionsSizeAdd")}
        </AdminButton>
      </div>
      <p id={hintId} aria-live="polite" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {parsed
          ? t("admin.form.optionsSizePreview", { size: formatSize(parsed, lang), length: mm(sizeLongestMm(parsed)) })
          : t("admin.form.optionsSizesMmHint")}
      </p>
      <p id={errorId} aria-live="polite" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)] empty:hidden">
        {error ?? ""}
      </p>
    </div>
  );
}

function ChipGroup({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}
    </fieldset>
  );
}

/** A checkbox (or radio) drawn as a pill: the input stays real, so keyboard and screen readers get the real control. */
function Chip({
  checked,
  onChange,
  label,
  detail,
  type = "checkbox",
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  detail?: string;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input type={type} name={name} className="peer sr-only" checked={checked} onChange={onChange} />
      <span
        className={clsx(
          "inline-flex items-baseline gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1.5 text-[length:var(--text-body-sm)] transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
          checked
            ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
            : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
        )}
      >
        <span className="font-semibold">{label}</span>
        {detail && <span className={clsx("text-[length:var(--text-caption)]", checked ? "opacity-80" : "text-[var(--text-muted)]")}>{detail}</span>}
      </span>
    </label>
  );
}
