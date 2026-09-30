import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { studioSectionPath } from "../../../lib/studioUrl";
import { notify } from "../../../lib/studio3d/notices";
import { studioStore } from "../../../lib/studio3d/store";
import type { Creation, GemGroup } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";

/**
 * Workspace actions that cross from the library back to the stage: they ask
 * before replacing unsaved work, then return to the editor.
 */
export function useWorkspaceActions() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const toEditor = useCallback(() => navigate(studioSectionPath(null)), [navigate]);

  /** Run `then` now, or after the artist agrees to drop the stage's unsaved changes. */
  const guardUnsaved = useCallback(
    (then: () => void) => {
      if (ws.dirty && studioStore.jewels.length) openWorkspaceDialog({ kind: "discardChanges", onConfirm: then });
      else then();
    },
    [ws.dirty],
  );

  const openInStudio = useCallback(
    (c: Creation) => {
      if (studioStore.active?.creationId === c.id) {
        toEditor(); // already on the stage, with its own edits: just go back to it
        return;
      }
      guardUnsaved(() => {
        ws.openCreation(c);
        toEditor();
      });
    },
    [guardUnsaved, ws, toEditor],
  );

  const newDesign = useCallback(() => {
    guardUnsaved(() => {
      ws.startNewDesign();
      toEditor();
      notify("newDesign", undefined, "info");
    });
  }, [guardUnsaved, ws, toEditor]);

  /** Back to the stage, then insert: the engine needs its canvas measured and visible. */
  const insertGroupInStudio = useCallback(
    (g: GemGroup) => {
      toEditor();
      requestAnimationFrame(() => ws.insertGroup(g));
    },
    [ws, toEditor],
  );

  /** Save the stage: into its creation, or through the dialog for a new one. */
  const save = useCallback(
    (mode: "auto" | "saveAsNew" = "auto") => {
      if (!ws.userId) {
        openWorkspaceDialog({ kind: "signIn" });
        return;
      }
      if (!studioStore.jewels.length) {
        notify(studioStore.active ? "saveEmptyLinked" : "saveEmpty", undefined, "warning");
        return;
      }
      if (mode === "saveAsNew" || !studioStore.active) openWorkspaceDialog({ kind: "saveCreation", mode: mode === "saveAsNew" ? "saveAsNew" : "new" });
      else void ws.saveDesign("update");
    },
    [ws],
  );

  return { openInStudio, newDesign, insertGroupInStudio, save, toEditor };
}
