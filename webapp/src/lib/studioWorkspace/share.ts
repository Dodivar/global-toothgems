import { sanitizeScene, SCENE_VERSION, type StudioScene } from "./scene";
import { DESCRIPTION_MAX, NAME_MAX } from "./validation";

/**
 * Read-only share links for Studio designs.
 *
 * While the workspace keeps creations in the author's browser (see
 * `workspace.tsx`, `createRepositories`), there is no server copy a token
 * could point at: another customer's browser would find nothing. So the link
 * carries the design itself — a SNAPSHOT of the scene, its name and its
 * description — in the URL fragment (`/studio-3d/partage#z1.…`). The fragment
 * is never sent to a server, so the design does not land in any request log.
 *
 * Consequences, stated in the share dialog: later edits do not reach a link
 * already sent, and a link cannot be revoked. When creations move to Supabase,
 * a `creation_shares` table (random token, owner, revoked_at) read through a
 * security-definer function can replace this module behind the same two
 * functions, without the viewer changing.
 *
 * Only what the viewer needs travels: never the owner's id, the client name
 * typed in the editor, tags or the thumbnail. What comes back is untrusted
 * input — capped before and after decompression, parsed defensively, and
 * always passed through `sanitizeScene`.
 */

export const SHARE_VERSION = 1;

export interface SharedDesign {
  name: string;
  description: string;
  scene: StudioScene;
}

/** Fragments longer than this are refused before any decoding. */
export const SHARE_TOKEN_MAX_CHARS = 400_000;
/** Decoded JSON above this is refused: a full scene row is at most 256 kB. */
export const SHARE_JSON_MAX_BYTES = 320_000;

/** `z1.` deflate-compressed JSON (usual), `j1.` plain JSON (browsers without CompressionStream). */
const COMPRESSED = "z1.";
const PLAIN = "j1.";

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Four decimals of a millimetre are far below what the eye or the engine can
 * tell apart. The Gem Group a piece came from is the sender's own library id:
 * meaningless to the recipient, so it stays home.
 */
function compactScene(scene: StudioScene): StudioScene {
  return {
    ...scene,
    groups: scene.groups.map((g) => ({ ...g, gemGroupId: null })),
    camera: scene.camera
      ? {
          position: scene.camera.position.map(round) as [number, number, number],
          target: scene.camera.target.map(round) as [number, number, number],
        }
      : null,
    pieces: scene.pieces.map((p) => ({
      ...p,
      position: { x: round(p.position.x), y: round(p.position.y), z: round(p.position.z) },
      normal: { x: round(p.normal.x), y: round(p.normal.y), z: round(p.normal.z) },
      rotation: round(p.rotation),
      scale: round(p.scale),
      ...(p.offset !== undefined ? { offset: round(p.offset) } : {}),
    })),
  };
}

/* ---------------------------------------------------------- base64url */

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------- compression */

const canCompress = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inflate, stopping as soon as the output passes `limit`: a tiny link must not expand into megabytes. */
async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null; // not deflate data
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/* ---------------------------------------------------------- public API */

/** The fragment token for a design (without the `#`). */
export async function encodeSharedDesign(design: SharedDesign): Promise<string> {
  const payload = {
    v: SHARE_VERSION,
    name: design.name.trim().slice(0, NAME_MAX),
    description: design.description.trim().slice(0, DESCRIPTION_MAX),
    scene: compactScene(sanitizeScene(design.scene)),
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress()) {
    try {
      return COMPRESSED + toBase64Url(await deflate(json));
    } catch {
      /* fall through to the plain form */
    }
  }
  return PLAIN + toBase64Url(json);
}

/** The full link to send: `https://…/studio-3d/partage#z1.…`. */
export async function createShareUrl(design: SharedDesign, sharePath: string, origin = window.location.origin): Promise<string> {
  return `${origin}${sharePath}#${await encodeSharedDesign(design)}`;
}

/**
 * The design a link carries, or null when the link is empty, cut short,
 * tampered with or from a format this version does not know.
 */
export async function decodeSharedDesign(fragment: string): Promise<SharedDesign | null> {
  const token = fragment.replace(/^#/, "").trim();
  if (!token || token.length > SHARE_TOKEN_MAX_CHARS) return null;
  const compressed = token.startsWith(COMPRESSED);
  if (!compressed && !token.startsWith(PLAIN)) return null;
  const raw = fromBase64Url(token.slice(3));
  if (!raw) return null;
  let json: Uint8Array | null = raw;
  if (compressed) {
    if (!canCompress()) return null;
    json = await inflate(raw, SHARE_JSON_MAX_BYTES);
  } else if (raw.byteLength > SHARE_JSON_MAX_BYTES) {
    json = null;
  }
  if (!json) return null;

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.v !== SHARE_VERSION || !d.scene || typeof d.scene !== "object") return null;
  if ((d.scene as Record<string, unknown>).version !== SCENE_VERSION) return null;
  const scene = sanitizeScene(d.scene);
  const name = typeof d.name === "string" ? d.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
  const description = typeof d.description === "string" ? d.description.trim().slice(0, DESCRIPTION_MAX) : "";
  return { name, description, scene };
}
