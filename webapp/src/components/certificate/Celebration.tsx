/**
 * The celebration behind the completion moment: a light fall of confetti in the
 * brand's colours that plays once and is gone, and a few soft shapes floating
 * in the wash. An award ceremony, not a party: around twenty pieces, small,
 * slow, and nothing that loops in the reader's way.
 *
 * Every piece is a constant (no randomness during render: the screen's markup
 * must be the same on every render). Under reduced motion nothing falls and
 * nothing floats — the confetti is simply not drawn.
 */

type Piece = { x: number; delay: number; duration: number; color: string; shape: "bar" | "dot" | "spark"; rot: number; drift: number };

const C = {
  emerald: "var(--gt-emerald-400)",
  mint: "var(--gt-emerald-300)",
  blue: "var(--gt-blue-300)",
  blueDeep: "var(--gt-blue-500)",
  pink: "var(--gt-fuchsia-300)",
};

const PIECES: Piece[] = [
  { x: 6, delay: 0, duration: 3.4, color: C.blue, shape: "bar", rot: 30, drift: 18 },
  { x: 12, delay: 0.35, duration: 3.9, color: C.emerald, shape: "spark", rot: 0, drift: -12 },
  { x: 18, delay: 0.15, duration: 3.1, color: C.pink, shape: "dot", rot: 0, drift: 10 },
  { x: 24, delay: 0.6, duration: 3.6, color: C.blueDeep, shape: "bar", rot: -40, drift: -16 },
  { x: 30, delay: 0.05, duration: 4.1, color: C.mint, shape: "bar", rot: 65, drift: 14 },
  { x: 36, delay: 0.45, duration: 3.3, color: C.blue, shape: "spark", rot: 0, drift: 8 },
  { x: 42, delay: 0.2, duration: 3.8, color: C.emerald, shape: "dot", rot: 0, drift: -10 },
  { x: 48, delay: 0.7, duration: 3.5, color: C.blue, shape: "bar", rot: 15, drift: 20 },
  { x: 54, delay: 0.1, duration: 4.0, color: C.pink, shape: "bar", rot: -25, drift: -14 },
  { x: 60, delay: 0.5, duration: 3.2, color: C.mint, shape: "spark", rot: 0, drift: 12 },
  { x: 66, delay: 0.25, duration: 3.7, color: C.blueDeep, shape: "dot", rot: 0, drift: -8 },
  { x: 72, delay: 0.65, duration: 3.4, color: C.emerald, shape: "bar", rot: 50, drift: 16 },
  { x: 78, delay: 0.0, duration: 3.9, color: C.blue, shape: "bar", rot: -60, drift: -18 },
  { x: 84, delay: 0.4, duration: 3.3, color: C.pink, shape: "spark", rot: 0, drift: 10 },
  { x: 90, delay: 0.3, duration: 3.6, color: C.mint, shape: "dot", rot: 0, drift: -12 },
  { x: 95, delay: 0.55, duration: 4.2, color: C.blueDeep, shape: "bar", rot: 20, drift: 8 },
  { x: 15, delay: 1.0, duration: 3.8, color: C.blue, shape: "dot", rot: 0, drift: 14 },
  { x: 39, delay: 1.1, duration: 3.5, color: C.emerald, shape: "bar", rot: -15, drift: -10 },
  { x: 63, delay: 0.95, duration: 4.0, color: C.blue, shape: "spark", rot: 0, drift: 12 },
  { x: 87, delay: 1.15, duration: 3.6, color: C.emerald, shape: "bar", rot: 35, drift: -14 },
];

const BLOBS = [
  { left: "-6%", top: "6%", size: 280, color: "var(--gt-blue-200)", delay: 0 },
  { left: "78%", top: "-4%", size: 220, color: "var(--gt-emerald-50)", delay: -3 },
  { left: "84%", top: "52%", size: 180, color: "var(--gt-fuchsia-50)", delay: -6 },
  { left: "2%", top: "62%", size: 160, color: "var(--gt-emerald-50)", delay: -2 },
];

export function Celebration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--gt-blue-100),transparent_68%)]" />
      {BLOBS.map((blob, i) => (
        <span
          key={i}
          className="gt-cert-float absolute rounded-full opacity-70 blur-[40px]"
          style={{ left: blob.left, top: blob.top, width: blob.size, height: blob.size, background: blob.color, animationDelay: `${blob.delay}s` }}
        />
      ))}
      {PIECES.map((piece, i) => (
        <span
          key={i}
          className="gt-confetti absolute top-0"
          style={
            {
              left: `${piece.x}%`,
              "--drift": `${piece.drift}px`,
              "--rot": `${piece.rot}deg`,
              animationDelay: `${0.5 + piece.delay}s`,
              animationDuration: `${piece.duration}s`,
            } as React.CSSProperties
          }
        >
          {piece.shape === "bar" && <span className="block h-[11px] w-[5px] rounded-[2px]" style={{ background: piece.color }} />}
          {piece.shape === "dot" && <span className="block h-[7px] w-[7px] rounded-full" style={{ background: piece.color }} />}
          {piece.shape === "spark" && (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M6 0Q6 6 12 6Q6 6 6 12Q6 6 0 6Q6 6 6 0Z" fill={piece.color} />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}
