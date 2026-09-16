import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "./IconButton";
import { ShapeGlyph } from "./ShapeGlyph";
import type { ShapeGroup } from "../../data/products";

/** Sub-pixel track widths mean the raw comparison never reaches zero. */
const SCROLL_EPSILON = 1;

interface ShapeCarouselProps {
  groups: ShapeGroup[];
  /** Builds the shop URL a tile links to. */
  hrefFor: (group: ShapeGroup) => string;
}

/**
 * Horizontal picker of gem cuts.
 *
 * The tiles are ordinary links inside a list, so keyboard users tab through
 * them and the browser scrolls the focused one into view on its own — no
 * roving tabindex, and the arrows stay a pointer convenience. They are hidden
 * below `sm`, where the track is swiped instead.
 */
export function ShapeCarousel({ groups, hrefFor }: ShapeCarouselProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= SCROLL_EPSILON);
    setAtEnd(el.scrollWidth - el.clientWidth - el.scrollLeft <= SCROLL_EPSILON);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    syncArrows();
    el.addEventListener("scroll", syncArrows, { passive: true });
    // The track can start fully visible and become scrollable on a narrower
    // viewport, so width changes have to re-run the same check.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncArrows);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", syncArrows);
      observer?.disconnect();
    };
  }, [syncArrows]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    // Scroll behavior is decided here rather than in CSS, so the reduced-motion
    // preference is handled in one place.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className="relative">
      <ul ref={trackRef} className="gt-scroller m-0 flex list-none gap-3 p-0 pb-2 sm:gap-4">
        {groups.map((group) => (
          <li key={group.shape} className="shrink-0 snap-start">
            <Link
              to={hrefFor(group)}
              aria-label={t("home.shapeTileAria", {
                shape: t(`shop.shapes.${group.shape}`),
                count: group.count,
              })}
              className="group grid w-[104px] justify-items-center gap-2.5 rounded-[var(--radius-card)] p-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-brand-wash)] sm:w-[124px]"
            >
              <span className="flex h-[84px] w-[84px] items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)] transition-[transform,border-color,box-shadow] duration-[var(--duration-normal)] group-hover:-translate-y-[3px] group-hover:border-[var(--border-brand)] group-hover:shadow-[var(--shadow-md)] sm:h-[96px] sm:w-[96px]">
                <ShapeGlyph shape={group.shape} />
              </span>
              <span className="grid justify-items-center gap-0.5 text-center">
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {t(`shop.shapes.${group.shape}`)}
                </span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("home.shapeCount", { count: group.count })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Pointer affordance only: the same scrolling is reachable by tabbing
          through the links or swiping the track. */}
      <div className="mt-2 hidden justify-end gap-2 sm:flex">
        <IconButton
          icon={ChevronLeft}
          variant="outline"
          size="sm"
          label={t("home.shapePrev")}
          disabled={atStart}
          onClick={() => scrollByPage(-1)}
        />
        <IconButton
          icon={ChevronRight}
          variant="outline"
          size="sm"
          label={t("home.shapeNext")}
          disabled={atEnd}
          onClick={() => scrollByPage(1)}
        />
      </div>
    </div>
  );
}
