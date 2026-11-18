import { useLayoutEffect, useSyncExternalStore } from "react";
import { isPhoneDevice } from "../studioWorkspace/phoneNotice";

/**
 * The 3D Studio's phone mode: the editor's own layout and touch aids for a
 * phone, and only a phone. A phone is the device `isPhoneDevice()` names —
 * touch input and a screen whose shorter side is under 600 CSS pixels — so a
 * tablet (an iPad mini is 744) or a desktop window, however narrow, never gets
 * it and keeps the editor exactly as it was.
 *
 * Held upright (`portrait`) the stage stays put and the library and the
 * inspector share a bottom sheet (`PhoneSheet`); held sideways (`landscape`)
 * the side-by-side layout stays, with a tighter top bar. Either way the stage
 * gets the touch aids: the quick bar docked within the thumb's reach, the
 * loupe under a finger, the nudge pad, a tooth tap that zooms on it, haptics.
 *
 * The mode is written on `<html data-studio-phone>` while the editor is open,
 * for the `studio-phone*` variants of `index.css` (dialogs and the tour card
 * are portalled outside the editor). Browser-only, like the editor itself.
 */

export type PhoneLayout = "portrait" | "landscape" | null;

/** Pure rule, tested: a phone, then which way it is held. */
export function phoneLayoutOf(phone: boolean, landscape: boolean): PhoneLayout {
  if (!phone) return null;
  return landscape ? "landscape" : "portrait";
}

const LANDSCAPE_QUERY = "(orientation: landscape)";

function read(): PhoneLayout {
  if (typeof window === "undefined") return null;
  return phoneLayoutOf(isPhoneDevice(), window.matchMedia(LANDSCAPE_QUERY).matches);
}

let current: PhoneLayout = null;
let started = false;
const listeners = new Set<() => void>();

function refresh() {
  const next = read();
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!started && typeof window !== "undefined") {
    started = true;
    current = read();
    // A phone turned, or a desktop browser's device emulation switched on.
    window.matchMedia(LANDSCAPE_QUERY).addEventListener("change", refresh);
    window.matchMedia("(pointer: coarse)").addEventListener("change", refresh);
    window.addEventListener("resize", refresh);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): PhoneLayout {
  if (!started) current = read();
  return current;
}

/** The phone layout in use, or null on a tablet or a computer. */
export function usePhoneLayout(): PhoneLayout {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Read once, outside React (the engine, an effect). */
export function phoneLayoutNow(): PhoneLayout {
  return snapshot();
}

/**
 * Write the mode on `<html>` while the editor is mounted, before the first
 * paint, so the `studio-phone*` variants never draw a frame of the other layout.
 */
export function usePhoneLayoutAttribute(layout: PhoneLayout) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (layout) root.dataset.studioPhone = layout;
    else delete root.dataset.studioPhone;
    return () => {
      delete root.dataset.studioPhone;
    };
  }, [layout]);
}

/** A short buzz where the phone has one (Android; iPhone Safari has no vibration API). */
export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* refused by the browser: silence is fine */
  }
}
