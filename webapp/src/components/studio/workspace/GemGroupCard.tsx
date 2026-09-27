import clsx from "clsx";
import { Copy, MoreHorizontal, PencilLine, Sparkles, Trash2 } from "lucide-react";
import { Menu } from "../../ui/Menu";
import { groupPreviewPieces } from "../../../lib/studioWorkspace/gemGroup";
import type { GemGroup } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { FavoriteButton } from "./CreationCard";
import { ScenePreview } from "./ScenePreview";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { focusRing, iconButton, tagChip, useWorkspaceFormat } from "./workspaceStyles";

/** One reusable Gem Group: its arrangement, size, estimate and last use; "Use in Studio" first. */
export function GemGroupCard({ group }: { group: GemGroup }) {
  const { t, price, ago } = useWorkspaceFormat();
  const ws = useWorkspace();
  const { insertGroupInStudio } = useWorkspaceActions();

  return (
    <article className="group/card relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--gt-blue-100)]">
        <ScenePreview
          pieces={groupPreviewPieces(group.data)}
          minWidth={18}
          className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover/card:scale-[1.05]"
        />
        <span className="absolute bottom-3 left-3 inline-flex items-center rounded-[var(--radius-pill)] bg-white/85 px-2.5 py-1 text-[11px] font-bold text-[var(--gt-ink-900)] shadow-[var(--shadow-sm)] backdrop-blur-[6px]">
          {t("studio.workspace.gems", { count: group.elementCount })}
        </span>
      </div>
      <FavoriteButton on={group.isFavorite} name={group.name} onToggle={() => void ws.toggleGroupFavorite(group)} className="absolute right-3 top-3" />
      <div className="flex flex-1 flex-col gap-1.5 p-4 pb-3">
        <div className="flex items-start gap-2">
          <h3 className="m-0 min-w-0 flex-1 truncate text-[15px] font-[var(--weight-black)] leading-snug tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {group.name}
          </h3>
          <Menu
            label={t("studio.workspace.creations.actionsFor", { name: group.name })}
            width={200}
            trigger={(props) => (
              <button type="button" {...props} className={clsx(iconButton, "-mr-2 -mt-1.5 h-8 w-8")}>
                <MoreHorizontal size={17} aria-hidden="true" />
              </button>
            )}
            items={[
              { id: "edit", label: t("studio.workspace.actions.edit"), icon: PencilLine, onSelect: () => openWorkspaceDialog({ kind: "editGroup", group }) },
              { id: "duplicate", label: t("studio.workspace.actions.duplicate"), icon: Copy, onSelect: () => void ws.duplicateGroup(group) },
              {
                id: "delete",
                label: t("studio.workspace.actions.delete"),
                icon: Trash2,
                destructive: true,
                onSelect: () => openWorkspaceDialog({ kind: "deleteGroup", group }),
              },
            ]}
          />
        </div>
        {group.description && <p className="m-0 line-clamp-2 text-[12.5px] leading-snug text-[var(--text-muted)]">{group.description}</p>}
        <p className="m-0 text-[12.5px] font-semibold text-[var(--text-primary)]">
          {t("studio.workspace.estimatedValue", { price: price(group.estimatedPriceMinor) })}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-subtle)]">
            {group.lastUsedAt ? t("studio.workspace.groups.lastUsed", { when: ago(group.lastUsedAt) }) : t("studio.workspace.groups.neverUsed")}
          </span>
          {group.tags.slice(0, 1).map((tag) => (
            <span key={tag} className={tagChip}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border-subtle)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => insertGroupInStudio(group)}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] py-2 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-brand-wash)]",
            focusRing,
          )}
        >
          <Sparkles size={14} aria-hidden="true" className="text-[var(--accent-cta-ink)]" />
          {t("studio.workspace.actions.useInStudio")}
        </button>
      </div>
    </article>
  );
}
