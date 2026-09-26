import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ImageOff, Search, X } from "lucide-react";
import clsx from "clsx";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { formatPrice } from "../../lib/format";
import type { AdminProduct } from "../../data/adminCatalog";

/**
 * Searchable product selector with thumbnails.
 *
 * Built from real checkboxes (or radios in single mode) inside a scrolling
 * list: the platform supplies the role, the state, Space to toggle and Tab to
 * move, and a screen reader hears "Crystal Star, checkbox, checked" without any
 * ARIA re-implementation. The selection is repeated above the list as
 * removable chips, so what is chosen stays visible while the search narrows
 * what is shown.
 */
export function ProductPicker({
  label,
  hint,
  selected,
  onChange,
  single = false,
  error,
  excludeIds = [],
}: {
  label: string;
  hint?: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
  error?: string;
  excludeIds?: string[];
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { products, categoryById } = useAdminCatalog();
  const [query, setQuery] = useState("");
  const id = useId();

  const available = useMemo(
    () => products.filter((p) => p.status !== "archived" && !excludeIds.includes(p.id)),
    [products, excludeIds],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((p) =>
      [p.name.fr, p.name.en, p.sku, l(categoryById(p.categoryId).name)].join(" ").toLowerCase().includes(q),
    );
  }, [available, query, l]);

  const chosen = selected.map((sid) => products.find((p) => p.id === sid)).filter(Boolean) as AdminProduct[];

  const toggle = (pid: string) => {
    if (single) onChange([pid]);
    else onChange(selected.includes(pid) ? selected.filter((s) => s !== pid) : [...selected, pid]);
  };

  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}>
      <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{label}</legend>
      {hint && (
        <p id={`${id}-hint`} className="m-0 -mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {hint}
        </p>
      )}

      {chosen.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t("promo.picker.selected", { count: chosen.length })}>
          {chosen.map((p) => (
            <li key={p.id}>
              <span className="gt-pop-in inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--admin-panel)] pl-1 pr-1 text-[length:var(--text-caption)] font-medium text-[var(--text-primary)]">
                <Thumb product={p} size={24} />
                <span className="max-w-[18ch] truncate">{l(p.name)}</span>
                {!single && (
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-label={t("promo.picker.remove", { name: l(p.name) })}
                    className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={clsx("overflow-hidden rounded-[var(--admin-radius-sm)] border", error ? "border-[var(--gt-red-500)]" : "border-[var(--border-default)]")}>
        <div className="relative border-b border-[var(--border-subtle)]">
          <label htmlFor={`${id}-q`} className="sr-only">
            {t("promo.picker.search")}
          </label>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("promo.picker.placeholder")}
            className="h-10 w-full border-0 bg-[var(--admin-panel-sunken)] pl-9 pr-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus-visible:bg-[var(--admin-panel)] focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]"
          />
        </div>
        <ul className="gt-admin-scroll m-0 max-h-[248px] list-none overflow-y-auto p-1" aria-live="polite">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("promo.picker.noResult", { query })}
            </li>
          )}
          {results.map((p) => {
            const on = selected.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-[6px] px-2 py-1.5 transition-colors",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                    on ? "bg-[var(--gt-blue-50)]" : "hover:bg-[var(--gt-ink-100)]",
                  )}
                >
                  <input
                    type={single ? "radio" : "checkbox"}
                    name={single ? `${id}-single` : undefined}
                    checked={on}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
                  />
                  <Thumb product={p} size={36} />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{l(p.name)}</span>
                    <span className="truncate text-[11px] text-[var(--text-muted)]">
                      {l(categoryById(p.categoryId).name)} · {p.sku}
                      {p.status === "draft" && ` · ${t("promo.picker.draft")}`}
                    </span>
                  </span>
                  <span className="flex-none text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-body)]">
                    {formatPrice(p.price)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      {error && (
        <p id={`${id}-err`} className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function Thumb({ product, size = 36 }: { product: AdminProduct; size?: number }) {
  const src = product.media[0]?.src;
  return (
    <span
      className="grid flex-none place-items-center overflow-hidden rounded-[6px] bg-[var(--surface-sunken)] text-[var(--text-subtle)]"
      style={{ width: size, height: size }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff size={size / 2.4} aria-hidden="true" />}
    </span>
  );
}

/** Read-only strip of products, each a link to its catalogue page. */
export function ProductStrip({ ids, max = 6, emptyLabel }: { ids: string[]; max?: number; emptyLabel?: string }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { products, categoryById } = useAdminCatalog();
  const list = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as AdminProduct[];
  if (list.length === 0) return emptyLabel ? <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{emptyLabel}</p> : null;
  const shown = list.slice(0, max);
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
      {shown.map((p) => (
        <li key={p.id}>
          <Link
            to={`/admin/produits/${p.id}`}
            className="group flex items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-2 transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Thumb product={p} size={40} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] group-hover:underline">{l(p.name)}</span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {l(categoryById(p.categoryId).name)} · {formatPrice(p.price)}
              </span>
            </span>
          </Link>
        </li>
      ))}
      {list.length > max && (
        <li className="grid place-items-center rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] p-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("promo.picker.more", { count: list.length - max })}
        </li>
      )}
    </ul>
  );
}

/** Product ids per category, for scope resolution. */
export function useProductsByCategory() {
  const { products } = useAdminCatalog();
  return useMemo(() => {
    const map = new Map<string, string[]>();
    products.forEach((p) => map.set(p.categoryId, [...(map.get(p.categoryId) ?? []), p.id]));
    return (categoryId: string) => map.get(categoryId) ?? [];
  }, [products]);
}
