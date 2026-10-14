import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import { usePrefersReducedMotion } from "../homeAlt/usePrefersReducedMotion";

const VIDEO_SRC = "/videos/studio-3d-intro.mp4";
const POSTER_SRC = "/videos/studio-3d-intro-poster.jpg";

/**
 * The Studio demo at the top of its presentation page: the same silent
 * introduction film as the home page, looping on its own, with one
 * play/pause control. Under reduced motion it stays on the poster until the
 * visitor presses play. A stand-in until a dedicated product demo is filmed.
 */
export function StudioDemo({ className }: { className?: string }) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (reduced) el.pause();
    else void el.play().catch(() => {}); // autoplay refused: poster and play button stay
  }, [reduced]);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  const label = playing ? t("studio.demo.pause") : t("studio.demo.play");
  const Icon = playing ? Pause : Play;

  return (
    <figure className={clsx("relative m-0", className)}>
      <div className="gt-studio-stage relative aspect-[4/3] overflow-hidden rounded-[clamp(18px,3vw,28px)] shadow-[var(--shadow-glass-heavy)] sm:aspect-video">
        <video
          ref={video}
          className="absolute inset-0 block h-full w-full object-cover"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={t("studio.demo.description")}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {!playing && (
          <span
            aria-hidden="true"
            className="gt-alt-play pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
          >
            <Play size={26} fill="currentColor" strokeWidth={1.5} className="translate-x-[2px]" />
          </span>
        )}
        {/* The whole frame starts the film too, for a thumb aiming at the middle. */}
        {!playing && <button type="button" tabIndex={-1} aria-hidden="true" onClick={toggle} className="absolute inset-0 cursor-pointer" />}
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-blue-300)]"
        >
          <Icon size={18} fill="currentColor" />
        </button>
      </div>
    </figure>
  );
}
