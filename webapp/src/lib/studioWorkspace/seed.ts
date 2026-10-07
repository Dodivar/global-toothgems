import { FALLBACK_GEM_COLORS, PRODUCTS } from "../../data/products";
import { scaleForSs, type PlacedJewelry } from "../../data/studioEditor";
import { approxLabialPoint } from "../studio3d/archLayout";
import { buildStudioGems, estimateComposition, type StudioGem } from "../studio3d/gemCatalog";
import type { GemGroupData, GroupPiece } from "./gemGroup";
import { createScene } from "./scene";
import type { Creation, GemGroup } from "./types";

/**
 * PROTOTYPE DATA — the library a new account finds in the local preview, so
 * the workspace reads as lived-in from the first visit. Only the local
 * repository uses it (no database configured); the Supabase one starts every
 * account empty. The pieces are the prototype's mock shop gems
 * (`data/products.ts`), drawn from their shop shape and colour.
 *
 * Designs are written as "which gem, on which tooth, where on its face" and
 * turned into full transforms here; the editor re-seats them exactly on the
 * enamel when one is opened.
 */

const MOCK_GEMS = buildStudioGems(PRODUCTS, [], FALLBACK_GEM_COLORS);
const gemOf = (key: string): StudioGem | undefined => MOCK_GEMS.find((g) => g.key === key);
const estimate = (pieces: Pick<PlacedJewelry, "productId" | "variantId" | "look">[]) => estimateComposition(pieces, gemOf);

