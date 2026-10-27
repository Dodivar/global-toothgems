import { useCallback } from "react";
import { useNavigate } from "../../../lib/navigation";
import { requestHelpTopic, studioHelpPath, type HelpTopicId } from "../../../lib/studioWorkspace/helpTopics";
import { closeWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";

/**
 * Opens the help page on a topic, from any explanation button of the
 * workspace: the dialog in front closes, the stage stays as it is behind.
 */
export function useOpenStudioHelp(): (topic: HelpTopicId) => void {
  const navigate = useNavigate();
  return useCallback(
    (topic: HelpTopicId) => {
      closeWorkspaceDialog();
      requestHelpTopic(topic);
      navigate(studioHelpPath(topic));
    },
    [navigate],
  );
}
