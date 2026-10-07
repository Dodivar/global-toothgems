import type { Localized } from "../data/types";

/**
 * Gem options: the pack a gem is sold in and its stone size (SS).
 *
 * Each pack × size a product offers is one `product_variants` row whose
 * `attributes` are `{ "pack": 50, "ss": 6 }` (migration
 * `…_gem_pack_stone_size_options`). Either key may be absent. Values are
 * integers so SS6 sorts before SS10.
 *
 * Packs are set per product: any whole number of stones within the bounds
 * below (migration `…_gem_free_pack_sizes`).
 *
 * Shared by the back office (which edits the options) and the storefront
 * (which lets the customer pick one), so both read the same rules.
 */

/** Stones per pack. Same bounds as the database check. */
export const PACK_MIN = 1;
export const PACK_MAX = 10_000;

/** The pack typed by the administrator, or null when it is not a whole number within the bounds. */
export function parsePackCount(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= PACK_MIN && n <= PACK_MAX ? n : null;
}

/** Whether a pack value can be saved. */
export function isValidPack(pack: number): boolean {
  return Number.isInteger(pack) && pack >= PACK_MIN && pack <= PACK_MAX;
}

/**
 * Stone sizes offered in the editor, with an APPROXIMATE diameter in mm.
 * SS ("stone size") is the rhinestone gauge; manufacturers' tables differ by
 * a tenth of a millimetre or so, hence "≈" wherever the mm value is shown.
 */
export const STONE_SIZES: { ss: number; mm: number }[] = [
  { ss: 2, mm: 1.3 },
  { ss: 3, mm: 1.4 },
  { ss: 4, mm: 1.6 },
  { ss: 5, mm: 1.8 },
  { ss: 6, mm: 2.0 },
  { ss: 7, mm: 2.2 },
  { ss: 8, mm: 2.4 },
  { ss: 9, mm: 2.6 },
  { ss: 10, mm: 2.8 },
  { ss: 12, mm: 3.1 },
  { ss: 16, mm: 3.9 },
  { ss: 20, mm: 4.7 },
];

/** Same bounds as the database check. */
export const SS_MIN = 1;
export const SS_MAX = 60;

/** The option values of one variant. `null` = the product has no such axis. */
export interface GemOptionKey {
  pack: number | null;
  ss: number | null;
}

/** Stable key of a combination, for maps and React keys. */
export function comboKey({ pack, ss }: GemOptionKey): string {
  return `${pack ?? "-"}:${ss ?? "-"}`;
}

/**
 * Reads the pack/SS of a variant's `attributes`. Returns null when the
 * attributes are anything else (a colour, a box quantity…), so a caller can
 * tell "a gem option" from "some other kind of variant".
 */
export function parseGemAttributes(attributes: unknown): GemOptionKey | null {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return null;
  const record = attributes as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => key !== "pack" && key !== "ss")) return null;
  const pack = asInt(record.pack);
  const ss = asInt(record.ss);
  if (pack === undefined || ss === undefined || (pack === null && ss === null)) return null;
  return { pack, ss };
}

/** undefined = present but not an integer (unreadable); null = absent. */
function asInt(value: unknown): number | null | undefined {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) ? n : undefined;
}

export function stoneSizeMm(ss: number): number | undefined {
  return STONE_SIZES.find((size) => size.ss === ss)?.mm;
}

/**
 * Diameter of any stone size, in mm: the table's value, else read off the
 * table between its two neighbours (or past its ends, along the nearest
 * step). For drawing only — never shown as an exact size.
 */
export function stoneSizeMmApprox(ss: number): number {
  const exact = stoneSizeMm(ss);
  if (exact != null) return exact;
  const sizes = STONE_SIZES;
  let i = sizes.findIndex((size) => size.ss > ss);
  if (i <= 0) i = i === 0 ? 1 : sizes.length - 1;
  const a = sizes[i - 1];
  const b = sizes[i];
  const mm = a.mm + ((b.mm - a.mm) * (ss - a.ss)) / (b.ss - a.ss);
  return Math.max(0.8, Math.round(mm * 100) / 100);
}

export function formatSs(ss: number): string {
  return `SS${ss}`;
}

/** "≈ 2,0 mm" / "≈ 2.0 mm", or "" for a size outside the table. */
export function formatSsMm(ss: number, lang: string): string {
  const mm = stoneSizeMm(ss);
  if (mm == null) return "";
  const value = lang.startsWith("en") ? mm.toFixed(1) : mm.toFixed(1).replace(".", ",");
  return `≈ ${value} mm`;
}

