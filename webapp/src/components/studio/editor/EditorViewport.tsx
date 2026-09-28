import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Aperture,
  ArrowDownToLine,
  ArrowRightToLine,
  Camera,
  Check,
  ChevronUp,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  LampDesk,
  LassoSelect,
  LoaderCircle,
  Minus,
  Orbit,
  Plus,
  RotateCcw,
  RotateCw,
  ScanFace,
  SquareSplitHorizontal,
  Sun,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import { QuickColorPanel } from "./QuickColorPanel";
import { IssueFrames, IssuePanel } from "./StageIssues";
import { FINISHES, FREE_TOOTH, isFinishId, type PlacedJewelry } from "../../../data/studioEditor";
import {
  beginRotation,
  duplicateMirroredPieces,
  duplicatePieces,
  importModelFile,
  mirrorSelection,
  removePieces,
  resizePieces,
  rotatePieces,
  type RotationSession,
} from "../../../lib/studio3d/actions";
import { getEngine, setEngine, StudioEngine, type SelectionAnchor } from "../../../lib/studio3d/engine";
import type { Point2 } from "../../../lib/studio3d/math";
import { useQuickActions, type QuickActionId } from "../../../lib/studio3d/quickActions";
import { studioStore, type ContextMenuState, type LightPreset, type StudioSnapshot } from "../../../lib/studio3d/store";
import { GROUP_MIN_PIECES } from "../../../lib/studioWorkspace/gemGroup";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";

/* Glass on the dark stage, as the Studio mockup draws its floating controls. */
const stageGlass = "border border-white/15 bg-[rgba(22,26,32,.62)] text-white backdrop-blur-md";
const stageButton = clsx(
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold transition-colors",
  "hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white",
);

/**
 * The 3D stage: mounts the engine on a dark canvas, and floats the tooth chip,
 * the placement hints, the piece context menu and the camera bar over it.
 */
