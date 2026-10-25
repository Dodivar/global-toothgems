import { useState } from "react";
import clsx from "clsx";
import { Link2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { downloadFile } from "../../../lib/downloadFile";
import { desktopAction, fileFits, NETWORK_NAMES, SOCIAL_NETWORKS, type SocialNetwork } from "../../../lib/studio3d/socialExport/networks";
import type { ShareFormat } from "../../../lib/studio3d/socialExport/formats";
import type { ShareOutput } from "../../../lib/studio3d/socialExport/motion";
import { canShareFiles } from "../../../lib/studio3d/socialShare";
import { trackStudio } from "../../../lib/studioAnalytics";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { usePublicLink } from "./usePublicLink";

/** A network's initials in the icon slot: lucide ships no brand marks, and none are loaded from the networks. */
const MONOGRAMS: Record<SocialNetwork, string> = {
  instagram: "IG",
  tiktok: "TT",
  pinterest: "P",
  facebook: "f",
  snapchat: "SC",
  whatsapp: "WA",
  x: "X",
  threads: "@",
};

type Notice = { network: SocialNetwork; kind: "upload" | "link" | "failed" };

/**
 * One button per network for the file just made (decision 101 addendum: no
 * publishing API). A phone opens the system share menu with the file; a
 * computer shares the creation's public page where the network takes a link,
 * else downloads the file and opens the network's own create page.
 */
export function NetworkButtons({
  creation,
  file,
  format,
  output,
  highlight,
}: {
  creation: Creation;
  file: File;
  format: ShareFormat;
  output: ShareOutput;
  highlight: SocialNetwork | null;
}) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`studio.socialExport.networks.${key}`, opts);
  const { link, creating, failed, create } = usePublicLink(creation);
  const [notice, setNotice] = useState<Notice | null>(null);
  const sheet = canShareFiles(file);
  const message = t("studio.workspace.share.nativeText", { name: creation.name });
  const imageUrl = creation.thumbnailUrl && /^https:\/\//.test(creation.thumbnailUrl) ? creation.thumbnailUrl : null;
  const linkShare = link.kind === "ready" ? { url: link.url, text: message, imageUrl } : null;

  const order = highlight ? [highlight, ...SOCIAL_NETWORKS.filter((n) => n !== highlight)] : SOCIAL_NETWORKS;

  const onClick = async (network: SocialNetwork) => {
    setNotice(null);
    if (sheet) {
      trackStudio("studio_social_share_clicked", { network, output, format, method: "share_sheet" });
      try {
        await navigator.share({ files: [file], title: creation.name, text: linkShare ? `${message} ${linkShare.url}` : message });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // closed by the member
        setNotice({ network, kind: "failed" });
      }
      return;
    }
    const action = desktopAction(network, linkShare);
    trackStudio("studio_social_share_clicked", { network, output, format, method: action.kind === "link" ? "link" : "upload_page" });
    if (action.kind === "upload") downloadFile(file);
    window.open(action.url, "_blank", "noopener,noreferrer");
    setNotice({ network, kind: action.kind });
  };

  return (
    <section aria-labelledby="gt-export-networks" className="grid gap-2.5 border-t border-[var(--border-subtle)] pt-3">
      <h3 id="gt-export-networks" className="m-0 text-[12.5px] font-bold text-[var(--text-primary)]">
        {k("title")}
      </h3>
      <p className="m-0 text-[11.5px] leading-snug text-[var(--text-muted)]">{sheet ? k("sheetHint") : k("desktopHint")}</p>
      <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-4">
        {order.map((network) => {
          const fits = fileFits(network, file.type);
          return (
            <li key={network}>
              <button
                type="button"
                onClick={() => void onClick(network)}
                aria-describedby={fits ? undefined : `gt-export-fit-${network}`}
                className={clsx(
                  "flex h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-card)] px-2.5 text-left text-[12.5px] font-semibold text-[var(--text-primary)] transition-colors",
                  "hover:border-[var(--border-strong)] hover:bg-[var(--surface-brand-wash)]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                  network === highlight ? "border-[var(--gt-ink-900)]" : "border-[var(--border-default)]",
                )}
              >
                <span aria-hidden="true" className="grid h-6 min-w-6 flex-none place-items-center rounded-[6px] bg-[var(--gt-ink-900)] px-1 text-[10px] font-black leading-none text-white">
                  {MONOGRAMS[network]}
                </span>
                <span className="min-w-0 truncate">{NETWORK_NAMES[network]}</span>
                {!fits && <TriangleAlert size={13} aria-hidden="true" className="ml-auto flex-none text-[var(--status-warning-fg,#b45309)]" />}
              </button>
              {!fits && (
                <span id={`gt-export-fit-${network}`} className="sr-only">
                  {k(file.type === "image/gif" ? "gifWarning" : "webmWarning", { network: NETWORK_NAMES[network] })}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {(file.type.startsWith("video/webm") || file.type === "image/gif") && (
        <p className="m-0 text-[11.5px] text-[var(--text-muted)]">{k(file.type === "image/gif" ? "gifNote" : "webmNote")}</p>
      )}

      {!sheet && (
        <div className="grid gap-1.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
          {link.kind === "loading" && (
            <p role="status" className="m-0 flex items-center gap-1.5">
              <LoaderCircle size={12} aria-hidden="true" className="motion-safe:animate-spin" />
              {k("linkLooking")}
            </p>
          )}
          {link.kind === "ready" && <p className="m-0">{k(link.source === "glowbook" ? "linkGlowbook" : "linkShare")}</p>}
          {link.kind === "none" && (
            <>
              <p className="m-0">{k("linkNone")}</p>
              <Button variant="outline" size="sm" iconLeft={Link2} className="justify-self-start" disabled={creating} onClick={() => void create()}>
                {creating ? k("linkCreating") : k("linkCreate")}
              </Button>
              {failed && (
                <p role="alert" className="m-0 text-[var(--status-error-fg)]">
                  {k("linkFailed")}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {notice && (
        <p role={notice.kind === "failed" ? "alert" : "status"} className={clsx("m-0 text-[12px]", notice.kind === "failed" ? "text-[var(--status-error-fg)]" : "text-[var(--text-primary)]")}>
          {k(`notice.${notice.kind}`, { network: NETWORK_NAMES[notice.network] })}
        </p>
      )}
    </section>
  );
}
