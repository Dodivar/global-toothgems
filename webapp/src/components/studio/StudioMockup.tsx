import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  Box,
  Check,
  LoaderCircle,
  Minus,
  Plus,
  Redo2,
  Save,
  Search,
  Share2,
  Undo2,
  X,
} from "lucide-react";
import { SmileCanvas } from "./SmileCanvas";
import { GemIcon } from "./Gem";
import { MATERIAL_SWATCH } from "./gemStyle";
import { useToast } from "../../lib/toast";
import { pick } from "../../data/types";
import {
  COMPOSITIONS,
  FREE_SLOTS,
  MATERIALS,
  MOCKUP_PRESETS,
  STUDIO_LIBRARY,
  type CompositionId,
  type LibraryPiece,
  type PlacedPiece,
} from "../../data/studio";

/**
 * A believable, lightly interactive picture of the Studio.
 *
 * It is a prototype of the interface, not the editor: pieces can be selected,
 * swapped, resized, added and removed, the history can be undone, and the view
 * zoomed and tilted — enough for a visitor to feel what composing is like.
 * Nothing is saved, rendered in 3D or sent anywhere; "Save" and "Share" play
 * their states and say so.
 *
 * `full` is the application window used in the hero. `compact` keeps only the
 * stage and a floating toolbar, for teasers where the panels would be noise.
 */

type View = "front" | "three" | "profile";
type SaveState = "idle" | "saving" | "saved";
type Filter = "all" | "crystals" | "gold";

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const SIZE_MIN = 7;
const SIZE_MAX = 28;
/** Indicative scale for the size readout: a central incisor is ~60 units, ~8.5 mm. */
const CANVAS_UNITS_PER_MM = 7;
/** Long enough to read as work being done, short enough not to feel slow. */
const SAVE_DELAY_MS = 1100;

const VIEW_TRANSFORM: Record<View, string> = {
  front: "none",
  three: "perspective(900px) rotateY(-16deg) rotateX(4deg)",
  profile: "perspective(700px) rotateY(-34deg) rotateX(2deg)",
};

let addSeq = 0;

function libraryMatch(piece: PlacedPiece | undefined) {
  return piece ? STUDIO_LIBRARY.find((l) => l.shape === piece.shape && l.material === piece.material) : undefined;
}

interface StudioMockupProps {
  variant?: "full" | "compact";
  initial?: CompositionId;
  className?: string;
}

