import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "../lib/navigation";
import clsx from "clsx";
import { Box, Menu } from "lucide-react";
import { EditorTopBar } from "../components/studio/editor/EditorTopBar";
import { EditorLibrary } from "../components/studio/editor/EditorLibrary";
import { EditorViewport } from "../components/studio/editor/EditorViewport";
import { EditorInspector } from "../components/studio/editor/EditorInspector";
import { useEditorPanels, usePanelPresence } from "../components/studio/editor/useEditorPanels";
import { StudioSidebar } from "../components/studio/workspace/StudioSidebar";
import { WorkspaceDialogs } from "../components/studio/workspace/WorkspaceDialogs";
import { CreationLibrary } from "../components/studio/workspace/CreationLibrary";
import { GemGroupLibrary } from "../components/studio/workspace/GemGroupLibrary";
import { HelpPanel } from "../components/studio/workspace/HelpPanel";
import { useWorkspaceActions } from "../components/studio/workspace/useWorkspaceActions";
import { useDocumentTitle } from "../components/legal/hooks";
import { useToast } from "../lib/toast";
import { duplicateMirroredPieces, duplicatePieces, removePieces } from "../lib/studio3d/actions";
import { getEngine } from "../lib/studio3d/engine";
import { setNoticeHandler } from "../lib/studio3d/notices";
import { studioStore, useStudio } from "../lib/studio3d/store";
import { studioSectionFromPath, type StudioSection } from "../lib/studioUrl";
import { StudioWorkspaceProvider } from "../lib/studioWorkspace/workspace";
import { getWorkspaceDialog, onboardingSeen, openWorkspaceDialog } from "../lib/studioWorkspace/workspaceUi";

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
 *
 * Around the editor sits the Studio workspace (`lib/studioWorkspace`): the
 * account's saved creations and Gem Groups, help, and feedback. Its sections
 * (`/studio-3d/atelier/mes-creations`…) open over the stage rather than
 * replacing it, so the 3D scene — and an imported model — stays exactly as
 * it was when the artist comes back.
 */
export function StudioEditor() {
  return (
    <StudioWorkspaceProvider>
      <StudioWorkspace />
    </StudioWorkspaceProvider>
  );
}

const SECTION_TITLE: Record<StudioSection, string> = { creations: "creations", groups: "groups", help: "help" };

