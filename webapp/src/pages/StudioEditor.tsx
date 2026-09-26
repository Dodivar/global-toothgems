import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EditorTopBar } from "../components/studio/editor/EditorTopBar";
import { EditorLibrary } from "../components/studio/editor/EditorLibrary";
import { EditorViewport } from "../components/studio/editor/EditorViewport";
import { EditorInspector } from "../components/studio/editor/EditorInspector";
import { useDocumentTitle } from "../components/legal/hooks";
import { useToast } from "../lib/toast";
import { duplicatePieces, removePieces } from "../lib/studio3d/actions";
import { getEngine } from "../lib/studio3d/engine";
import { setNoticeHandler } from "../lib/studio3d/notices";
import { studioStore, useStudio } from "../lib/studio3d/store";

/**
 * The 3D Studio editor: compose tooth jewellery on a 3D dental arch.
 *
 * A full-screen workspace, like the back office: the storefront header and
 * footer are left out (see `App`), and the page wears its own application bar.
 * Loaded on demand — three.js and the editor are a separate chunk, so the rest
 * of the site does not download a 3D engine it never uses.
 *
 * Access is decided by `RequireStudioAccess` around the route; during the
 * preview it is open to every visitor (see `studioAccess`).
 */
export function StudioEditor() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const snap = useStudio();
  useDocumentTitle(t("studio.editor.documentTitle"));

  // The engine and the store speak in translation keys; the site's toasts say it.
  useEffect(() => {
    setNoticeHandler((key, params, tone) => {
      // A value naming a translation key (a preset's name) is translated in turn.
      const values = Object.fromEntries(
        Object.entries(params ?? {}).map(([k, v]) => [k, typeof v === "string" && v.startsWith("studio.editor.") ? t(v) : v]),
      );
      showToast(t(`studio.editor.toasts.${key}`, values), undefined, tone);
    });
    return () => setNoticeHandler(null);
  }, [t, showToast]);

  // A design restored from the last visit is worth mentioning once.
  useEffect(() => {
    if (studioStore.restored) {
      studioStore.restored = false;
      showToast(t("studio.editor.toasts.restoredTitle"), t("studio.editor.toasts.restoredBody"), "info");
    }
  }, [showToast, t]);

  // Save on the way out — leaving the page or closing the tab — not only on the debounce.
  useEffect(() => {
    const save = () => studioStore.saveNow();
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
      studioStore.resetSession();
    };
  }, []);

  // Keyboard shortcuts. Ignored while typing, and when a menu handled the key first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable);
      if (e.key === "Escape") {
        getEngine()?.cancelPlacing();
        if (typing) el?.blur();
        studioStore.closeContextMenu();
        studioStore.deselect();
        return;
      }
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === "z") {
        e.preventDefault();
        if (e.shiftKey) studioStore.redo();
        else studioStore.undo();
        return;
      }
      if (meta && key === "y") {
        e.preventDefault();
        studioStore.redo();
        return;
      }
      if (meta && key === "a") {
        e.preventDefault();
        studioStore.selectJewels(studioStore.jewels.map((j) => j.id));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && studioStore.selectedJewelIds.length) {
        e.preventDefault();
        removePieces([...studioStore.selectedJewelIds]);
        return;
      }
      if (key === "d" && !meta && !e.altKey && studioStore.selectedJewelIds.length) {
        duplicatePieces([...studioStore.selectedJewelIds]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="gt-editor flex min-h-[100dvh] flex-col bg-[var(--surface-page)] lg:h-[100dvh] lg:min-h-0">
      <EditorTopBar snap={snap} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)_316px] xl:grid-cols-[288px_minmax(0,1fr)_332px]">
        {/* Stage first on small screens: it is what the visitor came for. */}
        <div className="order-1 grid min-h-0 lg:order-2">
          <EditorViewport snap={snap} />
        </div>
        <div className="order-2 grid min-h-0 lg:order-1">
          <EditorLibrary snap={snap} />
        </div>
        <div className="order-3 grid min-h-0">
          <EditorInspector snap={snap} />
        </div>
      </div>
    </div>
  );
}
