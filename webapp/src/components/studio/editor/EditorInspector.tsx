import { useId, useRef, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignHorizontalSpaceAround,
  ChevronDown,
  Copy,
  ExternalLink,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Trash2,
} from "lucide-react";
import { ColorOptions, SizeOptions } from "./GemPickers";
import { InfoTip, InfoTipText } from "./InfoTip";
import { GemPhoto, PieceIcon } from "./PieceIcon";
import { useEditorLabels } from "./editorLabels";
import { ALL_TEETH, FREE_TOOTH, OFFSET_RANGE, UPPER_TEETH, type PlacedJewelry } from "../../../data/studioEditor";
import { Link } from "../../../lib/navigation";
import { estimateComposition, findFinish } from "../../../lib/studio3d/gemCatalog";
import { useStudioGems } from "../../../lib/studio3d/useStudioGems";
import {
  alignSelection,
  centerOnTeeth,
  distributeSelection,
  duplicateMirroredPieces,
  duplicatePieces,
  mirrorSelection,
  removePieces,
  rotatePieces,
} from "../../../lib/studio3d/actions";
import { getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { studioStore, type StudioSnapshot } from "../../../lib/studio3d/store";
import { SaveSelectionAsGroup } from "../workspace/SaveSelectionAsGroup";

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
  else if (selected.length === 1) body = <SinglePanel key={selected[0].id} jewel={selected[0]} snap={snap} />;
  else if (snap.selectedToothId && snap.selectedToothId !== FREE_TOOTH)
    body = <ToothPanel key={snap.selectedToothId} snap={snap} toothId={snap.selectedToothId} />;
  else body = <OverviewPanel snap={snap} />;

  return (
    <aside
      aria-label={useEditorLabels().t("studio.editor.inspector.label")}
      className="gt-editor-scroll min-h-0 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 pb-7 pt-4 studio-side:border-l studio-side:border-t-0"
    >
      <div className="gt-editor-panel-in">{body}</div>
    </aside>
  );
}

/* ------------------------------------------------------------ building blocks */

/** A section heading; `info` puts that section's explanation in a bubble at the end of the rule. */
function SectionLabel({ children, info }: { children: string; info?: string }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center gap-1.5">
      <h3 className="m-0 flex flex-1 items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)] after:h-px after:flex-1 after:bg-[var(--border-subtle)]">
        {children}
      </h3>
      {info && <SectionInfo topic={children}>{info}</SectionInfo>}
    </div>
  );
}

