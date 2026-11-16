import { LOWER_TEETH, UPPER_TEETH, toothKeys, type PlacedJewelry, type ToothKey } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import {
  projectOnto,
  type FrontViewBox,
  type FrontViewLayout,
  type FrontViewPathCommand,
  type FrontViewProjection,
  type FrontViewTooth,
} from "./frontView";

/**
 * The flat view of a design: the drawing of the "front view" panels and of
 * the placement sheet. Both arches are unrolled — every tooth shows its outer
 * face, at its real proportions, the molars as readable as the incisors — and
 * each crown has the silhouette of its type (square incisors, pointed
 * canines, blunt premolars, two-cusped molars) under a scalloped gum line.
 *
 * The orthographic projection of `frontView.ts` could not serve as a drawing:
 * seen from the front the side teeth are slivers and the upper incisors hide
 * the lower ones. It remains what the try-on fits on a photo.
 *
 * A piece keeps its seat on its tooth (`seatOnTooth`: across and up, as
 * shares of the crown) and its real size in millimetres; the crowns are drawn
 * at average adult dimensions, in the same millimetres.
 *
 * Coordinates as in `frontView.ts`: millimetres, x to the viewer's right (the
 * patient's left), y down, the midline at x = 0, the biting plane at y = 0.
 *
 * Pure: no React, no three.js, no DOM. Unit-tested in `flatView.test.ts`.
 */

type Arch = "upper" | "lower";

/** Crown width and height (gum line to biting edge), mm: average adult dimensions. */
const CROWN_SIZE: Record<Arch, Record<ToothKey, readonly [width: number, height: number]>> = {
  upper: {
    central: [8.6, 10.8],
    lateral: [6.6, 9.4],
    canine: [7.6, 10.6],
    pm1: [7, 8.4],
    pm2: [6.6, 7.8],
    m1: [10.2, 7.4],
    m2: [9.2, 6.8],
  },
  lower: {
    central: [5.3, 9],
    lateral: [5.8, 9.4],
    canine: [6.9, 10.6],
    pm1: [7, 8.4],
    pm2: [7.2, 7.8],
    m1: [11, 7.4],
    m2: [10.4, 6.8],
  },
};

/** How far each biting edge stays from the biting plane, mm: the smile line (laterals shorter, the back teeth rising). */
const EDGE_LIFT: Record<Arch, Record<ToothKey, number>> = {
  upper: { central: 0, lateral: 0.7, canine: 0.2, pm1: 0.7, pm2: 0.9, m1: 1, m2: 1.3 },
  lower: { central: 0, lateral: 0, canine: 0, pm1: 0.4, pm2: 0.5, m1: 0.5, m2: 0.7 },
};

/** Half the opening between the two arches' front teeth, mm. */
const HALF_OPENING = 0.8;
/** Margin left and right of the teeth, mm. */
const MARGIN = 2.2;
/** Gum drawn beyond the highest neck, mm. */
const GUM_BAND = 3.4;

function archTeeth(fdis: readonly string[], lower: boolean): FrontViewTooth[] {
  const arch: Arch = lower ? "lower" : "upper";
  const kinds = fdis.map((fdi) => toothKeys(fdi)?.tooth ?? "central");
  const total = kinds.reduce((sum, k) => sum + CROWN_SIZE[arch][k][0], 0);
  let x = -total / 2;
  return fdis.map((fdi, i) => {
    const kind = kinds[i];
    const [width, height] = CROWN_SIZE[arch][kind];
    const incisal = (lower ? 1 : -1) * (HALF_OPENING + EDGE_LIFT[arch][kind]);
    const tooth: FrontViewTooth = {
      fdi,
      lower,
      x0: x,
      x1: x + width,
      cervical: incisal + (lower ? height : -height),
      incisal,
      pointed: kind === "canine",
      kind,
    };
    x += width;
    return tooth;
  });
}

/** The drawing's teeth, lower arch first (the order of `FrontViewProjection.teeth`), each arch from the viewer's left. */
export const FLAT_VIEW_TEETH: FrontViewTooth[] = [...archTeeth(LOWER_TEETH, true), ...archTeeth(UPPER_TEETH, false)];

export const FLAT_VIEW_BOX: FrontViewBox = (() => {
  const xs = FLAT_VIEW_TEETH.flatMap((t) => [t.x0, t.x1]);
  const ys = FLAT_VIEW_TEETH.map((t) => t.cervical);
  const x = Math.min(...xs) - MARGIN;
  const y = Math.min(...ys) - GUM_BAND;
  return { x, y, width: Math.max(...xs) + MARGIN - x, height: Math.max(...ys) + GUM_BAND - y };
})();

const flatByFdi = new Map(FLAT_VIEW_TEETH.map((t) => [t.fdi, t]));

