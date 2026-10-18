import { useTranslation } from "react-i18next";
import { CircleCheck, Hourglass, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { EmptyState } from "../EmptyState";
import { StatList } from "./StatList";
import { StatsPanel } from "./StatsPanel";
import { RowsSkeleton } from "./StatsStates";
import { axisScale, useMeasure } from "./chart";
import { useFormat } from "../../../lib/format";
import type { Period } from "../../../lib/adminAnalyticsMapping";
import { useStudioRevenueFigures, type StudioRevenueWeek } from "../../../lib/adminStudioRevenue";

/**
 * The 3D Studio's subscription money on the Statistics page (decision 95):
 * what came in during the period, split into money settled, money still inside
 * its 14-day withdrawal period (it may partly come back) and money refunded by
 * withdrawals — as figures and as stacked bars per week. Read from the
 * database (`useStudioRevenueFigures`); shop filters do not apply.
 */

interface Series {
  id: keyof Omit<StudioRevenueWeek, "week">;
  color: string;
  icon: LucideIcon;
}

const SERIES: Series[] = [
  { id: "settled", color: "var(--gt-emerald-600)", icon: CircleCheck },
  { id: "withdrawable", color: "var(--gt-amber-600)", icon: Hourglass },
  { id: "refunded", color: "var(--gt-red-600)", icon: Undo2 },
];

export function StudioRevenuePanel({ period, reloadKey }: { period: Period | null; reloadKey: unknown }) {
  const { t } = useTranslation();
  const { formatMoney, formatDate } = useFormat();
  const state = useStudioRevenueFigures(period, reloadKey);
  const k = "admin.stats.studioRevenue";

  return (
    <StatsPanel title={t(`${k}.title`)} description={t(`${k}.description`)} icon={Wallet}>
      {state.kind === "loading" ? (
        <RowsSkeleton rows={3} label={t("admin.stats.loading")} />
      ) : state.kind === "unavailable" ? (
        <EmptyState icon={Wallet} title={t(`${k}.unavailableTitle`)} body={t(`${k}.unavailableBody`)} />
      ) : state.kind === "error" ? (
        <EmptyState icon={Wallet} title={t(`${k}.errorTitle`)} body={t(`${k}.errorBody`)} />
      ) : !state.figures.currency || (state.figures.received === 0 && state.figures.withdrawableNow === 0) ? (
        <EmptyState icon={Wallet} title={t(`${k}.emptyTitle`)} body={t(`${k}.emptyBody`)} />
      ) : (
        (() => {
          const f = state.figures;
          const money = (minor: number) => formatMoney(minor, f.currency!);
          return (
            <div className="grid gap-5">
              <StatList
                columns={2}
                items={[
                  { id: "received", label: t(`${k}.received`), value: money(f.received) },
                  { id: "settled", label: t(`${k}.settled`), value: money(f.settled), hint: t(`${k}.settledHint`) },
                  { id: "withdrawable", label: t(`${k}.withdrawable`), value: money(f.withdrawable), hint: t(`${k}.withdrawableHint`) },
                  { id: "refunded", label: t(`${k}.refunded`), value: money(f.refunded), hint: t(`${k}.refundedHint`) },
                ]}
              />
              {f.withdrawableNow > 0 && (
                <p className="m-0 inline-flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-3 py-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                  <Hourglass size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-amber-600)]" />
                  {t(`${k}.now`, { amount: money(f.withdrawableNow), date: f.nextSettlement ? formatDate(new Date(Date.parse(f.nextSettlement) - 1).toISOString()) : "—" })}
                </p>
              )}
              {f.weeks.length > 0 && <WeeklyBars weeks={f.weeks} money={money} />}
              {f.skipped > 0 && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`${k}.skipped`, { count: f.skipped })}</p>}
            </div>
          );
        })()
      )}
    </StatsPanel>
  );
}

/** Stacked bars per week; the legend names each series with an icon, the table gives the figures. */
function WeeklyBars({ weeks, money }: { weeks: StudioRevenueWeek[]; money: (minor: number) => string }) {
  const { t } = useTranslation();
  const { formatDateShort } = useFormat();
  const { ref, width } = useMeasure<HTMLDivElement>();
  const k = "admin.stats.studioRevenue";

  const totals = weeks.map((w) => w.settled + w.withdrawable + w.refunded);
  const { max, ticks } = axisScale(Math.max(...totals, 1), 3);
  const w = width || 520;
  const height = 168;
  const pad = { top: 8, right: 8, bottom: 22, left: 8 };
  const innerH = height - pad.top - pad.bottom;
  const slot = (w - pad.left - pad.right) / weeks.length;
  const barW = Math.max(6, Math.min(40, slot * 0.6));
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const label = (week: string) => formatDateShort(`${week}T12:00:00Z`);

  return (
    <figure className="m-0 grid gap-3 border-t border-[var(--border-subtle)] pt-4">
      <figcaption className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t(`${k}.weeksTitle`)}</figcaption>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
        {SERIES.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-body)]">
            <s.icon size={13} aria-hidden="true" style={{ color: s.color }} />
            {t(`${k}.${s.id}`)}
          </li>
        ))}
      </ul>
      <div ref={ref}>
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={t(`${k}.chartLabel`)} className="block">
          {ticks.map((tick) => (
            <line key={tick} x1={pad.left} x2={w - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--border-subtle)" strokeWidth={1} />
          ))}
          {weeks.map((week, i) => {
            const x = pad.left + slot * i + (slot - barW) / 2;
            let base = 0;
            return (
              <g key={week.week}>
                {SERIES.map((s) => {
                  const value = week[s.id];
                  if (value <= 0) return null;
                  const top = y(base + value);
                  const rect = (
                    <rect key={s.id} x={x} y={top} width={barW} height={Math.max(1, y(base) - top - 1)} rx={2} fill={s.color}>
                      <title>{`${label(week.week)} · ${t(`${k}.${s.id}`)} : ${money(value)}`}</title>
                    </rect>
                  );
                  base += value;
                  return rect;
                })}
                {(weeks.length <= 8 || i % Math.ceil(weeks.length / 8) === 0) && (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                    {label(week.week)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-left text-[length:var(--text-body-sm)] tabular-nums">
          <caption className="sr-only">{t(`${k}.weeksTitle`)}</caption>
          <thead>
            <tr className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <th scope="col" className="py-1.5 pr-3 font-semibold">{t(`${k}.week`)}</th>
              {SERIES.map((s) => (
                <th key={s.id} scope="col" className="py-1.5 pr-3 text-right font-semibold last:pr-0">
                  {t(`${k}.${s.id}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.week} className="border-t border-[var(--border-subtle)]">
                <th scope="row" className="py-1.5 pr-3 font-medium">{label(week.week)}</th>
                {SERIES.map((s) => (
                  <td key={s.id} className="py-1.5 pr-3 text-right last:pr-0">{money(week[s.id])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
