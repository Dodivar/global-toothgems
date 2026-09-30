import { Copy, FolderOpen, Gem, Link2, PencilLine, Trash2 } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useFormat } from "../../../lib/format";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { CreationThumb, FavoriteButton } from "./CreationCard";
import { HelpHint } from "./HelpHint";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { tagChip, useWorkspaceFormat } from "./workspaceStyles";

/**
 * A focused look at one saved creation: large preview, description, the
 * numbers, and what can be done with it. Deliberately quiet — the design is
 * the content.
 */
export function CreationDetail({ creationId, onClose }: { creationId: string; onClose: () => void }) {
  const { formatDate } = useFormat();
  const { t, price, count } = useWorkspaceFormat();
  const ws = useWorkspace();
  const { openInStudio } = useWorkspaceActions();
  const creation = ws.creations.find((c) => c.id === creationId);
  if (!creation) return null;

  const facts: [string, string][] = [
    [t("studio.workspace.detail.elements"), count(creation.elementCount)],
    [t("studio.workspace.detail.created"), formatDate(creation.createdAt)],
    [t("studio.workspace.detail.modified"), formatDate(creation.updatedAt)],
  ];

  return (
    <Dialog open onClose={onClose} size="lg" title={creation.name} icon={<Gem size={17} />} closeLabel={t("studio.workspace.close")}>
      <div className="relative -mx-1 -mt-1 aspect-[16/10] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-blue-100)]">
        <CreationThumb creation={creation} />
        <FavoriteButton
          on={creation.isFavorite}
          name={creation.name}
          onToggle={() => void ws.toggleCreationFavorite(creation)}
          className="absolute right-3 top-3"
        />
      </div>

      {creation.description ? (
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-primary)]">{creation.description}</p>
      ) : (
        <p className="m-0 text-[length:var(--text-body-sm)] italic text-[var(--text-subtle)]">{t("studio.workspace.detail.noDescription")}</p>
      )}

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-4">
        <div className="grid gap-0.5">
          <dt className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
            {t("studio.workspace.detail.estimate")}
            <HelpHint id="estimate" className="-my-1 h-5 w-5" />
          </dt>
          <dd className="m-0 text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{price(creation.estimatedPriceMinor)}</dd>
        </div>
        {facts.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{label}</dt>
            <dd className="m-0 text-[13.5px] font-semibold text-[var(--text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>

      {creation.tags.length > 0 && (
        <ul aria-label={t("studio.workspace.details.tags")} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {creation.tags.map((tag) => (
            <li key={tag} className={tagChip}>
              {tag}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
        <Button
          variant="primary"
          size="sm"
          iconLeft={FolderOpen}
          onClick={() => {
            onClose();
            openInStudio(creation);
          }}
        >
          {t("studio.workspace.actions.openInStudio")}
        </Button>
        <Button variant="outline" size="sm" iconLeft={Copy} onClick={() => void ws.duplicateCreation(creation)}>
          {t("studio.workspace.actions.duplicate")}
        </Button>
        <Button variant="outline" size="sm" iconLeft={Link2} onClick={() => openWorkspaceDialog({ kind: "shareCreation", creation })}>
          {t("studio.workspace.actions.share")}
        </Button>
        <Button variant="ghost" size="sm" iconLeft={PencilLine} onClick={() => openWorkspaceDialog({ kind: "editCreation", creation })}>
          {t("studio.workspace.actions.editDetails")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={Trash2}
          className="text-[var(--status-error-fg)] sm:ml-auto"
          onClick={() => openWorkspaceDialog({ kind: "deleteCreation", creation })}
        >
          {t("studio.workspace.actions.delete")}
        </Button>
      </div>
    </Dialog>
  );
}