export function EditorViewport({ snap }: { snap: StudioSnapshot }) {
  const { t, pieceName, toothName } = useEditorLabels();
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(host, studioStore);
    } catch {
      // No WebGL (disabled, blocklisted GPU, very old browser): say so instead of a blank stage.
      setFailed(true);
      return;
    }
    setEngine(engine);
    setEngineReady(true);
    return () => {
      setEngineReady(false);
      engine.dispose();
      setEngine(null);
    };
  }, []);

  // Drag and drop a .glb model straight onto the stage.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!(e.relatedTarget instanceof Node) || !host.contains(e.relatedTarget)) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void importModelFile(f);
    };
    host.addEventListener("dragover", over);
    host.addEventListener("dragleave", leave);
    host.addEventListener("drop", drop);
    return () => {
      host.removeEventListener("dragover", over);
      host.removeEventListener("dragleave", leave);
      host.removeEventListener("drop", drop);
    };
  }, []);

  const jewel = snap.jewels.find((j) => j.id === snap.selectedJewelIds[0]);
  const chipTooth = snap.hoveredToothId ?? (jewel ? jewel.toothId : snap.selectedToothId);
  const armedName = snap.armedTypeId ? pieceName(snap.armedTypeId) : null;
  const quick = useQuickActions();

  return (
    <section
      aria-label={t("studio.editor.viewport.label")}
      className="gt-editor-stage relative isolate h-[58vh] min-h-[380px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0"
    >
      <div ref={hostRef} className="gt-editor-canvas absolute inset-0" />

      {failed && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="grid max-w-[380px] justify-items-center gap-3 text-[var(--gt-ink-900)]">
            <TriangleAlert size={28} aria-hidden="true" className="text-[var(--gt-red-500)]" />
            <p className="m-0 text-[length:var(--text-body-md)] font-bold">{t("studio.editor.webgl.title")}</p>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-700)]">{t("studio.editor.webgl.body")}</p>
          </div>
        </div>
      )}

      {dragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 z-10 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--gt-blue-300)]"
        />
      )}

      {chipTooth && chipTooth !== FREE_TOOTH && (
        <div
          key={chipTooth}
          className={clsx(
            "gt-editor-chip pointer-events-none absolute left-1/2 top-3.5 z-[5] flex -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5",
            stageGlass,
          )}
        >
          <span className="rounded-full bg-[var(--gt-blue-300)] px-2 py-0.5 text-[11px] font-bold text-[var(--gt-ink-900)]">
            {chipTooth}
          </span>
          <span className="text-[12px] font-semibold text-white/90">{toothName(chipTooth)}</span>
        </div>
      )}

      {armedName && (
        <Pill position="top">
          <span>{t("studio.editor.viewport.armed", { name: armedName })}</span>
          <button
            type="button"
            aria-label={t("studio.editor.viewport.cancelArmed")}
            title={t("studio.editor.viewport.cancelArmed")}
            onClick={() => studioStore.setArmed(null)}
            className="grid h-6 w-6 place-items-center rounded-full text-[var(--gt-blue-200)] hover:bg-white/15"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </Pill>
      )}
      {snap.lasso && (
        <Pill position="top">
          <span>{t("studio.editor.viewport.lassoActive")}</span>
          <button
            type="button"
            aria-label={t("studio.editor.viewport.cancelLasso")}
            title={t("studio.editor.viewport.cancelLasso")}
            onClick={() => {
              getEngine()?.cancelLasso();
              studioStore.setLasso(false);
            }}
            className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--gt-blue-200)] hover:bg-white/15"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </Pill>
      )}
      {engineReady && <LassoTrace />}
      {snap.placingTypeId && !armedName && <Pill position="bottom">{t("studio.editor.viewport.placing")}</Pill>}
      {snap.modelLoading && !failed && (
        <div
          role="status"
          className={clsx(
            "absolute left-1/2 top-1/2 z-[6] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-[12px] font-semibold",
            stageGlass,
          )}
        >
          <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
          {t("studio.editor.viewport.loading")}
        </div>
      )}
      {snap.jewels.length === 0 && !snap.modelLoading && !snap.placingTypeId && !armedName && !failed && (
        <Pill position="bottom" floating>
          {t("studio.editor.viewport.hint")}
        </Pill>
      )}

      {engineReady && snap.issues.length > 0 && <IssueFrames />}
      {engineReady && snap.issues.length > 0 && <IssuePanel issues={snap.issues} jewels={snap.jewels} />}
      {engineReady && snap.selectedJewelIds.length > 0 && !snap.contextMenu && !snap.lasso && quick.enabled && quick.actions.length > 0 && (
        <QuickBar ids={snap.selectedJewelIds} jewels={snap.jewels} actions={quick.actions} />
      )}
      {snap.contextMenu && <ContextMenu cm={snap.contextMenu} snap={snap} />}
      {!failed && <BottomBar lightPreset={snap.lightPreset} lasso={snap.lasso} />}
      <p className="pointer-events-none absolute left-4 top-4 z-[3] m-0 hidden text-[9px] font-bold uppercase tracking-[.24em] text-[var(--gt-blue-700)]/70 xl:block">
        {t(`studio.editor.viewport.stage.${snap.modelMode}`)}
      </p>
    </section>
  );
}

/** The loop being drawn with the lasso, traced over the stage as the finger or mouse goes. */
function LassoTrace() {
  const [points, setPoints] = useState<readonly Point2[] | null>(null);
  useEffect(() => getEngine()?.onLassoPath(setPoints), []);
  if (!points || points.length < 2) return null;
  const d = points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[6] h-full w-full overflow-visible">
      <polygon points={d} fill="rgba(255,255,255,.14)" stroke="none" />
      <polyline points={d} fill="none" stroke="rgba(22,26,32,.55)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline
        points={d}
        fill="none"
        stroke="white"
        strokeWidth="1.75"
        strokeDasharray="6 5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Pill({ children, position, floating }: { children: React.ReactNode; position: "top" | "bottom"; floating?: boolean }) {
  return (
    <div
      className={clsx(
        "absolute left-1/2 z-[6] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2.5 rounded-full py-2 pl-4 pr-2.5 text-[12px] font-semibold",
        stageGlass,
        position === "top" ? "top-[58px]" : "bottom-[78px]",
        floating && "gt-editor-floaty",
      )}
    >
      <span aria-hidden="true" className="gt-editor-pulse h-1.5 w-1.5 flex-none rounded-full bg-[var(--gt-emerald-400)]" />
      <span className="flex min-w-0 items-center gap-2 [&>span]:truncate">{children}</span>
    </div>
  );
}

