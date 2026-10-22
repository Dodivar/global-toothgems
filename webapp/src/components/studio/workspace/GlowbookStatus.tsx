import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Check, CircleAlert, Clock3, Sparkles } from "lucide-react";
import type { ModerationStatus } from "../../../lib/studioWorkspace/glowbook";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";

/**
 * Where a Glowbook page or creation stands, wherever the workspace shows it:
 * always an icon and words, never colour alone.
 */

const STATUS_STYLE: Record<ModerationStatus, { icon: typeof Check; cls: string }> = {
  pending: { icon: Clock3, cls: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" },
  approved: { icon: Check, cls: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" },
  rejected: { icon: CircleAlert, cls: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]" },
};

export function ModerationBadge({ status, kind }: { status: ModerationStatus; kind: "page" | "item" | "changes" }) {
  const { t } = useTranslation();
  const { icon: Icon, cls } = STATUS_STYLE[status];
  return (
    <span className={clsx("inline-flex flex-none items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-bold", cls)}>
      <Icon size={12} aria-hidden="true" />
      {t(`studio.glowbook.status.${kind}.${status}`)}
    </span>
  );
}

const CARD_ICON: Record<ModerationStatus, typeof Check> = { approved: Sparkles, pending: Clock3, rejected: CircleAlert };

/** On a card in My Creations: this creation is in the Glowbook, and how it stands. Nothing when it is not. */
export function CreationGlowbookBadge({ creationId, className }: { creationId: string; className?: string }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const item = gb.status === "ready" ? gb.itemFor(creationId) : undefined;
  if (!item) return null;
  const Icon = CARD_ICON[item.status];
  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.06em] shadow-[var(--shadow-sm)] backdrop-blur-[6px]",
        item.status === "approved"
          ? "bg-[var(--gt-ink-900)]/85 text-white"
          : item.status === "pending"
            ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
            : "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
        className,
      )}
    >
      <Icon size={12} aria-hidden="true" className="flex-none" />
      <span className="truncate">{t(`studio.glowbook.card.${item.status}`)}</span>
    </span>
  );
}

/** In "Delete this creation?": it is on the Glowbook too, and goes with it. Nothing when it is not. */
export function GlowbookDeleteNotice({ creationId }: { creationId: string }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const item = gb.status === "ready" ? gb.itemFor(creationId) : undefined;
  if (!item) return null;
  const featured = gb.glowbook?.look.featuredItemId === item.id;
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--text-primary)]"
    >
      <Sparkles size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-600)]" />
      <div className="grid gap-1">
        <p className="m-0 font-bold">{t(`studio.glowbook.deleteNotice.${item.status}`)}</p>
        <p className="m-0 text-[var(--text-muted)]">
          {t("studio.glowbook.deleteNotice.body")}
          {featured && <> {t("studio.glowbook.deleteNotice.featured")}</>}
        </p>
      </div>
    </div>
  );
}
