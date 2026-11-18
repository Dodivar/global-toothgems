import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Redo2, Undo2 } from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import { studioStore, useStudioSelector } from "../../../lib/studio3d/store";
import { heightOf, settleSnap, sheetHeights, stageHeight, toggledSnap, type SheetSnap } from "../../../lib/studio3d/phoneSheet";

type SheetTab = "library" | "inspector";

/** As long as the sheet's own slide (`transition` below). */
const SLIDE_MS = 220;
/** A press that moves less than this is a tap on the handle, not a drag. */
const DRAG_SLOP = 5;

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * The 3D Studio editor on a phone held upright (`phoneLayout.ts`): the stage
 * stays on screen and the library and the settings share a bottom sheet,
 * instead of the page scrolling the stage away under two long panels.
 *
 * The sheet stands at three heights (`phoneSheet.ts`): its header alone (the
 * handle, the two tabs, Undo and Redo — all within the thumb's reach), half
 * open, or over the whole stage. The handle is tapped or dragged; a tab opens a
 * closed sheet. A gem tapped in the library folds the sheet away, so the next tap lands
 * on a tooth. Both panels stay mounted (search, filters and scroll kept): the
 * one not shown is only hidden.
 *
 * The stage is resized only when the sheet settles, never during a drag, so the
 * 3D canvas does not reallocate its buffers frame after frame.
 */
export function PhoneEditorLayout({ stage, library, inspector }: { stage: ReactNode; library: ReactNode; inspector: ReactNode }) {
  const { t } = useEditorLabels();
  const areaRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState(0);
  const [peek, setPeek] = useState(76);
  // An empty design opens on the library: picking a gem is the first thing to do.
  const [snap, setSnap] = useState<SheetSnap>(() => (studioStore.jewels.length ? "peek" : "half"));
  // The stage follows the sheet: at once when the sheet shrinks (it slides over the
  // stage's new room), once the slide is over when it grows (no gap under the stage).
  const [stageSnap, setStageSnap] = useState<SheetSnap>(snap);
  const [prevSignal, setPrevSignal] = useState<string | null>(null);
  const [tab, setTab] = useState<SheetTab>("library");
  const [dragging, setDragging] = useState(false);

  const armed = useStudioSelector((s) => s.armedTypeId);
  const selectedCount = useStudioSelector((s) => s.selectedJewelIds.length);
  const toothSelected = useStudioSelector((s) => !!s.selectedToothId && s.selectedJewelIds.length === 0);
  const canUndo = useStudioSelector((s) => s.canUndo);
  const canRedo = useStudioSelector((s) => s.canRedo);

  const heights = sheetHeights(area, peek);

  // A shrinking sheet gives the stage its room at once (adjusted while rendering, the way a
  // prop change is); a growing one, once its slide is over (below).
  if (heightOf(snap, heights) < heightOf(stageSnap, heights)) setStageSnap(snap);

  // A gem taken in hand with a tap wants the stage: the sheet folds away. Not a drag from a
  // card — the first move of a finger scrolling the list starts one before the browser takes
  // the gesture over, and the list must not fold away under a scroll.
  if (armed !== prevSignal) {
    setPrevSignal(armed);
    if (armed && snap !== "peek") setSnap("peek");
  }

  // The editor's area and the header's height, as the phone turns or the browser's bars come and go.
  useLayoutEffect(() => {
    const measure = () => {
      setArea(areaRef.current?.clientHeight ?? 0);
      setPeek((headerRef.current?.offsetHeight ?? 0) + (safeRef.current?.offsetHeight ?? 0) || 76);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (areaRef.current) ro.observe(areaRef.current);
    if (headerRef.current) ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (snap === stageSnap) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setStageSnap(snap), still ? 0 : SLIDE_MS);
    return () => clearTimeout(timer);
  }, [snap, stageSnap]);

  /* -- the handle: a tap opens or closes, a drag follows the finger and settles -- */
  const drag = useRef<{
    id: number;
    startY: number;
    startH: number;
    moved: boolean;
    onHandle: boolean;
    samples: { y: number; t: number }[];
  } | null>(null);
  const setLiveHeight = (h: number | null) => {
    const el = sheetRef.current;
    if (el) el.style.height = h === null ? "" : `${Math.round(h)}px`;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // The tabs and the history buttons are buttons; the rest of the header is the handle.
    const button = (e.target as HTMLElement).closest("button");
    if (button && !button.dataset.sheetHandle) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      startH: heightOf(snap, heights),
      moved: false,
      onHandle: !!button,
      samples: [{ y: e.clientY, t: e.timeStamp }],
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 5) d.samples.shift();
    setLiveHeight(Math.min(heights.full, Math.max(heights.peek, d.startH + (d.startY - e.clientY))));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      // A tap on the handle itself (not a gap between the buttons).
      if (d.onHandle) setSnap(toggledSnap(snap));
      return;
    }
    const first = d.samples[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const velocity = (first.y - e.clientY) / dt; // growing when the finger goes up
    const height = Math.min(heights.full, Math.max(heights.peek, d.startH + (d.startY - e.clientY)));
    setDragging(false);
    setLiveHeight(null);
    setSnap(settleSnap(height, velocity, heights));
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDragging(false);
    setLiveHeight(null);
  };

  const openTab = (next: SheetTab) => {
    setTab(next);
    if (snap === "peek") setSnap("half");
  };

  const sheetHeight = area ? heightOf(snap, heights) : undefined;
  const stageStyle = area ? { height: stageHeight(area, stageSnap, heights) } : undefined;
  const expanded = snap !== "peek";
  const handleLabel = t(expanded ? "studio.editor.phoneSheet.collapse" : "studio.editor.phoneSheet.expand");

  const tabButton = (id: SheetTab) => {
    const active = tab === id;
    const badge = id === "inspector" && (selectedCount > 0 || toothSelected);
    return (
      <button
        type="button"
        role="tab"
        id={`gt-phone-sheet-tab-${id}`}
        aria-selected={active}
        aria-controls={`gt-phone-sheet-panel-${id}`}
        data-tour={id === "library" ? "library-toggle" : "inspector-toggle"}
        onClick={() => openTab(id)}
        className={clsx(
          "relative inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] text-[13px] font-bold transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]",
          ring,
          active && expanded ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--gt-ink-600)]",
        )}
      >
        <span className="truncate">{t(`studio.editor.panels.${id}.name`)}</span>
        {badge && (
          <span
            className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gt-emerald-400)] px-1 text-[10.5px] font-black tabular-nums text-[var(--gt-ink-900)]"
            aria-label={selectedCount > 0 ? t("studio.editor.phoneSheet.selected", { count: selectedCount }) : t("studio.editor.phoneSheet.tooth")}
          >
            {selectedCount > 0 ? selectedCount : "•"}
          </span>
        )}
      </button>
    );
  };
  const historyButton = (label: string, Icon: typeof Undo2, disabled: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "grid h-11 w-11 flex-none place-items-center rounded-full text-[var(--gt-ink-700)] transition-colors hover:bg-[var(--gt-ink-100)] disabled:opacity-35",
        ring,
      )}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );

  return (
    <div ref={areaRef} className="relative min-h-0 flex-1 overflow-clip">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]" style={stageStyle}>
        {stage}
      </div>
      <section
        ref={sheetRef}
        aria-label={t("studio.editor.phoneSheet.label")}
        className={clsx(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-clip rounded-t-[20px] border-t border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[0_-10px_30px_rgba(17,17,17,.12)]",
          !dragging && "motion-safe:transition-[height] motion-safe:duration-[220ms] motion-safe:ease-[var(--ease-out-soft)]",
        )}
        style={{ height: sheetHeight }}
      >
        <div
          ref={headerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="flex-none touch-none select-none px-2 pb-2"
        >
          <button
            type="button"
            data-sheet-handle="true"
            aria-expanded={expanded}
            aria-label={handleLabel}
            title={t("studio.editor.phoneSheet.handle")}
            onClick={(e) => {
              // Pointer taps are handled by the header (a drag must not also toggle); the keyboard's here.
              if (e.detail === 0) setSnap(toggledSnap(snap));
            }}
            className={clsx("mx-auto flex h-5 w-24 items-center justify-center rounded-full", ring)}
          >
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[var(--gt-ink-300)]" />
          </button>
          <div className="flex items-center gap-1">
            <div role="tablist" aria-label={t("studio.editor.phoneSheet.tabsLabel")} className="flex min-w-0 flex-1 gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] p-1">
              {tabButton("library")}
              {tabButton("inspector")}
            </div>
            {historyButton(t("studio.editor.undo"), Undo2, !canUndo, () => studioStore.undo())}
            {historyButton(t("studio.editor.redo"), Redo2, !canRedo, () => studioStore.redo())}
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {(["library", "inspector"] as const).map((id) => (
            <div
              key={id}
              id={`gt-phone-sheet-panel-${id}`}
              role="tabpanel"
              aria-labelledby={`gt-phone-sheet-tab-${id}`}
              inert={tab !== id || !expanded}
              className={clsx("absolute inset-0 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]", tab !== id && "invisible")}
            >
              {id === "library" ? library : inspector}
            </div>
          ))}
        </div>
        <div ref={safeRef} aria-hidden="true" className="h-[env(safe-area-inset-bottom)] flex-none" />
      </section>
    </div>
  );
}
