"use client";

import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";
import { useFormat } from "../../../lib/format";
import { STUDIO_PLAN_FEATURES, type StudioPaidPlanId, type StudioPlanFeatures } from "../../../data/studio";

const PLANS: StudioPaidPlanId[] = ["essential", "artist", "atelier"];

/** A row: included or not per plan, a number, or a word per plan (`values.<key>`). */
type Cell = boolean | number | string;

const limit = (n: number | null): Cell => n ?? "unlimited";
const perPlan = (cell: (f: StudioPlanFeatures) => Cell) =>
  Object.fromEntries(PLANS.map((plan) => [plan, cell(STUDIO_PLAN_FEATURES[plan])])) as Record<StudioPaidPlanId, Cell>;

/**
 * What separates the plans, side by side, from `STUDIO_PLAN_FEATURES`
 * (decision 113) — the rows that differ are the ones the database gates by
 * plan (saved creations and Gem Groups, Glowbook, smile try-on, post
 * signature and layouts); the others are open to every plan.
 */
const ROWS: { key: string; cells: Record<StudioPaidPlanId, Cell> }[] = [
  { key: "creations", cells: perPlan((f) => limit(f.creations)) },
  { key: "gemGroups", cells: perPlan((f) => limit(f.gemGroups)) },
  { key: "studio", cells: perPlan(() => true) },
  { key: "tools", cells: perPlan(() => true) },
  { key: "templates", cells: perPlan(() => true) },
  { key: "posts", cells: perPlan(() => true) },
  { key: "signature", cells: perPlan((f) => f.postSignature) },
  { key: "layouts", cells: perPlan((f) => f.postLayouts) },
  { key: "glowbook", cells: perPlan((f) => f.glowbook) },
  { key: "tryOn", cells: perPlan((f) => f.tryOn) },
];

export function StudioPlanComparison({ current }: { current: StudioPaidPlanId | null }) {
  const { t } = useTranslation();
  const { formatCount } = useFormat();
  const k = "studio.account.compare";

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <table className="w-full min-w-[520px] border-collapse text-left text-[length:var(--text-body-sm)]">
        <caption className="sr-only">{t(`${k}.caption`)}</caption>
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th scope="col" className="px-4 py-3 font-semibold text-[var(--text-muted)]">
              {t(`${k}.feature`)}
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan}
                scope="col"
                className={`px-4 py-3 text-center font-bold text-[var(--text-primary)] ${plan === current ? "bg-[var(--gt-blue-50)]" : ""}`}
              >
                {t(`studio.plans.items.${plan}.name`)}
                {plan === current && <span className="block text-[11px] font-semibold text-[var(--gt-blue-700)]">{t("studioPage.plans.current")}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-[var(--border-subtle)] last:border-b-0">
              <th scope="row" className="px-4 py-3 font-medium text-[var(--text-body)]">
                {t(`${k}.rows.${row.key}`)}
              </th>
              {PLANS.map((plan) => {
                const cell = row.cells[plan];
                return (
                  <td key={plan} className={`px-4 py-3 text-center ${plan === current ? "bg-[var(--gt-blue-50)]" : ""}`}>
                    {cell === true ? (
                      <>
                        <Check size={18} aria-hidden="true" className="mx-auto text-[var(--status-success-fg)]" />
                        <span className="sr-only">{t(`${k}.included`)}</span>
                      </>
                    ) : cell === false ? (
                      <>
                        <Minus size={18} aria-hidden="true" className="mx-auto text-[var(--text-muted)]" />
                        <span className="sr-only">{t(`${k}.notIncluded`)}</span>
                      </>
                    ) : typeof cell === "number" ? (
                      <span className="font-semibold text-[var(--text-primary)]">{formatCount(cell)}</span>
                    ) : (
                      <span className="text-[var(--text-primary)]">{t(`${k}.values.${cell}`)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
