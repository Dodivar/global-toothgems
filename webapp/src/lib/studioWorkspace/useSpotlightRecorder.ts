import { useCallback, useEffect, useRef, useState } from "react";
import type { GlowbookItem } from "./glowbook";
import type { GlowbookRepository } from "./glowbookRepository";
import {
  needsSpotlightVideo,
  spotlightSecondsFor,
  type SpotlightSeconds,
  type SpotlightVideoState,
} from "./glowbookSpotlight";
import type { Creation } from "./types";

/**
 * Keeps the Glowbook's spotlight video in step with the spotlight creation
 * (decision 103), from the artist's own Studio tab — the only place WebGL can
 * draw it. Whenever a spotlight is chosen and the database says its video is
 * missing or stale (another creation, an edited design), the tab records a
 * new turn on a hidden stage, uploads it and records it. A failure is not
 * retried for the same design and duration (the artist can ask again); a
 * recording cut short because the tab was hidden is retried once it shows.
 */

export type SpotlightJob =
  | { kind: "idle" }
  | { kind: "recording"; progress: number }
  | { kind: "failed"; reason: "unsupported" | "interrupted" | "failed" };

export interface SpotlightValue {
  /** What the database says; null while unknown or without a Glowbook. */
  state: SpotlightVideoState | null;
  job: SpotlightJob;
  /** A signed URL of the recorded video, for the Studio's preview. */
  videoUrl: string | null;
  /** Records a new turn now, at `seconds` (else the current pace). */
  record: (seconds?: SpotlightSeconds) => void;
}

/** Wait this long after a change before recording (several saves in a row record once). */
const SETTLE_MS = 2000;

export function useSpotlightRecorder(
  repo: GlowbookRepository | null,
  featuredItemId: string | null,
  items: GlowbookItem[],
  creations: Creation[],
): SpotlightValue {
  const [state, setState] = useState<SpotlightVideoState | null>(null);
  const [job, setJob] = useState<SpotlightJob>({ kind: "idle" });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);
  const tried = useRef(new Set<string>());
  const running = useRef(false);

  const creationId = featuredItemId ? items.find((i) => i.id === featuredItemId)?.creationId : undefined;
  const creation = creationId ? creations.find((c) => c.id === creationId) : undefined;
  const creationStamp = creation?.updatedAt ?? null;

  // What the database says, again whenever the spotlight or its design changes.
  useEffect(() => {
    if (!repo) return;
    let live = true;
    repo
      .spotlightState()
      .then((s) => live && setState(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [repo, featuredItemId, creationStamp]);

  // The recorded video, for the preview.
  const path = state?.current ? state.path : null;
  useEffect(() => {
    if (!repo || !path) return;
    let live = true;
    void repo.signSpotlightVideo(path).then((url) => live && setVideoUrl(url));
    return () => {
      live = false;
      setVideoUrl(null);
    };
  }, [repo, path]);

  // A recording cut short by a hidden tab starts again once the tab shows.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setVisibleTick((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const run = useCallback(
    async (seconds: SpotlightSeconds, key: string) => {
      if (!repo || !creation || !featuredItemId || running.current) return;
      running.current = true;
      tried.current.add(key);
      setJob({ kind: "recording", progress: 0 });
      let stage: { close: () => void } | null = null;
      try {
        // The exporter (three.js stage) only comes with the first recording.
        const { ExportStage, ExportError } = await import("../studio3d/socialExport/exporter");
        const { pickVideoType } = await import("../studio3d/socialExport/motion");
        const type = typeof MediaRecorder === "undefined" ? null : pickVideoType((t) => MediaRecorder.isTypeSupported(t));
        if (!type) {
          setJob({ kind: "failed", reason: "unsupported" });
          return;
        }
        try {
          const opened = await ExportStage.open(creation.scene);
          stage = opened;
          const blob = await opened.spotlight(type, seconds, { onProgress: (p) => setJob({ kind: "recording", progress: p }) });
          const next = await repo.saveSpotlightVideo({
            itemId: featuredItemId,
            blob,
            type: type.fileType,
            seconds,
            creationUpdatedAt: creation.updatedAt,
          });
          setState(next);
          setJob({ kind: "idle" });
        } catch (err) {
          if (err instanceof ExportError && err.code === "interrupted") {
            tried.current.delete(key);
            setJob({ kind: "failed", reason: "interrupted" });
          } else {
            setJob({ kind: "failed", reason: "failed" });
          }
          // The creation may have changed meanwhile: read again what the database says.
          void repo.spotlightState().then(setState).catch(() => undefined);
        }
      } catch {
        setJob({ kind: "failed", reason: "failed" });
      } finally {
        stage?.close();
        running.current = false;
      }
    },
    [repo, creation, featuredItemId],
  );

  // Record on its own when the video is missing or stale.
  const needed = needsSpotlightVideo(state) && state?.featuredItemId === featuredItemId && !!creation;
  const autoSeconds = spotlightSecondsFor(state);
  const autoKey = `${featuredItemId}|${creationStamp}|${autoSeconds}`;
  useEffect(() => {
    if (!needed || tried.current.has(autoKey) || document.visibilityState !== "visible") return;
    const timer = setTimeout(() => void run(autoSeconds, autoKey), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [needed, autoKey, autoSeconds, run, visibleTick]);

  const record = useCallback(
    (seconds?: SpotlightSeconds) => {
      const s = spotlightSecondsFor(state, seconds ?? null);
      void run(s, `${featuredItemId}|${creationStamp}|${s}|asked-${Date.now()}`);
    },
    [state, featuredItemId, creationStamp, run],
  );

  return { state, job, videoUrl, record };
}
