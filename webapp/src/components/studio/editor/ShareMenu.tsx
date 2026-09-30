import { useEffect, useState } from "react";
import { Download, Link2, LoaderCircle, Save, Settings2, Share, Share2 } from "lucide-react";
import { EditorPopover, PopoverItem, PopoverLabel, PopoverSeparator } from "./EditorPopover";
import { useEditorLabels } from "./editorLabels";
import { ShareNetworkIcon } from "../ShareNetworks";
import { useWorkspaceActions } from "../workspace/useWorkspaceActions";
import { getEngine } from "../../../lib/studio3d/engine";
import { notify } from "../../../lib/studio3d/notices";
import { canShareFiles, openShareLink, SHARE_NETWORKS, type ShareContent } from "../../../lib/studio3d/socialShare";
import { studioStore, useStudio } from "../../../lib/studio3d/store";
import type { ShareLink } from "../../../lib/studioWorkspace/share";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";

/**
 * The toolbar's Share menu.
 *
 * - The render, through the system share sheet where the browser offers one
 *   (the only way into Instagram or TikTok from the web), or downloaded.
 * - The social networks, with the creation's READ-ONLY LINK: whoever opens it
 *   sees the design in 3D and cannot change it.
 *
 * Opening the menu never makes a design public: it only looks for a link the
 * artist already created. Creating one is the share dialog's explicit step,
 * and a design must be saved first, since the link opens the saved creation.
 */
export function ShareMenu({ triggerClassName }: { triggerClassName: string }) {
  const { t } = useEditorLabels();
  const ws = useWorkspace();
  const snap = useStudio();
  const { save } = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  // Rendered as the menu opens: the share sheet must be called right in the click, with no wait before it.
  const [image, setImage] = useState<File | null>(null);
  // `undefined` while looking, `null` when the creation has no active link yet.
  const [link, setLink] = useState<ShareLink | null | undefined>(undefined);
  const linked = ws.creations.find((c) => c.id === snap.active?.creationId) ?? null;
  const { existingShareLink } = ws;

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

  useEffect(() => {
    if (!open || !linked) return;
    let live = true;
    existingShareLink(linked).then((l) => live && setLink(l));
    return () => {
      live = false;
      setLink(undefined);
    };
  }, [open, linked, existingShareLink]);

  const content = (url: string): ShareContent => ({
    url,
    text: t("studio.workspace.share.nativeText", { name: linked?.name ?? "" }),
    title: linked?.name ?? t("studio.editor.share.title"),
  });

  const shareImage = (file: File) => {
    const text = linked && link ? `${content(link.url).text} ${link.url}` : t("studio.editor.share.message");
    setOpen(false);
    navigator.share({ files: [file], title: linked?.name ?? t("studio.editor.share.title"), text }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed by the customer
      notify("shareFailed", undefined, "error");
    });
  };

  const copyLink = async (url: string) => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(url);
      notify("linkCopied");
    } catch {
      notify("linkCopyFailed", undefined, "error");
    }
  };

  const openDialog = () => {
    setOpen(false);
    if (linked) openWorkspaceDialog({ kind: "shareCreation", creation: linked });
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
      {!linked ? (
        <PopoverItem
          icon={<Save size={14} />}
          label={t("studio.editor.share.saveFirst")}
          sub={t("studio.editor.share.saveFirstSub")}
          onClick={() => {
            setOpen(false);
            save("auto");
          }}
        />
      ) : link === undefined ? (
        <p role="status" className="m-0 flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-[var(--text-muted)]">
          <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" />
          {t("studio.editor.share.lookingUp")}
        </p>
      ) : link === null ? (
        <PopoverItem
          icon={<Link2 size={14} />}
          label={t("studio.editor.share.createLink")}
          sub={t("studio.editor.share.createLinkSub")}
          onClick={openDialog}
        />
      ) : (
        <>
          {SHARE_NETWORKS.map((network) => (
            <PopoverItem
              key={network}
              icon={<ShareNetworkIcon network={network} />}
              label={t(`studio.editor.share.${network}`)}
              onClick={() => {
                setOpen(false);
                openShareLink(network, content(link.url));
              }}
            />
          ))}
          <PopoverItem icon={<Link2 size={14} />} label={t("studio.editor.share.copyLink")} onClick={() => void copyLink(link.url)} />
          <PopoverItem icon={<Settings2 size={14} />} label={t("studio.editor.share.manageLink")} onClick={openDialog} />
        </>
      )}
      {linked && ws.dirty && <p className="m-0 px-2.5 pb-1 text-[11.5px] leading-snug text-[var(--text-muted)]">{t("studio.editor.share.unsavedHint")}</p>}
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
