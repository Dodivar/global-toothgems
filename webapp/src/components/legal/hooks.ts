import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Sets the tab title while the page is shown, like the system pages do. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Global Toothgems`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Scrolls to the element named in the URL hash once the page has rendered.
 * The app scrolls to the top on every route change, so a link such as
 * `/conditions-generales#stripe` would otherwise land on the title. A `<details>`
 * target (an FAQ answer) is opened as well.
 */
export function useHashScroll(ready = true) {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, pathname, ready]);
}
