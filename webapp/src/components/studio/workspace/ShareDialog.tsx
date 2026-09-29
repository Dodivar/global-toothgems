import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy, ExternalLink, Eye, Link2, Link2Off, RefreshCw, Share2, TriangleAlert } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useToast } from "../../../lib/toast";
import { useStudio } from "../../../lib/studio3d/store";
import type { ShareLink } from "../../../lib/studioWorkspace/share";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { ShareNetworkButtons } from "../ShareNetworks";
import { fieldClass, useWorkspaceFormat } from "./workspaceStyles";

/**
 * A read-only link to a saved creation, for anyone to look at in 3D — and to
 * post on social networks. Opening the dialog is the explicit act that creates
 * the link. A stored link (Supabase) always shows the latest saved version and
 * can be disabled here; a snapshot link (local demo library) carries the
 * design as saved. The dialog says plainly which, and who can see it.
 */
export function ShareDialog({ creation, onClose }: { creation: Creation; onClose: () => void }) {
  const { t } = useWorkspaceFormat();
  const { showToast } = useToast();
  const ws = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  // Bumped to ask for a fresh link after the previous one was disabled.
  const [attempt, setAttempt] = useState(0);
  const snap = useStudio();
  const { shareLink, revokeShare } = ws;
  // The creation is on the stage with edits not yet saved: those are not in the link.
  const onStageUnsaved = ws.dirty && snap.active?.creationId === creation.id;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const url = link?.url ?? null;
  const message = t("studio.workspace.share.nativeText", { name: creation.name });

  useEffect(() => {
    if (revoked) return;
    let live = true;
    shareLink(creation)
      .then((l) => live && setLink(l))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [creation, shareLink, revoked, attempt]);

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
      await navigator.share({ title: creation.name, text: message, url });
    } catch {
      /* dismissed by the customer: nothing to report */
    }
  };

  const revoke = async () => {
    setRevoking(true);
    const ok = await revokeShare(creation);
    setRevoking(false);
    setConfirmRevoke(false);
    if (!ok) return;
    setLink(null);
    setCopied(false);
    setRevoked(true);
  };

  const newLink = () => {
    setRevoked(false);
    setFailed(false);
    setAttempt((n) => n + 1);
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
          {canNativeShare && !revoked && (
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
      {revoked ? (
        <div role="status" className="grid justify-items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4">
          <p className="m-0 flex gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
            <Link2Off size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-error-fg)]" />
            {t("studio.workspace.share.revokedNote")}
          </p>
          <Button variant="outline" size="sm" iconLeft={RefreshCw} onClick={newLink}>
            {t("studio.workspace.share.newLink")}
          </Button>
        </div>
      ) : (
        <>
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

          <div className="grid gap-2">
            <p className="m-0 text-[12px] font-bold text-[var(--text-primary)]">{t("studio.workspace.share.networks")}</p>
            <ShareNetworkButtons content={url ? { url, text: message, title: creation.name } : null} />
          </div>

          <ul
            id="gt-share-note"
            className="m-0 grid list-none gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4 text-[12.5px] leading-relaxed text-[var(--text-muted)]"
          >
            <li className="flex gap-2">
              <Eye size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-600)]" />
              {t("studio.workspace.share.noteReadOnly")}
            </li>
            <li className="flex gap-2">
              <Link2 size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-600)]" />
              {t(link?.live ? "studio.workspace.share.noteLive" : "studio.workspace.share.noteSnapshot")}
            </li>
            {onStageUnsaved && (
              <li className="flex gap-2 font-semibold text-[var(--text-primary)]">
                <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                {t(link?.live ? "studio.workspace.share.noteUnsavedLive" : "studio.workspace.share.noteUnsaved")}
              </li>
            )}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] text-[12.5px] font-semibold text-[var(--gt-blue-700)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <ExternalLink size={13} aria-hidden="true" />
                {t("studio.workspace.share.preview")}
              </a>
            )}
            {link?.revocable &&
              (confirmRevoke ? (
                <span className="ml-auto inline-flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(false)} disabled={revoking}>
                    {t("studio.workspace.cancel")}
                  </Button>
                  <Button variant="danger" size="sm" iconLeft={Link2Off} onClick={() => void revoke()} disabled={revoking}>
                    {t("studio.workspace.share.revokeConfirm")}
                  </Button>
                </span>
              ) : (
                <Button variant="dangerOutline" size="sm" iconLeft={Link2Off} className="ml-auto" onClick={() => setConfirmRevoke(true)}>
                  {t("studio.workspace.share.revoke")}
                </Button>
              ))}
          </div>
          {confirmRevoke && (
            <p role="alert" className="m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              {t("studio.workspace.share.revokeHint")}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
