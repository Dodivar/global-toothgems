import { FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../../lib/toast";
import { studioStore } from "../../../lib/studio3d/store";
import { usePlacementSheet } from "../usePlacementSheet";
import { PopoverItem } from "./EditorPopover";

/**
 * "Placement sheet · PDF" in the editor's Export menu: the sheet of the
 * design on the stage, as it is now. The menu closes at once; the result is
 * said in a toast, since the menu that asked is gone by then.
 */
export function PlacementSheetMenuItem({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { download, ready } = usePlacementSheet();
  return (
    <PopoverItem
      icon={<FileDown size={14} />}
      label={t("studio.placementSheet.action")}
      sub={t("studio.placementSheet.actionSub")}
      onClick={() => {
        const pieces = studioStore.jewels;
        onDone();
        if (!pieces.length) {
          showToast(t("studio.frontView.empty"), undefined, "warning");
          return;
        }
        if (!ready) {
          showToast(t("studio.placementSheet.notReady"), undefined, "info");
          return;
        }
        void download({
          name: studioStore.active?.name || t("studio.workspace.untitled"),
          pieces,
          model: studioStore.modelMode,
        }).then((ok) => {
          if (!ok) showToast(t("studio.placementSheet.error"), undefined, "error");
        });
      }}
    />
  );
}
