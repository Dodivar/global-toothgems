import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useHydrated } from "./useHydrated";
import { ADVERTISING_ENABLED } from "./metaPixelConfig";

/**
 * Cookie consent.
 *
 * This records the visitor's choice; PostHog (all analytics, including the
 * Studio events of `lib/studioAnalytics.ts`) is opted in only while the
 * `analytics` category is accepted. It follows the behaviour a real consent layer must have:
 *
 * - only the optional categories the site really uses are offered: analytics
 *   (PostHog) always, advertising (the Meta Pixel, `lib/metaPixel.tsx`) only
 *   once the pixel is configured (`metaPixelConfig.ts`); no preference or
 *   social-network tracker exists — a switch that changes nothing would mislead;
 * - it starts refused — nothing is pre-ticked;
 * - refusing is one click, exactly like accepting;
 * - the choice can be reopened and changed at any time (footer, cookie policy);
 * - the decision carries a timestamp and is valid for `CONSENT_MAX_AGE_MS`
 *   (6 months, the CNIL's recommendation for both an acceptance and a
 *   refusal), after which the banner asks again and analytics stop until then.
 *
 * The choice is kept in localStorage (`gt-cookie-consent`), disclosed as a
 * strictly necessary item in the cookie policy (`data/legal/cookies.ts`).
 * Records written before the categories were narrowed (with `preferences` and
 * `marketing` keys) are still read: only their `analytics` value counts — the
 * former `marketing` value was given under other wording and never counts as
 * advertising consent. A record without `advertising` (every choice made
 * before the category existed) reads as refused: those visitors are not asked
 * again until their choice expires.
 */

export type OptionalCategory = "analytics" | "advertising";
export const OPTIONAL_CATEGORIES: OptionalCategory[] = ADVERTISING_ENABLED ? ["analytics", "advertising"] : ["analytics"];

export type ConsentChoices = Record<OptionalCategory, boolean>;

export interface ConsentRecord extends ConsentChoices {
  decidedAt: string;
}

export const NO_OPTIONAL_CONSENT: ConsentChoices = { analytics: false, advertising: false };
/** "Accept all" accepts only the categories offered. */
const ALL_CONSENT: ConsentChoices = { analytics: true, advertising: ADVERTISING_ENABLED };

const STORAGE_KEY = "gt-cookie-consent";

/** How long a choice stands before the visitor is asked again: 6 months. */
export const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

/** The stored record, or null when it is missing, malformed or older than `CONSENT_MAX_AGE_MS`. */
export function parseConsentRecord(raw: string | null, now: number): ConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord> | null;
    if (!parsed || typeof parsed.decidedAt !== "string") return null;
    const decided = Date.parse(parsed.decidedAt);
    if (Number.isNaN(decided) || now - decided > CONSENT_MAX_AGE_MS) return null;
    return { analytics: parsed.analytics === true, advertising: parsed.advertising === true, decidedAt: parsed.decidedAt };
  } catch {
    return null;
  }
}

function readStored(): ConsentRecord | null {
  try {
    return parseConsentRecord(window.localStorage.getItem(STORAGE_KEY), Date.now());
  } catch {
    return null;
  }
}

function writeStored(record: ConsentRecord) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* Private mode or blocked storage: the choice simply lasts this visit. */
  }
}

interface CookieConsentValue {
  /** `null` until the visitor has made a choice. */
  record: ConsentRecord | null;
  /**
   * Whether `record` has been read yet: a server-rendered page knows the
   * choice only once hydrated (it lives in localStorage), so the banner waits
   * for it rather than flashing at visitors who already chose.
   */
  known: boolean;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (choices: ConsentChoices) => void;
}

const CookieConsentContext = createContext<CookieConsentValue | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const known = useHydrated();
  // The stored choice, once it can be read; `chosen` is a choice made on this page.
  const stored = useMemo(() => (known ? readStored() : null), [known]);
  const [chosen, setRecord] = useState<ConsentRecord | null | undefined>(undefined);
  const record = chosen === undefined ? stored : chosen;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // PostHog starts opted out (`instrumentation-client.ts`); `PostHogSession`
  // (`lib/posthogSession.tsx`, under this provider in `AppProviders`) opts in only while the analytics
  // category is accepted, and decides session replay.

  const save = useCallback((choices: ConsentChoices) => {
    // A category not offered is never recorded as accepted.
    const next = { ...choices, advertising: ADVERTISING_ENABLED && choices.advertising, decidedAt: new Date().toISOString() };
    writeStored(next);
    setRecord(next);
    setSettingsOpen(false);
  }, []);

  const value = useMemo<CookieConsentValue>(
    () => ({
      record,
      known,
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      acceptAll: () => save(ALL_CONSENT),
      rejectAll: () => save(NO_OPTIONAL_CONSENT),
      save,
    }),
    [record, known, settingsOpen, save],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error("useCookieConsent must be used within CookieConsentProvider");
  return ctx;
}
