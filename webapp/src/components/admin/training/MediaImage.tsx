import { Image as ImageIcon } from "lucide-react";
import clsx from "clsx";
import { useTrainingMedia } from "../../../lib/trainingMedia";

/**
 * An image of the training library, from a course's media reference.
 *
 * A reference is not a URL (it is a `training_media` id once stored), so every
 * image the course screens show goes through here. An empty slot or a file
 * still being signed renders a neutral placeholder, never a broken image.
 */
export function MediaImage({
  mediaRef,
  className,
  alt = "",
  loading,
}: {
  mediaRef: string | undefined;
  className?: string;
  /** Empty = decorative. */
  alt?: string;
  loading?: "lazy" | "eager";
}) {
  const { urlOf } = useTrainingMedia();
  const src = urlOf(mediaRef);
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={clsx("grid place-items-center bg-[var(--surface-sunken)] text-[var(--text-subtle)]", className)}
      >
        <ImageIcon size={20} strokeWidth={1.8} />
      </span>
    );
  }
  return <img src={src} alt={alt} aria-hidden={alt ? undefined : true} loading={loading} className={className} />;
}
