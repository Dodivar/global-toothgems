import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PackagePlus } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/Dialog";
import { AdminButton } from "./AdminButton";
import { useLocalized } from "../../lib/localized";
import { stockChange, type StockChange, type StockChangeMode } from "../../lib/stockAdjustment";
import { inventoryState, type AdminProduct, type StockState, type VariantStock } from "../../data/adminCatalog";

/** One stock row of the pop-up: the product itself, or one of its variants. */
interface StockLine {
  /** `null` = the product's own stock; otherwise the variant's list key. */
  key: string | null;
  label: string;
  sku?: string;
  tracked: boolean;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
}

/** A change ready to send, as the page hands it to the store. */
export interface RestockRequest {
  variantKey: string | null;
  delta: number;
  /** The count the change started from; sent only for an exact count. */
  expected?: number;
}

const QUICK_ADDS = [10, 25, 50, 100];

const STATE_TONE: Record<StockState, string> = {
  in_stock: "text-[var(--text-body)]",
  low_stock: "text-[var(--status-warning-fg)]",
  out_of_stock: "text-[var(--status-error-fg)]",
  preorder: "text-[var(--gt-blue-700)]",
};

const OPTION_RANK: Record<StockState, number> = { out_of_stock: 0, low_stock: 1, in_stock: 2, preorder: 2 };

/** The options to restock first, like the list's option rows; otherwise the product's order. */
function alertsFirst(variants: VariantStock[]): VariantStock[] {
  return [...variants].sort((a, b) => OPTION_RANK[inventoryState(a)] - OPTION_RANK[inventoryState(b)]);
}

function lineState(line: StockLine): StockState {
  return inventoryState({
    trackInventory: line.tracked,
    stock: line.stock,
    reserved: line.reserved,
    lowStockThreshold: line.lowStockThreshold,
    availability: "in_stock",
  });
}

/**
 * The quick restock of the product list: change a product's stock, or each of
 * its variants', without opening the edit form.
 *
 * The administrator either adds what was received (the usual case, with
 * one-click amounts) or types the exact count after a stocktake. Nothing is
 * computed against a stale count: the store sends a relative change that the
 * database applies atomically (`admin_adjust_stock()`), and an exact count is
 * refused there if a sale moved the shelf in the meantime.
 */