/** The explanation of a panel or section, shown on hover, keyboard focus or tap. */
function SectionInfo({ topic, children, className }: { topic: string; children: string; className?: string }) {
  const { t } = useEditorLabels();
  return (
    <InfoTip label={t("studio.editor.inspector.infoAbout", { topic })} className={clsx("-my-1.5", className)}>
      <InfoTipText>{children}</InfoTipText>
    </InfoTip>
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
      <div className="mt-2 flex gap-2">
        <button type="button" className={miniButton} onClick={() => duplicateMirroredPieces([...studioStore.selectedJewelIds])}>
          <SquareSplitHorizontal size={14} aria-hidden="true" />
          {t("studio.editor.mirror.duplicate")}
        </button>
        <button type="button" className={miniButton} onClick={() => duplicateMirroredPieces([...studioStore.selectedJewelIds], "v")}>
          <SquareSplitVertical size={14} aria-hidden="true" />
          {t("studio.editor.mirror.duplicateVertical")}
        </button>
      </div>
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

const offsetText = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

/* -------------------------------------------------------------------- panels */

function MultiPanel({ selected }: { selected: PlacedJewelry[] }) {
  const { t } = useEditorLabels();
  const first = selected[0];
  const ids = selected.map((j) => j.id);
  const teethUsed = new Set(selected.map((j) => j.toothId)).size;
  const alignLabelId = useId();

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">
          {t("studio.editor.context.selected", { count: selected.length })}
        </h2>
        <SectionInfo topic={t("studio.editor.context.selected", { count: selected.length })} className="mt-0.5">
          {t("studio.editor.inspector.multiHint")}
        </SectionInfo>
      </div>
      <Hint className="mt-1.5">{t("studio.editor.inspector.multiSub", { count: teethUsed })}</Hint>
      <SaveSelectionAsGroup ids={ids} />

      <SectionLabel info={t("studio.editor.inspector.colorHint")}>{t("studio.editor.inspector.colorAll")}</SectionLabel>
      <ColorOptions selected={selected} />

      <SectionLabel info={t("studio.editor.inspector.sizeHint")}>{t("studio.editor.inspector.sizeAll")}</SectionLabel>
      <SizeOptions selected={selected} />

      <SectionLabel info={t("studio.editor.inspector.rotationGroupHint")}>{t("studio.editor.inspector.rotationAll")}</SectionLabel>
      <GroupTurnButtons ids={ids} />

      <SectionLabel>{t("studio.editor.inspector.mountingAll")}</SectionLabel>
      <Slider
        label={t("studio.editor.inspector.standoff")}
        value={first.offset ?? 0}
        {...OFFSET_RANGE}
        format={offsetText}
        onCommit={(v) => studioStore.updateSelected({ offset: v })}
      />

      <SectionLabel info={t("studio.editor.inspector.layoutHint")}>{t("studio.editor.inspector.layout")}</SectionLabel>
      <div role="group" aria-labelledby={alignLabelId} className="flex items-center gap-2">
        <span id={alignLabelId} className="flex-none text-[11px] font-semibold text-[var(--text-muted)]">
          {t("studio.editor.inspector.align")}
        </span>
        <button
          type="button"
          className={miniButton}
          aria-label={t("studio.editor.inspector.alignHorizontalLabel")}
          title={t("studio.editor.inspector.alignHorizontalLabel")}
          onClick={() => alignSelection("h")}
        >
          <AlignCenterHorizontal size={14} aria-hidden="true" />
          {t("studio.editor.inspector.alignHorizontal")}
        </button>
        <button
          type="button"
          className={miniButton}
          aria-label={t("studio.editor.inspector.alignVerticalLabel")}
          title={t("studio.editor.inspector.alignVerticalLabel")}
          onClick={() => alignSelection("v")}
        >
          <AlignCenterVertical size={14} aria-hidden="true" />
          {t("studio.editor.inspector.alignVertical")}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" className={miniButton} onClick={distributeSelection}>
          <AlignHorizontalSpaceAround size={14} aria-hidden="true" />
          {t("studio.editor.inspector.distribute")}
        </button>
        <button
          type="button"
          className={miniButton}
          aria-label={t("studio.editor.inspector.centerAll")}
          title={t("studio.editor.inspector.centerAll")}
          onClick={() => centerOnTeeth(ids)}
        >
          <Crosshair size={14} aria-hidden="true" />
          {t("studio.editor.inspector.centerShort")}
        </button>
      </div>

      <SectionLabel info={t("studio.editor.mirror.hint")}>{t("studio.editor.mirror.label")}</SectionLabel>
      <MirrorRow />
      <ActionRow count={selected.length} onDuplicate={() => duplicatePieces(ids)} onDelete={() => removePieces(ids)} />
    </>
  );
}

/**
 * Turn the selection as a group, around its centre as seen on screen (the
 * pieces travel with it): a quarter turn or a fine 15° step either way. Each
 * press is one undo step.
 */
function GroupTurnButtons({ ids }: { ids: string[] }) {
  const { t } = useEditorLabels();
  const turn = (deg: number, Icon: typeof RotateCw) => (
    <button
      type="button"
      className={miniButton}
      aria-label={t("studio.editor.inspector.turnBy", { deg: deg > 0 ? `+${deg}` : `−${Math.abs(deg)}` })}
      onClick={() => rotatePieces(ids, deg)}
    >
      <Icon size={13} aria-hidden="true" />
      {deg > 0 ? `+${deg}°` : `−${Math.abs(deg)}°`}
    </button>
  );
  return (
    <div className="flex gap-1.5">
      {turn(-90, RotateCcw)}
      {turn(-15, RotateCcw)}
      {turn(15, RotateCw)}
      {turn(90, RotateCw)}
    </div>
  );
}

function SinglePanel({ jewel, snap }: { jewel: PlacedJewelry; snap: StudioSnapshot }) {
  const { t, pieceName, finishName, toothName, toothShort, formatEstimate } = useEditorLabels();
  const gem = useStudioGems().byKey.get(jewel.productId);
  const finish = gem ? findFinish(gem, jewel.variantId) : null;
  const colour = finishName(jewel);
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
          <GemPhoto src={finish?.image ?? gem?.image} look={jewel.look} size={36} />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">
            {pieceName(jewel)}
          </h2>
          {colour && <p className="m-0 text-[12px] font-semibold text-[var(--text-body)]">{colour}</p>}
          <Hint>
            {jewel.toothId === FREE_TOOTH
              ? t("studio.editor.freePlacement")
              : t("studio.editor.inspector.onTooth", { fdi: jewel.toothId, name: toothName(jewel.toothId) })}
          </Hint>
          {gem && finish ? (
            <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] font-semibold text-[var(--text-primary)]">
              <span title={t("studio.editor.estimateHint")}>{t("studio.editor.shopPrice", { price: formatEstimate(finish.priceMinor) })}</span>
              <Link
                to={`/boutique/${gem.slug}`}
                target="_blank"
                rel="noopener"
                className={clsx("inline-flex items-center gap-1 text-[var(--gt-blue-700)] underline-offset-2 hover:underline", focusRing)}
              >
                {t("studio.editor.inspector.viewInShop")}
                <ExternalLink size={12} aria-hidden="true" />
              </Link>
            </p>
          ) : (
            <Hint>{t("studio.editor.inspector.unavailable")}</Hint>
          )}
        </div>
      </div>

      <SectionLabel info={t("studio.editor.inspector.colorHint")}>{t("studio.editor.inspector.color")}</SectionLabel>
      <ColorOptions selected={[jewel]} />

      <SectionLabel info={t("studio.editor.inspector.sizeHint")}>{t("studio.editor.inspector.size")}</SectionLabel>
      <SizeOptions selected={[jewel]} />

      <SectionLabel>{t("studio.editor.inspector.rotation")}</SectionLabel>
      <QuickRotate
        isOn={(deg) => jewel.rotation === deg}
        onSet={(deg) => set({ rotation: deg })}
        onPlus90={() => rotatePieces([jewel.id], 90)}
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

      <SectionLabel info={t("studio.editor.inspector.standoffHint")}>{t("studio.editor.inspector.mounting")}</SectionLabel>
      <Slider
        label={t("studio.editor.inspector.standoff")}
        value={jewel.offset ?? 0}
        {...OFFSET_RANGE}
        format={offsetText}
        onCommit={(v) => set({ offset: v }, false)}
      />

      <SectionLabel info={t("studio.editor.mirror.hint")}>{t("studio.editor.mirror.label")}</SectionLabel>
      <MirrorRow />

      <SectionLabel info={t("studio.editor.inspector.positionHint")}>{t("studio.editor.inspector.position")}</SectionLabel>
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
          {/* The simplified reference arch and imports carry the upper arch only. */}
          {(snap.modelMode === "dentition" ? ALL_TEETH : UPPER_TEETH).map((fdi) => (
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
      {jewel.toothId !== FREE_TOOTH && (
        <button type="button" className={clsx(miniButton, "mt-2.5 w-full")} onClick={() => centerOnTeeth([jewel.id])}>
          <Crosshair size={14} aria-hidden="true" />
          {t("studio.editor.inspector.center")}
        </button>
      )}

      <ActionRow count={1} onDuplicate={() => duplicatePieces([jewel.id])} onDelete={() => removePieces([jewel.id])} />
      <SaveSelectionAsGroup ids={[jewel.id]} />
    </>
  );
}

function ToothPanel({ snap, toothId }: { snap: StudioSnapshot; toothId: string }) {
  const { t, pieceName, toothName } = useEditorLabels();
  const onTooth = snap.jewels.filter((j) => j.toothId === toothId);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-[46px] font-[var(--weight-black)] leading-[.95] tracking-[var(--tracking-display)] text-[var(--text-primary)]">
          #{toothId}
        </p>
        <SectionInfo topic={t("studio.editor.inspector.camera")} className="mt-1">
          {t("studio.editor.inspector.cameraHint")}
        </SectionInfo>
      </div>
      <h2 className="m-0 mt-2 text-[length:var(--text-h4)] font-bold leading-tight text-[var(--text-primary)]">{toothName(toothId)}</h2>
      <Hint className="mt-1">{t(snap.modelMode === "free" ? "studio.editor.inspector.fdiApprox" : "studio.editor.inspector.fdi")}</Hint>

      <SectionLabel>{t("studio.editor.inspector.piecesOnTooth")}</SectionLabel>
      {onTooth.length === 0 && <Hint>{t("studio.editor.inspector.toothEmpty")}</Hint>}
      <PieceList jewels={onTooth} label={pieceName} />
    </>
  );
}

function OverviewPanel({ snap }: { snap: StudioSnapshot }) {
  const { t, pieceName, formatEstimate } = useEditorLabels();
  const { byKey } = useStudioGems();
  const zones = new Set(snap.jewels.map((j) => j.toothId)).size;
  const total = estimateComposition(snap.jewels, (key) => byKey.get(key)).totalMinor;
  const stat = (value: string | number, label: string) => (
    <div className="grid flex-1 gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3 text-center">
      <strong className="text-[22px] font-[var(--weight-black)] leading-none text-[var(--text-primary)]">{value}</strong>
      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-subtle)]">{label}</span>
    </div>
  );
  const shortcuts = [
    "undoRedo",
    "selectAll",
    "addToSelection",
    "lasso",
    "pieceActions",
    "duplicate",
    "duplicateMirror",
    "delete",
    "deselect",
    "pan",
    "focus",
  ];

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
      {/* Stays in view: it qualifies the price shown just above. */}
      {total > 0 && <Hint className="mt-2.5">{t("studio.editor.estimateHint")}</Hint>}

      <SectionLabel info={t("studio.editor.inspector.noOverlap")}>{t("studio.editor.inspector.design")}</SectionLabel>
      {snap.jewels.length === 0 && <Hint>{t("studio.editor.inspector.designEmpty")}</Hint>}
      <PieceList jewels={snap.jewels} label={pieceName} focusCamera />

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
    <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-1.5 p-0">
      {jewels.map((j) => (
        <li key={j.id}>
          <button
            type="button"
            onClick={() => {
              // Gathering pieces (multi-selection mode): the row adds or removes, the camera stays put.
              const gathering = studioStore.multiSelect;
              studioStore.selectJewel(j.id, { toggle: gathering });
              if (focusCamera && !gathering) getEngine()?.focusTooth(j.toothId);
            }}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-2.5 py-2 text-left text-[12px] font-semibold text-[var(--text-body)] transition-[border-color,transform] hover:translate-x-0.5 hover:border-[var(--gt-blue-300)]",
              focusRing,
            )}
          >
            <span className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[10.5px] tabular-nums text-[var(--text-muted)]">
              {toothTag(j.toothId)}
            </span>
            <PieceIcon look={j.look} size={15} />
            <span className="truncate">{label(j)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
