import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useHydrated } from "./useHydrated";

/**
 * Cookie consent — the interaction prototype.
 *
 * This records the visitor's choice and nothing else: no script is loaded or
 * blocked because of it, and no tracker exists in this prototype. What it does
 * model faithfully is the behaviour a real consent layer must have:
 *
 * - optional categories start refused — nothing is pre-ticked;
 * - refusing is one click, exactly like accepting;
 * - the choice can be reopened and changed at any time (footer, cookie policy);
 * - the decision carries a timestamp, which is what a real record would keep
 *   as proof of consent alongside the policy version.
 *
 * The choice is kept in localStorage so the banner does not come back on every
 * page of the review. The production implementation (and whether that storage
 * itself is disclosed as a strictly necessary item) is to be decided with the
 * actual cookie stack.
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

function writeStored(record: ConsentRecord | null) {
  try {
    if (record) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    else window.localStorage.removeItem(STORAGE_KEY);
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
  /** Prototype only: forget the choice so the banner shows again. */
  reset: () => void;
}

const CookieConsentContext = createContext<CookieConsentValue | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const known = useHydrated();
  // The stored choice, once it can be read; `chosen` is a choice made on this page.
  const stored = useMemo(() => (known ? readStored() : null), [known]);
  const [chosen, setRecord] = useState<ConsentRecord | null | undefined>(undefined);
  const record = chosen === undefined ? stored : chosen;
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      reset: () => {
        writeStored(null);
        setRecord(null);
      },
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
