/**
 * The gems of a creation as the database stores them (decision 111), and the
 * design data that the v3 system instructions (`systemPrompt.ts`) read after
 * the images: tooth by tooth, one line per gem — cut, material, colour,
 * coating, size, and its place and size on the tooth when the browser sent
 * them (`readSeats`).
 *
 * Everything in it comes from the stored scene, reduced to known values
 * (FDI tooth numbers, the Studio's cuts and materials, `#rrggbb`, numbers):
 * no free text of the artist (name, description) ever reaches the model.
 * The function renders nothing for a creation without a single valid gem.
 */

export interface PromptPiece {
  /** The piece's id in the scene ("" when it has none): matches its seat. */
  id: string;
  /** FDI number ("11"…"48"), or "X0" for an unlabelled region. */
  toothId: string;
  shape: string;
  material: "crystal" | "metal";
  color: string;
  iridescent: boolean;
  /** "SS5", "2 × 4 mm"… */
  size: string;
  /** Longest side in millimetres, rounded to a tenth (0 when unknown). */
  longestMm: number;
}

const MAX_PIECES = 200;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The Studio's cuts (`StudioShape`), described by the geometry the 3D model
 * gives them (`webapp/src/lib/studio3d/geometry.ts`), so the words never
 * contradict IMAGE 1: a bare "star flower" was drawn as a flower or a sunburst.
 */
const SHAPES: Record<string, string> = {
  round: "round",
  baguette: "baguette (long narrow rectangle, step cut)",
  square: "square",
  heart: "heart",
  "open-heart": "open heart: a gold wire outline of a heart, empty inside",
  kite: "kite (flat lozenge, taller than wide)",
  navette: "navette (marquise: long, pointed at both ends)",
  raindrop: "raindrop (pear: round at one end, pointed at the other)",
  triangle: "triangle",
  "rivoli-star": "five-pointed star with sharp tips, faceted like a low pyramid",
  starflower: "five-pointed star with plump arms and a flat pentagon top (a star, never a flower or a sunburst)",
  "halo-star": "open five-pointed star: a wire outline, empty inside",
  bolt: "lightning bolt charm",
  cherries: "cherries charm (two cherries on stems)",
  snake: "snake charm",
  dachshund: "dachshund charm (sausage dog in profile)",
};

function sizeOf(raw: Record<string, unknown>): { size: string; longestMm: number } | null {
  const size = raw.size as Record<string, unknown> | undefined;
  const half = isNum(raw.scale) && raw.scale > 0 && raw.scale < 50 ? raw.scale : null;
  const longest = half ? Math.round(half * 2 * 10) / 10 : null;
  if (size && isNum(size.ss)) return { size: `SS${Math.round(size.ss)}`, longestMm: longest ?? 0 };
  if (size && Array.isArray(size.mm) && size.mm.length > 0 && size.mm.every(isNum)) {
    const mm = (size.mm as number[]).slice(0, 2).map((v) => Math.round(v * 10) / 10);
    return { size: `${mm.join(" × ")} mm`, longestMm: longest ?? Math.max(...mm) };
  }
  if (isNum(raw.ss)) return { size: `SS${Math.round(raw.ss)}`, longestMm: longest ?? 0 };
  return longest ? { size: `${longest} mm`, longestMm: longest } : null;
}

/** The gems of a stored scene, reduced to known values; malformed pieces are dropped. */
export function piecesFromScene(scene: unknown): PromptPiece[] {
  const pieces = scene && typeof scene === "object" ? (scene as Record<string, unknown>).pieces : null;
  if (!Array.isArray(pieces)) return [];
  const out: PromptPiece[] = [];
  for (const raw of pieces.slice(0, MAX_PIECES)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const look = (p.look && typeof p.look === "object" ? p.look : {}) as Record<string, unknown>;
    const size = sizeOf(p);
    const color = typeof look.color === "string" && /^#[0-9a-f]{6}$/i.test(look.color) ? look.color.toLowerCase() : null;
    if (typeof p.toothId !== "string" || !size || !color) continue;
    out.push({
      id: typeof p.id === "string" && p.id.length <= 40 ? p.id : "",
      toothId: /^(X0|[1-4][1-8])$/.test(p.toothId) ? p.toothId : "X0",
      shape: typeof look.shape === "string" && look.shape in SHAPES ? look.shape : "round",
      material: look.material === "metal" ? "metal" : "crystal",
      color,
      iridescent: look.effect === "iridescent",
      ...size,
    });
  }
  return out;
}