export function RestockDialog({
  product,
  focusKey = null,
  onClose,
  onSave,
}: {
  /** The product to restock; null keeps the dialog closed. Key the dialog by product for a fresh form. */
  product: AdminProduct | null;
  /** Variant to put the caret on, when opened from an option row. */
  focusKey?: string | null;
  onClose: () => void;
  /** Sends the changes in order; resolves to how many were saved before any refusal. */
  onSave: (product: AdminProduct, requests: RestockRequest[]) => Promise<number>;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const [mode, setMode] = useState<StockChangeMode>("add");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const productId = product?.id;

  const lines: StockLine[] = !product
    ? []
    : product.variantStock?.length
      ? alertsFirst(product.variantStock).map((variant) => ({
          key: variant.key,
          label: L(variant.name),
          sku: variant.sku,
          tracked: variant.trackInventory,
          stock: variant.stock,
          reserved: variant.reserved ?? 0,
          lowStockThreshold: variant.lowStockThreshold,
        }))
      : [
          {
            key: null,
            label: L(product.name),
            sku: product.sku,
            tracked: product.trackInventory,
            stock: product.stock,
            reserved: product.reserved ?? 0,
            lowStockThreshold: product.lowStockThreshold,
          },
        ];
  const single = lines.length === 1 && lines[0].key === null;
  const idOf = (line: StockLine) => line.key ?? "";

  // Put the caret where the administrator will type: the option they came
  // from, else the first stock that can change. Runs after the dialog's own
  // focus handling (a child's effects run first).
  useEffect(() => {
    if (!productId) return;
    const target = inputs.current.get(focusKey ?? "") ?? inputs.current.values().next().value;
    target?.focus();
  }, [productId, focusKey]);

  const changes = lines.map((line) => {
    const raw = values[idOf(line)] ?? "";
    return { line, raw, change: line.tracked ? stockChange(mode, line.stock, line.reserved, raw) : null };
  });
  // On a product with variants, an option left blank is left alone.
  const blocking = changes.filter(
    ({ change }) => change?.error && (single || (change.error !== "empty" && change.error !== "unchanged")),
  );
  const ready = changes.filter(({ change }) => change && !change.error);
  const canSave = ready.length > 0 && blocking.length === 0;

  const setValue = (line: StockLine, value: string) => setValues((prev) => ({ ...prev, [idOf(line)]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!product || !canSave || busy) return;
    setBusy(true);
    const requests = ready.map(({ line, change }) => ({
      variantKey: line.key,
      delta: change!.delta,
      ...(mode === "set" ? { expected: line.stock } : {}),
    }));
    const saved = await onSave(product, requests);
    setBusy(false);
    if (saved === requests.length) {
      onClose();
      return;
    }
    // A refusal keeps what is still to save (the store has already said why);
    // the lines saved before it are cleared, so a second try cannot add them twice.
    const done = new Set(requests.slice(0, saved).map((request) => request.variantKey ?? ""));
    setValues((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !done.has(key))));
    setSubmitted(false);
  };

  const errorText = (change: StockChange, line: StockLine) =>
    t(`admin.restock.errors.${change.error}`, { count: line.reserved });

  return (
    <Dialog
      open={product !== null}
      onClose={busy ? () => undefined : onClose}
      closeLabel={t("common.close")}
      size={single ? "md" : "lg"}
      icon={<PackagePlus size={17} aria-hidden="true" />}
      title={t("admin.restock.title")}
      description={product ? `${L(product.name)}${product.sku ? ` · ${product.sku}` : ""}` : undefined}
      footer={
        <>
          <AdminButton variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </AdminButton>
          <AdminButton variant="dark" type="submit" form="gt-restock-form" loading={busy} disabled={submitted && !canSave}>
            {t(mode === "add" ? "admin.restock.saveAdd" : "admin.restock.saveSet")}
          </AdminButton>
        </>
      }
    >
      <form id="gt-restock-form" noValidate onSubmit={submit} className="grid gap-4">
        <fieldset className="m-0 grid gap-1.5 border-0 p-0">
          <legend className="mb-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            {t("admin.restock.modeLabel")}
          </legend>
          <div className="inline-grid grid-cols-2 gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-1">
            {(["add", "set"] as const).map((option) => (
              <label
                key={option}
                className={clsx(
                  "cursor-pointer rounded-[var(--admin-radius-sm)] px-3 py-1.5 text-center text-[length:var(--text-body-sm)] font-semibold transition-colors",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--focus-ring)]",
                  mode === option
                    ? "bg-[var(--admin-panel)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                )}
              >
                <input
                  type="radio"
                  name="gt-restock-mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => {
                    setMode(option);
                    setValues({});
                    setSubmitted(false);
                  }}
                  className="sr-only"
                />
                {t(`admin.restock.mode.${option}`)}
              </label>
            ))}
          </div>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t(`admin.restock.modeHint.${mode}`)}
          </p>
        </fieldset>

        {single ? (
          <SingleLine
            entry={changes[0]}
            mode={mode}
            showError={submitted}
            errorText={errorText}
            onChange={(value) => setValue(lines[0], value)}
            inputRef={(el) => (el ? inputs.current.set("", el) : inputs.current.delete(""))}
          />
        ) : (
          <div className="grid gap-0 overflow-hidden rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)]">
            {changes.map((entry) => (
              <VariantLine
                key={idOf(entry.line)}
                entry={entry}
                mode={mode}
                showError={submitted}
                errorText={errorText}
                onChange={(value) => setValue(entry.line, value)}
                inputRef={(el) =>
                  el ? inputs.current.set(idOf(entry.line), el) : inputs.current.delete(idOf(entry.line))
                }
              />
            ))}
          </div>
        )}

        {submitted && !single && ready.length === 0 && blocking.length === 0 && (
          <p role="alert" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
            {t("admin.restock.errors.nothing")}
          </p>
        )}
      </form>
    </Dialog>
  );
}

interface LineEntry {
  line: StockLine;
  raw: string;
  change: StockChange | null;
}

