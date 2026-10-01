import { Film, Image as ImageIcon, Play } from "lucide-react";
import clsx from "clsx";
import type { TrainingMedia } from "../../../lib/trainingMediaRules";
import { secondsToClock } from "../../../lib/adminTrainingMapping";

/**
 * A library item as a square thumbnail: the image itself, or a video's first
 * frame with a play mark and its length — so images and videos are told apart
 * by shape and text, not by colour.
 */
export function MediaThumb({ media, className }: { media: TrainingMedia; className?: string }) {
  if (!media.src) {
    const Icon = media.kind === "video" ? Film : ImageIcon;
    return (
      <span aria-hidden="true" className={clsx("grid place-items-center bg-[var(--surface-sunken)] text-[var(--text-subtle)]", className)}>
        <Icon size={22} strokeWidth={1.8} />
      </span>
    );
  }
  if (media.kind === "image") {
    return <img src={media.src} alt="" loading="lazy" className={clsx("object-cover", className)} />;
  }
  return (
    <span className={clsx("relative block bg-[var(--gt-ink-900)]", className)}>
      {/* `#t=0.1` asks for an early frame as the poster; no autoplay, no sound. */}
      <video src={`${media.src}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" aria-hidden="true" />
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(17,17,17,.62)] text-[var(--gt-white)]">
          <Play size={16} strokeWidth={2.4} />
        </span>
      </span>
      {media.durationSeconds !== null && (
        <span className="absolute bottom-2 right-2 rounded-[var(--radius-pill)] bg-[rgba(17,17,17,.72)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--gt-white)]">
          {secondsToClock(media.durationSeconds)}
        </span>
      )}
    </span>
  );
}
