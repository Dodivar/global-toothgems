import { useId } from "react";
import clsx from "clsx";
import { ColorWheel } from "./ColorWheel";
import { Swatches } from "./EditorInspector";
import { useEditorLabels } from "./editorLabels";
import type { PlacedJewelry } from "../../../data/studioEditor";
import { studioStore } from "../../../lib/studio3d/store";

/**
 * The colour quick action's panel, floating on the stage beside the quick
 * bar: the finishes, and the custom colour wheel right under them. It acts on the whole
 * selection like the inspector does — one undo step per pick, one per drag of
 * the wheel. Positioned by the quick bar, which knows where the selection is.
 */
export function QuickColorPanel({
  ref,
  id,
  selected,
  hidden,
  onClose,
}: {
  ref: React.Ref<HTMLDivElement>;
  id: string;
  selected: PlacedJewelry[];
  hidden: boolean;
  onClose: () => void;
}) {
  const { t } = useEditorLabels();
  const first = selected[0];
  const sharedCustom = first && selected.every((j) => j.customColor && j.customColor === first.customColor) ? first.customColor! : null;
  const customId = useId();
  if (!first) return null;
  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={t("studio.editor.viewport.colorPanel")}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Marked handled, so the editor's own Escape (deselect) leaves the selection alone.
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        "absolute left-0 top-0 z-[9] w-[212px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
        hidden && "invisible",
      )}
    >
      <p className="m-0 mb-2 px-0.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[var(--text-subtle)]">
        {t("studio.editor.viewport.colorPanel")}
      </p>
      <Swatches
        isSelected={(fid) => selected.every((j) => !j.customColor && j.color === fid)}
        onPick={(fid) => {
          studioStore.pushHistory();
          studioStore.updateSelected({ color: fid, customColor: undefined });
        }}
        custom={sharedCustom}
      />
      <div role="group" aria-labelledby={customId} className="mt-2.5 border-t border-[var(--border-subtle)] pt-2">
        <p id={customId} className="m-0 mb-1.5 px-0.5 text-[12px] font-semibold text-[var(--text-body)]">
          {t("studio.editor.viewport.customColor")}
        </p>
        <ColorWheel
          hex={sharedCustom}
          onPick={(hex) => studioStore.updateSelected({ customColor: hex })}
          onClear={() => {
            studioStore.pushHistory();
            studioStore.updateSelected({ customColor: undefined });
          }}
        />
      </div>
    </div>
  );
}
