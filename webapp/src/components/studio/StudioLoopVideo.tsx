import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Pause, Play } from "lucide-react";

/**
 * A silent looping film of the Studio presentation page, in the page's window
 * frame: the hero's film and the editor demonstration.
 *
 * Phones get a lighter file. A film starts on its own only once the page is
 * hydrated, while it is on screen and when the reader has not asked for less
 * motion, and pauses again when it leaves the screen, so only the film in view
 * plays. With `preload="none"` nothing but the poster is fetched until then.
 * The corner button pauses and resumes it (a loop longer than five seconds
 * needs one), and a pause asked by the reader is never overridden.
 */
export interface LoopFilm {
  src: string;
  /** Served under 768 px. */
  mobileSrc: string;
  poster: string;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function StudioLoopVideo({
  film,
  description,
  preload = "none",
  aspectClassName = "aspect-[16/10]",
  buttonSide = "right",
}: {
  film: LoopFilm;
  /** What the film shows, read by screen readers. */
  description: string;
  preload?: "none" | "metadata";
  aspectClassName?: string;
  /** The corner of the pause button, away from what the film shows. */
  buttonSide?: "left" | "right";
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const pausedByReader = useRef(false);
  const [playing, setPlaying] = useState(false);
  const descriptionId = useId();

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const media = window.matchMedia(REDUCED_MOTION);
    let visible = false;
    const sync = () => {
      if (visible && !media.matches && !pausedByReader.current) void el.play().catch(() => {}); // autoplay refused: the poster and the button stay
      else if (!el.paused) el.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(el);
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      pausedByReader.current = false;
      void el.play().catch(() => {});
    } else {
      pausedByReader.current = true;
      el.pause();
    }
  };

  const label = playing ? t("studioPage.video.pause") : t("studioPage.video.play");
  const Icon = playing ? Pause : Play;

  return (
    <div className="gt-studio-b-frame rounded-[var(--radius-xl)] border border-white/70 p-2.5 sm:p-3">
      <div aria-hidden="true" className="flex items-center gap-1.5 px-2 pb-2.5 pt-1">
        <span className="h-2 w-2 rounded-full bg-[var(--gt-blue-300)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--gt-blue-200)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-200)]" />
      </div>
      <div className={clsx("relative w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--gt-blue-50)]", aspectClassName)}>
        <video
          ref={video}
          className="absolute inset-0 block h-full w-full object-cover"
          poster={film.poster}
          muted
          loop
          playsInline
          preload={preload}
          disablePictureInPicture
          aria-describedby={descriptionId}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          <source src={film.mobileSrc} type="video/mp4" media="(max-width: 767px)" />
          <source src={film.src} type="video/mp4" />
        </video>
        <p id={descriptionId} className="sr-only">
          {description}
        </p>
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          title={label}
          className={clsx("absolute bottom-3 grid", buttonSide === "left" ? "left-3" : "right-3", "h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/85 text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)] backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-blue-500)]")}
        >
          <Icon size={16} fill="currentColor" strokeWidth={0} />
        </button>
      </div>
    </div>
  );
}
