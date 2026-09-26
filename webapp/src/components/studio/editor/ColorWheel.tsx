import { useEffect, useRef, useState } from "react";
import { Pipette, X } from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import { clamp, hexToHsv, hsvToHex } from "../../../lib/studio3d/math";
import { studioStore } from "../../../lib/studio3d/store";

/* Geometry of the wheel, in CSS pixels. */
const WHEEL = { size: 156, r: 74, ring: 16, sq: 80 };

/**
 * HSV colour wheel: a hue ring around a saturation / value square.
 *
 * One angle convention everywhere — canvas angle θ (0 = 3 o'clock, clockwise)
 * is hue θ — so the painted ring, the picker and the handle agree and the
 * picked colour is exactly the one under the finger. The canvas is a pointer
 * control; the native colour input beside it gives keyboard and assistive
 * technology users the same choice.
 */
export function ColorWheel({ hex, onPick, onClear }: { hex: string | null; onPick: (hex: string) => void; onClear: () => void }) {
  const { t } = useEditorLabels();
  const [hsv, setHsv] = useState(() => (hex ? hexToHsv(hex) : { h: 200, s: 0.75, v: 0.95 }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLCanvasElement | null>(null);
  const armed = useRef(false);
  const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);

  // Pre-render the hue ring once.
  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = off.height = WHEEL.size * dpr;
    const c = off.getContext("2d")!;
    c.scale(dpr, dpr);
    c.lineWidth = WHEEL.ring;
    for (let a = 0; a < 360; a++) {
      c.beginPath();
      c.strokeStyle = `hsl(${a} 100% 50%)`;
      c.arc(WHEEL.size / 2, WHEEL.size / 2, WHEEL.r - WHEEL.ring / 2, ((a - 0.72) * Math.PI) / 180, ((a + 0.72) * Math.PI) / 180);
      c.stroke();
    }
    ringRef.current = off;
  }, [dpr]);

  // Redraw on every change.
  useEffect(() => {
    const cvs = canvasRef.current;
    const ring = ringRef.current;
    if (!cvs || !ring) return;
    const ctx = cvs.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WHEEL.size, WHEEL.size);
    ctx.drawImage(ring, 0, 0, WHEEL.size, WHEEL.size);
    const x0 = WHEEL.size / 2 - WHEEL.sq / 2;
    const y0 = WHEEL.size / 2 - WHEEL.sq / 2;
    // Saturation / value square: hue base, white to the left, black to the bottom.
    ctx.fillStyle = `hsl(${hsv.h} 100% 50%)`;
    ctx.fillRect(x0, y0, WHEEL.sq, WHEEL.sq);
    let g = ctx.createLinearGradient(x0, 0, x0 + WHEEL.sq, 0);
    g.addColorStop(0, "#fff");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, WHEEL.sq, WHEEL.sq);
    g = ctx.createLinearGradient(0, y0, 0, y0 + WHEEL.sq);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, WHEEL.sq, WHEEL.sq);
    ctx.strokeStyle = "rgba(0,0,0,.14)";
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, WHEEL.sq - 1, WHEEL.sq - 1);
    // Hue handle
    const ha = (hsv.h * Math.PI) / 180;
    const hx = WHEEL.size / 2 + Math.cos(ha) * (WHEEL.r - WHEEL.ring / 2);
    const hy = WHEEL.size / 2 + Math.sin(ha) * (WHEEL.r - WHEEL.ring / 2);
    ctx.beginPath();
    ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hsv.h} 100% 50%)`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    // Saturation / value handle
    const sx = x0 + hsv.s * WHEEL.sq;
    const sy = y0 + (1 - hsv.v) * WHEEL.sq;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = hsvToHex(hsv.h, hsv.s, hsv.v);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hsv.v > 0.6 ? "rgba(0,0,0,.5)" : "#fff";
    ctx.stroke();
  });

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let next: { h: number; s: number; v: number } | null = null;
    const x0 = WHEEL.size / 2 - WHEEL.sq / 2;
    const y0 = WHEEL.size / 2 - WHEEL.sq / 2;
    if (x >= x0 && x <= x0 + WHEEL.sq && y >= y0 && y <= y0 + WHEEL.sq) {
      // The square first: its corners must never fall through to the ring.
      next = { h: hsv.h, s: clamp((x - x0) / WHEEL.sq, 0, 1), v: clamp(1 - (y - y0) / WHEEL.sq, 0, 1) };
    } else {
      const dx = x - WHEEL.size / 2;
      const dy = y - WHEEL.size / 2;
      const d = Math.hypot(dx, dy);
      if (d > WHEEL.r - WHEEL.ring - 6 && d < WHEEL.r + 6) {
        let h = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (h < 0) h += 360;
        next = { h, s: hsv.s, v: hsv.v };
      }
    }
    if (next) {
      setHsv(next);
      onPick(hsvToHex(next.h, next.s, next.v)); // live; one undo step per drag (armed on press)
    }
  };

  const current = hex ?? hsvToHex(hsv.h, hsv.s, hsv.v);
  return (
    <div className="grid justify-items-center gap-2.5">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        width={WHEEL.size * dpr}
        height={WHEEL.size * dpr}
        style={{ width: WHEEL.size, height: WHEEL.size }}
        className="cursor-crosshair touch-none rounded-full"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!armed.current) {
            studioStore.pushHistory();
            armed.current = true;
          }
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e);
        }}
        onPointerUp={() => {
          armed.current = false;
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] py-0 pl-1 pr-2.5 text-[11px] font-bold tracking-[.04em] text-[var(--text-body)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
          <span aria-hidden="true" className="h-5 w-5 rounded-full border border-black/10" style={{ background: current }} />
          <Pipette size={12} aria-hidden="true" />
          {current.toUpperCase()}
          <input
            type="color"
            value={current}
            aria-label={t("studio.editor.inspector.customColorInput")}
            className="sr-only"
            onFocus={() => studioStore.pushHistory()}
            onChange={(e) => {
              setHsv(hexToHsv(e.target.value));
              onPick(e.target.value.toLowerCase());
            }}
          />
        </label>
        {hex && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-2.5 text-[11px] font-semibold text-[var(--text-body)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <X size={11} aria-hidden="true" />
            {t("studio.editor.inspector.backToFinishes")}
          </button>
        )}
      </div>
    </div>
  );
}