const QUADRANT: Record<string, string> = { "1": "upper right", "2": "upper left", "3": "lower left", "4": "lower right" };
const TOOTH: Record<string, string> = {
  "1": "central incisor",
  "2": "lateral incisor",
  "3": "canine",
  "4": "first premolar",
  "5": "second premolar",
  "6": "first molar",
  "7": "second molar",
  "8": "third molar",
};

/** "21 (upper left central incisor)" — the person's own left and right, as dentists count. */
export function toothLabel(toothId: string): string {
  const m = /^([1-4])([1-8])$/.exec(toothId);
  return m ? `${toothId} (${QUADRANT[m[1]]} ${TOOTH[m[2]]})` : "unlabelled front surface (see IMAGE 1)";
}

/**
 * Where a gem sits on its tooth and how big it is against it, measured by the
 * browser on the Studio's front view (`webapp/src/lib/studio3d/tryOnSeats.ts`)
 * and sent with the request. Untrusted, so reduced to clamped numbers and
 * matched to the stored gems by id: at worst it moves a gem on the
 * requester's own render.
 */
export interface Seat {
  /** Centre height on the crown: 0 at the gum line, 1 at the biting edge. */
  gum: number;
  /** Across the crown, share of its width: > 0 toward the midline, < 0 toward the side. */
  mid: number;
  /** Longest side, share of the crown's width. */
  width: number;
  /** False: tongue side, not seen from the front. */
  front: boolean;
  /** Its name on the flat design map ("11a"), when the browser drew one; used only when it names the gem's own tooth. */
  tag?: string;
}

const SEATS_MAX_CHARS = 32 * 1024;
const clampTo = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The seats the browser sent (form field `seats`), by piece id; malformed entries are dropped. */
export function readSeats(raw: unknown): Map<string, Seat> {
  const out = new Map<string, Seat>();
  if (typeof raw !== "string" || raw.length > SEATS_MAX_CHARS) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!Array.isArray(data)) return out;
  for (const entry of data.slice(0, MAX_PIECES)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id || e.id.length > 40 || !isNum(e.gum) || !isNum(e.mid) || !isNum(e.width) || typeof e.front !== "boolean") continue;
    const tag = typeof e.tag === "string" && /^[1-4][1-8][a-z]$/.test(e.tag) ? e.tag : undefined;
    out.set(e.id, { gum: clampTo(e.gum, 0, 1), mid: clampTo(e.mid, -0.5, 0.5), width: clampTo(e.width, 0.02, 2), front: e.front, ...(tag ? { tag } : {}) });
  }
  return out;
}

/** Upper then lower arch, each in the photo's left-to-right order (the person's right first). */
const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
/** The front teeth, always listed — bare ones too, so a gem never slides onto them. */
const ALWAYS = new Set(["13", "12", "11", "21", "22", "23", "43", "42", "41", "31", "32", "33"]);

const pct = (n: number) => `${Math.round(n * 100)}%`;

function placeOf(seat: Seat): string {
  const third = seat.gum < 1 / 3 ? "gum-side third" : seat.gum < 2 / 3 ? "middle third" : "biting-edge third";
  const height = `centre at about ${pct(seat.gum)} of the crown height from the gum line (${third})`;
  const side = Math.abs(seat.mid) < 0.08
    ? "centred across the tooth"
    : `${pct(Math.abs(seat.mid))} of the tooth's width off-centre toward ${seat.mid > 0 ? "the midline" : "the outer side"}`;
  return `${height}, ${side}`;
}

/** A share of the photo's width, with a decimal below 10 %. */
const photoPct = (n: number) => `${n < 0.1 ? Math.round(n * 1000) / 10 : Math.round(n * 100)}%`;

function gemLine(label: string, p: PromptPiece, seat: Seat | undefined, mmShare: number | null): string {
  const mm = p.longestMm > 0 && p.size !== `${p.longestMm} mm` ? ` (about ${p.longestMm} mm on its longest side)` : "";
  const coating = p.iridescent ? " — iridescent coating" : "";
  const inPhoto = mmShare && p.longestMm > 0 ? ` — IN THIS PHOTO: about ${photoPct(p.longestMm * mmShare)} of the photo's width on its longest side` : "";
  const share = seat ? ` — longest side about ${pct(seat.width)} of this tooth's width` : "";
  const place = seat ? ` — ${placeOf(seat)}` : "";
  return `  ${label}. ${SHAPES[p.shape]} — ${p.material} — colour ${p.color}${coating} — size ${p.size}${mm}${inPhoto}${share}${place}`;
}

