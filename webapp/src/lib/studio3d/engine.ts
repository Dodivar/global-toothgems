import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import watermarkUrl from "../../assets/logo-wordmark-blue.png";
import dentitionUrl from "../../assets/studio3d/dentition.glb?url";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  estimateTotalCents,
  ESTIMATE_PRICING,
  FREE_TOOTH,
  JEWELRY_BY_ID,
  QUADRANT_TEETH,
  TOOTH_SPECS,
  type PlacedJewelry,
  type PresetItem,
  type ToothSpec,
  type Vec3,
} from "../../data/studioEditor";
import { crownAt, DENTITION_CROWNS, DENTITION_FIT } from "./dentition";
import {
  createToothGeometry,
  disposeGeometryCaches,
  footprintCovers,
  getJewelMaterial,
  getJewelTemplate,
  matKeyFor,
  resolveFinishRaw,
  type Footprint,
} from "./geometry";
import { ARCH_K, backOut, clamp, easeInOutCubic, pointInPolygon, seeded, ss01, uid, v3, xForArc, type Point2 } from "./math";
import { ARCH_FRAMES } from "./archLayout";
import { anchorToothOf, groupToWorld, piecesToGroup, type Frame, type GemGroupData } from "../studioWorkspace/gemGroup";
import type { SceneCamera, SceneModel } from "../studioWorkspace/scene";
import { alignedHeights, centeredOffsets, type CenterItem } from "./layout";
import { mirroredRotation, opposingTooth } from "./mirror";
import { notify } from "./notices";
import type { DesignIssue, DesignStore, LightPreset, ModelMode } from "./store";

/**
 * The 3D Studio's renderer and interaction controller.
 *
 * Owns one WebGL canvas: the scene (the default dentition scan, the
 * procedural reference arch as a fallback, or an imported model), the camera
 * rig, the placement / drag / collision logic, the design check and the
 * exports. It reads and writes the design only through the `DesignStore`, and
 * reports to the customer only through `notify` (translation keys), so it
 * holds no copy and no UI of its own.
 *
 * Rendering is on demand: a frame is drawn while something moves (camera,
 * lights, animations, a drag) and for a short settle period after, then the
 * loop idles instead of redrawing an unchanged scene sixty times a second.
 */

/* Scanned dentitions run to hundreds of thousands of triangles, and placement
   raycasts them hundreds of times per gesture (collision search, snapping).
   A bounding-volume hierarchy turns each of those rays from ~18 ms into a few
   microseconds. Meshes without a hierarchy (the pieces) raycast as before. */
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface SurfaceHit {
  toothId: string;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}
interface MoveResult {
  moved: number;
  skipped: number;
}
/** A selected piece carried along by a group drag: where it sat when the drag began. */
interface DragFollower {
  rig: JewelRig;
  pose: GemPose;
  start: SurfaceHit;
}
interface ToothRig {
  id: string;
  mesh: THREE.Object3D;
  materials: THREE.MeshPhysicalMaterial[];
  spec: ToothSpec;
  highlight: number;
  imported: boolean;
  /** Lower arch: the crown's biting edge faces up. */
  lower: boolean;
  center: THREE.Vector3;
  outward: THREE.Vector3;
  tangent: THREE.Vector3;
}
interface JewelRig {
  id: string;
  group: THREE.Group;
  content: THREE.Group;
  outline: THREE.Group;
  meshes: THREE.Mesh[];
  material: THREE.MeshPhysicalMaterial | null;
  outlineMaterial: THREE.MeshBasicMaterial;
  typeId: string;
  matKey: string;
  halfDepth: number;
  radius: number;
  sizeScale: number;
  birth: number;
  death: number;
  hoverT: number;
}

/* Auto-fit + classification heuristics for imported .glb dentitions.
   In FREE MODE (merged meshes) only the labels depend on this — placement
   always raycasts the real model geometry. Tweak here if your scan sits oddly. */
const GLB_FIT = {
  targetWidth: 54, // world width the imported arch is scaled to
  centerY: 1.2, // vertical placement of the model's centre
  centerZ: -6.5, // depth placement of the model's centre
  snapRadius: 9, // max distance from an arch anchor to count as that tooth
  maxToothSize: 32, // meshes larger than this are never treated as a single tooth
};

/* Collision: pieces may TOUCH but never overlap. Each piece's front
   silhouette (its footprint) is posed in world space exactly as it renders;
   two pieces collide when an edge point of one lands inside the other's
   outline. Touching edges stay within one footprint cell and are allowed. */
interface GemPose {
  typeId: string;
  scale: number;
  offset: number;
  rotation: number;
}
interface Blocker {
  center: THREE.Vector3;
  /** Broad phase: no point of the outline is farther than this from `center`. */
  reach: number;
  toWorld: THREE.Matrix4;
  toLocal: THREE.Matrix4;
  footprint: Footprint;
}
/** Where a piece sits on its tooth, independent of the model: across (u) and up (v) its labial face. */
interface Seat {
  u: number;
  v: number;
}
/** A tooth's frame, as far as seating a piece needs it. */
interface SeatFrame {
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  spec: { wHalf: number; hHalf: number };
}
/** Only outline points within this depth of the other piece's plane (in its local units) can overlap it. */
const OVERLAP_DEPTH = 1.5;
/** Aligning moves a piece straight up or down: its snapped spot may sit at most this far from there (world units, ~mm). */
const ALIGN_MAX_DRIFT = 3;
function poseOf(j: PlacedJewelry): GemPose {
  return { typeId: j.jewelryTypeId, scale: j.scale, offset: j.offset ?? 0, rotation: j.rotation };
}
const _ov = new THREE.Vector3();
function edgeInside(a: Blocker, b: Blocker): boolean {
  const e = a.footprint.edge;
  for (let i = 0; i < e.length; i += 2) {
    _ov.set(e[i], e[i + 1], 0).applyMatrix4(a.toWorld).applyMatrix4(b.toLocal);
    if (Math.abs(_ov.z) < OVERLAP_DEPTH && footprintCovers(b.footprint, _ov.x, _ov.y)) return true;
  }
  return false;
}
function outlinesOverlap(a: Blocker, b: Blocker): boolean {
  if (a.center.distanceTo(b.center) >= a.reach + b.reach) return false;
  return edgeInside(a, b) || edgeInside(b, a);
}
/** Occupied-spot feedback: the site's error red (`--gt-red-500`). */
const BLOCK_COLOR = 0xd6455d;

const _Z = new THREE.Vector3(0, 0, 1);
const _UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(),
  _p = new THREE.Vector3(),
  _nn = new THREE.Vector3();
const _sa = new THREE.Vector3(),
  _sb = new THREE.Vector3();
const _q1 = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _q3 = new THREE.Quaternion();
const GHOST_RING_GEO = new THREE.TorusGeometry(1, 0.035, 8, 56);
/** Selection outline and drop ring: the brand's deep pastel blue (`--gt-blue-600`). */
const OUTLINE_COLOR = 0x5a7796;
/** Hover / selection glow on the enamel (`--gt-blue-500`). */
const TOOTH_HIGHLIGHT = 0x7a95b8;
/** The editor stage, as `.gt-editor-stage` paints it in CSS: the brand's light pastel blue (`--gt-blue-50` → `--gt-blue-300`). */
const STAGE_GRADIENT: [number, string][] = [
  [0, "#f4f8fc"],
  [0.62, "#d3e0ef"],
  [1, "#b9cde5"],
];
/** Floor shadow on the light stage: a soft deep blue (`--gt-blue-700`), never a grey patch. */
const STAGE_SHADOW = 0x3f5a75;
/** Export watermark: the wordmark's width as a share of the image width, and its opacity. */
const WATERMARK = { widthRatio: 0.24, minWidth: 150, opacity: 0.9, marginRatio: 0.035 };
let watermarkImage: Promise<HTMLImageElement | null> | null = null;
/** The wordmark, decoded once and on first export. Null when it fails to load: the export still goes out. */
function loadWatermark(): Promise<HTMLImageElement | null> {
  watermarkImage ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = watermarkUrl;
  });
  return watermarkImage;
}
/**
 * How the stage is set around a model: where the camera looks, what a
 * whole-arch view must show, where the floor catches the shadow, and the
 * camera positions of the view buttons (relative to `target`).
 */
interface StageFrame {
  target: THREE.Vector3;
  /** Half the width of the arch, molars included, plus a margin. */
  halfWidth: number;
  floorY: number;
  views: Record<"front" | "top" | "side" | "reset", THREE.Vector3>;
}
/** The procedural reference arch, and imported models fitted to its size. */
const ARCH_STAGE: StageFrame = {
  target: new THREE.Vector3(0, 0.5, -6),
  halfWidth: 31,
  floorY: -16,
  views: {
    front: new THREE.Vector3(0, 3.5, 62),
    top: new THREE.Vector3(0.01, 65.5, 12),
    side: new THREE.Vector3(64, 3.5, -2),
    reset: new THREE.Vector3(0, 8.5, 72),
  },
};
/**
 * The default dentition, at real size: both arches in occlusion around the
 * origin, socles above and below. The upper socle hides the teeth from
 * straight above, so "top" is the highest view that still sees the crowns.
 */
const DENTITION_STAGE: StageFrame = {
  target: new THREE.Vector3(0, 0, -9),
  halfWidth: 38,
  floorY: -DENTITION_FIT.origin.y * DENTITION_FIT.scale - 0.05,
  views: {
    front: new THREE.Vector3(0, 2, 88),
    top: new THREE.Vector3(0, 40, 78),
    side: new THREE.Vector3(80, 4, 22),
    reset: new THREE.Vector3(0, 12, 88),
  },
};
/** Frames still drawn after the last change, so damped camera and light fades can settle. */
const SETTLE_FRAMES = 90;
/** Largest model file accepted for import, in bytes. */
export const MAX_MODEL_BYTES = 60 * 1024 * 1024;

/** The default dentition file, fetched once per page and kept for "reset". */
let dentitionBuffer: Promise<ArrayBuffer> | null = null;
function fetchDentition(): Promise<ArrayBuffer> {
  dentitionBuffer ??= fetch(dentitionUrl).then((r) => {
    if (!r.ok) throw new Error(`dentition ${r.status}`);
    return r.arrayBuffer();
  });
  // A failed fetch is not cached: the next attempt retries.
  dentitionBuffer.catch(() => {
    dentitionBuffer = null;
  });
  return dentitionBuffer;
}

/** How the model a design was made on is named in the JSON export. */
const EXPORT_MODEL_NAMES: Record<ModelMode, string> = {
  dentition: "default-dentition",
  studio: "studio-arch",
  teeth: "custom-teeth",
  free: "custom-free",
};

/** A piece counts as seated when the surface is found this close to its stored contact point, in mm. */
const SEAT_TOLERANCE = 0.6;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Geometric world normal: cross product of the hit triangle's world-space
   vertices. Exact under any node transform — including non-uniform GLTF
   scales. Always oriented against the incoming ray. */
const _gA = new THREE.Vector3(),
  _gB = new THREE.Vector3(),
  _gC = new THREE.Vector3();
const _gE1 = new THREE.Vector3(),
  _gE2 = new THREE.Vector3(),
  _gN = new THREE.Vector3();
function geometricWorldNormal(hit: THREE.Intersection, rayDir: THREE.Vector3): THREE.Vector3 {
  const g = (hit.object as THREE.Mesh).geometry;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const f = hit.face!;
  _gA.fromBufferAttribute(pos, f.a).applyMatrix4(hit.object.matrixWorld);
  _gB.fromBufferAttribute(pos, f.b).applyMatrix4(hit.object.matrixWorld);
  _gC.fromBufferAttribute(pos, f.c).applyMatrix4(hit.object.matrixWorld);
  _gE1.subVectors(_gB, _gA);
  _gE2.subVectors(_gC, _gA);
  _gN.crossVectors(_gE1, _gE2);
  if (_gN.lengthSq() < 1e-12) _gN.copy(f.normal).transformDirection(hit.object.matrixWorld);
  else _gN.normalize();
  if (_gN.dot(rayDir) > 0) _gN.negate();
  return _gN;
}
/** Near-flush mount gap: the piece's back almost kisses the enamel. */
function mountGap(scale: number, manualOffset = 0): number {
  return 0.04 + 0.04 * scale + manualOffset;
}

/**
 * Where the current selection sits on the canvas, in CSS pixels from the
 * stage's top-left corner: the screen box around the selected pieces. `null`
 * while nothing is selected, a piece is being dragged or placed, or the
 * selection is off screen — the floating selection controls hide then.
 */
export interface SelectionAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The selection's centre on screen: the pivot a group turns around. */
  cx: number;
  cy: number;
  width: number;
  height: number;
}
export type SelectionAnchorListener = (anchor: SelectionAnchor | null) => void;

/** A piece with a problem, framed on screen (CSS pixels from the stage's top-left corner). */
export interface IssueFrame {
  id: string;
  left: number;
  top: number;
  size: number;
}
export type IssueFramesListener = (frames: IssueFrame[]) => void;

/** The lasso being drawn, in CSS pixels from the stage's top-left corner; `null` when none is. */
export type LassoListener = (points: readonly Point2[] | null) => void;
/** A lasso point is kept once the pointer has moved this far (CSS pixels) from the last one. */
const LASSO_STEP = 4;
/** Longest outline kept: enough for any loop drawn by hand, bounded all the same. */
const LASSO_MAX_POINTS = 1500;
/** Shorter than this (CSS pixels), the lasso was a tap, not a loop. */
const LASSO_MIN_LENGTH = 24;
/** World units a tooth may stand in front of a piece's rim before the piece counts as hidden behind it. */
const LASSO_OCCLUSION_SLACK = 1;

/** A group turn in progress: every piece's start, so each step is computed afresh and nothing drifts. */
export interface GroupTurn {
  patchesFor(clockwiseDeg: number): { id: string; patch: Partial<PlacedJewelry> }[];
}

function toothIdFromObject(o: THREE.Object3D | null): string | null {
  let cur = o;
  while (cur) {
    if (cur.userData.toothId) return cur.userData.toothId as string;
    cur = cur.parent;
  }
  return null;
}

export interface EngineOptions {
  /**
   * View a design without editing it (a shared link): orbit, zoom and
   * double-click focus work, but no press selects, drags or places a piece.
   */
  readOnly?: boolean;
}

