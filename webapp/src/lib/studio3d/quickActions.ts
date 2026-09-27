import { useSyncExternalStore } from "react";

/**
 * Which quick actions float beside the selection on the 3D stage.
 *
 * A per-browser convenience, like the design itself: kept in local storage,
 * never sent anywhere. Made for phones and tablets, where the inspector sits
 * below the stage and the right-click menu is out of reach.
 */

export const QUICK_ACTIONS = ["rotate", "size", "color", "duplicate", "duplicateMirror", "mirrorH", "mirrorV", "delete"] as const;
export type QuickActionId = (typeof QUICK_ACTIONS)[number];

export interface QuickActionPrefs {
  /** Show the floating bar at all when pieces are selected. */
  enabled: boolean;
  /** The actions shown, in `QUICK_ACTIONS` order. */
  actions: QuickActionId[];
  /** The actions the customer could choose from when this was saved: a later one is shown by default. */
  known: QuickActionId[];
}

const KEY = "gt-studio3d-quick-actions-v1";
export const DEFAULT_QUICK_ACTIONS: QuickActionPrefs = {
  enabled: true,
  // "duplicateMirror" is offered but off: with it, a single piece's bar is wider than a phone.
  actions: ["rotate", "size", "color", "duplicate", "delete"],
  known: [...QUICK_ACTIONS],
};
/** What the first version offered, for choices saved before `known` existed. */
const FIRST_ACTIONS: readonly QuickActionId[] = ["rotate", "size", "duplicate", "mirrorH", "mirrorV", "delete"];

function load(): QuickActionPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Partial<QuickActionPrefs>) : null;
    if (!data || typeof data !== "object" || !Array.isArray(data.actions)) return DEFAULT_QUICK_ACTIONS;
    const saved = data.actions as unknown[];
    const known = Array.isArray(data.known) ? (data.known as unknown[]) : FIRST_ACTIONS;
    return {
      enabled: data.enabled !== false,
      // The customer's own choice, plus any action added since that is on by default.
      actions: QUICK_ACTIONS.filter((id) => saved.includes(id) || (!known.includes(id) && DEFAULT_QUICK_ACTIONS.actions.includes(id))),
      known: [...QUICK_ACTIONS],
    };
  } catch {
    return DEFAULT_QUICK_ACTIONS; // blocked or corrupt storage: defaults
  }
}

let prefs = load();
const listeners = new Set<() => void>();

function commit(next: QuickActionPrefs) {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  listeners.forEach((l) => l());
}

export function setQuickActionsEnabled(enabled: boolean) {
  commit({ ...prefs, enabled });
}

export function toggleQuickAction(id: QuickActionId) {
  const on = prefs.actions.includes(id);
  commit({ ...prefs, actions: QUICK_ACTIONS.filter((a) => (a === id ? !on : prefs.actions.includes(a))) });
}

export function resetQuickActions() {
  commit(DEFAULT_QUICK_ACTIONS);
}

export function useQuickActions(): QuickActionPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => prefs,
  );
}
