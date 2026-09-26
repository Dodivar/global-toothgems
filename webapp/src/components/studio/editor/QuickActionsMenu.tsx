import { useState } from "react";
import clsx from "clsx";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { EditorPopover, PopoverItem, PopoverLabel, PopoverSeparator } from "./EditorPopover";
import { useEditorLabels } from "./editorLabels";
import {
  QUICK_ACTIONS,
  resetQuickActions,
  setQuickActionsEnabled,
  toggleQuickAction,
  useQuickActions,
} from "../../../lib/studio3d/quickActions";

const row = clsx(
  "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-brand-wash)]",
  "has-[:disabled]:cursor-default has-[:disabled]:opacity-45 has-[:disabled]:hover:bg-transparent",
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
);
const box = "h-4 w-4 flex-none accent-[var(--gt-blue-600)] outline-none";

/** Toolbar menu choosing the quick actions that float beside the selection on the stage. */
export function QuickActionsMenu({ triggerClassName }: { triggerClassName: string }) {
  const { t } = useEditorLabels();
  const [open, setOpen] = useState(false);
  const prefs = useQuickActions();

  return (
    <EditorPopover
      label={t("studio.editor.quickActions.title")}
      open={open}
      onOpenChange={setOpen}
      width={256}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={triggerClassName}
          aria-label={t("studio.editor.quickActions.menu")}
          title={t("studio.editor.quickActions.menu")}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>
      )}
    >
      <PopoverLabel>{t("studio.editor.quickActions.title")}</PopoverLabel>
      <p className="m-0 px-2.5 pb-1.5 text-[11.5px] font-medium leading-snug text-[var(--text-muted)]">
        {t("studio.editor.quickActions.hint")}
      </p>
      <label className={row}>
        <input
          type="checkbox"
          role="switch"
          className={box}
          checked={prefs.enabled}
          onChange={(e) => setQuickActionsEnabled(e.target.checked)}
        />
        {t("studio.editor.quickActions.show")}
      </label>
      <PopoverSeparator />
      <fieldset className="m-0 grid min-w-0 border-0 p-0" disabled={!prefs.enabled}>
        <legend className="contents">
          <PopoverLabel>{t("studio.editor.quickActions.choose")}</PopoverLabel>
        </legend>
        {QUICK_ACTIONS.map((id) => (
          <label key={id} className={row}>
            <input type="checkbox" className={box} checked={prefs.actions.includes(id)} onChange={() => toggleQuickAction(id)} />
            {t(`studio.editor.quickActions.${id}`)}
          </label>
        ))}
      </fieldset>
      <PopoverSeparator />
      <PopoverItem icon={<RotateCcw size={14} />} label={t("studio.editor.quickActions.reset")} onClick={resetQuickActions} />
    </EditorPopover>
  );
}
