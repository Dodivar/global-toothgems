import { createPortal } from "react-dom";
import clsx from "clsx";
import { FileDown, Smile } from "lucide-react";
import type { PlacedJewelry } from "../../data/studioEditor";
import type { FrontViewProjection } from "../../lib/studio3d/frontView";
import type { SceneModel } from "../../lib/studioWorkspace/scene";
import { Button, type ButtonVariant } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FrontView } from "./FrontView";
import { useFrontView } from "./useFrontView";
import { useFrontViewLabels } from "./frontViewLabels";
import { usePlacementSheet, type PlacementSheetRequest } from "./usePlacementSheet";

/**
 * The front view as the Studio shows it: the drawing (named and described for
 * assistive technologies), a note for the gems it cannot draw, and the
 * numbered list of gems in words — the same numbers as on the drawing and on
 * the placement sheet.
 */
export function FrontViewFigure({
  projection,
  highlightIds,
  list = true,
  className,
}: {
  projection: FrontViewProjection;
  highlightIds?: readonly string[];
  /** The numbered list under the drawing (default true). */
  list?: boolean | "collapsed";
  className?: string;
}) {
  const { t } = useFrontViewLabels();
  const count = projection.gems.length;
  return (
    <figure className={clsx("m-0 grid gap-2.5", className)}>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
        <FrontView
          projection={projection}
          highlightIds={highlightIds}
          title={t("studio.frontView.svgTitle")}
          description={t("studio.frontView.svgDescription", { count })}
          sideLabels={{ patientRight: t("studio.frontView.patientRight"), patientLeft: t("studio.frontView.patientLeft") }}
        />
      </div>
      {projection.unplaced > 0 && (
        <figcaption className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {t("studio.frontView.unplaced", { count: projection.unplaced })}
        </figcaption>
      )}
      {list === "collapsed" ? (
        count > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[12px] font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              {t("studio.frontView.listToggle", { count })}
            </summary>
            <div className="mt-2">
              <FrontViewList projection={projection} />
            </div>
          </details>
        )
      ) : (
        list && <FrontViewList projection={projection} />
      )}
    </figure>
  );
}

/** The gems in words, numbered like the drawing. */
export function FrontViewList({ projection }: { projection: FrontViewProjection }) {
  const { t, describe } = useFrontViewLabels();
  if (!projection.gems.length) return <p className="m-0 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.frontView.empty")}</p>;
  return (
    <ol aria-label={t("studio.frontView.listLabel")} className="m-0 grid list-none gap-1 p-0">
      {projection.gems.map((g) => {
        const d = describe(g);
        return (
          <li key={g.id} className="flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-page)] px-2.5 py-1.5 text-[11.5px] leading-snug">
            <span
              aria-hidden="true"
              className="grid h-5 min-w-5 flex-none place-items-center rounded-full border border-[var(--gt-ink-900)] bg-[var(--surface-card)] px-1 text-[10.5px] font-black tabular-nums text-[var(--text-primary)]"
            >
              {g.number}
            </span>
            <span className="sr-only">{t("studio.frontView.gemNumber", { number: g.number })} </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-semibold text-[var(--text-primary)]">
                {d.tooth}
                {d.note && <span className="font-normal italic text-[var(--text-muted)]"> ({d.note})</span>}
              </span>
              <span className="text-[var(--text-body)]">{[d.shape, d.size, d.colour].join(" · ")}</span>
            </span>
            <span className="flex-none text-[10.5px] tabular-nums text-[var(--text-muted)]">{t("studio.frontView.order", { order: g.order })}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** "Placement sheet · PDF": downloads the sheet of a design; says when it is being made or failed. */
export function PlacementSheetButton({
  request,
  variant = "outline",
  className,
}: {
  request: PlacementSheetRequest;
  variant?: ButtonVariant;
  className?: string;
}) {
  const { t } = useFrontViewLabels();
  const { status, download, ready } = usePlacementSheet();
  return (
    <span className={clsx("inline-grid gap-1", className)}>
      <Button
        type="button"
        variant={variant}
        size="sm"
        iconLeft={FileDown}
        loading={status === "working" || !ready}
        disabled={!request.pieces.length || !ready}
        onClick={() => void download(request)}
      >
        {t("studio.placementSheet.action")}
      </Button>
      {status === "error" && (
        <span role="alert" className="text-[11px] text-[var(--status-error-fg)]">
          {t("studio.placementSheet.error")}
        </span>
      )}
    </span>
  );
}

/**
 * The front view large, with its list and the placement sheet, in a dialog.
 * Rendered at the document's root: the editor's side panels slide (a
 * transform), which would otherwise hold a fixed overlay inside them.
 */
export function FrontViewDialog({
  open,
  onClose,
  pieces,
  model,
  name,
  modifiedAt,
  highlightIds,
}: {
  open: boolean;
  onClose: () => void;
  pieces: readonly PlacedJewelry[];
  model: SceneModel;
  name: string;
  modifiedAt?: string;
  highlightIds?: readonly string[];
}) {
  const { t } = useFrontViewLabels();
  const projection = useFrontView(pieces, model);
  if (!open) return null;
  return createPortal(
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t("studio.frontView.dialogTitle", { name })}
      description={t("studio.frontView.hint")}
      icon={<Smile size={17} />}
      closeLabel={t("studio.frontView.close")}
      footer={<PlacementSheetButton request={{ name, pieces, model, modifiedAt }} variant="dark" />}
    >
      <FrontViewFigure projection={projection} highlightIds={highlightIds} />
    </Dialog>,
    document.body,
  );
}

/** A saved design's front view, its gems listed on demand (the creation's detail). */
export function FrontViewSection({ pieces, model, className }: { pieces: readonly PlacedJewelry[]; model: SceneModel; className?: string }) {
  const { t } = useFrontViewLabels();
  const projection = useFrontView(pieces, model);
  return (
    <section aria-label={t("studio.frontView.title")} className={clsx("grid gap-2", className)}>
      <h3 className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{t("studio.frontView.title")}</h3>
      {pieces.length ? <FrontViewFigure projection={projection} list="collapsed" /> : <FrontViewList projection={projection} />}
    </section>
  );
}
