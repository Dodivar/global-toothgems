import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Aperture,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  Camera,
  Check,
  ChevronUp,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  LampDesk,
  LassoSelect,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Minus,
  Move,
  Orbit,
  PanelLeft,
  PanelRight,
  Plus,
  RotateCcw,
  RotateCw,
  ScanFace,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Sun,
  Trash2,
  TriangleAlert,
  X,
  Lock,
  LockOpen,
} from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import type { EditorPanel, EditorPanels } from "./useEditorPanels";
import { QuickColorPanel } from "./QuickColorPanel";
import { IssueFrames, IssuePanel } from "./StageIssues";
import type { PlacedJewelry } from "../../../data/studioEditor";
import { lookSwatch } from "./lookSwatch";
import { sizeKey } from "../../../lib/gemOptions";
import {
  beginRotation,
  duplicateMirroredPieces,
  duplicatePieces,
  importModelFile,
  mirrorSelection,
  removePieces,
  resizePieces,
  rotatePieces,
  setPiecesLocked,
  type RotationSession,
} from "../../../lib/studio3d/actions";
import { getEngine, setEngine, StudioEngine, type SelectionAnchor } from "../../../lib/studio3d/engine";
import { useStageFullscreen } from "../../../lib/studio3d/stageFullscreen";
import { StageFullscreenButton } from "../StageFullscreenButton";
import type { Point2 } from "../../../lib/studio3d/math";
import { useQuickActions, type QuickActionId } from "../../../lib/studio3d/quickActions";
import { studioStore, useStudio, type ContextMenuState, type LightPreset, type StudioSnapshot } from "../../../lib/studio3d/store";
import { GROUP_MIN_PIECES } from "../../../lib/studioWorkspace/gemGroup";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { useStudioStaff } from "../../../lib/studioAccess";
import type { PhoneLayout } from "../../../lib/studio3d/phoneLayout";
import { LOUPE_SIZE, loupeSource, placeLoupe } from "../../../lib/studio3d/stageLoupe";

/**
 * Centred in the part of the stage the side drawers leave in view, and no wider
 * (`--gt-lib-open` / `--gt-insp-open`, set by the editor's layout; 0 when stacked).
 */
const stageCentre = clsx(
  "left-[calc(var(--gt-lib-open,0px)+(100%-var(--gt-lib-open,0px)-var(--gt-insp-open,0px))/2)]",
  "max-w-[calc(100%-var(--gt-lib-open,0px)-var(--gt-insp-open,0px)-24px)]",
  "transition-[left] duration-[var(--duration-fast)]",
);

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
interface PanelControls {
  side: boolean;
  open: EditorPanels;
  toggle: (panel: EditorPanel) => void;
}

