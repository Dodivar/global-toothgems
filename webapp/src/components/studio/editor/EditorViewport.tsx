import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Copy, FlipHorizontal2, FlipVertical2, Minus, Orbit, Plus, RotateCw, Trash2, TriangleAlert, X } from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import { FREE_TOOTH, type PlacedJewelry } from "../../../data/studioEditor";
import {
  beginRotation,
  duplicatePieces,
  importModelFile,
  mirrorSelection,
  removePieces,
  resizePieces,
  rotatePieces,
  type RotationSession,
} from "../../../lib/studio3d/actions";
import { getEngine, setEngine, StudioEngine, type SelectionAnchor } from "../../../lib/studio3d/engine";
import { useQuickActions, type QuickActionId } from "../../../lib/studio3d/quickActions";
import { studioStore, type ContextMenuState, type LightPreset, type StudioSnapshot } from "../../../lib/studio3d/store";

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
      {snap.placingTypeId && !armedName && <Pill position="bottom">{t("studio.editor.viewport.placing")}</Pill>}
      {snap.jewels.length === 0 && !snap.placingTypeId && !armedName && !failed && (
        <Pill position="bottom" floating>
          {t("studio.editor.viewport.hint")}
        </Pill>
      )}

      {engineReady && snap.selectedJewelIds.length > 0 && !snap.contextMenu && quick.enabled && quick.actions.length > 0 && (
        <QuickBar ids={snap.selectedJewelIds} jewels={snap.jewels} actions={quick.actions} />
      )}
      {snap.contextMenu && <ContextMenu cm={snap.contextMenu} snap={snap} />}
      {!failed && <BottomBar lightPreset={snap.lightPreset} />}
      <p className="pointer-events-none absolute left-4 top-4 z-[3] m-0 hidden text-[9px] font-bold uppercase tracking-[.24em] text-[var(--gt-blue-700)]/70 xl:block">
        {t(`studio.editor.viewport.stage.${snap.modelMode}`)}
      </p>
    </section>
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
  const anchorRef = useRef<SelectionAnchor | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [visible, setVisible] = useState(false);
  const [dial, setDial] = useState<{ turned: number; cx: number; cy: number; r: number } | null>(null);

  useEffect(() => {
    const engine = getEngine();
    if (!engine) return;
    // Positioned straight on the element: the anchor moves every frame while the camera does.
    return engine.onSelectionAnchor((a) => {
      anchorRef.current = a;
      const el = barRef.current;
      if (a && el && !gestureRef.current) placeQuickBar(el, a);
      setVisible(!!a);
    });
  }, []);

  // One diameter for the whole selection, or none when the pieces differ.
  const scales = new Set(jewels.filter((j) => ids.includes(j.id)).map((j) => j.scale));
  const scale = scales.size === 1 ? [...scales][0] : null;

  // The bar's width changes with its buttons and the size readout: stay centred.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (el && anchorRef.current && !gestureRef.current) placeQuickBar(el, anchorRef.current);
  }, [actions, scale]);

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
    const pivotX = stage.left + (a.left + a.right) / 2;
    const pivotY = stage.top + (a.top + a.bottom) / 2;
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
      case "duplicate":
        return icon(t("studio.editor.context.duplicate", { count }), Copy, () => duplicatePieces(ids));
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
    </>
  );
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
      style={{ left: `min(${cm.x}px, calc(100% - 228px))`, top: `min(${cm.y}px, calc(100% - 262px))` }}
      className="absolute z-40 w-[216px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]"
    >
      <p className="m-0 mb-1 truncate border-b border-[var(--border-subtle)] px-3 pb-2 pt-1.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[var(--text-subtle)]">
        {heading}
      </p>
      {item(t("studio.editor.context.rotate", { count }), RotateCw, () => rotatePieces(ids))}
      {item(t("studio.editor.context.duplicate", { count }), Copy, () => duplicatePieces(ids))}
      {item(t("studio.editor.mirror.horizontal"), FlipHorizontal2, () => mirrorSelection("h"))}
      {item(t("studio.editor.mirror.vertical"), FlipVertical2, () => mirrorSelection("v"))}
      <span role="none" className="mx-2 my-1 block h-px bg-[var(--border-subtle)]" />
      {item(t("studio.editor.context.delete", { count }), Trash2, () => removePieces(ids), true)}
    </div>
  );
}

/** Camera, zoom, lighting and orbit controls, floating at the foot of the stage. */
function BottomBar({ lightPreset }: { lightPreset: LightPreset }) {
  const { t } = useEditorLabels();
  const [orbit, setOrbit] = useState(false);
  const view = (v: "front" | "top" | "side" | "reset") => {
    if (v === "reset") setOrbit(false);
    getEngine()?.setView(v);
  };
  const light = (p: LightPreset) => {
    getEngine()?.setLightPreset(p);
    studioStore.setLightPreset(p);
  };
  const sep = <span aria-hidden="true" className="mx-0.5 h-4 w-px flex-none bg-white/20" />;

  return (
    <div
      className={clsx(
        "gt-editor-scroll-x absolute bottom-4 left-1/2 z-[6] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full p-1",
        stageGlass,
      )}
    >
      <div role="group" aria-label={t("studio.editor.views.label")} className="flex items-center gap-0.5">
        {(["front", "top", "side", "reset"] as const).map((v) => (
          <button key={v} type="button" className={stageButton} onClick={() => view(v)}>
            {t(`studio.editor.views.${v}`)}
          </button>
        ))}
      </div>
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
      <div role="radiogroup" aria-label={t("studio.editor.lights.label")} className="flex items-center gap-0.5">
        {(["studio", "lamp", "daylight"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={lightPreset === p}
            title={t(`studio.editor.lights.${p}Hint`)}
            onClick={() => light(p)}
            className={clsx(stageButton, lightPreset === p && "bg-white text-[var(--gt-ink-900)] hover:bg-white")}
          >
            {t(`studio.editor.lights.${p}`)}
          </button>
        ))}
      </div>
      {sep}
      <button
        type="button"
        aria-pressed={orbit}
        title={t("studio.editor.orbitHint")}
        onClick={() => {
          getEngine()?.setAutoRotate(!orbit);
          setOrbit(!orbit);
        }}
        className={clsx(stageButton, orbit && "bg-white text-[var(--gt-ink-900)] hover:bg-white")}
      >
        <Orbit size={14} aria-hidden="true" />
        {t("studio.editor.orbit")}
      </button>
    </div>
  );
}
