/** Pure helpers behind the editor's mirror tools (see the engine's `mirroredSpot`). */

/**
 * A piece's turn once reflected, in whole degrees 0–359. Every shape is drawn
 * symmetric about its vertical axis (a drop's tip up at 0°), so a left–right
 * reflection ('h') turns r into −r and an up–down one ('v') into 180° − r.
 */
export function mirroredRotation(rotation: number, axis: "h" | "v"): number {
  const r = (axis === "h" ? -rotation : 180 - rotation) % 360;
  return Math.round(r + 360) % 360;
}
const OPPOSING_QUADRANT: Record<string, string> = { "1": "4", "2": "3", "3": "2", "4": "1" };
/** The matching tooth on the other arch, across the bite: 11 ↔ 41, 21 ↔ 31, 16 ↔ 46… */
export function opposingTooth(fdi: string): string {
  const quadrant = OPPOSING_QUADRANT[fdi[0]];
  return quadrant ? quadrant + fdi.slice(1) : fdi;
}