export function EditorViewport({ panels, phone = null }: { panels?: PanelControls; phone?: PhoneLayout }) {
  const snap = useStudio();
  const { t, pieceName } = useEditorLabels();
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const { ref: stageRef, active: fullscreen, overlay: fullscreenOverlay, toggle: toggleFullscreen } = useStageFullscreen<HTMLElement>();

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

  // A phone's touch aids (loupe, a tooth tap that zooms, haptics): phones only.
  useEffect(() => {
    if (engineReady) getEngine()?.setTouchAids(!!phone);
  }, [engineReady, phone]);

  // On a phone a pinch over the stage's own controls must not zoom the page (iPhone Safari's
  // `gesturestart`; elsewhere `touch-action: none` on the stage does it).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !phone) return;
    const stop = (e: Event) => e.preventDefault();
    stage.addEventListener("gesturestart", stop);
    return () => stage.removeEventListener("gesturestart", stop);
  }, [phone, stageRef]);

  // Drag and drop a .glb model straight onto the stage (staff only, like the import button).
  const staff = useStudioStaff();
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !staff) return;
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
  }, [staff]);

  const armedName = snap.armedTypeId ? pieceName({ productId: snap.armedTypeId }) : null;
  const quick = useQuickActions();

  return (
    <section
      ref={stageRef}
      aria-label={t("studio.editor.viewport.label")}
      data-tour="stage"
      className={clsx(
        "gt-editor-stage @container relative isolate h-[58vh] min-h-[380px] min-w-0 overflow-hidden studio-side:h-auto studio-side:min-h-0",
        // A phone held upright: the stage fills the room the bottom sheet leaves it (`PhoneSheet`).
        // On any phone, a pinch on the stage is the camera's, never the page's.
        "studio-phone-portrait:h-full studio-phone-portrait:min-h-0 studio-phone:touch-none",
        // Full screen, the side drawers are out of view: the controls centre on the whole stage.
        fullscreen && "[--gt-lib-open:0px] [--gt-insp-open:0px]",
        fullscreenOverlay && "!fixed inset-0 z-[90] !h-[100dvh] !min-h-0",
      )}
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

      {armedName && phone && <ArmedBanner name={armedName} placed={snap.jewels.length > 0} />}
      {armedName && !phone && (
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
          <span>{t(snap.multiSelect ? "studio.editor.viewport.lassoActiveAdd" : "studio.editor.viewport.lassoActive")}</span>
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
      {snap.multiSelect && !snap.lasso && (
        <Pill position="top">
          <span aria-live="polite">
            <span className="@max-[560px]:hidden">{t("studio.editor.viewport.multiPrompt")} · </span>
            {t("studio.editor.viewport.multiActive", { count: snap.selectedJewelIds.length })}
          </span>
          {snap.selectedJewelIds.length > 0 && (
            <button
              type="button"
              onClick={() => studioStore.selectIdentical()}
              title={t("studio.editor.viewport.selectIdenticalHint")}
              className="h-7 flex-none rounded-full px-2.5 text-[11px] font-bold text-white hover:bg-white/15"
            >
              {t("studio.editor.viewport.selectIdentical")}
            </button>
          )}
          <button
            type="button"
            onClick={() => studioStore.setMultiSelect(false)}
            className="h-7 flex-none rounded-full bg-white px-3 text-[11px] font-bold text-[var(--gt-ink-900)] hover:bg-[var(--gt-blue-50)]"
          >
            {t("studio.editor.viewport.multiDone")}
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
          {t(phone ? "studio.editor.viewport.hintPhone" : "studio.editor.viewport.hint")}
        </Pill>
      )}

      {engineReady && snap.issues.length > 0 && <IssueFrames />}
      {engineReady && snap.issues.length > 0 && <IssuePanel issues={snap.issues} jewels={snap.jewels} />}
      {engineReady && snap.selectedJewelIds.length > 0 && !snap.contextMenu && !snap.lasso && quick.enabled && quick.actions.length > 0 && (
        <QuickBar ids={snap.selectedJewelIds} jewels={snap.jewels} actions={quick.actions} docked={!!phone} />
      )}
      {snap.contextMenu && <ContextMenu cm={snap.contextMenu} snap={snap} />}
      {!failed && (
        <BottomBar
          lightPreset={snap.lightPreset}
          lasso={snap.lasso}
          multiSelect={snap.multiSelect}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      {panels?.side && !fullscreen && <PanelToggles panels={panels} selectedCount={snap.selectedJewelIds.length} />}
      {engineReady && phone && <StageLoupe />}
      {engineReady && phone === "landscape" && !fullscreen && <FullscreenSuggestion onAccept={toggleFullscreen} />}
      <p className="pointer-events-none absolute left-1/2 top-5 z-[3] m-0 hidden -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-[.24em] text-[var(--gt-blue-700)]/70 xl:block">
        {t(`studio.editor.viewport.stage.${snap.modelMode}`)}
      </p>
    </section>
  );
}

/**
 * The two side panels' switches, in the stage's top corners: the library on
 * the left, the inspector on the right. Closed, the inspector's switch counts
 * the selected pieces, so the artist knows there is something to adjust there.
 */
function PanelToggles({ panels, selectedCount }: { panels: PanelControls; selectedCount: number }) {
  const { t } = useEditorLabels();
  const button = (panel: EditorPanel) =>
    clsx(
      "absolute top-3 z-[7] inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold shadow-[var(--shadow-sm)] transition-[left,right,background-color,color] duration-[var(--duration-fast)]",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
      panels.open[panel]
        ? "border border-[var(--border-subtle)] bg-[var(--surface-card)]/90 text-[var(--gt-ink-700)] hover:bg-[var(--surface-card)]"
        : stageGlass,
    );
  const label = (panel: EditorPanel) => t(`studio.editor.panels.${panel}.${panels.open[panel] ? "hide" : "show"}`);
  return (
    <>
      <button
        type="button"
        aria-expanded={panels.open.library}
        aria-controls="gt-editor-library-panel"
        data-tour="library-toggle"
        aria-label={label("library")}
        title={label("library")}
        onClick={() => panels.toggle("library")}
        className={clsx(button("library"), "left-[calc(var(--gt-lib-open,0px)+12px)]")}
      >
        <PanelLeft size={15} aria-hidden="true" />
        <span aria-hidden="true">{t("studio.editor.panels.library.name")}</span>
      </button>
      <button
        type="button"
        aria-expanded={panels.open.inspector}
        aria-controls="gt-editor-inspector-panel"
        data-tour="inspector-toggle"
        aria-label={label("inspector")}
        title={label("inspector")}
        onClick={() => panels.toggle("inspector")}
        className={clsx(button("inspector"), "right-[calc(var(--gt-insp-open,0px)+12px)]")}
      >
        <span aria-hidden="true">{t("studio.editor.panels.inspector.name")}</span>
        {!panels.open.inspector && selectedCount > 0 && (
          <span
            aria-hidden="true"
            className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gt-emerald-400)] px-1 text-[10.5px] font-black tabular-nums text-[var(--gt-ink-900)]"
          >
            {selectedCount}
          </span>
        )}
        <PanelRight size={15} aria-hidden="true" />
      </button>
    </>
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
        // Above the issue list, whose header shares the top band on a narrow stage.
        "absolute z-[9] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-2 pl-4 pr-2.5 text-[12px] font-semibold",
        stageCentre,
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
/** Docked on a phone: the 44px a fingertip is promised, and the bar's distance from the stage's foot (over the camera bar). */
const QUICK_BUTTON_DOCKED = 44;
const BAR_HEIGHT_DOCKED = 50;
const DOCK_BOTTOM = 64;
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
function QuickBar({ ids, jewels, actions, docked = false }: { ids: string[]; jewels: PlacedJewelry[]; actions: QuickActionId[]; docked?: boolean }) {
  const { t, sizeName, sizeShort } = useEditorLabels();
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
  const setColorOpen = (open: boolean) => {
    setColorFor(open ? selectionKey : null);
    if (open) setNudgeFor(null);
  };
  // The phone's nudge pad, open for one selection like the colour panel (and never both at once).
  const nudgeButtonRef = useRef<HTMLButtonElement>(null);
  const [nudgeFor, setNudgeFor] = useState<string | null>(null);
  const nudgeOpen = docked && nudgeFor === selectionKey;
  const setNudgeOpen = (open: boolean) => {
    setNudgeFor(open ? selectionKey : null);
    if (open) setColorFor(null);
  };
  const panelId = useId();
  const nudgeId = useId();
  const buttonSize = docked ? QUICK_BUTTON_DOCKED : QUICK_BUTTON;
  const barHeight = docked ? BAR_HEIGHT_DOCKED : BAR_HEIGHT;

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
  // Every selected piece locked: the bar offers only what leaves them as they are.
  const allLocked = selected.length > 0 && selected.every((j) => j.locked);
  // One size for the whole selection, or none when the pieces differ.
  const sizes = new Set(selected.map((j) => sizeKey(j.size)));
  const size = sizes.size === 1 && selected.length ? selected[0].size : null;

  // The bar's width changes with its buttons and the size readout, the panel comes and goes: stay placed.
  useLayoutEffect(() => {
    if (anchorRef.current) placeBarAndPanel(barRef.current, panelRef.current, anchorRef.current, !!gestureRef.current);
  }, [actions, size, colorOpen, nudgeOpen, docked]);

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
  // The nudge pad closes the same way, except while the bar itself is pressed (another action).
  useEffect(() => {
    if (!nudgeOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !nudgeButtonRef.current?.contains(target)) setNudgeFor(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [nudgeOpen]);

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
    setNudgeOpen(false);
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
    el.style.top = `${Math.round(y - el.offsetHeight / 2)}px`;
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
    rotatePieces(ids, dir * (e.shiftKey ? KEY_STEP_LARGE : KEY_STEP));
  };

  const turning = dial !== null;
  const count = ids.length;
  const rotateLabel = t("studio.editor.viewport.rotateLabel", { count });
  const icon = (label: string, Icon: typeof Copy, onClick: () => void, danger = false, active = false) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(quickButton, danger && "text-[#ffb4ab]", active && "bg-white/15")}
      style={{ width: buttonSize, height: buttonSize }}
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
            style={{ height: buttonSize, minWidth: buttonSize }}
          >
            <RotateCw size={17} aria-hidden="true" />
            <span aria-hidden="true" className={clsx("tabular-nums", !turning && "max-sm:hidden")}>
              {turning ? `${dial.turned > 0 ? "+" : dial.turned < 0 ? "−" : ""}${Math.abs(dial.turned)}°` : t("studio.editor.viewport.rotate")}
            </span>
          </button>
        );
      case "size":
        return (
          <div role="group" aria-label={t("studio.editor.inspector.size")} className="flex flex-none items-center">
            {icon(t("studio.editor.viewport.quick.smaller", { count }), Minus, () => resizePieces(ids, -1))}
            {size !== null && (
              <span aria-live="polite" title={sizeName(size)} className="min-w-[46px] whitespace-nowrap px-1 text-center text-[12px] font-bold tabular-nums">
                {sizeShort(size)}
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
            style={{ width: buttonSize, height: buttonSize }}
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
      case "duplicateMirrorV":
        return icon(t("studio.editor.context.duplicateMirrorV", { count }), SquareSplitVertical, () => duplicateMirroredPieces(ids, "v"));
      case "mirrorH":
        return icon(t("studio.editor.mirror.horizontal"), FlipHorizontal2, () => mirrorSelection("h"));
      case "mirrorV":
        return icon(t("studio.editor.mirror.vertical"), FlipVertical2, () => mirrorSelection("v"));
      case "lock":
        return allLocked
          ? icon(t("studio.editor.lock.unlock", { count }), LockOpen, () => setPiecesLocked(ids, false), false, true)
          : icon(t("studio.editor.lock.lock", { count }), Lock, () => setPiecesLocked(ids, true));
      case "delete":
        return icon(t("studio.editor.context.delete", { count }), Trash2, () => removePieces(ids), true);
    }
  };
  // While turning, only the rotate handle stays (the same element, so it keeps the pointer).
  // Locked pieces keep only the actions that do not change them: unlock and the duplicates.
  const shown = turning
    ? actions.filter((id) => id === "rotate")
    : allLocked
      ? actions.filter((id) => LOCKED_QUICK_ACTIONS.includes(id))
      : actions;
  // Docked on a phone, the bar also opens the nudge pad: the finger is too coarse for the last millimetre.
  const nudgeLabel = t("studio.editor.viewport.nudge.open");
  const nudgeButton = docked && !turning && !allLocked && (
    <button
      ref={nudgeButtonRef}
      type="button"
      aria-label={nudgeLabel}
      title={nudgeLabel}
      aria-expanded={nudgeOpen}
      aria-controls={nudgeId}
      onClick={() => setNudgeOpen(!nudgeOpen)}
      className={clsx(quickButton, nudgeOpen && "bg-white/15")}
      style={{ width: buttonSize, height: buttonSize }}
    >
      <Move size={17} aria-hidden="true" />
    </button>
  );

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
        data-docked={docked ? "true" : undefined}
        className={clsx(
          "gt-editor-chip absolute left-0 top-0 z-[7] flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 p-0.5",
          // Docked on a phone every action stays in view: the bar wraps onto a second row
          // rather than scroll a button out of the thumb's sight.
          docked ? "w-max flex-wrap justify-center rounded-[26px]" : "gt-editor-scroll-x overflow-x-auto rounded-full",
          stageGlass,
          !visible && "invisible",
        )}
        style={docked ? { minHeight: barHeight } : { height: barHeight }}
      >
        {shown.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && !docked && sep}
            {render(id)}
          </Fragment>
        ))}
        {nudgeButton}
      </div>
      {nudgeOpen && !turning && !allLocked && (
        <NudgePad
          ref={panelRef}
          id={nudgeId}
          hidden={!visible}
          onClose={() => {
            setNudgeOpen(false);
            nudgeButtonRef.current?.focus();
          }}
        />
      )}
      {colorOpen && !turning && !allLocked && actions.includes("color") && (
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

/** The quick actions that leave a locked piece as it is. */
const LOCKED_QUICK_ACTIONS: readonly QuickActionId[] = ["duplicate", "duplicateMirror", "duplicateMirrorV", "lock"];

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
  const same = (a: PlacedJewelry["look"], b: PlacedJewelry["look"]) => a.material === b.material && a.color === b.color && a.effect === b.effect;
  if (pieces.every((j) => same(j.look, first.look))) return lookSwatch(first.look);
  return "conic-gradient(#ff9dc0, #4d7cff, #22c47c, #f6c05a, #ff9dc0)";
}

/**
 * Beside the bar, on the side away from the selection, inside the stage and
 * clear of the camera bar. Too tall for above or below, it sits level with the
 * bar, to its right or left; on a small stage with no room there either, it
 * covers the quick bar rather than leave the stage.
 */
function placeColorPanel(panel: HTMLElement, bar: HTMLElement, a: SelectionAnchor) {
  const barHeight = bar.offsetHeight || BAR_HEIGHT;
  const barTop = parseFloat(bar.style.top) || 0;
  const barCentre = parseFloat(bar.style.left) || 0;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const maxBottom = a.height - STAGE_BOTTOM_RESERVED;
  const below = barTop + barHeight + 8;
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
      panel.style.top = `${Math.round(Math.max(STAGE_SIDE_MARGIN, Math.min(barTop + barHeight / 2 - h / 2, maxBottom - h)))}px`;
      return;
    }
    y = Math.min(below, maxBottom - h);
  }
  y = Math.max(STAGE_SIDE_MARGIN, y);
  const x = Math.min(Math.max(barCentre - w / 2, STAGE_SIDE_MARGIN), a.width - STAGE_SIDE_MARGIN - w);
  panel.style.left = `${Math.round(x)}px`;
  panel.style.top = `${Math.round(y)}px`;
}

