import type { Localized } from "../data/types";

/**
 * Gem options: the pack a gem is sold in and its size.
 *
 * Each pack × size a product offers is one `product_variants` row whose
 * `attributes` are `{ "pack": 50, "ss": 6 }` or `{ "pack": 10, "mm": [2, 4] }`
 * (migrations `…_gem_pack_stone_size_options`, `…_gem_free_sizes`). Either key
 * may be absent.
 *
 * Sizes (decided by the owner, 2026-10-22, decision 107): round stones are
 * sized in SS, the rhinestone gauge; every other cut in millimetres typed by
 * the administrator — one value (diameter / longest side) or two (width ×
 * length). A product is sized one way only. Either way the size knows its
 * millimetres, which is what the 3D Studio draws.
 *
 * Packs are set per product: any whole number of stones within the bounds
 * below (migration `…_gem_free_pack_sizes`).
 *
 * Shared by the back office (which edits the options), the storefront (which
 * lets the customer pick one) and the Studio, so all read the same rules.
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

/* -------------------------------------------------------------------------- */
/* Sizes                                                                       */
/* -------------------------------------------------------------------------- */

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
export const MM_MIN = 0.5;
export const MM_MAX = 30;

/** How a product's sizes are written: SS gauges (round stones) or millimetres. */
export type SizeMode = "ss" | "mm";

/**
 * A gem size: an SS gauge, or millimetre dimensions (one value, or width ×
 * length, ascending, to a tenth). Serialised as-is in variant attributes and
 * Studio pieces.
 */
export type GemSize = { ss: number; mm?: undefined } | { mm: number[]; ss?: undefined };

export function sizeMode(size: GemSize): SizeMode {
  return size.ss != null ? "ss" : "mm";
}

/** Stable identity of a size, for maps, React keys and matching a piece to a shop option. */
export function sizeKey(size: GemSize): string {
  return size.ss != null ? `ss${size.ss}` : `mm${size.mm.join("x")}`;
}

export function sameSize(a: GemSize | null | undefined, b: GemSize | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return sizeKey(a) === sizeKey(b);
}

const tenth = (n: number) => Math.round(n * 10) / 10;
const isTenth = (n: number) => Number.isFinite(n) && Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;

/** Millimetre dimensions as stored: 1–2 values within bounds, to a tenth, ascending. */
function canonicalMm(values: number[]): number[] | null {
  if (values.length < 1 || values.length > 2) return null;
  if (!values.every((v) => isTenth(v) && v >= MM_MIN && v <= MM_MAX)) return null;
  return values.map(tenth).sort((a, b) => a - b);
}

/** A size read from storage (attributes, a saved piece), or null when it is not one we could have written. */
export function sanitizeSize(value: unknown): GemSize | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.ss != null && record.mm != null) return null;
  if (record.ss != null) {
    const ss = typeof record.ss === "string" ? Number(record.ss) : record.ss;
    return typeof ss === "number" && Number.isInteger(ss) && ss >= SS_MIN && ss <= SS_MAX ? { ss } : null;
  }
  if (Array.isArray(record.mm) && record.mm.every((v) => typeof v === "number")) {
    const mm = canonicalMm(record.mm as number[]);
    return mm ? { mm } : null;
  }
  return null;
}

/**
 * A size typed by the administrator: "SS6", "2x4", "2 × 4 mm", "2,5mm",
 * "3". Width and length may come in any order. Null when it reads as none.
 */
export function parseSizeInput(input: string, mode: SizeMode): GemSize | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (mode === "ss") {
    const m = /^(?:ss)?(\d{1,2})$/.exec(text);
    return m ? sanitizeSize({ ss: Number(m[1]) }) : null;
  }
  const m = /^(\d{1,2}(?:[.,]\d)?)(?:[x×*](\d{1,2}(?:[.,]\d)?))?(?:mm)?$/.exec(text);
  if (!m) return null;
  const values = [m[1], m[2]].filter((v): v is string => v != null).map((v) => Number(v.replace(",", ".")));
  const mm = canonicalMm(values);
  return mm ? { mm } : null;
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

