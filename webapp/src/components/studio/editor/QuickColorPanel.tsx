import clsx from "clsx";
import { ColorOptions } from "./GemPickers";
import { useEditorLabels } from "./editorLabels";
import type { PlacedJewelry } from "../../../data/studioEditor";

/**
 * The colour quick action's panel, floating on the stage beside the quick
 * bar: the colours the shop sells this cut in. It acts on the whole selection
 * like the inspector does — one undo step per pick. Positioned by the quick
 * bar, which knows where the selection is.
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
  if (!selected.length) return null;
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
        "absolute left-0 top-0 z-[9] max-h-[320px] w-[232px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
        hidden && "invisible",
      )}
    >
      <p className="m-0 mb-2 px-0.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[var(--text-subtle)]">
        {t("studio.editor.viewport.colorPanel")}
      </p>
      <ColorOptions selected={selected} />
    </div>
  );
}
