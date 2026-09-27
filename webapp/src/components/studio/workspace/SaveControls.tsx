import { useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, CopyPlus, FilePlus2, PencilLine, Save } from "lucide-react";
import { useStudio } from "../../../lib/studio3d/store";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { EditorPopover, PopoverItem, PopoverSeparator } from "../editor/EditorPopover";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { focusRing, useWorkspaceFormat } from "./workspaceStyles";

/**
 * The editor's primary action: "Save creation" for a new design, "Save
 * changes" once it is linked to a saved creation, a calm "Saved" when there
 * is nothing to store. The chevron holds the rest: save as new, edit the
 * details, start a new design.
 */
export function SaveControls() {
  const { t } = useWorkspaceFormat();
  const snap = useStudio();
  const ws = useWorkspace();
  const { save, newDesign } = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  const linked = ws.creations.find((c) => c.id === snap.active?.creationId);
  const clean = !!snap.active && !ws.dirty;
  const busy = ws.saveState === "saving";

  const label = !snap.active ? t("studio.workspace.save.cta") : clean ? t("studio.workspace.save.saved") : t("studio.workspace.save.changes");
  // The bar is narrow: the button says it briefly, its accessible name in full.
  const shortLabel = !snap.active || clean ? label : t("studio.workspace.save.changesShort");
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className={clsx("inline-flex h-9 flex-none items-stretch rounded-[var(--radius-pill)]", clean ? "bg-[var(--status-success-bg)]" : "bg-[var(--accent-cta)]")}>
      <button
        type="button"
        onClick={() => save("auto")}
        disabled={clean || busy}
        aria-label={label}
        title={t("studio.workspace.save.shortcut")}
        className={clsx(
          "gt-studio-cta inline-flex items-center gap-1.5 rounded-l-[var(--radius-pill)] pl-3 pr-2.5 text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] transition-colors sm:pl-3.5",
          clean ? "text-[var(--accent-cta-ink)]" : "text-[var(--text-on-accent)] hover:bg-[var(--accent-cta-hover)]",
          "disabled:cursor-default",
          focusRing,
        )}
      >
        {clean ? <Check size={14} aria-hidden="true" className="gt-ws-pop" /> : <Save size={14} aria-hidden="true" />}
        <span className="hidden sm:inline">{busy ? t("studio.workspace.status.saving") : shortLabel}</span>
      </button>
      <span aria-hidden="true" className={clsx("my-2 w-px", clean ? "bg-[var(--gt-emerald-300)]" : "bg-[var(--gt-emerald-600)]/25")} />
      <EditorPopover
        label={t("studio.workspace.save.more")}
        open={open}
        onOpenChange={setOpen}
        width={270}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={t("studio.workspace.save.more")}
            title={t("studio.workspace.save.more")}
            className={clsx(
              "inline-grid h-full w-8 place-items-center rounded-r-[var(--radius-pill)] transition-colors",
              clean ? "text-[var(--accent-cta-ink)] hover:bg-[var(--gt-emerald-300)]/40" : "text-[var(--text-on-accent)] hover:bg-[var(--accent-cta-hover)]",
              focusRing,
            )}
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      >
        {snap.active && (
          <PopoverItem
            icon={<Save size={14} />}
            label={t("studio.workspace.save.changes")}
            sub={clean ? t("studio.workspace.save.nothingToSave") : t("studio.workspace.save.changesSub", { name: snap.active.name })}
            onClick={() => run(() => save("auto"))}
          />
        )}
        {!snap.active && (
          <PopoverItem icon={<Save size={14} />} label={t("studio.workspace.save.cta")} sub={t("studio.workspace.save.ctaSub")} onClick={() => run(() => save("auto"))} />
        )}
        {snap.active && (
          <PopoverItem
            icon={<CopyPlus size={14} />}
            label={t("studio.workspace.save.asNewTitle")}
            sub={t("studio.workspace.save.asNewSub")}
            onClick={() => run(() => save("saveAsNew"))}
          />
        )}
        {linked && (
          <PopoverItem
            icon={<PencilLine size={14} />}
            label={t("studio.workspace.actions.editDetails")}
            onClick={() => run(() => openWorkspaceDialog({ kind: "editCreation", creation: linked }))}
          />
        )}
        <PopoverSeparator />
        <PopoverItem icon={<FilePlus2 size={14} />} label={t("studio.workspace.creations.newDesign")} onClick={() => run(newDesign)} />
      </EditorPopover>
    </div>
  );
}
