import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import type { TryOnStage } from "../../../lib/studio3d/tryOn";
import { tryOnLine, tryOnProgress } from "../../../lib/studio3d/tryOnProgress";

const TICK_MS = 250;

/**
 * The wait between "Generate" and the result: the stage the function reports
 * (photo check, then render), an indicative bar paced on the usual durations
 * and a line saying what is being done (`tryOnProgress.ts`). Only the stage
 * title is announced to screen readers; the lines change too often for that.
 */
export function ProcessingStep({ stage, onCancel }: { stage: TryOnStage; onCancel: () => void }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  // One clock per stage (the dialog keys this step on it); the bar still only moves forward, each stage starting past the previous one's ceiling.
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const lines = t(`studio.tryOn.processing.${stage}.lines`, { returnObjects: true }) as string[];
  const line = Array.isArray(lines) ? lines[Math.min(tryOnLine(stage, elapsed), lines.length - 1)] : "";
  const progress = tryOnProgress(stage, elapsed);

  return (
    <div className="grid justify-items-center gap-3 py-6 text-center">
      <LoaderCircle size={28} aria-hidden="true" className="text-[var(--gt-blue-700)] motion-safe:animate-spin" />
      <p role="status" className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
        {t(`studio.tryOn.processing.${stage}.title`)}
      </p>
      <div aria-hidden="true" className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div
          className="h-full rounded-full bg-[var(--gt-blue-700)] motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p key={line} aria-hidden="true" className="m-0 min-h-[1.5em] max-w-sm text-[12.5px] font-semibold text-[var(--gt-blue-700)] motion-safe:animate-[gt-quiet-in_300ms_ease-out]">
        {line}
      </p>
      <p className="m-0 max-w-sm text-[12.5px] text-[var(--text-muted)]">{t(`studio.tryOn.processing.${stage}.body`)}</p>
      <Button variant="outline" size="sm" onClick={onCancel}>
        {t("studio.tryOn.processing.cancel")}
      </Button>
    </div>
  );
}
