import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, CircleAlert } from "lucide-react";
import clsx from "clsx";
import { DashboardTile } from "./DashboardTile";
import { Link } from "../../../lib/navigation";
import { useFormat } from "../../../lib/format";
import { useStudioAccess } from "../../../lib/studioAccess";
import { atLimit, type StudioAccessInfo } from "../../../lib/studioAccessState";
import { showsStudioCard } from "../../../lib/memberDashboard";
import { STUDIO_EDITOR_PATH } from "../../../lib/studioUrl";

/**
 * The 3D Studio, for a member who uses it: the plan (or the trial, or staff
 * access), the saved creations against the plan's allowance, the next
 * renewal or the end date — and a failed payment, first, in the dark dress.
 * Read from `studio_access_state()` through `StudioAccessProvider`, the same
 * figures `/compte/studio` shows and the database enforces. Never shown to
 * an account that does not use the Studio (`showsStudioCard`).
 */
export function StudioTile() {
  const access = useStudioAccess();
  const status = access?.status;
  if (status?.kind !== "ready" || !showsStudioCard(status.info.state)) return null;
  return <StudioTileCard info={status.info} />;
}

function StudioTileCard({ info }: { info: StudioAccessInfo }) {
  const { t } = useTranslation();
  const { formatDate, formatCount } = useFormat();
  const titleId = useId();
  const date = (ms: number | null) => (ms === null ? "" : formatDate(new Date(ms).toISOString()));

  const subscribed = info.state === "subscribed";
  const pastDue = subscribed && info.subscriptionStatus === "past_due";
  const ink = pastDue;
  const plan = info.tier ? t(`studio.plans.items.${info.tier}.name`) : null;

  const title =
    info.state === "trial_active"
      ? t("account.dashboard.studioTrial")
      : info.state === "staff"
        ? t("studio.account.state.staff")
        : info.state === "subscription_pending"
          ? t("studio.account.state.subscription_pending")
          : t("account.dashboard.studioPlan", { plan });

  let note: string | null = null;
  if (pastDue) note = t("studio.account.pastDue");
  else if (subscribed && info.subscriptionCancelAtPeriodEnd) note = t("account.dashboard.studioEnds", { date: date(info.subscriptionPeriodEnd) });
  else if (subscribed) note = t("account.dashboard.studioRenews", { date: date(info.subscriptionPeriodEnd) });
  else if (info.state === "trial_active") note = t("account.dashboard.studioTrialUntil", { date: date(info.trialExpiresAt) });

  const used = info.usage.creations;
  const limit = info.limits.creations;
  const full = atLimit(info, "creations");
  const showUsage = info.state !== "subscription_pending" && info.tier !== null;

  const linkClass = (primary: boolean) =>
    clsx(
      "inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold",
      primary
        ? ink
          ? "text-[var(--accent-cta)]"
          : "text-[var(--text-primary)]"
        : clsx("underline decoration-1 underline-offset-4", ink ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"),
    );

  return (
    <DashboardTile
      icon={Box}
      eyebrow={t("studio.account.eyebrow")}
      tone={ink ? "ink" : "paper"}
      labelledBy={titleId}
      footer={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {pastDue ? (
            <Link to="/compte/studio" className={linkClass(true)}>
              {t("account.dashboard.studioFixPayment")}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            info.state !== "subscription_pending" && (
              <Link to={STUDIO_EDITOR_PATH} className={linkClass(true)}>
                {t("studio.account.openStudio")}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            )
          )}
          {info.state !== "staff" && (
            <Link to="/compte/studio" className={linkClass(false)}>
              {t("account.dashboard.studioManage")}
            </Link>
          )}
        </div>
      }
    >
      <h3
        id={titleId}
        className={clsx("m-0 flex items-center gap-2 text-[length:var(--text-h4)]", ink ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}
      >
        {pastDue && <CircleAlert size={18} aria-hidden="true" className="flex-none text-[var(--accent-highlight)]" />}
        {title}
      </h3>
      {showUsage && (
        <div className="grid gap-1.5">
          <div className={clsx("flex flex-wrap items-baseline justify-between gap-2 text-[length:var(--text-body-sm)]", ink ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]")}>
            <span>{t("studio.account.usage.creations")}</span>
            <span className={clsx("tabular-nums", full && "font-semibold")}>
              {limit === null
                ? t("studio.account.usage.unlimited", { used: formatCount(used) })
                : t("studio.account.usage.of", { used: formatCount(used), limit: formatCount(limit) })}
            </span>
          </div>
          {limit !== null && (
            <div
              role="meter"
              aria-label={t("studio.account.usage.creations")}
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
              className={clsx("h-1.5 overflow-hidden rounded-[var(--radius-pill)]", ink ? "bg-white/15" : "bg-[var(--gt-blue-100)]")}
            >
              <div
                className={clsx("h-full rounded-[var(--radius-pill)]", full ? "bg-[var(--status-warning-fg)]" : "bg-[var(--gt-blue-700)]")}
                style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }}
              />
            </div>
          )}
          {full && (
            <p className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-warning-fg)]">
              {t("account.dashboard.studioFull")}
            </p>
          )}
        </div>
      )}
      {note && (
        <p className={clsx("m-0 text-[length:var(--text-body-sm)]", ink ? "text-[var(--gt-off-white)]" : "text-[var(--text-muted)]")}>{note}</p>
      )}
    </DashboardTile>
  );
}
