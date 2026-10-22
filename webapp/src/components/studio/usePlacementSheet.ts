import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlacedJewelry } from "../../data/studioEditor";
import { sameSize, type GemSize } from "../../lib/gemOptions";
import { useFormat } from "../../lib/format";
import { useLocalized } from "../../lib/localized";
import { projectFrontView } from "../../lib/studio3d/frontView";
import { estimateComposition, type EstimateLine } from "../../lib/studio3d/gemCatalog";
import { useStudioGems } from "../../lib/studio3d/useStudioGems";
import type { SceneModel } from "../../lib/studioWorkspace/scene";
import { useFrontViewLabels } from "./frontViewLabels";

export interface PlacementSheetRequest {
  /** The design's name ("Untitled" when it has none yet). */
  name: string;
  pieces: readonly PlacedJewelry[];
  model: SceneModel;
  /** ISO date of the saved design's last change; omitted for the editor's live design. */
  modifiedAt?: string;
}

export type PlacementSheetStatus = "idle" | "working" | "error";

/** The PDF fonts lack "≈": the sheet writes "~" instead. */
const forPdf = (value: string) => value.replace(/≈\s?/g, "~");

/**
 * The placement sheet from a click: labels in the UI language, gems and
 * totals from the front view and the shopping estimate, then the PDF written
 * by `lib/studio3d/placementSheet.ts` (loaded on first use) and handed to the
 * browser's download.
 */
export function usePlacementSheet() {
  const labels = useFrontViewLabels();
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();
  const l = useLocalized();
  const { byKey, status: gemsStatus } = useStudioGems();
  const [status, setStatus] = useState<PlacementSheetStatus>("idle");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const download = useCallback(
    async (request: PlacementSheetRequest): Promise<boolean> => {
      if (busy.current || !request.pieces.length) return false;
      busy.current = true;
      setStatus("working");
      try {
        const [sheet, files] = await Promise.all([import("../../lib/studio3d/placementSheet"), import("../../lib/saveFile")]);
        const projection = projectFrontView(request.pieces, request.model);
        const now = new Date();
        const today = formatDate(now.toISOString());

        const rows = projection.gems.map((g) => {
          const d = labels.describe(g);
          return { number: g.number, order: g.order, tooth: d.tooth, shape: d.shape, size: forPdf(d.size), colour: d.colour, ...(d.note ? { note: d.note } : {}) };
        });

        // What to buy, from the shopping estimate: one line per product and colour (and size when sold per size).
        const estimate = estimateComposition([...request.pieces], (key) => byKey.get(key));
        const used = new Set<EstimateLine>();
        const toBuy = (productId: string, variantId: string | null, size: GemSize) => {
          const line = estimate.lines.find((x) => x.productId === productId && x.variantId === variantId && (x.size == null || sameSize(x.size, size)));
          if (!line) return "—";
          // A line covering several sizes is said once, on its first reference.
          if (used.has(line)) return t("studio.placementSheet.sameAsAbove");
          used.add(line);
          const offer = [
            line.offer.name && line.offer.pack == null && line.offer.size == null ? l(line.offer.name) : null,
            line.offer.pack != null ? t("studio.editor.shopping.pack", { count: line.offer.pack }) : null,
            line.offer.size != null ? labels.sizeShort(line.offer.size) : null,
          ].filter(Boolean);
          return offer.length ? `${line.quantity} × ${offer.join(" · ")}` : `× ${line.quantity}`;
        };
        const { referenceGroups } = sheet;
        const totals = referenceGroups(projection).map((group) => {
          const piece = projection.gems.find((g) => g.number === group.numbers[0])!.piece;
          return {
            reference: labels.pieceName(piece),
            colour: labels.colourName(piece),
            size: forPdf(labels.sizeName(group.size)),
            count: group.numbers.length,
            numbers: group.numbers.join(", "),
            toBuy: toBuy(group.productId, group.variantId, group.size),
          };
        });

        const count = projection.gems.length;
        const subtitle = request.modifiedAt
          ? t("studio.placementSheet.subtitleModified", { count, date: formatDate(request.modifiedAt) })
          : t("studio.placementSheet.subtitle", { count });
        const pdf = sheet.buildPlacementSheet(
          {
            projection,
            name: request.name,
            date: today,
            lang: i18n.language,
            rows,
            totals,
            labels: {
              title: t("studio.placementSheet.title"),
              subtitle,
              figure: t("studio.frontView.title"),
              patientRight: t("studio.frontView.patientRight"),
              patientLeft: t("studio.frontView.patientLeft"),
              unplacedNote: projection.unplaced ? t("studio.frontView.unplaced", { count: projection.unplaced }) : null,
              gemsTitle: t("studio.placementSheet.gemsTitle"),
              number: t("studio.placementSheet.number"),
              tooth: t("studio.placementSheet.tooth"),
              shape: t("studio.placementSheet.shape"),
              size: t("studio.placementSheet.size"),
              colour: t("studio.placementSheet.colour"),
              order: t("studio.placementSheet.order"),
              totalsTitle: t("studio.placementSheet.totalsTitle"),
              reference: t("studio.placementSheet.reference"),
              count: t("studio.placementSheet.count"),
              numbers: t("studio.placementSheet.numbers"),
              toBuy: t("studio.placementSheet.toBuy"),
              footer: t("studio.placementSheet.footer"),
              page: (page, pages) => t("studio.placementSheet.page", { page, count: pages }),
              author: "Global Toothgems",
            },
          },
          now,
        );
        files.saveFile(
          new Blob([pdf as BlobPart], { type: "application/pdf" }),
          sheet.placementSheetFileName(t("studio.placementSheet.fileName"), request.name, now),
        );
        if (mounted.current) setStatus("idle");
        return true;
      } catch (error) {
        console.warn("[studio] the placement sheet could not be produced", error);
        if (mounted.current) setStatus("error");
        return false;
      } finally {
        busy.current = false;
      }
    },
    [byKey, formatDate, i18n.language, l, labels, t],
  );

  /**
   * False while the shop's gems are loading: a sheet made then would name no
   * product. A catalogue that failed to load does not block it.
   */
  const ready = gemsStatus !== "loading";
  return { status, download, ready };
}
