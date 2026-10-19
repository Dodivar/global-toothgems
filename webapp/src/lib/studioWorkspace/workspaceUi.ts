import { useSyncExternalStore } from "react";
import type { PublicExposure } from "./glowbook";
import type { Creation, GemGroup, RecordDetails, StudioCollection } from "./types";

/**
 * Which workspace dialog is open. One at a time, hosted once by
 * `WorkspaceDialogs`, so any control — the top bar's Save, the inspector's
 * "Create Gem Group", a card's menu — can ask for one without owning it.
 * Pure UI state: nothing here is persisted.
 */

export type WorkspaceDialog =
  | { kind: "saveCreation"; mode: "new" | "saveAsNew" }
  /** `details`: what the artist had typed, when coming back from the public-save warning. */
  | { kind: "editCreation"; creation: Creation; details?: RecordDetails }
  | { kind: "deleteCreation"; creation: Creation }
  | { kind: "creationDetail"; creationId: string }
  | { kind: "shareCreation"; creation: Creation }
  | { kind: "tryOn"; creation: Creation }
  /** A post for social networks: HD still, 360° video or GIF (decision 101). */
  | { kind: "socialExport"; creation: Creation }
  | { kind: "saveGroup"; pieceIds: string[] }
  | { kind: "editGroup"; group: GemGroup }
  | { kind: "deleteGroup"; group: GemGroup }
  /** Which collections a creation sits in; `back` reopens the dialog it was opened from. */
  | { kind: "creationCollections"; creationId: string; back?: WorkspaceDialog }
  /** Create (no `collection`) or rename / recolour a collection. */
  | { kind: "editCollection"; collection?: StudioCollection }
  | { kind: "deleteCollection"; collection: StudioCollection }
  | { kind: "discardChanges"; onConfirm: () => void }
  /** Before saving a creation others can see: in the artist's Glowbook, or a published template. */
  | { kind: "confirmPublicSave"; exposure: PublicExposure; name: string; onConfirm: () => void; onCancel?: () => void }
  | { kind: "signIn" }
  | { kind: "feedback" }
  | { kind: "onboarding" }
  | { kind: "tourComplete" };

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

/**
 * v2: the welcome became the guided tour over the editor itself
 * (`components/studio/workspace/StudioTour`). The key was bumped so the new
 * tour is offered once to everyone, including artists who dismissed the old
 * four-slide dialog; nothing else is stored under it.
 */
const ONBOARDING_KEY = "gt-studio3d-onboarding-v2";

/** Whether the welcome was already answered — tour taken or declined — in this browser. */
export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== null;
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

export function rememberOnboarding(choice: "done" | "skipped" | "started") {
  try {
    localStorage.setItem(ONBOARDING_KEY, choice);
  } catch {
    /* the choice lasts for this visit */
  }
}
