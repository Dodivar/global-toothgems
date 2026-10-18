import { useTranslation } from "react-i18next";
import { Box } from "lucide-react";
import { EmptyState } from "../EmptyState";
import { StatList } from "./StatList";
import { StatsPanel } from "./StatsPanel";
import { RowsSkeleton } from "./StatsStates";
import { useFormat } from "../../../lib/format";
import { formatPercent } from "../../../lib/adminAnalytics";
import type { Period } from "../../../lib/adminAnalyticsMapping";
import { CONVERSION_WINDOW_DAYS, useStudioTrialFigures } from "../../../lib/adminStudioTrials";

/**
 * The 3D Studio free trial on the Statistics page: the trials started in the
 * period (one per account) and what became of them, read from the database.
 * Funnel steps the database cannot see (offer views, sessions, return visits,
 * plan clicks) are in PostHog; the panel says so instead of guessing them.
 * Shop filters do not apply: a trial is not an order.
 */
export function StudioTrialPanel({ period, reloadKey }: { period: Period | null; reloadKey: unknown }) {
  const { t } = useTranslation();
  const { formatCount, formatDate } = useFormat();
  const state = useStudioTrialFigures(period, reloadKey);
  const k = "admin.stats.studioTrial";
  const rate = (value: number | null) => (value === null ? "—" : formatPercent(value * 100));

  return (
    <StatsPanel title={t(`${k}.title`)} description={t(`${k}.description`, { days: CONVERSION_WINDOW_DAYS })} icon={Box}>
      {state.kind === "loading" ? (
        <RowsSkeleton rows={3} label={t("admin.stats.loading")} />
      ) : state.kind === "unavailable" ? (
        <EmptyState icon={Box} title={t(`${k}.unavailableTitle`)} body={t(`${k}.unavailableBody`)} />
      ) : state.kind === "error" ? (
        <EmptyState icon={Box} title={t(`${k}.errorTitle`)} body={t(`${k}.errorBody`)} />
      ) : state.figures.started === 0 && state.figures.activeNow === 0 ? (
        <EmptyState icon={Box} title={t(`${k}.emptyTitle`)} body={t(`${k}.emptyBody`)} />
      ) : (
        <div className="grid gap-5">
          <StatList
            columns={3}
            items={[
              { id: "started", label: t(`${k}.started`), value: formatCount(state.figures.started) },
              { id: "active", label: t(`${k}.activeNow`), value: formatCount(state.figures.activeNow), hint: t(`${k}.activeNowHint`) },
              { id: "ended", label: t(`${k}.ended`), value: formatCount(state.figures.ended), hint: t(`${k}.endedHint`, { count: state.figures.endedUnconverted }) },
              { id: "saved", label: t(`${k}.firstSaveRate`), value: rate(state.figures.firstSaveRate) },
              {
                id: "time",
                label: t(`${k}.timeToFirstSave`),
                value: state.figures.medianHoursToFirstSave === null ? "—" : t(`${k}.hours`, { count: Math.round(state.figures.medianHoursToFirstSave * 10) / 10 }),
              },
              { id: "converted", label: t(`${k}.conversionRate`), value: rate(state.figures.conversionRate), hint: t(`${k}.convertedHint`, { count: state.figures.converted }) },
            ]}
          />
          {state.figures.weeks.length > 1 && (
            <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-4">
              <h3 className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t(`${k}.weeksTitle`)}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-[length:var(--text-body-sm)] tabular-nums">
                  <caption className="sr-only">{t(`${k}.weeksTitle`)}</caption>
                  <thead>
                    <tr className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      <th scope="col" className="py-1.5 pr-3 font-semibold">{t(`${k}.week`)}</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-semibold">{t(`${k}.started`)}</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-semibold">{t(`${k}.savedShort`)}</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">{t(`${k}.convertedShort`)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.figures.weeks.map((row) => (
                      <tr key={row.week} className="border-t border-[var(--border-subtle)]">
                        <th scope="row" className="py-1.5 pr-3 font-medium">{formatDate(`${row.week}T12:00:00Z`)}</th>
                        <td className="py-1.5 pr-3 text-right">{formatCount(row.started)}</td>
                        <td className="py-1.5 pr-3 text-right">{formatCount(row.saved)}</td>
                        <td className="py-1.5 text-right">{formatCount(row.converted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-3 py-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t(`${k}.posthogNote`)}
          </p>
        </div>
      )}
    </StatsPanel>
  );
}
