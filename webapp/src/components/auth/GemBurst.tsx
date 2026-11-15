import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { photo } from "../../lib/images";

/**
 * The sign-in pages' gem burst: the shop's own gem cut-outs (the home
 * carousel's) set straight on the page's field, with no frame of their own.
 * Each stone flies out from the centre once, then drifts and turns slowly; a
 * stone grows under the pointer, and stones lean away as the pointer comes
 * near. Purely decorative: hidden from assistive tech, never focusable.
 *
 * A fixed layout (never random at render time, which would break hydration):
 * `x`/`y` are the stone's centre in % of the box, `size` its width in % of the
 * box's width, `rot` its resting angle, `drift` the length of its slow
 * float-and-turn loop in seconds.
 */
const BURST: { photo: string; x: number; y: number; size: number; rot: number; drift: number }[] = [
  { photo: "gem-heart-fuchsia.webp", x: 28, y: 33, size: 17, rot: 20, drift: 8 },
  { photo: "gem-diamond-violet.webp", x: 71, y: 29, size: 15, rot: -25, drift: 9 },
  { photo: "gem-rivoli-bermuda-blue.webp", x: 50, y: 52, size: 13, rot: -12, drift: 7 },
  { photo: "gem-starflower-light-topaz.webp", x: 14, y: 64, size: 12, rot: 40, drift: 10 },
  { photo: "gem-navette-emeraude.webp", x: 86, y: 63, size: 11, rot: 10, drift: 8.5 },
  { photo: "gem-gold-star.webp", x: 35, y: 80, size: 9, rot: -30, drift: 7.5 },
  { photo: "gem-heart-aquamarine.webp", x: 65, y: 80, size: 14, rot: 15, drift: 9.5 },
  { photo: "gem-raindrop-heliotrope.webp", x: 92, y: 22, size: 6, rot: -10, drift: 6.5 },
  { photo: "gem-baguette-peridot.webp", x: 8, y: 22, size: 8, rot: 25, drift: 8 },
  { photo: "gem-rivoli-crystal-ab.webp", x: 20, y: 90, size: 5, rot: 60, drift: 7 },
  { photo: "gem-square-aquamarine.webp", x: 79, y: 8, size: 7, rot: -40, drift: 9 },
  { photo: "gem-round-saphir.webp", x: 47, y: 13, size: 10, rot: 30, drift: 8 },
  { photo: "gem-gold-heart.webp", x: 92, y: 90, size: 6, rot: 5, drift: 7 },
  { photo: "gem-heart-siam.webp", x: 23, y: 9, size: 7, rot: -18, drift: 10 },
  { photo: "gem-round-emeraude.webp", x: 66, y: 56, size: 5, rot: 0, drift: 6 },
  { photo: "gem-gold-lightning.webp", x: 36, y: 57, size: 5, rot: 18, drift: 6.5 },
  { photo: "gem-starflower-amethyste.webp", x: 5, y: 44, size: 6, rot: -8, drift: 7.5 },
  { photo: "gem-raindrop-light-siam.webp", x: 96, y: 44, size: 5, rot: 22, drift: 6 },
  { photo: "gem-diamond-sunflower.webp", x: 52, y: 92, size: 8, rot: 35, drift: 8.5 },
  { photo: "gem-baguette-fuchsia.webp", x: 60, y: 7, size: 5, rot: -55, drift: 7 },
];

/** How far, in px, the pointer reaches the stones. */
const REACH_PX = 170;
/** How far, in px, the nearest stone leans away. */
const PUSH_PX = 26;
/** How much, in degrees, the nearest stone turns as it leans. */
const TURN_DEG = 28;

/**
 * Leans the stones away from the pointer: one window listener, one update per
 * frame, written straight into each stone's `translate` / `rotate` (no React
 * state). Only with a fine pointer that hovers, and never under reduced motion.
 */
function usePointerLean(stones: RefObject<(HTMLSpanElement | null)[]>) {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;
    let frame = 0;
    let px = -1e4;
    let py = -1e4;
    const update = () => {
      frame = 0;
      for (const el of stones.current) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - px;
        const dy = r.top + r.height / 2 - py;
        const d = Math.hypot(dx, dy);
        const pull = d < REACH_PX ? (1 - d / REACH_PX) ** 2 : 0;
        if (pull === 0) {
          el.style.translate = "";
          el.style.rotate = "";
          continue;
        }
        const nx = d === 0 ? 0 : dx / d;
        const ny = d === 0 ? 0 : dy / d;
        el.style.translate = `${(nx * PUSH_PX * pull).toFixed(1)}px ${(ny * PUSH_PX * pull).toFixed(1)}px`;
        el.style.rotate = `${((nx >= 0 ? 1 : -1) * TURN_DEG * pull).toFixed(1)}deg`;
      }
    };
    const onMove = (event: PointerEvent) => {
      px = event.clientX;
      py = event.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      px = py = -1e4;
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [stones]);
}

/**
 * Three layers per stone, each owning one motion so none overrides another:
 * the outer span places it and plays the fly-out (`gt-auth-burst`); the middle
 * one leans from the pointer and grows on hover (`gt-auth-stone`); the image
 * drifts and turns (`gt-auth-drift`) from its resting angle.
 */
export function GemBurst({ className = "" }: { className?: string }) {
  const stones = useRef<(HTMLSpanElement | null)[]>([]);
  usePointerLean(stones);
  return (
    <div aria-hidden="true" className={`gt-auth-burst-box relative w-full select-none ${className}`}>
      {BURST.map((g, i) => (
        <span
          key={g.photo}
          className="gt-auth-burst absolute block aspect-square"
          style={
            {
              left: `${g.x - g.size / 2}%`,
              top: `calc(${g.y}% - ${g.size / 2}cqw)`,
              width: `${g.size}%`,
              "--burst-dx": `${50 - g.x}cqw`,
              "--burst-dy": `${50 - g.y}cqh`,
              animationDelay: `${i * 35}ms`,
            } as CSSProperties
          }
        >
          <span
            ref={(el) => {
              stones.current[i] = el;
            }}
            className="gt-auth-stone block h-full w-full"
          >
            {/* Fitted in a square box: tall cuts (raindrops, navettes) keep the size of the round ones. */}
            <img
              src={photo(g.photo)}
              alt=""
              decoding="async"
              draggable={false}
              className="gt-alt-gem gt-auth-drift block h-full w-full object-contain"
              style={
                {
                  "--drift-rot": `${g.rot}deg`,
                  animationDuration: `${g.drift}s`,
                  animationDelay: `${-(i * 1.3) % g.drift}s`,
                } as CSSProperties
              }
            />
          </span>
        </span>
      ))}
    </div>
  );
}
