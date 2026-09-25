import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Copy, FlipHorizontal2, FlipVertical2, Minus, Orbit, Plus, RotateCw, Trash2, TriangleAlert, X } from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { duplicatePieces, importModelFile, mirrorSelection, removePieces, rotatePieces } from "../../../lib/studio3d/actions";
import { getEngine, setEngine, StudioEngine } from "../../../lib/studio3d/engine";
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
    return () => {
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

  return (
    <section
      aria-label={t("studio.editor.viewport.label")}
      className="gt-studio-stage relative isolate h-[58vh] min-h-[380px] min-w-0 overflow-hidden lg:h-auto lg:min-h-0"
    >
      <div ref={hostRef} className="gt-editor-canvas absolute inset-0" />

      {failed && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="grid max-w-[380px] justify-items-center gap-3 text-white">
            <TriangleAlert size={28} aria-hidden="true" className="text-[var(--gt-amber-400)]" />
            <p className="m-0 text-[length:var(--text-body-md)] font-bold">{t("studio.editor.webgl.title")}</p>
            <p className="m-0 text-[length:var(--text-body-sm)] text-white/75">{t("studio.editor.webgl.body")}</p>
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

      {snap.contextMenu && <ContextMenu cm={snap.contextMenu} snap={snap} />}
      {!failed && <BottomBar lightPreset={snap.lightPreset} />}
      <p className="pointer-events-none absolute left-4 top-4 z-[3] m-0 hidden text-[9px] font-bold uppercase tracking-[.24em] text-white/35 xl:block">
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
