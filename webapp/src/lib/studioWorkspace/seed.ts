import { ESTIMATE_PRICING, JEWELRY_BY_ID, type FinishId, type PlacedJewelry } from "../../data/studioEditor";
import { approxLabialPoint } from "../studio3d/archLayout";
import { groupEstimateCents, type GemGroupData, type GroupPiece } from "./gemGroup";
import { createScene, sceneStats } from "./scene";
import type { Creation, GemGroup } from "./types";

/**
 * PROTOTYPE DATA — the library a new account finds in the local preview, so
 * the workspace reads as lived-in from the first visit. Only the local
 * repository uses it; the Supabase one starts every account empty.
 *
 * Designs are written as "which piece, on which tooth, where on its face" and
 * turned into full transforms here; the editor re-seats them exactly on the
 * enamel when one is opened.
 */

interface SeedItem {
  type: string;
  tooth: string;
  u?: number;
  v?: number;
  finish?: FinishId;
  scale?: number;
  rot?: number;
}

interface SeedCreation {
  key: string;
  name: string;
  description: string;
  tags: string[];
  favorite?: boolean;
  /** Days ago. */
  created: number;
  updated: number;
  opened?: number;
  items: SeedItem[];
}

/** Both halves of a symmetrical pair: the item on the right tooth, mirrored on the left. */
function pair(item: SeedItem & { tooth: `1${string}` }): SeedItem[] {
  return [item, { ...item, tooth: `2${item.tooth.slice(1)}`, u: -(item.u ?? 0) }];
}

