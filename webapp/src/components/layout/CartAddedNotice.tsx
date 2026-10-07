import { startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, ShoppingBag, Undo2 } from "lucide-react";
import { useCart, type CartAddition } from "../../lib/cart";
import { useFormat } from "../../lib/format";
import { Link, useLocation } from "../../lib/navigation";

/**
 * The notice under the header's cart icon when a product is added: what went
 * in, a way to take it back, and the way to the cart. It stays four seconds,
 * counted down by the bar at its foot, and closes earlier on a click anywhere
 * else, on Escape or when the page changes. Hovering or focusing it holds the
 * countdown, so the "undo" can always be reached in time (WCAG 2.2.1).
 *
 * The countdown is the bar's own CSS animation (`.gt-cart-notice-bar`): its
 * end closes the notice, and holding it on hover holds the timer with it.
 * Rendered once at the root of the header, outside the desktop and mobile
 * layouts, so it is never under a `display: none` that would stop it.
 */
export function CartAddedNotice() {
  const { t } = useTranslation();
  const { lastAddition, dismissAddition, undoAddition } = useCart();
  const { pathname } = useLocation();

  // A notice belongs to the page it was raised on, and to this header: leaving
  // the page, or a layout without the header, drops it.
  useEffect(() => dismissAddition, [pathname, dismissAddition]);

  return (
    <>
      {/* Present before any notice lands in it, so the addition is announced. */}
      <div role="status" aria-live="polite" className="sr-only">
        {lastAddition ? t("cartNotice.announce", { name: lastAddition.line.name }) : ""}
      </div>
      {lastAddition && (
        <Notice key={lastAddition.seq} addition={lastAddition} onDone={dismissAddition} onUndo={() => undoAddition(lastAddition)} />
      )}
    </>
  );
}

function Notice({ addition, onDone, onUndo }: { addition: CartAddition; onDone: () => void; onUndo: () => void }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [undone, setUndone] = useState(false);
  const { line, added } = addition;

  // A click or a tap anywhere else, or Escape, closes it. `pointerup` rather
  // than `pointerdown`: a finger that starts scrolling the page ends in
  // `pointercancel`, not `pointerup`, so scrolling leaves the notice open; and
  // unlike `click`, iOS Safari sends it for a tap on blank page too. The press
  // that added the product has ended before this listener exists.
  useEffect(() => {
    if (leaving) return;
    const onPointerUp = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setLeaving(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLeaving(true);
    };
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [leaving]);

  const undo = () => {
    if (undone) return;
    setUndone(true);
    setLeaving(true);
    // The cart re-renders much of the page: as a transition, it yields to the
    // exit animation instead of holding its first frame.
    startTransition(onUndo);
  };

  return (
    <div
      ref={ref}
      data-leaving={leaving || undefined}
      onAnimationEnd={(e) => {
        // The exit animation's own end, not the bar's bubbling up.
        if (leaving && e.target === e.currentTarget) onDone();
      }}
      className="gt-cart-notice absolute right-3 top-[calc(100%+8px)] z-10 w-[min(360px,calc(100vw-24px))] md:right-[var(--gutter-page-lg)]"
    >
      {/* Points at the cart icon, the last of the header's buttons on both layouts. */}
      <span
        aria-hidden="true"
        className="absolute -top-[6px] right-[14px] h-3 w-3 rotate-45 rounded-[2px] border-l border-t border-[var(--border-subtle)] bg-[var(--surface-card)]"
      />
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)]">
        <div className="grid gap-3 p-[var(--space-4)]">
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <CheckCircle2 size={17} aria-hidden="true" className="flex-none text-[var(--status-success-fg)]" />
            {t("cartNotice.title")}
          </p>
          <div className="flex items-center gap-3">
            {line.image ? (
              <img
                src={line.image}
                alt=""
                className="h-14 w-14 flex-none rounded-[var(--radius-sm)] border border-[var(--border-subtle)] object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-14 w-14 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-brand-wash)] text-[var(--text-muted)]"
              >
                <ShoppingBag size={20} strokeWidth={1.75} />
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              <strong className="truncate text-sm text-[var(--text-primary)]">{line.name}</strong>
              {line.variant && <span className="truncate text-xs text-[var(--text-muted)]">{line.variant}</span>}
              <span className="text-xs text-[var(--text-body)]">
                {added > 1 && <>{t("cartNotice.qty", { count: added })} · </>}
                {formatMoney(line.unitPrice * added, line.currency)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={undone}
              aria-label={t("cartNotice.undoAria", { name: line.name })}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-45"
            >
              <Undo2 size={14} aria-hidden="true" />
              {t("cartNotice.undo")}
            </button>
            <Link
              to="/panier"
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-3.5 text-xs font-semibold text-[var(--gt-white)] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[var(--shadow-card-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {t("cartNotice.viewCart")}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
        {/* The time left: four seconds, emptying from right to left. */}
        <div aria-hidden="true" className="h-1 bg-[var(--gt-ink-100)]">
          <div className="gt-cart-notice-bar h-full bg-[var(--surface-brand)]" onAnimationEnd={() => setLeaving(true)} />
        </div>
      </div>
    </div>
  );
}
