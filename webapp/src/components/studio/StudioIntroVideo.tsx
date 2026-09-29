import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { usePrefersReducedMotion } from "../homeAlt/usePrefersReducedMotion";

const VIDEO_SRC = "/videos/studio-3d-intro.mp4";
const POSTER_SRC = "/videos/studio-3d-intro-poster.jpg";

/**
 * The Studio's introduction: a short silent screen recording of the real
 * editor placing gems, recolouring, moving and rotating them.
 *
 * It loops muted, so it plays on its own; the pause control keeps it
 * dismissable (moving content longer than a few seconds), and a reader who
 * asked for less motion gets the still poster until they press play.
 */
export function StudioIntroVideo() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (reduced) video.pause();
    else void video.play().catch(() => {}); // autoplay refused: the poster and the play button stay
  }, [reduced]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  return (
    <figure className="relative m-0 overflow-hidden rounded-[var(--radius-xl)] bg-[var(--gt-ink-900)] shadow-[var(--shadow-card)]">
      <video
        ref={ref}
        className="block aspect-video w-full"
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={t("studio.teaser.videoLabel")}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={t(playing ? "studio.teaser.videoPause" : "studio.teaser.videoPlay")}
        className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(15,23,42,.72)] text-white backdrop-blur transition-colors hover:bg-[rgba(15,23,42,.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
    </figure>
  );
}
