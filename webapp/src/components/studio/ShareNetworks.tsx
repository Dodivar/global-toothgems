import type { ReactNode } from "react";
import clsx from "clsx";
import { Mail, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openShareLink, SHARE_NETWORKS, type ShareContent, type ShareNetwork } from "../../lib/studio3d/socialShare";

/** A network's initials, in the icon slot: lucide ships no brand marks, and none are loaded from the networks. */
function Monogram({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-3.5 w-3.5 place-items-center rounded-[3px] bg-current text-[8.5px] font-black leading-none">
      <span className="text-[var(--surface-card)]">{children}</span>
    </span>
  );
}

const ICONS: Record<ShareNetwork, ReactNode> = {
  whatsapp: <MessageCircle size={14} />,
  facebook: <Monogram>f</Monogram>,
  x: <Monogram>X</Monogram>,
  linkedin: <Monogram>in</Monogram>,
  email: <Mail size={14} />,
};

/** The icon of a share network, shared by the editor's Share menu and the share dialog. */
export function ShareNetworkIcon({ network }: { network: ShareNetwork }) {
  return <>{ICONS[network]}</>;
}

/**
 * One button per network, sharing `content` (the read-only link and its
 * message). Disabled while the link is being prepared.
 */
export function ShareNetworkButtons({ content, className }: { content: ShareContent | null; className?: string }) {
  const { t } = useTranslation();
  return (
    <ul className={clsx("m-0 flex list-none flex-wrap gap-1.5 p-0", className)}>
      {SHARE_NETWORKS.map((network) => (
        <li key={network}>
          <button
            type="button"
            disabled={!content}
            onClick={() => content && openShareLink(network, content)}
            className={clsx(
              "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-[12.5px] font-semibold text-[var(--text-primary)] transition-colors",
              "hover:border-[var(--border-strong)] hover:bg-[var(--surface-brand-wash)] disabled:pointer-events-none disabled:opacity-45",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
            )}
          >
            <span aria-hidden="true" className="text-[var(--gt-blue-600)]">
              <ShareNetworkIcon network={network} />
            </span>
            {t(`studio.editor.share.${network}`)}
          </button>
        </li>
      ))}
    </ul>
  );
}
