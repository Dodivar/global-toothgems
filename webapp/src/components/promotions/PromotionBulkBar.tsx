import { useTranslation } from "react-i18next";
import { Archive, Copy, FolderMinus, FolderPlus, Pause, Play, X } from "lucide-react";
import { AdminButton } from "../admin/AdminButton";

/**
 * Contextual actions for ticked promotions. Absent until something is ticked,
 * floating at the bottom edge so it stays in reach at row forty — the one other
 * place, with toasts, where the glass surface earns its keep. Archive sits
 * apart behind a rule and in the error tone, and always goes through a
 * confirmation.
 */
export function PromotionBulkBar({
  count,
  busy,
  onActivate,
  onPause,
  onDuplicate,
  onAddToCampaign,
  onRemoveFromCampaign,
  onArchive,
  onClear,
}: {
  count: number;
  busy: boolean;
  onActivate: () => void;
  onPause: () => void;
  onDuplicate: () => void;
  onAddToCampaign: () => void;
  onRemoveFromCampaign: () => void;
  onArchive: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div role="region" aria-label={t("promo.bulk.label")} className="pointer-events-none fixed inset-x-0 bottom-3 z-[300] flex justify-center px-3 lg:pl-[calc(var(--admin-rail-offset)+12px)]">
      <div className="gt-glass gt-sheet-up pointer-events-auto flex w-full max-w-[980px] items-center gap-2 rounded-[var(--radius-lg)] p-2 pl-4">
        <p className="m-0 flex-none text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]" aria-live="polite">
          {t("promo.bulk.selected", { count })}
        </p>
        <div className="gt-scroller flex min-w-0 flex-1 items-center gap-1.5">
          <AdminButton size="sm" variant="outline" iconLeft={Play} onClick={onActivate} disabled={busy}>
            {t("promo.bulk.activate")}
          </AdminButton>
          <AdminButton size="sm" variant="outline" iconLeft={Pause} onClick={onPause} disabled={busy}>
            {t("promo.bulk.pause")}
          </AdminButton>
          <AdminButton size="sm" variant="ghost" iconLeft={Copy} onClick={onDuplicate} disabled={busy}>
            {t("promo.bulk.duplicate")}
          </AdminButton>
          <AdminButton size="sm" variant="ghost" iconLeft={FolderPlus} onClick={onAddToCampaign} disabled={busy}>
            {t("promo.bulk.addToCampaign")}
          </AdminButton>
          <AdminButton size="sm" variant="ghost" iconLeft={FolderMinus} onClick={onRemoveFromCampaign} disabled={busy}>
            {t("promo.bulk.removeFromCampaign")}
          </AdminButton>
          <span aria-hidden="true" className="mx-1 h-6 w-px flex-none bg-[var(--border-default)]" />
          <button
            type="button"
            onClick={onArchive}
            disabled={busy}
            className="inline-flex h-8 flex-none items-center gap-1.5 rounded-[var(--admin-radius-sm)] border border-[var(--gt-red-400)] px-3 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)] disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Archive size={14} aria-hidden="true" />
            {t("promo.bulk.archive")}
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label={t("promo.bulk.clear")}
          className="grid h-9 w-9 flex-none place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-white/70 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