interface LineProps {
  entry: LineEntry;
  mode: StockChangeMode;
  showError: boolean;
  errorText: (change: StockChange, line: StockLine) => string;
  onChange: (value: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}

/** What the shelf will read once saved: the count and the word for it. */
function NextStock({ line, next }: { line: StockLine; next: number }) {
  const { t } = useTranslation();
  const state = inventoryState({
    trackInventory: true,
    stock: next,
    reserved: line.reserved,
    lowStockThreshold: line.lowStockThreshold,
    availability: "in_stock",
  });
  return (
    <span className={clsx("font-semibold tabular-nums", STATE_TONE[state])}>
      {t("admin.stock.units", { count: next })} · {t(`admin.stock.${state}`)}
    </span>
  );
}

function CurrentStock({ line }: { line: StockLine }) {
  const { t } = useTranslation();
  return (
    <>
      {t("admin.stock.units", { count: line.stock })}
      {line.reserved > 0 && ` · ${t("admin.stock.reserved", { count: line.reserved })}`}
    </>
  );
}

function SingleLine({ entry, mode, showError, errorText, onChange, inputRef }: LineProps) {
  const { t } = useTranslation();
  const { line, raw, change } = entry;
  const error = showError && change?.error ? errorText(change, line) : null;
  const add = (amount: number) => onChange(String((Number(raw) || 0) + amount));

  return (
    <div className="grid gap-3">
      <dl className="m-0 grid grid-cols-2 gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-body-sm)]">
        <div className="grid gap-0.5">
          <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.restock.current")}</dt>
          <dd className="m-0 font-semibold tabular-nums text-[var(--text-primary)]">
            <CurrentStock line={line} />
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.restock.next")}</dt>
          <dd className="m-0" aria-live="polite">
            {change && !change.error ? <NextStock line={line} next={change.next} /> : <span aria-hidden="true">—</span>}
          </dd>
        </div>
      </dl>

      <label className="grid gap-1.5">
        <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
          {t(`admin.restock.inputLabel.${mode}`)}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={raw}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "gt-restock-error" : undefined}
          placeholder={mode === "add" ? "0" : String(line.stock)}
          className="gt-admin-field max-w-[200px] tabular-nums"
        />
      </label>

      {mode === "add" && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ADDS.map((amount) => (
            <AdminButton
              key={amount}
              size="sm"
              variant="outline"
              onClick={() => add(amount)}
              aria-label={t("admin.restock.quickAdd", { count: amount })}
            >
              +{amount}
            </AdminButton>
          ))}
        </div>
      )}

      {error && (
        <p id="gt-restock-error" role="alert" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** One option of a product with variants: its stock now, the field, and the result. */
function VariantLine({ entry, mode, showError, errorText, onChange, inputRef }: LineProps) {
  const { t } = useTranslation();
  const { line, raw, change } = entry;
  const errorId = `gt-restock-error-${line.key}`;
  const shown = change?.error && change.error !== "empty" && change.error !== "unchanged";
  const error = showError && shown ? errorText(change!, line) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,160px)]">
      <div className="min-w-0">
        <span className="block truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {line.label}
        </span>
        <span className="block text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
          {line.tracked ? (
            <span className={clsx(lineState(line) !== "in_stock" && ["font-semibold", STATE_TONE[lineState(line)]])}>
              <CurrentStock line={line} />
              {lineState(line) !== "in_stock" && ` · ${t(`admin.stock.${lineState(line)}`)}`}
            </span>
          ) : (
            t("admin.stock.untracked")
          )}
          {line.sku && <span className="font-[family-name:var(--gt-font-mono)]"> · {line.sku}</span>}
        </span>
      </div>
      {line.tracked ? (
        <>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={raw}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t(`admin.restock.optionInput.${mode}`, { option: line.label })}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder={mode === "add" ? "+0" : String(line.stock)}
            className="gt-admin-field w-24 text-right tabular-nums"
          />
          <span aria-live="polite" className="col-span-2 text-[length:var(--text-caption)] sm:col-span-1 sm:text-right">
            {change && !change.error ? <NextStock line={line} next={change.next} /> : null}
          </span>
        </>
      ) : (
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)] sm:col-span-2 sm:text-right">
          {t("admin.restock.untrackedOption")}
        </span>
      )}
      {error && (
        <p id={errorId} role="alert" className="col-span-full m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}
