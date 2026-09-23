import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EXPORT_AVAILABLE_DAYS } from "./accountSecurity";

/**
 * Security state of the open (mock) session: a pending email change, when the
 * password last changed, and where the personal-data export stands. Held in
 * memory like the rest of the prototype's session; the simulated service calls
 * live in `accountSecurity.ts`.
 */

/**
 * Where the personal-data export stands. `none` is "request available";
 * `processing` and `ready` follow a request; `expired` is a ready archive whose
 * download window has closed, which puts the request button back.
 */
export type ExportStatus = "none" | "processing" | "ready" | "expired";

export interface DataExport {
  status: ExportStatus;
  requestedAt: string | null;
  readyAt: string | null;
  expiresAt: string | null;
}

/** Simulated processing time. A real export can take far longer; the copy says so. */
const EXPORT_PROCESSING_MS = 8000;

interface SecurityContextValue {
  /** The sign-in email is verified; a pending change never unverifies it. */
  emailVerified: boolean;
  /** New address waiting for its verification link, if a change is in progress. */
  pendingEmail: string | null;
  pendingSentAt: string | null;
  /** Null until the password is changed in this session: shown as "since sign-up". */
  passwordChangedAt: string | null;
  dataExport: DataExport;
  startEmailChange: (email: string) => void;
  cancelEmailChange: () => void;
  resendEmailChange: () => void;
  /** Called by the verification page; returns the address that became the sign-in email. */
  confirmEmailChange: () => string | null;
  markPasswordChanged: () => void;
  startExport: () => void;
  /** Demo shortcuts, so a reviewer need not wait out the timers. */
  finishExportNow: () => void;
  expireExportNow: () => void;
  resetAll: () => void;
}

const EMPTY_EXPORT: DataExport = { status: "none", requestedAt: null, readyAt: null, expiresAt: null };

const SecurityContext = createContext<SecurityContextValue | null>(null);

const nowIso = () => new Date().toISOString();

function readyExport(requestedAt: string | null): DataExport {
  const ready = new Date();
  const expires = new Date(ready.getTime() + EXPORT_AVAILABLE_DAYS * 24 * 60 * 60 * 1000);
  return { status: "ready", requestedAt: requestedAt ?? ready.toISOString(), readyAt: ready.toISOString(), expiresAt: expires.toISOString() };
}

/**
 * Lives above the routes so a data export keeps "processing" while the member
 * browses elsewhere, and a pending email change survives leaving the page —
 * the two things a member expects to find where they left them.
 */
export function SecurityProvider({ children }: { children: ReactNode }) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingSentAt, setPendingSentAt] = useState<string | null>(null);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [dataExport, setDataExport] = useState<DataExport>(EMPTY_EXPORT);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExportTimer = () => {
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = null;
  };

  useEffect(() => clearExportTimer, []);

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

  const startExport = useCallback(() => {
    clearExportTimer();
    const requestedAt = nowIso();
    setDataExport({ status: "processing", requestedAt, readyAt: null, expiresAt: null });
    exportTimer.current = setTimeout(() => setDataExport(readyExport(requestedAt)), EXPORT_PROCESSING_MS);
  }, []);

  const finishExportNow = useCallback(() => {
    clearExportTimer();
    setDataExport((prev) => readyExport(prev.requestedAt));
  }, []);

  const expireExportNow = useCallback(() => {
    clearExportTimer();
    setDataExport((prev) => {
      const base = prev.status === "ready" ? prev : readyExport(prev.requestedAt);
      return { ...base, status: "expired", expiresAt: nowIso() };
    });
  }, []);

  const resetAll = useCallback(() => {
    clearExportTimer();
    setPendingEmail(null);
    setPendingSentAt(null);
    setPasswordChangedAt(null);
    setDataExport(EMPTY_EXPORT);
  }, []);

  const value = useMemo<SecurityContextValue>(
    () => ({
      emailVerified: true,
      pendingEmail,
      pendingSentAt,
      passwordChangedAt,
      dataExport,
      startEmailChange,
      cancelEmailChange,
      resendEmailChange,
      confirmEmailChange,
      markPasswordChanged,
      startExport,
      finishExportNow,
      expireExportNow,
      resetAll,
    }),
    [
      pendingEmail,
      pendingSentAt,
      passwordChangedAt,
      dataExport,
      startEmailChange,
      cancelEmailChange,
      resendEmailChange,
      confirmEmailChange,
      markPasswordChanged,
      startExport,
      finishExportNow,
      expireExportNow,
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