/** The longest side of a size, in mm (approximate for an SS gauge): what the Studio draws. */
export function sizeLongestMm(size: GemSize): number {
  return size.ss != null ? stoneSizeMmApprox(size.ss) : size.mm[size.mm.length - 1];
}

/** Smaller first: by longest side, then by width, then SS before mm. */
export function compareSizes(a: GemSize, b: GemSize): number {
  return (
    sizeLongestMm(a) - sizeLongestMm(b) ||
    (a.mm?.[0] ?? sizeLongestMm(a)) - (b.mm?.[0] ?? sizeLongestMm(b)) ||
    sizeKey(a).localeCompare(sizeKey(b))
  );
}

/** Distinct sizes, smallest first. */
export function sortSizes(sizes: GemSize[]): GemSize[] {
  const unique = new Map(sizes.map((s) => [sizeKey(s), s]));
  return [...unique.values()].sort(compareSizes);
}

function mmNumber(value: number, lang: string): string {
  const text = String(tenth(value));
  return lang.startsWith("en") ? text : text.replace(".", ",");
}

/** "SS6", "2 × 4 mm", "2,5 mm" (French decimals) — as the database names the option. */
export function formatSize(size: GemSize, lang: string): string {
  if (size.ss != null) return `SS${size.ss}`;
  return `${size.mm.map((v) => mmNumber(v, lang)).join(" × ")} mm`;
}

/** The size's millimetres when its name does not say them: "≈ 2,0 mm" for an SS gauge, "" otherwise. */
export function formatSizeDetail(size: GemSize, lang: string): string {
  if (size.ss == null) return "";
  const mm = stoneSizeMm(size.ss);
  if (mm == null) return "";
  const value = lang.startsWith("en") ? mm.toFixed(1) : mm.toFixed(1).replace(".", ",");
  return `≈ ${value} mm`;
}

/** Name and detail together: "SS6 · ≈ 2,0 mm", "2 × 4 mm". */
export function formatSizeFull(size: GemSize, lang: string): string {
  return [formatSize(size, lang), formatSizeDetail(size, lang)].filter(Boolean).join(" · ");
}

/** The SKU spelling of a size, as the database writes it: "SS6", "2P5X5MM". */
export function sizeSkuCode(size: GemSize): string {
  return size.ss != null ? `SS${size.ss}` : `${size.mm.map((v) => String(tenth(v)).replace(".", "P")).join("X")}MM`;
}

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

/** The option values of one variant. `null` = the product has no such axis. */
export interface GemOptionKey {
  pack: number | null;
  size: GemSize | null;
}

/** Stable key of a combination, for maps and React keys. */
export function comboKey({ pack, size }: GemOptionKey): string {
  return `${pack ?? "-"}:${size ? sizeKey(size) : "-"}`;
}

/**
 * Reads the pack/size of a variant's `attributes`. Returns null when the
 * attributes are anything else (a colour, a box quantity, a free-text
 * `size`…), so a caller can tell "a gem option" from "some other kind of
 * variant".
 */
export function parseGemAttributes(attributes: unknown): GemOptionKey | null {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return null;
  const record = attributes as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => key !== "pack" && key !== "ss" && key !== "mm")) return null;
  const pack = asInt(record.pack);
  if (pack === undefined) return null;
  let size: GemSize | null = null;
  if (record.ss != null || record.mm != null) {
    size = sanitizeSize({ ss: record.ss ?? undefined, mm: record.mm ?? undefined });
    if (!size) return null;
  }
  if (pack === null && size === null) return null;
  return { pack, size };
}

/** undefined = present but not an integer (unreadable); null = absent. */
function asInt(value: unknown): number | null | undefined {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) ? n : undefined;
}

/** Same naming as the database writes into `product_variants.name` and its translation. */
export function comboName({ pack, size }: GemOptionKey): Localized {
  return {
    fr: [pack != null ? `Pack de ${pack}` : null, size ? formatSize(size, "fr") : null].filter(Boolean).join(" · "),
    en: [pack != null ? `Pack of ${pack}` : null, size ? formatSize(size, "en") : null].filter(Boolean).join(" · "),
  };
}

/**
 * Every combination of the chosen packs and sizes, packs first, both
 * ascending. An empty axis is simply not an axis: packs only gives
 * `{pack, size: null}` rows. Both empty gives no combination.
 */
