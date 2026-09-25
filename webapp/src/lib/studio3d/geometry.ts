import * as THREE from "three";
import { FINISHES, isFinishId, type JewelryGeometry, type PlacedJewelry, type ToothSpec } from "../../data/studioEditor";
import { ss01 } from "./math";

/**
 * Procedural geometry and materials of the 3D Studio: the teeth of the
 * reference arch, the piece shapes of the library, and their finishes.
 *
 * Templates and materials are cached per shape and per finish, because a
 * design reuses the same few dozen of them. `disposeGeometryCaches` releases
 * them when the editor unmounts, so a later visit starts from fresh GPU
 * resources instead of reusing ones a disposed renderer already freed.
 */

/* ---- material resolution: preset finish OR custom wheel colour ---- */
interface MaterialSpec {
  kind: "crystal" | "metal";
  hex: string;
  dispersion: number;
}
export function resolveFinishRaw(color: string, customColor?: string): MaterialSpec {
  if (customColor) return { kind: "crystal", hex: customColor, dispersion: 0.18 };
  const f = isFinishId(color) ? FINISHES[color] : FINISHES.clear;
  return { kind: f.kind, hex: f.color, dispersion: f.dispersion };
}
function resolveFinish(j: PlacedJewelry): MaterialSpec {
  return resolveFinishRaw(j.color, j.customColor);
}
export function matKeyFor(j: PlacedJewelry): string {
  const s = resolveFinish(j);
  return `${s.kind}|${s.hex}|${s.dispersion}`;
}

const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function getJewelMaterial(j: PlacedJewelry): THREE.MeshPhysicalMaterial {
  const s = resolveFinish(j);
  const key = `${s.kind}|${s.hex}|${s.dispersion}`;
  let m = materialCache.get(key);
  if (m) return m;
  m =
    s.kind === "metal"
      ? new THREE.MeshPhysicalMaterial({
          color: s.hex,
          metalness: 1,
          roughness: s.hex.toLowerCase() === "#e9edf4" ? 0.24 : 0.16,
          envMapIntensity: 1.7,
        })
      : new THREE.MeshPhysicalMaterial({
          color: s.hex,
          metalness: 0,
          roughness: 0.05,
          transmission: 0.92,
          thickness: 1.6,
          ior: 2.1,
          dispersion: s.dispersion,
          attenuationColor: new THREE.Color(s.hex),
          attenuationDistance: 2.4,
          envMapIntensity: 2.4,
          specularIntensity: 1.1,
          clearcoat: 0.8,
          clearcoatRoughness: 0.06,
        });
  materialCache.set(key, m);
  return m;
}

export function createToothGeometry(spec: ToothSpec): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  const cCerv = new THREE.Color(0xe6d7bb),
    cWhite = new THREE.Color(0xffffff);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const ny = v.y,
      up = Math.max(0, ny),
      down = Math.max(0, -ny);
    let wE = spec.wHalf * (1 - spec.cervical * up);
    let dE = spec.dHalf;
    if (spec.incisal) dE *= 1 - spec.incisal * Math.pow(down, 1.4);
    if (spec.tip) {
      const f = down * down;
      wE *= 1 - spec.tip * f;
      dE *= 1 - spec.tip * 0.55 * f;
    }
    const dLab = dE * (1 + (spec.labial ?? 0) * Math.max(0, v.z));
    const dz = v.z >= 0 ? dLab : dE * 0.85;
    let x = 0,
      z = 0;
    const ax = Math.abs(v.x) / wE,
      az = Math.abs(v.z) / dz;
    const denom = Math.pow(Math.pow(ax, spec.p) + Math.pow(az, spec.p), 1 / spec.p);
    if (denom > 1e-6) {
      const t = 1 / denom;
      x = v.x * t;
      z = v.z * t;
    }
    pos.setXYZ(i, x, ny * spec.hHalf, z);
    const k = ss01(((ny + 1) / 2) * 0.9 + 0.05); // warmer toward the cervix (top)
    colors.push(cCerv.r + (cWhite.r - cCerv.r) * k, cCerv.g + (cWhite.g - cCerv.g) * k, cCerv.b + (cWhite.b - cCerv.b) * k);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface JewelTemplate {
  parts: THREE.BufferGeometry[];
  halfDepth: number;
  radius: number;
}
const templateCache = new Map<JewelryGeometry, JewelTemplate>();

function extrudeJewel(shape: THREE.Shape, depth = 0.3): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.07,
    bevelSegments: 2,
    curveSegments: 32,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}
