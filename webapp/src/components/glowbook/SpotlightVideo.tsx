"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gem, Pause, Play } from "lucide-react";
import clsx from "clsx";

/**
 * The spotlight creation turning (decision 103): a short silent loop with the
 * still render as its poster. It plays on its own once hydrated — never for
 * visitors who asked for reduced motion, who get the play button instead —
 * and can always be paused. A browser that cannot play the file (a WebM
 * recorded by Firefox on an older iPhone) keeps the still. Same markup on the
 * server and on the first browser render.
 */
export function SpotlightVideo({
  videoUrl,
  videoType,
  posterUrl,
  name,
  className,
}: {
  videoUrl: string | null;
  videoType: string | null;
  posterUrl: string | null;
  name: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Muted for real (the attribute alone is not reliable before hydration), then play unless motion is unwanted.
    video.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void video.play().catch(() => undefined);
  }, [videoUrl]);

  if (!videoUrl || failed) {
    if (!posterUrl) {
      return (
        <span className={clsx("grid h-full w-full place-items-center text-[var(--gb-accent)]", className)}>
          <Gem size={44} aria-hidden="true" />
        </span>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
    return <img src={posterUrl} alt={name} className={clsx("h-full w-full object-cover", className)} />;
  }

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <span className={clsx("relative block h-full w-full", className)}>
      <video
        ref={ref}
        className="h-full w-full object-cover"
        poster={posterUrl ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={t("studio.glowbook.public.spotlightVideo", { name })}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      >
        <source src={videoUrl} type={videoType ?? undefined} onError={() => setFailed(true)} />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={t(playing ? "studio.glowbook.public.spotlightPause" : "studio.glowbook.public.spotlightPlay")}
        className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-[rgba(22,26,32,.72)] text-white backdrop-blur-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
    </span>
  );
}
