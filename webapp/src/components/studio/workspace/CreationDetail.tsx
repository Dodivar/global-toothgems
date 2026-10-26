import { Clapperboard, Copy, FileDown, FolderOpen, Gem, Link2, MoreHorizontal, PencilLine, ScanFace, Trash2 } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { Menu } from "../../ui/Menu";
import { useFormat } from "../../../lib/format";
import { useToast } from "../../../lib/toast";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { CreationCollectionsSummary } from "./Collections";
import { CreationThumb, FavoriteButton } from "./CreationCard";
import { HelpHint } from "./HelpHint";
import { FrontViewSection } from "../FrontViewPanel";
import { usePlacementSheet } from "../usePlacementSheet";
import { GlowbookControl } from "./GlowbookControl";
import { TemplatePublishControl } from "./TemplatePublishControl";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { useWorkspaceFormat } from "./workspaceStyles";

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
  const { showToast } = useToast();
  const placementSheet = usePlacementSheet();
  const creation = ws.creations.find((c) => c.id === creationId);
  if (!creation) return null;

  const facts: [string, string][] = [
    [t("studio.workspace.detail.elements"), count(creation.elementCount)],
    [t("studio.workspace.detail.created"), formatDate(creation.createdAt)],
    [t("studio.workspace.detail.modified"), formatDate(creation.updatedAt)],
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      scrollBody
      title={creation.name}
      icon={<Gem size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={
        // The way into the editor sits on the right, under the thumb on a phone.
        <>
          <Button
            variant="outline"
            size="sm"
            iconLeft={Link2}
            className="flex-1 sm:ml-auto sm:flex-none"
            onClick={() => openWorkspaceDialog({ kind: "shareCreation", creation })}
          >
            {t("studio.workspace.actions.share")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={FolderOpen}
            className="flex-1 sm:flex-none"
            onClick={() => {
              onClose();
              openInStudio(creation);
            }}
          >
            {t("studio.workspace.actions.openInStudio")}
          </Button>
        </>
      }
    >
      <div className="relative -mx-1 -mt-1 aspect-[16/10] max-h-[32dvh] w-full overflow-hidden sm:max-h-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-blue-100)]">
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

      <CreationCollectionsSummary creationId={creation.id} back={{ kind: "creationDetail", creationId: creation.id }} />

      <FrontViewSection pieces={creation.scene.pieces} model={creation.scene.model} />

      <GlowbookControl creation={creation} onLeave={onClose} />

      <TemplatePublishControl creation={creation} />

      {/* The two things people come for, then the rest in one menu: on a
          phone a wall of buttons buried the Glowbook and template blocks. */}
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-4 sm:flex sm:flex-wrap sm:items-center">
        <Button
          variant="outline"
          size="sm"
          iconLeft={ScanFace}
          disabled={creation.elementCount === 0}
          onClick={() => openWorkspaceDialog({ kind: "tryOn", creation })}
        >
          {t("studio.tryOn.action")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          iconLeft={Clapperboard}
          disabled={creation.elementCount === 0}
          onClick={() => openWorkspaceDialog({ kind: "socialExport", creation })}
        >
          {t("studio.socialExport.action")}
        </Button>
        <div className="col-span-2 sm:ml-auto">
          <Menu
            label={t("studio.workspace.creations.actionsFor", { name: creation.name })}
            width={240}
            trigger={(props) => (
              <Button {...props} variant="ghost" size="sm" iconLeft={MoreHorizontal} loading={placementSheet.status === "working"} className="w-full sm:w-auto">
                {t("studio.workspace.actions.more")}
              </Button>
            )}
            items={[
              { id: "duplicate", label: t("studio.workspace.actions.duplicate"), icon: Copy, onSelect: () => void ws.duplicateCreation(creation) },
              {
                id: "placementSheet",
                label: t("studio.placementSheet.action"),
                icon: FileDown,
                disabled: creation.elementCount === 0,
                onSelect: () => {
                  // The menu is gone by the time the PDF is ready: the outcome is said in a toast.
                  if (!placementSheet.ready) {
                    showToast(t("studio.placementSheet.notReady"), undefined, "info");
                    return;
                  }
                  void placementSheet
                    .download({ name: creation.name, pieces: creation.scene.pieces, model: creation.scene.model, modifiedAt: creation.updatedAt })
                    .then((ok) => {
                      if (!ok) showToast(t("studio.placementSheet.error"), undefined, "error");
                    });
                },
              },
              {
                id: "editDetails",
                label: t("studio.workspace.actions.editDetails"),
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
      </div>
    </Dialog>
  );
}
