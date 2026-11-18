/**
 * A small software renderer for the skill's previews: the smile's crowns and
 * the gems' real 3D templates (`getJewelTemplate`), posed exactly as the
 * engine poses them, drawn with a z-buffer into PNG files — no browser, no
 * extra dependency. Not the Studio's materials: flat colours, one light and a
 * highlight, enough to judge placement, spacing and the motif from any angle.
 */
import * as THREE from "three";
import { deflateSync } from "node:zlib";
import type { CrownMesh } from "../../../../webapp/src/lib/studio3d/crownShape.ts";
import { getJewelTemplate } from "../../../../webapp/src/lib/studio3d/geometry.ts";
import { scaleAxes } from "../../../../webapp/src/lib/studio3d/pieceScale.ts";

export interface RenderPiece {
  piece: {
    look: { shape: string; material: string; color: string; effect: string };
    size: unknown;
    position: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    rotation: number;
    scale: number;
  };
  flagged: boolean;
  index: number;
}

const W = 900, H = 560, SS = 2; // view size, supersampling
const BG: RGB = [251, 236, 238];
const ENAMEL: RGB = [246, 241, 231];
type RGB = [number, number, number];

interface Tri {
  p: THREE.Vector3[];
  n: THREE.Vector3[];
  color: RGB;
  gem: boolean;
  metal: boolean;
}

const hex = (c: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  const v = m ? parseInt(m[1], 16) : 0xcccccc;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

function crownTris(crowns: { mesh: CrownMesh }[]): Tri[] {
  const out: Tri[] = [];
  for (const { mesh } of crowns) {
    const P = mesh.positions, N = mesh.normals, I = mesh.indices;
    const at = (i: number, a: Float32Array) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
    for (let k = 0; k < I.length; k += 3) {
      const ids = [I[k], I[k + 1], I[k + 2]];
      out.push({ p: ids.map((i) => at(i, P)), n: ids.map((i) => at(i, N)), color: ENAMEL, gem: false, metal: false });
    }
  }
  return out;
}

const mountGap = (scale: number) => 0.04 + 0.04 * scale;
const _Z = new THREE.Vector3(0, 0, 1);

function gemTris(rp: RenderPiece): Tri[] {
  const j = rp.piece;
  const tpl = getJewelTemplate(j.look.shape as never);
  const n = new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z).normalize();
  const center = new THREE.Vector3(j.position.x, j.position.y, j.position.z).addScaledVector(n, tpl.halfDepth * j.scale + mountGap(j.scale));
  const q = new THREE.Quaternion().setFromUnitVectors(_Z, n).multiply(new THREE.Quaternion().setFromAxisAngle(_Z, THREE.MathUtils.degToRad(j.rotation)));
  const axes = scaleAxes(j.look.shape as never, j.size as never);
  const m = new THREE.Matrix4().compose(center, q, new THREE.Vector3(axes.x, axes.y, axes.z));
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  let color = hex(j.look.color);
  if (j.look.effect === "iridescent") color = [Math.min(255, color[0] - 10), Math.min(255, color[1]), 255];
  if (rp.flagged) color = [Math.round(color[0] * 0.35 + 228 * 0.65), Math.round(color[1] * 0.35 + 30 * 0.65), Math.round(color[2] * 0.35 + 50 * 0.65)];
  const out: Tri[] = [];
  for (const g of tpl.parts) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    const vtx = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
    const nrm = (i: number) => (nor ? new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm).normalize() : n.clone());
    for (let k = 0; k + 2 < count; k += 3) {
      const ids = [0, 1, 2].map((o) => (idx ? idx.getX(k + o) : k + o));
      out.push({ p: ids.map(vtx), n: ids.map(nrm), color, gem: true, metal: j.look.material === "metal" });
    }
  }
  return out;
}

