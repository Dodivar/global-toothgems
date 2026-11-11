import { STUDIO_PATH } from "./studioUrl";
import type { StudioAccessKind } from "./studioAccessState";

/**
 * The dashboard's "first steps" card, as pure rules.
 *
 * A new member gets a short checklist of the places worth visiting. Each step
 * is ticked from facts the stores already read under row-level security — a
 * filled-in profile, a favourite or an order, a started Studio trial, a held
 * course — so nothing is simulated and nothing is written except the member's
 * own choice to close the card (`member_preferences.welcome_dismissed_at`).
 */

export type WelcomeStepId = "profile" | "shop" | "studio" | "academy";

export interface WelcomeStep {
  id: WelcomeStepId;
  /** Internal French path, like every link of the app. */
  to: string;
  done: boolean;
}

/** An account is "new" for this long. */
export const WELCOME_WINDOW_DAYS = 14;

export interface WelcomeFacts {
  phone: string;
  addressLine: string;
  hasFavorites: boolean;
  hasOrders: boolean;
  /** Null while the Studio state is not read yet, or unavailable. */
  studio: StudioAccessKind | null;
  /** The account was created from a Studio page. */
  signedUpForStudio: boolean;
  holdsCourse: boolean;
}

/** States of a member who already uses (or has used) a paid Studio: nothing to pitch. */
const STUDIO_MEMBER: readonly StudioAccessKind[] = ["subscribed", "subscription_pending", "staff"];
/** States that prove the member already tried the Studio: the step is ticked. */
const STUDIO_TRIED: readonly StudioAccessKind[] = ["trial_active", "trial_expired", "subscription_ended"];

/**
 * The steps, in the order shown. The Studio step is offered even after a
 * purchase or a course, and left out only for a subscriber (or staff) and for
 * an account created for the Studio itself. While the Studio state is unknown
 * it is left out too, so the list never grows once drawn.
 */
export function welcomeSteps(facts: WelcomeFacts): WelcomeStep[] {
  const steps: WelcomeStep[] = [
    { id: "profile", to: "/compte/profil", done: facts.phone.trim() !== "" && facts.addressLine.trim() !== "" },
    { id: "shop", to: "/boutique", done: facts.hasFavorites || facts.hasOrders },
  ];
  if (facts.studio !== null && !STUDIO_MEMBER.includes(facts.studio) && !facts.signedUpForStudio) {
    steps.push({ id: "studio", to: STUDIO_PATH, done: STUDIO_TRIED.includes(facts.studio) });
  }
  steps.push({ id: "academy", to: "/academy", done: facts.holdsCourse });
  return steps;
}

/** Whole days since `createdAt`, on the browser's clock (display only). */
export function isNewAccount(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= WELCOME_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** The card is drawn for a new account that did not close it and still has a step to do. */
export function showsWelcome(input: { isNew: boolean; dismissed: boolean; steps: readonly WelcomeStep[] }): boolean {
  return input.isNew && !input.dismissed && input.steps.some((step) => !step.done);
}
