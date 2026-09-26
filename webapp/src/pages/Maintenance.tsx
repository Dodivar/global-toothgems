import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { House, RotateCw, Wrench } from "lucide-react";
import { Button } from "../components/ui/Button";
import { SystemPage } from "../components/system/SystemPage";
import { SettingInProgressVisual } from "../components/system/SystemVisuals";
import { useRouterLink } from "../components/system/useRouterLink";
import logoBlack from "../assets/logo-wordmark-black.png";

/** How long the mock refresh "checks" before reporting back. */
const REFRESH_MS = 1200;

/**
 * Maintenance — planned, not broken.
 *
 * While the site is down for work, its navigation leads nowhere, so this page
 * wears its own quiet chrome (wordmark and a copyright line) instead of the
 * storefront header and footer; `App` leaves those out on this route.
 *
 * There is no countdown: the product has no maintenance schedule to read one
 * from, and an invented time is a promise nobody can keep. The progress bar is
 * indeterminate for the same reason.
 *
 * Prototype behaviour: "Refresh page" shows its loading state, then the time
 * of the check. In production it would simply reload.
 */
export function Maintenance() {
  const { t, i18n } = useTranslation();
  const link = useRouterLink();
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const refresh = () => {
    setRefreshing(true);
    timer.current = window.setTimeout(() => {
      setRefreshing(false);
      setCheckedAt(new Date());
    }, REFRESH_MS);
  };

  const time = checkedAt?.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex min-h-[100svh] flex-col bg-[var(--surface-page)]">
      <div className="flex justify-center px-[var(--gutter-page)] pb-2 pt-6 sm:pt-8">
        <Link to="/" className="inline-flex rounded-[var(--radius-xs)] p-1">
          <img src={logoBlack} alt={t("errors.maintenance.logoAlt")} className="h-5 w-auto sm:h-6" />
        </Link>
      </div>

      <div className="flex-1">
        <SystemPage
          kind="maintenance"
          status={{ label: t("errors.maintenance.status"), icon: Wrench }}
          title={t("errors.maintenance.title")}
          body={t("errors.maintenance.body")}
          actions={
            <>
              <Button {...link("/")} variant="primary" size="lg" iconLeft={House}>
                {t("errors.actions.home")}
              </Button>
              <Button variant="outline" size="lg" iconLeft={RotateCw} loading={refreshing} onClick={refresh}>
                {refreshing ? t("errors.maintenance.refreshing") : t("errors.maintenance.refresh")}
              </Button>
            </>
          }
          after={
            <div className="gt-glass mt-2 grid gap-3 rounded-[var(--radius-card)] px-5 py-4 text-left">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="gt-sys-pulse h-2 w-2 flex-none rounded-full bg-[var(--gt-emerald-500)]" />
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {t("errors.maintenance.statusTitle")}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t("errors.maintenance.progressLabel")}
                className="relative h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)]"
              >
                <span className="gt-sys-progress absolute inset-y-0 left-0 w-[38%] rounded-[var(--radius-pill)] bg-[var(--gt-blue-400)]" />
              </div>
              {/* Opens on the reassurance, then becomes the result of each
                  check; the change is what the live region announces. */}
              <p role="status" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {time ? t("errors.maintenance.checked", { time }) : t("errors.maintenance.note")}
              </p>
            </div>
          }
          visual={<SettingInProgressVisual statusLabel={t("errors.maintenance.chip")} />}
        />
      </div>

      <p className="m-0 px-[var(--gutter-page)] py-5 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("errors.maintenance.copyright")}
      </p>
    </div>
  );
}
