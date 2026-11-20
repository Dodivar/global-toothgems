import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";

/**
 * The Studio presentation page's hero film (`/videos/studio-3d-hero*`): a
 * silent 27-second loop rendered from the Studio's own 3D engine with the
 * owner's creations — a heart placed gem by gem, an orbit around a star, gems
 * recoloured together, a piece moved and turned, the teeth's shade and light,
 * the mouth opening. No text is burned in, so one file serves both languages.
 *
 * Phones get a lighter 960 px file. It starts on its own only once the page is
 * hydrated, while it is on screen and when the reader has not asked for less
 * motion; the corner button pauses and resumes it (a loop longer than five
 * seconds needs one), and a pause asked by the reader is never overridden.
 */
const VIDEO = "/videos/studio-3d-hero.mp4";
const VIDEO_MOBILE = "/videos/studio-3d-hero-mobile.mp4";
const POSTER = "/videos/studio-3d-hero-poster.webp";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function HeroVideo() {
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

  const label = playing ? t("studioPage.hero.video.pause") : t("studioPage.hero.video.play");
  const Icon = playing ? Pause : Play;

  return (
    <div className="gt-studio-b-frame rounded-[var(--radius-xl)] border border-white/70 p-2.5 sm:p-3">
      <div aria-hidden="true" className="flex items-center gap-1.5 px-2 pb-2.5 pt-1">
        <span className="h-2 w-2 rounded-full bg-[var(--gt-blue-300)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--gt-blue-200)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-200)]" />
      </div>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--gt-blue-50)] sm:aspect-[16/9]">
        <video
          ref={video}
          className="absolute inset-0 block h-full w-full object-cover"
          poster={POSTER}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          aria-describedby={descriptionId}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          <source src={VIDEO_MOBILE} type="video/mp4" media="(max-width: 767px)" />
          <source src={VIDEO} type="video/mp4" />
        </video>
        <p id={descriptionId} className="sr-only">
          {t("studioPage.hero.video.description")}
        </p>
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          title={label}
          className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/85 text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)] backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-blue-500)]"
        >
          <Icon size={16} fill="currentColor" strokeWidth={0} />
        </button>
      </div>
    </div>
  );
}
