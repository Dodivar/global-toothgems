import { useEffect, useId, useState } from "react";
import { Download, Eye, EyeOff, ImageUp, Info, RotateCcw, Share, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { tryOnFileName } from "../../../lib/studio3d/tryOnPhoto";
import { useHydrated } from "../../../lib/useHydrated";
import {
  clampTransform,
  MAX_WIDTH,
  MIN_WIDTH,
  type BoxPlacement,
  type OverlayTransform,
} from "../../../lib/studio3d/tryOnTransform";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { composeTryOn, downloadFile } from "./exportComposite";
import type { TryOnGemRenderer } from "./gemOverlay";
import type { PreparedPhoto } from "./preparePhoto";
import { TryOnStage } from "./TryOnStage";

/** Why the artist is adjusting: the service placed the gems, or it is not available and they place them by hand. */
export type AdjustOrigin = { kind: "automatic"; confidence: number } | { kind: "manual"; reason: "not_available" | "chosen" };

function canShareImages(): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

const sliderClass = "w-full accent-[var(--gt-ink-900)]";

/**
 * Step 3: the creation on the photo, adjusted by hand — move, scale, turn,
 * before/after, opacity — then downloaded or shared as one image drawn in the
 * browser. The same controls correct an automatic placement.
 */
export function AdjustStep({
  photo,
  creation,
  renderer,
  initial,
  placements,
  origin,
  onNewPhoto,
}: {
  photo: PreparedPhoto;
  creation: Creation;
  renderer: TryOnGemRenderer;
  initial: OverlayTransform;
  placements: BoxPlacement[] | null;
  origin: AdjustOrigin;
  onNewPhoto: () => void;
}) {
  const { t } = useTranslation();
  const [transform, setTransform] = useState(initial);
  const [opacity, setOpacity] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportState, setExportState] = useState<"downloaded" | "failed" | null>(null);
  const keysId = useId();
  const sizeId = useId();
  const turnId = useId();
  const opacityId = useId();

  // Read once hydrated: whether this browser's share sheet takes image files.
  const hydrated = useHydrated();
  const canShare = hydrated && canShareImages();

  const compose = () =>
    composeTryOn({
      photo,
      transform,
      opacity: showOverlay ? opacity : 0,
      renderer,
      overlay: { creation, placements },
      fileName: tryOnFileName(creation.name),
    });

  // The share sheet must open right in the click (Safari refuses it after a
  // wait), so the image to share is drawn ahead, shortly after each change.
  const viewKey = `${transform.cx}|${transform.cy}|${transform.width}|${transform.rotation}|${showOverlay ? opacity : 0}`;
  const [shareFile, setShareFile] = useState<{ key: string; file: File } | null>(null);
  useEffect(() => {
    if (!canShare) return;
    let live = true;
    const timer = setTimeout(() => {
      compose()
        .then((file) => live && setShareFile({ key: viewKey, file }))
        .catch(() => live && setShareFile(null));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `compose` reads the same values `viewKey` sums up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShare, viewKey]);
  const shareReady = shareFile?.key === viewKey ? shareFile.file : null;

  const download = async () => {
    setExporting(true);
    setExportState(null);
    try {
      downloadFile(await compose());
      setExportState("downloaded");
    } catch {
      setExportState("failed");
    } finally {
      setExporting(false);
    }
  };

  const share = (file: File) => {
    setExportState(null);
    navigator.share({ files: [file], title: creation.name, text: t("studio.tryOn.adjust.shareText", { name: creation.name }) }).catch((err: unknown) => {
      if (!(err instanceof DOMException && err.name === "AbortError")) setExportState("failed");
    });
  };

  const set = (patch: Partial<OverlayTransform>) => setTransform((cur) => clampTransform({ ...cur, ...patch }));

  return (
    <div className="grid gap-4">
      {origin.kind === "automatic" ? (
        <p role="status" className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
          <Sparkles size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
          {t("studio.tryOn.adjust.automatic", { confidence: Math.round(origin.confidence * 100) })}
        </p>
      ) : origin.reason === "not_available" ? (
        <div role="status" className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
          <Info size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
          <span className="grid gap-0.5">
            <strong className="font-semibold">{t("studio.tryOn.errors.not_available.title")}</strong>
            <span className="text-[var(--text-muted)]">{t("studio.tryOn.errors.not_available.body")}</span>
          </span>
        </div>
      ) : null}

      <TryOnStage
        photo={photo}
        creation={creation}
        placements={placements}
        renderer={renderer}
        transform={transform}
        onTransform={setTransform}
        opacity={opacity}
        showOverlay={showOverlay}
        label={t("studio.tryOn.adjust.stageLabel", { name: creation.name })}
        describedBy={keysId}
      />
      <p id={keysId} className="m-0 text-[12px] leading-snug text-[var(--text-muted)]">
        {t("studio.tryOn.adjust.gestures")} <span className="hidden sm:inline">{t("studio.tryOn.adjust.keys")}</span>
      </p>

      <div className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label htmlFor={sizeId} className="text-[12px] font-semibold text-[var(--text-primary)]">
            {t("studio.tryOn.adjust.size")}
          </label>
          <input
            id={sizeId}
            type="range"
            min={Math.round(MIN_WIDTH * 100)}
            max={Math.round(MAX_WIDTH * 100)}
            value={Math.round(transform.width * 100)}
            aria-valuetext={`${Math.round(transform.width * 100)} %`}
            disabled={!showOverlay}
            onChange={(e) => set({ width: Number(e.target.value) / 100 })}
            className={sliderClass}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={turnId} className="text-[12px] font-semibold text-[var(--text-primary)]">
            {t("studio.tryOn.adjust.rotation")}
          </label>
          <input
            id={turnId}
            type="range"
            min={-180}
            max={180}
            value={Math.round(transform.rotation)}
            aria-valuetext={`${Math.round(transform.rotation)}°`}
            disabled={!showOverlay}
            onChange={(e) => set({ rotation: Number(e.target.value) })}
            className={sliderClass}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={opacityId} className="text-[12px] font-semibold text-[var(--text-primary)]">
            {t("studio.tryOn.adjust.opacity")}
          </label>
          <input
            id={opacityId}
            type="range"
            min={20}
            max={100}
            value={Math.round(opacity * 100)}
            aria-valuetext={`${Math.round(opacity * 100)} %`}
            disabled={!showOverlay}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className={sliderClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" iconLeft={showOverlay ? EyeOff : Eye} aria-pressed={!showOverlay} onClick={() => setShowOverlay((v) => !v)}>
          {t("studio.tryOn.adjust.before")}
        </Button>
        <Button variant="ghost" size="sm" iconLeft={RotateCcw} onClick={() => setTransform(initial)} disabled={!showOverlay}>
          {t("studio.tryOn.adjust.reset")}
        </Button>
        <Button variant="ghost" size="sm" iconLeft={ImageUp} onClick={onNewPhoto}>
          {t("studio.tryOn.adjust.newPhoto")}
        </Button>
      </div>

      <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canShare && (
            <Button variant="outline" size="sm" iconLeft={Share} loading={!shareReady} onClick={() => shareReady && share(shareReady)} disabled={!shareReady}>
              {t("studio.tryOn.adjust.share")}
            </Button>
          )}
          <Button variant="primary" size="sm" iconLeft={Download} loading={exporting} onClick={() => void download()}>
            {t("studio.tryOn.adjust.download")}
          </Button>
        </div>
        <p role="status" className="m-0 text-right text-[12px] font-semibold empty:hidden">
          {exportState === "downloaded" && <span className="text-[var(--text-primary)]">{t("studio.tryOn.adjust.downloaded")}</span>}
          {exportState === "failed" && <span className="text-[var(--status-error-fg)]">{t("studio.tryOn.adjust.exportFailed")}</span>}
        </p>
        <p className="m-0 text-right text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.tryOn.adjust.exportHint")}</p>
      </div>
    </div>
  );
}
