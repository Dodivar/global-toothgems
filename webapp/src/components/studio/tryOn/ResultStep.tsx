import { useMemo, useState } from "react";
import { CircleCheck, Download, Expand, Eye, EyeOff, ImageUp, Info, RefreshCw, Share, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { resultExtension, type TryOnCreation } from "../../../lib/studio3d/tryOn";
import { tryOnFileName } from "../../../lib/studio3d/tryOnPhoto";
import { useHydrated } from "../../../lib/useHydrated";
import { downloadFile } from "../../../lib/downloadFile";
import type { PreparedPhoto } from "./preparePhoto";
import { ResultViewer } from "./ResultViewer";

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Step 3 of the AI try-on: the generated image, the photo it came from one
 * click away (before / after), then download or share. A tap on the image
 * opens it full screen with its own zoom (`ResultViewer`); the page's own
 * pinch-zoom is off on the image (it crashed Safari on iPhone). The image only lives
 * in this tab: closing the dialog forgets it. Marked `ph-no-capture` so
 * analytics session replay never records the face.
 */
export function ResultStep({
  photo,
  image,
  imageUrl,
  leftOut,
  creation,
  onRegenerate,
  onNewPhoto,
}: {
  photo: PreparedPhoto;
  image: Blob;
  /** An object URL of `image`, owned (and revoked) by the dialog. */
  imageUrl: string;
  /** Gems the AI did not draw because their spot does not show on the photo (the function's photo check). */
  leftOut: number;
  creation: TryOnCreation;
  onRegenerate: () => void;
  onNewPhoto: () => void;
}) {
  const { t } = useTranslation();
  const [before, setBefore] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [state, setState] = useState<"downloaded" | "failed" | null>(null);
  const file = useMemo(() => new File([image], tryOnFileName(creation.name, resultExtension(image.type)), { type: image.type }), [image, creation.name]);
  const hydrated = useHydrated();
  const canShare = hydrated && canShareFile(file);

  const shownUrl = before ? photo.url : imageUrl;
  const shownAlt = before ? t("studio.tryOn.result.beforeAlt") : t("studio.tryOn.result.alt", { name: creation.name });

  const share = () => {
    setState(null);
    navigator.share({ files: [file], title: creation.name, text: t("studio.tryOn.result.shareText", { name: creation.name }) }).catch((err: unknown) => {
      if (!(err instanceof DOMException && err.name === "AbortError")) setState("failed");
    });
  };

  return (
    <div className="grid gap-4">
      <p
        role="status"
        className="m-0 inline-flex items-center justify-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-success-fg)] motion-safe:animate-[gt-pop_600ms_ease-out_500ms_both]"
      >
        <CircleCheck size={16} aria-hidden="true" />
        {t("studio.tryOn.result.ready")}
      </p>
      <figure className="ph-no-capture m-0 grid gap-2">
        <button
          type="button"
          onClick={() => setEnlarged(true)}
          aria-label={t("studio.tryOn.viewer.open")}
          className="gt-tryon-sheen relative grid cursor-zoom-in touch-pan-y place-items-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] shadow-[var(--shadow-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <img src={shownUrl} alt={shownAlt} draggable={false} className="gt-tryon-reveal max-h-[62dvh] w-auto max-w-full object-contain sm:max-h-[60dvh]" />
          <span aria-hidden="true" className="absolute bottom-2 right-2 inline-grid h-8 w-8 place-items-center rounded-full bg-[rgba(22,26,32,.7)] text-white">
            <Expand size={15} />
          </span>
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[rgba(22,26,32,.7)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-white">
            {before ? t("studio.tryOn.result.beforeTag") : (
              <>
                <Sparkles size={11} aria-hidden="true" />
                {t("studio.tryOn.result.aiTag")}
              </>
            )}
          </span>
        </button>
        <figcaption className="text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.tryOn.result.disclaimer")}</figcaption>
      </figure>
      {leftOut > 0 && (
        <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px] leading-snug text-[var(--text-body)]">
          <Info size={15} aria-hidden="true" className="mt-px shrink-0" />
          {t("studio.tryOn.result.leftOut", { count: leftOut })}
        </p>
      )}
      {enlarged && <ResultViewer src={shownUrl} alt={shownAlt} onClose={() => setEnlarged(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" iconLeft={before ? EyeOff : Eye} aria-pressed={before} onClick={() => setBefore((v) => !v)}>
          {t("studio.tryOn.result.before")}
        </Button>
        <Button variant="ghost" size="sm" iconLeft={RefreshCw} onClick={onRegenerate}>
          {t("studio.tryOn.result.regenerate")}
        </Button>
        <Button variant="ghost" size="sm" iconLeft={ImageUp} onClick={onNewPhoto}>
          {t("studio.tryOn.errorActions.newPhoto")}
        </Button>
      </div>

      <p className="m-0 text-[11.5px] leading-snug text-[var(--text-muted)] sm:text-right">{t("studio.tryOn.result.notStored")}</p>

      {/* Stays at the bottom of the scrolling dialog so Download / Share never leave the phone's screen. */}
      <div className="sticky bottom-0 z-10 -mx-[var(--space-5)] -mb-[var(--space-5)] grid gap-1 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-[var(--space-5)] pb-[max(var(--space-4),env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center justify-end gap-2 max-sm:[&>*]:flex-1">
          {canShare && (
            <Button variant="outline" size="sm" iconLeft={Share} onClick={share}>
              {t("studio.tryOn.result.share")}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            iconLeft={Download}
            onClick={() => {
              downloadFile(file);
              setState("downloaded");
            }}
          >
            {t("studio.tryOn.result.download")}
          </Button>
        </div>
        <p role="status" className="m-0 text-right text-[12px] font-semibold empty:hidden">
          {state === "downloaded" && <span className="text-[var(--text-primary)]">{t("studio.tryOn.result.downloaded")}</span>}
          {state === "failed" && <span className="text-[var(--status-error-fg)]">{t("studio.tryOn.result.shareFailed")}</span>}
        </p>
      </div>
    </div>
  );
}
