import { useCallback, useEffect, useRef, useState } from "react";

/** Sub-pixel track widths mean the raw comparison never reaches zero. */
const SCROLL_EPSILON = 1;

/**
 * State and paging for a horizontal rail whose arrows live outside the track
 * (the same arithmetic as `CarouselTrack`, which owns its own arrows). The
 * items stay ordinary links, so keyboard users tab through them and the
 * browser scrolls the focused one into view; the arrows are a pointer
 * convenience.
 */
export function useScrollRail<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= SCROLL_EPSILON);
    setAtEnd(el.scrollWidth - el.clientWidth - el.scrollLeft <= SCROLL_EPSILON);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      observer?.disconnect();
    };
  }, [sync]);

  const page = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  };

  return { ref, atStart, atEnd, page };
}
