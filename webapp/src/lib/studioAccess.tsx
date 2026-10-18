"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useCookieConsent } from "./cookieConsent";
import { isSupabaseConfigured } from "./supabase/client";
import { fetchStudioAccess, startStudioTrial } from "./studioAccessApi";
import { grantsAccess, type StudioAccessInfo } from "./studioAccessState";
import { setStudioAnalyticsAccess, setStudioAnalyticsConsent, trackStudio, trackStudioOnce } from "./studioAnalytics";

/**
 * Who may use the 3D Studio — the single access decision of the browser.
 *
 * The decision itself is the database's (`studio_access_state()`, migration
 * `20261017103101_studio_trial_access`, decision 93): a 48-hour free trial
 * started explicitly once per account, an active subscription, or active
 * staff. Row-level security refuses every design, Gem Group or thumbnail
 * written without access, so what this provider does is navigation and
 * display: it shows the trial invitation, the countdown or the locked screen,
 * and re-reads the state when the page is opened, comes back into view, the
 * trial reaches its end, or the database refuses a save.
 *
 * Without a Supabase project (mock mode, the e2e smoke tests) there is no
 * account to hold a trial: the editor stays open as the labelled preview.
 */

export type StudioAccessStatus =
  | { kind: "preview" }
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error" }
  | { kind: "ready"; info: StudioAccessInfo; readAtPerf: number };

interface StudioAccessValue {
  status: StudioAccessStatus;
  /** True while the Studio may be used, as far as the page knows. */
  granted: boolean;
  starting: boolean;
  startError: boolean;
  /** True right after this page started the trial (the confirmation shows once). */
  justStarted: boolean;
  startTrial: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Called when the database refused a write for lack of access. */
  reportDenied: (operation: string) => void;
  dismissJustStarted: () => void;
}

const StudioAccessContext = createContext<StudioAccessValue | null>(null);

/** Re-read the state this often while the page is visible (subscription changes). */
const REFRESH_MS = 5 * 60_000;
/** setTimeout's ceiling (~24.8 days); a later expiry is caught by the periodic refresh. */
const MAX_TIMER_MS = 2_147_000_000;

export function StudioAccessProvider({ children }: { children: ReactNode }) {
  const { userId, restoring, realAuth } = useAuth();
  const { record } = useCookieConsent();
  const live = isSupabaseConfigured && realAuth;

  const [state, setState] = useState<{ userId: string | null; status: StudioAccessStatus }>({ userId: null, status: { kind: "loading" } });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [justStarted, setJustStarted] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const startLock = useRef(false);
  const previous = useRef<StudioAccessInfo | null>(null);

  useEffect(() => setStudioAnalyticsConsent(record?.analytics === true), [record]);

  const status = useMemo<StudioAccessStatus>(
    () =>
      !live
        ? { kind: "preview" }
        : restoring
          ? { kind: "loading" }
          : !userId
            ? { kind: "signedOut" }
            : state.userId === userId
              ? state.status
              : { kind: "loading" },
    [live, restoring, userId, state],
  );

  /** Records a new answer and the transitions it means. */
  const accept = useCallback(
    (forUser: string, info: StudioAccessInfo) => {
      const readAtPerf = performance.now();
      setStudioAnalyticsAccess(info, readAtPerf);
      const before = previous.current;
      previous.current = info;
      // Once per trial and browser, whether it ran out in front of the member or while away.
      if (info.state === "trial_expired") {
        trackStudioOnce(`expired:${forUser}:${info.trialExpiresAt}`, "studio_trial_expired", {
          observed_in_studio: !!before && grantsAccess(before.state),
        }, "browser");
      }
      if (before && !grantsAccess(before.state) && grantsAccess(info.state) && before.state !== "not_started") {
        trackStudio("studio_access_restored", { from_state: before.state });
      }
      setState({ userId: forUser, status: { kind: "ready", info, readAtPerf } });
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!live || !userId) return;
    if (inFlight.current) return inFlight.current;
    const forUser = userId;
    const run = fetchStudioAccess()
      .then((info) => accept(forUser, info))
      .catch(() => {
        trackStudio("studio_access_check_failed");
        // A failed re-read keeps the last known state: the database still guards
        // every write, so a brief outage does not lock out a valid member.
        setState((current) =>
          current.userId === forUser && current.status.kind === "ready" ? current : { userId: forUser, status: { kind: "error" } },
        );
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  }, [live, userId, accept]);

  // Read on arrival and whenever the account changes.
  useEffect(() => {
    previous.current = null;
    setJustStarted(false);
    void refresh();
  }, [refresh]);

  // Read again when the page comes back into view, and every few minutes while visible.
  useEffect(() => {
    if (!live || !userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(onVisible, REFRESH_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, [live, userId, refresh]);

  // Read again the moment the trial ends, so an open Studio locks without a reload.
  useEffect(() => {
    if (status.kind !== "ready" || status.info.state !== "trial_active" || status.info.trialExpiresAt === null) return;
    const left = status.info.trialExpiresAt - (status.info.serverNow + (performance.now() - status.readAtPerf));
    const timer = window.setTimeout(() => void refresh(), Math.min(MAX_TIMER_MS, Math.max(0, left) + 750));
    return () => window.clearTimeout(timer);
  }, [status, refresh]);

  const startTrial = useCallback(async () => {
    if (!live || !userId || startLock.current) return;
    startLock.current = true;
    setStarting(true);
    setStartError(false);
    const forUser = userId;
    try {
      const { info, started } = await startStudioTrial();
      if (started) {
        trackStudio("studio_trial_started");
        setJustStarted(true);
      }
      // Starting is not entering: no "restored" transition for the first grant.
      previous.current = info;
      accept(forUser, info);
    } catch {
      setStartError(true);
      trackStudio("studio_access_check_failed", { operation: "start_trial" });
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  }, [live, userId, accept]);

  const reportDenied = useCallback(
    (operation: string) => {
      trackStudio("studio_access_denied", { operation });
      void refresh();
    },
    [refresh],
  );

  const granted = status.kind === "preview" || (status.kind === "ready" && grantsAccess(status.info.state));

  const value = useMemo<StudioAccessValue>(
    () => ({
      status,
      granted,
      starting,
      startError,
      justStarted,
      startTrial,
      refresh,
      reportDenied,
      dismissJustStarted: () => setJustStarted(false),
    }),
    [status, granted, starting, startError, justStarted, startTrial, refresh, reportDenied],
  );

  return <StudioAccessContext.Provider value={value}>{children}</StudioAccessContext.Provider>;
}

/** The Studio access of the signed-in member. Outside the provider: no decision (null). */
export function useStudioAccess(): StudioAccessValue | null {
  return useContext(StudioAccessContext);
}

/**
 * True while the Studio runs as the free preview with no account behind it
 * (no Supabase project: mock mode and the smoke tests). The same on the
 * server and in the browser, so public pages may read it while rendering.
 */
export const STUDIO_PREVIEW = !isSupabaseConfigured;