/**
 * Centre the bar under the selection, above it when the camera bar is in the way, always inside the stage.
 * Docked (a phone), it stays at the foot of the stage, over the camera bar, where the thumb is.
 */
function placeQuickBar(el: HTMLElement, a: SelectionAnchor) {
  if (el.dataset.docked === "true") {
    el.style.left = `${Math.round(a.width / 2)}px`;
    el.style.top = `${Math.round(Math.max(STAGE_SIDE_MARGIN, a.height - DOCK_BOTTOM - el.offsetHeight))}px`;
    return;
  }
  const half = el.offsetWidth / 2 || BAR_HEIGHT;
  // Clear of the side drawers lying over the stage, when the space left allows it.
  const covered = el.offsetParent ? getComputedStyle(el.offsetParent) : null;
  let minX = STAGE_SIDE_MARGIN + (parseFloat(covered?.getPropertyValue("--gt-lib-open") ?? "") || 0) + half;
  let maxX = a.width - STAGE_SIDE_MARGIN - (parseFloat(covered?.getPropertyValue("--gt-insp-open") ?? "") || 0) - half;
  if (minX > maxX) [minX, maxX] = [STAGE_SIDE_MARGIN + half, a.width - STAGE_SIDE_MARGIN - half];
  const x = Math.min(Math.max((a.left + a.right) / 2, minX), maxX);
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
  const lockedCount = gems.filter((j) => j.locked).length;
  const allLocked = lockedCount === count;
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

  const heading = count > 1 ? t("studio.editor.context.selected", { count }) : pieceName(gems[0]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={heading}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `min(${cm.x}px, calc(100% - 268px))`, top: `min(${cm.y}px, calc(100% - 376px))` }}
      className="absolute z-40 w-[256px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]"
    >
      <p className="m-0 mb-1 truncate border-b border-[var(--border-subtle)] px-3 pb-2 pt-1.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[var(--text-subtle)]">
        {heading}
      </p>
      {/* Locked pieces: only what leaves them as they are — unlock, duplicate. */}
      {allLocked
        ? item(t("studio.editor.lock.unlock", { count }), LockOpen, () => setPiecesLocked(ids, false))
        : item(t("studio.editor.lock.lock", { count }), Lock, () => setPiecesLocked(ids, true))}
      {lockedCount > 0 && !allLocked && item(t("studio.editor.lock.unlockAll"), LockOpen, () => setPiecesLocked(ids, false))}
      {!allLocked && item(t("studio.editor.context.rotate", { count }), RotateCw, () => rotatePieces(ids))}
      {item(t("studio.editor.context.duplicate", { count }), Copy, () => duplicatePieces(ids))}
      {item(t("studio.editor.context.duplicateMirror", { count }), SquareSplitHorizontal, () => duplicateMirroredPieces(ids))}
      {item(t("studio.editor.context.duplicateMirrorV", { count }), SquareSplitVertical, () => duplicateMirroredPieces(ids, "v"))}
      {!allLocked && item(t("studio.editor.mirror.horizontal"), FlipHorizontal2, () => mirrorSelection("h"))}
      {!allLocked && item(t("studio.editor.mirror.vertical"), FlipVertical2, () => mirrorSelection("v"))}
      {count >= GROUP_MIN_PIECES &&
        item(t("studio.workspace.groups.contextSave", { count }), Layers, () => openWorkspaceDialog({ kind: "saveGroup", pieceIds: ids }))}
      {!allLocked && (
        <>
          <span role="none" className="mx-2 my-1 block h-px bg-[var(--border-subtle)]" />
          {item(t("studio.editor.context.delete", { count }), Trash2, () => removePieces(ids), true)}
        </>
      )}
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
function BottomBar({
  lightPreset,
  lasso,
  multiSelect,
  fullscreen,
  onToggleFullscreen,
}: {
  lightPreset: LightPreset;
  lasso: boolean;
  multiSelect: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const { t } = useEditorLabels();
  const [orbit, setOrbit] = useState(false);
  const [menu, setMenu] = useState<"views" | "lights" | null>(null);
  const view = (v: "front" | "top" | "side" | "reset") => {
    if (v === "reset") setOrbit(false);
    getEngine()?.setView(v, true);
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
        "absolute bottom-4 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1",
        stageCentre,
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
            <span className="@max-[620px]:sr-only">{t("studio.editor.views.label")}</span>
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
            <span className="@max-[620px]:sr-only">{lightName}</span>
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
        <span aria-hidden="true" className="@max-[620px]:hidden">
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
        <span aria-hidden="true" className="@max-[620px]:hidden">
          {t("studio.editor.viewport.lasso")}
        </span>
      </button>
      {/* Shift-click for a finger: tap the gems one by one, wherever they are on the arch. */}
      <button
        type="button"
        aria-pressed={multiSelect}
        aria-label={t("studio.editor.viewport.multi")}
        title={t("studio.editor.viewport.multiHint")}
        onClick={() => studioStore.setMultiSelect(!multiSelect)}
        className={clsx(stageButton, multiSelect && "bg-white text-[var(--gt-ink-900)] hover:bg-white")}
      >
        <ListChecks size={14} aria-hidden="true" />
        <span aria-hidden="true" className="@max-[620px]:hidden">
          {t("studio.editor.viewport.multi")}
        </span>
      </button>
      {sep}
      <StageFullscreenButton active={fullscreen} onToggle={onToggleFullscreen} className={stageButton} />
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

/* ------------------------------------------------------------ phone aids */

/**
 * A gem in hand on a phone: a band across the top of the stage naming it, with
 * a "Done" button big enough for a thumb. The gem stays in hand after each tap
 * on a tooth, so a row of gems is placed without reopening the library.
 */
function ArmedBanner({ name, placed }: { name: string; placed: boolean }) {
  const { t } = useEditorLabels();
  return (
    <div
      role="status"
      className={clsx(
        "absolute left-1/2 top-3 z-[9] flex w-[calc(100%-24px)] max-w-[420px] -translate-x-1/2 items-center gap-3 rounded-[var(--radius-lg)] py-1.5 pl-4 pr-1.5",
        stageGlass,
      )}
    >
      <span aria-hidden="true" className="gt-editor-pulse h-2 w-2 flex-none rounded-full bg-[var(--gt-emerald-400)]" />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-[12.5px] font-bold">{name}</span>
        <span className="truncate text-[11.5px] text-white/80">
          {t(placed ? "studio.editor.viewport.armedTouchMore" : "studio.editor.viewport.armedTouch")}
        </span>
      </span>
      <button
        type="button"
        onClick={() => studioStore.setArmed(null)}
        className="h-11 flex-none rounded-full bg-white px-4 text-[12px] font-bold text-[var(--gt-ink-900)] hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {t("studio.editor.viewport.armedDone")}
      </button>
    </div>
  );
}

/**
 * The loupe on a phone: while a finger drags a piece or a gem from the library,
 * a circle above it shows, magnified, what the fingertip hides. It copies the
 * frame the engine has just drawn (`onLoupe`), so it costs one small image copy
 * per frame and nothing at rest.
 */
function StageLoupe() {
  const { t } = useEditorLabels();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const engine = getEngine();
    if (!engine) return;
    return engine.onLoupe((frame) => {
      const wrap = wrapRef.current;
      const out = canvasRef.current;
      if (!wrap || !out) return;
      if (!frame) {
        wrap.hidden = true;
        return;
      }
      const stage = wrap.parentElement;
      const box = placeLoupe(frame.x, frame.y, stage?.clientWidth ?? 0, stage?.clientHeight ?? 0);
      wrap.style.left = `${box.left}px`;
      wrap.style.top = `${box.top}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.round(LOUPE_SIZE * dpr);
      if (out.width !== px) out.width = out.height = px;
      const ctx = out.getContext("2d");
      if (!ctx) return;
      const src = loupeSource(frame.x, frame.y, frame.pixelRatio);
      ctx.fillStyle = "#e9eef5";
      ctx.fillRect(0, 0, px, px);
      ctx.drawImage(frame.canvas, src.sx, src.sy, src.side, src.side, 0, 0, px, px);
      wrap.hidden = false;
    });
  }, []);
  return (
    <div
      ref={wrapRef}
      hidden
      aria-hidden="true"
      title={t("studio.editor.viewport.loupe")}
      className="pointer-events-none absolute z-[12] overflow-hidden rounded-full border-[3px] border-white shadow-[0_6px_22px_rgba(17,17,17,.35)]"
      style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--gt-emerald-400)] shadow-[0_0_0_1px_rgba(17,17,17,.4)]" />
    </div>
  );
}

const FULLSCREEN_SUGGESTED_KEY = "gt-studio3d-fullscreen-suggested";

/**
 * A phone held sideways leaves the stage little height: after the artist's
 * first camera gesture, once per browser session, the stage offers to fill the
 * screen. The button is the user gesture full screen needs.
 */
function FullscreenSuggestion({ onAccept }: { onAccept: () => void }) {
  const { t } = useEditorLabels();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(FULLSCREEN_SUGGESTED_KEY) !== null;
    } catch {
      /* storage blocked: never nag */
    }
    if (seen) return;
    return getEngine()?.onCameraGesture(() => setShow(true));
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(FULLSCREEN_SUGGESTED_KEY, "1");
    } catch {
      /* the suggestion lasts for this visit */
    }
  };
  if (!show) return null;
  return (
    // Centred between the two panel switches of the stage's top corners.
    <div role="status" className={clsx("absolute top-3 z-[9] flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1 pl-3.5 pr-1 text-[12px] font-semibold", stageCentre, stageGlass)}>
      <span className="whitespace-nowrap">{t("studio.editor.viewport.fullscreenSuggest")}</span>
      <button
        type="button"
        onClick={() => {
          dismiss();
          onAccept();
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-bold text-[var(--gt-ink-900)] hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Maximize2 size={14} aria-hidden="true" />
        {t("studio.editor.viewport.fullscreenSuggestGo")}
      </button>
      <button
        type="button"
        aria-label={t("studio.editor.viewport.fullscreenSuggestDismiss")}
        title={t("studio.editor.viewport.fullscreenSuggestDismiss")}
        onClick={dismiss}
        className="grid h-10 w-10 place-items-center rounded-full text-white/85 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/** A held arrow repeats after this long, then every `NUDGE_REPEAT_MS`. */
const NUDGE_HOLD_MS = 380;
const NUDGE_REPEAT_MS = 110;

/**
 * The phone's nudge pad, beside the docked quick bar: four arrows moving the
 * selection a fraction of a millimetre across the screen (`nudgeSelection`), in
 * the directions the camera sees. A tap is one step; held, it keeps going.
 */
function NudgePad({ ref, id, hidden, onClose }: { ref: React.Ref<HTMLDivElement>; id: string; hidden: boolean; onClose: () => void }) {
  const { t } = useEditorLabels();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const start = (dx: number, dy: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    stop();
    if (!getEngine()?.nudgeSelection(dx, dy)) return;
    const repeat = () => {
      if (!getEngine()?.nudgeSelection(dx, dy)) return stop();
      timer.current = setTimeout(repeat, NUDGE_REPEAT_MS);
    };
    timer.current = setTimeout(repeat, NUDGE_HOLD_MS);
  };
  const arrow = (label: string, Icon: typeof Copy, dx: number, dy: number, area: string) => (
    <button
      style={{ gridArea: area }}
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={start(dx, dy)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      // A keyboard (or a switch device) moves one step per press.
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        getEngine()?.nudgeSelection(dx, dy);
      }}
      className={clsx(
        "grid h-11 w-11 touch-none select-none place-items-center rounded-full bg-[var(--gt-ink-100)] text-[var(--gt-ink-800)] [-webkit-touch-callout:none]",
        "active:bg-[var(--gt-ink-900)] active:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
      )}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={t("studio.editor.viewport.nudge.label")}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        "absolute left-0 top-0 z-[9] grid w-[172px] justify-items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
        hidden && "invisible",
      )}
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ gridTemplateAreas: '". up ." "left . right" ". down ."' }}>
        {arrow(t("studio.editor.viewport.nudge.up"), ArrowUp, 0, 1, "up")}
        {arrow(t("studio.editor.viewport.nudge.left"), ArrowLeft, -1, 0, "left")}
        {arrow(t("studio.editor.viewport.nudge.right"), ArrowRight, 1, 0, "right")}
        {arrow(t("studio.editor.viewport.nudge.down"), ArrowDown, 0, -1, "down")}
      </div>
      <p className="m-0 text-center text-[10.5px] leading-snug text-[var(--text-muted)]">{t("studio.editor.viewport.nudge.hint")}</p>
    </div>
  );
}
