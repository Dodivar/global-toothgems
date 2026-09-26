import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProductVariant } from "../../data/products";
import {
  formatSs,
  formatSsMm,
  gemAxes,
  packAvailable,
  pickGemVariant,
  sizeAvailable,
} from "../../lib/gemOptions";

/**
 * Pack × stone-size picker of a gem: two rows of pills instead of one long
 * list of "Pack de 50 · SS6" combinations, because the customer decides the
 * two things separately.
 *
 * Packs stay clickable while any of their sizes can be bought (the size then
 * moves to the nearest one in stock). Sizes follow the chosen pack: one that
 * does not exist or is sold out in that pack is disabled and says so.
 */
interface GemOptionPickerProps {
  variants: ProductVariant[];
  selected: ProductVariant | undefined;
  onSelect: (variant: ProductVariant) => void;
}

export function GemOptionPicker({ variants, selected, onSelect }: GemOptionPickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { packs, sizes } = gemAxes(variants);

  const choose = (want: { pack?: number; ss?: number }) => {
    const next = pickGemVariant(variants, want, selected);
    if (next) onSelect(next);
  };

  return (
    <div className="grid gap-4">
      {packs.length > 0 && (
        <PillGroup legend={t("product.packLabel")}>
          {packs.map((pack) => (
            <Pill
              key={pack}
              name="gem-pack"
              checked={selected?.pack === pack}
              disabled={!packAvailable(variants, pack)}
              onChange={() => choose({ pack })}
              label={t("product.packValue", { count: pack })}
              note={packAvailable(variants, pack) ? undefined : t("product.stockOut")}
            />
          ))}
        </PillGroup>
      )}

      {sizes.length > 0 && (
        <PillGroup legend={t("product.stoneSizeLabel")} hint={t("product.ssApprox")}>
          {sizes.map((ss) => {
            const available = sizeAvailable(variants, ss, selected?.pack);
            return (
              <Pill
                key={ss}
                name="gem-size"
                checked={selected?.ss === ss}
                disabled={!available}
                onChange={() => choose({ ss })}
                label={formatSs(ss)}
                detail={formatSsMm(ss, lang)}
                note={available ? undefined : t("product.optionUnavailable")}
              />
            );
          })}
        </PillGroup>
      )}
    </div>
  );
}

function PillGroup({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="m-0 text-xs text-[var(--text-muted)]">{hint}</p>}
    </fieldset>
  );
}

function Pill({
  name,
  checked,
  disabled,
  onChange,
  label,
  detail,
  note,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
  detail?: string;
  note?: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]"
      style={{
        border: `1px solid ${checked ? "var(--gt-ink-900)" : "var(--border-default)"}`,
        background: checked ? "var(--gt-ink-100)" : "transparent",
        fontWeight: checked ? 600 : 400,
      }}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      {label}
      {detail && <span className="text-xs text-[var(--text-muted)]">{detail}</span>}
      {note && <span className="text-[var(--text-muted)]">· {note}</span>}
    </label>
  );
}
