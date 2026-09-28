import { useState, type FormEvent } from "react";
import { Layers, PencilLine } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { estimateTotalCents } from "../../../data/studioEditor";
import { useStudio } from "../../../lib/studio3d/store";
import { groupPreviewPieces } from "../../../lib/studioWorkspace/gemGroup";
import type { GemGroup, RecordDetails } from "../../../lib/studioWorkspace/types";
import { validateDetails, type DetailsError } from "../../../lib/studioWorkspace/validation";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { DetailsFields } from "./DetailsFields";
import { HelpHint } from "./HelpHint";
import { ScenePreview } from "./ScenePreview";
import { useTagSuggestions } from "./useTagSuggestions";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * Save the selected pieces as a reusable Gem Group, or edit a saved group's
 * name, description and tags. The arrangement itself is captured from the
 * stage by the engine, relative to the tooth that holds most of it.
 */
export function SaveGemGroupDialog({
  pieceIds,
  group,
  onClose,
}: {
  /** The selection to save (new group). */
  pieceIds?: string[];
  /** The group being edited. */
  group?: GemGroup;
  onClose: () => void;
}) {
  const { t, price } = useWorkspaceFormat();
  const snap = useStudio();
  const { saveSelectionAsGroup, updateGroupDetails } = useWorkspace();
  const suggestions = useTagSuggestions();
  const editing = !!group;

  const selected = snap.jewels.filter((j) => pieceIds?.includes(j.id));
  const previewPieces = group ? groupPreviewPieces(group.data) : selected;
  const count = group ? group.elementCount : selected.length;
  const estimate = group ? group.estimatedPriceMinor : estimateTotalCents(selected);

  const [details, setDetails] = useState<RecordDetails>(() =>
    group ? { name: group.name, description: group.description, tags: group.tags } : { name: "", description: "", tags: [] },
  );
  const [error, setError] = useState<DetailsError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateDetails(details);
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    const ok = group ? await updateGroupDetails(group, details) : !!(await saveSelectionAsGroup(pieceIds ?? [], details));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={editing ? t("studio.workspace.groups.editTitle") : t("studio.workspace.groups.saveTitle", { count })}
      description={editing ? t("studio.workspace.save.editSub") : t("studio.workspace.groups.saveSub")}
      icon={editing ? <PencilLine size={17} /> : <Layers size={17} />}
      closeLabel={t("studio.workspace.close")}
    >
      <form id="gt-save-group" onSubmit={submit} className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <figure className="m-0 grid content-start gap-2">
          <div className="aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
            <ScenePreview pieces={previewPieces} minWidth={20} />
          </div>
          <figcaption className="flex items-start gap-1 text-[12px] leading-snug text-[var(--text-muted)]">
            <span>
              <strong className="text-[var(--text-primary)]">{t("studio.workspace.gems", { count })}</strong>
              <br />
              {t("studio.workspace.estimatedValue", { price: price(estimate) })}
            </span>
            <HelpHint id="groups" className="-mt-0.5 ml-auto" />
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
          placeholders={{
            name: t("studio.workspace.groups.namePlaceholder"),
            description: t("studio.workspace.groups.descriptionPlaceholder"),
          }}
        />
      </form>
      <div className="flex flex-wrap justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("studio.workspace.cancel")}
        </Button>
        <Button type="submit" form="gt-save-group" variant="primary" size="sm" loading={busy} iconLeft={editing ? undefined : Layers}>
          {editing ? t("studio.workspace.save.saveDetails") : t("studio.workspace.groups.createCta")}
        </Button>
      </div>
    </Dialog>
  );
}
