import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import clsx from "clsx";
import { MoneyInput, NumberInput } from "./AdminNumberInputs";
import { ToggleSwitch } from "./ToggleSwitch";
import { blankGemVariant, offeredGemVariants, type GemOptions, type GemOptionVariant } from "../../data/adminCatalog";
import { comboKey, comboName, formatSs, formatSsMm, GEM_PACKS, STONE_SIZES, type GemOptionKey } from "../../lib/gemOptions";
import { pick } from "../../data/types";

/**
 * Pack (20 / 50 / 100) × stone size (SS) options of a gem.
 *
 * The administrator ticks packs and sizes; every combination becomes a row
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
}

const EMPTY: GemOptions = { enabled: false, packs: [], sizes: [], variants: [] };

export function GemOptionsEditor({ options = EMPTY, productPrice, error, onChange }: GemOptionsEditorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const offered = offeredGemVariants(options);

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
          // First switch-on offers the most common pack, so the grid is never
          // empty on arrival.
          onChange={(enabled) =>
            onChange({ ...options, enabled, packs: enabled && options.packs.length === 0 && options.sizes.length === 0 ? [20] : options.packs })
          }
        />
      </div>

      {options.enabled && (
        <>
          <ChipGroup legend={t("admin.form.optionsPacks")}>
            {GEM_PACKS.map((pack) => (
              <Chip
                key={pack}
                checked={options.packs.includes(pack)}
                onChange={() => onChange({ ...options, packs: toggleIn(options.packs, pack) })}
                label={t("admin.form.optionsPackValue", { count: pack })}
              />
            ))}
          </ChipGroup>

          <ChipGroup legend={t("admin.form.optionsSizes")} hint={t("admin.form.optionsSizesHint")}>
            {STONE_SIZES.map(({ ss }) => (
              <Chip
                key={ss}
                checked={options.sizes.includes(ss)}
                onChange={() => onChange({ ...options, sizes: toggleIn(options.sizes, ss) })}
                label={formatSs(ss)}
                detail={formatSsMm(ss, lang)}
              />
            ))}
          </ChipGroup>

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
                        <tr key={comboKey(variant)} className="border-t border-[var(--border-subtle)]">
                          <th scope="row" className="px-3 py-2 text-left font-semibold">
                            {name}
                            {variant.ss != null && formatSsMm(variant.ss, lang) && (
                              <span className="block text-[length:var(--text-caption)] font-normal text-[var(--text-muted)]">
                                {formatSsMm(variant.ss, lang)}
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

function ChipGroup({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}
    </fieldset>
  );
}

/** A checkbox drawn as a pill: the input stays real, so keyboard and screen readers get a checkbox. */
function Chip({ checked, onChange, label, detail }: { checked: boolean; onChange: () => void; label: string; detail?: string }) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
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
