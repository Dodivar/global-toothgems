import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck } from "lucide-react";
import clsx from "clsx";
import { useCommunity } from "../../lib/community";
import { useToast } from "../../lib/toast";
import { focusRing } from "./styles";

/**
 * Keeps a discussion in "Saved discussions".
 *
 * Saving is quiet — a filled bookmark and a changed label — and the toast is
 * what confirms it, so the control never has to shout. The icon changes shape
 * as well as colour, and `aria-pressed` carries the state for everyone else.
 */
export function SaveButton({
  discussionId,
  labelled = false,
  className,
}: {
  discussionId: string;
  /** Shows the wording beside the icon. Cards use the icon alone. */
  labelled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { isSaved, toggleSaved } = useCommunity();
  const { showToast } = useToast();
  const saved = isSaved(discussionId);
  const Icon = saved ? BookmarkCheck : Bookmark;

  const label = saved ? t("community.saved") : t("community.save");

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={labelled ? undefined : label}
      title={labelled ? undefined : label}
      onClick={(e) => {
        /* Cards wrap their body in a link; saving must not open the thread. */
        e.preventDefault();
        e.stopPropagation();
        const nowSaved = toggleSaved(discussionId);
        showToast(nowSaved ? t("community.toastSaved") : t("community.toastUnsaved"), undefined, "info");
      }}
      className={clsx(
        "inline-flex items-center gap-2 rounded-[var(--radius-pill)] border font-semibold transition-[background-color,border-color,color] duration-[var(--duration-fast)] active:scale-[0.96]",
        labelled ? "h-8 px-3 text-[length:var(--text-body-sm)]" : "h-8 w-8 justify-center",
        focusRing,
        saved
          ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]",
        className,
      )}
    >
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      {labelled && label}
    </button>
  );
}
