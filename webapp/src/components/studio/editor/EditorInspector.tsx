import { useId, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { AlignCenterHorizontal, AlignHorizontalSpaceAround, ChevronDown, Copy, FlipHorizontal2, FlipVertical2, Trash2 } from "lucide-react";
import { ColorWheel } from "./ColorWheel";
import { PieceIcon } from "./PieceIcon";
import { useEditorLabels } from "./editorLabels";
import {
  ALL_TEETH,
  CATALOG,
  estimateCents,
  FINISH_IDS,
  FINISHES,
  FREE_TOOTH,
  JEWELRY_BY_ID,
  JEWELRY_CATEGORIES,
  OFFSET_RANGE,
  SCALE_RANGE,
  type PlacedJewelry,
} from "../../../data/studioEditor";
import { alignSelection, distributeSelection, duplicatePieces, mirrorSelection, removePieces } from "../../../lib/studio3d/actions";
import { getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { studioStore, type StudioSnapshot } from "../../../lib/studio3d/store";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";
const selectClass = clsx(
  "h-10 w-full appearance-none rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-4 pr-9 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring)]",
);
const miniButton = clsx(
  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-[11px] font-semibold text-[var(--text-body)] transition-colors",
  "hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
  focusRing,
);

/**
 * The properties panel. What it shows follows the selection: several pieces,
 * one piece, a tooth, or — with nothing selected — the design overview.
 */
export function EditorInspector({ snap }: { snap: StudioSnapshot }) {
  const selected = snap.jewels.filter((j) => snap.selectedJewelIds.includes(j.id));
  let body: ReactNode;
  if (selected.length > 1) body = <MultiPanel key="multi" selected={selected} />;
  else if (selected.length === 1) body = <SinglePanel key={selected[0].id} jewel={selected[0]} />;
  else if (snap.selectedToothId && snap.selectedToothId !== FREE_TOOTH)
    body = <ToothPanel key={snap.selectedToothId} snap={snap} toothId={snap.selectedToothId} />;
  else body = <OverviewPanel snap={snap} />;

  return (
    <aside
      aria-label={useEditorLabels().t("studio.editor.inspector.label")}
      className="gt-editor-scroll min-h-0 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 pb-7 pt-4 lg:border-l lg:border-t-0"
    >
      <div className="gt-editor-panel-in">{body}</div>
    </aside>
  );
}

/* ------------------------------------------------------------ building blocks */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)] after:h-px after:flex-1 after:bg-[var(--border-subtle)]">
      {children}
    </h3>
  );
}

function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]", className)}>{children}</p>;
}

