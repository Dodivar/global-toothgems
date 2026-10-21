import { Film, Image as ImageIcon, Play } from "lucide-react";
import clsx from "clsx";
import type { TrainingMedia } from "../../../lib/trainingMediaRules";
import { secondsToClock } from "../../../lib/adminTrainingMapping";

/**
 * A library item as a tile: its small preview (decision 104), with a play
 * mark and its length for a video — so images and videos are told apart by
 * shape and text, not by colour.
 *
 * Grids show the thumbnail, never a video file: an image without one yet falls
 * back to its original (lazy-loaded), a video without one to an icon, so a
 * tile never downloads a video. `full` asks for the original (details panel).
 */
export function MediaThumb({ media, className, full = false }: { media: TrainingMedia; className?: string; full?: boolean }) {
  const preview = full && media.kind === "image" ? media.src : media.thumbSrc || (media.kind === "image" ? media.src : "");
  const length =
    media.kind === "video" && media.durationSeconds !== null ? (
      <span className="absolute bottom-2 right-2 rounded-[var(--radius-pill)] bg-[rgba(17,17,17,.72)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--gt-white)]">
        {secondsToClock(media.durationSeconds)}
      </span>
    ) : null;

  if (!preview) {
    const Icon = media.kind === "video" ? Film : ImageIcon;
    return (
      <span aria-hidden="true" className={clsx("relative grid place-items-center bg-[var(--surface-sunken)] text-[var(--text-subtle)]", className)}>
        <Icon size={22} strokeWidth={1.8} />
        {length}
      </span>
    );
  }
  if (media.kind === "image") {
    return <img src={preview} alt="" loading="lazy" decoding="async" className={clsx(full ? "object-contain" : "object-cover", className)} />;
  }
  return (
    <span className={clsx("relative block bg-[var(--gt-ink-900)]", className)}>
      <img src={preview} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[rgba(17,17,17,.62)] text-[var(--gt-white)]">
          <Play size={16} strokeWidth={2.4} />
        </span>
      </span>
      {length}
    </span>
  );
}