/** Same naming as the database writes into `product_variants.name` and its translation. */
export function comboName({ pack, ss }: GemOptionKey): Localized {
  const size = ss != null ? formatSs(ss) : null;
  return {
    fr: [pack != null ? `Pack de ${pack}` : null, size].filter(Boolean).join(" · "),
    en: [pack != null ? `Pack of ${pack}` : null, size].filter(Boolean).join(" · "),
  };
}

/**
 * Every combination of the chosen packs and sizes, packs first, both
 * ascending. An empty axis is simply not an axis: packs only gives
 * `{pack, ss: null}` rows. Both empty gives no combination.
 */
export function combinations(packs: number[], sizes: number[]): GemOptionKey[] {
  const p = [...new Set(packs)].sort((a, b) => a - b);
  const s = [...new Set(sizes)].sort((a, b) => a - b);
  if (p.length === 0 && s.length === 0) return [];
  const packAxis: (number | null)[] = p.length > 0 ? p : [null];
  const sizeAxis: (number | null)[] = s.length > 0 ? s : [null];
  return packAxis.flatMap((pack) => sizeAxis.map((ss) => ({ pack, ss })));
}

/** Suffix the database appends to the product SKU: "-P50-SS6". */
export function comboSkuSuffix({ pack, ss }: GemOptionKey): string {
  return `${pack != null ? `-P${pack}` : ""}${ss != null ? `-SS${ss}` : ""}`;
}

/** Longest suffix a product can get, for the SKU length check. */
export function longestSkuSuffix(combos: GemOptionKey[]): number {
  return combos.reduce((max, combo) => Math.max(max, comboSkuSuffix(combo).length), 0);
}

/* -------------------------------------------------------------------------- */
/* Storefront picker                                                           */
/* -------------------------------------------------------------------------- */

/** The part of a storefront variant the pack/SS picker reads. */
export interface GemPickable {
  id: string;
  pack?: number;
  ss?: number;
  stock?: "low" | "out";
}

/** True when every variant is a pack/SS option, so the two-axis picker applies. */
export function isGemOptionSet(variants: GemPickable[]): boolean {
  return variants.length > 0 && variants.every((v) => v.pack != null || v.ss != null);
}

/** Packs and sizes on offer, ascending. An axis no variant uses is empty. */
export function gemAxes(variants: GemPickable[]): { packs: number[]; sizes: number[] } {
  const sorted = (values: (number | undefined)[]) =>
    [...new Set(values.filter((v): v is number => v != null))].sort((a, b) => a - b);
  return { packs: sorted(variants.map((v) => v.pack)), sizes: sorted(variants.map((v) => v.ss)) };
}

/**
 * The variant to select when the customer picks a pack or a size. The other
 * axis is kept when that combination can be bought; otherwise the nearest
 * one that can (in stock first), so a click never lands on nothing.
 */
export function pickGemVariant<T extends GemPickable>(
  variants: T[],
  want: { pack?: number; ss?: number },
  current: T | undefined,
): T | undefined {
  const pack = want.pack ?? current?.pack;
  const ss = want.ss ?? current?.ss;
  const exact = variants.find((v) => v.pack === pack && v.ss === ss);
  if (exact && exact.stock !== "out") return exact;
  const fixed = want.pack != null ? (v: T) => v.pack === want.pack : (v: T) => v.ss === want.ss;
  const candidates = variants.filter(fixed);
  // Nearest on the axis that moves, so SS6 → SS8 rather than SS3.
  const other = (v: T) => (want.pack != null ? Math.abs((v.ss ?? 0) - (ss ?? 0)) : Math.abs((v.pack ?? 0) - (pack ?? 0)));
  const byDistance = [...candidates].sort((a, b) => other(a) - other(b));
  return byDistance.find((v) => v.stock !== "out") ?? exact ?? byDistance[0];
}

/** Whether a pack can be bought in at least one size. */
export function packAvailable(variants: GemPickable[], pack: number): boolean {
  return variants.some((v) => v.pack === pack && v.stock !== "out");
}

/** Whether a size can be bought with the chosen pack (or at all, without packs). */
export function sizeAvailable(variants: GemPickable[], ss: number, pack: number | undefined): boolean {
  return variants.some((v) => v.ss === ss && v.pack === pack && v.stock !== "out");
}
