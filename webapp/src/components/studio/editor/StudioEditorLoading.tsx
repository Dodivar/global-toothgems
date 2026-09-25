import { useTranslation } from "react-i18next";
import { Box } from "lucide-react";

/**
 * Shown while the editor's chunk (three.js and the editor) downloads.
 * Kept out of the lazy chunk on purpose: it has to render before it arrives.
 */
export function StudioEditorLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" className="gt-studio-stage grid min-h-[100dvh] place-items-center p-6 text-center text-white">
      <div className="grid justify-items-center gap-3">
        <Box size={26} aria-hidden="true" className="text-[var(--gt-blue-300)] motion-safe:animate-pulse" />
        <p className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)]">{t("studio.editor.appName")}</p>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-white/60">
          {t("studio.editor.loading")}
        </p>
      </div>
    </div>
  );
}