export function combinations(packs: number[], sizes: GemSize[]): GemOptionKey[] {
  const p = [...new Set(packs)].sort((a, b) => a - b);
  const s = sortSizes(sizes);
  if (p.length === 0 && s.length === 0) return [];
  const packAxis: (number | null)[] = p.length > 0 ? p : [null];
  const sizeAxis: (GemSize | null)[] = s.length > 0 ? s : [null];
  return packAxis.flatMap((pack) => sizeAxis.map((size) => ({ pack, size })));
}

/** Suffix the database appends to the product SKU: "-P50-SS6", "-P10-2X4MM". */
export function comboSkuSuffix({ pack, size }: GemOptionKey): string {
  return `${pack != null ? `-P${pack}` : ""}${size ? `-${sizeSkuCode(size)}` : ""}`;
}

/** Longest suffix a product can get, for the SKU length check. */
export function longestSkuSuffix(combos: GemOptionKey[]): number {
  return combos.reduce((max, combo) => Math.max(max, comboSkuSuffix(combo).length), 0);
}

/* -------------------------------------------------------------------------- */
/* Storefront picker                                                           */
/* -------------------------------------------------------------------------- */

/** The part of a storefront variant the pack/size picker reads. */
export interface GemPickable {
  id: string;
  pack?: number;
  size?: GemSize;
  stock?: "low" | "out";
}

/** True when every variant is a pack/size option, so the two-axis picker applies. */
export function isGemOptionSet(variants: GemPickable[]): boolean {
  return variants.length > 0 && variants.every((v) => v.pack != null || v.size != null);
}

/** Packs and sizes on offer, ascending. An axis no variant uses is empty. */
export function gemAxes(variants: GemPickable[]): { packs: number[]; sizes: GemSize[] } {
  const packs = [...new Set(variants.map((v) => v.pack).filter((v): v is number => v != null))].sort((a, b) => a - b);
  return { packs, sizes: sortSizes(variants.map((v) => v.size).filter((v): v is GemSize => v != null)) };
}

/**
 * The variant to select when the customer picks a pack or a size. The other
 * axis is kept when that combination can be bought; otherwise the nearest
 * one that can (in stock first), so a click never lands on nothing.
 */
export function pickGemVariant<T extends GemPickable>(
  variants: T[],
  want: { pack?: number; size?: GemSize },
  current: T | undefined,
): T | undefined {
  const pack = want.pack ?? current?.pack;
  const size = want.size ?? current?.size;
  const exact = variants.find((v) => v.pack === pack && sameSize(v.size, size));
  if (exact && exact.stock !== "out") return exact;
  const fixed = want.pack != null ? (v: T) => v.pack === want.pack : (v: T) => sameSize(v.size, want.size);
  const candidates = variants.filter(fixed);
  // Nearest on the axis that moves, so SS6 → SS8 rather than SS3.
  const mm = (s: GemSize | undefined) => (s ? sizeLongestMm(s) : 0);
  const other = (v: T) => (want.pack != null ? Math.abs(mm(v.size) - mm(size)) : Math.abs((v.pack ?? 0) - (pack ?? 0)));
  const byDistance = [...candidates].sort((a, b) => other(a) - other(b));
  return byDistance.find((v) => v.stock !== "out") ?? exact ?? byDistance[0];
}

/** Whether a pack can be bought in at least one size. */
export function packAvailable(variants: GemPickable[], pack: number): boolean {
  return variants.some((v) => v.pack === pack && v.stock !== "out");
}

/** Whether a size can be bought with the chosen pack (or at all, without packs). */
export function sizeAvailable(variants: GemPickable[], size: GemSize, pack: number | undefined): boolean {
  return variants.some((v) => sameSize(v.size, size) && v.pack === pack && v.stock !== "out");
}

/** The sizes of a product card: the only one, or the smallest to the largest through `between`. */
export function sizeRangeLabel(sizes: GemSize[], lang: string, between: (range: { from: string; to: string }) => string): string | null {
  if (sizes.length === 0) return null;
  if (sizes.length === 1) return formatSize(sizes[0], lang);
  return between({ from: formatSize(sizes[0], lang), to: formatSize(sizes[sizes.length - 1], lang) });
}
