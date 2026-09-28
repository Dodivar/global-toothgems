import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy, ExternalLink, Eye, Link2, Share2, TriangleAlert } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useToast } from "../../../lib/toast";
import { useStudio } from "../../../lib/studio3d/store";
import { STUDIO_SHARE_PATH } from "../../../lib/studioUrl";
import { createShareUrl } from "../../../lib/studioWorkspace/share";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { fieldClass, useWorkspaceFormat } from "./workspaceStyles";

/**
 * A read-only link to a saved creation, for another customer to look at in
 * 3D. The link carries a snapshot of the design as saved (see `share.ts`), so
 * the dialog says plainly what that means: later edits are not in it, and
 * anyone who has it can view it.
 */
export function ShareDialog({ creation, onClose }: { creation: Creation; onClose: () => void }) {
  const { t } = useWorkspaceFormat();
  const { showToast } = useToast();
  const ws = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const snap = useStudio();
  // The creation is on the stage with edits not yet saved: those are not in the link.
  const onStageUnsaved = ws.dirty && snap.active?.creationId === creation.id;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let live = true;
    createShareUrl({ name: creation.name, description: creation.description, scene: creation.scene }, STUDIO_SHARE_PATH)
      .then((u) => live && setUrl(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [creation]);

  const selectLink = () => inputRef.current?.select();

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast(t("studio.workspace.share.copied"), undefined, "success");
    } catch {
      // Clipboard refused (permissions, insecure context): the link is selected for a manual copy.
      selectLink();
      showToast(t("studio.workspace.share.copyFailed"), undefined, "warning");
    }
  };

  const nativeShare = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: creation.name, text: t("studio.workspace.share.nativeText", { name: creation.name }), url });
    } catch {
      /* dismissed by the customer: nothing to report */
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("studio.workspace.share.title")}
      description={t("studio.workspace.share.intro", { name: creation.name })}
      icon={<Link2 size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={
        <>
          {canNativeShare && (
            <Button variant="ghost" size="sm" iconLeft={Share2} onClick={nativeShare} disabled={!url}>
              {t("studio.workspace.share.native")}
            </Button>
          )}
          <Button variant="outline" size="sm" className="ml-auto" onClick={onClose}>
            {t("studio.workspace.close")}
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        <label htmlFor="gt-share-link" className="text-[12px] font-bold text-[var(--text-primary)]">
          {t("studio.workspace.share.linkLabel")}
        </label>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <input
            ref={inputRef}
            id="gt-share-link"
            readOnly
            value={url ?? (failed ? "" : t("studio.workspace.share.preparing"))}
            onFocus={selectLink}
            aria-invalid={failed || undefined}
            aria-describedby="gt-share-note"
            className={clsx(fieldClass, "font-mono text-[12.5px] text-[var(--text-muted)]")}
          />
          <Button variant="primary" size="sm" iconLeft={copied ? Check : Copy} onClick={copy} disabled={!url} className="h-auto min-h-9 flex-none">
            {copied ? t("studio.workspace.share.copiedShort") : t("studio.workspace.share.copy")}
          </Button>
        </div>
        {failed && (
          <p role="alert" className="m-0 text-[12.5px] text-[var(--status-error-fg)]">
            {t("studio.workspace.share.failed")}
          </p>
        )}
      </div>

      <ul id="gt-share-note" className="m-0 grid list-none gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
        <li className="flex gap-2">
          <Eye size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-600)]" />
          {t("studio.workspace.share.noteReadOnly")}
        </li>
        <li className="flex gap-2">
          <Link2 size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-600)]" />
          {t("studio.workspace.share.noteSnapshot")}
        </li>
        {onStageUnsaved && (
          <li className="flex gap-2 font-semibold text-[var(--text-primary)]">
            <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("studio.workspace.share.noteUnsaved")}
          </li>
        )}
      </ul>

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 justify-self-start rounded-[var(--radius-xs)] text-[12.5px] font-semibold text-[var(--gt-blue-700)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <ExternalLink size={13} aria-hidden="true" />
          {t("studio.workspace.share.preview")}
        </a>
      )}
    </Dialog>
  );
}
