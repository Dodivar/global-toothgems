import { useEffect, useRef } from "react";

interface RevealOptions {
  /**
   * Fraction of the viewport height the element's top must cross before it
   * reveals. 0.9 means "once the top is into the bottom tenth of the screen".
   */
  trigger?: number;
}

/**
 * Reveals the referenced element once it scrolls into view by adding `.is-visible`.
 *
 * The element must also carry the `gt-reveal` class. Reveal is one-shot: elements
 * never fade back out, so content stays readable when scrolling back up.
 *
 * Robustness matters more than elegance here, because the failure mode is content
 * that never appears. Three things can reveal an element:
 *
 *  1. an immediate geometry check on mount (handles content already on screen,
 *     and restored scroll positions);
 *  2. an IntersectionObserver (the normal path, no work on the scroll thread);
 *  3. a passive scroll listener doing the same geometry check.
 *
 * (3) exists because an IntersectionObserver can miss an element entirely when
 * the page jumps far in one frame — anchor navigation, a scroll restore, or a
 * hard flick on mobile. The element goes from "below the viewport" to "above the
 * viewport" between two samples, the intersection state never changes, and the
 * callback never fires. Both extra paths disconnect themselves after firing.
 */
export function useReveal<T extends HTMLElement>({ trigger = 0.9 }: RevealOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Fail open: never leave content hidden because an API is missing or the
    // reader has asked for less motion.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }

    let done = false;
    let observer: IntersectionObserver | null = null;

    const onScroll = () => check();

    const reveal = () => {
      if (done) return;
      done = true;
      el.classList.add("is-visible");
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };

    const check = () => {
      if (el.getBoundingClientRect().top < window.innerHeight * trigger) reveal();
    };

    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) reveal();
    }, { threshold: 0 });

    observer.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    check();

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [trigger]);

  return ref;
}