interface View {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

function draw(tris: Tri[], view: View): Uint8Array {
  const w = W * SS, h = H * SS;
  const cam = new THREE.PerspectiveCamera(view.fov, W / H, 1, 500);
  cam.position.copy(view.eye);
  cam.up.set(0, 1, 0);
  cam.lookAt(view.target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const viewDir = view.target.clone().sub(view.eye).normalize();
  const light = new THREE.Vector3(-0.35, 0.55, 0.75).normalize();
  const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  // Light follows the camera a little, so turned views stay lit.
  light.addScaledVector(camRight, -0.2).add(viewDir.clone().negate().multiplyScalar(0.6)).normalize();
  const half = light.clone().sub(viewDir).normalize();

  const color = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) color.set(BG, i * 3);
  const depth = new Float32Array(w * h).fill(Infinity);
  const shade = (t: Tri, n: THREE.Vector3): RGB => {
    let nn = n;
    if (nn.dot(viewDir) > 0) nn = nn.clone().negate();
    const d = Math.max(0, nn.dot(light));
    const s = Math.pow(Math.max(0, nn.dot(half)), t.gem ? 40 : 60) * (t.gem ? (t.metal ? 0.9 : 0.75) : 0.25);
    const amb = t.gem ? 0.45 : 0.55;
    return t.color.map((c) => Math.min(255, c * (amb + (1 - amb) * d) + 255 * s)) as RGB;
  };
  const tmp = new THREE.Vector4();
  for (const t of tris) {
    const sp = t.p.map((p) => {
      tmp.set(p.x, p.y, p.z, 1).applyMatrix4(vp);
      return { x: ((tmp.x / tmp.w) * 0.5 + 0.5) * w, y: (1 - ((tmp.y / tmp.w) * 0.5 + 0.5)) * h, z: tmp.w };
    });
    if (sp.some((s) => s.z <= 0)) continue;
    const cs = t.n.map((n) => shade(t, n));
    const minX = Math.max(0, Math.floor(Math.min(sp[0].x, sp[1].x, sp[2].x)));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(sp[0].x, sp[1].x, sp[2].x)));
    const minY = Math.max(0, Math.floor(Math.min(sp[0].y, sp[1].y, sp[2].y)));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(sp[0].y, sp[1].y, sp[2].y)));
    const area = (sp[1].x - sp[0].x) * (sp[2].y - sp[0].y) - (sp[2].x - sp[0].x) * (sp[1].y - sp[0].y);
    if (Math.abs(area) < 1e-9) continue;
    // Gems sit a hair in front of the enamel they touch.
    const bias = t.gem ? -0.02 : 0;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((sp[1].x - px) * (sp[2].y - py) - (sp[2].x - px) * (sp[1].y - py)) / area;
        const w1 = ((sp[2].x - px) * (sp[0].y - py) - (sp[0].x - px) * (sp[2].y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * sp[0].z + w1 * sp[1].z + w2 * sp[2].z + bias;
        const k = y * w + x;
        if (z >= depth[k]) continue;
        depth[k] = z;
        color[k * 3] = w0 * cs[0][0] + w1 * cs[1][0] + w2 * cs[2][0];
        color[k * 3 + 1] = w0 * cs[0][1] + w1 * cs[1][1] + w2 * cs[2][1];
        color[k * 3 + 2] = w0 * cs[0][2] + w1 * cs[1][2] + w2 * cs[2][2];
      }
  }
  // Outline the silhouettes (depth jumps), then downsample.
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, edge = false;
      for (let dy = 0; dy < SS; dy++)
        for (let dx = 0; dx < SS; dx++) {
          const sx = x * SS + dx, sy = y * SS + dy, k = sy * w + sx;
          r += color[k * 3];
          g += color[k * 3 + 1];
          b += color[k * 3 + 2];
          const zr = sx + 1 < w ? depth[k + 1] : depth[k], zd = sy + 1 < h ? depth[k + w] : depth[k];
          const z = depth[k];
          if (Math.abs(z - zr) > 0.8 || Math.abs(z - zd) > 0.8) edge = true;
        }
      const n = SS * SS, o = (y * W + x) * 3;
      const f = edge ? 0.72 : 1;
      out[o] = (r / n) * f;
      out[o + 1] = (g / n) * f;
      out[o + 2] = (b / n) * f;
    }
  return out;
}

function compose(views: Uint8Array[], cols: number): { data: Uint8Array; width: number; height: number } {
  const gap = 6;
  const rows = Math.ceil(views.length / cols);
  const width = cols * W + (cols - 1) * gap, height = rows * H + (rows - 1) * gap;
  const data = new Uint8Array(width * height * 3).fill(255);
  views.forEach((v, i) => {
    const ox = (i % cols) * (W + gap), oy = Math.floor(i / cols) * (H + gap);
    for (let y = 0; y < H; y++) data.set(v.subarray(y * W * 3, (y + 1) * W * 3), ((oy + y) * width + ox) * 3);
  });
  return { data, width, height };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function png({ data, width, height }: { data: Uint8Array; width: number; height: number }): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(data.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** A camera turned `yaw` degrees to the viewer's right and `pitch` up, around `target`, `dist` away. */
function orbit(target: THREE.Vector3, dist: number, yaw: number, pitch: number, fov: number): View {
  const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
  const eye = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist).add(target);
  return { eye, target, fov };
}

/**
 * preview.png: front, close-up on the gems, three-quarter left and right.
 * preview-photo.png (when the spec gives the photo's angle): the same design
 * seen as the photo saw it, larger, to compare side by side.
 */
export function renderViews(crowns: { mesh: CrownMesh }[], pieces: RenderPiece[], photoView?: { yaw?: number; pitch?: number }): Record<string, Buffer> {
  const tris = [...crownTris(crowns), ...pieces.flatMap(gemTris)];
  // The arches' middle: the incisors are at z ≈ 0, the molars ~26 mm behind.
  const whole = new THREE.Vector3(0, 0.3, -9);
  const box = new THREE.Box3();
  for (const p of pieces) box.expandByPoint(new THREE.Vector3(p.piece.position.x, p.piece.position.y, p.piece.position.z));
  const focus = pieces.length ? box.getCenter(new THREE.Vector3()) : whole.clone();
  const size = pieces.length ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(20, 10, 1);
  const span = Math.max(size.x * 1.25, size.y * 1.9, 9);
  // Close-up: face the decorated area (its mean outward direction), framed on it.
  const avgN = pieces.reduce((a, p) => a.add(new THREE.Vector3(p.piece.normal.x, 0, p.piece.normal.z)), new THREE.Vector3());
  const yawFocus = pieces.length ? THREE.MathUtils.radToDeg(Math.atan2(avgN.x, avgN.z)) : 0;
  const fov = 28;
  const closeDist = span / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2)) + 6;
  const views = [
    orbit(whole, 95, 0, 4, fov),
    orbit(focus, closeDist, yawFocus, 3, fov),
    orbit(whole, 95, -38, 4, fov),
    orbit(whole, 95, 38, 4, fov),
  ].map((v) => draw(tris, v));
  const out: Record<string, Buffer> = { "preview.png": png(compose(views, 2)) };
  if (photoView) {
    const v = orbit(focus, Math.max(closeDist * 1.25, 45), photoView.yaw ?? 0, photoView.pitch ?? 0, fov);
    out["preview-photo.png"] = png(compose([draw(tris, v)], 1));
  }
  return out;
}
