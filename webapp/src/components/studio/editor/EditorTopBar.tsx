import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  Braces,
  Check,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  SquareDashed,
  Trash2,
  Undo2,
  Upload,
  ReceiptText,
} from "lucide-react";
import monogram from "../../../assets/monogram-blue.png";
import { Button } from "../../ui/Button";
import { EditorPopover, PopoverItem, PopoverLabel, PopoverSeparator } from "./EditorPopover";
import { useEditorLabels } from "./editorLabels";
import { estimateCents, estimateTotalCents, FREE_TOOTH, PRESETS } from "../../../data/studioEditor";
import { applyPreset, clearDesign, importModelFile, resetModel } from "../../../lib/studio3d/actions";
import { downloadURL, getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { buildQuoteSheetDataURL } from "../../../lib/studio3d/quoteSheet";
import {
  applyUserPreset,
  CLIENT_NAME_MAX,
  deleteUserPreset,
  PRESET_NAME_MAX,
  saveUserPreset,
  studioStore,
  useUserPresets,
  type StudioSnapshot,
} from "../../../lib/studio3d/store";
import { STUDIO_PATH } from "../../../lib/studioUrl";
import { formatDate } from "../../../lib/format";

const toolButton = clsx(
  "inline-grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-600)] transition-colors",
  "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
);

const inputClass =
  "h-9 min-w-0 flex-1 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]";

/** The editor's application bar: identity, history, model, presets and exports. */
export function EditorTopBar({ snap }: { snap: StudioSnapshot }) {
  const { t, formatEstimate } = useEditorLabels();
  const fileRef = useRef<HTMLInputElement>(null);
  const total = estimateTotalCents(snap.jewels);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) await importModelFile(f);
  };

  return (
    <header className="relative z-20 flex h-14 min-w-0 items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 sm:gap-2 sm:px-3">
      <Link to={STUDIO_PATH} className={toolButton} aria-label={t("studio.editor.backToStudio")} title={t("studio.editor.backToStudio")}>
        <ArrowLeft size={17} aria-hidden="true" />
      </Link>
      <div className="flex min-w-0 items-center gap-2.5 pr-1">
        <img src={monogram} alt="" aria-hidden="true" className="hidden h-7 w-7 flex-none object-contain sm:block" />
        <div className="grid min-w-0 leading-none">
          <h1 className="m-0 truncate text-[15px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.editor.appName")}
          </h1>
          <span className="mt-1 hidden truncate text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)] md:block">
            Global Toothgems
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

      <div className="flex-1" />

      <p
        className="m-0 hidden whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] md:block"
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
      <button
        type="button"
        className={toolButton}
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
      {snap.modelMode !== "studio" && (
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
      <PresetMenu />
      <button
        type="button"
        className={clsx(toolButton, "max-sm:hidden")}
        aria-label={t("studio.editor.save")}
        title={t("studio.editor.saveHint")}
        onClick={() => {
          studioStore.saveNow();
          notify("saved");
        }}
      >
        <Save size={16} aria-hidden="true" />
      </button>
      <ExportMenu />
    </header>
  );
}

