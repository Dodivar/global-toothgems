import type { PlacedJewelry } from "../../data/studioEditor";
import { gemOutline, pathToSvg } from "./frontView";
import type { Registration, RegisteredGem } from "./tryOnRegistration";

/**
 * The placement guide of the computed try-on (decision 111 (k), step 3): the
 * customer's mouth close-up with every gem drawn as a flat mark — its cut,
 * colour, size and turn — exactly where the registration put it
 * (`tryOnRegistration.ts`). The image model then only turns the marks into
 * real gems (`TRY_ON_SYSTEM_PROMPT_PLACED` in `studio-try-on`); it decides
 * nothing about where they go.
 *
 * Only gems on a tooth that was found on the photo are drawn: a tooth the fit
 * only expects may be hidden by a lip, and a gem drawn there would float on
 * it. Those gems are counted as left out, like the current render's hidden gems.
 *
 * Pure: the SVG is a string; the drawing onto the photo is in
 * `components/studio/tryOn/placementGuide.ts`.
 */

export interface GuideMark {
  id: string;
  shape: RegisteredGem["shape"];
  /** Centre and half longest side, close-up pixels; turn in degrees, clockwise. */
  x: number;
  y: number;
  r: number;
  stretch: readonly [number, number];
  rotation: number;
  /** `#rrggbb`. */
  color: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The marks to draw, and how many placed gems were left out (their tooth not found on the photo). */
export function guideMarks(registration: Pick<Registration, "gems">, pieces: readonly PlacedJewelry[]): { marks: GuideMark[]; leftOut: number } {
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const marks = registration.gems.flatMap((g): GuideMark[] => {
    if (g.tooth !== "found" || !(g.r > 0)) return [];
    const color = pieceById.get(g.id)?.look.color ?? "";
    return [{ id: g.id, shape: g.shape, x: g.x, y: g.y, r: g.r, stretch: g.stretch, rotation: g.rotation, color: HEX.test(color) ? color : "#ffffff" }];
  });
  return { marks, leftOut: registration.gems.length - marks.length };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The marks as an SVG of the close-up's size, transparent around them: each
 * cut filled with its colour, a thin dark edge so a clear crystal still shows
 * on white enamel, and a small white shine.
 */
export function placementGuideSvg(marks: readonly GuideMark[], width: number, height: number): string {
  const body = marks
    .map((m) => {
      const d = pathToSvg(gemOutline(m.shape, { x: m.x, y: m.y, r: m.r, rotation: m.rotation, stretch: m.stretch }));
      const edge = round(Math.max(0.6, m.r * 0.08));
      const shine = round(m.r * 0.28);
      return (
        `<path d="${d}" fill="${m.color}" stroke="rgba(0,0,0,0.45)" stroke-width="${edge}" stroke-linejoin="round"/>` +
        `<circle cx="${round(m.x - m.r * 0.28)}" cy="${round(m.y - m.r * 0.28)}" r="${shine}" fill="#ffffff" fill-opacity="0.8"/>`
      );
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