function StudioWorkspace() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const snap = useStudio();
  const { pathname } = useLocation();
  const section = studioSectionFromPath(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { save } = useWorkspaceActions();
  const panels = useEditorPanels();
  const library = usePanelPresence(panels.open.library);
  const inspector = usePanelPresence(panels.open.inspector);
  // Read by the keyboard handler, which is registered once.
  const live = useRef({ section, save });
  useEffect(() => {
    live.current = { section, save };
  });
  useDocumentTitle(
    section ? `${t(`studio.workspace.nav.${SECTION_TITLE[section]}`)} · ${t("studio.editor.documentTitle")}` : t("studio.editor.documentTitle"),
  );

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

  // First visit: a short welcome over the stage, once it has had a moment to draw.
  useEffect(() => {
    if (onboardingSeen()) return;
    const timer = setTimeout(() => {
      // Only over the stage: arriving on a library page is not a first look at the editor.
      if (!getWorkspaceDialog() && !live.current.section) openWorkspaceDialog({ kind: "onboarding" });
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  // A section in front: nothing half-done may linger on the stage behind it.
  useEffect(() => {
    if (!section) return;
    studioStore.closeContextMenu();
    getEngine()?.cancelPlacing();
  }, [section]);

  // Save on the way out — leaving the page or closing the tab — not only on the debounce.
  useEffect(() => {
    const saveDraft = () => studioStore.saveNow();
    window.addEventListener("pagehide", saveDraft);
    return () => {
      window.removeEventListener("pagehide", saveDraft);
      saveDraft();
      studioStore.resetSession();
    };
  }, []);

  // Keyboard shortcuts. Ignored while typing, and when a menu handled the key first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // The shortcuts belong to the stage: not while a section covers it, nor
      // behind a dialog or the navigation drawer (whose own keys come first).
      if (live.current.section || getWorkspaceDialog() || document.querySelector('[aria-modal="true"]')) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === "s") {
        e.preventDefault(); // the browser's "Save page as…" is never what is meant here
        live.current.save("auto");
        return;
      }
      if (e.key === "Escape") {
        getEngine()?.cancelPlacing();
        getEngine()?.cancelLasso();
        studioStore.setLasso(false);
        studioStore.setMultiSelect(false);
        if (typing) el?.blur();
        studioStore.closeContextMenu();
        studioStore.deselect();
        return;
      }
      if (typing) return;
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
        // Shift + D: the copies land on the mirror side of the arch.
        if (e.shiftKey) duplicateMirroredPieces([...studioStore.selectedJewelIds]);
        else duplicatePieces([...studioStore.selectedJewelIds]);
        return;
      }
      if (key === "l" && !meta && !e.altKey) {
        getEngine()?.cancelLasso();
        studioStore.setLasso(!studioStore.lasso);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="gt-editor flex min-h-[100dvh] overflow-x-clip bg-[var(--surface-page)] studio-side:h-[100dvh] studio-side:min-h-0">
      <StudioSidebar section={section} drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* The editor stays mounted under a section — hidden but still measured —
            so the engine keeps its canvas, its model and its camera. */}
        <div inert={!!section} className={clsx("flex min-h-0 flex-1 flex-col", section && "invisible")}>
          <EditorTopBar snap={snap} onOpenMenu={() => setDrawerOpen(true)} />
          {/* Side by side, the stage always fills the space and the two panels are
              drawers sliding over it (`usePanelPresence`): the 3D canvas is never resized
              when they open or close. A closed drawer is hidden, not unmounted, so its
              search, tab and scroll are still there when it comes back. The width a drawer
              covers (`--gt-lib-open`, `--gt-insp-open`) keeps the stage's own controls in
              the part still in view. Stacked (a phone held upright), the panels follow the stage. */}
          <div
            className={clsx(
              "flex min-h-0 flex-1 flex-col studio-side:relative studio-side:block",
              "[--gt-lib:236px] [--gt-insp:296px] lg:[--gt-lib:264px] lg:[--gt-insp:316px] xl:[--gt-lib:288px] xl:[--gt-insp:332px]",
              panels.open.library && "studio-side:[--gt-lib-open:var(--gt-lib)]",
              panels.open.inspector && "studio-side:[--gt-insp-open:var(--gt-insp)]",
            )}
          >
            {/* Stage first on small screens: it is what the visitor came for. */}
            <div className="order-1 grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] studio-side:absolute studio-side:inset-0">
              <EditorViewport snap={snap} panels={panels} />
            </div>
            <div
              id="gt-editor-library-panel"
              className={clsx(
                "order-2 grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]",
                "studio-side:absolute studio-side:inset-y-0 studio-side:left-0 studio-side:z-20 studio-side:w-[var(--gt-lib)] studio-side:shadow-[var(--shadow-lg)]",
                !library.shown && "hidden",
                library.phase && `gt-editor-side-${library.phase}-left`,
              )}
            >
              <EditorLibrary snap={snap} />
            </div>
            <div
              id="gt-editor-inspector-panel"
              className={clsx(
                "order-3 grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]",
                "studio-side:absolute studio-side:inset-y-0 studio-side:right-0 studio-side:z-20 studio-side:w-[var(--gt-insp)] studio-side:shadow-[var(--shadow-lg)]",
                !inspector.shown && "hidden",
                inspector.phase && `gt-editor-side-${inspector.phase}-right`,
              )}
            >
              <EditorInspector snap={snap} />
            </div>
          </div>
        </div>
        {section && (
          <main key={section} className="gt-ws-section fixed inset-0 z-30 flex flex-col overflow-hidden bg-[var(--surface-page)] lg:absolute">
            <SectionBar section={section} onOpenMenu={() => setDrawerOpen(true)} />
            <div className="gt-editor-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {section === "creations" && <CreationLibrary />}
              {section === "groups" && <GemGroupLibrary />}
              {section === "help" && <HelpPanel />}
            </div>
          </main>
        )}
      </div>
      <WorkspaceDialogs />
    </div>
  );
}

/** A section's slim bar on small screens: the menu, its name, and the way back to the stage. */
function SectionBar({ section, onOpenMenu }: { section: StudioSection; onOpenMenu: () => void }) {
  const { t } = useTranslation();
  const { toEditor } = useWorkspaceActions();
  const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";
  return (
    <div className="flex h-14 flex-none items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t("studio.workspace.nav.open")}
        className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-600)] hover:bg-[var(--gt-ink-100)]", ring)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <p className="m-0 min-w-0 flex-1 truncate text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">
        {t(`studio.workspace.nav.${SECTION_TITLE[section]}`)}
      </p>
      <button
        type="button"
        onClick={toEditor}
        className={clsx(
          "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-3.5 text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] text-white",
          ring,
        )}
      >
        <Box size={14} aria-hidden="true" />
        {t("studio.workspace.nav.backToStage")}
      </button>
    </div>
  );
}
