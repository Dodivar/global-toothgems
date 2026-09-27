import clsx from "clsx";
import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GROUP_MAX_PIECES, GROUP_MIN_PIECES } from "../../../lib/studioWorkspace/gemGroup";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { focusRing } from "./workspaceStyles";

/**
 * The inspector's invitation to turn a multi-selection into a reusable Gem
 * Group. With a single piece selected it only explains how to get there,
 * rather than offering an action that cannot work.
 */
export function SaveSelectionAsGroup({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  const { userId } = useWorkspace();
  const count = ids.length;

  if (count < GROUP_MIN_PIECES) {
    return (
      <p className="m-0 mt-4 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-2.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
        <Layers size={14} aria-hidden="true" className="mt-px flex-none text-[var(--gt-blue-500)]" />
        {t("studio.workspace.groups.needsTwo")}
      </p>
    );
  }

  const tooMany = count > GROUP_MAX_PIECES;
  return (
    <div className="mt-4 grid gap-2.5 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] p-3">
      <p className="m-0 flex items-start gap-2 text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
        <Layers size={15} aria-hidden="true" className="mt-px flex-none text-[var(--gt-blue-600)]" />
        {tooMany ? t("studio.workspace.groups.tooMany", { max: GROUP_MAX_PIECES }) : t("studio.workspace.groups.prompt", { count })}
      </p>
      <button
        type="button"
        disabled={tooMany}
        onClick={() => openWorkspaceDialog(userId ? { kind: "saveGroup", pieceIds: [...ids] } : { kind: "signIn" })}
        className={clsx(
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-4 text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)] disabled:pointer-events-none disabled:opacity-45",
          focusRing,
        )}
      >
        {t("studio.workspace.groups.createCta")}
      </button>
    </div>
  );
}
