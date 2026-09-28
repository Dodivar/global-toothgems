import { useSyncExternalStore } from "react";
import type { Creation, GemGroup } from "./types";

/**
 * Which workspace dialog is open. One at a time, hosted once by
 * `WorkspaceDialogs`, so any control — the top bar's Save, the inspector's
 * "Create Gem Group", a card's menu — can ask for one without owning it.
 * Pure UI state: nothing here is persisted.
 */

export type WorkspaceDialog =
  | { kind: "saveCreation"; mode: "new" | "saveAsNew" }
  | { kind: "editCreation"; creation: Creation }
  | { kind: "deleteCreation"; creation: Creation }
  | { kind: "creationDetail"; creationId: string }
  | { kind: "saveGroup"; pieceIds: string[] }
  | { kind: "editGroup"; group: GemGroup }
  | { kind: "deleteGroup"; group: GemGroup }
  | { kind: "discardChanges"; onConfirm: () => void }
  | { kind: "signIn" }
  | { kind: "feedback" }
  | { kind: "onboarding" };

let current: WorkspaceDialog | null = null;
const listeners = new Set<() => void>();

export function openWorkspaceDialog(dialog: WorkspaceDialog) {
  current = dialog;
  listeners.forEach((l) => l());
}

export function closeWorkspaceDialog() {
  if (!current) return;
  current = null;
  listeners.forEach((l) => l());
}

export function getWorkspaceDialog(): WorkspaceDialog | null {
  return current;
}

export function useWorkspaceDialog(): WorkspaceDialog | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
  );
}

/* ---------------------------------------------------------- onboarding */

const ONBOARDING_KEY = "gt-studio3d-onboarding-v1";

/** Whether the welcome tour was already finished or skipped in this browser. */
export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== null;
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

export function rememberOnboarding(choice: "done" | "skipped") {
  try {
    localStorage.setItem(ONBOARDING_KEY, choice);
  } catch {
    /* the choice lasts for this visit */
  }
}
