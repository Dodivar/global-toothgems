import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { getEngine } from "../../../lib/studio3d/engine";
import type { StudioSnapshot } from "../../../lib/studio3d/store";
import { studioSectionPath } from "../../../lib/studioUrl";
import { groupPreviewPieces } from "../../../lib/studioWorkspace/gemGroup";
import { queryGroups } from "../../../lib/studioWorkspace/library";
import type { GemGroup } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { useEditorLabels } from "../editor/editorLabels";
import { HelpHint } from "./HelpHint";
import { ScenePreview } from "./ScenePreview";
import { SignInPrompt } from "./SignInPrompt";
import { focusRing, useWorkspaceFormat } from "./workspaceStyles";

/** Pointer travel before a press on a group becomes a drag. */
const DRAG_THRESHOLD_PX = 6;

interface DragState {
  group: GemGroup;
  x: number;
  y: number;
  tooth: string | null;
}

/**
 * "My Groups" inside the editor's library panel: the saved Gem Groups, ready
 * to drop onto the smile. Tap (or Enter) inserts a group on the selected
 * tooth — or where it was made; dragging one over the stage lights up the
 * tooth it will land on before letting go. The engine does the placing, so a
 * group follows the same collision rules as a single gem.
 */
export function GemGroupPanel({ snap }: { snap: StudioSnapshot }) {
  const { t, price } = useWorkspaceFormat();
  const { toothName } = useEditorLabels();
  const ws = useWorkspace();
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);

  const selectedPiece = snap.jewels.find((j) => j.id === snap.selectedJewelIds[0]);
  const selectedTooth =
    snap.selectedToothId && snap.selectedToothId !== FREE_TOOTH
      ? snap.selectedToothId
      : selectedPiece && selectedPiece.toothId !== FREE_TOOTH
        ? selectedPiece.toothId
        : null;

  // Leaving the panel mid-drag must not leave a tooth lit.
  useEffect(() => () => getEngine()?.previewDropTooth(null), []);

  const beginPress = (group: GemGroup, e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType === "touch") return; // touch: a tap inserts, a swipe scrolls the list
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    let tooth: string | null = null;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      const engine = getEngine();
      tooth = engine?.toothAt(ev.clientX, ev.clientY) ?? null;
      engine?.previewDropTooth(tooth);
      setDrag({ group, x: ev.clientX, y: ev.clientY, tooth });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", cancelOnEscape, true);
      if (!dragging) return;
      // Released over the tile, the browser follows with a click that must not
      // insert a second copy; released elsewhere, no click comes. Either way the
      // guard only lives until the next tick.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      });
      getEngine()?.previewDropTooth(null);
      setDrag(null);
      if (ev.type === "pointerup" && tooth) ws.insertGroup(group, tooth);
    };
    const cancelOnEscape = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !dragging) return;
      ev.stopPropagation();
      tooth = null;
      end(new PointerEvent("pointercancel"));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", cancelOnEscape, true);
  };

  const insert = (group: GemGroup) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    ws.insertGroup(group, selectedTooth);
  };

  if (ws.status === "signedOut") return <SignInPrompt compact />;

  const groups = queryGroups(ws.groups, "");

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-1.5">
        <p className="m-0 flex-1 text-[12px] leading-snug text-[var(--text-muted)]">
          {selectedTooth
            ? t("studio.workspace.panel.hintTooth", { tooth: toothName(selectedTooth), fdi: selectedTooth })
            : t("studio.workspace.panel.hint")}
        </p>
        <HelpHint id="groups" align="end" />
      </div>

      {ws.status === "loading" && (
        <ul aria-hidden="true" className="m-0 grid list-none gap-2 p-0">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[62px] animate-pulse rounded-[var(--radius-md)] bg-[var(--gt-blue-50)] motion-reduce:animate-none" />
          ))}
        </ul>
      )}

      {ws.status === "ready" && groups.length === 0 && (
        <div className="grid justify-items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--gt-blue-300)] p-3.5">
          <Layers size={18} aria-hidden="true" className="text-[var(--gt-blue-500)]" />
          <p className="m-0 text-[12.5px] font-bold text-[var(--text-primary)]">{t("studio.workspace.panel.emptyTitle")}</p>
          <p className="m-0 text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.workspace.panel.emptyBody")}</p>
        </div>
      )}

      {groups.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onPointerDown={(e) => beginPress(g, e)}
                onClick={() => insert(g)}
                title={t("studio.workspace.panel.tileHint", { name: g.name })}
                className={clsx(
                  "flex w-full cursor-grab items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-1.5 pr-3 text-left transition-[border-color,box-shadow,transform] duration-[var(--duration-fast)]",
                  "hover:-translate-y-px hover:border-[var(--gt-blue-300)] hover:shadow-[var(--shadow-sm)] active:cursor-grabbing lg:touch-none",
                  drag?.group.id === g.id && "opacity-50",
                  focusRing,
                )}
              >
                <span className="h-[50px] w-[66px] flex-none overflow-hidden rounded-[var(--radius-sm)] border border-white">
                  <ScenePreview pieces={groupPreviewPieces(g.data)} minWidth={16} />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-[12.5px] font-bold text-[var(--text-primary)]">{g.name}</span>
                  <span className="truncate text-[11.5px] text-[var(--text-muted)]">
                    {t("studio.workspace.gems", { count: g.elementCount })} · {price(g.estimatedPriceMinor)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        to={studioSectionPath("groups")}
        className={clsx(
          "inline-flex items-center gap-1.5 justify-self-start rounded-[var(--radius-sm)] text-[12px] font-semibold text-[var(--gt-blue-700)] hover:underline",
          focusRing,
        )}
      >
        {t("studio.workspace.panel.manage")}
        <ArrowRight size={13} aria-hidden="true" />
      </Link>

      {drag &&
        createPortal(
          <div
            aria-hidden="true"
            style={{ left: drag.x + 14, top: drag.y + 14 }}
            className="gt-editor-chip pointer-events-none fixed z-[600] grid gap-0.5 rounded-[var(--radius-md)] border border-white/70 bg-white/90 px-3 py-2 shadow-[var(--shadow-lg)] backdrop-blur-[8px]"
          >
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--gt-ink-900)]">
              <Layers size={13} className="text-[var(--gt-blue-600)]" />
              {drag.group.name}
              <span className="font-semibold text-[var(--text-muted)]">· {t("studio.workspace.gems", { count: drag.group.elementCount })}</span>
            </span>
            <span className={clsx("text-[11.5px] font-semibold", drag.tooth ? "text-[var(--accent-cta-ink)]" : "text-[var(--text-subtle)]")}>
              {drag.tooth ? t("studio.workspace.panel.dropOn", { tooth: toothName(drag.tooth), fdi: drag.tooth }) : t("studio.workspace.panel.dragOver")}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