const CREATIONS: SeedCreation[] = [
  {
    key: "minimal-butterfly",
    name: "Minimal Butterfly",
    description: "Symmetrical butterfly composition for front teeth.",
    tags: ["Minimal", "Butterfly", "Symmetrical"],
    favorite: true,
    created: 21,
    updated: 2,
    opened: 1,
    items: [
      ...pair({ type: "shape-butterfly", tooth: "11", u: 0.2, v: 0.05, finish: "gold", scale: 0.75 }),
      ...pair({ type: "crystal-petite", tooth: "12", u: 0, v: -0.25, finish: "clear", scale: 0.45 }),
    ],
  },
  {
    key: "crystal-smile",
    name: "Crystal Smile",
    description: "A full, bright smile line in clear and diamond crystals — the signature look for a first appointment.",
    tags: ["Crystal", "Classic", "Symmetrical"],
    favorite: true,
    created: 34,
    updated: 5,
    items: [
      ...pair({ type: "crystal-round", tooth: "11", u: -0.25, v: 0.1, finish: "clear", scale: 0.9 }),
      ...pair({ type: "crystal-petite", tooth: "11", u: 0.5, v: -0.4, finish: "diamond", scale: 0.45 }),
      ...pair({ type: "crystal-diamond", tooth: "12", u: 0, v: 0, finish: "diamond", scale: 0.7 }),
      ...pair({ type: "crystal-round", tooth: "13", u: 0, v: 0, finish: "clear", scale: 0.8 }),
      ...pair({ type: "crystal-petite", tooth: "14", u: 0, v: 0.05, finish: "clear", scale: 0.55 }),
      ...pair({ type: "crystal-petite", tooth: "15", u: 0, v: 0.05, finish: "diamond", scale: 0.5 }),
    ],
  },
  {
    key: "pink-star-cluster",
    name: "Pink Star Cluster",
    description: "Playful off-centre cluster of rose stars with a single gold accent.",
    tags: ["Pink", "Stars", "Playful"],
    created: 12,
    updated: 1,
    items: [
      { type: "shape-star", tooth: "11", u: 0, v: 0, finish: "rose", scale: 0.8 },
      { type: "crystal-petite", tooth: "11", u: 0.55, v: 0.5, finish: "rose", scale: 0.42 },
      { type: "crystal-petite", tooth: "11", u: -0.55, v: -0.5, finish: "rose", scale: 0.42 },
      { type: "shape-star", tooth: "12", u: 0, v: 0.1, finish: "rose", scale: 0.6 },
      { type: "crystal-petite", tooth: "21", u: -0.4, v: 0.35, finish: "clear", scale: 0.5 },
      { type: "metal-gold-star", tooth: "21", u: 0.35, v: -0.25, finish: "gold", scale: 0.55 },
      { type: "crystal-petite", tooth: "13", u: 0, v: 0, finish: "rose", scale: 0.5 },
    ],
  },
  {
    key: "symmetrical-flower",
    name: "Symmetrical Flower",
    description: "Rose blossoms on the centrals, framed by emerald and clear drops.",
    tags: ["Flower", "Symmetrical", "Spring"],
    created: 40,
    updated: 9,
    items: [
      ...pair({ type: "shape-blossom", tooth: "11", u: 0, v: 0, finish: "rose", scale: 0.85 }),
      ...pair({ type: "crystal-petite", tooth: "11", u: 0.6, v: 0.55, finish: "clear", scale: 0.4 }),
      ...pair({ type: "crystal-petite", tooth: "12", u: 0, v: 0, finish: "emerald", scale: 0.5 }),
      ...pair({ type: "shape-drop", tooth: "13", u: 0, v: -0.1, finish: "clear", scale: 0.6, rot: 180 }),
    ],
  },
  {
    key: "micro-heart",
    name: "Micro Heart",
    description: "One tiny gold heart on the lateral. Discreet, everyday.",
    tags: ["Minimal", "Heart", "Gold"],
    created: 6,
    updated: 6,
    items: [{ type: "metal-gold-heart", tooth: "12", u: 0, v: 0, finish: "gold", scale: 0.5 }],
  },
  {
    key: "celestial-row",
    name: "Celestial Row",
    description: "Moons, stars and sapphires across the smile line, for an evening look.",
    tags: ["Celestial", "Row", "Night"],
    created: 58,
    updated: 16,
    items: [
      ...pair({ type: "crystal-round", tooth: "11", u: 0, v: -0.1, finish: "sapphire", scale: 0.7 }),
      ...pair({ type: "metal-gold-star", tooth: "11", u: -0.45, v: 0.55, finish: "gold", scale: 0.4 }),
      ...pair({ type: "shape-star", tooth: "12", u: 0, v: 0, finish: "diamond", scale: 0.6 }),
      ...pair({ type: "shape-moon", tooth: "13", u: 0, v: 0, finish: "silver", scale: 0.75 }),
      ...pair({ type: "crystal-petite", tooth: "14", u: 0, v: 0, finish: "sapphire", scale: 0.5 }),
    ],
  },
];

interface SeedGroup {
  key: string;
  name: string;
  description: string;
  tags: string[];
  anchor: string;
  favorite?: boolean;
  created: number;
  updated: number;
  used?: number;
  /** [type, finish, scale, x mm, y mm]. */
  pieces: [string, FinishId, number, number, number][];
}

