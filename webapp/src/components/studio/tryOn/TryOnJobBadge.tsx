import { CircleAlert, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TryOnJob } from "./TryOnJobProvider";

/**
 * The pill shown while no try-on dialog is open and a run exists: under way,
 * ready, failed or interrupted. A click opens the dialog on it again; a
 * finished, failed or interrupted one can be put away (a result stays on the
 * device). Announced politely, so a screen reader hears "ready" wherever the
 * member went meanwhile.
 */
export function TryOnJobBadge({ job, onOpen, onDismiss }: { job: TryOnJob; onOpen: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { kind } = job.status;
  const Icon = kind === "running" ? LoaderCircle : kind === "result" ? Sparkles : kind === "error" ? CircleAlert : RotateCcw;
  const label = t(`studio.tryOn.job.${kind}`, { name: job.creation.name });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[450] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-full items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] py-1 pl-1 pr-1 text-white shadow-[var(--shadow-lg)]"
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 text-left text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Icon size={16} aria-hidden="true" className={`flex-none ${kind === "running" ? "motion-safe:animate-spin" : ""} ${kind === "error" ? "text-[#ffb4a8]" : ""}`} />
          <span className="min-w-0 truncate">{label}</span>
          <span className="flex-none rounded-[var(--radius-pill)] bg-white/15 px-2 py-0.5 text-[12px]">
            {t(kind === "interrupted" ? "studio.tryOn.job.resume" : "studio.tryOn.job.open")}
          </span>
        </button>
        {kind !== "running" && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("studio.tryOn.job.dismiss")}
            className="inline-grid h-8 w-8 flex-none place-items-center rounded-full hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
