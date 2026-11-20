import clsx from "clsx";

/**
 * A still of the 3D Studio presentation page (`public/images/studio-page/`).
 *
 * Every still is real: the creations are rendered by the editor's own engine
 * from the Global Toothgems team's designs, the workspace is a screenshot of
 * the editor. Each file exists at two widths (`<base>-<w>.webp` and twice that),
 * so the browser picks the one its screen needs; width and height are given so
 * the page does not move while it loads, and the stills load lazily (none of
 * them is above the fold).
 */
export interface StudioStill {
  /** Path without the width suffix: `/images/studio-page/idea-doree`. */
  base: string;
  /** The smaller file's width; the larger one is twice as wide. */
  width: number;
  height: number;
}

export function StudioPageImage({
  still,
  alt,
  caption,
  sizes,
  className,
  imageClassName,
}: {
  still: StudioStill;
  alt: string;
  caption?: string;
  /** The `sizes` attribute: how wide the image is drawn at each breakpoint. */
  sizes: string;
  className?: string;
  imageClassName?: string;
}) {
  const { base, width, height } = still;
  return (
    <figure className={clsx("m-0 grid gap-2.5", className)}>
      <img
        src={`${base}-${width}.webp`}
        srcSet={`${base}-${width}.webp ${width}w, ${base}-${width * 2}.webp ${width * 2}w`}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={clsx("block h-auto w-full", imageClassName)}
      />
      {caption && <figcaption className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{caption}</figcaption>}
    </figure>
  );
}