function PresetMenu() {
  const { t } = useEditorLabels();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const presets = useUserPresets();

  // A delete asks once more, then forgets the question after a moment.
  useEffect(() => {
    if (!confirmDel) return;
    const timer = setTimeout(() => setConfirmDel(null), 2600);
    return () => clearTimeout(timer);
  }, [confirmDel]);

  const close = () => {
    setOpen(false);
    setSaving(false);
  };
  const doSave = () => {
    const clean = name.trim();
    if (!clean) return notify("presetNameMissing", undefined, "warning");
    if (!studioStore.jewels.length) return notify("presetEmpty", undefined, "warning");
    if (saveUserPreset(clean)) {
      setName("");
      close();
      notify("presetSaved", { name: clean });
    }
  };

  return (
    <EditorPopover
      label={t("studio.editor.presets.menu")}
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      width={320}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Sparkles size={14} aria-hidden="true" className="sm:hidden" />
          <span className="hidden sm:inline">{t("studio.editor.presets.menu")}</span>
          <span className="sr-only sm:hidden">{t("studio.editor.presets.menu")}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      )}
    >
      <PopoverLabel>{t("studio.editor.presets.designPresets")}</PopoverLabel>
      {PRESETS.map((p) => (
        <PopoverItem
          key={p.id}
          icon={<Sparkles size={14} />}
          label={t(`studio.editor.presets.${p.id}.name`)}
          sub={t(`studio.editor.presets.${p.id}.desc`)}
          onClick={() => {
            applyPreset(p.id);
            close();
          }}
        />
      ))}
      <PopoverSeparator />
      <PopoverLabel>{t("studio.editor.presets.mine")}</PopoverLabel>
      {presets.length === 0 && !saving && (
        <p className="m-0 px-2.5 pb-2 text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.editor.presets.mineEmpty")}</p>
      )}
      {presets.map((p) => (
        <div key={p.id} className="flex items-stretch gap-1">
          <div className="min-w-0 flex-1">
            <PopoverItem
              icon={<Sparkles size={14} />}
              label={p.name}
              sub={t("studio.editor.pieceCount", { count: p.jewels.length })}
              onClick={() => {
                applyUserPreset(p);
                close();
                notify("presetApplied", { name: p.name });
              }}
            />
          </div>
          <button
            type="button"
            aria-label={
              confirmDel === p.id
                ? t("studio.editor.presets.confirmDelete", { name: p.name })
                : t("studio.editor.presets.delete", { name: p.name })
            }
            title={
              confirmDel === p.id
                ? t("studio.editor.presets.confirmDelete", { name: p.name })
                : t("studio.editor.presets.delete", { name: p.name })
            }
            onClick={() => {
              if (confirmDel === p.id) {
                deleteUserPreset(p.id);
                setConfirmDel(null);
                notify("presetDeleted");
              } else setConfirmDel(p.id);
            }}
            className={clsx(
              "grid w-9 flex-none place-items-center rounded-[var(--radius-sm)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              confirmDel === p.id
                ? "bg-[var(--gt-red-600)] text-white"
                : "text-[var(--text-subtle)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)]",
            )}
          >
            {confirmDel === p.id ? <Check size={13} aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
          </button>
        </div>
      ))}
      {saving ? (
        <form
          className="flex gap-1.5 p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            doSave();
          }}
        >
          <input
            autoFocus
            aria-label={t("studio.editor.presets.nameLabel")}
            placeholder={t("studio.editor.presets.namePlaceholder")}
            value={name}
            maxLength={PRESET_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <Button type="submit" variant="dark" size="sm">
            {t("studio.editor.presets.save")}
          </Button>
        </form>
      ) : (
        <PopoverItem icon={<Plus size={14} />} label={t("studio.editor.presets.saveCurrent")} onClick={() => setSaving(true)} />
      )}
      <PopoverSeparator />
      <PopoverItem
        destructive
        icon={<Trash2 size={14} />}
        label={t("studio.editor.presets.clearAll")}
        onClick={() => {
          clearDesign();
          close();
        }}
      />
    </EditorPopover>
  );
}

function ExportMenu() {
  const labels = useEditorLabels();
  const { t } = labels;
  const [open, setOpen] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [client, setClient] = useState(studioStore.clientName);

  const close = () => {
    setOpen(false);
    setQuoting(false);
  };
  const exportPng = (transparent: boolean) => {
    getEngine()?.exportPNG(transparent);
    close();
    notify(transparent ? "exportedTransparent" : "exportedPng");
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
      const url = await buildQuoteSheetDataURL({
        renderURL: engine.captureView(),
        clientName: client,
        rows: jewels.map((j) => ({
          name: labels.pieceName(j.jewelryTypeId),
          tooth: j.toothId === FREE_TOOTH ? "—" : j.toothId,
          size: t("studio.editor.inspector.mm", { value: (j.scale * 2).toFixed(1) }),
          finish: labels.finishName(j),
          price: labels.formatEstimate(estimateCents(j)),
        })),
        total: labels.formatEstimate(estimateTotalCents(jewels)),
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
          className="gt-studio-cta inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:px-3.5"
        >
          <Download size={14} aria-hidden="true" />
          <span className="hidden sm:inline">{t("studio.editor.export.menu")}</span>
          <span className="sr-only sm:hidden">{t("studio.editor.export.menu")}</span>
          <ChevronDown size={13} aria-hidden="true" className="hidden sm:block" />
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