/** A range input that records one undo step per gesture, not one per pixel. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const id = useId();
  const armed = useRef(false);
  const arm = () => {
    if (!armed.current) {
      studioStore.pushHistory();
      armed.current = true;
    }
  };
  const release = () => {
    armed.current = false;
  };
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px] font-semibold text-[var(--text-body)]">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="text-[11.5px] tabular-nums text-[var(--gt-blue-700)]">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="gt-editor-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
        onPointerDown={arm}
        onKeyDown={arm}
        onPointerUp={release}
        onKeyUp={release}
        onBlur={release}
        onChange={(e) => {
          arm();
          onCommit(+e.target.value);
        }}
      />
    </div>
  );
}

function TypeSelect({ value, onChange, label }: { value: string; onChange: (typeId: string) => void; label: string }) {
  const { t, pieceName } = useEditorLabels();
  return (
    <span className="relative block">
      <select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {JEWELRY_CATEGORIES.map((cat) => (
          <optgroup key={cat} label={t(`studio.editor.library.categories.${cat}`)}>
            {CATALOG.filter((item) => item.category === cat).map((item) => (
              <option key={item.id} value={item.id}>
                {pieceName(item.id)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />
    </span>
  );
}

/** Absolute quarter turns, plus a +90° step. */
function QuickRotate({ isOn, onSet, onPlus90 }: { isOn: (deg: number) => boolean; onSet: (deg: number) => void; onPlus90: () => void }) {
  const { t } = useEditorLabels();
  return (
    <div className="mb-3 flex items-stretch gap-2">
      <div
        role="radiogroup"
        aria-label={t("studio.editor.inspector.quarterTurns")}
        className="flex flex-1 gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] p-1"
      >
        {[0, 90, 180, 270].map((deg) => (
          <button
            key={deg}
            type="button"
            role="radio"
            aria-checked={isOn(deg)}
            onClick={() => onSet(deg)}
            className={clsx(
              "h-7 flex-1 rounded-full text-[11px] font-semibold transition-colors",
              focusRing,
              isOn(deg)
                ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {deg}°
          </button>
        ))}
      </div>
      <button type="button" className={clsx(miniButton, "flex-none")} onClick={onPlus90}>
        +90°
      </button>
    </div>
  );
}

function Swatches({
  isSelected,
  onPick,
  custom,
}: {
  isSelected: (finish: string) => boolean;
  onPick: (finish: string) => void;
  custom: string | null;
}) {
  const { t } = useEditorLabels();
  return (
    <div className="grid grid-cols-4 gap-2">
      {FINISH_IDS.map((fid) => (
        <button
          key={fid}
          type="button"
          aria-pressed={isSelected(fid)}
          aria-label={t(`studio.editor.finishes.${fid}`)}
          title={t(`studio.editor.finishes.${fid}`)}
          onClick={() => onPick(fid)}
          style={{ background: FINISHES[fid].swatch }}
          className={clsx(
            "h-10 rounded-[var(--radius-sm)] border-2 shadow-[inset_0_1px_3px_rgba(0,0,0,.14)] transition-transform hover:-translate-y-px",
            focusRing,
            isSelected(fid) ? "border-[var(--gt-ink-900)] ring-2 ring-[var(--gt-blue-300)] ring-offset-2" : "border-black/5",
          )}
        />
      ))}
      {custom && (
        <span
          role="img"
          aria-label={t("studio.editor.finishes.customValue", { hex: custom.toUpperCase() })}
          title={t("studio.editor.finishes.custom")}
          style={{ background: custom }}
          className="h-10 rounded-[var(--radius-sm)] border-2 border-[var(--gt-ink-900)] ring-2 ring-[var(--gt-blue-300)] ring-offset-2"
        />
      )}
    </div>
  );
}

function MirrorRow() {
  const { t } = useEditorLabels();
  return (
    <>
      <div className="flex gap-2">
        <button type="button" className={miniButton} onClick={() => mirrorSelection("h")}>
          <FlipHorizontal2 size={14} aria-hidden="true" />
          {t("studio.editor.mirror.horizontal")}
        </button>
        <button type="button" className={miniButton} onClick={() => mirrorSelection("v")}>
          <FlipVertical2 size={14} aria-hidden="true" />
          {t("studio.editor.mirror.vertical")}
        </button>
      </div>
      <Hint className="mt-2">{t("studio.editor.mirror.hint")}</Hint>
    </>
  );
}

function ActionRow({ onDuplicate, onDelete, count }: { onDuplicate: () => void; onDelete: () => void; count: number }) {
  const { t } = useEditorLabels();
  return (
    <div className="mt-6 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onDuplicate}
        className={clsx(
          "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-strong)] text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]",
          focusRing,
        )}
      >
        <Copy size={14} aria-hidden="true" />
        {t("studio.editor.context.duplicate", { count })}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={clsx(
          "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-red-400)] text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)]",
          focusRing,
        )}
      >
        <Trash2 size={14} aria-hidden="true" />
        {t("studio.editor.context.delete", { count })}
      </button>
    </div>
  );
}

const mm = (t: (k: string, o?: Record<string, unknown>) => string) => (v: number) =>
  t("studio.editor.inspector.mm", { value: (v * 2).toFixed(1) });
const offsetText = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

/* -------------------------------------------------------------------- panels */

function MultiPanel({ selected }: { selected: PlacedJewelry[] }) {
  const { t } = useEditorLabels();
  const first = selected[0];
  const ids = selected.map((j) => j.id);
  const teethUsed = new Set(selected.map((j) => j.toothId)).size;
  const sharedCustom = selected.every((j) => j.customColor && j.customColor === first.customColor) ? first.customColor! : null;

  return (
    <>
      <h2 className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">
        {t("studio.editor.context.selected", { count: selected.length })}
      </h2>
      <Hint className="mt-1.5">{t("studio.editor.inspector.multiSub", { count: teethUsed })}</Hint>

      <SectionLabel>{t("studio.editor.inspector.typeAll")}</SectionLabel>
      <TypeSelect
        label={t("studio.editor.inspector.typeAll")}
        value={first.jewelryTypeId}
        onChange={(typeId) => {
          studioStore.pushHistory();
          studioStore.updateSelected({ jewelryTypeId: typeId });
        }}
      />

      <SectionLabel>{t("studio.editor.inspector.sizeAll")}</SectionLabel>
      <Slider
        label={t("studio.editor.inspector.diameter")}
        value={first.scale}
        {...SCALE_RANGE}
        format={mm(t)}
        onCommit={(v) => studioStore.updateSelected({ scale: v })}
      />

      <SectionLabel>{t("studio.editor.inspector.rotationAll")}</SectionLabel>
      <QuickRotate
        isOn={(deg) => selected.every((j) => j.rotation === deg)}
        onSet={(deg) => {
          studioStore.pushHistory();
          studioStore.updateSelected({ rotation: deg });
        }}
        onPlus90={() => {
          studioStore.pushHistory();
          studioStore.applyPatches(selected.map((j) => ({ id: j.id, patch: { rotation: (j.rotation + 90) % 360 } })));
        }}
      />
      <Slider
        label={t("studio.editor.inspector.spin")}
        value={first.rotation}
        min={0}
        max={360}
        step={1}
        format={(v) => `${Math.round(v)}°`}
        onCommit={(v) => studioStore.updateSelected({ rotation: v })}
      />

      <SectionLabel>{t("studio.editor.inspector.finishAll")}</SectionLabel>
      <Swatches
        isSelected={(fid) => selected.every((j) => !j.customColor && j.color === fid)}
        onPick={(fid) => {
          studioStore.pushHistory();
          studioStore.updateSelected({ color: fid, customColor: undefined });
        }}
        custom={sharedCustom}
      />

      <SectionLabel>{t("studio.editor.inspector.customColorAll")}</SectionLabel>
      <ColorWheel
        hex={first.customColor ?? null}
        onPick={(hex) => studioStore.updateSelected({ customColor: hex })}
        onClear={() => {
          studioStore.pushHistory();
          studioStore.updateSelected({ customColor: undefined });
        }}
      />

      <SectionLabel>{t("studio.editor.inspector.mountingAll")}</SectionLabel>
      <Slider
        label={t("studio.editor.inspector.standoff")}
        value={first.offset ?? 0}
        {...OFFSET_RANGE}
        format={offsetText}
        onCommit={(v) => studioStore.updateSelected({ offset: v })}
      />

      <SectionLabel>{t("studio.editor.inspector.layout")}</SectionLabel>
      <div className="flex gap-2">
        <button type="button" className={miniButton} onClick={distributeSelection}>
          <AlignHorizontalSpaceAround size={14} aria-hidden="true" />
          {t("studio.editor.inspector.distribute")}
        </button>
        <button type="button" className={miniButton} onClick={alignSelection}>
          <AlignCenterHorizontal size={14} aria-hidden="true" />
          {t("studio.editor.inspector.align")}
        </button>
      </div>
      <Hint className="mt-2">{t("studio.editor.inspector.layoutHint")}</Hint>

      <SectionLabel>{t("studio.editor.mirror.label")}</SectionLabel>
      <MirrorRow />
      <ActionRow count={selected.length} onDuplicate={() => duplicatePieces(ids)} onDelete={() => removePieces(ids)} />
    </>
  );
}

function SinglePanel({ jewel }: { jewel: PlacedJewelry }) {
  const { t, pieceName, toothName, toothShort, formatEstimate } = useEditorLabels();
  const def = JEWELRY_BY_ID[jewel.jewelryTypeId];
  const surface = getEngine()?.describeSurface(jewel) ?? null;
  const set = (patch: Partial<PlacedJewelry>, history = true) => {
    if (history) studioStore.pushHistory();
    studioStore.updateJewel(jewel.id, patch);
  };

  return (
    <>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]"
        >
          <PieceIcon id={jewel.jewelryTypeId} size={24} />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">
            {pieceName(jewel.jewelryTypeId)}
          </h2>
          <Hint>
            {jewel.toothId === FREE_TOOTH
              ? t("studio.editor.freePlacement")
              : t("studio.editor.inspector.onTooth", { fdi: jewel.toothId, name: toothName(jewel.toothId) })}
          </Hint>
          <p className="m-0 text-[12px] font-semibold text-[var(--text-primary)]" title={t("studio.editor.estimateHint")}>
            {t("studio.editor.estimateShort", { total: formatEstimate(estimateCents(jewel)) })}
          </p>
        </div>
      </div>

      <SectionLabel>{t("studio.editor.inspector.type")}</SectionLabel>
      <TypeSelect
        label={t("studio.editor.inspector.type")}
        value={jewel.jewelryTypeId}
        onChange={(typeId) => {
          const next = JEWELRY_BY_ID[typeId];
          // Keep a finish the customer chose; follow the new piece's default otherwise.
          const adoptColor = jewel.color === def.defaultColor;
          set({ jewelryTypeId: next.id, color: adoptColor ? next.defaultColor : jewel.color });
        }}
      />

      <SectionLabel>{t("studio.editor.inspector.size")}</SectionLabel>
      <Slider
        label={t("studio.editor.inspector.diameter")}
        value={jewel.scale}
        {...SCALE_RANGE}
        format={mm(t)}
        onCommit={(v) => set({ scale: v }, false)}
      />

      <SectionLabel>{t("studio.editor.inspector.rotation")}</SectionLabel>
      <QuickRotate
        isOn={(deg) => jewel.rotation === deg}
        onSet={(deg) => set({ rotation: deg })}
        onPlus90={() => set({ rotation: (jewel.rotation + 90) % 360 })}
      />
      <Slider
        label={t("studio.editor.inspector.spin")}
        value={jewel.rotation}
        min={0}
        max={360}
        step={1}
        format={(v) => `${Math.round(v)}°`}
        onCommit={(v) => set({ rotation: v }, false)}
      />

      <SectionLabel>{t("studio.editor.inspector.finish")}</SectionLabel>
      <Swatches
        isSelected={(fid) => !jewel.customColor && jewel.color === fid}
        onPick={(fid) => set({ color: fid, customColor: undefined })}
        custom={jewel.customColor ?? null}
      />

      <SectionLabel>{t("studio.editor.inspector.customColor")}</SectionLabel>
      <ColorWheel
        hex={jewel.customColor ?? null}
        onPick={(hex) => studioStore.updateJewel(jewel.id, { customColor: hex })}
        onClear={() => set({ customColor: undefined })}
      />

      <SectionLabel>{t("studio.editor.inspector.mounting")}</SectionLabel>
      <Slider
        label={t("studio.editor.inspector.standoff")}
        value={jewel.offset ?? 0}
        {...OFFSET_RANGE}
        format={offsetText}
        onCommit={(v) => set({ offset: v }, false)}
      />
      <Hint>{t("studio.editor.inspector.standoffHint")}</Hint>

      <SectionLabel>{t("studio.editor.mirror.label")}</SectionLabel>
      <MirrorRow />

      <SectionLabel>{t("studio.editor.inspector.position")}</SectionLabel>
      <span className="relative block">
        <select
          aria-label={t("studio.editor.inspector.position")}
          className={selectClass}
          value={jewel.toothId}
          onChange={(e) => {
            if (e.target.value === FREE_TOOTH) return;
            const ok = getEngine()?.relocateJewelToTooth(jewel.id, e.target.value);
            if (!ok) notify("noRoomOnTooth", undefined, "warning");
          }}
        >
          {jewel.toothId === FREE_TOOTH && <option value={FREE_TOOTH}>{t("studio.editor.freePlacementLong")}</option>}
          {ALL_TEETH.map((fdi) => (
            <option key={fdi} value={fdi}>
              {fdi} — {toothShort(fdi)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
      </span>
      {surface && (
        <p className="m-0 mt-2 text-[12px] font-semibold text-[var(--text-body)]">
          {t("studio.editor.surface.line", {
            third: t(`studio.editor.surface.third.${surface.third}`),
            face: t(`studio.editor.surface.face.${surface.face}`),
          })}
        </p>
      )}
      <Hint className="mt-1.5">{t("studio.editor.inspector.positionHint")}</Hint>

      <ActionRow count={1} onDuplicate={() => duplicatePieces([jewel.id])} onDelete={() => removePieces([jewel.id])} />
    </>
  );
}

function ToothPanel({ snap, toothId }: { snap: StudioSnapshot; toothId: string }) {
  const { t, pieceName, toothName } = useEditorLabels();
  const onTooth = snap.jewels.filter((j) => j.toothId === toothId);
  return (
    <>
      <p className="m-0 text-[46px] font-[var(--weight-black)] leading-[.95] tracking-[var(--tracking-display)] text-[var(--text-primary)]">
        #{toothId}
      </p>
      <h2 className="m-0 mt-2 text-[length:var(--text-h4)] font-bold leading-tight text-[var(--text-primary)]">{toothName(toothId)}</h2>
      <Hint className="mt-1">{t(snap.modelMode === "free" ? "studio.editor.inspector.fdiApprox" : "studio.editor.inspector.fdi")}</Hint>

      <SectionLabel>{t("studio.editor.inspector.piecesOnTooth")}</SectionLabel>
      {onTooth.length === 0 && <Hint>{t("studio.editor.inspector.toothEmpty")}</Hint>}
      <PieceList jewels={onTooth} label={(j) => pieceName(j.jewelryTypeId)} />

      <SectionLabel>{t("studio.editor.inspector.camera")}</SectionLabel>
      <Hint>{t("studio.editor.inspector.cameraHint")}</Hint>
    </>
  );
}

function OverviewPanel({ snap }: { snap: StudioSnapshot }) {
  const { t, pieceName, formatEstimate } = useEditorLabels();
  const zones = new Set(snap.jewels.map((j) => j.toothId)).size;
  const total = snap.jewels.reduce((s, j) => s + estimateCents(j), 0);
  const stat = (value: string | number, label: string) => (
    <div className="grid flex-1 gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3 text-center">
      <strong className="text-[22px] font-[var(--weight-black)] leading-none text-[var(--text-primary)]">{value}</strong>
      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-subtle)]">{label}</span>
    </div>
  );
  const shortcuts = ["undoRedo", "selectAll", "addToSelection", "pieceActions", "duplicate", "delete", "deselect", "pan", "focus"];

  return (
    <>
      <h2 className="sr-only">{t("studio.editor.inspector.overview")}</h2>
      <div className="flex gap-2">
        {stat(snap.jewels.length, t("studio.editor.inspector.pieces"))}
        {stat(zones, t("studio.editor.inspector.zones"))}
      </div>
      {total > 0 && (
        <div className="mt-2 flex items-baseline justify-between rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-3 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[.1em] text-[var(--gt-blue-700)]">
            {t("studio.editor.inspector.estimate")}
          </span>
          <strong className="text-[18px] font-[var(--weight-black)] text-[var(--text-primary)]">{formatEstimate(total)}</strong>
        </div>
      )}
      <Hint className="mt-2.5">{total > 0 ? t("studio.editor.estimateHint") : t("studio.editor.inspector.noOverlap")}</Hint>

      <SectionLabel>{t("studio.editor.inspector.design")}</SectionLabel>
      {snap.jewels.length === 0 && <Hint>{t("studio.editor.inspector.designEmpty")}</Hint>}
      <PieceList jewels={snap.jewels} label={(j) => pieceName(j.jewelryTypeId)} focusCamera />

      {/* Keyboard and mouse shortcuts mean nothing on a touch screen. */}
      <div className="max-lg:hidden">
        <SectionLabel>{t("studio.editor.shortcuts.title")}</SectionLabel>
        <dl className="m-0 grid gap-1">
          {shortcuts.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 py-0.5 text-[11.5px] text-[var(--text-muted)]">
              <dt>{t(`studio.editor.shortcuts.${key}`)}</dt>
              <dd className="m-0 flex gap-1">
                {t(`studio.editor.shortcuts.keys.${key}`)
                  .split("|")
                  .map((k) => (
                    <kbd
                      key={k}
                      className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-2 py-0.5 font-[inherit] text-[10px] font-bold text-[var(--text-body)]"
                    >
                      {k}
                    </kbd>
                  ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

function PieceList({
  jewels,
  label,
  focusCamera,
}: {
  jewels: PlacedJewelry[];
  label: (j: PlacedJewelry) => string;
  focusCamera?: boolean;
}) {
  const { toothTag } = useEditorLabels();
  if (!jewels.length) return null;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {jewels.map((j) => (
        <li key={j.id}>
          <button
            type="button"
            onClick={() => {
              studioStore.selectJewel(j.id);
              if (focusCamera) getEngine()?.focusTooth(j.toothId);
            }}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-2.5 py-2 text-left text-[12px] font-semibold text-[var(--text-body)] transition-[border-color,transform] hover:translate-x-0.5 hover:border-[var(--gt-blue-300)]",
              focusRing,
            )}
          >
            <span className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[10.5px] tabular-nums text-[var(--text-muted)]">
              {toothTag(j.toothId)}
            </span>
            <PieceIcon id={j.jewelryTypeId} size={15} className="text-[var(--gt-blue-600)]" />
            <span className="truncate">{label(j)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