function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.85);
  s.bezierCurveTo(-0.95, -0.35, -1.2, 0.35, -0.55, 0.72);
  s.bezierCurveTo(-0.25, 0.9, -0.1, 0.72, 0, 0.45);
  s.bezierCurveTo(0.1, 0.72, 0.25, 0.9, 0.55, 0.72);
  s.bezierCurveTo(1.2, 0.35, 0.95, -0.35, 0, -0.85);
  return s;
}
function butterflyShape(): THREE.Shape {
  const segs: number[][][] = [
    [
      [0, 0.14],
      [-0.42, 0.86],
      [-1.04, 0.78],
      [-0.9, 0.32],
    ],
    [
      [-0.9, 0.32],
      [-1.18, 0.16],
      [-1.08, -0.14],
      [-0.68, -0.13],
    ],
    [
      [-0.68, -0.13],
      [-0.42, -0.1],
      [-0.22, -0.02],
      [-0.05, 0.02],
    ],
    [
      [-0.05, 0.02],
      [-0.52, -0.06],
      [-0.82, -0.3],
      [-0.66, -0.6],
    ],
    [
      [-0.66, -0.6],
      [-0.55, -0.88],
      [-0.22, -0.74],
      [-0.04, -0.4],
    ],
  ];
  const s = new THREE.Shape();
  s.moveTo(0, 0.14);
  for (const seg of segs) s.bezierCurveTo(seg[1][0], seg[1][1], seg[2][0], seg[2][1], seg[3][0], seg[3][1]);
  s.lineTo(0.04, -0.4);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    s.bezierCurveTo(-seg[2][0], seg[2][1], -seg[1][0], seg[1][1], -seg[0][0], seg[0][1]);
  }
  s.closePath();
  return s;
}
export function getJewelTemplate(geometryId: JewelryGeometry): JewelTemplate {
  const hit = templateCache.get(geometryId);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  const faceted = (g: THREE.BufferGeometry) => {
    g.computeVertexNormals();
    return g;
  };
  switch (geometryId) {
    case "round":
      parts.push(faceted(new THREE.IcosahedronGeometry(0.8, 1).scale(1, 1, 0.62)));
      break;
    case "diamond":
      parts.push(faceted(new THREE.OctahedronGeometry(0.92, 0).scale(0.8, 1.08, 0.55)));
      break;
    case "square": {
      const g = new THREE.CylinderGeometry(0.66, 0.66, 0.5, 4, 1);
      g.rotateY(Math.PI / 4);
      g.rotateX(Math.PI / 2);
      parts.push(faceted(g.toNonIndexed()));
      break;
    }
    case "dot": {
      const g = new THREE.SphereGeometry(0.52, 24, 18);
      g.scale(1, 1, 0.62);
      g.translate(0, 0, 0.3);
      parts.push(g);
      break;
    }
    case "star":
      parts.push(extrudeJewel(starShape(0.95, 0.4), 0.28));
      break;
    case "heart":
      parts.push(extrudeJewel(heartShape(), 0.3));
      break;
    case "triangle": {
      const pts = [new THREE.Vector2(0, 0.95), new THREE.Vector2(-0.84, -0.62), new THREE.Vector2(0.84, -0.62)];
      parts.push(extrudeJewel(new THREE.Shape(pts), 0.26));
      break;
    }
    case "drop": {
      const s = new THREE.Shape();
      s.moveTo(0, 1.02);
      s.bezierCurveTo(0.05, 0.55, 0.64, 0.2, 0.64, -0.32);
      s.bezierCurveTo(0.64, -0.92, -0.64, -0.92, -0.64, -0.32);
      s.bezierCurveTo(-0.64, 0.2, -0.05, 0.55, 0, 1.02);
      parts.push(extrudeJewel(s, 0.3));
      break;
    }
    case "navette": {
      const s = new THREE.Shape();
      s.moveTo(0, 1.05);
      s.bezierCurveTo(0.62, 0.5, 0.62, -0.5, 0, -1.05);
      s.bezierCurveTo(-0.62, -0.5, -0.62, 0.5, 0, 1.05);
      parts.push(extrudeJewel(s, 0.28));
      break;
    }
    case "baguette": {
      const pts = [
        [0.3, 0.98],
        [-0.3, 0.98],
        [-0.52, 0.76],
        [-0.52, -0.76],
        [-0.3, -0.98],
        [0.3, -0.98],
        [0.52, -0.76],
        [0.52, 0.76],
      ].map((p) => new THREE.Vector2(p[0], p[1]));
      parts.push(extrudeJewel(new THREE.Shape(pts), 0.26));
      break;
    }
    case "butterfly": {
      parts.push(extrudeJewel(butterflyShape(), 0.24));
      const body = new THREE.SphereGeometry(1, 16, 12);
      body.scale(0.16, 0.62, 0.34);
      body.translate(0, 0.02, 0.16);
      parts.push(body);
      break;
    }
    case "moon": {
      const s = new THREE.Shape();
      s.absarc(0, 0, 0.85, Math.PI * 0.28, Math.PI * 1.72, false);
      s.absarc(0.32, 0, 0.69, 1.243, -1.243, true);
      parts.push(extrudeJewel(s, 0.26));
      break;
    }
    case "bolt": {
      const pts = [
        [0.5, 1],
        [-0.5, -0.1],
        [-0.05, -0.1],
        [-0.5, -1],
        [0.5, 0.1],
        [0.05, 0.1],
      ].map((p) => new THREE.Vector2(p[0], p[1]));
      parts.push(extrudeJewel(new THREE.Shape(pts), 0.24));
      break;
    }
    case "blossom": {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        const r = 0.36 + 0.52 * Math.abs(Math.cos(t * 2.5));
        pts.push(new THREE.Vector2(Math.cos(t) * r, Math.sin(t) * r));
      }
      parts.push(extrudeJewel(new THREE.Shape(pts), 0.24));
      break;
    }
  }
  const box = new THREE.Box3();
  for (const p of parts) {
    p.computeBoundingBox();
    box.union(p.boundingBox!);
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  const tpl = { parts, halfDepth: size.z / 2, radius: Math.max(size.x, size.y) / 2 };
  templateCache.set(geometryId, tpl);
  return tpl;
}

/** Release every cached geometry and material (the renderer that used them is gone). */
export function disposeGeometryCaches() {
  materialCache.forEach((m) => m.dispose());
  materialCache.clear();
  templateCache.forEach((tpl) => tpl.parts.forEach((g) => g.dispose()));
  templateCache.clear();
}