interface SeedItem {
  /** Mock product id (`data/products.ts`). */
  gem: string;
  tooth: string;
  u?: number;
  v?: number;
  ss?: number;
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
    key: "crystal-smile",
    name: "Crystal Smile",
    description: "A full, bright smile line of clear and aquamarine crystals — the signature look for a first appointment.",
    tags: ["Crystal", "Classic", "Symmetrical"],
    favorite: true,
    created: 34,
    updated: 5,
    opened: 1,
    items: [
      ...pair({ gem: "solitaire", tooth: "11", u: -0.25, v: 0.1, ss: 7 }),
      ...pair({ gem: "aquamarine", tooth: "12", u: 0, v: 0, ss: 5 }),
      ...pair({ gem: "solitaire", tooth: "13", u: 0, v: 0, ss: 5 }),
      ...pair({ gem: "aquamarine", tooth: "14", u: 0, v: 0.05, ss: 2 }),
    ],
  },
  {
    key: "golden-stars",
    name: "Golden Stars",
    description: "Playful off-centre cluster of topaz stars around a gold star.",
    tags: ["Stars", "Gold", "Playful"],
    created: 12,
    updated: 1,
    items: [
      { gem: "etoile", tooth: "11", u: 0, v: 0, ss: 7 },
      { gem: "sun", tooth: "11", u: 0.55, v: 0.5, ss: 2 },
      { gem: "sun", tooth: "12", u: 0, v: 0.1, ss: 5 },
      { gem: "sunflower", tooth: "21", u: -0.3, v: 0.2, ss: 5 },
    ],
  },
  {
    key: "micro-heart",
    name: "Micro Heart",
    description: "One gold heart on the lateral. Discreet, everyday.",
    tags: ["Minimal", "Heart", "Gold"],
    created: 6,
    updated: 6,
    items: [{ gem: "aurora-heart", tooth: "12", u: 0, v: 0, ss: 5 }],
  },
  {
    key: "evening-row",
    name: "Evening Row",
    description: "Sapphire navettes and heliotrope baguettes across the smile line, for an evening look.",
    tags: ["Row", "Night", "Symmetrical"],
    created: 58,
    updated: 16,
    items: [
      ...pair({ gem: "sapphire-ab", tooth: "11", u: 0, v: -0.1, ss: 7 }),
      ...pair({ gem: "heliotrope", tooth: "12", u: 0, v: 0, ss: 5 }),
      ...pair({ gem: "capri", tooth: "13", u: 0, v: 0, ss: 5 }),
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
  /** [mock product id, SS, x mm, y mm]. */
  pieces: [string, number, number, number][];
}

const GROUPS: SeedGroup[] = [
  {
    key: "mini-flower",
    name: "Mini Flower",
    description: "Four topaz petals around a gold heart.",
    tags: ["Flower", "Gold"],
    anchor: "21",
    favorite: true,
    created: 25,
    updated: 11,
    used: 9,
    pieces: [
      ["aurora-heart", 5, 0, 0],
      ["sun", 2, 0, 1.3],
      ["sun", 2, 1.3, 0],
      ["sun", 2, 0, -1.3],
      ["sun", 2, -1.3, 0],
    ],
  },
  {
    key: "crystal-arc",
    name: "Crystal Arc",
    description: "Six small crystals following the curve of the incisal edge.",
    tags: ["Crystal", "Arc", "Classic"],
    anchor: "21",
    created: 30,
    updated: 20,
    pieces: [-3, -1.8, -0.6, 0.6, 1.8, 3].map((x, i) => [i % 2 ? "aquamarine" : "solitaire", 2, x, Math.round((0.9 - 0.15 * x * x) * 100) / 100]),
  },
];

const daysAgo = (now: number, d: number) => new Date(now - d * 86_400_000).toISOString();

function buildPieces(key: string, items: SeedItem[]): PlacedJewelry[] {
  const out: PlacedJewelry[] = [];
  items.forEach((it, i) => {
    const gem = gemOf(it.gem);
    const at = gem && approxLabialPoint(it.tooth, it.u ?? 0, it.v ?? 0);
    if (!gem || !at) return;
    const ss = it.ss ?? gem.sizes[0];
    out.push({
      id: `${key.slice(0, 12)}-${i}`,
      productId: gem.key,
      ss,
      look: gem.finishes[0].look,
      toothId: it.tooth,
      position: at.position,
      normal: at.normal,
      rotation: it.rot ?? 0,
      scale: scaleForSs(ss),
    });
  });
  return out;
}

export function seedCreations(userId: string, now = Date.now()): Omit<Creation, "thumbnailUrl">[] {
  return CREATIONS.map((c) => {
    const scene = createScene({ pieces: buildPieces(c.key, c.items) });
    const value = estimate(scene.pieces);
    return {
      id: `seed-${c.key}`,
      userId,
      name: c.name,
      description: c.description,
      scene,
      elementCount: scene.pieces.length,
      estimatedPriceMinor: value.totalMinor,
      currency: value.currency,
      tags: c.tags,
      isFavorite: !!c.favorite,
      createdAt: daysAgo(now, c.created),
      updatedAt: daysAgo(now, c.updated),
      lastOpenedAt: c.opened != null ? daysAgo(now, c.opened) : null,
    };
  });
}

export function seedGroups(userId: string, now = Date.now()): Omit<GemGroup, "thumbnailUrl">[] {
  return GROUPS.map((g) => {
    const pieces: GroupPiece[] = g.pieces.flatMap(([key, ss, x, y]) => {
      const gem = gemOf(key);
      if (!gem) return [];
      return [{ productId: gem.key, ss, look: gem.finishes[0].look, rotation: 0, at: { x, y, z: 0 }, facing: { x: 0, y: 0, z: 1 } }];
    });
    const data: GemGroupData = { version: 2, anchorToothId: g.anchor, pieces };
    const value = estimate(pieces);
    return {
      id: `seed-${g.key}`,
      userId,
      name: g.name,
      description: g.description,
      data,
      elementCount: pieces.length,
      estimatedPriceMinor: value.totalMinor,
      currency: value.currency,
      tags: g.tags,
      isFavorite: !!g.favorite,
      createdAt: daysAgo(now, g.created),
      updatedAt: daysAgo(now, g.updated),
      lastUsedAt: g.used != null ? daysAgo(now, g.used) : null,
    };
  });
}