/** Touch-sized buttons (42px, 48px with the bar's padding and border), and the bar's gap to the selection. */
const QUICK_BUTTON = 42;
const BAR_HEIGHT = 48;
const BAR_GAP = 12;
/** Stage bands the bar stays out of: the tooth chip on top, the camera bar at the foot. */
const STAGE_TOP_RESERVED = 56;
const STAGE_BOTTOM_RESERVED = 68;
const STAGE_SIDE_MARGIN = 8;

/** Closer than this to the pivot, the pointer's angle is too jumpy to follow. */
const HANDLE_DEAD_ZONE = 10;
/** Keyboard steps, in degrees: arrow keys, and with Shift. */
const KEY_STEP = 1;
const KEY_STEP_LARGE = 15;

/** Signed angle change folded into (-180°, 180°], so a turn past "9 o'clock" keeps counting. */
function angleDelta(from: number, to: number) {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}
const pointerAngle = (x: number, y: number, cx: number, cy: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

type Gesture = {
  session: RotationSession;
  /** Stage origin and pivot (selection centre), in client pixels. */
  originX: number;
  originY: number;
  pivotX: number;
  pivotY: number;
  prevAngle: number;
  turned: number;
};

const quickButton = clsx(
  "inline-flex flex-none select-none items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition-colors",
  "hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
);

/**
 * Quick actions floating right under (or above) the selected pieces, chosen
 * in the toolbar's quick-action preferences: rotate, size −/+, duplicate,
 * mirror, delete. Made for a finger on a tablet or phone, where the inspector
 * sits below the stage and the right-click menu is out of reach.
 *
 * Rotate is a dial: press it, then drag around the selection, and the pieces
 * turn live by the angle swept around the selection's centre (clockwise on
 * screen turns them clockwise), keeping that angle on release — "+50°" is a
 * quarter of a slow circle. Meanwhile the other buttons step aside and the
 * handle rides under the finger. Arrow keys turn by 1° (Shift: 15°).
 * The bar follows the selection as the camera moves and hides while a piece
 * is dragged or off screen.
 */
function QuickBar({ ids, jewels, actions }: { ids: string[]; jewels: PlacedJewelry[]; actions: QuickActionId[] }) {
  const { t } = useEditorLabels();
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<SelectionAnchor | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [visible, setVisible] = useState(false);
  const [dial, setDial] = useState<{ turned: number; cx: number; cy: number; r: number } | null>(null);
  // The colour panel is open for one selection: another selection finds it closed.
  const selectionKey = ids.join(",");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const colorOpen = colorFor === selectionKey;
  const setColorOpen = (open: boolean) => setColorFor(open ? selectionKey : null);
  const panelId = useId();

  useEffect(() => {
    const engine = getEngine();
    if (!engine) return;
    // Positioned straight on the element: the anchor moves every frame while the camera does.
    return engine.onSelectionAnchor((a) => {
      anchorRef.current = a;
      if (a) placeBarAndPanel(barRef.current, panelRef.current, a, !!gestureRef.current);
      setVisible(!!a);
    });
  }, []);

  const selected = jewels.filter((j) => ids.includes(j.id));
  // One diameter for the whole selection, or none when the pieces differ.
  const scales = new Set(selected.map((j) => j.scale));
  const scale = scales.size === 1 ? [...scales][0] : null;

  // The bar's width changes with its buttons and the size readout, the panel comes and goes: stay placed.
  useLayoutEffect(() => {
    if (anchorRef.current) placeBarAndPanel(barRef.current, panelRef.current, anchorRef.current, !!gestureRef.current);
  }, [actions, scale, colorOpen]);

  // The panel grows when the custom colour wheel opens: place it again.
  useEffect(() => {
    const panel = panelRef.current;
    if (!colorOpen || !panel) return;
    const ro = new ResizeObserver(() => {
      if (anchorRef.current) placeBarAndPanel(barRef.current, panel, anchorRef.current, !!gestureRef.current);
    });
    ro.observe(panel);
    return () => ro.disconnect();
  }, [colorOpen]);
  // A press anywhere else closes the colour panel.
  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !colorButtonRef.current?.contains(target)) setColorFor(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [colorOpen]);

  const finish = () => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    g.session.end();
    setDial(null);
  };
  // Selection changed or the bar went away mid-gesture: keep what was turned.
  useEffect(() => finish, [ids]);
  // Back beside the selection once the gesture ends and the other buttons are back.
  const idle = dial === null;
  useLayoutEffect(() => {
    const el = barRef.current;
    if (idle && el && anchorRef.current) placeQuickBar(el, anchorRef.current);
  }, [idle]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = anchorRef.current;
    const stage = barRef.current?.offsetParent?.getBoundingClientRect();
    if (e.button !== 0 || !a || !stage || gestureRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setColorOpen(false);
    // The pivot is the selection's centre: a group turns around it, a single piece around itself.
    const pivotX = stage.left + a.cx;
    const pivotY = stage.top + a.cy;
    gestureRef.current = {
      session: beginRotation(ids),
      originX: stage.left,
      originY: stage.top,
      pivotX,
      pivotY,
      prevAngle: pointerAngle(e.clientX, e.clientY, pivotX, pivotY),
      turned: 0,
    };
    moveBarTo(e.clientX - stage.left, e.clientY - stage.top);
    setDial({ turned: 0, cx: pivotX - stage.left, cy: pivotY - stage.top, r: Math.hypot(e.clientX - pivotX, e.clientY - pivotY) });
  };

  /** While turning the bar holds only the rotate handle: centre it under the finger. */
  const moveBarTo = (x: number, y: number) => {
    const el = barRef.current;
    if (!el) return;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y - BAR_HEIGHT / 2)}px`;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    moveBarTo(e.clientX - g.originX, e.clientY - g.originY);
    const r = Math.hypot(e.clientX - g.pivotX, e.clientY - g.pivotY);
    if (r >= HANDLE_DEAD_ZONE) {
      const angle = pointerAngle(e.clientX, e.clientY, g.pivotX, g.pivotY);
      g.turned += angleDelta(g.prevAngle, angle);
      g.prevAngle = angle;
      g.session.set(g.turned);
    }
    setDial({ turned: Math.round(g.turned), cx: g.pivotX - g.originX, cy: g.pivotY - g.originY, r });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    beginRotation(ids).set(dir * (e.shiftKey ? KEY_STEP_LARGE : KEY_STEP));
  };

  const turning = dial !== null;
  const count = ids.length;
  const rotateLabel = t("studio.editor.viewport.rotateLabel", { count });
  const icon = (label: string, Icon: typeof Copy, onClick: () => void, danger = false) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(quickButton, danger && "text-[#ffb4ab]")}
      style={{ width: QUICK_BUTTON, height: QUICK_BUTTON }}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
  const sep = <span aria-hidden="true" className="mx-0.5 h-5 w-px flex-none bg-white/20" />;

  const render = (id: QuickActionId) => {
    switch (id) {
      case "rotate":
        return (
          <button
            type="button"
            aria-label={rotateLabel}
            title={rotateLabel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => e.preventDefault()}
            className={clsx(
              quickButton,
              "cursor-grab touch-none px-3 [-webkit-touch-callout:none]",
              // Turning: solid white, like the stage's other active toggles.
              turning && "cursor-grabbing bg-white text-[var(--gt-ink-900)] hover:bg-white",
            )}
            style={{ height: QUICK_BUTTON, minWidth: QUICK_BUTTON }}
          >
            <RotateCw size={17} aria-hidden="true" />
            <span aria-hidden="true" className={clsx("tabular-nums", !turning && "max-sm:hidden")}>
              {turning ? `${dial.turned > 0 ? "+" : dial.turned < 0 ? "−" : ""}${Math.abs(dial.turned)}°` : t("studio.editor.viewport.rotate")}
            </span>
          </button>
        );
      case "size":
        return (
          <div role="group" aria-label={t("studio.editor.inspector.diameter")} className="flex flex-none items-center">
            {icon(t("studio.editor.viewport.quick.smaller", { count }), Minus, () => resizePieces(ids, -1))}
            {scale !== null && (
              <span aria-live="polite" className="min-w-[46px] text-center text-[12px] font-bold tabular-nums">
                {t("studio.editor.inspector.mm", { value: (scale * 2).toFixed(1) })}
              </span>
            )}
            {icon(t("studio.editor.viewport.quick.larger", { count }), Plus, () => resizePieces(ids, 1))}
          </div>
        );
      case "color": {
        const label = t("studio.editor.viewport.colorLabel", { count });
        return (
          <button
            ref={colorButtonRef}
            type="button"
            aria-label={label}
            title={label}
            aria-expanded={colorOpen}
            aria-controls={panelId}
            aria-haspopup="dialog"
            onClick={() => setColorOpen(!colorOpen)}
            className={clsx(quickButton, colorOpen && "bg-white/15")}
            style={{ width: QUICK_BUTTON, height: QUICK_BUTTON }}
          >
            <span
              aria-hidden="true"
              className="h-[18px] w-[18px] rounded-full border-2 border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,.25)]"
              style={{ background: swatchOf(selected) }}
            />
          </button>
        );
      }
      case "duplicate":
        return icon(t("studio.editor.context.duplicate", { count }), Copy, () => duplicatePieces(ids));
      case "duplicateMirror":
        return icon(t("studio.editor.context.duplicateMirror", { count }), SquareSplitHorizontal, () => duplicateMirroredPieces(ids));
      case "mirrorH":
        return icon(t("studio.editor.mirror.horizontal"), FlipHorizontal2, () => mirrorSelection("h"));
      case "mirrorV":
        return icon(t("studio.editor.mirror.vertical"), FlipVertical2, () => mirrorSelection("v"));
      case "delete":
        return icon(t("studio.editor.context.delete", { count }), Trash2, () => removePieces(ids), true);
    }
  };
  // While turning, only the rotate handle stays (the same element, so it keeps the pointer).
  const shown = turning ? actions.filter((id) => id === "rotate") : actions;

  return (
    <>
      {dial && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[6] h-full w-full overflow-visible">
          <circle
            cx={dial.cx}
            cy={dial.cy}
            r={Math.max(dial.r, HANDLE_DEAD_ZONE)}
            fill="none"
            stroke="white"
            strokeOpacity=".75"
            strokeWidth="1.5"
            strokeDasharray="4 5"
          />
          <circle cx={dial.cx} cy={dial.cy} r="3.5" fill="white" />
        </svg>
      )}
      <div
        ref={barRef}
        role="toolbar"
        aria-label={t("studio.editor.viewport.quick.label", { count })}
        className={clsx(
          "gt-editor-chip gt-editor-scroll-x absolute left-0 top-0 z-[7] flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full p-0.5",
          stageGlass,
          !visible && "invisible",
        )}
        style={{ height: BAR_HEIGHT }}
      >
        {shown.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && sep}
            {render(id)}
          </Fragment>
        ))}
      </div>
      {colorOpen && !turning && actions.includes("color") && (
        <QuickColorPanel
          ref={panelRef}
          id={panelId}
          selected={selected}
          hidden={!visible}
          onClose={() => {
            setColorOpen(false);
            colorButtonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** The bar beside the selection, and the colour panel (a sibling: the bar scrolls and would clip it) beside the bar. */
function placeBarAndPanel(bar: HTMLElement | null, panel: HTMLElement | null, a: SelectionAnchor, turning: boolean) {
  if (!bar || turning) return;
  placeQuickBar(bar, a);
  if (panel) placeColorPanel(panel, bar, a);
}

/** The colour a selection shows on its quick-action button: its shared colour, or a mix. */
function swatchOf(pieces: PlacedJewelry[]): string {
  const first = pieces[0];
  if (!first) return "transparent";
  if (pieces.every((j) => j.customColor && j.customColor === first.customColor)) return first.customColor!;
  if (pieces.every((j) => !j.customColor && j.color === first.color) && isFinishId(first.color)) return FINISHES[first.color].swatch;
  return "conic-gradient(#ff9dc0, #4d7cff, #22c47c, #f6c05a, #ff9dc0)";
}

/**
 * Beside the bar, on the side away from the selection, inside the stage and
 * clear of the camera bar. Too tall for above or below, it sits level with the
 * bar, to its right or left; on a small stage with no room there either, it
 * covers the quick bar rather than leave the stage.
 */
function placeColorPanel(panel: HTMLElement, bar: HTMLElement, a: SelectionAnchor) {
  const barTop = parseFloat(bar.style.top) || 0;
  const barCentre = parseFloat(bar.style.left) || 0;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const maxBottom = a.height - STAGE_BOTTOM_RESERVED;
  const below = barTop + BAR_HEIGHT + 8;
  const above = barTop - 8 - h;
  let y = barTop >= (a.top + a.bottom) / 2 ? below : above;
  if (y + h > maxBottom) y = above;
  if (y < STAGE_SIDE_MARGIN) {
    // Too tall for either side: level with the bar, beside it, when the stage is wide enough.
    const half = bar.offsetWidth / 2;
    const right = barCentre + half + 8;
    const left = barCentre - half - 8 - w;
    const side = right + w <= a.width - STAGE_SIDE_MARGIN ? right : left >= STAGE_SIDE_MARGIN ? left : null;
    if (side !== null) {
      panel.style.left = `${Math.round(side)}px`;
      panel.style.top = `${Math.round(Math.max(STAGE_SIDE_MARGIN, Math.min(barTop + BAR_HEIGHT / 2 - h / 2, maxBottom - h)))}px`;
      return;
    }
    y = Math.min(below, maxBottom - h);
  }
  y = Math.max(STAGE_SIDE_MARGIN, y);
  const x = Math.min(Math.max(barCentre - w / 2, STAGE_SIDE_MARGIN), a.width - STAGE_SIDE_MARGIN - w);
  panel.style.left = `${Math.round(x)}px`;
  panel.style.top = `${Math.round(y)}px`;
}

/** Centre the bar under the selection, above it when the camera bar is in the way, always inside the stage. */
function placeQuickBar(el: HTMLElement, a: SelectionAnchor) {
  const half = el.offsetWidth / 2 || BAR_HEIGHT;
  const x = Math.min(Math.max((a.left + a.right) / 2, STAGE_SIDE_MARGIN + half), a.width - STAGE_SIDE_MARGIN - half);
  const maxTop = a.height - STAGE_BOTTOM_RESERVED - BAR_HEIGHT;
  const below = a.bottom + BAR_GAP;
  const above = a.top - BAR_GAP - BAR_HEIGHT;
  const y = below <= maxTop ? below : above >= STAGE_TOP_RESERVED ? above : Math.min(Math.max(below, STAGE_TOP_RESERVED), maxTop);
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

/** Right-click menu on a piece (or on the selection that contains it). */
function ContextMenu({ cm, snap }: { cm: ContextMenuState; snap: StudioSnapshot }) {
  const { t, pieceName } = useEditorLabels();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) studioStore.closeContextMenu();
    };
    window.addEventListener("pointerdown", onDown, true);
    // Keyboard users land in the menu, like any menu opened on them.
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);

  const ids = snap.selectedJewelIds.includes(cm.jewelId) ? [...snap.selectedJewelIds] : [cm.jewelId];
  const gems = snap.jewels.filter((j) => ids.includes(j.id));
  if (!gems.length) return null;
  const count = gems.length;
  const act = (fn: () => void) => {
    fn();
    studioStore.closeContextMenu();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  const item = (label: string, Icon: typeof Copy, fn: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => act(fn)}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[length:var(--text-body-sm)] font-semibold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        danger
          ? "text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-brand-wash)]",
      )}
    >
      <Icon size={15} aria-hidden="true" className={danger ? "" : "text-[var(--gt-blue-600)]"} />
      {label}
    </button>
  );

  const heading = count > 1 ? t("studio.editor.context.selected", { count }) : pieceName(gems[0].jewelryTypeId);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={heading}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `min(${cm.x}px, calc(100% - 228px))`, top: `min(${cm.y}px, calc(100% - 336px))` }}
      className="absolute z-40 w-[216px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]"
    >
      <p className="m-0 mb-1 truncate border-b border-[var(--border-subtle)] px-3 pb-2 pt-1.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[var(--text-subtle)]">
        {heading}
      </p>
      {item(t("studio.editor.context.rotate", { count }), RotateCw, () => rotatePieces(ids))}
      {item(t("studio.editor.context.duplicate", { count }), Copy, () => duplicatePieces(ids))}
      {item(t("studio.editor.context.duplicateMirror", { count }), SquareSplitHorizontal, () => duplicateMirroredPieces(ids))}
      {item(t("studio.editor.mirror.horizontal"), FlipHorizontal2, () => mirrorSelection("h"))}
      {item(t("studio.editor.mirror.vertical"), FlipVertical2, () => mirrorSelection("v"))}
      {count >= GROUP_MIN_PIECES &&
        item(t("studio.workspace.groups.contextSave", { count }), Layers, () => openWorkspaceDialog({ kind: "saveGroup", pieceIds: ids }))}
      <span role="none" className="mx-2 my-1 block h-px bg-[var(--border-subtle)]" />
      {item(t("studio.editor.context.delete", { count }), Trash2, () => removePieces(ids), true)}
    </div>
  );
}

/** Lighting presets, each with the icon that stands for it on the camera bar. */
const LIGHTS: { id: LightPreset; Icon: typeof Copy }[] = [
  { id: "studio", Icon: Aperture },
  { id: "lamp", Icon: LampDesk },
  { id: "daylight", Icon: Sun },
];
const VIEWS: { id: "front" | "top" | "side" | "reset"; Icon: typeof Copy }[] = [
  { id: "front", Icon: ScanFace },
  { id: "top", Icon: ArrowDownToLine },
  { id: "side", Icon: ArrowRightToLine },
  { id: "reset", Icon: RotateCcw },
];

/**
 * Camera views, zoom, lighting, orbit and the lasso, floating at the foot of
 * the stage. The views and the lights fold into menus that open upwards, each
 * shown by an icon (the chosen light's own), so the bar stays short enough
 * for a phone.
 */
function BottomBar({ lightPreset, lasso }: { lightPreset: LightPreset; lasso: boolean }) {
  const { t } = useEditorLabels();
  const [orbit, setOrbit] = useState(false);
  const [menu, setMenu] = useState<"views" | "lights" | null>(null);
  const view = (v: "front" | "top" | "side" | "reset") => {
    if (v === "reset") setOrbit(false);
    getEngine()?.setView(v);
  };
  const light = (p: LightPreset) => {
    getEngine()?.setLightPreset(p);
    studioStore.setLightPreset(p);
  };
  const toggle = (id: "views" | "lights") => (open: boolean) => setMenu((cur) => (open ? id : cur === id ? null : cur));
  const sep = <span aria-hidden="true" className="mx-0.5 h-4 w-px flex-none bg-white/20" />;
  const LightIcon = LIGHTS.find((l) => l.id === lightPreset)?.Icon ?? Aperture;
  const lightName = t(`studio.editor.lights.${lightPreset}`);

  return (
    <div
      className={clsx(
        "absolute bottom-4 left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 rounded-full p-1",
        stageGlass,
        // An open menu rises above the quick bar and the issue list.
        menu ? "z-[12]" : "z-[6]",
      )}
    >
      <StageMenu
        label={t("studio.editor.views.menu")}
        open={menu === "views"}
        onOpenChange={toggle("views")}
        trigger={
          <>
            <Camera size={14} aria-hidden="true" />
            <span className="max-sm:sr-only">{t("studio.editor.views.label")}</span>
          </>
        }
        items={VIEWS.map(({ id, Icon }) => ({
          key: id,
          icon: <Icon size={14} />,
          label: t(`studio.editor.views.${id}`),
          onSelect: () => view(id),
        }))}
      />
      {sep}
      <button
        type="button"
        className={stageButton}
        aria-label={t("studio.editor.zoomOut")}
        title={t("studio.editor.zoomOut")}
        onClick={() => getEngine()?.zoomBy(1.25)}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={stageButton}
        aria-label={t("studio.editor.zoomIn")}
        title={t("studio.editor.zoomIn")}
        onClick={() => getEngine()?.zoomBy(0.8)}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
      {sep}
      <StageMenu
        label={t("studio.editor.lights.label")}
        triggerLabel={t("studio.editor.lights.current", { name: lightName })}
        open={menu === "lights"}
        onOpenChange={toggle("lights")}
        trigger={
          <>
            <LightIcon size={14} aria-hidden="true" />
            <span className="max-sm:sr-only">{lightName}</span>
          </>
        }
        items={LIGHTS.map(({ id, Icon }) => ({
          key: id,
          icon: <Icon size={14} />,
          label: t(`studio.editor.lights.${id}`),
          sub: t(`studio.editor.lights.${id}Hint`),
          checked: lightPreset === id,
          onSelect: () => light(id),
        }))}
      />
      {sep}
      <button
        type="button"
        aria-pressed={orbit}
        aria-label={t("studio.editor.orbit")}
        title={t("studio.editor.orbitHint")}
        onClick={() => {
          getEngine()?.setAutoRotate(!orbit);
          setOrbit(!orbit);
        }}
        className={clsx(stageButton, orbit && "bg-white text-[var(--gt-ink-900)] hover:bg-white")}
      >
        <Orbit size={14} aria-hidden="true" />
        <span aria-hidden="true" className="max-sm:hidden">
          {t("studio.editor.orbit")}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={lasso}
        aria-label={t("studio.editor.viewport.lasso")}
        title={t("studio.editor.viewport.lassoHint")}
        onClick={() => {
          getEngine()?.cancelLasso();
          studioStore.setLasso(!lasso);
        }}
        className={clsx(stageButton, lasso && "bg-white text-[var(--gt-ink-900)] hover:bg-white")}
      >
        <LassoSelect size={14} aria-hidden="true" />
        <span aria-hidden="true" className="max-sm:hidden">
          {t("studio.editor.viewport.lasso")}
        </span>
      </button>
    </div>
  );
}

interface StageMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  /** Set on a choice menu (the lights): the item is a radio, checked or not. */
  checked?: boolean;
  onSelect: () => void;
}

/**
 * A button on the camera bar opening a short menu upwards, in the stage's
 * glass. Arrow keys move through the items, Escape closes it and gives focus
 * back to the button, a press elsewhere dismisses it.
 */
function StageMenu({
  label,
  triggerLabel,
  trigger,
  items,
  open,
  onOpenChange,
}: {
  label: string;
  /** The button's accessible name, when it says more than the menu's (the chosen light). */
  triggerLabel?: string;
  trigger: React.ReactNode;
  items: StageMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // The latest callback, so the effect below runs when the menu opens, not on every render.
  const onOpenChangeRef = useRef(onOpenChange);
  useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChangeRef.current(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    // Keyboard users land on the chosen item, or the first.
    const list = menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']");
    const checked = menuRef.current?.querySelector<HTMLElement>("[aria-checked='true']");
    (checked ?? list?.[0])?.focus({ preventScroll: true });
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const close = (refocus: boolean) => {
    onOpenChange(false);
    if (refocus) triggerRef.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Marked handled, so the editor's own Escape (deselect) leaves the selection alone.
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: i + 1, ArrowUp: i - 1 + list.length, Home: 0, End: list.length - 1 }[e.key];
    if (next === undefined || !list.length) return;
    e.preventDefault();
    list[next % list.length]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative flex" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        title={triggerLabel ?? label}
        onClick={() => onOpenChange(!open)}
        className={clsx(stageButton, open && "bg-white/15")}
      >
        {trigger}
        <ChevronUp size={12} aria-hidden="true" className={clsx("transition-transform", !open && "rotate-180")} />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute bottom-[calc(100%+10px)] left-1/2 w-max min-w-[176px] max-w-[min(260px,calc(100vw-32px))] -translate-x-1/2 rounded-[var(--radius-md)] border border-white/15 bg-[rgba(22,26,32,.92)] p-1 text-white shadow-[var(--shadow-lg)] backdrop-blur-md motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]"
        >
          <p aria-hidden="true" className="m-0 px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-white/60">
            {label}
          </p>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={item.checked}
              onClick={() => {
                item.onSelect();
                close(true);
              }}
              className={clsx(
                "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[12px] font-semibold transition-colors",
                "hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
                item.checked && "bg-white/10",
              )}
            >
              <span aria-hidden="true" className="flex-none text-[var(--gt-blue-200)]">
                {item.icon}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate">{item.label}</span>
                {item.sub && <span className="text-[11px] font-medium leading-snug text-white/65">{item.sub}</span>}
              </span>
              {item.checked && <Check size={14} aria-hidden="true" className="flex-none" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
