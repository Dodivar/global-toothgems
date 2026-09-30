import { Save, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { closeWorkspaceDialog, useWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { CreationDetail } from "./CreationDetail";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { FeedbackModal } from "./FeedbackModal";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { SaveCreationDialog } from "./SaveCreationDialog";
import { SaveGemGroupDialog } from "./SaveGemGroupDialog";
import { ShareDialog } from "./ShareDialog";
import { SignInPrompt } from "./SignInPrompt";

/**
 * Hosts whichever workspace dialog is open (see `workspaceUi`). Saving asks
 * for an account first: signed out, a save request becomes the sign-in prompt.
 */
export function WorkspaceDialogs() {
  const dialog = useWorkspaceDialog();
  const ws = useWorkspace();
  const { t } = useTranslation();
  const close = closeWorkspaceDialog;
  if (!dialog) return null;

  const needsAccount = dialog.kind === "saveCreation" || dialog.kind === "saveGroup" || dialog.kind === "signIn";
  if (needsAccount && !ws.userId) {
    return (
      <Dialog open onClose={close} title={t("studio.workspace.signIn.dialogTitle")} icon={<Save size={17} />} closeLabel={t("studio.workspace.close")}>
        <SignInPrompt compact onNavigate={close} />
      </Dialog>
    );
  }

  switch (dialog.kind) {
    case "saveCreation":
      return <SaveCreationDialog mode={dialog.mode} onClose={close} />;
    case "editCreation":
      return <SaveCreationDialog mode="edit" creation={dialog.creation} onClose={close} />;
    case "creationDetail":
      return <CreationDetail creationId={dialog.creationId} onClose={close} />;
    case "shareCreation":
      return <ShareDialog creation={dialog.creation} onClose={close} />;
    case "deleteCreation":
      return (
        <DeleteConfirmation kind="creation" name={dialog.creation.name} onConfirm={() => ws.deleteCreation(dialog.creation)} onClose={close} />
      );
    case "saveGroup":
      return <SaveGemGroupDialog pieceIds={dialog.pieceIds} onClose={close} />;
    case "editGroup":
      return <SaveGemGroupDialog group={dialog.group} onClose={close} />;
    case "deleteGroup":
      return <DeleteConfirmation kind="group" name={dialog.group.name} onConfirm={() => ws.deleteGroup(dialog.group)} onClose={close} />;
    case "feedback":
      return <FeedbackModal onClose={close} />;
    case "onboarding":
      return <OnboardingOverlay onClose={close} />;
    case "discardChanges":
      return (
        <Dialog
          open
          onClose={close}
          title={t("studio.workspace.discard.title")}
          description={t("studio.workspace.discard.body")}
          icon={<TriangleAlert size={17} />}
          closeLabel={t("studio.workspace.close")}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={close}>
                {t("studio.workspace.discard.keep")}
              </Button>
              <Button
                variant="dark"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  close();
                  dialog.onConfirm();
                }}
              >
                {t("studio.workspace.discard.confirm")}
              </Button>
            </>
          }
        />
      );
    case "signIn":
      return null;
  }
}
