import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import { useHydrated } from "./useHydrated";

/**
 * Cookie consent.
 *
 * This records the visitor's choice; PostHog (all analytics, including the
 * Studio events of `lib/studioAnalytics.ts`) is opted in only while the
 * `analytics` category is accepted. It follows the behaviour a real consent layer must have:
 *
 * - the only optional category is the one the site really uses (analytics,
 *   PostHog): no preference, advertising or social-network tracker exists, so
 *   none is offered — a switch that changes nothing would mislead;
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
 * `marketing` keys) are still read: only their `analytics` value counts.
 */

export type OptionalCategory = "analytics";
export const OPTIONAL_CATEGORIES: OptionalCategory[] = ["analytics"];

export type ConsentChoices = Record<OptionalCategory, boolean>;

export interface ConsentRecord extends ConsentChoices {
  decidedAt: string;
}

export const NO_OPTIONAL_CONSENT: ConsentChoices = { analytics: false };
const ALL_CONSENT: ConsentChoices = { analytics: true };

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
    return { analytics: parsed.analytics === true, decidedAt: parsed.decidedAt };
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

  // PostHog starts opted out (`instrumentation-client.ts`): it captures only
  // while the analytics category is accepted.
  const analyticsAccepted = record?.analytics === true;
  useEffect(() => {
    try {
      if (!posthog.__loaded) return;
      if (analyticsAccepted) posthog.opt_in_capturing();
      else posthog.opt_out_capturing();
    } catch {
      /* analytics must never break the site */
    }
  }, [analyticsAccepted]);

  const save = useCallback((choices: ConsentChoices) => {
    const next = { ...choices, decidedAt: new Date().toISOString() };
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
