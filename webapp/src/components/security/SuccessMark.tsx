import type { CSSProperties } from "react";
import { CircleCheck, type LucideIcon } from "lucide-react";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import type { GemShape } from "../../data/products";

/** A lighter version of the welcome screen's burst: five gem cuts, not eight. */
const SPARKS: { shape: GemShape; x: number; y: number; r: number; delay: number; size: number; tone: string }[] = [
  { shape: "star", x: -92, y: -30, r: -40, delay: 0, size: 14, tone: "var(--gt-blue-400)" },
  { shape: "heart", x: 90, y: -40, r: 30, delay: 40, size: 15, tone: "var(--gt-fuchsia-300)" },
  { shape: "round", x: -70, y: 30, r: 60, delay: 90, size: 11, tone: "var(--gt-emerald-400)" },
  { shape: "drop", x: 78, y: 26, r: -20, delay: 60, size: 12, tone: "var(--gt-blue-300)" },
  { shape: "navette", x: -18, y: -64, r: 20, delay: 120, size: 12, tone: "var(--gt-blue-500)" },
];

/**
 * The rewarding "done" mark for a verified email: the registration welcome's
 * emerald disc with a small burst of gem cuts. Decorative only — the heading
 * next to it says what happened — and still under reduced motion.
 */
export function SuccessMark({ icon: Icon = CircleCheck }: { icon?: LucideIcon }) {
  return (
    <span aria-hidden="true" className="relative grid place-items-center">
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="gt-burst-spark absolute"
            style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, "--r": `${s.r}deg`, animationDelay: `${s.delay}ms`, color: s.tone } as CSSProperties}
          >
            <ShapeGlyph shape={s.shape} size={s.size} />
          </span>
        ))}
      </span>
      <span className="gt-celebrate relative grid h-[80px] w-[80px] place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--gt-ink-900)] shadow-[0_12px_36px_-8px_rgba(18,168,122,.55)]">
        <span className="absolute inset-[-8px] rounded-full border border-[var(--gt-emerald-300)] opacity-70" />
        <Icon size={36} strokeWidth={1.8} />
      </span>
    </span>
  );
}