/**
 * The design data block sent after the images with the v3 system
 * instructions: the exact count, then tooth by tooth in the photo's order —
 * bare front teeth named as such — each gem with its cut, material, colour,
 * size and, when the browser measured it, its share of the tooth's width and
 * its place on the crown. Gems on the tongue side are left out.
 */
export function buildDesignData(
  pieces: readonly PromptPiece[],
  seats: ReadonlyMap<string, Seat> = new Map(),
  /** One millimetre as a share of the photo's width (`photoCheck.ts` `photoScale`), when measured. */
  mmShare: number | null = null,
  /** Whether the flat design map was sent (IMAGE 3): the gems are then named by their tags on it. */
  withMap = false,
  /** Whether IMAGE 2 is a close-up of the mouth cut from the customer's photo (`crop.ts`). */
  closeUp = false,
): string {
  const seatOf = (p: PromptPiece) => (p.id ? seats.get(p.id) : undefined);
  const shown = pieces.filter((p) => seatOf(p)?.front !== false);
  const onTooth = (fdi: string) =>
    shown.filter((p) => p.toothId === fdi).sort((a, b) => (seatOf(a)?.gum ?? 0.5) - (seatOf(b)?.gum ?? 0.5));
  const lines: string[] = [];
  let n = 0;
  // A gem's name: its tag on the map ("11a") when the map was sent and the tag names its own tooth, else its number.
  const labelOf = (p: PromptPiece) => {
    n++;
    const tag = seatOf(p)?.tag;
    return withMap && tag && tag.startsWith(p.toothId) ? tag : String(n);
  };
  const arch = (title: string, teeth: string[]) => {
    const listed = teeth.filter((fdi) => ALWAYS.has(fdi) || onTooth(fdi).length > 0);
    if (!listed.some((fdi) => onTooth(fdi).length > 0)) return;
    lines.push("", title);
    for (const fdi of listed) {
      const gems = onTooth(fdi);
      if (!gems.length) {
        lines.push(`Tooth ${toothLabel(fdi)}: no gem — it stays bare.`);
        continue;
      }
      lines.push(`Tooth ${toothLabel(fdi)}: ${gems.length} gem${gems.length > 1 ? "s" : ""}`);
      for (const p of gems) lines.push(gemLine(labelOf(p), p, seatOf(p), mmShare));
    }
  };
  arch("UPPER ARCH — teeth in the photo's left-to-right order:", UPPER);
  arch("LOWER ARCH — teeth in the photo's left-to-right order:", LOWER);
  const other = shown.filter((p) => p.toothId === "X0");
  if (other.length) {
    lines.push("", `Gems on an ${toothLabel("X0")}:`);
    for (const p of other) lines.push(gemLine(labelOf(p), p, seatOf(p), mmShare));
  }
  const count = `${n} gem${n > 1 ? "s" : ""}`;
  const scale = mmShare
    ? [
        "",
        `SCALE MEASURED ON THIS PHOTO: the two upper central incisors together span about ${photoPct(mmShare * 17)} of the photo's width (about 17 mm in real life), so 1 mm is about ${photoPct(mmShare)} of the photo's width. Each gem gives its length IN THIS PHOTO: draw it at that length, never larger.`,
      ]
    : [];
  const map = withMap
    ? [
        "",
        "IMAGE 3 (the flat design map) is included. Each gem below is named by its tag — its tooth number and a letter, e.g. 11a — exactly as written on IMAGE 3, where a line joins the tag to the gem on its labelled tooth.",
      ]
    : ["", "No flat design map (IMAGE 3) with this request."];
  const photo = closeUp
    ? [
        "",
        "IMAGE 2 is a CLOSE-UP of the customer's mouth, cut from their photo: it will be pasted back into that photo at exactly the same place and size. Keep its framing, its edges and everything around the teeth exactly as they are — only the gems are added.",
      ]
    : [];
  return [`DESIGN DATA — exactly ${count}, no more.`, ...photo, ...map, ...scale, ...lines].join("\n");
}
