"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../lib/auth";
import type {
  PhotoIssue,
  SmileTryOnService,
  TryOnAnalysis,
  TryOnAudience,
  TryOnCreation,
  TryOnErrorCode,
  TryOnSource,
  TryOnStage,
} from "../../../lib/studio3d/tryOn";
import { deleteRun, loadRuns, saveRun, sourceKey, type StoredTryOn } from "../../../lib/studio3d/tryOnLocal";
import { smileTryOnService } from "../../../lib/studio3d/tryOnService";
import type { PreparedPhoto } from "./preparePhoto";
import { TryOnJobBadge } from "./TryOnJobBadge";

/*
 * The try-on runs outside the dialog (2026-11-05, owner's request): the run
 * belongs to this store, under the root layout, so closing the dialog,
 * opening another page of the site or the editor does not stop it. While no
 * try-on dialog is open, a pill says the render is under way, then that it is
 * ready (or failed, or was interrupted) and opens it again. While a run is
 * under way the screen is kept awake (Screen Wake Lock), so a phone does not
 * fall asleep on its own and cut the request. Every run, its photo and its
 * result are also kept on this device only (`tryOnLocal.ts`, 24 h at most),
 * so a reload finds the result again and an interrupted run starts again
 * without asking for the photo. Nothing is sent or stored anywhere else.
 */

const TryOnDialog = lazy(() => import("./TryOnDialog").then((m) => ({ default: m.TryOnDialog })));

export type TryOnJobStatus =
  | { kind: "running"; stage: TryOnStage }
  | { kind: "result"; image: Blob; url: string; leftOut: number }
  | { kind: "error"; code: TryOnErrorCode; reasons?: PhotoIssue[]; stage: TryOnStage }
  /** Found on this device unfinished: the tab was closed, reloaded or killed during the run. */
  | { kind: "interrupted" };

export interface TryOnJob {
  id: string;
  /** Which creation (`sourceKey`): a dialog shows the job only for its own creation. */
  key: string;
  creation: TryOnCreation;
  source: TryOnSource;
  audience: TryOnAudience;
  /** The photo, with an object URL owned by this store. */
  photo: PreparedPhoto;
  analysis?: TryOnAnalysis;
  /** The service the run was started with: "again" goes through it too. */
  service: SmileTryOnService;
  status: TryOnJobStatus;
}

interface StartInput {
  creation: TryOnCreation;
  source: TryOnSource;
  audience: TryOnAudience;
  photo: Pick<PreparedPhoto, "blob" | "width" | "height">;
  service?: SmileTryOnService;
  /** The analysis of an earlier run of the same photo, reused. */
  analysis?: TryOnAnalysis;
}

interface TryOnJobs {
  job: TryOnJob | null;
  /** Finished runs kept on this device for the signed-in account, newest first. */
  saved: StoredTryOn[];
  /** Start a run (stopping one still under way). */
  start(input: StartInput): void;
  /** Run the current job's photo again (new render, or the interrupted / failed run once more); the analysis is reused when known. */
  again(): void;
  /** Stop the current run and forget it. */
  cancel(): void;
  /** Forget the current job in this tab (a finished result stays on the device). */
  dismiss(): void;
  /** Show a finished run kept on the device. */
  show(id: string): void;
  /** Erase a finished run from the device. */
  remove(id: string): void;
  /** Called by each open try-on dialog (returns its unregistering): while one is open, the pill is hidden. */
  registerDialog(): () => void;
}

const TryOnJobsContext = createContext<TryOnJobs | null>(null);

export function useTryOnJobs(): TryOnJobs {
  const value = useContext(TryOnJobsContext);
  if (!value) throw new Error("useTryOnJobs must be used inside TryOnJobProvider");
  return value;
}

const lockName = (id: string) => `gt-try-on:${id}`;

/** The run ids another tab of this browser is still working on (Web Locks), or none where the API is missing. */
async function runsHeldElsewhere(): Promise<Set<string>> {
  try {
    const state = await navigator.locks?.query();
    return new Set((state?.held ?? []).map((l) => l.name ?? "").filter((n) => n.startsWith("gt-try-on:")).map((n) => n.slice("gt-try-on:".length)));
  } catch {
    return new Set();
  }
}

function photoOf(stored: StoredTryOn["photo"]): PreparedPhoto {
  return { ...stored, url: URL.createObjectURL(stored.blob) };
}

function revoke(job: TryOnJob | null) {
  if (!job) return;
  URL.revokeObjectURL(job.photo.url);
  if (job.status.kind === "result") URL.revokeObjectURL(job.status.url);
}