export function StudioMockup({ variant = "full", initial = "signature", className }: StudioMockupProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const lang = i18n.language;
  const full = variant === "full";

  const [history, setHistory] = useState<PlacedPiece[][]>(() => [COMPOSITIONS[initial]]);
  const [cursor, setCursor] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(full ? COMPOSITIONS[initial][0]?.id ?? null : null);
  /* The window opens slightly zoomed in, so the smile fills its tall stage. */
  const [zoom, setZoom] = useState(full ? 1.2 : 1);
  const [view, setView] = useState<View>("front");
  const [guide, setGuide] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [filter, setFilter] = useState<Filter>("all");
  const [preset, setPreset] = useState<CompositionId | null>(initial);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  const pieces = history[cursor];
  const selected = pieces.find((piece) => piece.id === selectedId);
  const selectedLibrary = libraryMatch(selected);

  const commit = (next: PlacedPiece[]) => {
    setHistory((h) => [...h.slice(0, cursor + 1), next]);
    setCursor((c) => c + 1);
    setSaveState("idle");
    setPreset(null);
  };

  const undo = () => setCursor((c) => Math.max(0, c - 1));
  const redo = () => setCursor((c) => Math.min(history.length - 1, c + 1));

  const loadPreset = (id: CompositionId) => {
    commit(COMPOSITIONS[id]);
    setPreset(id);
    setSelectedId(null);
  };

  const applyLibrary = (item: LibraryPiece) => {
    if (selected) {
      commit(pieces.map((piece) => (piece.id === selected.id ? { ...piece, shape: item.shape, material: item.material } : piece)));
      return;
    }
    const taken = new Set(pieces.map((piece) => `${piece.row}${piece.tooth}`));
    const slot = FREE_SLOTS.find((s) => !taken.has(`${s.row}${s.tooth}`));
    if (!slot) {
      showToast(t("studio.mockup.fullTitle"), t("studio.mockup.fullBody"), "info");
      return;
    }
    const id = `add${++addSeq}`;
    commit([...pieces, { ...slot, id, size: item.shape === "round" ? 12 : 18, shape: item.shape, material: item.material }]);
    setSelectedId(id);
  };

  const updateSelected = (patch: Partial<PlacedPiece>) => {
    if (!selected) return;
    commit(pieces.map((piece) => (piece.id === selected.id ? { ...piece, ...patch } : piece)));
  };

  const removeSelected = () => {
    if (!selected) return;
    commit(pieces.filter((piece) => piece.id !== selected.id));
    setSelectedId(null);
  };

  const save = () => {
    if (saveState === "saving") return;
    setSaveState("saving");
    saveTimer.current = window.setTimeout(() => setSaveState("saved"), SAVE_DELAY_MS);
  };

  const share = () => showToast(t("studio.mockup.shareToastTitle"), t("studio.mockup.shareToastBody"), "info");

  const pieceName = (piece: PlacedPiece) => {
    const lib = libraryMatch(piece);
    return lib ? pick(lib.name, lang) : t(`studio.materials.${piece.material}`);
  };
  const pieceLabel = (piece: PlacedPiece) =>
    t("studio.mockup.pieceLabel", { name: pieceName(piece), index: pieces.indexOf(piece) + 1 });

  const library = STUDIO_LIBRARY.filter((item) =>
    filter === "all" ? true : filter === "gold" ? item.material === "gold" : item.material !== "gold",
  );

  /* ---------- pieces shared by both variants ---------- */

  const toolButton =
    "inline-grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-600)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-35";

  const zoomControls = (
    <div
      role="group"
      aria-label={t("studio.mockup.zoomLabel")}
      className="flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-white/15 bg-white/10 p-1 text-white backdrop-blur-md"
    >
      <button
        type="button"
        aria-label={t("studio.mockup.zoomOut")}
        disabled={zoom <= ZOOM_MIN + 0.001}
        onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(1)))}
        className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-35"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="min-w-[40px] text-center text-[11px] font-semibold tabular-nums">
        {Math.round(zoom * 100)}%
      </output>
      <button
        type="button"
        aria-label={t("studio.mockup.zoomIn")}
        disabled={zoom >= ZOOM_MAX - 0.001}
        onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(1)))}
        className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-35"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );

  const views: View[] = ["front", "three", "profile"];
  const viewSwitch = (
    <div
      role="radiogroup"
      aria-label={t("studio.mockup.viewLabel")}
      className="flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-white/15 bg-white/10 p-1 backdrop-blur-md"
    >
      {views.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => setView(v)}
          className={clsx(
            "rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[.08em] transition-colors",
            view === v ? "bg-white text-[var(--gt-ink-900)]" : "text-white/75 hover:text-white",
          )}
        >
          {t(`studio.mockup.views.${v}`)}
        </button>
      ))}
    </div>
  );

  const stage = (
    <div className="gt-studio-stage relative isolate min-h-0 overflow-hidden">
      <div
        className="gt-studio-view grid h-full w-full place-items-center"
        style={{ transform: VIEW_TRANSFORM[view] }}
      >
        <div className="gt-studio-zoom w-full" style={{ transform: `scale(${zoom})` }}>
          <SmileCanvas
            pieces={pieces}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            pieceLabel={pieceLabel}
            guide={guide}
            label={t("studio.mockup.canvasLabel")}
            className="block h-auto w-full"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="pointer-events-auto">{viewSwitch}</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-white/15 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white/85 backdrop-blur-md">
          <Box size={12} aria-hidden="true" />
          {t("studio.mockup.pieceCount", { count: pieces.length })}
        </span>
        <div className="pointer-events-auto">{zoomControls}</div>
      </div>
    </div>
  );

  if (!full) {
    return (
      <div
        className={clsx(
          "relative grid aspect-[16/10] overflow-hidden rounded-[var(--radius-xl)] border border-white/10 shadow-[var(--shadow-glass-heavy)] [&>*]:min-h-0",
          className,
        )}
      >
        {stage}
      </div>
    );
  }

  /* ---------- the full application window ---------- */

  const saveLabel =
    saveState === "saving" ? t("studio.mockup.saving") : saveState === "saved" ? t("studio.mockup.saved") : t("studio.mockup.save");

  return (
    <div
      className={clsx(
        "gt-studio-window relative grid overflow-hidden rounded-[var(--radius-xl)] border border-white/70 bg-[var(--surface-card)] text-left shadow-[var(--shadow-glass-heavy)]",
        className,
      )}
    >
      {/* Title bar */}
      <div className="flex h-12 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        <span aria-hidden="true" className="flex gap-1.5 pr-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gt-ink-200)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gt-ink-200)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gt-ink-200)]" />
        </span>
        <span className="hidden items-center gap-1.5 text-[12px] font-bold text-[var(--text-primary)] sm:inline-flex">
          <Box size={14} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
          {t("studio.mockup.appName")}
        </span>
        <span className="hidden truncate text-[12px] text-[var(--text-muted)] md:inline">/ {t("studio.mockup.projectName")}</span>
        <div className="flex-1" />
        <button type="button" onClick={undo} disabled={cursor === 0} aria-label={t("studio.mockup.undo")} title={t("studio.mockup.undo")} className={toolButton}>
          <Undo2 size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={cursor >= history.length - 1}
          aria-label={t("studio.mockup.redo")}
          title={t("studio.mockup.redo")}
          className={toolButton}
        >
          <Redo2 size={15} aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        <button type="button" onClick={share} aria-label={t("studio.mockup.share")} title={t("studio.mockup.share")} className={toolButton}>
          <Share2 size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={save}
          aria-busy={saveState === "saving"}
          className={clsx(
            "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-[11px] font-semibold uppercase tracking-[.06em] transition-colors",
            saveState === "saved"
              ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
              : "bg-[var(--surface-inverse)] text-[var(--text-inverse)] hover:bg-[var(--gt-ink-700)]",
          )}
        >
          {saveState === "saving" ? (
            <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
          ) : saveState === "saved" ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <Save size={13} aria-hidden="true" />
          )}
          <span aria-live="polite">{saveLabel}</span>
        </button>
      </div>

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)] xl:grid-cols-[150px_minmax(0,1fr)_176px]">
        {/* Library */}
        <aside aria-label={t("studio.mockup.library")} className="hidden min-h-0 content-start gap-3 border-r border-[var(--border-subtle)] p-3 md:grid">
          <span className="gt-eyebrow text-[10px]">{t("studio.mockup.library")}</span>
          <label className="flex h-8 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--gt-off-white)] px-2.5 text-[11px] text-[var(--text-subtle)]">
            <Search size={12} aria-hidden="true" />
            <input
              type="search"
              readOnly
              aria-label={t("studio.mockup.search")}
              placeholder={t("studio.mockup.search")}
              className="w-full min-w-0 bg-transparent outline-none placeholder:text-[var(--text-subtle)]"
            />
          </label>
          <div role="radiogroup" aria-label={t("studio.mockup.filterLabel")} className="flex flex-wrap gap-1">
            {(["all", "crystals", "gold"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                  filter === f
                    ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
                    : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--gt-ink-400)]",
                )}
              >
                {t(`studio.mockup.filters.${f}`)}
              </button>
            ))}
          </div>
          <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
            {library.map((item) => {
              const active = selectedLibrary?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => applyLibrary(item)}
                    aria-pressed={active}
                    aria-label={pick(item.name, lang)}
                    title={pick(item.name, lang)}
                    className={clsx(
                      "grid aspect-square w-full place-items-center rounded-[var(--radius-sm)] border transition-[border-color,background-color,transform] hover:-translate-y-px",
                      active
                        ? "border-[var(--gt-blue-500)] bg-[var(--gt-blue-50)]"
                        : "border-[var(--border-subtle)] bg-[var(--gt-off-white)] hover:border-[var(--gt-blue-300)]",
                    )}
                  >
                    <GemIcon shape={item.shape} material={item.material} size={26} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="m-0 text-[10.5px] leading-snug text-[var(--text-subtle)]">
            {selected ? t("studio.mockup.swapHint") : t("studio.mockup.addHint")}
          </p>
        </aside>

        {/* Stage */}
        <div className="grid min-h-[240px] sm:min-h-[300px] [&>*]:min-h-0">{stage}</div>

        {/* Properties */}
        <aside aria-label={t("studio.mockup.panelTitle")} className="hidden min-h-0 content-start gap-4 border-l border-[var(--border-subtle)] p-3 xl:grid">
          <span className="gt-eyebrow text-[10px]">{t("studio.mockup.panelTitle")}</span>
          {selected ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--gt-off-white)] p-2">
                <GemIcon shape={selected.shape} material={selected.material} size={30} />
                <span className="grid min-w-0">
                  <strong className="truncate text-[12px] text-[var(--text-primary)]">{pieceName(selected)}</strong>
                  <span className="text-[10.5px] text-[var(--text-muted)]">{selectedLibrary?.spec ?? "—"}</span>
                </span>
              </div>
              <fieldset className="m-0 grid gap-1.5 border-0 p-0">
                <legend className="mb-1.5 text-[10.5px] font-semibold text-[var(--text-muted)]">{t("studio.mockup.material")}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {MATERIALS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={selected.material === m}
                      aria-label={t(`studio.materials.${m}`)}
                      title={t(`studio.materials.${m}`)}
                      onClick={() => updateSelected({ material: m })}
                      className={clsx(
                        "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                        selected.material === m ? "border-[var(--gt-ink-900)]" : "border-white shadow-[0_0_0_1px_var(--gt-ink-200)]",
                      )}
                      style={{ background: MATERIAL_SWATCH[m] }}
                    />
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1.5">
                <span className="flex justify-between text-[10.5px] font-semibold text-[var(--text-muted)]">
                  {t("studio.mockup.size")}
                  <span className="tabular-nums text-[var(--text-primary)]">{t("studio.mockup.sizeValue", { value: (selected.size / CANVAS_UNITS_PER_MM).toFixed(1) })}</span>
                </span>
                <input
                  type="range"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  value={selected.size}
                  onChange={(e) => updateSelected({ size: Number(e.target.value) })}
                  className="gt-studio-range w-full"
                />
              </label>
              <button
                type="button"
                onClick={removeSelected}
                className="inline-flex items-center gap-1.5 justify-self-start rounded-[var(--radius-pill)] px-2 py-1 text-[11px] font-semibold text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)]"
              >
                <X size={12} aria-hidden="true" />
                {t("studio.mockup.remove")}
              </button>
            </div>
          ) : (
            <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-3 text-[11px] leading-snug text-[var(--text-muted)]">
              {t("studio.mockup.noSelection")}
            </p>
          )}

          <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px] font-semibold text-[var(--text-body)]">
            {t("studio.mockup.symmetry")}
            <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} className="gt-studio-switch" />
          </label>

          <div className="grid gap-1.5">
            <span className="text-[10.5px] font-semibold text-[var(--text-muted)]">{t("studio.mockup.presets")}</span>
            {MOCKUP_PRESETS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={preset === id}
                onClick={() => loadPreset(id)}
                className={clsx(
                  "flex items-center justify-between rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors",
                  preset === id
                    ? "border-[var(--gt-blue-400)] bg-[var(--gt-blue-50)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--gt-ink-300)]",
                )}
              >
                {t(`studio.compositions.${id}`)}
                <span className="text-[10px] font-medium text-[var(--text-subtle)]">{COMPOSITIONS[id].length}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Small screens: the library as a tray under the stage. */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--border-subtle)] px-3 py-2.5 md:hidden gt-scroller">
        {STUDIO_LIBRARY.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => applyLibrary(item)}
            aria-pressed={selectedLibrary?.id === item.id}
            aria-label={pick(item.name, lang)}
            className={clsx(
              "grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-sm)] border",
              selectedLibrary?.id === item.id ? "border-[var(--gt-blue-500)] bg-[var(--gt-blue-50)]" : "border-[var(--border-subtle)] bg-[var(--gt-off-white)]",
            )}
          >
            <GemIcon shape={item.shape} material={item.material} size={24} />
          </button>
        ))}
      </div>
    </div>
  );
}
