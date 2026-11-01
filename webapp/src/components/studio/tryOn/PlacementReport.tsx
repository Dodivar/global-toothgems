import { ArrowLeft, CircleAlert, CircleCheck, Columns2, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import type { DriftReport } from "../../../lib/studio3d/tryOnDrift";

/** How a render placed its gems (decision 111 (k)). */
export type PlacementMode = "ai" | "computed";

/** A finished render, as the dialog keeps it. */
export interface TryOnRenderResult {
  image: Blob;
  /** An object URL of `image`, owned (and revoked) by the dialog. */
  url: string;
  leftOut: number;
  mode: PlacementMode;
  /** Asked for the computed placement, but it was not reliable enough: the AI placed the gems. */
  fellBack?: boolean;
  /** The registration's confidence (0–1), when the computed placement was tried. */
  confidence?: number;
  /** The drift check of a computed render; null when it could not be measured. */
  drift?: DriftReport | null;
}

/**
 * Staff only, under a try-on result: how its gems were placed — by the AI
 * (current behaviour) or computed from the teeth on the photo — the drift
 * check of a computed render, and "Compare" to render the same photo the
 * other way. State is written out, never colour alone.
 */
export function PlacementReport({ result, onCompare }: { result: TryOnRenderResult; onCompare?: () => void }) {
  const { t } = useTranslation();
  const percent = result.confidence === undefined ? null : Math.round(result.confidence * 100);
  const drift = result.drift;
  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 text-[length:var(--text-body-sm)]">
      <p className="m-0 flex items-start gap-2">
        <Info size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
        <span className="grid gap-0.5">
          <strong className="font-semibold">{t(`studio.tryOn.computed.mode.${result.mode}`)}</strong>
          {result.fellBack && <span className="text-[var(--text-muted)]">{t("studio.tryOn.computed.fellBack", { percent })}</span>}
          {!result.fellBack && result.mode === "computed" && percent !== null && (
            <span className="text-[var(--text-muted)]">{t("studio.tryOn.computed.confidence", { percent })}</span>
          )}
        </span>
      </p>
      {result.mode === "computed" && !result.fellBack && (
        <p className="m-0 flex items-start gap-2" role="status">
          {drift?.ok ? (
            <CircleCheck size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
          ) : (
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-warning-fg)]" />
          )}
          <span className="grid gap-0.5">
            {drift ? (
              <>
                <span>{t("studio.tryOn.computed.drift.kept", { kept: drift.kept, checked: drift.checked })}</span>
                {drift.missing.length > 0 && <span>{t("studio.tryOn.computed.drift.missing", { count: drift.missing.length })}</span>}
                <span className="text-[var(--text-muted)]">
                  {t(drift.ok ? "studio.tryOn.computed.drift.clean" : "studio.tryOn.computed.drift.stray", { percent: Math.round(drift.stray * 1000) / 10 })}
                </span>
              </>
            ) : (
              <span>{t("studio.tryOn.computed.drift.unmeasured")}</span>
            )}
          </span>
        </p>
      )}
      {onCompare && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" iconLeft={Columns2} onClick={onCompare}>
            {t(`studio.tryOn.computed.compareWith.${result.mode === "ai" ? "computed" : "ai"}`)}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Staff only: the same photo rendered both ways, side by side (stacked on
 * phones), each labelled with how its gems were placed. Marked
 * `ph-no-capture`: analytics never records the face.
 */
export function PlacementCompare({ results, onBack }: { results: [TryOnRenderResult, TryOnRenderResult]; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4">
      <div className="ph-no-capture grid gap-3 sm:grid-cols-2">
        {results.map((r, i) => (
          <figure key={i} className="m-0 grid gap-2">
            <img src={r.url} alt={t("studio.tryOn.computed.compareAlt", { mode: t(`studio.tryOn.computed.mode.${r.mode}`) })} className="block h-auto w-full rounded-[var(--radius-md)]" />
            <figcaption>
              <PlacementReport result={r} />
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
        <Button variant="outline" size="sm" iconLeft={ArrowLeft} onClick={onBack}>
          {t("studio.tryOn.computed.backToPhoto")}
        </Button>
      </div>
    </div>
  );
}
