import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { ArrowRight, Box, Gem as GemGlyph, Pause, Play, Share2 } from "lucide-react";
import { Button } from "../ui/Button";
import { GemIcon } from "../studio/Gem";
import { NewTag } from "../studio/NewTag";
import { STUDIO_PATH } from "../../lib/studioUrl";
import { useReveal } from "../../lib/useReveal";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const VIDEO_SRC = "/videos/studio-3d-intro.mp4";
const POSTER_SRC = "/videos/studio-3d-intro-poster.jpg";

const FEATURES = [
  { key: "feature1", icon: Box },
  { key: "feature2", icon: GemGlyph },
  { key: "feature3", icon: Share2 },
] as const;

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The 3D Studio's showcase: the site's one dark, "night studio" section, with
 * a large video frame at its centre.
 *
 * The frame plays the Studio's silent introduction film (`/videos/`): it loops
 * on its own, with a big play button while paused and a bar with pause and a
 * timeline. A reader who asked for less motion gets the poster until they
 * press play.
 */
export function StudioVideoFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useReveal<HTMLElement>();
  const reduced = usePrefersReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const barToggle = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

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

  const progress = duration ? elapsed / duration : 0;
  const toggleLabel = playing ? t("homeAlt.studio.pause") : t("homeAlt.studio.play");
  const ToggleIcon = playing ? Pause : Play;

  return (
    <section ref={ref} aria-labelledby="gt-alt-studio-title" className="gt-reveal gt-alt-section gt-alt-studio relative w-full overflow-hidden text-[var(--gt-off-white)]">
      <div aria-hidden="true" className="gt-alt-studio-grid pointer-events-none absolute inset-0" />
      <div className="gt-alt-wide relative px-[var(--gt-alt-gutter)]">
        <div className="mb-[clamp(40px,5vw,72px)] grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <div className="grid justify-items-start gap-5">
            <span className="gt-eyebrow inline-flex items-center gap-2 !text-[var(--gt-blue-300)]">
              <Box size={14} aria-hidden="true" />
              {t("homeAlt.studio.eyebrow")}
              <NewTag />
            </span>
            <h2 id="gt-alt-studio-title" className="gt-alt-display max-w-[13ch] !text-[var(--gt-off-white)]">
              {t("homeAlt.studio.title")}
            </h2>
          </div>
          <div className="grid justify-items-start gap-6 lg:justify-self-end">
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">{t("homeAlt.studio.body")}</p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta max-sm:!h-auto max-sm:min-h-14 max-sm:py-3 max-sm:!whitespace-normal max-sm:text-center" onClick={() => navigate(STUDIO_PATH)}>
              {t("homeAlt.studio.cta")}
            </Button>
          </div>
        </div>

        <figure className="relative m-0 mx-auto max-w-[1400px]">
          <span aria-hidden="true" className="gt-alt-float absolute -left-4 -top-6 z-[1] hidden lg:block">
            <GemIcon shape="heart" material="rose" size={56} />
          </span>
          <span aria-hidden="true" className="gt-alt-float gt-alt-float--late absolute -right-5 top-[30%] z-[1] hidden lg:block">
            <GemIcon shape="star" material="gold" size={48} />
          </span>

          <div className="gt-alt-frame relative overflow-hidden rounded-[clamp(18px,2vw,32px)]">
            <div className="gt-studio-stage relative aspect-video">
              <video
                ref={video}
                className="absolute inset-0 block h-full w-full object-cover"
                src={VIDEO_SRC}
                poster={POSTER_SRC}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={t("homeAlt.studio.videoDescription")}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              />

              {/* The big play button, over the picture while it is paused. */}
              {!playing && (
                <button
                  type="button"
                  onClick={() => {
                    toggle();
                    // This button leaves with the pause; keep focus on the player.
                    barToggle.current?.focus();
                  }}
                  aria-label={toggleLabel}
                  className="gt-alt-play absolute left-1/2 top-1/2 grid h-[clamp(64px,7vw,96px)] w-[clamp(64px,7vw,96px)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                >
                  <Play size={30} fill="currentColor" strokeWidth={1.5} className="translate-x-[2px]" />
                </button>
              )}

              {/* Player bar. */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-[clamp(12px,1.6vw,22px)] pb-[clamp(10px,1.4vw,18px)] pt-10 sm:gap-4">
                <button
                  ref={barToggle}
                  type="button"
                  onClick={toggle}
                  aria-label={toggleLabel}
                  className="grid h-10 w-10 flex-none place-items-center rounded-full text-white transition-colors hover:bg-white/15"
                >
                  <ToggleIcon size={18} fill="currentColor" />
                </button>
                <span aria-hidden="true" className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--gt-blue-300)]" style={{ width: `${progress * 100}%` }} />
                </span>
                <span className="flex-none text-[12px] font-semibold tabular-nums text-white/85">
                  <span className="sr-only">{t("homeAlt.studio.videoLabel")} — </span>
                  {clock(elapsed * 1000)} / {clock(duration * 1000)}
                </span>
              </div>
            </div>
          </div>

          <figcaption className="mt-4 text-[13px] text-[var(--gt-ink-400)]">{t("homeAlt.studio.caption")}</figcaption>
        </figure>

        <ul className="m-0 mt-[clamp(40px,5vw,72px)] grid list-none gap-6 p-0 md:grid-cols-3 md:gap-8">
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="grid grid-cols-[auto_1fr] gap-4 border-t border-white/12 pt-6">
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-[var(--gt-blue-300)] ring-1 ring-white/15">
                <Icon size={19} strokeWidth={1.75} />
              </span>
              <span className="grid gap-1">
                <strong className="text-[length:var(--text-h4)] font-bold text-[var(--gt-off-white)]">{t(`homeAlt.studio.${key}Title`)}</strong>
                <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">{t(`homeAlt.studio.${key}Body`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
