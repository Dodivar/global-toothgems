import { useMemo, useState } from "react";
import { Download, Eye, EyeOff, ImageUp, RefreshCw, Share, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { resultExtension, type TryOnCreation } from "../../../lib/studio3d/tryOn";
import { tryOnFileName } from "../../../lib/studio3d/tryOnPhoto";
import { useHydrated } from "../../../lib/useHydrated";
import { downloadFile } from "../../../lib/downloadFile";
import type { PreparedPhoto } from "./preparePhoto";

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Step 3 of the AI try-on: the generated image, the photo it came from one
 * click away (before / after), then download or share. The image only lives
 * in this tab: closing the dialog forgets it. Marked `ph-no-capture` so
 * analytics session replay never records the face.
 */
export function ResultStep({
  photo,
  image,
  imageUrl,
  creation,
  onRegenerate,
  onNewPhoto,
}: {
  photo: PreparedPhoto;
  image: Blob;
  /** An object URL of `image`, owned (and revoked) by the dialog. */
  imageUrl: string;
  creation: TryOnCreation;
  onRegenerate: () => void;
  onNewPhoto: () => void;
}) {
  const { t } = useTranslation();
  const [before, setBefore] = useState(false);
  const [state, setState] = useState<"downloaded" | "failed" | null>(null);
  const file = useMemo(() => new File([image], tryOnFileName(creation.name, resultExtension(image.type)), { type: image.type }), [image, creation.name]);
  const hydrated = useHydrated();
  const canShare = hydrated && canShareFile(file);

  const share = () => {
    setState(null);
    navigator.share({ files: [file], title: creation.name, text: t("studio.tryOn.result.shareText", { name: creation.name }) }).catch((err: unknown) => {
      if (!(err instanceof DOMException && err.name === "AbortError")) setState("failed");
    });
  };

  return (
    <div className="grid gap-4">
      <figure className="ph-no-capture m-0 grid gap-2">
        <div className="relative grid place-items-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)]">
          <img
            src={before ? photo.url : imageUrl}
            alt={before ? t("studio.tryOn.result.beforeAlt") : t("studio.tryOn.result.alt", { name: creation.name })}
            className="max-h-[60vh] w-auto max-w-full object-contain"
          />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[rgba(22,26,32,.7)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-white">
            {before ? t("studio.tryOn.result.beforeTag") : (
              <>
                <Sparkles size={11} aria-hidden="true" />
                {t("studio.tryOn.result.aiTag")}
              </>
            )}
          </span>
        </div>
        <figcaption className="text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.tryOn.result.disclaimer")}</figcaption>
      </figure>

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

      <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
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
        <p className="m-0 text-right text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.tryOn.result.notStored")}</p>
      </div>
    </div>
  );
}
