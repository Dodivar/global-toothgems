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
 * - optional categories start refused — nothing is pre-ticked;
 * - refusing is one click, exactly like accepting;
 * - the choice can be reopened and changed at any time (footer, cookie policy);
 * - the decision carries a timestamp, which is what a real record would keep
 *   as proof of consent alongside the policy version.
 *
 * The choice is kept in localStorage so the banner does not come back on every
 * page. Whether that storage is disclosed as a strictly necessary item is to be
 * decided with the cookie policy.
 */

export type OptionalCategory = "preferences" | "analytics" | "marketing";
export const OPTIONAL_CATEGORIES: OptionalCategory[] = ["preferences", "analytics", "marketing"];

export type ConsentChoices = Record<OptionalCategory, boolean>;

export interface ConsentRecord extends ConsentChoices {
  decidedAt: string;
}

export const NO_OPTIONAL_CONSENT: ConsentChoices = { preferences: false, analytics: false, marketing: false };
const ALL_CONSENT: ConsentChoices = { preferences: true, analytics: true, marketing: true };

const STORAGE_KEY = "gt-cookie-consent";

function readStored(): ConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (typeof parsed.decidedAt !== "string") return null;
    return {
      preferences: parsed.preferences === true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      decidedAt: parsed.decidedAt,
    };
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