const GROUPS: SeedGroup[] = [
  {
    key: "butterfly-wings",
    name: "Butterfly Wings",
    description: "4-gem arrangement designed for symmetrical placement.",
    tags: ["Butterfly", "Symmetrical"],
    anchor: "11",
    favorite: true,
    created: 18,
    updated: 18,
    used: 2,
    pieces: [
      ["crystal-petite", "rose", 0.55, -1.3, 0.9],
      ["crystal-petite", "rose", 0.55, 1.3, 0.9],
      ["crystal-petite", "clear", 0.45, -1.0, -0.9],
      ["crystal-petite", "clear", 0.45, 1.0, -0.9],
    ],
  },
  {
    key: "mini-flower",
    name: "Mini Flower",
    description: "Four rose petals around a gold heart dot.",
    tags: ["Flower", "Pink"],
    anchor: "21",
    created: 25,
    updated: 11,
    used: 9,
    pieces: [
      ["metal-gold-dot", "gold", 0.4, 0, 0],
      ["crystal-petite", "rose", 0.42, 0, 1.2],
      ["crystal-petite", "rose", 0.42, 1.2, 0],
      ["crystal-petite", "rose", 0.42, 0, -1.2],
      ["crystal-petite", "rose", 0.42, -1.2, 0],
    ],
  },
  {
    key: "star-cluster",
    name: "Star Cluster",
    description: "One diamond star with two small companions.",
    tags: ["Stars", "Playful"],
    anchor: "11",
    created: 9,
    updated: 4,
    used: 3,
    pieces: [
      ["shape-star", "diamond", 0.65, 0, 0.3],
      ["metal-gold-star", "gold", 0.45, 1.6, -0.9],
      ["crystal-petite", "clear", 0.4, -1.5, -1.0],
    ],
  },
  {
    key: "crystal-arc",
    name: "Crystal Arc",
    description: "Six petite crystals following the curve of the incisal edge.",
    tags: ["Crystal", "Arc", "Classic"],
    anchor: "21",
    created: 30,
    updated: 20,
    pieces: [-3, -1.8, -0.6, 0.6, 1.8, 3].map((x, i) => [
      "crystal-petite",
      i % 2 ? "diamond" : "clear",
      0.4,
      x,
      Math.round((0.9 - 0.15 * x * x) * 100) / 100,
    ]),
  },
];

const daysAgo = (now: number, d: number) => new Date(now - d * 86_400_000).toISOString();

function buildPieces(key: string, items: SeedItem[]): PlacedJewelry[] {
  const out: PlacedJewelry[] = [];
  items.forEach((it, i) => {
    const def = JEWELRY_BY_ID[it.type];
    const at = def && approxLabialPoint(it.tooth, it.u ?? 0, it.v ?? 0);
    if (!def || !at) return;
    out.push({
      id: `${key.slice(0, 12)}-${i}`,
      jewelryTypeId: it.type,
      toothId: it.tooth,
      position: at.position,
      normal: at.normal,
      rotation: it.rot ?? 0,
      scale: it.scale ?? def.defaultScale,
      color: it.finish ?? def.defaultColor,
    });
  });
  return out;
}

export function seedCreations(userId: string, now = Date.now()): Omit<Creation, "thumbnailUrl">[] {
  return CREATIONS.map((c) => {
    const scene = createScene({ pieces: buildPieces(c.key, c.items) });
    const stats = sceneStats(scene.pieces);
    return {
      id: `seed-${c.key}`,
      userId,
      name: c.name,
      description: c.description,
      scene,
      elementCount: stats.elementCount,
      estimatedPriceMinor: stats.estimatedPriceMinor,
      currency: stats.currency,
      tags: c.tags,
      isFavorite: !!c.favorite,
      createdAt: daysAgo(now, c.created),
      updatedAt: daysAgo(now, c.updated),
      lastOpenedAt: c.opened != null ? daysAgo(now, c.opened) : null,
    };
  });
}

export function seedGroups(userId: string, now = Date.now()): GemGroup[] {
  return GROUPS.map((g) => {
    const pieces: GroupPiece[] = g.pieces.map(([type, finish, scale, x, y]) => ({
      jewelryTypeId: type,
      color: finish,
      scale,
      rotation: 0,
      at: { x, y, z: 0 },
      facing: { x: 0, y: 0, z: 1 },
    }));
    const data: GemGroupData = { version: 1, anchorToothId: g.anchor, pieces };
    return {
      id: `seed-${g.key}`,
      userId,
      name: g.name,
      description: g.description,
      data,
      elementCount: pieces.length,
      estimatedPriceMinor: groupEstimateCents(pieces),
      currency: ESTIMATE_PRICING.currency,
      tags: g.tags,
      isFavorite: !!g.favorite,
      createdAt: daysAgo(now, g.created),
      updatedAt: daysAgo(now, g.updated),
      lastUsedAt: g.used != null ? daysAgo(now, g.used) : null,
    };
  });
}