const FLAT_LAYOUT: FrontViewLayout = {
  box: FLAT_VIEW_BOX,
  teeth: FLAT_VIEW_TEETH,
  // The seat's shares of the calibrated crown (`seatOnTooth`), on the drawn one. Along the arch is always to the viewer's right here.
  place: (fdi, seat) => {
    const t = flatByFdi.get(fdi);
    if (!t) return null;
    return {
      x: (t.x0 + t.x1) / 2 + seat.u * 0.6 * ((t.x1 - t.x0) / 2),
      y: (t.cervical + t.incisal) / 2 - seat.v * 0.55 * (Math.abs(t.incisal - t.cervical) / 2),
    };
  },
};

/**
 * Project a design onto the flat view: `projectFrontView`'s numbering and
 * placement order, on the unrolled arches. `model` is the dentition the
 * pieces were placed on.
 */
export function projectFlatView(pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  return projectOnto(FLAT_LAYOUT, pieces, model);
}

/* ------------------------------------------------------------- outlines */

/**
 * A crown's silhouette, in shares of the crown: across, 1 = the half width;
 * down the crown, 0 = the top of the gum line, 1 = the biting edge.
 */
interface CrownProfile {
  /** Half width at the neck. */
  neck: number;
  /** How far down the crown the neck's sides meet the gum (the gum line arches over the crown). */
  neckDepth: number;
  /** Where the crown is widest and touches its neighbours. */
  contact: number;
  edge:
    | { kind: "flat"; mesial: number; distal: number } // corner radii: the distal corner is the rounder one
    | { kind: "cusp"; tip: number; shoulder: number; drop: number } // half width of the tip; where its slopes start, and how far above the tip
    | { kind: "molar"; groove: number }; // depth of the notch between the two cusps
}

const PROFILES: Record<Arch, Record<ToothKey, CrownProfile>> = {
  upper: {
    central: { neck: 0.8, neckDepth: 0.2, contact: 0.74, edge: { kind: "flat", mesial: 0.16, distal: 0.36 } },
    lateral: { neck: 0.76, neckDepth: 0.2, contact: 0.7, edge: { kind: "flat", mesial: 0.26, distal: 0.52 } },
    canine: { neck: 0.76, neckDepth: 0.2, contact: 0.6, edge: { kind: "cusp", tip: 0.07, shoulder: 0.52, drop: 0.22 } },
    pm1: { neck: 0.78, neckDepth: 0.17, contact: 0.56, edge: { kind: "cusp", tip: 0.2, shoulder: 0.7, drop: 0.1 } },
    pm2: { neck: 0.78, neckDepth: 0.17, contact: 0.56, edge: { kind: "cusp", tip: 0.24, shoulder: 0.74, drop: 0.08 } },
    m1: { neck: 0.86, neckDepth: 0.12, contact: 0.5, edge: { kind: "molar", groove: 0.08 } },
    m2: { neck: 0.86, neckDepth: 0.12, contact: 0.5, edge: { kind: "molar", groove: 0.07 } },
  },
  lower: {
    central: { neck: 0.74, neckDepth: 0.2, contact: 0.84, edge: { kind: "flat", mesial: 0.14, distal: 0.2 } },
    lateral: { neck: 0.74, neckDepth: 0.2, contact: 0.82, edge: { kind: "flat", mesial: 0.14, distal: 0.3 } },
    canine: { neck: 0.76, neckDepth: 0.2, contact: 0.66, edge: { kind: "cusp", tip: 0.07, shoulder: 0.52, drop: 0.22 } },
    pm1: { neck: 0.78, neckDepth: 0.17, contact: 0.56, edge: { kind: "cusp", tip: 0.2, shoulder: 0.7, drop: 0.1 } },
    pm2: { neck: 0.8, neckDepth: 0.17, contact: 0.56, edge: { kind: "cusp", tip: 0.24, shoulder: 0.74, drop: 0.08 } },
    m1: { neck: 0.88, neckDepth: 0.12, contact: 0.5, edge: { kind: "molar", groove: 0.08 } },
    m2: { neck: 0.88, neckDepth: 0.12, contact: 0.5, edge: { kind: "molar", groove: 0.07 } },
  },
};

const profileOf = (t: FrontViewTooth) => PROFILES[t.lower ? "lower" : "upper"][t.kind];

/**
 * From shares of the crown to the drawing: `s` across, positive toward the
 * back of the mouth (distal); `d` from the gum line to the biting edge.
 */
function crownFrame(t: FrontViewTooth): (s: number, d: number) => [number, number] {
  const cx = (t.x0 + t.x1) / 2;
  const half = (t.x1 - t.x0) / 2;
  // Away from the midline (x = 0): the viewer's left for the patient's right side.
  const distal = cx < 0 ? -1 : 1;
  const height = t.incisal - t.cervical;
  return (s, d) => [cx + s * half * distal, t.cervical + d * height];
}

