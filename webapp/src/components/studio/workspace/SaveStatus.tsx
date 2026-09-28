import clsx from "clsx";
import { Check, CircleAlert, CircleDashed, LoaderCircle } from "lucide-react";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { useWorkspaceFormat } from "./workspaceStyles";

/**
 * Where the design on the stage stands: Unsaved · Saving… · Saved just now ·
 * Save failed. Always visible beside the design's name and announced politely,
 * so nobody has to wonder whether their work is stored — without a modal.
 */
export function SaveStatus({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { saveState, savedAt } = useWorkspace();
  const { t, ago } = useWorkspaceFormat();

  const label =
    saveState === "saving"
      ? t("studio.workspace.status.saving")
      : saveState === "failed"
        ? t("studio.workspace.status.failed")
        : saveState === "saved"
          ? t("studio.workspace.status.saved", { when: savedAt ? ago(savedAt) : t("studio.workspace.justNow") })
          : saveState === "unsaved"
            ? t("studio.workspace.status.unsaved")
            : t("studio.workspace.status.empty");

  const Icon = saveState === "saving" ? LoaderCircle : saveState === "failed" ? CircleAlert : saveState === "saved" ? Check : CircleDashed;

  return (
    <span
      role="status"
      aria-live="polite"
      className={clsx(
        "inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-none",
        saveState === "failed"
          ? "text-[var(--status-error-fg)]"
          : saveState === "saved"
            ? "text-[var(--accent-cta-ink)]"
            : saveState === "unsaved"
              ? "text-[var(--gt-fuchsia-600)]"
              : "text-[var(--text-subtle)]",
        className,
      )}
    >
      <Icon size={12} aria-hidden="true" className={clsx("flex-none", saveState === "saving" && "motion-safe:animate-spin")} />
      <span className={clsx("truncate", compact && "sr-only")}>{label}</span>
    </span>
  );
}
