import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Enters or leaves full screen on a Studio stage (the editor's and the shared
 * design's), pressed while the stage fills the screen. Styled by the stage's
 * own bar through `className`.
 */
export function StageFullscreenButton({ active, onToggle, className }: { active: boolean; onToggle: () => void; className: string }) {
  const { t } = useTranslation();
  const label = t(active ? "studio.editor.fullscreen.exit" : "studio.editor.fullscreen.enter");
  const Icon = active ? Minimize2 : Maximize2;
  return (
    <button type="button" aria-pressed={active} aria-label={label} title={label} onClick={onToggle} className={className}>
      <Icon size={14} aria-hidden="true" />
    </button>
  );
}