/** A crown's outline: arched under the gum, widest at its contacts, with the biting edge of its type. */
export function crownOutline(t: FrontViewTooth): FrontViewPathCommand[] {
  const p = profileOf(t);
  const at = crownFrame(t);
  const { neck: n, neckDepth: nd, contact: c } = p;
  const curve = (...v: number[]): FrontViewPathCommand => ["C", ...at(v[0], v[1]), ...at(v[2], v[3]), ...at(v[4], v[5])];
  const side = c - nd;
  const below = 1 - c;
  const edge: FrontViewPathCommand[] =
    p.edge.kind === "flat"
      ? [
          curve(1, c + below * 0.6, 1 - p.edge.distal * 0.35, 1, 1 - p.edge.distal, 1),
          ["L", ...at(-(1 - p.edge.mesial), 1)],
          curve(-(1 - p.edge.mesial * 0.35), 1, -1, c + below * 0.6, -1, c),
        ]
      : p.edge.kind === "cusp"
        ? [
            curve(1, c + below * 0.5, p.edge.shoulder, 1 - below * p.edge.drop, p.edge.tip, 1),
            curve(p.edge.tip * 0.4, 1 + below * 0.02, -p.edge.tip * 0.4, 1 + below * 0.02, -p.edge.tip, 1),
            curve(-p.edge.shoulder, 1 - below * p.edge.drop, -1, c + below * 0.5, -1, c),
          ]
        : [
            curve(1, c + below * 0.62, 0.86, 1, 0.54, 1),
            curve(0.3, 1, 0.16, 1 - p.edge.groove, 0, 1 - p.edge.groove),
            curve(-0.16, 1 - p.edge.groove, -0.3, 1, -0.54, 1),
            curve(-0.86, 1, -1, c + below * 0.62, -1, c),
          ];
  return [
    ["M", ...at(-n, nd)],
    curve(-n, nd * 0.35, -n * 0.55, 0, 0, 0),
    curve(n * 0.55, 0, n, nd * 0.35, n, nd),
    curve(n + (1 - n) * 0.4, nd + side * 0.35, 1, c - side * 0.35, 1, c),
    ...edge,
    curve(-1, c - side * 0.35, -(n + (1 - n) * 0.4), nd + side * 0.35, -n, nd),
    ["Z"],
  ];
}

/**
 * The lines drawn inside a crown, as open paths to stroke: the groove between
 * a molar's two cusps. Empty for the other teeth.
 */
export function crownDetails(t: FrontViewTooth): FrontViewPathCommand[][] {
  const p = profileOf(t);
  if (p.edge.kind !== "molar") return [];
  const at = crownFrame(t);
  const from = 1 - p.edge.groove;
  return [[["M", ...at(0, from)], ["C", ...at(0.05, from - 0.14), ...at(-0.04, from - 0.3), ...at(0, 0.5)]]];
}

/**
 * The gum of one arch (`teeth`: that arch only, in any order), as a closed
 * shape to fill behind its crowns: a band across the frame, whose edge runs
 * just inside each crown's neck and comes to a point between two teeth, near
 * their contact. The crowns, drawn over it, cut the scalloped gum line.
 */
export function gumOutline(teeth: readonly FrontViewTooth[], box: FrontViewBox): FrontViewPathCommand[] {
  const row = [...teeth].sort((a, b) => a.x0 - b.x0);
  if (!row.length) return [];
  const edge = row[0].lower ? box.y + box.height : box.y;
  const reach = (t: FrontViewTooth, d: number) => t.cervical + d * (t.incisal - t.cervical);
  /** Where the gum ends at the boundary after tooth `i`: between two teeth, just short of their contact; past the last tooth, a little under its neck. */
  const tip = (i: number): [number, number] => {
    const a = row[i];
    const b = row[i + 1];
    if (a && b) return [a.x1, (reach(a, profileOf(a).contact * 0.9) + reach(b, profileOf(b).contact * 0.9)) / 2];
    const end = a ?? b;
    return [a ? a.x1 : b.x0, reach(end, profileOf(end).neckDepth + 0.14)];
  };
  const first = tip(-1);
  const last = tip(row.length - 1);
  const out: FrontViewPathCommand[] = [
    ["M", box.x, edge],
    ["L", box.x, first[1]],
    ["L", ...first],
  ];
  row.forEach((t, i) => {
    const { neck: n, neckDepth: nd, contact: c } = profileOf(t);
    const cx = (t.x0 + t.x1) / 2;
    const half = (t.x1 - t.x0) / 2;
    // Across the crown (-1 its left edge … 1 its right one) and down it, a hair inside the enamel's own side curve (`crownOutline`).
    const at = (s: number, d: number): [number, number] => [cx + s * half * 0.97, reach(t, d + 0.03)];
    const side = c - nd;
    const shoulder = n + (1 - n) * 0.4;
    out.push(
      ["C", ...at(-1, c - side * 0.35), ...at(-shoulder, nd + side * 0.35), ...at(-n, nd)],
      ["L", ...at(n, nd)],
      ["C", ...at(shoulder, nd + side * 0.35), ...at(1, c - side * 0.35), ...tip(i)],
    );
  });
  out.push(["L", box.x + box.width, last[1]], ["L", box.x + box.width, edge], ["Z"]);
  return out;
}
