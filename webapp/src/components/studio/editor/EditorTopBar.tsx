import { useRef } from "react";
import clsx from "clsx";
import { Menu, Redo2, RotateCcw, Undo2, Upload } from "lucide-react";
import monogram from "../../../assets/monogram-blue.png";
import { useEditorLabels } from "./editorLabels";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { ShareExportMenu } from "./ShareExportMenu";
import { HelpHint } from "../workspace/HelpHint";
import { SaveControls } from "../workspace/SaveControls";
import { SaveStatus } from "../workspace/SaveStatus";
import { StudioAccessBadge } from "../access/StudioTrialCountdown";
import { useCompositionEstimate } from "../../../lib/studio3d/useStudioGems";
import { importModelFile, resetModel } from "../../../lib/studio3d/actions";
import { studioStore, type StudioSnapshot } from "../../../lib/studio3d/store";
import { useStudioStaff } from "../../../lib/studioAccess";

const toolButton = clsx(
  "inline-grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-600)] transition-colors",
  "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
);

/** The editor's application bar: identity and save state, history, model, quick actions, the Share menu and Save. */
export function EditorTopBar({ snap, onOpenMenu }: { snap: StudioSnapshot; onOpenMenu: () => void }) {
  const { t, formatEstimate } = useEditorLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const total = useCompositionEstimate(snap.jewels).totalMinor;
  // Importing a 3D model is a staff tool (owner's request 2026-10-28): members work on the Studio's dentition.
  const staff = useStudioStaff();
  const canReset = snap.modelMode !== "dentition" && !snap.modelLoading;
  const modelTools = staff || canReset;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await importModelFile(f);
  };

  return (
    <header className="relative z-30 flex h-14 min-w-0 studio-short:h-12 items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 sm:gap-2 sm:px-3">
      {/* Below `lg` the workspace navigation lives in a drawer; on desktop it is the rail. */}
      <button type="button" className={clsx(toolButton, "lg:hidden")} aria-label={t("studio.workspace.nav.open")} title={t("studio.workspace.nav.open")} onClick={onOpenMenu}>
        <Menu size={18} aria-hidden="true" />
      </button>
      <div className="flex min-w-[80px] items-center gap-2.5 pr-1 max-sm:flex-1 sm:min-w-[140px]">
        <img src={monogram.src} alt="" aria-hidden="true" className="hidden h-7 w-7 flex-none object-contain sm:block lg:hidden" />
        <div className="grid min-w-0 leading-none">
          <h1 className="m-0 flex min-w-0 items-baseline gap-2 truncate text-[15px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            <span className="flex-none max-sm:sr-only">{t("studio.editor.appName")}</span>
            <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-muted)] max-sm:text-[14px] max-sm:font-bold max-sm:text-[var(--text-primary)]">
              <span aria-hidden="true" className="max-sm:hidden">/ </span>
              {snap.active?.name || t("studio.workspace.untitled")}
            </span>
          </h1>
          <span className="mt-1 flex min-w-0 items-center gap-0.5">
            <SaveStatus />
            <HelpHint id="saving" className="-my-1 h-5 w-5 max-md:hidden" />
          </span>
        </div>
        <StudioAccessBadge />
      </div>

      <div className="flex-1 max-sm:hidden" />

      <p
        className="m-0 hidden whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] xl:block"
        title={t("studio.editor.estimateHint")}
        aria-live="polite"
      >
        {t("studio.editor.pieceCount", { count: snap.jewels.length })}
        {total > 0 && (
          <>
            {" · "}
            <span className="text-[var(--text-primary)]">{t("studio.editor.estimateShort", { total: formatEstimate(total) })}</span>
          </>
        )}
      </p>

      <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-[var(--border-subtle)] sm:block" />
      {/* Undo and Redo travel together: the guided tour points at the pair (`data-tour`). */}
      <div data-tour="history" className="flex flex-none items-center gap-1 sm:gap-2">
        <button
          type="button"
          className={toolButton}
          aria-label={t("studio.editor.undo")}
          title={t("studio.editor.undoHint")}
          disabled={!snap.canUndo}
          onClick={() => studioStore.undo()}
        >
          <Undo2 size={16} aria-hidden="true" />
        </button>
        {/* On a phone, Undo stays and Redo steps aside for the design's name (Ctrl+Y still works on a keyboard). */}
        <button
          type="button"
          className={clsx(toolButton, "max-sm:hidden")}
          aria-label={t("studio.editor.redo")}
          title={t("studio.editor.redoHint")}
          disabled={!snap.canRedo}
          onClick={() => studioStore.redo()}
        >
          <Redo2 size={16} aria-hidden="true" />
        </button>
      </div>
      {/* The model tools (staff import, back to the dentition) bring their own divider: none when both are absent. */}
      {modelTools && <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-[var(--border-subtle)] sm:block" />}
      {staff && (
        <>
          <input ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary" className="hidden" onChange={handleFile} tabIndex={-1} />
          <button
            type="button"
            className={clsx(toolButton, "max-sm:hidden")}
            aria-label={t("studio.editor.importModel")}
            title={t("studio.editor.importModelHint")}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
          </button>
        </>
      )}
      {canReset && (
        <button
          type="button"
          className={toolButton}
          aria-label={t("studio.editor.resetModel")}
          title={t("studio.editor.resetModel")}
          onClick={resetModel}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      )}
      <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-[var(--border-subtle)] sm:block" />
      {/* On a phone the quick actions keep their defaults: their settings step aside for Share. */}
      <QuickActionsMenu triggerClassName={clsx(toolButton, "max-sm:hidden")} />
      <ShareExportMenu />
      <span data-tour="save" className="flex flex-none items-center">
        <SaveControls />
      </span>
    </header>
  );
}
