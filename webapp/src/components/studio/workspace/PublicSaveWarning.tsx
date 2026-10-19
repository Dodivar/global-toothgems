import { useCallback } from "react";
import { Globe2, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import type { PublicExposure } from "../../../lib/studioWorkspace/glowbook";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";

/**
 * The warning before saving a creation other people see (decision 99): one in
 * the artist's Glowbook — public as soon as it is saved, no new review — or a
 * published Global Toothgems template, which every Studio member sees at once.
 * Asked on every save of such a creation, from the editor (button, menu,
 * Ctrl+S) and from "Edit details". "Save as new" makes a private copy: no warning.
 */
export function usePublicSaveGuard() {
  const glowbook = useGlowbook();
  const { exposureFor } = glowbook;
  return useCallback(
    async (
      creation: { id: string; name: string; templatePublishedAt?: string | null },
      save: () => void,
      onCancel?: () => void,
    ) => {
      const exposure = await exposureFor(creation.id, creation);
      if (!exposure) {
        save();
        return;
      }
      openWorkspaceDialog({ kind: "confirmPublicSave", exposure, name: creation.name, onConfirm: save, onCancel });
    },
    [exposureFor],
  );
}

export function PublicSaveWarning({
  exposure,
  name,
  onConfirm,
  onClose,
}: {
  exposure: PublicExposure;
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const Icon = exposure === "template" ? LayoutTemplate : Globe2;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`studio.glowbook.saveWarning.${exposure}.title`)}
      description={t(`studio.glowbook.saveWarning.${exposure}.body`, { name })}
      icon={<Icon size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("studio.glowbook.saveWarning.cancel")}
          </Button>
          <Button variant="dark" size="sm" className="ml-auto" onClick={onConfirm}>
            {t(`studio.glowbook.saveWarning.${exposure}.confirm`)}
          </Button>
        </>
      }
    />
  );
}
