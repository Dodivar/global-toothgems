import { useSyncExternalStore } from "react";

/**
 * Which quick actions float beside the selection on the 3D stage.
 *
 * A per-browser convenience, like the design itself: kept in local storage,
 * never sent anywhere. Made for phones and tablets, where the inspector sits
 * below the stage and the right-click menu is out of reach.
 */

export const QUICK_ACTIONS = ["rotate", "size", "duplicate", "mirrorH", "mirrorV", "delete"] as const;
export type QuickActionId = (typeof QUICK_ACTIONS)[number];

export interface QuickActionPrefs {
  /** Show the floating bar at all when pieces are selected. */
  enabled: boolean;
  /** The actions shown, in `QUICK_ACTIONS` order. */
  actions: QuickActionId[];
}

const KEY = "gt-studio3d-quick-actions-v1";
export const DEFAULT_QUICK_ACTIONS: QuickActionPrefs = { enabled: true, actions: ["rotate", "size", "duplicate", "delete"] };

function load(): QuickActionPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Partial<QuickActionPrefs>) : null;
    if (!data || typeof data !== "object" || !Array.isArray(data.actions)) return DEFAULT_QUICK_ACTIONS;
    return {
      enabled: data.enabled !== false,
      actions: QUICK_ACTIONS.filter((id) => (data.actions as unknown[]).includes(id)),
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
