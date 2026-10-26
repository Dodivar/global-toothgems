import { useState, type FormEvent } from "react";
import { PencilLine, Save } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useCompositionEstimate } from "../../../lib/studio3d/useStudioGems";
import { useStudio } from "../../../lib/studio3d/store";
import { collectionIdsOf } from "../../../lib/studioWorkspace/collections";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import type { Creation, RecordDetails } from "../../../lib/studioWorkspace/types";
import { copyName, validateDetails, type DetailsError } from "../../../lib/studioWorkspace/validation";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { CollectionChecklist } from "./Collections";
import { useStudioFeature } from "../../../lib/studioAccess";
import { DetailsFields } from "./DetailsFields";
import { ScenePreview } from "./ScenePreview";
import { useStageCapture } from "./useStageCapture";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * Save the design on the stage as a creation (new, or "save as new"), or edit
 * a saved creation's name and description — after the public-save warning
 * when the creation is in the Glowbook or a published template.
 */
export function SaveCreationDialog({
  mode,
  creation,
  initialDetails,
  onClose,
}: {
  mode: "new" | "saveAsNew" | "edit";
  /** The creation being edited (`edit`). */
  creation?: Creation;
  /** `edit`: the fields as the artist left them, when coming back from the public-save warning. */
  initialDetails?: RecordDetails;
  onClose: () => void;
}) {
  const { t, price } = useWorkspaceFormat();
  const snap = useStudio();
  const { saveDesign, updateCreationDetails, addToCollections, creations, memberships, collectionsStatus } = useWorkspace();
  const { exposureFor } = useGlowbook();
  const source = mode === "saveAsNew" ? creations.find((c) => c.id === snap.active?.creationId) : undefined;

  const [details, setDetails] = useState<RecordDetails>(() =>
    mode === "edit" && creation
      ? (initialDetails ?? { name: creation.name, description: creation.description })
      : source
        ? { name: copyName(source.name, t("studio.workspace.copySuffix")), description: source.description }
        : { name: "", description: "" },
  );
  const [error, setError] = useState<DetailsError | null>(null);
  // A new save can be filed at once; "save as new" starts from the original's collections.
  const [chosen, setChosen] = useState<Set<string>>(() => (source ? collectionIdsOf(source.id, memberships) : new Set()));
  // Filing into folders needs the Artist plan (decision 113 (b)).
  const canFile = useStudioFeature("collections") !== false;
  const filing = mode !== "edit" && collectionsStatus === "ready" && canFile;
  const [busy, setBusy] = useState(false);

  const pieces = mode === "edit" && creation ? creation.scene.pieces : snap.jewels;
  const liveEstimate = useCompositionEstimate(pieces).totalMinor;
  // A saved creation shows the value stored with it; the stage, today's shop prices.
  const estimate = mode === "edit" && creation ? creation.estimatedPriceMinor : liveEstimate;
  // A new save shows the render its card will keep, not the drawn preview.
  const capture = useStageCapture(mode === "edit" ? null : (engine) => engine.captureThumbnail());
  const shown = mode === "edit" ? (creation?.thumbnailUrl ?? null) : (capture ?? null);
  const count = pieces.length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateDetails(details);
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    let ok: boolean;
    if (mode === "edit" && creation) {
      const changed = details.name.trim() !== creation.name || details.description.trim() !== creation.description;
      const exposure = changed ? await exposureFor(creation.id, creation) : null;
      if (exposure) {
        // The warning takes this dialog's place; cancelling it brings the fields back as typed.
        setBusy(false);
        openWorkspaceDialog({
          kind: "confirmPublicSave",
          exposure,
          name: creation.name,
          onConfirm: () => void updateCreationDetails(creation, details),
          onCancel: () => openWorkspaceDialog({ kind: "editCreation", creation, details }),
        });
        return;
      }
      ok = await updateCreationDetails(creation, details);
    } else {
      const saved = await saveDesign("new", details, capture);
      ok = !!saved;
      // The design is saved whatever happens to its filing (reported on its own).
      if (saved && filing && chosen.size) await addToCollections(saved, [...chosen]);
    }
    setBusy(false);
    if (ok) onClose();
  };

  const title =
    mode === "edit"
      ? t("studio.workspace.save.editTitle")
      : mode === "saveAsNew"
        ? t("studio.workspace.save.asNewTitle")
        : t("studio.workspace.save.newTitle");

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={title}
      description={mode === "edit" ? t("studio.workspace.save.editSub") : t("studio.workspace.save.newSub")}
      icon={mode === "edit" ? <PencilLine size={17} /> : <Save size={17} />}
      closeLabel={t("studio.workspace.close")}
    >
      <form id="gt-save-creation" onSubmit={submit} className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <figure className="m-0 grid content-start gap-2">
          <div className="aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
            {shown ? (
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : capture === undefined ? (
              <div className="h-full w-full animate-pulse bg-[var(--gt-blue-100)] motion-reduce:animate-none" />
            ) : (
              <ScenePreview pieces={pieces} />
            )}
          </div>
          <figcaption className="text-[12px] leading-snug text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">{t("studio.workspace.gems", { count })}</strong>
            <br />
            {t("studio.workspace.estimatedValue", { price: price(estimate) })}
          </figcaption>
        </figure>
        <DetailsFields
          value={details}
          onChange={(next) => {
            setDetails(next);
            if (error) setError(validateDetails(next));
          }}
          error={error}
          placeholders={{ name: t("studio.workspace.save.namePlaceholder"), description: t("studio.workspace.save.descriptionPlaceholder") }}
        />
        {filing && (
          <div className="sm:col-start-2">
            <CollectionChecklist
              legend={t("studio.workspace.collections.inSave")}
              checked={chosen}
              onToggle={(collection, on) =>
                setChosen((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(collection.id);
                  else next.delete(collection.id);
                  return next;
                })
              }
            />
          </div>
        )}
      </form>
      <div className="flex flex-wrap justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("studio.workspace.cancel")}
        </Button>
        <Button type="submit" form="gt-save-creation" variant="primary" size="sm" loading={busy} iconLeft={mode === "edit" ? undefined : Save}>
          {mode === "edit" ? t("studio.workspace.save.saveDetails") : t("studio.workspace.save.cta")}
        </Button>
      </div>
    </Dialog>
  );
}
