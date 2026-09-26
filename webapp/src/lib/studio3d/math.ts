import type { Vec3 } from "../../data/studioEditor";

/** Short random id for a placed piece or a saved preset. */
export function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const backOut = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
/** Smoothstep on 0..1. */
export const ss01 = (x: number) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};

/** A vector rounded to the thousandth, as stored in a saved design. */
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) });

/** Deterministic pseudo-random 0..1 from a key — gives each tooth its own small irregularities. */
export function seeded(key: string, salt: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const x = Math.sin(h * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* Arch: parabola z = -x²/K. An arc-length table lets the teeth be spaced by width. */
export const ARCH_K = 30;
const ARCH_TABLE: { x: number; s: number }[] = (() => {
  const out: { x: number; s: number }[] = [];
  let acc = 0;
  let px = 0;
  let pz = 0;
  for (let x = 0; x <= 40.0001; x += 0.05) {
    const z = -(x * x) / ARCH_K;
    if (x > 0) acc += Math.hypot(x - px, z - pz);
    out.push({ x, s: acc });
    px = x;
    pz = z;
  }
  return out;
})();

/** The x coordinate at arc length `s` from the midline. */
export function xForArc(s: number): number {
  s = Math.abs(s);
  let lo = 0;
  let hi = ARCH_TABLE.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ARCH_TABLE[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  const a = ARCH_TABLE[Math.max(0, lo - 1)];
  const b = ARCH_TABLE[lo];
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return a.x + (b.x - a.x) * t;
}

/* HSV ↔ hex, for the colour wheel. */
export function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  const to = (t: number) =>
    Math.round((t + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return { h: 0, s: 0, v: 1 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}
