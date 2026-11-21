import { useSyncExternalStore } from "react";
import type { LockedFeature } from "../studioEntitlements";
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
  /** A feature below the member's plan, opened from a locked menu row: what it does and the plan that opens it. */
  | { kind: "planLocked"; feature: LockedFeature }
  | { kind: "signIn" }
  | { kind: "feedback" }
  | { kind: "phoneNotice" }
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
 * (`components/studio/workspace/StudioTour`). v3 (2026-11-21): the answer is
 * kept per account, not per browser — a new member signing in where someone
 * else already answered (a shared computer, the team testing accounts) is
 * still welcomed. Nothing else is stored under it.
 */
const ONBOARDING_KEY = "gt-studio3d-onboarding-v3";

/** The signed-in account the welcome is asked of; set by the editor. */
let onboardingAccount: string | null = null;

export function setOnboardingAccount(userId: string | null) {
  onboardingAccount = userId;
}

/** Storage key of the welcome's answer for an account (`anonymous` without one, the mock mode). */
export function onboardingKey(userId: string | null): string {
  return `${ONBOARDING_KEY}:${userId ?? "anonymous"}`;
}

/** Whether the signed-in account already answered the welcome — tour taken or declined — in this browser. */
export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(onboardingKey(onboardingAccount)) !== null;
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

export function rememberOnboarding(choice: "done" | "skipped" | "started") {
  try {
    localStorage.setItem(onboardingKey(onboardingAccount), choice);
  } catch {
    /* the choice lasts for this visit */
  }
}
