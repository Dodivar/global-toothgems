import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";

/**
 * Shown while the editor's chunk (three.js and the editor) downloads, or while
 * the Studio access is read. Deliberately quiet: the editor's own page
 * background and a small spinner in the centre, faded in only after a short
 * delay so a fast page change shows nothing at all.
 * Kept out of the lazy chunk on purpose: it has to render before it arrives.
 */
export function StudioEditorLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" className="grid min-h-[100dvh] place-items-center bg-[var(--surface-page)]">
      <span className="gt-quiet-in grid place-items-center">
        <LoaderCircle size={22} aria-hidden="true" className="animate-spin text-[var(--text-muted)] motion-reduce:animate-none" />
        <span className="sr-only">{t("studio.editor.loading")}</span>
      </span>
    </div>
  );
}
