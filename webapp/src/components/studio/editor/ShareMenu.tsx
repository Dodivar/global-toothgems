import { useEffect, useState, type ReactNode } from "react";
import { Download, Link2, Mail, MessageCircle, Share, Share2 } from "lucide-react";
import { EditorPopover, PopoverItem, PopoverLabel, PopoverSeparator } from "./EditorPopover";
import { useEditorLabels } from "./editorLabels";
import { getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { canShareFiles, SHARE_NETWORKS, shareLink, type ShareNetwork } from "../../../lib/studio3d/share";
import { studioStore } from "../../../lib/studio3d/store";
import { STUDIO_PATH } from "../../../lib/studioUrl";

/** A network's initials, in the icon slot: lucide ships no brand marks, and none are loaded from the networks. */
function Monogram({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-3.5 w-3.5 place-items-center rounded-[3px] bg-current text-[8.5px] font-black leading-none">
      <span className="text-[var(--surface-card)]">{children}</span>
    </span>
  );
}

const NETWORK_ICONS: Record<ShareNetwork, ReactNode> = {
  whatsapp: <MessageCircle size={14} />,
  facebook: <Monogram>f</Monogram>,
  x: <Monogram>X</Monogram>,
  linkedin: <Monogram>in</Monogram>,
  email: <Mail size={14} />,
};

/**
 * The toolbar's Share menu: the render through the system share sheet where
 * the browser offers one (the only way into Instagram or TikTok from the web),
 * each network's share link for the public Studio page, the link itself and
 * the image to post by hand. A creation has no public page of its own, so the
 * image carries the design.
 */
export function ShareMenu({ triggerClassName }: { triggerClassName: string }) {
  const { t } = useEditorLabels();
  const [open, setOpen] = useState(false);
  // Rendered as the menu opens: the share sheet must be called right in the click, with no wait before it.
  const [image, setImage] = useState<File | null>(null);

  useEffect(() => {
    if (!open || !studioStore.jewels.length) return;
    let live = true;
    getEngine()
      ?.shareableImage()
      .then((file) => live && setImage(file))
      .catch(() => live && setImage(null));
    return () => {
      live = false;
      setImage(null);
    };
  }, [open]);

  const content = () => ({
    url: `${window.location.origin}${STUDIO_PATH}`,
    text: t("studio.editor.share.message"),
    title: t("studio.editor.share.title"),
  });

  const shareImage = (file: File) => {
    const { url, text, title } = content();
    setOpen(false);
    navigator.share({ files: [file], title, text: `${text} ${url}` }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed by the customer
      notify("shareFailed", undefined, "error");
    });
  };

  const openNetwork = (network: ShareNetwork) => {
    const link = shareLink(network, content());
    setOpen(false);
    if (network === "email") window.location.assign(link);
    else window.open(link, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(content().url);
      notify("linkCopied");
    } catch {
      notify("linkCopyFailed", undefined, "error");
    }
  };

  const downloadImage = async () => {
    const engine = getEngine();
    setOpen(false);
    if (!engine) return;
    if (!studioStore.jewels.length) return notify("shareEmpty", undefined, "warning");
    try {
      await engine.exportPNG(false);
      notify("shareDownloaded");
    } catch {
      notify("exportFailed", undefined, "error");
    }
  };

  return (
    <EditorPopover
      label={t("studio.editor.share.menu")}
      open={open}
      onOpenChange={setOpen}
      width={280}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={triggerClassName}
          aria-label={t("studio.editor.share.menu")}
          title={t("studio.editor.share.menu")}
        >
          <Share2 size={16} aria-hidden="true" />
        </button>
      )}
    >
      {image && canShareFiles(image) && (
        <>
          <PopoverItem
            icon={<Share size={14} />}
            label={t("studio.editor.share.native")}
            sub={t("studio.editor.share.nativeSub")}
            onClick={() => shareImage(image)}
          />
          <PopoverSeparator />
        </>
      )}
      <PopoverLabel>{t("studio.editor.share.networks")}</PopoverLabel>
      {SHARE_NETWORKS.map((network) => (
        <PopoverItem
          key={network}
          icon={NETWORK_ICONS[network]}
          label={t(`studio.editor.share.${network}`)}
          onClick={() => openNetwork(network)}
        />
      ))}
      <PopoverItem icon={<Link2 size={14} />} label={t("studio.editor.share.copyLink")} onClick={() => void copyLink()} />
      <PopoverSeparator />
      <PopoverItem
        icon={<Download size={14} />}
        label={t("studio.editor.share.download")}
        sub={t("studio.editor.share.downloadSub")}
        onClick={() => void downloadImage()}
      />
      <p className="m-0 px-2.5 pb-1.5 pt-1 text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.editor.share.hint")}</p>
    </EditorPopover>
  );
}