export class StudioEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement;
  private dentitionGroup: THREE.Group = new THREE.Group();
  private archAnchors = new Map<string, { center: THREE.Vector3; outward: THREE.Vector3; tangent: THREE.Vector3 }>();
  private toothRigs = new Map<string, ToothRig>();
  private toothMeshes: THREE.Object3D[] = [];
  private jewelRigs = new Map<string, JewelRig>();
  private dyingJewels: JewelRig[] = [];
  private jewelMeshes: THREE.Mesh[] = [];
  private jewelsGroup = new THREE.Group();
  private backdrop!: THREE.Mesh;
  private floor!: THREE.Mesh;
  private ro: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private store: DesignStore;
  /** A shared design being viewed: the camera moves, the pieces never do (see `EngineOptions`). */
  private readOnly: boolean;
  private unsubscribe: () => void;
  /** Frames left to draw before the loop idles (see `wake`). */
  private pendingFrames = SETTLE_FRAMES;

  // lighting (presets crossfade these every frame)
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private lightTarget = {
    key: 2.2,
    keyColor: new THREE.Color(0xfff1e0),
    keyPos: new THREE.Vector3(28, 46, 40),
    fill: 0.6,
    fillColor: new THREE.Color(0xdfe8f5),
    rim: 0.8,
    env: 1,
    expo: 1,
    tint: new THREE.Color(0xffffff),
  };

  // model state
  private modelMode: ModelMode = "dentition";
  private stage: StageFrame = DENTITION_STAGE;
  /** False until the first model is on stage: the pieces wait for it. */
  private modelReady = false;
  /** Bumped on every model change, so a slower load that lost the race is dropped. */
  private modelToken = 0;
  private mergedMode = false;
  private proxyMeshes: THREE.Mesh[] = []; // invisible reference teeth (free-mode labelling)
  private proxyGroup: THREE.Group | null = null;
  /** Default dentition: its surface is one mesh, so crowns are told apart by calibration. */
  private calibrated = false;

  // design check (overlaps, pieces off the teeth)
  private checkedJewels: PlacedJewelry[] | null = null;
  private issueIds = new Set<string>();
  private issueListener: IssueFramesListener | null = null;
  private lastIssueKey = "";

  // interaction state
  private mode: "idle" | "jewel-press" | "drag-jewel" | "tooth-press" | "bg-press" | "armed-press" = "idle";
  private press: { jewelId?: string; toothId?: string; x: number; y: number; t: number } | null = null;
  private dragJewel: JewelRig | null = null;
  private dragLastHit: SurfaceHit | null = null;
  // group drag: the lead's spot when the drag began, the other selected pieces and their last free spots
  private dragStart: SurfaceHit | null = null;
  private dragFollowers: DragFollower[] = [];
  private dragFollowerSpots = new Map<string, SurfaceHit>();
  private hoverJewelId: string | null = null;
  private hoverToothId: string | null = null;
  private placing: { typeId: string; startX: number; startY: number; started: boolean } | null = null;
  private ghost: {
    root: THREE.Group;
    ringRoot: THREE.Group;
    ring: THREE.Mesh;
    ringScale: number;
    halfDepth: number;
    material: THREE.MeshBasicMaterial;
    ringMaterial: THREE.MeshBasicMaterial;
    baseColor: number;
  } | null = null;

  // camera animation
  private camTween: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null =
    null;
  private autoRotate = false;

  // floating selection controls (see `onSelectionAnchor`)
  private anchorListener: SelectionAnchorListener | null = null;
  private lastAnchorKey = "";

  // lasso selection (see `onLassoPath`)
  private lasso: { pointerId: number; originX: number; originY: number; points: Point2[]; additive: boolean } | null = null;
  private lassoListener: LassoListener | null = null;

  constructor(container: HTMLElement, store: DesignStore, options: EngineOptions = {}) {
    this.container = container;
    this.store = store;
    this.readOnly = options.readOnly ?? false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(36, (container.clientWidth || 1) / (container.clientHeight || 1), 2, 700);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.8;
    this.controls.panSpeed = 0.85;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 150;
    this.controls.minPolarAngle = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.72;
    this.controls.target.copy(this.stage.target);

    this.buildEnvironment();
    this.buildArchAnchors();
    this.scene.add(this.dentitionGroup);
    // The pieces wait, hidden, until the dentition they sit on is on stage.
    this.jewelsGroup.visible = false;
    this.scene.add(this.jewelsGroup);

    // input — capture phase on the container runs BEFORE OrbitControls' canvas listeners,
    // so a press on a jewel (or an armed placement) can pre-empt camera rotation cleanly.
    container.addEventListener("pointerdown", this.onPointerDown, true);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("blur", this.onBlur);
    this.renderer.domElement.addEventListener("dblclick", this.onDblClick);
    container.addEventListener("contextmenu", this.onContextMenu);
    // Wheel zoom and damped orbiting move the camera without a pointer event on us.
    this.controls.addEventListener("change", this.wake);
    this.controls.addEventListener("start", this.wake);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    this.unsubscribe = store.subscribe(this.onStoreChange);
    this.syncJewels();

    this.camera.position.set(40, 30, 120);
    this.resize();
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.raf = requestAnimationFrame(this.tick);
    void this.loadDefaultModel();
  }

  /* ---------- scene construction ---------- */

  private buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environmentIntensity = 1;

    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = 1024;
    const ctx = cnv.getContext("2d")!;
    const grad = ctx.createRadialGradient(512, 400, 80, 512, 512, 780);
    STAGE_GRADIENT.forEach(([at, color]) => grad.addColorStop(at, color));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(170, 48, 32),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false }),
    );
    this.scene.add(this.backdrop);

    this.keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
    this.keyLight.position.set(28, 46, 40);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    // Wide enough for the dentition's socles, which reach far behind the teeth.
    this.keyLight.shadow.camera.left = -85;
    this.keyLight.shadow.camera.right = 85;
    this.keyLight.shadow.camera.top = 85;
    this.keyLight.shadow.camera.bottom = -85;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 260;
    this.keyLight.shadow.bias = -0.0002;
    this.keyLight.shadow.normalBias = 0.6;
    this.scene.add(this.keyLight);
    this.fillLight = new THREE.DirectionalLight(0xdfe8f5, 0.6);
    this.fillLight.position.set(-34, 14, 30);
    this.scene.add(this.fillLight);
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.rimLight.position.set(-6, 20, -55);
    this.scene.add(this.rimLight);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.ShadowMaterial({ color: STAGE_SHADOW, opacity: 0.16 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = this.stage.floorY;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  /** Lighting presets — smoothly crossfaded in the frame loop. */
  setLightPreset(p: LightPreset) {
    this.wake();
    const t = this.lightTarget;
    if (p === "lamp") {
      // warm, low, directional chair lamp — dim ambience, sparkle from the lamp
      t.key = 1.9;
      t.keyColor.set(0xffd2a0);
      t.keyPos.set(16, 26, 44);
      t.fill = 0.22;
      t.fillColor.set(0xffe6cc);
      t.rim = 0.35;
      t.env = 0.5;
      t.expo = 1.08;
      t.tint.set(0xf1e6d8);
    } else if (p === "daylight") {
      // bright sun + cool sky fill
      t.key = 2.5;
      t.keyColor.set(0xffffff);
      t.keyPos.set(34, 64, 26);
      t.fill = 0.9;
      t.fillColor.set(0xdcecff);
      t.rim = 1.05;
      t.env = 1.3;
      t.expo = 1.0;
      t.tint.set(0xeef1f5);
    } else {
      // neutral studio default
      t.key = 2.2;
      t.keyColor.set(0xfff1e0);
      t.keyPos.set(28, 46, 40);
      t.fill = 0.6;
      t.fillColor.set(0xdfe8f5);
      t.rim = 0.8;
      t.env = 1;
      t.expo = 1;
      t.tint.set(0xffffff);
    }
  }

  private archCenters(): number[] {
    let cum = 0;
    const centers: number[] = [];
    for (const t of QUADRANT_TEETH) {
      centers.push(cum + t.w / 2);
      cum += t.w;
    }
    return centers;
  }
  /** Walk every tooth of the procedural upper arch — shared by the studio arch,
      the auto-fit anchors and the free-mode labelling proxies. */
  private forEachArchTooth(fn: (fdi: string, spec: ToothSpec, pos: THREE.Vector3, outward: THREE.Vector3, tangent: THREE.Vector3) => void) {
    for (const f of ARCH_FRAMES) {
      fn(
        f.fdi,
        f.spec,
        new THREE.Vector3(f.center.x, f.center.y, f.center.z),
        new THREE.Vector3(f.outward.x, f.outward.y, f.outward.z),
        new THREE.Vector3(f.tangent.x, f.tangent.y, f.tangent.z),
      );
    }
  }

  /** The reference arch's tooth frames: where saved designs from that arch sit, and the free-mode labelling frame. */
  private buildArchAnchors() {
    this.forEachArchTooth((fdi, _spec, pos, outward, tangent) => {
      this.archAnchors.set(fdi, { center: pos.clone(), outward: outward.clone(), tangent: tangent.clone() });
    });
  }

  /** The procedural reference arch: the fallback when the dentition file cannot be loaded. */
  private buildDentition() {
    const group = new THREE.Group();
    this.dentitionGroup = group;
    const baseEnamel = new THREE.MeshPhysicalMaterial({
      color: 0xf6f0e4,
      roughness: 0.3,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.85,
      emissive: TOOTH_HIGHLIGHT,
      emissiveIntensity: 0,
    });
    this.forEachArchTooth((fdi, spec, pos, outward, tangent) => {
      const geo = createToothGeometry(spec);
      const mat = baseEnamel.clone();
      mat.color.offsetHSL((seeded(fdi, 1) - 0.5) * 0.012, (seeded(fdi, 2) - 0.5) * 0.03, (seeded(fdi, 3) - 0.5) * 0.035);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.order = "YXZ";
      mesh.rotation.set(THREE.MathUtils.degToRad(spec.procline), Math.atan2(outward.x, outward.z), 0);
      mesh.position.copy(pos);
      mesh.scale.setScalar(1 + (seeded(fdi, 5) - 0.5) * 0.05);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.toothId = fdi;
      group.add(mesh);
      this.toothMeshes.push(mesh);
      this.toothRigs.set(fdi, {
        id: fdi,
        mesh,
        materials: [mat],
        spec,
        highlight: 0,
        imported: false,
        lower: false,
        center: pos.clone(),
        outward: outward.clone(),
        tangent: tangent.clone(),
      });
    });
    const gum = this.buildGum(this.archCenters());
    gum.castShadow = true;
    gum.receiveShadow = true;
    group.add(gum);
    this.scene.add(group);
    this.scene.updateMatrixWorld(true);
  }

  private buildGum(centers: number[]): THREE.Mesh {
    const hw = 2.65,
      hh = 3.8,
      r = 1.8,
      segs = 6;
    const outline: [number, number][] = [];
    const corners = [
      [hw - r, hh - r, 0],
      [-hw + r, hh - r, Math.PI / 2],
      [-hw + r, -hh + r, Math.PI],
      [hw - r, -hh + r, (3 * Math.PI) / 2],
    ];
    for (const [cx, cy, a0] of corners)
      for (let k = 0; k <= segs; k++) {
        const a = a0 + (k / segs) * (Math.PI / 2);
        outline.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    const M = outline.length;
    const AC = -0.5,
      BC = 4.0;
    const S_END = centers[6] + 5.5;
    const STATIONS = 150;
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= STATIONS; i++) {
      const f = i / STATIONS;
      const s = -S_END + f * S_END * 2;
      const x = xForArc(Math.abs(s)) * (s < 0 ? -1 : 1);
      const z = -(x * x) / ARCH_K;
      const nl = Math.hypot((2 * x) / ARCH_K, 1);
      const nx = (2 * x) / ARCH_K / nl,
        nz = 1 / nl;
      const closeEnd = ss01((Math.abs(s) - (S_END - 3)) / 3);
      const shrink = 0.12 + 0.88 * (1 - closeEnd);
      for (let j = 0; j < M; j++) {
        let a = AC + outline[j][0],
          b = BC + outline[j][1];
        a = AC + (a - AC) * shrink;
        b = BC + (b - BC) * shrink;
        positions.push(x + nx * a, b, z + nz * a);
      }
    }
    for (let i = 0; i < STATIONS; i++)
      for (let j = 0; j < M; j++) {
        const j2 = (j + 1) % M;
        const a = i * M + j,
          b = i * M + j2,
          c = (i + 1) * M + j2,
          d = (i + 1) * M + j;
        indices.push(a, c, d, a, b, c);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xb96f7a,
      roughness: 0.42,
      clearcoat: 0.45,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geo, mat);
  }

  /* ---------- models: the default dentition, the fallback arch, imports (.glb) ---------- */

  private matchToothName(name: string): string | null {
    const m = (name || "").match(/(?:^|[^0-9])(1[1-7]|2[1-7])(?:$|[^0-9])/);
    return m ? m[1] : null;
  }
  private removeDentition() {
    if (this.dentitionGroup) {
      this.scene.remove(this.dentitionGroup);
      const seen = new Set<THREE.Material>();
      this.dentitionGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.disposeBoundsTree?.();
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => {
            if (x && !seen.has(x)) {
              seen.add(x);
              x.dispose();
            }
          });
        }
      });
    }
    this.dentitionGroup = new THREE.Group();
    this.toothRigs.clear();
    this.toothMeshes.length = 0;
    this.calibrated = false;
    // arch anchors are kept: they are the reference frame for GLB classification
  }
  private clearCustomModel() {
    if (this.proxyGroup) {
      this.scene.remove(this.proxyGroup);
      const seen = new Set<THREE.Material>();
      this.proxyGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => {
            if (x && !seen.has(x)) {
              seen.add(x);
              x.dispose();
            }
          });
        }
      });
      this.proxyGroup = null;
    }
    this.proxyMeshes.length = 0;
    this.mergedMode = false;
  }

  /**
   * Load the default dentition (also the "reset" of an imported model). If
   * the file cannot be fetched on the first load, the procedural reference
   * arch takes its place, so the Studio still works; a failed reset keeps the
   * model on stage.
   */
  async loadDefaultModel(): Promise<boolean> {
    const token = ++this.modelToken;
    this.cancelInteraction();
    this.store.setModelLoading(true);
    try {
      const root = await this.parseModel(await fetchDentition());
      if (this.disposed || token !== this.modelToken) return false;
      this.swapModel(() => this.installDentition(root), "dentition");
      return true;
    } catch {
      if (this.disposed || token !== this.modelToken) return false;
      if (!this.modelReady) this.swapModel(() => this.buildDentition(), "studio");
      else this.store.setModelLoading(false);
      notify("modelLoadFailed", undefined, "warning");
      return false;
    }
  }

  /** Parse a glTF file into a scene, with every mesh ready for fast raycasting. */
  private async parseModel(buffer: ArrayBuffer): Promise<THREE.Group> {
    // The loaders are only needed for a model, so they load with the first one.
    const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    if (this.disposed) throw new ModelImportError("cancelled");
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    // Draco's WebAssembly decoder is fetched from the CDN build of the exact
    // three.js release bundled here, and only for Draco-compressed files.
    // Meshopt (the default dentition's compression) decodes from the bundle.
    draco.setDecoderPath(`https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.0/examples/jsm/libs/draco/`);
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    let gltf: { scene: THREE.Group };
    try {
      gltf = await loader.parseAsync(buffer, "");
    } catch {
      throw new ModelImportError("invalid");
    } finally {
      draco.dispose();
    }
    const root = gltf.scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.geometry.computeBoundsTree();
    });
    root.updateMatrixWorld(true);
    return root;
  }

  /**
   * Put a new model on stage. Pieces already placed stay on the same teeth:
   * each is re-seated at the same spot of its tooth on the new surface, as one
   * design with a fresh history (the old one belongs to the old model).
   */
  private swapModel(install: () => void, mode: ModelMode) {
    const seats = this.modelReady ? this.captureSeats(this.store.jewels, (id) => this.toothRigs.get(id) ?? null) : null;
    this.cancelInteraction();
    this.clearCustomModel();
    this.removeDentition();
    install();
    this.scene.updateMatrixWorld(true);
    const stage = mode === "dentition" ? DENTITION_STAGE : ARCH_STAGE;
    const stageChanged = !this.modelReady || stage !== this.stage;
    this.modelMode = mode;
    this.stage = stage;
    this.floor.position.y = stage.floorY;
    if (seats) this.store.replaceDesign(this.reseat(this.store.jewels, seats), mode);
    else this.adoptStoredDesign();
    this.modelReady = true;
    this.jewelsGroup.visible = true;
    this.store.setModelMode(mode);
    this.store.setModelLoading(false);
    this.syncJewels();
    this.checkDesign(true);
    if (stageChanged) this.setView("reset");
    // A saved creation opened while the model was loading.
    if (this.store.hasPendingLoad()) this.settlePendingLoad();
    this.wake();
  }

  /** The Studio's own dentition: the scan, fitted at real size, its crowns known by calibration. */
  private installDentition(root: THREE.Group) {
    const { scale, origin } = DENTITION_FIT;
    root.scale.setScalar(scale);
    root.position.set(-origin.x * scale, -origin.y * scale, -origin.z * scale);
    // One resin-like finish for the whole cast, seen from inside too where the socles are open.
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xf3ede2,
      roughness: 0.4,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.8,
      side: THREE.DoubleSide,
    });
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const old = Array.isArray(m.material) ? m.material : [m.material];
      old.forEach((x) => x.dispose());
      m.material = material;
    });
    this.dentitionGroup = root;
    this.scene.add(root);
    this.calibrated = true;
    this.toothMeshes.push(root);
    for (const c of DENTITION_CROWNS) {
      this.toothRigs.set(c.fdi, {
        id: c.fdi,
        mesh: root,
        materials: [],
        spec: {
          wHalf: (c.alongMinus + c.alongPlus) / 2,
          hHalf: (c.top - c.bottom) / 2,
          dHalf: c.halfDepth,
          p: 5,
          cervical: 0.2,
          procline: 0,
        },
        highlight: 0,
        imported: true,
        lower: c.lower,
        center: new THREE.Vector3(c.center.x, c.center.y, c.center.z),
        outward: new THREE.Vector3(c.outward.x, c.outward.y, c.outward.z),
        tangent: new THREE.Vector3(c.tangent.x, c.tangent.y, c.tangent.z),
      });
    }
  }

  /* ---------- keeping a design on its teeth across models ---------- */

  /** Tooth frame of a model that is not on stage: known for the two built-in dentitions only. */
  private frameOf(model: ModelMode, toothId: string): SeatFrame | null {
    if (model === "dentition") {
      const c = DENTITION_CROWNS.find((x) => x.fdi === toothId);
      if (!c) return null;
      return {
        center: new THREE.Vector3(c.center.x, c.center.y, c.center.z),
        tangent: new THREE.Vector3(c.tangent.x, c.tangent.y, c.tangent.z),
        spec: { wHalf: (c.alongMinus + c.alongPlus) / 2, hHalf: (c.top - c.bottom) / 2 },
      };
    }
    if (model === "studio") {
      const a = this.archAnchors.get(toothId);
      const q = QUADRANT_TEETH.find((t) => t.fdiR === toothId || t.fdiL === toothId);
      if (!a || !q) return null;
      return { center: a.center, tangent: a.tangent, spec: TOOTH_SPECS[q.key] };
    }
    return null;
  }

  /** Where each piece sits on its tooth, as the across / up fractions `getSurfacePoint` takes. */
  private captureSeats(jewels: PlacedJewelry[], frameFor: (toothId: string) => SeatFrame | null): Map<string, Seat> {
    const seats = new Map<string, Seat>();
    for (const j of jewels) {
      const f = frameFor(j.toothId);
      if (!f) continue;
      const rel = new THREE.Vector3(j.position.x, j.position.y, j.position.z).sub(f.center);
      seats.set(j.id, {
        u: clamp(rel.dot(f.tangent) / (f.spec.wHalf * 0.6), -1.4, 1.4),
        v: clamp(rel.y / (f.spec.hHalf * 0.55), -1.4, 1.4),
      });
    }
    return seats;
  }

  /** The pieces re-seated on the model on stage, each on its tooth, sliding aside where a neighbour took the spot. */
  private reseat(jewels: PlacedJewelry[], seats: Map<string, Seat>): PlacedJewelry[] {
    const blockers: Blocker[] = [];
    return jewels.map((j) => {
      const seat = seats.get(j.id);
      if (!seat || !this.toothRigs.has(j.toothId)) return j; // no such tooth here: left as is, and reported
      const anchor = this.getSurfacePoint(j.toothId, seat.u, seat.v);
      const spot = this.findFreeSpot(anchor, poseOf(j), blockers) ?? anchor;
      const moved: PlacedJewelry = {
        ...j,
        toothId: spot.toothId,
        position: v3(spot.point.x, spot.point.y, spot.point.z),
        normal: v3(spot.normal.x, spot.normal.y, spot.normal.z),
      };
      blockers.push(this.jewelBlocker(moved));
      return moved;
    });
  }

  /** A design restored from storage, made on another model: re-seated here when that model's teeth are known. */
  private adoptStoredDesign() {
    const from = this.store.designModel;
    if (from === this.modelMode) return;
    const seats = this.captureSeats(this.store.jewels, (id) => this.frameOf(from, id));
    this.store.replaceDesign(seats.size ? this.reseat(this.store.jewels, seats) : this.store.jewels, this.modelMode);
  }

  /** Pieces saved on the model `from` (a preset of the customer's), adapted to the model on stage. */
  adaptDesign(jewels: PlacedJewelry[], from: ModelMode): PlacedJewelry[] {
    if (from === this.modelMode || !this.modelReady) return jewels;
    const seats = this.captureSeats(jewels, (id) => this.frameOf(from, id));
    return seats.size ? this.reseat(jewels, seats) : jewels;
  }

  /** The model on stage, as saved with a design. */
  getModelMode(): ModelMode {
    return this.modelMode;
  }

  async importGLB(file: File): Promise<{ teeth: number; mode: "teeth" | "free" }> {
    if (file.size > MAX_MODEL_BYTES) throw new ModelImportError("tooLarge");
    const token = ++this.modelToken;
    try {
      return await this.importModel(file, token);
    } catch (err) {
      // Dropped while the default dentition was still loading, the import took its place: load it again.
      if (!this.disposed && !this.modelReady && token === this.modelToken) void this.loadDefaultModel();
      throw err;
    }
  }

  private async importModel(file: File, token: number): Promise<{ teeth: number; mode: "teeth" | "free" }> {
    this.cancelInteraction();
    const buffer = await file.arrayBuffer();
    const root = await this.parseModel(buffer);
    if (this.disposed || token !== this.modelToken) throw new ModelImportError("cancelled");

    // --- auto-fit into the studio coordinate system
    let box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = GLB_FIT.targetWidth / Math.max(size.x, 0.001);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(c.x - 0, c.y - GLB_FIT.centerY, c.z - GLB_FIT.centerZ));
    root.updateMatrixWorld(true);

    // --- classify every mesh: named tooth / nearest-anchor tooth / scenery
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) meshes.push(m);
    });
    if (!meshes.length) throw new ModelImportError("empty");
    const buckets = new Map<string, THREE.Mesh[]>();
    const push = (fdi: string, m: THREE.Mesh) => {
      const arr = buckets.get(fdi);
      if (arr) arr.push(m);
      else buckets.set(fdi, [m]);
    };
    for (const m of meshes) {
      const byName = this.matchToothName(m.name);
      if (byName) {
        push(byName, m);
        continue;
      }
      if (/gum|gingiva|gencive|muqueuse|palais|base|floor|plane|camera/i.test(m.name || "")) continue;
      const b = new THREE.Box3().setFromObject(m);
      const ms = b.getSize(new THREE.Vector3());
      if (Math.max(ms.x, ms.y, ms.z) > GLB_FIT.maxToothSize) continue;
      const center = b.getCenter(new THREE.Vector3());
      let best: string | null = null,
        bestD = GLB_FIT.snapRadius;
      this.archAnchors.forEach((a, fdi) => {
        const d = a.center.distanceTo(center);
        if (d < bestD) {
          bestD = d;
          best = fdi;
        }
      });
      if (best) push(best, m);
    }

    // --- swap the dentition on stage for the imported one (never rejected)
    const mode = buckets.size >= 4 ? "teeth" : "free";
    this.swapModel(() => (mode === "teeth" ? this.installToothModel(root, buckets) : this.installFreeModel(root)), mode);
    return { teeth: mode === "teeth" ? buckets.size : 0, mode };
  }

  /* TOOTH MODE — separate tooth meshes detected: exact per-tooth selection. */
  private installToothModel(root: THREE.Group, buckets: Map<string, THREE.Mesh[]>) {
    this.dentitionGroup = root;
    this.scene.add(root);
    for (const [fdi, list] of buckets) {
      const group = new THREE.Group();
      group.userData.toothId = fdi;
      root.add(group);
      list.forEach((m) => group.attach(m)); // keeps world transforms
      // clone materials per tooth so hover/selection highlights don't bleed
      const mats: THREE.MeshPhysicalMaterial[] = [];
      group.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (!mm.isMesh) return;
        const src = Array.isArray(mm.material) ? mm.material : [mm.material];
        const cloned = src.map((mat) => {
          const c2 = mat.clone() as THREE.MeshPhysicalMaterial;
          if ((c2 as unknown as { emissive?: THREE.Color }).emissive) {
            c2.emissive = new THREE.Color(TOOTH_HIGHLIGHT);
            c2.emissiveIntensity = 0;
            mats.push(c2);
          }
          return c2;
        });
        mm.material = Array.isArray(mm.material) ? cloned : cloned[0];
      });
      const bbox = new THREE.Box3().setFromObject(group);
      const bs = bbox.getSize(new THREE.Vector3());
      const anchor = this.archAnchors.get(fdi)!;
      this.toothRigs.set(fdi, {
        id: fdi,
        mesh: group,
        materials: mats,
        imported: true,
        lower: false,
        highlight: 0,
        spec: {
          wHalf: Math.max(bs.x / 2, 1),
          hHalf: Math.max(bs.y / 2, 1),
          dHalf: Math.max(bs.z / 2, 1),
          p: 5,
          cervical: 0.2,
          procline: 0,
        },
        center: bbox.getCenter(new THREE.Vector3()),
        outward: anchor.outward.clone(),
        tangent: anchor.tangent.clone(),
      });
      this.toothMeshes.push(group);
    }
  }

  /* FREE MODE — merged model: every surface is placeable, jewels raycast the
     real geometry for exact position + orientation. Tooth labels are inferred
     from invisible reference teeth placed along the standard arch. */
  private installFreeModel(root: THREE.Group) {
    this.dentitionGroup = root;
    this.scene.add(root);
    this.mergedMode = true;
    this.toothMeshes.push(root);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false }); // rendered never, raycast always
    const proxyGroup = new THREE.Group();
    this.forEachArchTooth((fdi, spec, pos, outward, tangent) => {
      const m = new THREE.Mesh(createToothGeometry(spec), proxyMat);
      m.position.copy(pos);
      m.rotation.order = "YXZ";
      m.rotation.set(THREE.MathUtils.degToRad(spec.procline), Math.atan2(outward.x, outward.z), 0);
      m.userData.toothId = fdi;
      proxyGroup.add(m);
      this.proxyMeshes.push(m);
      this.toothRigs.set(fdi, {
        id: fdi,
        mesh: root,
        materials: [],
        spec,
        imported: true,
        lower: false,
        highlight: 0,
        center: pos.clone(),
        outward: outward.clone(),
        tangent: tangent.clone(),
      });
    });
    this.proxyGroup = proxyGroup;
    this.scene.add(proxyGroup);
  }

  /** Drop a placement or a drag in progress: the model under it is about to change. */
  private cancelInteraction() {
    this.cancelPlacing();
    this.cancelLasso();
    if (this.dragJewel) {
      this.endDrag();
      this.controls.enabled = true;
    }
    this.press = null;
    this.mode = "idle";
  }

  /* ---------- raycasting (JewelryPlacementController) ---------- */

  private setNDC(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
      this.camera,
    );
  }
  /** Free-mode labelling: which tooth does the current pointer ray point at? */
  private classifyHit(point: THREE.Vector3): string {
    const ph = this.raycaster.intersectObjects(this.proxyMeshes, false);
    if (ph.length) return ph[0].object.userData.toothId as string;
    // fallback: nearest arch anchor to the surface point (vertical distance damped)
    let best = FREE_TOOTH,
      bestD = 30;
    this.toothRigs.forEach((rig, fdi) => {
      const dx = rig.center.x - point.x;
      const dy = (rig.center.y - point.y) * 0.4;
      const dz = rig.center.z - point.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < bestD) {
        bestD = d;
        best = fdi;
      }
    });
    return best;
  }
  /**
   * The tooth a surface hit belongs to, or null where no piece belongs (gum,
   * socle): the calibrated crowns on the default dentition, the tooth meshes
   * on the reference arch and tooth-mode imports. A free-mode import cannot
   * tell, so every surface of it counts, labelled by its nearest tooth.
   */
  private toothOfHit(h: THREE.Intersection): string | null {
    if (this.calibrated) return crownAt(h.point);
    if (this.mergedMode) return this.classifyHit(h.point);
    return toothIdFromObject(h.object);
  }
  private raycastTeeth(): SurfaceHit | null {
    const hits = this.raycaster.intersectObjects(this.toothMeshes, true);
    if (!hits.length) return null;
    const h = hits[0];
    const n = geometricWorldNormal(h, this.raycaster.ray.direction).clone();
    const toothId = this.toothOfHit(h);
    if (!toothId) return null;
    return { toothId, point: h.point.clone(), normal: n };
  }
  private raycastJewels(): { jewelId: string } | null {
    if (!this.jewelMeshes.length) return null;
    const hits = this.raycaster.intersectObjects(this.jewelMeshes, false);
    if (!hits.length) return null;
    return { jewelId: hits[0].object.userData.jewelId as string };
  }
  /** Re-snap an arbitrary world point onto the nearest tooth surface along `nrm`.
       Used by mirroring, layout tools and collision search — tries both directions. */
  private snapToSurface(point: THREE.Vector3, nrm: THREE.Vector3): SurfaceHit | null {
    const n = nrm.clone().normalize();
    const tries: [THREE.Vector3, THREE.Vector3][] = [
      [point.clone().addScaledVector(n, 6), n.clone().negate()],
      [point.clone().addScaledVector(n, -6), n.clone()],
    ];
    for (const [origin, dir] of tries) {
      this.raycaster.set(origin, dir);
      this.raycaster.far = 80;
      const hits = this.raycaster.intersectObjects(this.toothMeshes, true);
      this.raycaster.far = Infinity;
      if (hits.length) {
        const h = hits[0];
        const gn = geometricWorldNormal(h, dir).clone();
        const toothId = this.toothOfHit(h);
        if (toothId) return { toothId, point: h.point.clone(), normal: gn };
      }
    }
    return null;
  }
  /** Nearest tooth rig to a world point (fallback for unlabeled free-mode pieces). */
  private nearestRig(p: THREE.Vector3): ToothRig | null {
    let best: ToothRig | null = null,
      bestD = Infinity;
    this.toothRigs.forEach((r) => {
      const d = r.center.distanceTo(p);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    });
    return best;
  }

  /* ---------- collision system: pieces may touch, never overlap ---------- */

  /** Visual centre of a piece (surface point pushed out along its normal). */
  private gemCenterRaw(point: THREE.Vector3, normal: THREE.Vector3, typeId: string, scale: number, offset: number): THREE.Vector3 {
    const tpl = getJewelTemplate(JEWELRY_BY_ID[typeId].geometry);
    return point.clone().addScaledVector(normal.clone().normalize(), tpl.halfDepth * scale + mountGap(scale, offset));
  }
  /** A piece at a surface spot, as a collision blocker: its real outline, posed exactly as it renders. */
  private blockerAt(point: THREE.Vector3, normal: THREE.Vector3, pose: GemPose): Blocker {
    const tpl = getJewelTemplate(JEWELRY_BY_ID[pose.typeId].geometry);
    const center = this.gemCenterRaw(point, normal, pose.typeId, pose.scale, pose.offset);
    const q = new THREE.Quaternion()
      .setFromUnitVectors(_Z, normal.clone().normalize())
      .multiply(new THREE.Quaternion().setFromAxisAngle(_Z, THREE.MathUtils.degToRad(pose.rotation)));
    const toWorld = new THREE.Matrix4().compose(center, q, new THREE.Vector3(pose.scale, pose.scale, pose.scale));
    return { center, reach: tpl.reach * pose.scale, toWorld, toLocal: toWorld.clone().invert(), footprint: tpl.footprint };
  }
  private jewelBlocker(j: PlacedJewelry): Blocker {
    return this.blockerAt(
      new THREE.Vector3(j.position.x, j.position.y, j.position.z),
      new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z),
      poseOf(j),
    );
  }
  /** Every placed piece except `exceptIds`, as collision blockers. */
  private blockersFor(exceptIds: Set<string>): Blocker[] {
    const out: Blocker[] = [];
    for (const j of this.store.jewels) {
      if (exceptIds.has(j.id)) continue;
      out.push(this.jewelBlocker(j));
    }
    return out;
  }
  /** Does a candidate pose collide with any blocker? Contact (edges touching) is allowed. */
  private hitBlocked(hit: SurfaceHit, pose: GemPose, blockers: Blocker[]): boolean {
    if (!blockers.length) return false;
    const me = this.blockerAt(hit.point, hit.normal, pose);
    return blockers.some((b) => outlinesOverlap(me, b));
  }
  /** The proposed spot, or the nearest free spot on the enamel around it
      (spiral search in the tangent plane, re-snapped by raycast). Null = no room. */
  private findFreeSpot(startHit: SurfaceHit, pose: GemPose, blockers: Blocker[]): SurfaceHit | null {
    if (!this.hitBlocked(startHit, pose, blockers)) return startHit;
    const n = startHit.normal.clone().normalize();
    const t = new THREE.Vector3(-n.z, 0, n.x);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    const u = new THREE.Vector3().crossVectors(t, n).normalize();
    // fine rings first, so a piece settles right against its neighbour
    for (let step = 0.3; step <= 4.2; step += 0.3) {
      const around = step < 1.5 ? 12 : 16;
      for (let k = 0; k < around; k++) {
        const a = (k / around) * Math.PI * 2;
        const cand = startHit.point
          .clone()
          .addScaledVector(t, Math.cos(a) * step)
          .addScaledVector(u, Math.sin(a) * step);
        const snapped = this.snapToSurface(cand, n);
        if (!snapped) continue;
        if (!this.hitBlocked(snapped, pose, blockers)) return snapped;
      }
    }
    return null;
  }
  /** Walking from a free spot toward a blocked one, the last free spot before
      contact (bisection, re-snapped onto the enamel). Null = no free start. */
  private closestFreeAlong(from: SurfaceHit | null, to: SurfaceHit, pose: GemPose, blockers: Blocker[]): SurfaceHit | null {
    return this.lastAcceptedAlong(from, to, (hit) => !this.hitBlocked(hit, pose, blockers));
  }
  /** Walking from an accepted spot toward a refused one, the last spot `accept` still takes (bisection, re-snapped). */
  private lastAcceptedAlong(from: SurfaceHit | null, to: SurfaceHit, accept: (hit: SurfaceHit) => boolean): SurfaceHit | null {
    if (!from) return null;
    let free = from,
      lo = 0,
      hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const p = from.point.clone().lerp(to.point, mid);
      const n = from.normal.clone().lerp(to.normal, mid).normalize();
      const snapped = this.snapToSurface(p, n);
      if (snapped && accept(snapped)) {
        free = snapped;
        lo = mid;
      } else hi = mid;
    }
    return free;
  }
  /** Collision check for a fresh library placement at its default size. */
  private placementBlocked(hit: SurfaceHit, typeId: string): boolean {
    const def = JEWELRY_BY_ID[typeId];
    return this.hitBlocked(hit, { typeId, scale: def.defaultScale, offset: 0, rotation: 0 }, this.blockersFor(new Set()));
  }
  /** Collision-aware duplication: each copy slides to the nearest free spot. */
  duplicateSelection(ids: string[]): number {
    const srcs = this.store.jewels.filter((j) => ids.includes(j.id));
    if (!srcs.length) return 0;
    const blockers = this.blockersFor(new Set()); // every existing piece blocks the copies
    const copies: PlacedJewelry[] = [];
    for (const src of srcs) {
      const nrm = new THREE.Vector3(src.normal.x, src.normal.y, src.normal.z).normalize();
      const tDir = new THREE.Vector3(-nrm.z, 0, nrm.x);
      if (tDir.lengthSq() < 1e-6) tDir.set(1, 0, 0);
      tDir.normalize();
      const nudged = new THREE.Vector3(src.position.x, src.position.y, src.position.z).addScaledVector(tDir, 1.4);
      const startHit = this.snapToSurface(nudged, nrm) ?? {
        toothId: src.toothId,
        point: new THREE.Vector3(src.position.x, src.position.y, src.position.z),
        normal: nrm,
      };
      const free = this.findFreeSpot(startHit, poseOf(src), blockers);
      if (!free) continue; // no room for this copy
      const copy: PlacedJewelry = {
        ...src,
        id: uid(),
        toothId: free.toothId,
        position: v3(free.point.x, free.point.y, free.point.z),
        normal: v3(free.normal.x, free.normal.y, free.normal.z),
      };
      copies.push(copy);
      blockers.push(this.jewelBlocker(copy));
    }
    return this.store.insertJewels(copies);
  }
  /**
   * Duplicate each piece straight to its mirror image, turned like a
   * reflection (see `mirroredSpot`): 'h' gives the other half of a symmetric
   * smile, 'v' the matching piece on the other arch. A copy whose mirrored spot
   * is taken slides to the nearest free one; the originals stay put. The
   * copies become the selection, in one undo step.
   */
  duplicateMirrored(ids: string[], axis: "h" | "v" = "h"): number {
    const srcs = this.store.jewels.filter((j) => ids.includes(j.id));
    if (!srcs.length) return 0;
    const blockers = this.blockersFor(new Set()); // every existing piece blocks the copies
    const copies: PlacedJewelry[] = [];
    for (const src of srcs) {
      const rotation = mirroredRotation(src.rotation, axis);
      const pose = { ...poseOf(src), rotation };
      const proposed = this.mirroredSpot(src, axis);
      if (!proposed) continue; // no enamel at the mirrored spot
      const free = this.findFreeSpot(proposed, pose, blockers);
      if (!free) continue; // no room for this copy
      const copy: PlacedJewelry = {
        ...src,
        id: uid(),
        toothId: free.toothId,
        position: v3(free.point.x, free.point.y, free.point.z),
        normal: v3(free.normal.x, free.normal.y, free.normal.z),
        rotation,
      };
      copies.push(copy);
      blockers.push(this.jewelBlocker(copy));
    }
    return this.store.insertJewels(copies);
  }
  /** Place a library piece without a pointer (keyboard): the tooth's labial centre, or the nearest free spot. */
  placeOnTooth(typeId: string, toothId: string): boolean {
    const def = JEWELRY_BY_ID[typeId];
    if (!def || !this.toothRigs.has(toothId)) return false;
    const anchor = this.getSurfacePoint(toothId, 0, 0);
    const free = this.findFreeSpot(anchor, { typeId, scale: def.defaultScale, offset: 0, rotation: 0 }, this.blockersFor(new Set()));
    if (!free) return false;
    this.store.addJewel(
      typeId,
      free.toothId,
      v3(free.point.x, free.point.y, free.point.z),
      v3(free.normal.x, free.normal.y, free.normal.z),
    );
    return true;
  }
  /** Move one piece to a tooth (inspector dropdown) — slides to a free spot. */
  relocateJewelToTooth(id: string, toothId: string): boolean {
    const j = this.store.jewels.find((x) => x.id === id);
    if (!j || !this.toothRigs.has(toothId)) return false;
    const anchor = this.getSurfacePoint(toothId, 0, 0);
    const blockers = this.blockersFor(new Set([id]));
    const free = this.findFreeSpot(anchor, poseOf(j), blockers);
    if (!free) return false;
    this.store.pushHistory();
    this.store.updateJewel(id, {
      toothId: free.toothId,
      position: v3(free.point.x, free.point.y, free.point.z),
      normal: v3(free.normal.x, free.normal.y, free.normal.z),
    });
    return true;
  }

  /* ---------- layout operations (collision-aware) ---------- */

  /**
   * Where a piece lands mirrored, re-snapped onto the enamel. 'h' reflects
   * across the arch midline (x = 0; 11 ↔ 21…). 'v' reflects across the bite
   * onto the matching tooth of the other arch (11 ↔ 41, 21 ↔ 31…), at the same
   * place relative to that crown: near the biting edge stays near the biting
   * edge. On a model with one arch only, 'v' flips the piece on its own tooth
   * instead (biting edge ↔ gum line). Null: no enamel there ('v' only; 'h'
   * keeps its historical unsnapped fallback).
   */
  private mirroredSpot(j: PlacedJewelry, axis: "h" | "v"): SurfaceHit | null {
    const p = new THREE.Vector3(j.position.x, j.position.y, j.position.z);
    const n = new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z).normalize();
    if (axis === "h") {
      const mp = new THREE.Vector3(-p.x, p.y, p.z);
      const mn = new THREE.Vector3(-n.x, n.y, n.z);
      return this.snapToSurface(mp, mn) ?? { toothId: j.toothId, point: mp, normal: mn };
    }
    const src = this.toothRigs.get(j.toothId) ?? this.nearestRig(p);
    if (!src) return null;
    const dst = this.toothRigs.get(opposingTooth(src.id)) ?? src;
    // In each crown's own frame: along the arch, up, outward — scaled to the target crown.
    const rel = p.clone().sub(src.center);
    const along = rel.dot(src.tangent) * (dst.spec.wHalf / src.spec.wHalf);
    const up = -rel.y * (dst.spec.hHalf / src.spec.hHalf);
    const out = rel.dot(src.outward) * (dst.spec.dHalf / src.spec.dHalf);
    const point = dst.center.clone().addScaledVector(dst.tangent, along).addScaledVector(_UP, up).addScaledVector(dst.outward, out);
    const normal = new THREE.Vector3()
      .addScaledVector(dst.tangent, n.dot(src.tangent))
      .addScaledVector(_UP, -n.y)
      .addScaledVector(dst.outward, n.dot(src.outward))
      .normalize();
    return this.snapToSurface(point, normal);
  }
  /** Mirror the current selection in place (see `mirroredSpot` for each axis). One undo step. */
  mirrorSelection(axis: "h" | "v"): MoveResult | null {
    const ids = [...this.store.getSnapshot().selectedJewelIds];
    const affected = this.store.jewels.filter((j) => ids.includes(j.id));
    if (!affected.length) return null;
    const blockers = this.blockersFor(new Set(ids));
    const updates: { id: string; patch: Partial<PlacedJewelry> }[] = [];
    let skipped = 0;
    for (const j of affected) {
      const rotation = mirroredRotation(j.rotation, axis);
      const proposed = this.mirroredSpot(j, axis);
      const pose = { ...poseOf(j), rotation };
      const free = proposed && this.findFreeSpot(proposed, pose, blockers);
      if (!free) {
        skipped++;
        continue;
      }
      updates.push({
        id: j.id,
        patch: {
          toothId: free.toothId,
          position: v3(free.point.x, free.point.y, free.point.z),
          normal: v3(free.normal.x, free.normal.y, free.normal.z),
          rotation,
        },
      });
      blockers.push(this.blockerAt(free.point, free.normal, pose));
    }
    if (!updates.length) return { moved: 0, skipped };
    this.store.pushHistory();
    this.store.applyPatches(updates);
    return { moved: updates.length, skipped };
  }
  /** Distribute the selected pieces evenly between the two outermost ones,
       moving each along the arch tangent and re-snapping onto the enamel. */
  distributeSelectionAlongArch(): MoveResult | null {
    const ids = [...this.store.getSnapshot().selectedJewelIds];
    const gems = this.store.jewels.filter((j) => ids.includes(j.id));
    if (gems.length < 3) return null;
    const centers = this.archCenters();
    const keyed = gems
      .map((j) => {
        const p = new THREE.Vector3(j.position.x, j.position.y, j.position.z);
        const rig = this.toothRigs.get(j.toothId) ?? this.nearestRig(p);
        let key = p.x,
          tangent = new THREE.Vector3(1, 0, 0);
        if (rig) {
          const idx = parseInt(rig.id[1], 10) - 1;
          const side = rig.id[0] === "1" || rig.id[0] === "4" ? -1 : 1; // patient's right: viewer's left
          key = centers[idx] * side + p.clone().sub(rig.center).dot(rig.tangent);
          tangent = rig.tangent;
        }
        return { j, key, tangent };
      })
      .sort((a, b) => a.key - b.key);
    const k0 = keyed[0].key,
      k1 = keyed[keyed.length - 1].key;
    if (k1 - k0 < 0.01) return null;
    // the two outermost pieces stay fixed and block; only the middles move
    const blockers = this.blockersFor(new Set(keyed.slice(1, -1).map((k) => k.j.id)));
    const updates: { id: string; patch: Partial<PlacedJewelry> }[] = [];
    let skipped = 0;
    keyed.forEach((k, i) => {
      if (i === 0 || i === keyed.length - 1) return;
      const target = k0 + (k1 - k0) * (i / (keyed.length - 1));
      const moved = new THREE.Vector3(k.j.position.x, k.j.position.y, k.j.position.z).addScaledVector(k.tangent, target - k.key);
      const nrm = new THREE.Vector3(k.j.normal.x, k.j.normal.y, k.j.normal.z);
      const snapped = this.snapToSurface(moved, nrm);
      if (!snapped) {
        skipped++;
        return;
      }
      const free = this.findFreeSpot(snapped, poseOf(k.j), blockers);
      if (!free) {
        skipped++;
        return;
      }
      updates.push({
        id: k.j.id,
        patch: {
          toothId: free.toothId,
          position: v3(free.point.x, free.point.y, free.point.z),
          normal: v3(free.normal.x, free.normal.y, free.normal.z),
        },
      });
      blockers.push(this.blockerAt(free.point, free.normal, poseOf(k.j)));
    });
    if (!updates.length) return { moved: 0, skipped };
    this.store.pushHistory();
    this.store.applyPatches(updates);
    return { moved: updates.length, skipped };
  }
  /**
   * Line the selected pieces up on one horizontal line, each arch on its own
   * (see `alignedHeights`). Pieces only move up or down — never toward the
   * middle of their tooth. A piece whose spot on that line is off the enamel
   * or taken stays where it is, so the others never end up off the line.
   */
  alignSelectionHorizontally(): MoveResult | null {
    const ids = [...this.store.getSnapshot().selectedJewelIds];
    const gems = this.store.jewels.filter((j) => ids.includes(j.id));
    if (gems.length < 2) return null;
    const posOf = (j: PlacedJewelry) => new THREE.Vector3(j.position.x, j.position.y, j.position.z);
    const rigOf = (j: PlacedJewelry) => this.toothRigs.get(j.toothId) ?? this.nearestRig(posOf(j));
    const targets = alignedHeights(gems.map((j) => ({ id: j.id, y: j.position.y, lower: rigOf(j)?.lower ?? false })));
    if (!targets.size) return null;

    // Where each piece would land: straight up or down, snapped back onto the
    // enamel by a horizontal ray so the hit stays exactly on the line. A hit
    // far from the piece, or on the other arch (past the biting edge, the ray
    // can reach the teeth behind), means that height is off this crown.
    const planned = new Map<string, SurfaceHit>();
    let skipped = 0;
    for (const j of gems) {
      const y = targets.get(j.id);
      if (y === undefined || Math.abs(y - j.position.y) < 1e-4) continue;
      const lower = rigOf(j)?.lower ?? false;
      const dir = new THREE.Vector3(j.normal.x, 0, j.normal.z);
      if (dir.lengthSq() < 1e-6) dir.copy(rigOf(j)?.outward ?? _Z).setY(0);
      if (dir.lengthSq() < 1e-6) dir.copy(_Z);
      const start = new THREE.Vector3(j.position.x, y, j.position.z);
      const hit = this.snapToSurface(start, dir.normalize());
      const onArch = hit && (this.toothRigs.get(hit.toothId)?.lower ?? false) === lower;
      if (hit && onArch && hit.point.distanceTo(start) < ALIGN_MAX_DRIFT) planned.set(j.id, hit);
      else skipped++;
    }

    // Pieces that stay put block the ones that move; drop any move that would
    // overlap, until every accepted move is clear.
    const outside = this.blockersFor(new Set(ids));
    for (let changed = true; changed; ) {
      changed = false;
      const blockers = [...outside, ...gems.filter((j) => !planned.has(j.id)).map((j) => this.jewelBlocker(j))];
      for (const j of gems) {
        const hit = planned.get(j.id);
        if (!hit) continue;
        if (this.hitBlocked(hit, poseOf(j), blockers)) {
          planned.delete(j.id);
          skipped++;
          changed = true;
          break;
        }
        blockers.push(this.blockerAt(hit.point, hit.normal, poseOf(j)));
      }
    }
    if (!planned.size) return { moved: 0, skipped };
    this.store.pushHistory();
    this.store.applyPatches(
      [...planned].map(([id, hit]) => ({
        id,
        patch: {
          toothId: hit.toothId,
          position: v3(hit.point.x, hit.point.y, hit.point.z),
          normal: v3(hit.normal.x, hit.normal.y, hit.normal.z),
        },
      })),
    );
    return { moved: planned.size, skipped };
  }
  /**
   * Bring every selected piece to the middle of its tooth: half-way up the
   * crown and in the middle across it. Pieces sharing a tooth are centred as
   * a cluster and keep their spacing (see `centeredOffsets`).
   */
  centerSelectionOnTeeth(ids: string[]): MoveResult | null {
    const gems = this.store.jewels.filter((j) => ids.includes(j.id));
    if (!gems.length) return null;
    const rigs = new Map<string, ToothRig>();
    const offsets: CenterItem[] = [];
    for (const j of gems) {
      const p = new THREE.Vector3(j.position.x, j.position.y, j.position.z);
      const rig = this.toothRigs.get(j.toothId) ?? this.nearestRig(p);
      if (!rig) continue;
      rigs.set(j.id, rig);
      offsets.push({ id: j.id, toothId: rig.id, offset: p.sub(rig.center).dot(rig.tangent) });
    }
    const centred = centeredOffsets(offsets);
    const blockers = this.blockersFor(new Set(ids));
    const updates: { id: string; patch: Partial<PlacedJewelry> }[] = [];
    let skipped = 0;
    for (const j of gems) {
      const rig = rigs.get(j.id);
      if (!rig) {
        skipped++;
        continue;
      }
      const u = clamp((centred.get(j.id) ?? 0) / (rig.spec.wHalf * 0.6), -1, 1);
      const anchor = this.getSurfacePoint(rig.id, u, 0);
      const free = this.findFreeSpot(anchor, poseOf(j), blockers);
      if (!free) {
        skipped++;
        continue;
      }
      updates.push({
        id: j.id,
        patch: {
          toothId: free.toothId,
          position: v3(free.point.x, free.point.y, free.point.z),
          normal: v3(free.normal.x, free.normal.y, free.normal.z),
        },
      });
      blockers.push(this.blockerAt(free.point, free.normal, poseOf(j)));
    }
    if (!updates.length) return { moved: 0, skipped };
    this.store.pushHistory();
    this.store.applyPatches(updates);
    return { moved: updates.length, skipped };
  }
  /** Anchor point on a tooth's labial face (u: -1..1 across, v: -1..1 vertical), refined by raycast. */
  getSurfacePoint(toothId: string, u: number, v: number): SurfaceHit {
    const rig = this.toothRigs.get(toothId)!;
    const spec = rig.spec;
    let origin: THREE.Vector3, dir: THREE.Vector3;
    if (rig.imported) {
      origin = rig.center
        .clone()
        .addScaledVector(rig.tangent, u * spec.wHalf * 0.6)
        .addScaledVector(_UP, v * spec.hHalf * 0.55)
        .addScaledVector(rig.outward, spec.dHalf * 2 + 6);
      dir = rig.outward.clone().negate();
    } else {
      const local = new THREE.Vector3(u * spec.wHalf * 0.6, v * spec.hHalf * 0.5, spec.dHalf * 2.5);
      origin = rig.mesh.localToWorld(local.clone());
      dir = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.mesh.getWorldQuaternion(_q3)).normalize().negate();
    }
    this.raycaster.set(origin, dir);
    this.raycaster.far = 80;
    const hits = this.raycaster.intersectObject(rig.mesh, true);
    this.raycaster.far = Infinity;
    if (hits.length) {
      const h = hits[0];
      const n = geometricWorldNormal(h, dir).clone();
      return { toothId, point: h.point.clone(), normal: n };
    }
    return { toothId, point: origin.clone().addScaledVector(dir, spec.dHalf * 2), normal: dir.clone().negate() };
  }
  /** Where a piece sits on its tooth, as translation keys (`studio.editor.surface.*`). Works for all models. */
  describeSurface(
    j: PlacedJewelry,
  ): { third: "incisal" | "middle" | "cervical"; face: "labial" | "palatal" | "incisal" | "cervical" | "proximal" } | null {
    const rig = this.toothRigs.get(j.toothId);
    if (!rig) return null;
    const rel = new THREE.Vector3(j.position.x, j.position.y, j.position.z).sub(rig.center);
    // Toward the biting edge is down on the upper arch, up on the lower one.
    const edgeward = rig.lower ? 1 : -1;
    const ty = (rel.y * edgeward) / rig.spec.hHalf;
    const third = ty > 0.33 ? "incisal" : ty < -0.33 ? "cervical" : "middle";
    const n = new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z);
    const dOut = n.dot(rig.outward);
    const dUp = -n.y * edgeward;
    const face = dOut > 0.45 ? "labial" : dOut < -0.45 ? "palatal" : dUp < -0.5 ? "incisal" : dUp > 0.5 ? "cervical" : "proximal";
    return { third, face };
  }

  /* ---------- jewel pose & rigs ---------- */

  private poseObject(
    obj: THREE.Object3D,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    rotationDeg: number,
    halfDepth: number,
    scale: number,
    manualOffset = 0,
  ) {
    _nn.copy(normal).normalize();
    _q1.setFromUnitVectors(_Z, _nn);
    _q2.setFromAxisAngle(_Z, THREE.MathUtils.degToRad(rotationDeg));
    obj.quaternion.copy(_q1).multiply(_q2);
    obj.position.copy(point).addScaledVector(_nn, halfDepth * scale + mountGap(scale, manualOffset));
  }
  private applyPose(group: THREE.Group, j: PlacedJewelry, halfDepth: number) {
    _p.set(j.position.x, j.position.y, j.position.z);
    _n.set(j.normal.x, j.normal.y, j.normal.z);
    this.poseObject(group, _p, _n, j.rotation, halfDepth, j.scale, j.offset ?? 0);
  }
  private buildRigContent(rig: JewelRig, j: PlacedJewelry) {
    this.unregisterMeshes(rig);
    rig.content.clear();
    rig.outline.clear();
    const def = JEWELRY_BY_ID[j.jewelryTypeId];
    const tpl = getJewelTemplate(def.geometry);
    const material = getJewelMaterial(j); // shared, cached — never disposed per rig
    rig.meshes = tpl.parts.map((g) => {
      const m = new THREE.Mesh(g, material);
      m.castShadow = true;
      m.userData.jewelId = rig.id;
      rig.content.add(m);
      return m;
    });
    const outline = rig.content.clone(true);
    outline.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = rig.outlineMaterial;
        m.castShadow = false;
        (m as unknown as { raycast: () => void }).raycast = () => {};
      }
    });
    outline.scale.setScalar(1.16);
    rig.outline.add(outline);
    rig.material = material;
    rig.matKey = matKeyFor(j);
    rig.typeId = j.jewelryTypeId;
    rig.halfDepth = tpl.halfDepth;
    rig.radius = tpl.radius;
    this.jewelMeshes.push(...rig.meshes);
  }
  private createJewelRig(j: PlacedJewelry): JewelRig {
    const rig: JewelRig = {
      id: j.id,
      group: new THREE.Group(),
      content: new THREE.Group(),
      outline: new THREE.Group(),
      meshes: [],
      material: null,
      outlineMaterial: new THREE.MeshBasicMaterial({
        color: OUTLINE_COLOR,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
      }),
      typeId: "",
      matKey: "",
      halfDepth: 0.5,
      radius: 0.8,
      sizeScale: 1,
      birth: 0,
      death: 0,
      hoverT: 0,
    };
    rig.group.add(rig.content, rig.outline);
    this.buildRigContent(rig, j);
    return rig;
  }
  private unregisterMeshes(rig: JewelRig) {
    this.jewelMeshes = this.jewelMeshes.filter((m) => m.userData.jewelId !== rig.id);
  }
  private syncJewels = () => {
    const jewels = this.store.jewels;
    const seen = new Set<string>();
    for (const j of jewels) {
      seen.add(j.id);
      let rig = this.jewelRigs.get(j.id);
      const mk = matKeyFor(j);
      if (!rig) {
        rig = this.createJewelRig(j);
        this.jewelRigs.set(j.id, rig);
        this.jewelsGroup.add(rig.group);
        rig.birth = performance.now();
      } else if (rig.typeId !== j.jewelryTypeId) {
        this.buildRigContent(rig, j);
      } else if (rig.matKey !== mk) {
        const material = getJewelMaterial(j);
        rig.meshes.forEach((m) => {
          m.material = material;
        });
        rig.material = material;
        rig.matKey = mk;
      }
      rig.sizeScale = j.scale;
      if (!this.isDragged(rig)) this.applyPose(rig.group, j, rig.halfDepth);
    }
    for (const [id, rig] of Array.from(this.jewelRigs)) {
      if (!seen.has(id)) {
        this.jewelRigs.delete(id);
        this.unregisterMeshes(rig);
        rig.death = performance.now();
        this.dyingJewels.push(rig);
      }
    }
  };
  private onStoreChange = () => {
    this.syncJewels();
    this.checkDesign();
    this.wake();
    // A saved scene was just put on the stage: settle it once this commit is over.
    if (this.store.hasPendingLoad()) queueMicrotask(() => this.settlePendingLoad());
  };
  /** Keep drawing for the settle period: something on screen may change. */
  private wake = () => {
    this.pendingFrames = SETTLE_FRAMES;
  };

  /* ---------- input ---------- */

  private onPointerDown = (e: PointerEvent) => {
    if (this.placing) return;
    // One loop at a time: a second finger while drawing must not pinch the camera either.
    if (this.lasso) {
      e.stopPropagation();
      return;
    }
    if (this.camTween) {
      this.camTween = null;
      this.controls.enabled = true;
      this.controls.update();
    }
    // Viewing only: every press belongs to the camera.
    if (this.readOnly) return;
    if (e.button === 0 && this.store.getSnapshot().lasso) {
      // Before the piece test: a loop may well start on a piece, and must not drag it.
      e.stopPropagation();
      this.controls.enabled = false;
      this.clearHover();
      const r = this.container.getBoundingClientRect();
      this.lasso = {
        pointerId: e.pointerId,
        originX: r.left,
        originY: r.top,
        points: [{ x: e.clientX - r.left, y: e.clientY - r.top }],
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
      };
      this.emitLasso();
      return;
    }
    if (e.button !== 0) {
      this.press = null;
      this.mode = "idle";
      return;
    }
    this.setNDC(e);
    const jHit = this.raycastJewels();
    if (jHit) {
      e.stopPropagation(); // pre-empt OrbitControls: this press belongs to the jewel
      this.controls.enabled = false;
      // The hover swell is a preview: once the piece is in hand it shows its real size, at once.
      const rig = this.jewelRigs.get(jHit.jewelId);
      if (rig) rig.hoverT = 0;
      this.hoverJewelId = null;
      this.wake();
      this.mode = "jewel-press";
      this.press = { jewelId: jHit.jewelId, x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    const tHit = this.raycastTeeth();
    if (tHit && this.store.getSnapshot().armedTypeId) {
      e.stopPropagation();
      this.controls.enabled = false;
      this.mode = "armed-press";
      this.press = { toothId: tHit.toothId, x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    this.mode = tHit ? "tooth-press" : "bg-press";
    this.press = { toothId: tHit?.toothId, x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.placing) {
      this.updatePlacing(e);
      return;
    }
    if (this.lasso) {
      const l = this.lasso;
      if (e.pointerId !== l.pointerId || l.points.length >= LASSO_MAX_POINTS) return;
      const p = { x: e.clientX - l.originX, y: e.clientY - l.originY };
      const last = l.points[l.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < LASSO_STEP) return;
      l.points.push(p);
      this.emitLasso();
      return;
    }
    if (!this.press) {
      this.updateHover(e);
      return;
    }
    const moved = Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 5;
    if (this.mode === "jewel-press" && moved) {
      const rig = this.jewelRigs.get(this.press.jewelId!);
      if (rig) {
        this.store.pushHistory();
        this.beginDrag(rig);
        this.mode = "drag-jewel";
      } else this.mode = "idle";
    }
    if (this.mode === "drag-jewel") {
      this.setNDC(e);
      const hit = this.raycastTeeth();
      let blocked = false;
      if (hit) {
        this.setHoverTooth(hit.toothId);
        const drag = this.dragJewel;
        const j = drag ? this.store.jewels.find((x) => x.id === drag.id) : undefined;
        if (drag && j && this.dragFollowers.length) blocked = this.dragGroupTo(drag, j, hit);
        else if (drag && j) {
          // the piece can never enter another piece — over an occupied spot it
          // slides up to the contact point, then holds there
          const pose = poseOf(j);
          const blockers = this.blockersFor(new Set([j.id]));
          blocked = this.hitBlocked(hit, pose, blockers);
          const reached = blocked ? this.closestFreeAlong(this.dragLastHit, hit, pose, blockers) : hit;
          if (reached) {
            this.dragLastHit = reached;
            this.poseObject(drag.group, reached.point, reached.normal, j.rotation, drag.halfDepth, j.scale, j.offset ?? 0);
          }
        }
      }
      this.setCursor(blocked ? "not-allowed" : "grabbing");
      return;
    }
    if (this.mode === "bg-press" && moved) {
      this.clearHover();
      this.setCursor("grabbing");
      return;
    }
    if (this.mode === "tooth-press" && moved) {
      this.clearHover();
      this.setCursor("grabbing");
      return;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.placing) {
      this.finishPlacing(e);
      return;
    }
    if (this.lasso) {
      if (e.pointerId !== this.lasso.pointerId) return;
      if (e.type === "pointercancel") this.cancelLasso();
      else this.finishLasso();
      return;
    }
    const quick =
      !!this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 6 && performance.now() - this.press.t < 450;
    if (this.mode === "drag-jewel" && this.dragJewel) {
      if (this.dragLastHit) {
        // last collision-free pose, for the piece in hand and every piece carried with it
        const spot = (hit: SurfaceHit): Partial<PlacedJewelry> => ({
          toothId: hit.toothId,
          position: v3(hit.point.x, hit.point.y, hit.point.z),
          normal: v3(hit.normal.x, hit.normal.y, hit.normal.z),
        });
        this.store.applyPatches([
          { id: this.dragJewel.id, patch: spot(this.dragLastHit) },
          ...Array.from(this.dragFollowerSpots, ([id, hit]) => ({ id, patch: spot(hit) })),
        ]);
      }
      this.endDrag();
    } else if (this.mode === "jewel-press" && quick && this.press?.jewelId) {
      // Shift/Ctrl-click toggles the piece into/out of the multi-selection
      this.store.selectJewel(this.press.jewelId, { toggle: e.shiftKey || e.ctrlKey || e.metaKey });
    } else if (this.mode === "armed-press" && quick) {
      this.setNDC(e);
      const hit = this.raycastTeeth();
      if (hit) this.placeJewel(this.store.getSnapshot().armedTypeId!, hit);
    } else if (this.mode === "tooth-press" && quick && this.press?.toothId) {
      this.store.selectTooth(this.press.toothId);
    } else if (this.mode === "bg-press" && quick) {
      this.store.deselect();
    }
    this.press = null;
    this.mode = "idle";
    this.controls.enabled = !this.camTween;
    this.updateHover(e);
  };

  /**
   * Take a piece in hand. When it belongs to a multi-selection, the whole
   * selection comes along (see `dragGroupTo`) and stays selected; otherwise
   * the piece is dragged alone and becomes the selection.
   */
  private beginDrag(rig: JewelRig) {
    const spotOf = (j: PlacedJewelry): SurfaceHit => ({
      toothId: j.toothId,
      point: new THREE.Vector3(j.position.x, j.position.y, j.position.z),
      normal: new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z).normalize(),
    });
    const j = this.store.jewels.find((x) => x.id === rig.id);
    this.dragJewel = rig;
    // the piece's current spot is the first collision-free pose to slide from
    this.dragLastHit = j ? spotOf(j) : null;
    this.dragStart = this.dragLastHit;
    const sel = this.store.getSnapshot().selectedJewelIds;
    if (!j || sel.length < 2 || !sel.includes(rig.id)) {
      this.store.selectJewel(rig.id);
      return;
    }
    for (const f of this.store.jewels) {
      const followerRig = this.jewelRigs.get(f.id);
      if (f.id === rig.id || !followerRig || !sel.includes(f.id)) continue;
      const start = spotOf(f);
      this.dragFollowers.push({ rig: followerRig, pose: poseOf(f), start });
      this.dragFollowerSpots.set(f.id, start);
    }
  }
  /**
   * Move a group drag toward the spot under the pointer: the piece in hand
   * goes there and the others shift by the same amount, each set back onto
   * the enamel, so the arrangement keeps its shape. The group never enters a
   * piece outside it nor leaves the teeth: it slides up to the last spot
   * where all of it fits, then holds. Returns whether it was held back.
   */
  private dragGroupTo(lead: JewelRig, j: PlacedJewelry, hit: SurfaceHit): boolean {
    const start = this.dragStart;
    if (!start) return true;
    const leadPose = poseOf(j);
    const blockers = this.blockersFor(new Set([lead.id, ...this.dragFollowers.map((f) => f.rig.id)]));
    const found = { spots: null as Map<string, SurfaceHit> | null };
    // Every piece must rest on the enamel (not in a gap between teeth) and stay clear of the pieces left behind.
    const fits = (at: SurfaceHit) => {
      if (!this.seatedAt(at.point, at.normal) || this.hitBlocked(at, leadPose, blockers)) return false;
      const delta = at.point.clone().sub(start.point);
      const spots = new Map<string, SurfaceHit>();
      for (const f of this.dragFollowers) {
        const spot = this.snapToSurface(f.start.point.clone().add(delta), f.start.normal);
        if (!spot || !this.seatedAt(spot.point, spot.normal) || this.hitBlocked(spot, f.pose, blockers)) return false;
        spots.set(f.rig.id, spot);
      }
      found.spots = spots;
      return true;
    };
    const blocked = !fits(hit);
    const reached = blocked ? this.lastAcceptedAlong(this.dragLastHit, hit, fits) : hit;
    if (!reached) return blocked;
    this.dragLastHit = reached;
    if (found.spots) this.dragFollowerSpots = found.spots;
    this.poseObject(lead.group, reached.point, reached.normal, j.rotation, lead.halfDepth, j.scale, j.offset ?? 0);
    for (const f of this.dragFollowers) {
      const spot = this.dragFollowerSpots.get(f.rig.id);
      if (spot) this.poseObject(f.rig.group, spot.point, spot.normal, f.pose.rotation, f.rig.halfDepth, f.pose.scale, f.pose.offset);
    }
    return blocked;
  }
  private endDrag() {
    this.dragJewel = null;
    this.dragLastHit = null;
    this.dragStart = null;
    this.dragFollowers = [];
    this.dragFollowerSpots = new Map();
  }
  private isDragged(rig: JewelRig): boolean {
    return this.dragJewel === rig || this.dragFollowers.some((f) => f.rig === rig);
  }

  /** Right-click on a piece → context menu. Empty right-clicks fall through
      to OrbitControls (pan) as before. */
  private onContextMenu = (e: MouseEvent) => {
    if (this.readOnly || e.target !== this.renderer.domElement) return;
    if (this.placing) {
      this.cancelPlacing();
      e.preventDefault();
      return;
    }
    this.setNDC(e);
    const jHit = this.raycastJewels();
    if (!jHit) return; // no piece under the cursor — keep OrbitControls' pan behaviour
    e.preventDefault();
    const sel = this.store.getSnapshot().selectedJewelIds;
    if (!(sel.includes(jHit.jewelId) && sel.length > 1)) this.store.selectJewel(jHit.jewelId);
    const r = this.container.getBoundingClientRect();
    this.store.openContextMenu(jHit.jewelId, e.clientX - r.left, e.clientY - r.top);
  };

  private onBlur = () => {
    if (this.placing) this.cancelPlacing();
    this.cancelLasso();
  };

  private updateHover(e: PointerEvent) {
    // Nothing on a viewed design can be picked up: no hover swell, no grab cursor.
    if (this.readOnly) return;
    const before = this.hoverJewelId;
    this.updateHoverTargets(e);
    // A piece's hover glow is drawn by the engine alone (no store change), so it wakes the loop itself.
    if (this.hoverJewelId !== before) this.wake();
  }
  private updateHoverTargets(e: PointerEvent) {
    const overCanvas = e.target instanceof Node && this.container.contains(e.target);
    if (!overCanvas) {
      this.clearHover();
      return;
    }
    if (this.store.getSnapshot().lasso) {
      // The lasso draws anywhere: no piece or tooth reacts under it.
      this.hoverJewelId = null;
      this.setHoverTooth(null);
      this.setCursor("crosshair");
      return;
    }
    this.setNDC(e);
    const jHit = this.raycastJewels();
    if (jHit) {
      this.hoverJewelId = jHit.jewelId;
      this.setHoverTooth(null);
      this.setCursor("grab");
      return;
    }
    this.hoverJewelId = null;
    const tHit = this.raycastTeeth();
    if (tHit) {
      this.setHoverTooth(tHit.toothId);
      this.setCursor(this.store.getSnapshot().armedTypeId ? "crosshair" : "pointer");
    } else {
      this.setHoverTooth(null);
      this.setCursor(this.store.getSnapshot().armedTypeId ? "crosshair" : "grab");
    }
  }
  private clearHover() {
    if (this.hoverJewelId) this.wake();
    this.hoverJewelId = null;
    this.setHoverTooth(null);
  }
  private setHoverTooth(id: string | null) {
    if (this.hoverToothId !== id) {
      this.hoverToothId = id;
      this.store.setHoveredTooth(id);
    }
  }
  private setCursor(css: string) {
    this.renderer.domElement.style.cursor = css;
  }

  /* ---------- library placement (drag from panel / armed click) ---------- */

  beginPlacing(typeId: string, e: { clientX: number; clientY: number; preventDefault: () => void }) {
    if (this.placing) return;
    e.preventDefault();
    this.placing = { typeId, startX: e.clientX, startY: e.clientY, started: false };
  }
  private updatePlacing(e: PointerEvent) {
    const p = this.placing!;
    if (!p.started) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 6) {
        p.started = true;
        this.store.setPlacing(p.typeId);
        this.createGhost(p.typeId);
      } else return;
    }
    const overCanvas = e.target instanceof Node && this.container.contains(e.target);
    if (!overCanvas) {
      if (this.ghost) this.ghost.root.visible = this.ghost.ringRoot.visible = false;
      this.setHoverTooth(null);
      return;
    }
    this.setNDC(e);
    const hit = this.raycastTeeth();
    if (hit) {
      const g = this.ghost!;
      g.root.visible = g.ringRoot.visible = true;
      this.poseObject(g.root, hit.point, hit.normal, 0, g.halfDepth, JEWELRY_BY_ID[p.typeId].defaultScale, 0);
      g.ringRoot.position.copy(hit.point);
      _q1.setFromUnitVectors(_Z, _nn.copy(hit.normal).normalize());
      g.ringRoot.quaternion.copy(_q1);
      // live collision feedback: the ghost turns red over an occupied spot
      const blocked = this.placementBlocked(hit, p.typeId);
      g.material.color.setHex(blocked ? BLOCK_COLOR : g.baseColor);
      g.material.opacity = blocked ? 0.4 : 0.55;
      g.ringMaterial.color.setHex(blocked ? BLOCK_COLOR : OUTLINE_COLOR);
      this.setHoverTooth(hit.toothId);
      this.setCursor(blocked ? "not-allowed" : "grabbing");
    } else {
      if (this.ghost) this.ghost.root.visible = this.ghost.ringRoot.visible = false;
      this.setHoverTooth(null);
      this.setCursor("not-allowed");
    }
  }
  private finishPlacing(e: PointerEvent) {
    const p = this.placing!;
    if (p.started) {
      const overCanvas = e.target instanceof Node && this.container.contains(e.target);
      let hit: SurfaceHit | null = null;
      if (overCanvas) {
        this.setNDC(e);
        hit = this.raycastTeeth();
      }
      if (hit) this.placeJewel(p.typeId, hit);
      this.destroyGhost();
      this.store.setPlacing(null);
    } else {
      this.store.setArmed(this.store.getSnapshot().armedTypeId === p.typeId ? null : p.typeId);
    }
    this.placing = null;
  }
  cancelPlacing() {
    if (!this.placing) return;
    if (this.placing.started) {
      this.destroyGhost();
      this.store.setPlacing(null);
    }
    this.placing = null;
  }
  private placeJewel(typeId: string, hit: SurfaceHit) {
    if (this.placementBlocked(hit, typeId)) {
      notify("spotTaken", undefined, "warning");
      return;
    }
    this.store.addJewel(typeId, hit.toothId, v3(hit.point.x, hit.point.y, hit.point.z), v3(hit.normal.x, hit.normal.y, hit.normal.z));
  }
  private createGhost(typeId: string) {
    const def = JEWELRY_BY_ID[typeId];
    const tpl = getJewelTemplate(def.geometry);
    const spec = resolveFinishRaw(def.defaultColor);
    const baseColor = new THREE.Color(spec.hex).getHex();
    const material = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.55, depthWrite: false });
    const root = new THREE.Group();
    tpl.parts.forEach((g) => {
      const m = new THREE.Mesh(g, material);
      root.add(m);
    });
    const ringRoot = new THREE.Group();
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: OUTLINE_COLOR,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(GHOST_RING_GEO, ringMaterial);
    ringRoot.add(ring);
    root.visible = ringRoot.visible = false;
    this.scene.add(root, ringRoot);
    this.ghost = {
      root,
      ringRoot,
      ring,
      ringScale: tpl.radius * def.defaultScale * 1.4,
      halfDepth: tpl.halfDepth,
      material,
      ringMaterial,
      baseColor,
    };
  }
  private destroyGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.root, this.ghost.ringRoot);
    this.ghost.material.dispose();
    this.ghost.ringMaterial.dispose();
    this.ghost = null;
  }

  /* ---------- camera rig ---------- */

  tweenCamera(pos: THREE.Vector3, target: THREE.Vector3, dur = 700) {
    this.camTween = {
      p0: this.camera.position.clone(),
      p1: pos.clone(),
      t0: this.controls.target.clone(),
      t1: target.clone(),
      start: performance.now(),
      // Under reduced motion the camera cuts to its new framing instead of flying there.
      dur: prefersReducedMotion() ? 1 : dur,
    };
    this.wake();
    this.controls.enabled = false;
  }
  setView(view: "front" | "top" | "side" | "reset") {
    const target = this.stage.target.clone();
    const pos = target.clone().add(this.stage.views[view]);
    if (view === "reset") this.setAutoRotate(false);
    // Straight down over the reference arch shows it whole at any aspect; every other view is framed to the canvas.
    const straightDown = view === "top" && this.stage === ARCH_STAGE;
    this.tweenCamera(straightDown ? pos : this.framed(pos, target), target, this.modelReady ? 750 : 1200);
  }
  /**
   * Pull a whole-arch camera position back until the arch fits the canvas
   * width. The preset distances suit a landscape stage; a tall one (a narrow
   * window, a phone in portrait) would otherwise crop the molars.
   */
  private framed(pos: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const dir = pos.clone().sub(target);
    const halfHorizontal = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const needed = this.stage.halfWidth / Math.max(halfHorizontal, 0.05);
    const len = clamp(Math.max(dir.length(), needed), this.controls.minDistance, this.controls.maxDistance);
    return target.clone().addScaledVector(dir.normalize(), len);
  }
  focusTooth(toothId: string) {
    const rig = this.toothRigs.get(toothId);
    if (!rig) return;
    const c = rig.center.clone();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.tweenCamera(c.clone().addScaledVector(dir, 30), c, 650);
  }
  zoomBy(f: number) {
    const t = this.controls.target.clone();
    const dir = this.camera.position.clone().sub(t);
    const len = clamp(dir.length() * f, this.controls.minDistance, this.controls.maxDistance);
    this.tweenCamera(t.clone().addScaledVector(dir.normalize(), len), t, 260);
  }
  setAutoRotate(on: boolean) {
    this.autoRotate = on;
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 1.3;
  }
  getAutoRotate(): boolean {
    return this.autoRotate;
  }
  private onDblClick = (e: MouseEvent) => {
    if (this.store.getSnapshot().lasso) return; // two quick loops are not a request to focus a tooth
    this.setNDC(e);
    const jHit = this.raycastJewels();
    if (jHit) {
      const j = this.store.jewels.find((x) => x.id === jHit.jewelId);
      if (j) {
        this.focusTooth(j.toothId);
        return;
      }
    }
    const tHit = this.raycastTeeth();
    if (tHit) this.focusTooth(tHit.toothId);
  };

  /* ---------- presets & export ---------- */

  /** Build a preset's pieces on the current model; items whose tooth this model lacks are left out. */
  buildPresetJewels(items: PresetItem[]): PlacedJewelry[] {
    return items
      .filter((it) => this.toothRigs.has(it.tooth) && JEWELRY_BY_ID[it.type])
      .map((it) => {
        const hit = this.getSurfacePoint(it.tooth, it.u ?? 0, it.v ?? 0);
        return {
          id: uid(),
          jewelryTypeId: it.type,
          toothId: it.tooth,
          position: v3(hit.point.x, hit.point.y, hit.point.z),
          normal: v3(hit.normal.x, hit.normal.y, hit.normal.z),
          rotation: it.rot ?? 0,
          scale: it.scale ?? JEWELRY_BY_ID[it.type].defaultScale,
          color: it.finish ?? JEWELRY_BY_ID[it.type].defaultColor,
        };
      });
  }
  /** Clean capture of the current view (overlays + highlights hidden) —
      shared by the PNG export and the quote sheet. */
  captureView(opts: { transparent?: boolean; camera?: THREE.PerspectiveCamera } = {}): string {
    const outlineVis: boolean[] = [];
    this.jewelRigs.forEach((r) => {
      outlineVis.push(r.outline.visible);
      r.outline.visible = false;
    });
    const emSave: number[] = [];
    this.toothRigs.forEach((r) => {
      emSave.push(r.highlight);
      r.materials.forEach((m) => {
        m.emissiveIntensity = 0;
      });
    });
    const ghostVis = this.ghost ? this.ghost.root.visible : false;
    if (this.ghost) this.ghost.root.visible = this.ghost.ringRoot.visible = false;
    const bd = this.backdrop.visible,
      fl = this.floor.visible;
    if (opts.transparent) {
      this.backdrop.visible = false;
      this.floor.visible = false;
    }
    this.renderer.render(this.scene, opts.camera ?? this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    let i = 0;
    this.jewelRigs.forEach((r) => {
      r.outline.visible = outlineVis[i++];
    });
    i = 0;
    this.toothRigs.forEach((r) => {
      r.materials.forEach((m) => {
        m.emissiveIntensity = emSave[i] * 0.42;
      });
    });
    if (this.ghost) this.ghost.root.visible = this.ghost.ringRoot.visible = ghostVis;
    this.backdrop.visible = bd;
    this.floor.visible = fl;
    this.renderer.render(this.scene, this.camera);
    return url;
  }
  /** Download a PNG of the current view, watermarked with the Global Toothgems wordmark. */
  async exportPNG(transparent: boolean) {
    const c = await this.renderWatermarked(transparent);
    downloadURL(c.toDataURL("image/png"), exportFileName("png"));
  }
  /** The same watermarked PNG as the export, as a file ready for the system share sheet. */
  async shareableImage(): Promise<File> {
    const c = await this.renderWatermarked(false);
    const blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("image encode failed"))), "image/png"),
    );
    return new File([blob], exportFileName("png"), { type: "image/png" });
  }
  private async renderWatermarked(transparent: boolean): Promise<HTMLCanvasElement> {
    const url = this.captureView({ transparent });
    const [render, logo] = await Promise.all([decodeImage(url), loadWatermark()]);
    const c = document.createElement("canvas");
    c.width = render.width;
    c.height = render.height;
    const ctx = c.getContext("2d")!;
    if (!transparent) {
      const g = ctx.createRadialGradient(c.width / 2, c.height * 0.4, 0, c.width / 2, c.height * 0.4, Math.hypot(c.width, c.height) * 0.62);
      STAGE_GRADIENT.forEach(([at, color]) => g.addColorStop(at, color));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(render, 0, 0);
    if (logo) {
      const w = Math.min(c.width * 0.5, Math.max(WATERMARK.minWidth, c.width * WATERMARK.widthRatio));
      const h = (logo.height / logo.width) * w;
      const m = Math.max(12, Math.min(c.width, c.height) * WATERMARK.marginRatio);
      ctx.globalAlpha = WATERMARK.opacity;
      ctx.drawImage(logo, c.width - w - m, c.height - h - m, w, h);
      ctx.globalAlpha = 1;
    }
    return c;
  }
  exportJSON() {
    const data = {
      app: "global-toothgems-studio-3d",
      version: 1,
      exportedAt: new Date().toISOString(),
      model: EXPORT_MODEL_NAMES[this.modelMode],
      lightPreset: this.store.getSnapshot().lightPreset,
      // Indicative estimate only, in minor units — never a price to charge.
      estimate: { currency: ESTIMATE_PRICING.currency, totalMinor: estimateTotalCents(this.store.jewels) },
      camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray() },
      jewels: this.store.jewels,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadURL(url, exportFileName("json"));
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- saved creations & gem groups ---------- */

  /** Which dentition the design sits on, as a saved scene names it. */
  modelKind(): SceneModel {
    return this.modelMode;
  }
  getCameraState(): SceneCamera {
    const r = (v: number) => Math.round(v * 100) / 100;
    const p = this.camera.position;
    const t = this.controls.target;
    return { position: [r(p.x), r(p.y), r(p.z)], target: [r(t.x), r(t.y), r(t.z)] };
  }
  /**
   * Finish loading a saved scene once a model is on stage: a design saved on
   * another built-in model is re-seated tooth by tooth (`adaptDesign`), then
   * the light and — on the same model — the saved view come back. Waits, and
   * is picked up by `swapModel`, while the model is still loading.
   */
  private settlePendingLoad() {
    if (this.disposed || !this.modelReady) return;
    const load = this.store.takePendingLoad();
    if (!load) return;
    const same = (a: Vec3, b: Vec3) => a.x === b.x && a.y === b.y && a.z === b.z;
    const before = new Map(this.store.jewels.map((j) => [j.id, j]));
    const updates: { id: string; patch: Partial<PlacedJewelry> }[] = [];
    for (const j of this.adaptDesign(this.store.jewels, load.model)) {
      const old = before.get(j.id);
      if (old && (old.toothId !== j.toothId || !same(old.position, j.position) || !same(old.normal, j.normal))) {
        updates.push({ id: j.id, patch: { toothId: j.toothId, position: j.position, normal: j.normal } });
      }
    }
    this.store.settleLoadedPieces(updates, this.modelMode);
    this.setLightPreset(this.store.lightPreset);
    // A camera saved on another model frames another stage: start from the default view there.
    if (load.camera && load.model === this.modelMode) {
      const [px, py, pz] = load.camera.position;
      const [tx, ty, tz] = load.camera.target;
      this.tweenCamera(new THREE.Vector3(px, py, pz), new THREE.Vector3(tx, ty, tz), 700);
    } else this.setView("reset");
  }

  /**
   * A small JPEG of the stage for a saved creation's card: the clean capture
   * (no outlines, no highlights) on the stage's own blue, cropped to fill.
   */
  async captureThumbnail(width = 480, height = 360): Promise<string> {
    const render = await decodeImage(this.captureView({ camera: this.thumbnailCamera(width / height) }));
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(width / 2, height * 0.4, 0, width / 2, height * 0.4, Math.hypot(width, height) * 0.62);
    STAGE_GRADIENT.forEach(([at, color]) => g.addColorStop(at, color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    const scale = Math.max(width / render.width, height / render.height);
    const w = render.width * scale;
    const h = render.height * scale;
    ctx.drawImage(render, (width - w) / 2, (height - h) / 2, w, h);
    return c.toDataURL("image/jpeg", 0.82);
  }

  /**
   * A camera for the saved-design card, independent of where the artist left
   * the view: slightly above the front, centred on the pieces and pulled back
   * until they fit the card (`cardAspect`) with a little of the smile around.
   */
  private thumbnailCamera(cardAspect: number): THREE.PerspectiveCamera {
    const cam = this.camera.clone();
    const jewels = this.store.jewels;
    const box = new THREE.Box3();
    if (jewels.length) jewels.forEach((j) => box.expandByPoint(new THREE.Vector3(j.position.x, j.position.y, j.position.z)));
    else box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(24, 10, 1));
    const size = box.getSize(new THREE.Vector3());
    const target = box.getCenter(new THREE.Vector3());
    const w = Math.max(size.x + 10, 26);
    const h = Math.max(size.y + 8, w / cardAspect);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // The capture is cropped to the card from the canvas: fit both ways.
    const dist = Math.max(h / 2 / tanV, w / 2 / (tanV * Math.min(cam.aspect, cardAspect)));
    cam.position.copy(target).addScaledVector(new THREE.Vector3(0, 0.12, 1).normalize(), dist);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    return cam;
  }

  /** A tooth's local frame: its labial centre, the arch direction, up, and out of the enamel. */
  private toothFrame(toothId: string): Frame | null {
    const rig = this.toothRigs.get(toothId);
    if (!rig) return null;
    const origin = this.getSurfacePoint(toothId, 0, 0).point;
    const vec = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
    return { origin: vec(origin), tangent: vec(rig.tangent), up: { x: 0, y: 1, z: 0 }, outward: vec(rig.outward) };
  }

  /** The selected pieces as a reusable arrangement, relative to the tooth holding most of them. */
  captureGroup(ids: string[]): GemGroupData | null {
    const pieces = this.store.jewels.filter((j) => ids.includes(j.id));
    const anchor = anchorToothOf(pieces.filter((p) => this.toothRigs.has(p.toothId)));
    const frame = anchor ? this.toothFrame(anchor) : null;
    if (!anchor || !frame || pieces.length < 2) return null;
    return { version: 1, anchorToothId: anchor, pieces: piecesToGroup(pieces, frame) };
  }

  /**
   * Insert a Gem Group on a tooth (its own anchor tooth by default), keeping
   * the arrangement: each piece is mapped into that tooth's frame, re-seated
   * on the enamel and, if the spot is taken, slid to the nearest free one.
   * One undo step; the new pieces arrive selected and stay individually editable.
   */
  insertGroup(data: GemGroupData, toothId?: string | null): { placed: string[]; skipped: number } {
    const target =
      toothId && this.toothRigs.has(toothId) ? toothId : this.toothRigs.has(data.anchorToothId) ? data.anchorToothId : "11";
    const frame = this.toothFrame(target);
    if (!frame) return { placed: [], skipped: data.pieces.length };
    const blockers = this.blockersFor(new Set());
    const copies: PlacedJewelry[] = [];
    for (const { piece, position, normal } of groupToWorld(data.pieces, frame)) {
      const hit = this.snapToSurface(new THREE.Vector3(position.x, position.y, position.z), new THREE.Vector3(normal.x, normal.y, normal.z));
      if (!hit) continue;
      const pose: GemPose = { typeId: piece.jewelryTypeId, scale: piece.scale, offset: piece.offset ?? 0, rotation: piece.rotation };
      const free = this.findFreeSpot(hit, pose, blockers);
      if (!free) continue;
      const copy: PlacedJewelry = {
        id: uid(),
        jewelryTypeId: piece.jewelryTypeId,
        toothId: free.toothId,
        position: v3(free.point.x, free.point.y, free.point.z),
        normal: v3(free.normal.x, free.normal.y, free.normal.z),
        rotation: piece.rotation,
        scale: piece.scale,
        color: piece.color,
        ...(piece.customColor ? { customColor: piece.customColor } : {}),
        ...(piece.offset ? { offset: piece.offset } : {}),
      };
      copies.push(copy);
      blockers.push(this.jewelBlocker(copy));
    }
    this.store.insertJewels(copies);
    return { placed: copies.map((c) => c.id), skipped: data.pieces.length - copies.length };
  }

  /** The labelled tooth under a screen point, for dropping a Gem Group dragged from the panel. */
  toothAt(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    this.setNDC({ clientX, clientY });
    const hit = this.raycastTeeth();
    return hit && hit.toothId !== FREE_TOOTH ? hit.toothId : null;
  }
  /** Light up the tooth a dragged group would land on (null clears it). */
  previewDropTooth(toothId: string | null) {
    this.setHoverTooth(toothId);
    this.wake();
  }

  /* ---------- group turn ---------- */

  /**
   * Turn a selection as one piece: around its centre and the camera's line of
   * sight, which is the turn the customer sees on screen. Each piece travels
   * around the centre, is set back onto the enamel, and spins by the same
   * angle, so the arrangement turns rigidly. A single piece spins in place.
   * Overlaps are not prevented here; the design check reports them.
   */
  beginGroupTurn(ids: string[]): GroupTurn | null {
    const start = this.store.jewels.filter((j) => ids.includes(j.id));
    if (!start.length) return null;
    const pivot = new THREE.Vector3();
    for (const j of start) pivot.add(_p.set(j.position.x, j.position.y, j.position.z));
    pivot.divideScalar(start.length);
    const axis = this.controls.target.clone().sub(this.camera.position).normalize();
    const signs = new Map(start.map((j) => [j.id, this.screenClockwiseSign(j.id)]));
    const q = new THREE.Quaternion();
    return {
      patchesFor: (clockwiseDeg) => {
        // Seen along the line of sight, a positive turn around it is clockwise.
        q.setFromAxisAngle(axis, THREE.MathUtils.degToRad(clockwiseDeg));
        return start.map((j) => {
          const rotation = (((j.rotation + signs.get(j.id)! * clockwiseDeg) % 360) + 360) % 360;
          if (start.length === 1) return { id: j.id, patch: { rotation } };
          const normal = new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z).normalize();
          const p = new THREE.Vector3(j.position.x, j.position.y, j.position.z).sub(pivot).applyQuaternion(q).add(pivot);
          const hit = this.snapToSurface(p, normal.clone().applyQuaternion(q));
          // Off the teeth, the piece keeps its turned place and is reported by the design check.
          const at = hit ?? { toothId: j.toothId, point: p, normal };
          return {
            id: j.id,
            patch: {
              rotation,
              toothId: at.toothId,
              position: v3(at.point.x, at.point.y, at.point.z),
              normal: v3(at.normal.x, at.normal.y, at.normal.z),
            },
          };
        });
      },
    };
  }

  /* ---------- design check: overlaps and pieces off the teeth ---------- */

  /**
   * Find the pieces that overlap another one or do not sit on a tooth.
   * Placement, dragging and the layout tools never create either, but a
   * larger size, another piece type, a group turn or a design made on another
   * model can. Runs when the design or the model changes, never per frame.
   */
  private checkDesign(force = false) {
    if (!this.modelReady) return;
    const jewels = this.store.jewels;
    if (!force && jewels === this.checkedJewels) return;
    this.checkedJewels = jewels;
    const blockers = jewels.map((j) => this.jewelBlocker(j));
    const overlapping = new Set<string>();
    for (let a = 0; a < jewels.length; a++)
      for (let b = a + 1; b < jewels.length; b++)
        if (outlinesOverlap(blockers[a], blockers[b])) {
          overlapping.add(jewels[a].id);
          overlapping.add(jewels[b].id);
        }
    const issues: DesignIssue[] = [];
    for (const j of jewels) {
      const offTooth = !this.isSeated(j);
      const overlap = overlapping.has(j.id);
      if (offTooth || overlap) issues.push({ id: j.id, offTooth, overlap });
    }
    this.issueIds = new Set(issues.map((i) => i.id));
    this.lastIssueKey = "";
    this.store.setIssues(issues);
  }

  /** Does the piece rest on the enamel of a tooth — not on gum or socle, not floating off the surface? */
  private isSeated(j: PlacedJewelry): boolean {
    return this.seatedAt(new THREE.Vector3(j.position.x, j.position.y, j.position.z), new THREE.Vector3(j.normal.x, j.normal.y, j.normal.z));
  }
  /** `isSeated` for a spot: the enamel lies right under it, along its normal. */
  private seatedAt(point: THREE.Vector3, normal: THREE.Vector3): boolean {
    const n = normal.clone().normalize();
    const from = SEAT_TOLERANCE * 2;
    this.raycaster.set(point.clone().addScaledVector(n, from), n.negate());
    this.raycaster.far = from * 2;
    const hits = this.raycaster.intersectObjects(this.toothMeshes, true);
    this.raycaster.far = Infinity;
    const h = hits[0];
    if (!h || Math.abs(h.distance - from) > SEAT_TOLERANCE) return false;
    // An uncalibrated merged import cannot tell a tooth from the gum: its whole surface counts.
    return this.mergedMode || this.toothOfHit(h) !== null;
  }

  /**
   * Follow the pieces with a problem on screen, so the stage can frame them
   * in red. Called at once, then whenever a frame moves. One listener at a
   * time; returns the unsubscribe.
   */
  onIssueFrames(fn: IssueFramesListener): () => void {
    this.issueListener = fn;
    this.lastIssueKey = "";
    this.emitIssueFrames();
    return () => {
      if (this.issueListener === fn) this.issueListener = null;
    };
  }

  private emitIssueFrames() {
    const fn = this.issueListener;
    if (!fn) return;
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    const frames: IssueFrame[] = [];
    if (w && h && this.jewelsGroup.visible) {
      this.camera.updateMatrixWorld();
      _sb.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
      for (const id of this.issueIds) {
        const rig = this.jewelRigs.get(id);
        if (!rig) continue;
        rig.group.getWorldPosition(_p);
        _sa.copy(_p).project(this.camera);
        if (_sa.z > 1 || _sa.z < -1) continue;
        const cx = (_sa.x * 0.5 + 0.5) * w,
          cy = (-_sa.y * 0.5 + 0.5) * h;
        _sa.copy(_p).addScaledVector(_sb, rig.radius * rig.sizeScale).project(this.camera);
        const r = Math.hypot((_sa.x * 0.5 + 0.5) * w - cx, (-_sa.y * 0.5 + 0.5) * h - cy);
        // Never smaller than a fingertip-sized square, so a 2 mm piece is still plainly framed.
        const size = Math.max(2 * r + 10, 22);
        frames.push({ id, left: cx - size / 2, top: cy - size / 2, size });
      }
    }
    const key = frames.map((f) => `${f.id}:${Math.round(f.left)},${Math.round(f.top)},${Math.round(f.size)}`).join("|");
    if (key === this.lastIssueKey) return;
    this.lastIssueKey = key;
    fn(frames);
  }

  /* ---------- lasso selection ---------- */

  /**
   * Follow the lasso being drawn, so the stage can trace it. The listener is
   * called at once, then as the loop grows, and with `null` when it ends. One
   * listener at a time; returns the unsubscribe.
   */
  onLassoPath(fn: LassoListener): () => void {
    this.lassoListener = fn;
    fn(this.lasso ? [...this.lasso.points] : null);
    return () => {
      if (this.lassoListener === fn) this.lassoListener = null;
    };
  }
  private emitLasso() {
    this.lassoListener?.(this.lasso ? [...this.lasso.points] : null);
  }
  /** Drop a loop in progress without selecting anything (the tool stays on). */
  cancelLasso() {
    if (!this.lasso) return;
    this.lasso = null;
    this.emitLasso();
    this.controls.enabled = !this.camTween;
  }
  /**
   * Select the pieces inside the loop just drawn: those alone, or added to the
   * selection when Shift / Ctrl was held as the loop began. The tool then
   * hands back to the usual controls. A loop around nothing says so and keeps
   * the tool on; a tap does nothing.
   */
  private finishLasso() {
    const l = this.lasso;
    if (!l) return;
    this.cancelLasso();
    let length = 0;
    for (let i = 1; i < l.points.length; i++) length += Math.hypot(l.points[i].x - l.points[i - 1].x, l.points[i].y - l.points[i - 1].y);
    if (length < LASSO_MIN_LENGTH) return;
    const ids = this.piecesInLoop(l.points);
    if (!ids.length) {
      notify("lassoEmpty", undefined, "info");
      return;
    }
    const current = this.store.getSnapshot().selectedJewelIds;
    this.store.selectJewels(l.additive ? [...new Set([...current, ...ids])] : ids);
    this.store.setLasso(false);
  }
  /**
   * The pieces whose centre, on screen, lies inside the loop — and that the
   * customer can actually see: a piece hidden behind the arch is left out.
   */
  private piecesInLoop(loop: readonly Point2[]): string[] {
    if (!this.jewelsGroup.visible) return [];
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return [];
    this.camera.updateMatrixWorld();
    const ids: string[] = [];
    for (const j of this.store.jewels) {
      const rig = this.jewelRigs.get(j.id);
      if (!rig) continue;
      rig.group.getWorldPosition(_p);
      _sa.copy(_p).project(this.camera);
      if (_sa.z > 1 || _sa.z < -1) continue; // behind the camera or clipped
      if (!pointInPolygon({ x: (_sa.x * 0.5 + 0.5) * w, y: (-_sa.y * 0.5 + 0.5) * h }, loop)) continue;
      // Hidden when enamel stands between the camera and the piece, clearly short of the piece itself.
      _sb.copy(_p).sub(this.camera.position);
      const dist = _sb.length();
      this.raycaster.set(this.camera.position, _sb.normalize());
      this.raycaster.far = dist;
      const hit = this.raycaster.intersectObjects(this.toothMeshes, true)[0];
      this.raycaster.far = Infinity;
      if (hit && hit.distance < dist - rig.radius * rig.sizeScale - LASSO_OCCLUSION_SLACK) continue;
      ids.push(j.id);
    }
    return ids;
  }

  /* ---------- selection anchor ---------- */

  /**
   * Follow the selection on screen, so HTML controls can float beside it.
   * The listener is called at once, then whenever the box moves (camera,
   * selection, drag, resize). One listener at a time; returns the unsubscribe.
   */
  onSelectionAnchor(fn: SelectionAnchorListener): () => void {
    this.anchorListener = fn;
    this.lastAnchorKey = "";
    this.emitSelectionAnchor();
    return () => {
      if (this.anchorListener === fn) this.anchorListener = null;
    };
  }

  /**
   * How a piece's `rotation` moves for a clockwise turn on screen: pieces spin
   * around their outward normal, so seen from the front a clockwise turn is a
   * negative rotation, and seen from behind the arch a positive one.
   */
  screenClockwiseSign(id: string): 1 | -1 {
    const j = this.store.jewels.find((x) => x.id === id);
    if (!j) return -1;
    _sa.set(j.normal.x, j.normal.y, j.normal.z);
    _sb.set(j.position.x, j.position.y, j.position.z);
    return _sa.dot(this.camera.position.clone().sub(_sb)) >= 0 ? -1 : 1;
  }

  private computeSelectionAnchor(): SelectionAnchor | null {
    const snap = this.store.getSnapshot();
    if (!snap.selectedJewelIds.length || this.dragJewel || this.placing || snap.placingTypeId) return null;
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return null;
    this.camera.updateMatrixWorld();
    // camera "up" in world space: offsets a piece's centre by its radius on screen
    _sb.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    const centre = new THREE.Vector3();
    let count = 0;
    for (const id of snap.selectedJewelIds) {
      const rig = this.jewelRigs.get(id);
      if (!rig) continue;
      rig.group.getWorldPosition(_p);
      centre.add(_p);
      count++;
      _sa.copy(_p).project(this.camera);
      if (_sa.z > 1 || _sa.z < -1) continue; // behind the camera or clipped
      const cx = (_sa.x * 0.5 + 0.5) * w,
        cy = (-_sa.y * 0.5 + 0.5) * h;
      _sa.copy(_p).addScaledVector(_sb, rig.radius * rig.sizeScale).project(this.camera);
      const r = Math.hypot((_sa.x * 0.5 + 0.5) * w - cx, (-_sa.y * 0.5 + 0.5) * h - cy);
      left = Math.min(left, cx - r);
      right = Math.max(right, cx + r);
      top = Math.min(top, cy - r);
      bottom = Math.max(bottom, cy + r);
    }
    if (left === Infinity || right < 0 || left > w || bottom < 0 || top > h) return null;
    _sa.copy(centre.divideScalar(count)).project(this.camera);
    const cx = (_sa.x * 0.5 + 0.5) * w,
      cy = (-_sa.y * 0.5 + 0.5) * h;
    return { left, right, top, bottom, cx, cy, width: w, height: h };
  }

  private emitSelectionAnchor() {
    const fn = this.anchorListener;
    if (!fn) return;
    const a = this.computeSelectionAnchor();
    const key = a
      ? `${Math.round(a.left)},${Math.round(a.right)},${Math.round(a.top)},${Math.round(a.bottom)},${Math.round(a.cx)},${Math.round(a.cy)},${a.width},${a.height}`
      : "";
    if (key === this.lastAnchorKey) return;
    this.lastAnchorKey = key;
    fn(a);
  }

  /* ---------- frame loop ---------- */

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const snap = this.store.getSnapshot();
    const animating =
      !!this.camTween || this.autoRotate || !!this.dragJewel || !!this.ghost || this.dyingJewels.length > 0 || this.hasBirths();
    if (animating) this.pendingFrames = SETTLE_FRAMES;
    if (this.pendingFrames <= 0) {
      // Idle: nothing moved. Damped controls still need their update to report a drag.
      this.controls.update();
      return;
    }
    this.pendingFrames--;

    const tw = this.camTween;
    if (tw) {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      const eased = easeInOutCubic(k);
      this.camera.position.lerpVectors(tw.p0, tw.p1, eased);
      this.controls.target.lerpVectors(tw.t0, tw.t1, eased);
      this.camera.lookAt(this.controls.target);
      if (k >= 1) {
        this.camTween = null;
        this.controls.enabled = true;
        this.controls.update();
      }
    } else {
      this.controls.update();
    }

    // lighting preset crossfade (Studio / Chair lamp / Daylight)
    const lt = this.lightTarget,
      L = 0.1;
    this.keyLight.intensity += (lt.key - this.keyLight.intensity) * L;
    this.keyLight.color.lerp(lt.keyColor, L);
    this.keyLight.position.lerp(lt.keyPos, L);
    this.fillLight.intensity += (lt.fill - this.fillLight.intensity) * L;
    this.fillLight.color.lerp(lt.fillColor, L);
    this.rimLight.intensity += (lt.rim - this.rimLight.intensity) * L;
    this.scene.environmentIntensity += (lt.env - this.scene.environmentIntensity) * L;
    this.renderer.toneMappingExposure += (lt.expo - this.renderer.toneMappingExposure) * L;
    (this.backdrop.material as THREE.MeshBasicMaterial).color.lerp(lt.tint, L);

    this.toothRigs.forEach((rig, id) => {
      let t = 0;
      if (id === this.hoverToothId) t = 0.55;
      if (id === snap.selectedToothId) t = Math.max(t, 0.4);
      rig.highlight += (t - rig.highlight) * 0.16;
      const v = rig.highlight * 0.42;
      rig.materials.forEach((m) => {
        m.emissiveIntensity = v;
      });
    });

    this.jewelRigs.forEach((rig, id) => {
      let anim = 1;
      if (rig.birth) {
        const t = (now - rig.birth) / 420;
        if (t >= 1) rig.birth = 0;
        else anim = Math.max(0.02, backOut(t));
      }
      const hov = id === this.hoverJewelId ? 1 : 0;
      rig.hoverT += (hov - rig.hoverT) * 0.22;
      rig.group.scale.setScalar(Math.max(0.001, rig.sizeScale * anim * (1 + rig.hoverT * 0.09)));
      // A piece with a problem is ringed in red, selected or not.
      const issue = this.issueIds.has(id);
      rig.outlineMaterial.color.setHex(issue ? BLOCK_COLOR : OUTLINE_COLOR);
      const op = issue ? 0.95 : snap.selectedJewelIds.includes(id) ? 0.9 : id === this.hoverJewelId ? 0.38 : 0;
      rig.outlineMaterial.opacity += (op - rig.outlineMaterial.opacity) * 0.2;
      rig.outline.visible = rig.outlineMaterial.opacity > 0.02;
    });
    for (let i = this.dyingJewels.length - 1; i >= 0; i--) {
      const rig = this.dyingJewels[i];
      const t = (now - rig.death) / 200;
      if (t >= 1) {
        this.jewelsGroup.remove(rig.group);
        rig.outlineMaterial.dispose(); // jewel materials are cached+shared — not disposed here
        this.dyingJewels.splice(i, 1);
      } else {
        const s = Math.max(0.001, rig.sizeScale * (1 - t) * (1 - t));
        rig.group.scale.setScalar(s);
      }
    }
    if (this.ghost && this.ghost.root.visible) {
      const p = 0.5 + 0.5 * Math.sin(now / 170);
      this.ghost.ringMaterial.opacity = 0.35 + 0.4 * p;
      this.ghost.ring.scale.setScalar(this.ghost.ringScale * (1 + 0.05 * p));
    }
    this.renderer.render(this.scene, this.camera);
    this.emitSelectionAnchor();
    this.emitIssueFrames();
  };

  private hasBirths() {
    for (const rig of this.jewelRigs.values()) if (rig.birth) return true;
    return false;
  }

  private resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.wake();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.container.removeEventListener("pointerdown", this.onPointerDown, true);
    this.container.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("blur", this.onBlur);
    this.renderer.domElement.removeEventListener("dblclick", this.onDblClick);
    this.controls.removeEventListener("change", this.wake);
    this.controls.removeEventListener("start", this.wake);
    this.unsubscribe();
    this.anchorListener = null;
    this.lassoListener = null;
    this.issueListener = null;
    this.destroyGhost();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((x) => x?.dispose?.());
      }
    });
    this.scene.environment?.dispose();
    ((this.backdrop.material as THREE.MeshBasicMaterial).map as THREE.Texture | null)?.dispose();
    // Shared templates and finishes were disposed with the scene above; drop them
    // so the next editor session rebuilds them for its own renderer.
    disposeGeometryCaches();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Why a model import failed, as a key under `studio.editor.toasts.import`. */
export class ModelImportError extends Error {
  readonly reason: "tooLarge" | "invalid" | "empty" | "cancelled";
  constructor(reason: "tooLarge" | "invalid" | "empty" | "cancelled") {
    super(reason);
    this.reason = reason;
  }
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}
function exportFileName(ext: string) {
  return `global-toothgems-studio-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}.${ext}`;
}

export function downloadURL(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---- the mounted engine (one editor at a time) ---- */
let engineInstance: StudioEngine | null = null;
export function getEngine(): StudioEngine | null {
  return engineInstance;
}
export function setEngine(engine: StudioEngine | null) {
  engineInstance = engine;
}
