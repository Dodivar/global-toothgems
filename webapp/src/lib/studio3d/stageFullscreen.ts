import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How the 3D stage fills the screen: the browser's own full screen where it
 * lets a page element go full screen, else ("overlay") the stage covering the
 * window above the rest of the page — iPhone Safari only grants the real thing
 * to videos.
 */
export type StageFullscreenMode = "native" | "overlay";

interface FullscreenDocument {
  fullscreenEnabled?: boolean;
}
interface FullscreenElement {
  requestFullscreen?: unknown;
}

export function stageFullscreenMode(doc: FullscreenDocument, el: FullscreenElement): StageFullscreenMode {
  return doc.fullscreenEnabled && typeof el.requestFullscreen === "function" ? "native" : "overlay";
}

/** How long the browser has to answer a full-screen request before the stage covers the window. */
const NATIVE_GRACE_MS = 1000;

/**
 * Full screen for a Studio stage (the editor's and the shared design's).
 * `ref` goes on the stage element; `active` says whether it fills the screen,
 * whichever way. Escape leaves either mode (the browser handles it for the
 * native one). The engine follows the new size through its ResizeObserver.
 */
export function useStageFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverlay(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay]);

  // Leaving the page while full screen gives the screen back.
  useEffect(
    () => () => {
      if (ref.current && document.fullscreenElement === ref.current) void document.exitFullscreen().catch(() => {});
    },
    [],
  );

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (overlay) return setOverlay(false);
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (stageFullscreenMode(document, el) === "overlay") return setOverlay(true);
    // Refused (an iframe without permission, a browser setting), or left unanswered
    // (some in-app browsers, where shared links often open): cover the window instead.
    let settled = false;
    el.requestFullscreen().then(
      () => (settled = true),
      () => {
        settled = true;
        setOverlay(true);
      },
    );
    window.setTimeout(() => {
      if (!settled && document.fullscreenElement !== el) setOverlay(true);
    }, NATIVE_GRACE_MS);
  }, [overlay]);

  return { ref, active: native || overlay, overlay, toggle };
}
