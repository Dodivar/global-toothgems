"use client";

import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Clock, Sparkles } from "lucide-react";
import { Link } from "../../../lib/navigation";
import { ACCOUNT_STUDIO_PATH } from "../StudioPlans";
import { useStudioAccess } from "../../../lib/studioAccess";
import {
  countdownTickMs,
  isTrialWarning,
  remainingParts,
  serverTimeNow,
  trialRemainingMs,
  type StudioAccessInfo,
} from "../../../lib/studioAccessState";

/** "1 day, 4 hours" / "36 hours"… in the reader's language. */
function formatRemaining(t: TFunction, ms: number): string {
  const parts = remainingParts(ms);
  const k = "studio.access.countdown";
  switch (parts.unit) {
    case "daysHours":
      return parts.hours
        ? `${t(`${k}.days`, { count: parts.days })}, ${t(`${k}.hours`, { count: parts.hours })}`
        : t(`${k}.days`, { count: parts.days });
    case "hours":
      return t(`${k}.hours`, { count: parts.hours });
    case "hoursMinutes":
      return parts.minutes
        ? `${t(`${k}.hours`, { count: parts.hours })}, ${t(`${k}.minutes`, { count: parts.minutes })}`
        : t(`${k}.hours`, { count: parts.hours });
    case "minutes":
      return t(`${k}.minutes`, { count: parts.minutes });
    case "lessThanMinute":
      return t(`${k}.lessThanMinute`);
  }
}

/**
 * Time left in the trial, counted on the database's clock and refreshed at the
 * precision it is shown with. Display only: the database decides access.
 */
function useTrialRemaining(info: StudioAccessInfo | null, readAtPerf: number): number | null {
  const [now, setNow] = useState(() => performance.now());
  const left = info ? trialRemainingMs(info, serverTimeNow(info, readAtPerf, now)) : null;
  useEffect(() => {
    if (left === null || left <= 0) return;
    const timer = window.setTimeout(() => setNow(performance.now()), countdownTickMs(left));
    return () => window.clearTimeout(timer);
  }, [left]);
  // Coming back to a suspended tab: recount at once.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setNow(performance.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return left;
}

function useTrialInfo() {
  const access = useStudioAccess();
  const status = access?.status;
  const ready = status?.kind === "ready" && status.info.state === "trial_active" ? status : null;
  return { access, info: ready?.info ?? null, readAtPerf: ready?.readAtPerf ?? 0 };
}

/**
 * The editor bar's access badge: the time left during the trial (neutral,
 * then a restrained warning in the last hours), the preview badge when the
 * Studio runs without accounts, nothing for subscribers and staff.
 */
export function StudioAccessBadge() {
  const { t } = useTranslation();
  const { access, info, readAtPerf } = useTrialInfo();
  const left = useTrialRemaining(info, readAtPerf);

  if (access?.status.kind === "preview") {
    return (
      <span
        title={t("studio.access.previewHint")}
        className="hidden items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--status-success-fg)] lg:inline-flex"
      >
        <Sparkles size={11} aria-hidden="true" />
        {t("studio.access.previewBadge")}
      </span>
    );
  }
  if (!info || left === null) return null;

  const warning = isTrialWarning(left);
  const time = left > 0 ? t("studio.access.countdown.left", { time: formatRemaining(t, left) }) : t("studio.access.countdown.ended");
  return (
    <Link
      to={ACCOUNT_STUDIO_PATH}
      className={clsx(
        "inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] font-semibold no-underline",
        warning
          ? "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
          : "border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]",
      )}
    >
      <Clock size={12} aria-hidden="true" />
      <span className="max-sm:sr-only">{t("studio.access.countdown.label")} · </span>
      {time}
    </Link>
  );
}
