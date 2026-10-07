import clsx from "clsx";
import type { PlacedJewelry } from "../../../data/studioEditor";
import { lookSwatch } from "./lookSwatch";
import { useLocalized } from "../../../lib/localized";
import { swapPatch, type StudioGem, type StudioGemFinish } from "../../../lib/studio3d/gemCatalog";
import { studioStore } from "../../../lib/studio3d/store";
import { scaleForSs } from "../../../data/studioEditor";
import { useStudioGems } from "../../../lib/studio3d/useStudioGems";
import { useEditorLabels } from "./editorLabels";

/**
 * The two choices a placed piece offers, both limited to what the shop sells:
 * its colour — the shop gems of the same cut, and their colour variants — and
 * its stone size — the sizes its gem comes in. Shared by the inspector and the
 * stage's colour quick action; both act on the whole selection, one undo step
 * per pick.
 */

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

interface ColorOption {
  gem: StudioGem;
  finish: StudioGemFinish;
}

/** Every colour a piece of this cut can take: each shop gem of the cut, and each of its colour variants. */
function colorOptions(gems: StudioGem[], shape: StudioGem["shape"]): ColorOption[] {
  return gems.filter((g) => g.shape === shape).flatMap((gem) => gem.finishes.map((finish) => ({ gem, finish })));
}

export function ColorOptions({ selected }: { selected: PlacedJewelry[] }) {
  const { t } = useEditorLabels();
  const { gems } = useStudioGems();
  const l = useLocalized();
  const shape = selected[0]?.look.shape;
  if (!shape) return null;
  if (selected.some((j) => j.look.shape !== shape)) {
    return <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.editor.inspector.colorMixedShapes")}</p>;
  }
  const options = colorOptions(gems, shape);
  if (!options.length) return <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.editor.inspector.colorNone")}</p>;
  const isOn = (o: ColorOption) => selected.every((j) => j.productId === o.gem.key && (j.variantId ?? null) === o.finish.variantId);
  return (
    <div role="group" aria-label={t("studio.editor.inspector.color")} className="grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-1.5">
      {options.map((o) => {
        const name = o.finish.name ? l(o.finish.name) : l(o.gem.name);
        return (
          <button
            key={`${o.gem.key}|${o.finish.variantId ?? ""}`}
            type="button"
            aria-pressed={isOn(o)}
            aria-label={name}
            title={name}
            onClick={() => {
              if (isOn(o)) return;
              studioStore.pushHistory();
              studioStore.applyPatches(selected.map((j) => ({ id: j.id, patch: swapPatch(j, o.gem, o.finish) })));
            }}
            style={{ background: lookSwatch(o.finish.look) }}
            className={clsx(
              "aspect-square rounded-full border-2 shadow-[inset_0_1px_3px_rgba(0,0,0,.14)] transition-transform hover:-translate-y-px",
              focusRing,
              isOn(o) ? "border-[var(--gt-ink-900)] ring-2 ring-[var(--gt-blue-300)] ring-offset-2" : "border-black/5",
            )}
          />
        );
      })}
    </div>
  );
}

/** The stone sizes every selected piece's gem comes in. */
export function SizeOptions({ selected }: { selected: PlacedJewelry[] }) {
  const { t, sizeName } = useEditorLabels();
  const { byKey } = useStudioGems();
  const lists = selected.map((j) => byKey.get(j.productId)?.sizes ?? [j.ss]);
  const sizes = lists.reduce((common, list) => common.filter((ss) => list.includes(ss)));
  if (!sizes.length) return <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.editor.inspector.sizeMixed")}</p>;
  return (
    <div role="radiogroup" aria-label={t("studio.editor.inspector.size")} className="flex flex-wrap gap-1.5">
      {sizes.map((ss) => {
        const on = selected.every((j) => j.ss === ss);
        return (
          <button
            key={ss}
            type="button"
            role="radio"
            aria-checked={on}
            title={sizeName(ss)}
            onClick={() => {
              if (on) return;
              studioStore.pushHistory();
              studioStore.updateSelected({ ss, scale: scaleForSs(ss) });
            }}
            className={clsx(
              "inline-flex h-8 min-w-14 items-center justify-center rounded-[var(--radius-pill)] border px-3 text-[11.5px] font-semibold tabular-nums transition-colors",
              focusRing,
              on
                ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
                : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--border-strong)]",
            )}
          >
            {sizeName(ss)}
          </button>
        );
      })}
    </div>
  );
}
