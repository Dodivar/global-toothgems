import { useRef, useState } from "react";
import clsx from "clsx";
import {
  Braces,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Menu,
  Redo2,
  RotateCcw,
  Sparkles,
  SquareDashed,
  Undo2,
  Upload,
  ReceiptText,
} from "lucide-react";
import monogram from "../../../assets/monogram-blue.png";
import { Button } from "../../ui/Button";
import { EditorPopover, PopoverItem, PopoverLabel, PopoverSeparator } from "./EditorPopover";
import { useEditorLabels } from "./editorLabels";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { ShareMenu } from "./ShareMenu";
import { HelpHint } from "../workspace/HelpHint";
import { SaveControls } from "../workspace/SaveControls";
import { SaveStatus } from "../workspace/SaveStatus";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { estimateComposition } from "../../../lib/studio3d/gemCatalog";
import { useCompositionEstimate, useStudioGems } from "../../../lib/studio3d/useStudioGems";
import { importModelFile, resetModel } from "../../../lib/studio3d/actions";
import { downloadURL, getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { buildQuoteSheetDataURL } from "../../../lib/studio3d/quoteSheet";
import {
  CLIENT_NAME_MAX,
  studioStore,
  type StudioSnapshot,
} from "../../../lib/studio3d/store";
import { useFormat } from "../../../lib/format";

const toolButton = clsx(
  "inline-grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-600)] transition-colors",
  "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
);

const inputClass =
  "h-9 min-w-0 flex-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]";

/** The editor's application bar: identity and save state, history, model, presets, exports, sharing and Save. */
export function EditorTopBar({ snap, onOpenMenu }: { snap: StudioSnapshot; onOpenMenu: () => void }) {
  const { t, formatEstimate } = useEditorLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const total = useCompositionEstimate(snap.jewels).totalMinor;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await importModelFile(f);
  };

  return (
    <header className="relative z-20 flex h-14 min-w-0 studio-short:h-12 items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 sm:gap-2 sm:px-3">
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
        <span
          title={t("studio.access.previewHint")}
          className="hidden items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--status-success-fg)] lg:inline-flex"
        >
          <Sparkles size={11} aria-hidden="true" />
          {t("studio.access.previewBadge")}
        </span>
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
      <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-[var(--border-subtle)] sm:block" />
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
      {snap.modelMode !== "dentition" && !snap.modelLoading && (
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
      <ExportMenu />
      <ShareMenu triggerClassName={toolButton} />
      <SaveControls />
    </header>
  );
}

function ExportMenu() {
  const { formatDate } = useFormat();
  const labels = useEditorLabels();
  const { t } = labels;
  const { byKey } = useStudioGems();
  const [open, setOpen] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [client, setClient] = useState(studioStore.clientName);

  const close = () => {
    setOpen(false);
    setQuoting(false);
  };
  const exportPng = async (transparent: boolean) => {
    const engine = getEngine();
    close();
    if (!engine) return;
    try {
      await engine.exportPNG(transparent);
      notify(transparent ? "exportedTransparent" : "exportedPng");
    } catch {
      notify("exportFailed", undefined, "error");
    }
  };
  const exportJson = () => {
    getEngine()?.exportJSON();
    close();
    notify("exportedJson");
  };
  const doQuote = async () => {
    const engine = getEngine();
    if (!engine || !studioStore.jewels.length) return notify("quoteEmpty", undefined, "warning");
    studioStore.setClientName(client);
    close();
    notify("quoteBuilding", undefined, "info");
    try {
      const jewels = studioStore.jewels;
      // One row per shop item to buy: a product in one colour, with the teeth and sizes it covers.
      const estimate = estimateComposition(jewels, (key) => byKey.get(key));
      const rows = estimate.lines.map((line) => {
        const pieces = jewels.filter((j) => j.productId === line.productId && (j.variantId ?? null) === line.variantId);
        const teeth = [...new Set(pieces.map((j) => (j.toothId === FREE_TOOTH ? "—" : j.toothId)))];
        const sizes = [...new Set(pieces.map((j) => j.ss))].sort((a, b) => a - b);
        return {
          name: `${labels.pieceName(pieces[0])} ×${line.pieces}`,
          tooth: teeth.join(", "),
          size: sizes.map((ss) => `SS${ss}`).join(", "),
          finish: labels.finishName(pieces[0]) ?? "—",
          price: `${line.quantity} × ${labels.formatEstimate(line.unitMinor)}`,
        };
      });
      if (estimate.unavailable)
        rows.push({ name: t("studio.editor.pieceUnavailable"), tooth: "—", size: "—", finish: "—", price: `×${estimate.unavailable}` });
      const url = await buildQuoteSheetDataURL({
        renderURL: engine.captureView(),
        clientName: client,
        rows,
        total: labels.formatEstimate(estimate.totalMinor),
        labels: {
          title: t("studio.editor.quote.title"),
          date: formatDate(new Date().toISOString()),
          client: t("studio.editor.quote.client"),
          piece: t("studio.editor.quote.piece"),
          tooth: t("studio.editor.quote.tooth"),
          size: t("studio.editor.quote.size"),
          finish: t("studio.editor.quote.finish"),
          price: t("studio.editor.quote.price"),
          total: t("studio.editor.quote.total"),
          footer: t("studio.editor.quote.footer", { count: jewels.length }),
        },
      });
      downloadURL(url, `global-toothgems-studio-estimate-${new Date().toISOString().slice(0, 10)}.png`);
      notify("quoteExported");
    } catch {
      notify("quoteFailed", undefined, "error");
    }
  };

  return (
    <EditorPopover
      label={t("studio.editor.export.menu")}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      width={300}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-xl:w-9 max-xl:justify-center max-xl:px-0 xl:px-3.5"
        >
          <Download size={14} aria-hidden="true" />
          <span className="hidden xl:inline">{t("studio.editor.export.menu")}</span>
          <span className="sr-only xl:hidden">{t("studio.editor.export.menu")}</span>
          <ChevronDown size={13} aria-hidden="true" className="hidden xl:block" />
        </button>
      )}
    >
      <PopoverLabel>{t("studio.editor.export.images")}</PopoverLabel>
      <PopoverItem
        icon={<ImageIcon size={14} />}
        label={t("studio.editor.export.png")}
        sub={t("studio.editor.export.pngSub")}
        onClick={() => exportPng(false)}
      />
      <PopoverItem
        icon={<SquareDashed size={14} />}
        label={t("studio.editor.export.transparent")}
        sub={t("studio.editor.export.transparentSub")}
        onClick={() => exportPng(true)}
      />
      <PopoverSeparator />
      <PopoverLabel>{t("studio.editor.export.quoteSection")}</PopoverLabel>
      {quoting ? (
        <form
          className="flex gap-1.5 p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void doQuote();
          }}
        >
          <input
            autoFocus
            aria-label={t("studio.editor.export.clientLabel")}
            placeholder={t("studio.editor.export.clientPlaceholder")}
            value={client}
            maxLength={CLIENT_NAME_MAX}
            onChange={(e) => setClient(e.target.value)}
            className={inputClass}
          />
          <Button type="submit" variant="dark" size="sm">
            {t("studio.editor.export.quoteAction")}
          </Button>
        </form>
      ) : (
        <PopoverItem
          icon={<ReceiptText size={14} />}
          label={t("studio.editor.export.quote")}
          sub={t("studio.editor.export.quoteSub")}
          onClick={() => setQuoting(true)}
        />
      )}
      <PopoverSeparator />
      <PopoverItem
        icon={<Braces size={14} />}
        label={t("studio.editor.export.json")}
        sub={t("studio.editor.export.jsonSub")}
        onClick={exportJson}
      />
    </EditorPopover>
  );
}
