import { useState, type FormEvent } from "react";
import { PencilLine, Save } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { estimateTotalCents } from "../../../data/studioEditor";
import { useStudio } from "../../../lib/studio3d/store";
import type { Creation, RecordDetails } from "../../../lib/studioWorkspace/types";
import { copyName, validateDetails, type DetailsError } from "../../../lib/studioWorkspace/validation";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { DetailsFields } from "./DetailsFields";
import { ScenePreview } from "./ScenePreview";
import { useStageCapture } from "./useStageCapture";
import { useTagSuggestions } from "./useTagSuggestions";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * Save the design on the stage as a creation (new, or "save as new"), or edit
 * a saved creation's name, description and tags.
 */
export function SaveCreationDialog({
  mode,
  creation,
  onClose,
}: {
  mode: "new" | "saveAsNew" | "edit";
  /** The creation being edited (`edit`). */
  creation?: Creation;
  onClose: () => void;
}) {
  const { t, price } = useWorkspaceFormat();
  const snap = useStudio();
  const { saveDesign, updateCreationDetails, creations } = useWorkspace();
  const suggestions = useTagSuggestions();
  const source = mode === "saveAsNew" ? creations.find((c) => c.id === snap.active?.creationId) : undefined;

  const [details, setDetails] = useState<RecordDetails>(() =>
    mode === "edit" && creation
      ? { name: creation.name, description: creation.description, tags: creation.tags }
      : source
        ? { name: copyName(source.name, t("studio.workspace.copySuffix")), description: source.description, tags: source.tags }
        : { name: "", description: "", tags: [] },
  );
  const [error, setError] = useState<DetailsError | null>(null);
  const [busy, setBusy] = useState(false);

  const pieces = mode === "edit" && creation ? creation.scene.pieces : snap.jewels;
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
    const ok = mode === "edit" && creation ? await updateCreationDetails(creation, details) : !!(await saveDesign("new", details, capture));
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
            {t("studio.workspace.estimatedValue", { price: price(estimateTotalCents(pieces)) })}
          </figcaption>
        </figure>
        <DetailsFields
          value={details}
          onChange={(next) => {
            setDetails(next);
            if (error) setError(validateDetails(next));
          }}
          error={error}
          suggestions={suggestions}
          placeholders={{ name: t("studio.workspace.save.namePlaceholder"), description: t("studio.workspace.save.descriptionPlaceholder") }}
        />
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
