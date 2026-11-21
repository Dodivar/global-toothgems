"use client";

import { useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import type { StudioStill } from "../StudioPageImage";

/**
 * Two pictures of the same smile, one over the other, compared by moving a
 * divider: the photo on the left of it, the render with the gems on the right.
 *
 * The divider is a native range input stretched over the picture (invisible,
 * but focusable and labelled), so a drag, a tap, a swipe or the arrow keys all
 * move it, and its focus ring shows on the handle. It starts in the middle on
 * the server and in the browser alike (no hydration difference). Vertical
 * swipes still scroll the page (`touch-action: pan-y`).
 */
export function BeforeAfterSlider({
  before,
  after,
  label,
  beforeLabel,
  afterLabel,
  beforeAlt,
  afterAlt,
}: {
  before: StudioStill;
  after: StudioStill;
  /** The range input's name for screen readers. */
  label: string;
  beforeLabel: string;
  afterLabel: string;
  beforeAlt: string;
  afterAlt: string;
}) {
  const [position, setPosition] = useState(50);
  const image = (still: StudioStill, alt: string, style?: React.CSSProperties) => (
    <img
      src={`${still.base}-${still.width}.webp`}
      srcSet={`${still.base}-${still.width}.webp ${still.width}w, ${still.base}-${still.width * 2}.webp ${still.width * 2}w`}
      sizes="(min-width: 1024px) 640px, calc(100vw - 32px)"
      width={still.width}
      height={still.height}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={style}
      className="absolute inset-0 block h-full w-full object-cover"
    />
  );

  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-[var(--radius-xl)] border border-white/70 bg-[var(--gt-blue-50)] shadow-[var(--shadow-md)]"
      style={{ aspectRatio: `${before.width} / ${before.height}` }}
    >
      {image(before, beforeAlt)}
      {image(after, afterAlt, { clipPath: `inset(0 0 0 ${position}%)` })}

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={`${position} %`}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0 [touch-action:pan-y]"
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.12)]" style={{ left: `${position}%` }}>
        <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white bg-white/90 text-[var(--gt-blue-700)] shadow-[var(--shadow-md)] backdrop-blur">
          <ChevronsLeftRight size={20} />
        </span>
      </div>
      {/* The focus ring of the handle: a sibling of the input, so `peer` reaches it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 z-0 hidden h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 rounded-full outline outline-2 outline-offset-2 outline-[var(--focus-ring)] peer-focus-visible:block"
        style={{ left: `${position}%` }}
      />

      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 rounded-[var(--radius-pill)] bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 rounded-[var(--radius-pill)] bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)] backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
}