export function TryOnJobProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { userId, restoring } = useAuth();
  const [job, setJobState] = useState<TryOnJob | null>(null);
  const [saved, setSaved] = useState<StoredTryOn[]>([]);
  const [dialogs, setDialogs] = useState(0);
  /** The creation whose dialog was opened from the pill; it stays open if its run is cancelled (back to the photo step). */
  const [reopened, setReopened] = useState<Pick<TryOnJob, "creation" | "source" | "audience"> | null>(null);
  const jobRef = useRef<TryOnJob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const record = useRef<StoredTryOn | null>(null);
  const userRef = useRef<string | null>(null);
  useEffect(() => {
    userRef.current = userId;
  }, [userId]);

  /** Replace the job, revoking the URLs of the one it replaces. */
  const setJob = useCallback((next: TryOnJob | null) => {
    // A status change keeps the job's URLs (a result's is new); another job replaces them all.
    if (jobRef.current && jobRef.current.id !== next?.id) revoke(jobRef.current);
    jobRef.current = next;
    setJobState(next);
  }, []);

  /** Change the current job's status, if it is still `id`. */
  const update = useCallback(
    (id: string, change: Partial<TryOnJob>) => {
      const current = jobRef.current;
      if (current?.id === id) setJob({ ...current, ...change });
    },
    [setJob],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const launch = useCallback(
    (next: TryOnJob, stored: StoredTryOn | null) => {
      stop();
      const control = new AbortController();
      controller.current = control;
      record.current = stored;
      setJob(next);
      const run = async () => {
        const { runTryOn } = await import("./runTryOn");
        if (control.signal.aborted) return;
        const outcome = await runTryOn(
          { service: next.service, creation: next.creation, source: next.source, audience: next.audience, photo: next.photo.blob, analysis: next.analysis },
          {
            signal: control.signal,
            onStage: (stage) => update(next.id, { status: { kind: "running", stage } }),
            onAnalysed: (analysis) => {
              update(next.id, { analysis });
              if (record.current?.id === next.id) {
                record.current = { ...record.current, analysis };
                void saveRun(record.current);
              }
            },
          },
        ).catch((): { kind: "error"; code: TryOnErrorCode; stage: TryOnStage } => ({ kind: "error", code: "failed", stage: jobRef.current?.status.kind === "running" ? jobRef.current.status.stage : "rendering" }));
        if (outcome.kind === "aborted" || control.signal.aborted) return;
        if (controller.current === control) controller.current = null;
        if (outcome.kind === "error") {
          update(next.id, { status: outcome });
          void deleteRun(next.id);
          return;
        }
        update(next.id, { status: { kind: "result", image: outcome.image, url: URL.createObjectURL(outcome.image), leftOut: outcome.leftOut } });
        const kept = record.current?.id === next.id ? record.current : null;
        if (kept) {
          const done: StoredTryOn = { ...kept, state: "done", result: { image: outcome.image, leftOut: outcome.leftOut } };
          record.current = done;
          void saveRun(done);
          setSaved((list) => [done, ...list.filter((r) => r.id !== done.id)]);
        }
      };
      // The lock tells another tab of this browser that this run is alive (not interrupted).
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      if (locks) void locks.request(lockName(next.id), run).catch(() => undefined);
      else void run();
    },
    [setJob, stop, update],
  );

  const start = useCallback(
    ({ creation, source, audience, photo, service = smileTryOnService, analysis }: StartInput) => {
      const id = crypto.randomUUID();
      const owner = userRef.current;
      const stored: StoredTryOn | null = owner
        ? { id, userId: owner, createdAt: Date.now(), creation, source, audience, photo: { blob: photo.blob, width: photo.width, height: photo.height }, analysis, state: "running" }
        : null;
      if (stored) void saveRun(stored);
      launch(
        {
          id,
          key: sourceKey(source),
          creation,
          source,
          audience,
          photo: photoOf({ blob: photo.blob, width: photo.width, height: photo.height }),
          analysis,
          service,
          status: { kind: "running", stage: analysis ? "rendering" : "checking" },
        },
        stored,
      );
    },
    [launch],
  );

  const again = useCallback(() => {
    const current = jobRef.current;
    if (!current) return;
    // An interrupted run is replaced by its new attempt; a finished one stays on the device.
    if (current.status.kind === "interrupted") {
      void deleteRun(current.id);
      setSaved((list) => list.filter((r) => r.id !== current.id));
    }
    start({ creation: current.creation, source: current.source, audience: current.audience, photo: current.photo, analysis: current.analysis, service: current.service });
  }, [start]);

  const cancel = useCallback(() => {
    const current = jobRef.current;
    stop();
    if (current && current.status.kind !== "result") void deleteRun(current.id);
    setJob(null);
  }, [setJob, stop]);

  const dismiss = useCallback(() => {
    const current = jobRef.current;
    if (current?.status.kind === "running") return;
    if (current?.status.kind === "interrupted") void deleteRun(current.id);
    setJob(null);
  }, [setJob]);

  const show = useCallback(
    (id: string) => {
      if (jobRef.current?.status.kind === "running" || jobRef.current?.id === id) return;
      const found = saved.find((r) => r.id === id);
      if (!found?.result) return;
      setJob({
        id: found.id,
        key: sourceKey(found.source),
        creation: found.creation,
        source: found.source,
        audience: found.audience,
        photo: photoOf(found.photo),
        analysis: found.analysis,
        service: smileTryOnService,
        status: { kind: "result", image: found.result.image, url: URL.createObjectURL(found.result.image), leftOut: found.result.leftOut },
      });
    },
    [saved, setJob],
  );

  const remove = useCallback(
    (id: string) => {
      void deleteRun(id);
      setSaved((list) => list.filter((r) => r.id !== id));
      if (jobRef.current?.id === id && jobRef.current.status.kind !== "running") setJob(null);
    },
    [setJob],
  );

  const registerDialog = useCallback(() => {
    setDialogs((n) => n + 1);
    return () => setDialogs((n) => n - 1);
  }, []);


  // The account's runs on this device: erased when nobody is signed in, another account's erased on sign-in.
  useEffect(() => {
    if (restoring) return;
    let live = true;
    if (!userId) {
      stop();
      setJob(null);
      setSaved([]);
    }
    void (async () => {
      const [runs, elsewhere] = await Promise.all([loadRuns(userId), runsHeldElsewhere()]);
      if (!live || !userId) return;
      const unfinished = runs.filter((r) => r.state === "running" && !elsewhere.has(r.id) && r.id !== jobRef.current?.id);
      // Only the latest unfinished run is offered again; older ones are gone for good.
      for (const r of unfinished.slice(1)) void deleteRun(r.id);
      setSaved(runs.filter((r) => r.state === "done" && r.result));
      const resume = unfinished[0];
      if (resume && !jobRef.current) {
        record.current = resume;
        setJob({
          id: resume.id,
          key: sourceKey(resume.source),
          creation: resume.creation,
          source: resume.source,
          audience: resume.audience,
          photo: photoOf(resume.photo),
          analysis: resume.analysis,
          service: smileTryOnService,
          status: { kind: "interrupted" },
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, restoring, setJob, stop]);

  // Keep the screen awake while a run is under way, taken again when the page comes back (the browser drops it when hidden).
  const running = job?.status.kind === "running";
  useEffect(() => {
    if (!running || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const take = () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (live) lock = sentinel;
          else void sentinel.release();
        })
        .catch(() => undefined);
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => undefined);
    };
  }, [running]);

  // A result arriving while the tab is in the background: its title says so until the tab is shown again.
  const ready = job?.status.kind === "result" ? job.id : null;
  const readyTitle = t("studio.tryOn.job.tabTitle");
  useEffect(() => {
    if (!ready || document.visibilityState === "visible") return;
    const before = document.title;
    document.title = readyTitle;
    const restore = () => {
      if (document.visibilityState !== "visible") return;
      if (document.title === readyTitle) document.title = before;
      document.removeEventListener("visibilitychange", restore);
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
  }, [ready, readyTitle]);

  // Forget everything when the provider goes (never in practice: it sits under the root layout).
  useEffect(
    () => () => {
      controller.current?.abort();
      revoke(jobRef.current);
    },
    [],
  );

  const value = useMemo<TryOnJobs>(
    () => ({ job, saved, start, again, cancel, dismiss, show, remove, registerDialog }),
    [job, saved, start, again, cancel, dismiss, show, remove, registerDialog],
  );

  const pill = job && dialogs === 0 && !(job.status.kind === "error" && job.status.code === "not_available");

  return (
    <TryOnJobsContext.Provider value={value}>
      {children}
      {pill && <TryOnJobBadge job={job} onOpen={() => setReopened({ creation: job.creation, source: job.source, audience: job.audience })} onDismiss={dismiss} />}
      {reopened && (
        <Suspense fallback={null}>
          <TryOnDialog creation={reopened.creation} source={reopened.source} audience={reopened.audience} onClose={() => setReopened(null)} />
        </Suspense>
      )}
    </TryOnJobsContext.Provider>
  );
}
