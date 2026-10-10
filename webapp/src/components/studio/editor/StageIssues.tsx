import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useEditorLabels } from "./editorLabels";
import type { PlacedJewelry } from "../../../data/studioEditor";
import { getEngine, type IssueFrame } from "../../../lib/studio3d/engine";
import { studioStore, type DesignIssue } from "../../../lib/studio3d/store";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/** A red frame around every piece with a problem, following it as the camera moves. */
export function IssueFrames() {
  const [frames, setFrames] = useState<IssueFrame[]>([]);
  useEffect(() => getEngine()?.onIssueFrames(setFrames), []);
  return (
    <>
      {frames.map((f) => (
        <span
          key={f.id}
          aria-hidden="true"
          className="pointer-events-none absolute z-[4] rounded-[8px] border-2 border-[var(--gt-red-500)] shadow-[0_0_0_3px_rgba(214,69,93,.22)]"
          style={{ left: f.left, top: f.top, width: f.size, height: f.size }}
        />
      ))}
    </>
  );
}

/**
 * The scene's errors, in a corner of the stage: how many pieces overlap
 * another one or do not sit on a tooth, and which — each a button that
 * selects the piece. Collapsible, so it never hides the work for long.
 */
export function IssuePanel({ issues, jewels }: { issues: DesignIssue[]; jewels: PlacedJewelry[] }) {
  const { t, pieceName, toothTag } = useEditorLabels();
  // Open where there is room for it; a phone's small stage — upright or sideways — starts with the header only.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 640px) and (min-height: 561px)").matches,
  );
  const listId = useId();
  const count = issues.length;
  const title = t("studio.editor.viewport.issues.title", { count });
  const toggle = t(open ? "studio.editor.viewport.issues.collapse" : "studio.editor.viewport.issues.expand");
  const problem = (i: DesignIssue) =>
    t(`studio.editor.viewport.issues.${i.overlap && i.offTooth ? "both" : i.offTooth ? "offTooth" : "overlap"}`);

  return (
    <section
      aria-label={title}
      className="absolute left-[calc(var(--gt-lib-open,0px)+12px)] top-3 z-[8] transition-[left] duration-[var(--duration-fast)] w-[min(276px,calc(100%-24px))] rounded-[var(--radius-md)] border border-[var(--gt-red-400)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)] studio-side:top-14"
    >
      <div className="flex items-center gap-2 py-1 pl-3 pr-1">
        <TriangleAlert size={16} aria-hidden="true" className="flex-none text-[var(--gt-red-500)]" />
        <p aria-live="polite" className="m-0 flex-1 text-[12.5px] font-bold text-[var(--status-error-fg)]">
          {title}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={toggle}
          title={toggle}
          onClick={() => setOpen((o) => !o)}
          className={clsx(
            "grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--status-error-bg)]",
            focusRing,
          )}
        >
          <ChevronDown size={15} aria-hidden="true" className={clsx("transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div id={listId} className="border-t border-[var(--border-subtle)] px-2 pb-2 pt-1.5">
          <p className="m-0 px-1 pb-1.5 text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.editor.viewport.issues.hint")}</p>
          <ul className="gt-editor-scroll m-0 grid max-h-[32vh] list-none gap-0.5 overflow-y-auto p-0">
            {issues.map((i) => {
              const j = jewels.find((x) => x.id === i.id);
              if (!j) return null;
              const name = pieceName(j);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    aria-label={t("studio.editor.viewport.issues.select", { name, problem: problem(i) })}
                    onClick={() => studioStore.selectJewel(i.id)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--status-error-bg)]",
                      focusRing,
                    )}
                  >
                    <span className="flex-none rounded-[6px] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[var(--text-muted)]">
                      {toothTag(j.toothId)}
                    </span>
                    <span className="grid min-w-0">
                      <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{name}</span>
                      <span className="truncate text-[11px] text-[var(--status-error-fg)]">{problem(i)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {count > 1 && (
            <button
              type="button"
              onClick={() => studioStore.selectJewels(issues.map((i) => i.id))}
              className={clsx(
                "mt-1.5 inline-flex h-8 w-full items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-default)] text-[11px] font-semibold text-[var(--text-body)] transition-colors hover:border-[var(--border-strong)]",
                focusRing,
              )}
            >
              {t("studio.editor.viewport.issues.selectAll")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
