import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Security state of the open session: a pending email change, when the
 * password last changed, and when the member last downloaded their personal
 * data (shown in the overview). The export itself is built on demand
 * (`lib/accountPrivacy.ts`); nothing here pretends to process it.
 */

interface SecurityContextValue {
  /** The sign-in email is verified; a pending change never unverifies it. */
  emailVerified: boolean;
  /** New address waiting for its verification link, if a change is in progress. */
  pendingEmail: string | null;
  pendingSentAt: string | null;
  /** Null until the password is changed in this session: shown as "since sign-up". */
  passwordChangedAt: string | null;
  /** When the member downloaded their data in this session, if they did. */
  lastExportAt: string | null;
  startEmailChange: (email: string) => void;
  cancelEmailChange: () => void;
  resendEmailChange: () => void;
  /** Called by the verification page; returns the address that became the sign-in email. */
  confirmEmailChange: () => string | null;
  markPasswordChanged: () => void;
  markExported: () => void;
  resetAll: () => void;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

const nowIso = () => new Date().toISOString();

/**
 * Lives above the routes so a pending email change survives leaving the page.
 */
export function SecurityProvider({ children }: { children: ReactNode }) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingSentAt, setPendingSentAt] = useState<string | null>(null);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);

  const startEmailChange = useCallback((email: string) => {
    setPendingEmail(email.trim());
    setPendingSentAt(nowIso());
  }, []);

  const cancelEmailChange = useCallback(() => {
    setPendingEmail(null);
    setPendingSentAt(null);
  }, []);

  const resendEmailChange = useCallback(() => setPendingSentAt(nowIso()), []);

  const confirmEmailChange = useCallback(() => {
    const next = pendingEmail;
    setPendingEmail(null);
    setPendingSentAt(null);
    return next;
  }, [pendingEmail]);

  const markPasswordChanged = useCallback(() => setPasswordChangedAt(nowIso()), []);
  const markExported = useCallback(() => setLastExportAt(nowIso()), []);

  const resetAll = useCallback(() => {
    setPendingEmail(null);
    setPendingSentAt(null);
    setPasswordChangedAt(null);
    setLastExportAt(null);
  }, []);

  const value = useMemo<SecurityContextValue>(
    () => ({
      emailVerified: true,
      pendingEmail,
      pendingSentAt,
      passwordChangedAt,
      lastExportAt,
      startEmailChange,
      cancelEmailChange,
      resendEmailChange,
      confirmEmailChange,
      markPasswordChanged,
      markExported,
      resetAll,
    }),
    [
      pendingEmail,
      pendingSentAt,
      passwordChangedAt,
      lastExportAt,
      startEmailChange,
      cancelEmailChange,
      resendEmailChange,
      confirmEmailChange,
      markPasswordChanged,
      markExported,
      resetAll,
    ],
  );

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useAccountSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error("useAccountSecurity must be used within SecurityProvider");
  return ctx;
}

