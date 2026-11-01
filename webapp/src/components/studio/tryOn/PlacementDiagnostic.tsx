import { useMemo } from "react";
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { gemOutline, pathToSvg } from "../../../lib/studio3d/frontView";
import type { TryOnAnalysis } from "../../../lib/studio3d/tryOn";
import type { Registration, RegisteredTooth } from "../../../lib/studio3d/tryOnRegistration";
import type { PreparedPhoto } from "./preparePhoto";

const TOOTH_STYLE: Record<RegisteredTooth["source"], { stroke: string; dash?: string }> = {
  found: { stroke: "var(--gt-emerald-400)" },
  outlier: { stroke: "var(--gt-red-400)", dash: "6 4" },
  fitted: { stroke: "var(--gt-amber-400)", dash: "3 3" },
};

/**
 * The staff's placement diagnostic (decision 111 (k)): the photo's mouth
 * close-up with each tooth the function found (solid), set aside (red,
 * dashed) or only expected by the fit (amber, dotted), and every gem where the
 * computed placement puts it, at its real size — with the confidence and what
 * lowered it. Nothing is generated: it shows whether the placement can be
 * computed reliably before any AI render uses it. Styles are paired with a
 * line pattern and a written legend, never colour alone. Marked
 * `ph-no-capture`: analytics never records the face.
 */
export function PlacementDiagnostic({
  photo,
  analysis,
  registration,
  onBack,
}: {
  photo: PreparedPhoto;
  analysis: TryOnAnalysis;
  registration: Registration;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { crop } = analysis;
  const unit = Math.max(1, Math.min(crop.width, crop.height) / 250);
  const gems = useMemo(
    () => registration.gems.map((g) => ({ ...g, d: pathToSvg(gemOutline(g.shape, { x: g.x, y: g.y, r: g.r, rotation: g.rotation, stretch: g.stretch })) })),
    [registration.gems],
  );
  const scale = registration.transform?.scale ?? null;
  const percent = Math.round(registration.confidence * 100);

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studio.tryOn.diagnostic.intro")}</p>

      <div className="ph-no-capture overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-ink-900)]">
        <svg
          viewBox={`0 0 ${crop.width} ${crop.height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={t("studio.tryOn.diagnostic.imageLabel", { teeth: registration.teeth.length, gems: gems.length })}
        >
          {/* The photo, drawn at the size the function cut the crop from and shifted so the crop fills the frame. */}
          <image
            href={photo.url}
            x={-crop.x}
            y={-crop.y}
            width={crop.photoWidth}
            height={crop.photoHeight}
            preserveAspectRatio="none"
          />
          {registration.teeth.map((tooth) => {
            const style = TOOTH_STYLE[tooth.source];
            return (
              <g key={`${tooth.fdi}-${tooth.source}`}>
                <rect
                  x={tooth.x}
                  y={tooth.y}
                  width={tooth.width}
                  height={tooth.height}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.5 * unit}
                  strokeDasharray={style.dash ? style.dash.split(" ").map((n) => Number(n) * unit).join(" ") : undefined}
                />
                <text
                  x={tooth.x + tooth.width / 2}
                  y={tooth.lower ? tooth.y + tooth.height + 11 * unit : tooth.y - 4 * unit}
                  textAnchor="middle"
                  fontSize={10 * unit}
                  fontWeight={700}
                  fill={style.stroke}
                  stroke="var(--gt-ink-900)"
                  strokeWidth={2.5 * unit}
                  paintOrder="stroke"
                >
                  {tooth.fdi}
                </text>
              </g>
            );
          })}
          {gems.map((g) => (
            <g key={g.id}>
              <path d={g.d} fill="var(--gt-fuchsia-400)" fillOpacity={0.55} stroke="white" strokeWidth={1 * unit} />
              <text
                x={g.x + g.r + 3 * unit}
                y={g.y - g.r}
                fontSize={9 * unit}
                fontWeight={700}
                fill="white"
                stroke="var(--gt-ink-900)"
                strokeWidth={2.5 * unit}
                paintOrder="stroke"
              >
                {g.number}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-[var(--text-muted)]">
        {(["found", "outlier", "fitted"] as const).map((source) => (
          <li key={source} className="inline-flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" stroke={TOOTH_STYLE[source].stroke} strokeWidth="2" strokeDasharray={TOOTH_STYLE[source].dash} />
            </svg>
            {t(`studio.tryOn.diagnostic.legend.${source}`)}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border border-white bg-[var(--gt-fuchsia-400)]" />
          {t("studio.tryOn.diagnostic.legend.gem")}
        </li>
      </ul>

      <div
        role="status"
        className={`flex items-start gap-2 rounded-[var(--radius-md)] p-3 text-[length:var(--text-body-sm)] ${
          registration.reliable ? "bg-[var(--status-success-bg)]" : "bg-[var(--status-warning-bg)]"
        }`}
      >
        {registration.reliable ? (
          <CircleCheck size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
        ) : (
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-warning-fg)]" />
        )}
        <span className="grid gap-1">
          <strong className="font-semibold">
            {t(registration.reliable ? "studio.tryOn.diagnostic.reliable" : "studio.tryOn.diagnostic.unreliable", { percent })}
          </strong>
          {registration.issues.length > 0 && (
            <ul className="m-0 grid list-disc gap-0.5 pl-5">
              {registration.issues.map((issue) => (
                <li key={issue}>{t(`studio.tryOn.diagnostic.issues.${issue}`)}</li>
              ))}
            </ul>
          )}
        </span>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
        <Figure label={t("studio.tryOn.diagnostic.figures.teeth")} value={String(analysis.teeth.length)} />
        <Figure label={t("studio.tryOn.diagnostic.figures.gems")} value={t("studio.tryOn.diagnostic.figures.gemsValue", { placed: gems.length, skipped: registration.skipped })} />
        <Figure label={t("studio.tryOn.diagnostic.figures.scale")} value={scale === null ? "—" : t("studio.tryOn.diagnostic.figures.scaleValue", { value: scale.toFixed(1) })} />
        <Figure
          label={t("studio.tryOn.diagnostic.figures.spread")}
          value={registration.rms === null ? "—" : t("studio.tryOn.diagnostic.figures.spreadValue", { value: Math.round(registration.rms * 100) })}
        />
      </dl>

      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
        <Button variant="outline" size="sm" iconLeft={ArrowLeft} onClick={onBack}>
          {t("studio.tryOn.diagnostic.back")}
        </Button>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
