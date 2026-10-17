"use client";

import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Clock, Sparkles, X } from "lucide-react";
import { Link } from "../../../lib/navigation";
import { useStudioAccess } from "../../../lib/studioAccess";
import {
  countdownTickMs,
  isTrialWarning,
  remainingParts,
  serverTimeNow,
  trialRemainingMs,
  type StudioAccessInfo,
} from "../../../lib/studioAccessState";
import { trackStudioOnce } from "../../../lib/studioAnalytics";
import { STUDIO_PATH } from "../../../lib/studioUrl";

/** "1 day, 4 hours" / "36 hours"… in the reader's language. */
export function formatRemaining(t: TFunction, ms: number): string {
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
    <span
      className={clsx(
        "inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] font-semibold",
        warning
          ? "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
          : "border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]",
      )}
    >
      <Clock size={12} aria-hidden="true" />
      <span className="max-sm:sr-only">{t("studio.access.countdown.label")} · </span>
      {time}
    </span>
  );
}

/**
 * A small, dismissible reminder under the editor bar in the trial's last
 * hours, with a link to the plans. Shown once per trial and browser after
 * being dismissed; never a pop-up.
 */
export function StudioTrialReminder() {
  const { t } = useTranslation();
  const { info, readAtPerf } = useTrialInfo();
  const left = useTrialRemaining(info, readAtPerf);
  const key = info ? `gt-studio-trial-reminder:${info.trialExpiresAt}` : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const warning = isTrialWarning(left);

  const hiddenByChoice = (() => {
    if (!key) return true;
    if (dismissed === key) return true;
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  })();
  const visible = warning && !hiddenByChoice;

  useEffect(() => {
    if (visible && info) trackStudioOnce(`warning:${info.trialExpiresAt}`, "studio_trial_expiration_warning_shown", {}, "browser");
  }, [visible, info]);

  if (!visible || left === null) return null;

  const dismiss = () => {
    setDismissed(key);
    try {
      if (key) window.localStorage.setItem(key, "1");
    } catch {
      /* storage blocked: dismissed for this page only */
    }
  };

  return (
    <div
      role="status"
      className="relative z-20 flex items-start gap-3 border-b border-[var(--border-subtle)] bg-[var(--status-warning-bg)] px-3 py-2 text-[12.5px] text-[var(--status-warning-fg)] sm:items-center sm:px-4"
    >
      <Clock size={15} aria-hidden="true" className="mt-0.5 flex-none sm:mt-0" />
      <p className="m-0 min-w-0 flex-1">
        {t("studio.access.warning.body", { time: formatRemaining(t, left) })}{" "}
        <Link to={`${STUDIO_PATH}#studio-b-formules`} className="font-semibold underline underline-offset-2">
          {t("studio.access.warning.plans")}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("studio.access.warning.dismiss")}
        className="grid h-7 w-7 flex-none place-items-center rounded-[var(--radius-sm)] hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
