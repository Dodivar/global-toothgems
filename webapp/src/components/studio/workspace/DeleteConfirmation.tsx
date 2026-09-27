import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";

/**
 * "Delete this creation?" — the one confirmation in front of every deletion
 * in the workspace. Calm, but unmistakable: the destructive button is the
 * solid red one, Cancel comes first and takes the focus.
 */
export function DeleteConfirmation({
  kind,
  name,
  onConfirm,
  onClose,
}: {
  kind: "creation" | "group";
  name: string;
  /** Resolves true when the deletion went through. */
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open
      tone="danger"
      onClose={onClose}
      title={t(`studio.workspace.delete.${kind}Title`)}
      description={t("studio.workspace.delete.cannotUndo")}
      icon={<Trash2 size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("studio.workspace.cancel")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
            loading={busy}
            iconLeft={Trash2}
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm();
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {t("studio.workspace.delete.confirm")}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t(`studio.workspace.delete.${kind}Body`, { name })}
      </p>
    </Dialog>
  );
}
