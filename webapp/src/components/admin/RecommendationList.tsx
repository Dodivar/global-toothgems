import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Search, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminIconButton } from "./AdminIconButton";
import { Thumb } from "../promotions/ProductPicker";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { formatPrice } from "../../lib/format";
import {
  STOREFRONT_RECOMMENDATION_SLOTS,
  categoryById,
  isRecommendable,
  stockState,
  type AdminProduct,
} from "../../data/adminCatalog";

/** Where a link stands on the storefront today. */
type Placement = "shown" | "reserve" | "draft" | "archived" | "soldOut";

function placements(list: AdminProduct[]): Placement[] {
  let shown = 0;
  return list.map((p) => {
    if (p.status === "draft") return "draft";
    if (p.status === "archived") return "archived";
    if (!isRecommendable(p)) return "soldOut";
    shown += 1;
    return shown <= STOREFRONT_RECOMMENDATION_SLOTS ? "shown" : "reserve";
  });
}

const PLACEMENT_CLASS: Record<Placement, string> = {
  shown: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--gt-emerald-300)]",
  reserve: "bg-[var(--gt-ink-100)] text-[var(--text-body)] border-[var(--border-default)]",
  draft: "bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)] border-[var(--gt-blue-200)]",
  archived: "bg-[var(--gt-ink-100)] text-[var(--text-muted)] border-[var(--border-default)]",
  soldOut: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--gt-red-400)]",
};

/**
 * Ordered list of the products recommended next to one product, for one kind.
 *
 * Order is changed with "up" and "down" buttons rather than drag and drop:
 * they work from the keyboard and with a screen reader, and every move is
 * announced. Each row says whether the storefront shows the link today, so a
 * sold-out or unpublished pick is never a silent gap in the block.
 */
