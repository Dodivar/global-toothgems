import { useState } from "react";
import clsx from "clsx";
import { Check, ExternalLink, ShoppingBag } from "lucide-react";
import { GemPhoto } from "./PieceIcon";
import { useEditorLabels } from "./editorLabels";
import type { PlacedJewelry } from "../../../data/studioEditor";
import { useCart, type CartLine } from "../../../lib/cart";
import { formatSs } from "../../../lib/gemOptions";
import { useLocalized } from "../../../lib/localized";
import { Link } from "../../../lib/navigation";
import type { EstimateLine, StudioGem } from "../../../lib/studio3d/gemCatalog";
import { notify } from "../../../lib/studio3d/notices";
import { useCompositionEstimate, useStudioGems } from "../../../lib/studio3d/useStudioGems";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * The design's shopping list: the shop items it takes (the pieces' colour and
 * size, in the smallest pack that covers them — `estimateComposition`), their
 * stock, and one button that puts every orderable item in the customer's cart.
 *
 * The prices shown are the catalogue's display prices; the cart is priced
 * again by the database at checkout (AGENTS.md §8).
 */
export function ShoppingList({ jewels }: { jewels: PlacedJewelry[] }) {
  const { t, formatEstimate } = useEditorLabels();
  const l = useLocalized();
  const { byKey } = useStudioGems();
  const { addLines } = useCart();
  const estimate = useCompositionEstimate(jewels);
  const [added, setAdded] = useState(false);

  const orderable = estimate.lines.filter((line) => line.stock !== "out");
  const outOfStock = estimate.lines.length - orderable.length;

  const cartLine = (line: EstimateLine, gem: StudioGem): Omit<CartLine, "id"> => ({
    productId: gem.slug,
    dbProductId: gem.key,
    ...(line.offer.variantId ? { variantId: line.offer.variantId } : {}),
    ...(line.offer.name ? { variant: l(line.offer.name) } : {}),
    name: l(gem.name),
    image: line.offer.image ?? gem.image,
    // Indicative only: the checkout recomputes every price server-side.
    unitPrice: line.unitMinor,
    currency: gem.currency,
    qty: line.quantity,
  });

  const addAll = () => {
    const toAdd = orderable.flatMap((line) => {
      const gem = byKey.get(line.productId);
      return gem ? [cartLine(line, gem)] : [];
    });
    if (!toAdd.length) return;
    addLines(toAdd);
    setAdded(true);
    notify("addedToCart", { count: toAdd.reduce((sum, item) => sum + item.qty, 0) });
  };

  if (!jewels.length) return <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.editor.inspector.designEmpty")}</p>;

  return (
    <>
      <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-1.5 p-0">
        {estimate.lines.map((line) => {
          const gem = byKey.get(line.productId);
          if (!gem) return null;
          const finish = gem.finishes.find((f) => f.variantId === line.variantId) ?? gem.finishes[0];
          // A colour or another kind of option is named as the shop names it; packs and sizes are spelled out.
          const ss = line.ss ?? line.offer.ss;
          const detail = [
            line.offer.name && line.offer.pack == null && line.offer.ss == null ? l(line.offer.name) : null,
            line.offer.pack != null ? t("studio.editor.shopping.pack", { count: line.offer.pack }) : null,
            ss != null ? formatSs(ss) : null,
          ].filter(Boolean);
          const out = line.stock === "out";
          return (
            <li
              key={`${line.productId}|${line.variantId ?? ""}|${line.ss ?? ""}`}
              className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-2.5 py-2"
            >
              <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-card)]">
                <GemPhoto src={line.offer.image ?? finish.image ?? gem.image} look={finish.look} size={30} />
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <Link
                  to={`/boutique/${gem.slug}`}
                  target="_blank"
                  rel="noopener"
                  className={clsx("truncate text-[12px] font-semibold text-[var(--text-primary)] underline-offset-2 hover:underline", focusRing)}
                  title={l(gem.name)}
                >
                  {l(gem.name)}
                </Link>
                {detail.length > 0 && <span className="truncate text-[11px] text-[var(--text-body)]">{detail.join(" · ")}</span>}
                <span className="text-[11px] text-[var(--text-muted)]">
                  {t("studio.editor.shopping.cover", { count: line.pieces, quantity: line.quantity })}
                </span>
                {line.stock && (
                  <span
                    className={clsx(
                      "mt-0.5 w-fit rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-[.06em]",
                      out ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]" : "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
                    )}
                  >
                    {t(out ? "studio.editor.shopping.out" : "studio.editor.shopping.low")}
                  </span>
                )}
              </div>
              <strong className="flex-none text-[12px] tabular-nums text-[var(--text-primary)]">{formatEstimate(line.totalMinor)}</strong>
            </li>
          );
        })}
      </ul>

      {estimate.unavailable > 0 && (
        <p className="m-0 mt-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {t("studio.editor.shopping.unavailable", { count: estimate.unavailable })}
        </p>
      )}
      {outOfStock > 0 && (
        <p role="note" className="m-0 mt-2 text-[11px] italic leading-relaxed text-[var(--text-body)]">
          {t("studio.editor.shopping.outNote", { count: outOfStock })}
        </p>
      )}

      <button
        type="button"
        onClick={addAll}
        disabled={!orderable.length}
        className={clsx(
          "mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-4 text-[12px] font-black uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)] transition-colors hover:bg-[var(--accent-cta-hover)] disabled:cursor-not-allowed disabled:bg-[var(--gt-ink-100)] disabled:text-[var(--text-muted)]",
          focusRing,
        )}
      >
        <ShoppingBag size={15} aria-hidden="true" />
        {orderable.length ? t("studio.editor.shopping.addAll", { count: orderable.length }) : t("studio.editor.shopping.noneAvailable")}
      </button>
      {added && (
        <p role="status" className="m-0 mt-2 flex flex-wrap items-center gap-x-2 text-[11.5px] font-semibold text-[var(--text-body)]">
          <Check size={13} aria-hidden="true" className="text-[var(--status-success-fg)]" />
          {t("studio.editor.shopping.added")}
          <Link
            to="/panier"
            target="_blank"
            rel="noopener"
            className={clsx("inline-flex items-center gap-1 text-[var(--gt-blue-700)] underline-offset-2 hover:underline", focusRing)}
          >
            {t("studio.editor.shopping.viewCart")}
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </p>
      )}
    </>
  );
}
