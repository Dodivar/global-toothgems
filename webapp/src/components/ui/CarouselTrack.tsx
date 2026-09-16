import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "./IconButton";

/** Sub-pixel track widths mean the raw comparison never reaches zero. */
const SCROLL_EPSILON = 1;

interface CarouselTrackProps {
  children: ReactNode;
  prevLabel: string;
  nextLabel: string;
}

/**
 * Horizontal scroller shell shared by the shape and colour carousels.
 *
 * The tiles are ordinary links inside the list, so keyboard users tab through
 * them and the browser scrolls the focused one into view on its own — no roving
 * tabindex, and the arrows stay a pointer convenience. They are hidden below
 * `sm`, where the track is swiped instead.
 */
export function CarouselTrack({ children, prevLabel, nextLabel }: CarouselTrackProps) {
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
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncArrows);
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
    <div className="relative min-w-0">
      <ul ref={trackRef} className="gt-scroller m-0 flex list-none gap-3 p-0 pb-2 sm:gap-4">
        {children}
      </ul>

      {/* Pointer affordance only: the same scrolling is reachable by tabbing
          through the links or swiping the track. */}
      <div className="mt-2 hidden justify-end gap-2 sm:flex">
        <IconButton icon={ChevronLeft} variant="outline" size="sm" label={prevLabel} disabled={atStart} onClick={() => scrollByPage(-1)} />
        <IconButton icon={ChevronRight} variant="outline" size="sm" label={nextLabel} disabled={atEnd} onClick={() => scrollByPage(1)} />
      </div>
    </div>
  );
}