export function RecommendationList({
  title,
  description,
  productId,
  ids,
  onChange,
}: {
  title: string;
  description: string;
  productId: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { products } = useAdminCatalog();
  const baseId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // Where focus goes after the next render: the moved row's button, the row
  // after a removed one, or the add button. A ref, not state: it is consumed
  // by the effect below and must not cause a render of its own.
  const pendingFocus = useRef<{ id: string; control: "up" | "down" | "remove" } | "add" | null>(null);

  const list = useMemo(
    () => ids.map((id) => products.find((p) => p.id === id)).filter((p): p is AdminProduct => Boolean(p)),
    [ids, products],
  );
  const places = useMemo(() => placements(list), [list]);
  const shownCount = places.filter((p) => p === "shown").length;

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.id !== productId &&
        p.status !== "archived" &&
        !ids.includes(p.id) &&
        (!q || [p.name.fr, p.name.en, p.sku, l(categoryById(p.categoryId).name)].join(" ").toLowerCase().includes(q)),
    );
  }, [products, productId, ids, query, l]);

  useEffect(() => {
    if (adding) searchRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "add") {
      sectionRef.current?.querySelector<HTMLButtonElement>('[data-control="add"]')?.focus();
    } else {
      const row = sectionRef.current?.querySelector<HTMLElement>(`[data-rec-id="${target.id}"]`);
      const wanted = row?.querySelector<HTMLButtonElement>(`[data-control="${target.control}"]`);
      // A row moved to an end loses the button it used; keep focus on the row.
      const fallback = row?.querySelector<HTMLButtonElement>("[data-control]:not(:disabled)");
      (wanted && !wanted.disabled ? wanted : fallback)?.focus();
    }
  });

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    pendingFocus.current = { id: ids[index], control: delta < 0 ? "up" : "down" };
    setAnnouncement(t("admin.recommendations.moved", { name: l(list[index].name), position: target + 1, total: ids.length }));
  };

  const remove = (index: number) => {
    const name = l(list[index].name);
    const next = ids.filter((_, i) => i !== index);
    onChange(next);
    const neighbour = next[index] ?? next[index - 1];
    pendingFocus.current = neighbour ? { id: neighbour, control: "remove" } : "add";
    setAnnouncement(t("admin.recommendations.removed", { name }));
  };

  const add = (product: AdminProduct) => {
    onChange([...ids, product.id]);
    setAnnouncement(t("admin.recommendations.added", { name: l(product.name), position: ids.length + 1 }));
    setQuery("");
    searchRef.current?.focus();
  };

  return (
    <section ref={sectionRef} className="gt-admin-panel grid content-start gap-4 p-5" aria-labelledby={`${baseId}-title`}>
      <div className="grid gap-1">
        <h2 id={`${baseId}-title`} className="text-[length:var(--text-h4)]">
          {title}
        </h2>
        <p className="m-0 max-w-[62ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>
      </div>

      <StorefrontPreview list={list} places={places} />

      {list.length === 0 ? (
        <p className="m-0 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] p-4 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("admin.recommendations.empty")}
        </p>
      ) : (
        <ol
          className="m-0 grid list-none gap-2 p-0"
          aria-label={t("admin.recommendations.listLabel", { title, count: list.length, shown: shownCount })}
        >
          {list.map((p, index) => {
            const place = places[index];
            const name = l(p.name);
            return (
              <li
                key={p.id}
                data-rec-id={p.id}
                className={clsx(
                  "flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-2 sm:flex-nowrap",
                  place !== "shown" && place !== "reserve" && "bg-[var(--admin-panel-sunken)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--gt-ink-100)] text-[11px] font-semibold tabular-nums text-[var(--text-body)]"
                >
                  {index + 1}
                </span>
                <Thumb product={p} size={40} />
                <span className="grid min-w-0 flex-1 gap-1 leading-tight">
                  <span className="line-clamp-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                    <span className="sr-only">{t("admin.recommendations.position", { position: index + 1 })} </span>
                    {name}
                  </span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">
                    {l(categoryById(p.categoryId).name)} · {p.sku} · {formatPrice(p.price)}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex w-fit items-center whitespace-nowrap rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] font-semibold",
                      PLACEMENT_CLASS[place],
                    )}
                  >
                    {t(`admin.recommendations.placement.${place}`)}
                  </span>
                </span>
                <span className="ml-auto flex flex-none items-center gap-0.5">
                  <AdminIconButton
                    icon={ArrowUp}
                    size="sm"
                    data-control="up"
                    label={t("admin.recommendations.moveUp", { name })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <AdminIconButton
                    icon={ArrowDown}
                    size="sm"
                    data-control="down"
                    label={t("admin.recommendations.moveDown", { name })}
                    disabled={index === list.length - 1}
                    onClick={() => move(index, 1)}
                  />
                  <AdminIconButton
                    icon={X}
                    size="sm"
                    tone="danger"
                    data-control="remove"
                    label={t("admin.recommendations.remove", { name })}
                    onClick={() => remove(index)}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {adding ? (
        <div className="overflow-hidden rounded-[var(--admin-radius-sm)] border border-[var(--border-default)]">
          <div className="relative flex items-center border-b border-[var(--border-subtle)]">
            <label htmlFor={`${baseId}-q`} className="sr-only">
              {t("admin.recommendations.search")}
            </label>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 text-[var(--text-muted)]" />
            <input
              ref={searchRef}
              id={`${baseId}-q`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  pendingFocus.current = "add";
                  setAdding(false);
                }
              }}
              placeholder={t("admin.recommendations.searchPlaceholder")}
              className="h-10 min-w-0 flex-1 border-0 bg-[var(--admin-panel-sunken)] pl-9 pr-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus-visible:bg-[var(--admin-panel)] focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]"
            />
            <AdminIconButton
              icon={X}
              size="sm"
              className="mx-1"
              label={t("admin.recommendations.closeSearch")}
              onClick={() => {
                pendingFocus.current = "add";
                setAdding(false);
              }}
            />
          </div>
          <ul className="gt-admin-scroll m-0 max-h-[280px] list-none overflow-y-auto p-1">
            {candidates.length === 0 && (
              <li className="px-3 py-6 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {query.trim() ? t("admin.recommendations.noResult", { query }) : t("admin.recommendations.noCandidate")}
              </li>
            )}
            {candidates.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  className="flex w-full items-center gap-3 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <Thumb product={p} size={36} />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                      <span className="sr-only">{t("admin.recommendations.addNamed")} </span>
                      {l(p.name)}
                    </span>
                    <span className="truncate text-[11px] text-[var(--text-muted)]">
                      {l(categoryById(p.categoryId).name)} · {p.sku}
                      {p.status === "draft" && ` · ${t("admin.recommendations.placement.draft")}`}
                      {p.status === "active" && stockState(p) === "out_of_stock" && ` · ${t("admin.recommendations.placement.soldOut")}`}
                    </span>
                  </span>
                  <Plus size={16} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <AdminButton data-control="add" variant="outline" iconLeft={Plus} onClick={() => setAdding(true)} className="justify-self-start">
          {t("admin.recommendations.add")}
        </AdminButton>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

/**
 * What the block looks like on the storefront: the links shown today, then
 * the places the database fills by itself (bought together or same category,
 * then popular products).
 */
function StorefrontPreview({ list, places }: { list: AdminProduct[]; places: Placement[] }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const shown = list.filter((_, i) => places[i] === "shown");
  const autoSlots = STOREFRONT_RECOMMENDATION_SLOTS - shown.length;

  return (
    <figure className="m-0 grid gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-3">
      <figcaption className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
        {t("admin.recommendations.previewTitle")}
      </figcaption>
      <ul className="m-0 grid list-none grid-cols-4 gap-1.5 p-0 sm:gap-2">
        {shown.map((p) => (
          <li key={p.id} className="grid min-w-0 gap-1.5 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-1.5">
            <span className="aspect-square overflow-hidden rounded-[4px] bg-[var(--surface-sunken)]">
              {p.media[0] ? (
                <img src={p.media[0].src} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </span>
            <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{l(p.name)}</span>
          </li>
        ))}
        {Array.from({ length: autoSlots }, (_, i) => (
          <li
            key={`auto-${i}`}
            className="grid min-w-0 place-items-center content-center gap-1 rounded-[6px] border border-dashed border-[var(--border-default)] p-1.5 text-center text-[11px] text-[var(--text-muted)]"
          >
            <Sparkles size={14} aria-hidden="true" />
            {t("admin.recommendations.autoSlot")}
          </li>
        ))}
      </ul>
      {autoSlots > 0 && (
        <p className="m-0 text-[11px] text-[var(--text-muted)]">{t("admin.recommendations.autoHint", { count: autoSlots })}</p>
      )}
    </figure>
  );
}
