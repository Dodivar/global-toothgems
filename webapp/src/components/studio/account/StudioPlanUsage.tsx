"use client";

import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";
import clsx from "clsx";
import { useFormat } from "../../../lib/format";
import { atLimit, type StudioAccessInfo, type StudioCounts } from "../../../lib/studioAccessState";
import { hasFeature, lowestPlanWith } from "../../../lib/studioEntitlements";

/**
 * What the member's plan includes and what they use of it (decision 113):
 * saved creations and Gem Groups against the plan's numbers, then the
 * Glowbook and the smile try-on. Read from `studio_access_state()` — the
 * database's own numbers, which it enforces on every save.
 */
export function StudioPlanUsage({ info }: { info: StudioAccessInfo }) {
  const { t } = useTranslation();
  const { formatCount } = useFormat();
  const k = "studio.account.usage";
  if (!info.tier) return null;

  const meter = (kind: keyof StudioCounts<number>) => {
    const used = info.usage[kind];
    const limit = info.limits[kind];
    const full = atLimit(info, kind);
    const label = t(`${k}.${kind}`);
    return (
      <div key={kind} className="grid gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[length:var(--text-body-sm)]">
          <span className="font-semibold text-[var(--text-primary)]">{label}</span>
          <span className={clsx("tabular-nums", full ? "font-semibold text-[var(--status-warning-fg)]" : "text-[var(--text-body)]")}>
            {limit === null
              ? t(`${k}.unlimited`, { used: formatCount(used) })
              : t(`${k}.of`, { used: formatCount(used), limit: formatCount(limit) })}
          </span>
        </div>
        {limit !== null && (
          <div
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(used, limit)}
            className="h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--gt-blue-50)]"
          >
            <div
              className={clsx("h-full rounded-[var(--radius-pill)]", full ? "bg-[var(--status-warning-fg)]" : "bg-[var(--gt-blue-700)]")}
              style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }}
            />
          </div>
        )}
        {full && <p className="m-0 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">{t(`${k}.full.${kind}`)}</p>}
      </div>
    );
  };

  const flag = (key: "glowbook" | "tryOn", on: boolean) => (
    <li key={key} className="flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
      {on ? (
        <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--status-success-fg)]" />
      ) : (
        <Minus size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
      )}
      <span>
        {t(`${k}.${key}`)} —{" "}
        {on ? t(`${k}.included`) : t(`${k}.withPlan`, { plan: t(`studio.plans.items.${lowestPlanWith(key)}.name`) })}
      </span>
    </li>
  );

  return (
    <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-5">
      <p className="m-0 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
        {t(`${k}.title`, { plan: t(`studio.plans.items.${info.tier}.name`) })}
      </p>
      {meter("creations")}
      {meter("gemGroups")}
      <ul className="m-0 grid list-none gap-2 p-0">
        {flag("glowbook", info.glowbook)}
        {flag("tryOn", hasFeature(info.tier, "tryOn"))}
      </ul>
    </div>
  );
}
