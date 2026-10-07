import type { GemLook } from "../../../data/studioEditor";

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount) + target * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** CSS background of a look's swatch: polished metal, a tinted crystal, or a rainbow coating. */
export function lookSwatch(look: GemLook): string {
  if (look.material === "metal") return `linear-gradient(135deg, ${mix(look.color, 255, 0.55)}, ${look.color} 55%, ${mix(look.color, 0, 0.3)})`;
  if (look.effect === "iridescent")
    return `radial-gradient(circle at 35% 30%, #ffffff, transparent 45%), conic-gradient(from 30deg, ${look.color}, #ffd6f0, #d2f0ff, #e6ffd9, #fff2c9, ${look.color})`;
  return `radial-gradient(circle at 35% 30%, ${mix(look.color, 255, 0.6)}, ${look.color} 62%, ${mix(look.color, 0, 0.25)})`;
}
