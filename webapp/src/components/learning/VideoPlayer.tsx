import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { formatClock, isStreamableSource, parseClock } from "../../lib/learning/clock";

/**
 * The lesson video player.
 *
 * Two engines behind one set of controls. A real source (http(s) or a blob
 * URL) plays in a native `<video>`. The prototype's authored sources are
 * placeholders (`gtg-media://…`, see the builder), so those run on a simulated
 * clock at real speed against the authored duration — and say so with a small
 * "demo footage" tag, because a player that pretends to stream is worse than
 * one that is honest about being a mock-up. Swapping in signed URLs from
 * private storage (or Mux) needs no change here.
 *
 * Controls stay visible: hiding them on a timer is a classic way to strand
 * keyboard and touch users. Space/K plays, ←/→ seek 5 s, M mutes, F goes
 * fullscreen while the player has focus. Nothing autoplays.
 */

type Phase = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

const SEEK_STEP = 5;
/** Simulated buffering on first play, so the loading state is real in the demo. */
const SIMULATED_LOAD_MS = 650;

export function VideoPlayer({
  source,
  poster,
  title,
  duration,
  onEnded,
}: {
  source: string;
  poster: string;
  title: string;
  /** Authored mm:ss, used until (or instead of) the file's own metadata. */
  duration: string;
  onEnded?: () => void;
}) {
  const { t } = useTranslation();
  const streamable = isStreamableSource(source);
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmedUp = useRef(false);
  /** The simulated clock's position, read by its own interval. */
  const position = useRef(0);
  const titleId = useId();

  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(() => parseClock(duration));
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const stopClock = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(
    () => () => {
      stopClock();
      if (loadTimer.current) clearTimeout(loadTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (video.current) {
      video.current.volume = volume;
      video.current.muted = muted;
    }
  }, [volume, muted]);

  const finish = useCallback(() => {
    stopClock();
    setPhase("ended");
    onEnded?.();
  }, [onEnded]);

  const startClock = useCallback(() => {
    stopClock();
    setPhase("playing");
    timer.current = setInterval(() => {
      position.current = Math.min(position.current + 0.25, total);
      setCurrent(position.current);
      if (position.current >= total) finish();
    }, 250);
  }, [total, finish]);

  const play = () => {
    if (phase === "ended") {
      position.current = 0;
      setCurrent(0);
    }
    if (streamable) {
      if (phase === "ended" && video.current) video.current.currentTime = 0;
      void video.current?.play().catch(() => setPhase("error"));
      return;
    }
    if (!warmedUp.current) {
      warmedUp.current = true;
      setPhase("loading");
      loadTimer.current = setTimeout(startClock, SIMULATED_LOAD_MS);
      return;
    }
    startClock();
  };

  const pause = () => {
    if (streamable) video.current?.pause();
    else {
      stopClock();
      setPhase("paused");
    }
  };

  const playing = phase === "playing" || phase === "loading";
  const toggle = () => (playing ? pause() : play());

  const seek = (to: number) => {
    const next = Math.max(0, Math.min(total, to));
    position.current = next;
    setCurrent(next);
    if (streamable && video.current) video.current.currentTime = next;
    if (phase === "ended" && next < total) setPhase("paused");
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Leave the range inputs their own arrow keys.
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "k") {
      event.preventDefault();
      toggle();
    } else if (key === "arrowright") {
      event.preventDefault();
      seek(current + SEEK_STEP);
    } else if (key === "arrowleft") {
      event.preventDefault();
      seek(current - SEEK_STEP);
    } else if (key === "m") {
      setMuted((m) => !m);
    } else if (key === "f") {
      toggleFullscreen();
    }
  };

  const retry = () => {
    setPhase("idle");
    video.current?.load();
  };

  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div
      ref={frame}
      role="group"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className={clsx(
        "group/video relative overflow-hidden bg-[var(--gt-ink-900)] text-[var(--gt-white)]",
        fullscreen ? "grid h-full w-full place-items-center" : "rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]",
      )}
    >
      <span id={titleId} className="sr-only">
        {t("learning.video.label", { title })}
      </span>

      <div className={clsx("relative w-full", fullscreen ? "max-h-full" : "aspect-video")}>
        {streamable ? (
          <video
            ref={video}
            src={source}
            poster={poster}
            preload="metadata"
            playsInline
            className="h-full w-full object-contain"
            onClick={toggle}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setTotal(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onWaiting={() => setPhase("loading")}
            onPlaying={() => setPhase("playing")}
            onPause={(e) => !e.currentTarget.ended && setPhase("paused")}
            onEnded={finish}
            onError={() => setPhase("error")}
          />
        ) : (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            onClick={toggle}
            className={clsx(
              "h-full w-full object-cover transition-opacity duration-[var(--duration-normal)]",
              phase === "playing" ? "opacity-95" : "opacity-75",
            )}
          />
        )}

        {!streamable && (
          <span className="absolute left-3 top-3 rounded-[var(--radius-pill)] bg-[rgba(17,17,17,.62)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[rgba(250,250,248,.9)]">
            {t("learning.video.demo")}
          </span>
        )}

        {/* Centre stage: the one big control before playback, the spinner while
            loading, and the replay once the video has ended. */}
        {phase === "idle" || phase === "paused" ? (
          <button
            type="button"
            onClick={play}
            aria-label={t("learning.video.play")}
            className="absolute left-1/2 top-1/2 grid h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgba(250,250,248,.94)] text-[var(--gt-ink-900)] shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-fast)] hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gt-white)]"
          >
            <Play size={28} strokeWidth={2} fill="currentColor" className="ml-1" aria-hidden="true" />
          </button>
        ) : phase === "loading" ? (
          <span role="status" className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 justify-items-center gap-2">
            <LoaderCircle size={40} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
            <span className="text-[length:var(--text-caption)] font-semibold">{t("learning.video.loading")}</span>
          </span>
        ) : phase === "ended" ? (
          <div className="gt-celebrate absolute inset-0 grid place-items-center bg-[rgba(17,17,17,.55)]">
            <div role="status" className="grid justify-items-center gap-3 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--gt-ink-900)]">
                <Check size={26} strokeWidth={3} aria-hidden="true" />
              </span>
              <strong className="text-[length:var(--text-body-md)]">{t("learning.video.ended")}</strong>
              <button
                type="button"
                onClick={play}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[rgba(250,250,248,.5)] px-4 py-2 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] hover:bg-[rgba(250,250,248,.12)]"
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t("learning.video.replay")}
              </button>
            </div>
          </div>
        ) : phase === "error" ? (
          <div role="alert" className="absolute inset-0 grid place-items-center bg-[rgba(17,17,17,.7)] p-6 text-center">
            <div className="grid justify-items-center gap-3">
              <TriangleAlert size={28} aria-hidden="true" className="text-[var(--gt-amber-400)]" />
              <strong className="text-[length:var(--text-body-md)]">{t("learning.video.error")}</strong>
              <button
                type="button"
                onClick={retry}
                className="rounded-[var(--radius-pill)] bg-[var(--gt-white)] px-4 py-2 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]"
              >
                {t("learning.video.retry")}
              </button>
            </div>
          </div>
        ) : null}

        {/* Control bar */}
        <div className="absolute inset-x-0 bottom-0 grid gap-1.5 bg-gradient-to-t from-[rgba(17,17,17,.88)] via-[rgba(17,17,17,.5)] to-transparent px-3 pb-2.5 pt-8 sm:px-4">
          <label className="grid">
            <span className="sr-only">{t("learning.video.seek")}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(total))}
              step={1}
              value={Math.round(current)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-valuetext={t("learning.video.position", { current: formatClock(current), total: formatClock(total) })}
              className="gt-learn-range h-1.5 w-full cursor-pointer"
              style={{ "--gt-range-fill": `${pct}%` } as React.CSSProperties}
            />
          </label>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ControlButton label={playing ? t("learning.video.pause") : t("learning.video.play")} onClick={toggle}>
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </ControlButton>
            <span className="min-w-0 truncate text-[length:var(--text-caption)] font-medium tabular-nums">
              {formatClock(current)} <span className="opacity-60">/ {formatClock(total)}</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-[length:var(--text-caption)] font-semibold opacity-90 max-sm:hidden">
              {title}
            </span>
            <span className="flex-1 sm:hidden" />
            <ControlButton label={muted ? t("learning.video.unmute") : t("learning.video.mute")} onClick={() => setMuted((m) => !m)}>
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </ControlButton>
            <label className="hidden items-center sm:flex">
              <span className="sr-only">{t("learning.video.volume")}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  setMuted(Number(e.target.value) === 0);
                }}
                className="gt-learn-range h-1 w-20 cursor-pointer"
                style={{ "--gt-range-fill": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              />
            </label>
            <ControlButton
              label={fullscreen ? t("learning.video.exitFullscreen") : t("learning.video.fullscreen")}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 flex-none place-items-center rounded-full text-[var(--gt-white)] transition-colors hover:bg-[rgba(250,250,248,.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--gt-white)]"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
