import clsx from "clsx";
import { Copy, FolderOpen, Heart, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { Menu } from "../../ui/Menu";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { ScenePreview } from "./ScenePreview";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { focusRing, iconButton, tagChip, useWorkspaceFormat } from "./workspaceStyles";

/** The saved render when there is one, else the drawn front view of the same scene. */
export function CreationThumb({ creation, className }: { creation: Creation; className?: string }) {
  return creation.thumbnailUrl ? (
    <img src={creation.thumbnailUrl} alt="" loading="lazy" decoding="async" className={clsx("h-full w-full object-cover", className)} />
  ) : (
    <ScenePreview pieces={creation.scene.pieces} className={className} />
  );
}

export function FavoriteButton({ on, name, onToggle, className }: { on: boolean; name: string; onToggle: () => void; className?: string }) {
  const { t } = useWorkspaceFormat();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t(on ? "studio.workspace.unfavorite" : "studio.workspace.favorite", { name })}
      title={t(on ? "studio.workspace.unfavorite" : "studio.workspace.favorite", { name })}
      onClick={onToggle}
      className={clsx(
        "grid h-9 w-9 place-items-center rounded-full border border-white/70 bg-white/80 shadow-[var(--shadow-sm)] backdrop-blur-[6px] transition-[color,transform] duration-[var(--duration-fast)] hover:scale-105",
        on ? "text-[var(--gt-fuchsia-500)]" : "text-[var(--gt-ink-600)] hover:text-[var(--gt-fuchsia-500)]",
        focusRing,
        className,
      )}
    >
      <Heart size={16} aria-hidden="true" fill={on ? "currentColor" : "none"} className={clsx(on && "gt-ws-pop")} />
    </button>
  );
}

/**
 * One saved design in the library: its scene, name, piece count, estimate
 * and last edit, with Open as the obvious action and the rest in the menu.
 */
export function CreationCard({ creation, onStage }: { creation: Creation; onStage: boolean }) {
  const { t, price, ago } = useWorkspaceFormat();
  const ws = useWorkspace();
  const { openInStudio } = useWorkspaceActions();
  const showDetails = () => openWorkspaceDialog({ kind: "creationDetail", creationId: creation.id });

  return (
    <article
      className={clsx(
        "group/card relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-card)] shadow-[var(--shadow-sm)]",
        "transition-[box-shadow,transform,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
        onStage ? "border-[var(--gt-blue-400)]" : "border-[var(--border-subtle)]",
      )}
    >
      <button
        type="button"
        onClick={showDetails}
        aria-label={t("studio.workspace.creations.viewDetails", { name: creation.name })}
        className={clsx("relative block aspect-[4/3] w-full overflow-hidden bg-[var(--gt-blue-100)]", focusRing, "focus-visible:-outline-offset-2")}
      >
        <CreationThumb
          creation={creation}
          className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover/card:scale-[1.035]"
        />
        {onStage && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)]/85 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-white backdrop-blur-[6px]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cta)]" />
            {ws.dirty ? t("studio.workspace.creations.onStageUnsaved") : t("studio.workspace.creations.onStage")}
          </span>
        )}
      </button>
      <FavoriteButton
        on={creation.isFavorite}
        name={creation.name}
        onToggle={() => void ws.toggleCreationFavorite(creation)}
        className="absolute right-3 top-3"
      />

      <div className="flex flex-1 flex-col gap-2 p-4 pb-3">
        <div className="flex items-start gap-2">
          <h3 className="m-0 min-w-0 flex-1 truncate text-[15px] font-[var(--weight-black)] leading-snug tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {creation.name}
          </h3>
          <Menu
            label={t("studio.workspace.creations.actionsFor", { name: creation.name })}
            width={210}
            trigger={(props) => (
              <button type="button" {...props} className={clsx(iconButton, "-mr-2 -mt-1.5 h-8 w-8")}>
                <MoreHorizontal size={17} aria-hidden="true" />
              </button>
            )}
            items={[
              { id: "open", label: t("studio.workspace.actions.open"), icon: FolderOpen, onSelect: () => openInStudio(creation) },
              { id: "duplicate", label: t("studio.workspace.actions.duplicate"), icon: Copy, onSelect: () => void ws.duplicateCreation(creation) },
              {
                id: "rename",
                label: t("studio.workspace.actions.rename"),
                icon: PencilLine,
                onSelect: () => openWorkspaceDialog({ kind: "editCreation", creation }),
              },
              {
                id: "delete",
                label: t("studio.workspace.actions.delete"),
                icon: Trash2,
                destructive: true,
                onSelect: () => openWorkspaceDialog({ kind: "deleteCreation", creation }),
              },
            ]}
          />
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-primary)]">{t("studio.workspace.gems", { count: creation.elementCount })}</span>
          <span aria-hidden="true">·</span>
          <span>{t("studio.workspace.estimatedValue", { price: price(creation.estimatedPriceMinor) })}</span>
        </p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-subtle)]">
            {t("studio.workspace.edited", { when: ago(creation.updatedAt) })}
          </span>
          {creation.tags.slice(0, 1).map((tag) => (
            <span key={tag} className={tagChip}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border-subtle)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => openInStudio(creation)}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] py-2 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-brand-wash)]",
            focusRing,
          )}
        >
          <FolderOpen size={14} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
          {onStage ? t("studio.workspace.actions.backToStage") : t("studio.workspace.actions.openInStudio")}
        </button>
      </div>
    </article>
  );
}
