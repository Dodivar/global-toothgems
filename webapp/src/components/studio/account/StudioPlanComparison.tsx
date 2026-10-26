"use client";

import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";
import type { StudioPaidPlanId } from "../../../data/studio";

const PLANS: StudioPaidPlanId[] = ["essential", "artist", "atelier"];

/** A row: included or not per plan, or a word per plan (`values.<key>`). */
type Cell = boolean | string;

/**
 * What separates the plans, side by side. Only what the database actually
 * gates by plan (`private.studio_user_tier()`, decision 101: the watermark, the
 * member's own logo, the post layouts) differs; every other row is the whole
 * Studio, open to every plan (decision 94).
 */
const ROWS: { key: string; cells: Record<StudioPaidPlanId, Cell> }[] = [
  { key: "studio", cells: { essential: true, artist: true, atelier: true } },
  { key: "glowbook", cells: { essential: true, artist: true, atelier: true } },
  { key: "posts", cells: { essential: true, artist: true, atelier: true } },
  { key: "signature", cells: { essential: "watermark", artist: "ownLogo", atelier: "ownLogo" } },
  { key: "layouts", cells: { essential: false, artist: false, atelier: true } },
];

export function StudioPlanComparison({ current }: { current: StudioPaidPlanId | null }) {
  const { t } = useTranslation();
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
